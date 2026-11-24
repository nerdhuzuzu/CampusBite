import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "../../config/database.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { AppError, catchAsync } from "../../middleware/errorHandler.js";
import { validate } from "../../middleware/validate.js";
import { generateOrderNumber } from "../../utils/helpers.js";
import { io } from "../../sockets/index.js";

const router = Router();

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

const createOrderSchema = z.object({
  outletId: z.string().min(1),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        quantity: z.coerce.number().int().min(1).max(25),
        notes: z.string().max(200).optional(),
      })
    )
    .min(1, "At least one item is required"),
  notes: z.string().max(500).optional(),
  paymentMethod: z
    .enum(["PAY_AT_COUNTER", "CASH", "UPI", "WALLET", "CARD"])
    .default("PAY_AT_COUNTER"),
  transactionRef: z.string().max(100).optional(),
  idempotencyKey: z.string().max(128).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum([
    "ACCEPTED",
    "PREPARING",
    "READY",
    "COMPLETED",
    "REJECTED",
    "CANCELLED",
  ]),
  note: z.string().max(300).optional(),
});

const createReviewSchema = z.object({
  menuItemId: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

// ── Student: Place Order (Transactional, Idempotent, Backend-Priced) ────────
router.post(
  "/orders",
  authenticate,
  requireRole("STUDENT"),
  validate({ body: createOrderSchema }),
  catchAsync(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof createOrderSchema>;
    const studentId = req.user!.id;

    // 1. Duplicate request protection via idempotency key
    if (body.idempotencyKey) {
      const existingOrder = await prisma.order.findUnique({
        where: { idempotencyKey: body.idempotencyKey },
        include: {
          items: true,
          outlet: { select: { id: true, name: true, slug: true } },
          statusHistory: { orderBy: { createdAt: "asc" } },
          payment: true,
        },
      });
      if (existingOrder) {
        res.status(200).json({
          success: true,
          message: "Existing order returned (idempotent request).",
          data: existingOrder,
        });
        return;
      }
    }

    // 2. Verify outlet is active and open
    const outlet = await prisma.outlet.findFirst({
      where: { id: body.outletId, isActive: true, deletedAt: null },
    });
    if (!outlet) {
      throw new AppError(404, "Outlet not found or inactive.");
    }
    if (!outlet.isOpen) {
      throw new AppError(400, `${outlet.name} is currently closed.`);
    }

    // 3. Fetch live menu items from DB to validate availability and prices
    const menuItemIds = body.items.map((i) => i.menuItemId);
    const dbItems = await prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        outletId: outlet.id,
        isActive: true,
        deletedAt: null,
      },
      include: { category: true },
    });

    const itemMap = new Map(dbItems.map((m) => [m.id, m]));

    let subtotal = 0;
    let maxPrepTime = outlet.avgPrepTime;

    const orderItemsPayload = body.items.map((reqItem) => {
      const dbItem = itemMap.get(reqItem.menuItemId);
      if (!dbItem) {
        throw new AppError(
          400,
          `Item ${reqItem.menuItemId} does not belong to ${outlet.name}.`
        );
      }
      if (!dbItem.isAvailable) {
        throw new AppError(
          400,
          `"${dbItem.name}" is currently unavailable and cannot be ordered.`
        );
      }

      const unitPrice = Number(dbItem.price);
      const lineSubtotal = Number((unitPrice * reqItem.quantity).toFixed(2));
      subtotal = Number((subtotal + lineSubtotal).toFixed(2));
      maxPrepTime = Math.max(maxPrepTime, dbItem.preparationTime);

      return {
        menuItemId: dbItem.id,
        name: dbItem.name,
        price: unitPrice,
        quantity: reqItem.quantity,
        subtotal: lineSubtotal,
        notes: reqItem.notes,
      };
    });

    const tax = 0;
    const total = Number((subtotal + tax).toFixed(2));
    const estimatedReady = new Date(Date.now() + maxPrepTime * 60 * 1000);
    const orderNumber = generateOrderNumber();

    // 4. Create order, items, status history, payment, and spending log in a DB transaction
    const createdOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNumber,
          studentId,
          outletId: outlet.id,
          status: "PLACED",
          subtotal,
          tax,
          total,
          notes: body.notes,
          idempotencyKey: body.idempotencyKey,
          estimatedReady,
          items: {
            create: orderItemsPayload,
          },
          statusHistory: {
            create: {
              status: "PLACED",
              note: "Order placed by student",
              changedBy: studentId,
            },
          },
          payment: {
            create: {
              method: body.paymentMethod,
              status: "PENDING",
              amount: total,
              transactionRef: body.transactionRef,
            },
          },
        },
        include: {
          items: true,
          outlet: { select: { id: true, name: true, slug: true } },
          statusHistory: { orderBy: { createdAt: "asc" } },
          payment: true,
        },
      });

      // Increment order counters on MenuItems
      for (const item of orderItemsPayload) {
        await tx.menuItem.update({
          where: { id: item.menuItemId },
          data: {
            totalOrders: { increment: item.quantity },
            popularityScore: { increment: item.quantity * 1.5 },
          },
        });
      }

      // Record student spending entry in WalletTransaction
      const studentProfile = await tx.studentProfile.findUnique({
        where: { userId: studentId },
      });
      if (studentProfile) {
        await tx.walletTransaction.create({
          data: {
            studentProfileId: studentProfile.id,
            type: "DEBIT",
            amount: total,
            description: `Order ${orderNumber} at ${outlet.name}`,
            referenceId: order.id,
            category: "FOOD",
          },
        });
      }

      return order;
    });

    // 5. Broadcast live order event to kitchen & admin after DB commit
    if (io) {
      const payload = {
        orderId: createdOrder.id,
        orderNumber: createdOrder.orderNumber,
        outletId: createdOrder.outletId,
        studentId: createdOrder.studentId,
        status: createdOrder.status,
        total: Number(createdOrder.total),
        items: createdOrder.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
        })),
        createdAt: createdOrder.createdAt.toISOString(),
      };
      io.to(`outlet:${outlet.id}`).emit("order:new", payload);
      io.to("admin").emit("order:new", payload);
    }

    res.status(201).json({
      success: true,
      message: "Order placed successfully!",
      data: createdOrder,
    });
  })
);

// ── Student: Get My Orders ──────────────────────────────────────────────────
router.get(
  "/orders/my",
  authenticate,
  requireRole("STUDENT"),
  catchAsync(async (req: Request, res: Response) => {
    const orders = await prisma.order.findMany({
      where: { studentId: req.user!.id },
      include: {
        items: true,
        outlet: { select: { id: true, name: true, slug: true, avgPrepTime: true } },
        statusHistory: { orderBy: { createdAt: "asc" } },
        payment: true,
        refund: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: orders });
  })
);

// ── Single Order Details (Strict Ownership / Outlet Isolation) ──────────────
router.get(
  "/orders/:id",
  authenticate,
  catchAsync(async (req: Request, res: Response) => {
    const order = await prisma.order.findUnique({
      where: { id: String(req.params.id) },
      include: {
        items: true,
        outlet: { select: { id: true, name: true, slug: true } },
        student: { select: { id: true, firstName: true, lastName: true, email: true } },
        statusHistory: { orderBy: { createdAt: "asc" } },
        payment: true,
        refund: true,
      },
    });

    if (!order) {
      throw new AppError(404, "Order not found.");
    }

    if (req.user!.role === "STUDENT" && order.studentId !== req.user!.id) {
      throw new AppError(403, "You can only view your own orders.");
    }

    if (req.user!.role === "MANAGER" && order.outletId !== req.user!.outletId) {
      throw new AppError(403, "You can only view orders for your assigned outlet.");
    }

    res.json({ success: true, data: order });
  })
);

// ── Student: Cancel Eligible Order & Release Stock Reservations ─────────────
router.post(
  "/orders/:id/cancel",
  authenticate,
  requireRole("STUDENT"),
  catchAsync(async (req: Request, res: Response) => {
    const reason = String(req.body?.reason ?? "Cancelled by student").slice(0, 300);

    const order = await prisma.order.findUnique({
      where: { id: String(req.params.id) },
      include: { stockReservations: true, outlet: true },
    });

    if (!order) {
      throw new AppError(404, "Order not found.");
    }
    if (order.studentId !== req.user!.id) {
      throw new AppError(403, "You can only cancel your own orders.");
    }
    if (!["PLACED", "ACCEPTED"].includes(order.status)) {
      throw new AppError(
        400,
        `Order cannot be cancelled once it is in ${order.status} status.`
      );
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      // Release any active stock reservations
      for (const resv of order.stockReservations) {
        if (!resv.isReleased && !resv.isConsumed) {
          await tx.ingredient.update({
            where: { id: resv.ingredientId },
            data: {
              reservedStock: { decrement: resv.quantity },
            },
          });
          await tx.stockReservation.update({
            where: { id: resv.id },
            data: { isReleased: true },
          });
          await tx.inventoryMovement.create({
            data: {
              ingredientId: resv.ingredientId,
              type: "RELEASE",
              quantity: resv.quantity,
              reason: `Order ${order.orderNumber} cancelled`,
              referenceId: order.id,
              performedBy: req.user!.id,
            },
          });
        }
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: "CANCELLED",
          cancelReason: reason,
          statusHistory: {
            create: {
              status: "CANCELLED",
              note: reason,
              changedBy: req.user!.id,
            },
          },
          refund: {
            create: {
              amount: order.total,
              reason,
              status: "COMPLETED",
            },
          },
        },
        include: {
          items: true,
          outlet: { select: { id: true, name: true, slug: true } },
          statusHistory: { orderBy: { createdAt: "asc" } },
          payment: true,
          refund: true,
        },
      });

      const studentProfile = await tx.studentProfile.findUnique({
        where: { userId: req.user!.id },
      });
      if (studentProfile) {
        await tx.walletTransaction.create({
          data: {
            studentProfileId: studentProfile.id,
            type: "REFUND",
            amount: order.total,
            description: `Refund for cancelled order ${order.orderNumber}`,
            referenceId: order.id,
            category: "REFUND",
          },
        });
      }

      return updated;
    });

    if (io) {
      const payload = {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        outletId: updatedOrder.outletId,
        studentId: updatedOrder.studentId,
        status: updatedOrder.status,
        previousStatus: order.status,
        updatedAt: updatedOrder.updatedAt.toISOString(),
      };
      io.to(`outlet:${updatedOrder.outletId}`).emit("order:statusUpdate", payload);
      io.to(`student:${updatedOrder.studentId}`).emit("order:statusUpdate", payload);
      io.to("admin").emit("order:statusUpdate", payload);
    }

    res.json({
      success: true,
      message: "Order cancelled and stock reservations released.",
      data: updatedOrder,
    });
  })
);

// ── Manager / Super Admin: List Kitchen Orders ──────────────────────────────
router.get(
  "/manager/orders",
  authenticate,
  requireRole("MANAGER", "SUPER_ADMIN"),
  catchAsync(async (req: Request, res: Response) => {
    const { status } = req.query;
    const where: Record<string, unknown> = {};

    if (req.user!.role === "MANAGER") {
      if (!req.user!.outletId) {
        throw new AppError(403, "No outlet assigned to this manager account.");
      }
      where.outletId = req.user!.outletId;
    } else if (req.query.outletId) {
      where.outletId = String(req.query.outletId);
    }

    if (status && status !== "ALL") {
      where.status = String(status);
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        items: true,
        student: { select: { id: true, firstName: true, lastName: true, email: true } },
        outlet: { select: { id: true, name: true, slug: true } },
        statusHistory: { orderBy: { createdAt: "asc" } },
        payment: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    res.json({ success: true, data: orders });
  })
);

// ── Manager: Transition Order Status + Recipe Stock Reservation/Consumption ─
router.patch(
  "/manager/orders/:id/status",
  authenticate,
  requireRole("MANAGER", "SUPER_ADMIN"),
  validate({ body: updateStatusSchema }),
  catchAsync(async (req: Request, res: Response) => {
    const { status: nextStatus, note } = req.body as z.infer<typeof updateStatusSchema>;

    const order = await prisma.order.findUnique({
      where: { id: String(req.params.id) },
      include: {
        items: {
          include: {
            menuItem: {
              include: {
                recipes: { include: { ingredient: true } },
              },
            },
          },
        },
        stockReservations: true,
      },
    });

    if (!order) {
      throw new AppError(404, "Order not found.");
    }

    if (req.user!.role === "MANAGER" && order.outletId !== req.user!.outletId) {
      throw new AppError(403, "You cannot manage orders for another outlet.");
    }

    const allowed = VALID_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new AppError(
        400,
        `Invalid status transition from ${order.status} to ${nextStatus}.`
      );
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      // 1. On ACCEPTED -> Reserve required recipe ingredients
      if (nextStatus === "ACCEPTED") {
        for (const orderItem of order.items) {
          for (const recipe of orderItem.menuItem.recipes) {
            const needed = Number(recipe.quantity) * orderItem.quantity;
            const ing = await tx.ingredient.findUnique({
              where: { id: recipe.ingredientId },
            });
            if (ing) {
              const availableStock =
                Number(ing.currentStock) - Number(ing.reservedStock);
              if (availableStock < needed) {
                throw new AppError(
                  400,
                  `Insufficient stock for ingredient "${ing.name}". Available: ${availableStock.toFixed(
                    2
                  )} ${ing.unit}, required: ${needed.toFixed(2)} ${ing.unit}`
                );
              }
              await tx.ingredient.update({
                where: { id: ing.id },
                data: { reservedStock: { increment: needed } },
              });
              await tx.stockReservation.create({
                data: {
                  ingredientId: ing.id,
                  orderId: order.id,
                  quantity: needed,
                },
              });
              await tx.inventoryMovement.create({
                data: {
                  ingredientId: ing.id,
                  type: "RESERVATION",
                  quantity: needed,
                  reason: `Reserved for order ${order.orderNumber}`,
                  referenceId: order.id,
                  performedBy: req.user!.id,
                },
              });
            }
          }
        }
      }

      // 2. On PREPARING -> Deduct actual stock from reserved ingredients
      if (nextStatus === "PREPARING") {
        for (const resv of order.stockReservations) {
          if (!resv.isConsumed && !resv.isReleased) {
            await tx.ingredient.update({
              where: { id: resv.ingredientId },
              data: {
                currentStock: { decrement: resv.quantity },
                reservedStock: { decrement: resv.quantity },
              },
            });
            await tx.stockReservation.update({
              where: { id: resv.id },
              data: { isConsumed: true },
            });
            await tx.inventoryMovement.create({
              data: {
                ingredientId: resv.ingredientId,
                type: "CONSUMPTION",
                quantity: resv.quantity,
                reason: `Consumed for order ${order.orderNumber}`,
                referenceId: order.id,
                performedBy: req.user!.id,
              },
            });
          }
        }
      }

      // 3. On REJECTED or CANCELLED -> Release reservations
      if (nextStatus === "REJECTED" || nextStatus === "CANCELLED") {
        for (const resv of order.stockReservations) {
          if (!resv.isReleased && !resv.isConsumed) {
            await tx.ingredient.update({
              where: { id: resv.ingredientId },
              data: { reservedStock: { decrement: resv.quantity } },
            });
            await tx.stockReservation.update({
              where: { id: resv.id },
              data: { isReleased: true },
            });
          }
        }
      }

      // 4. On COMPLETED -> Mark payment completed
      if (nextStatus === "COMPLETED") {
        await tx.payment.updateMany({
          where: { orderId: order.id },
          data: { status: "COMPLETED", paidAt: new Date() },
        });
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: nextStatus,
          ...(nextStatus === "READY" ? { actualReady: new Date() } : {}),
          ...(nextStatus === "REJECTED" ? { rejectReason: note } : {}),
          statusHistory: {
            create: {
              status: nextStatus,
              note: note ?? `Status updated to ${nextStatus}`,
              changedBy: req.user!.id,
            },
          },
        },
        include: {
          items: true,
          student: { select: { id: true, firstName: true, lastName: true, email: true } },
          outlet: { select: { id: true, name: true, slug: true } },
          statusHistory: { orderBy: { createdAt: "asc" } },
          payment: true,
        },
      });

      await tx.notification.create({
        data: {
          userId: updated.studentId,
          title: `Order ${updated.orderNumber} is ${nextStatus}`,
          message:
            nextStatus === "READY"
              ? `Your order at ${updated.outlet.name} is ready for pickup!`
              : `Your order status changed to ${nextStatus}.`,
          type: "ORDER_UPDATE",
          metadata: JSON.stringify({ orderId: updated.id, status: nextStatus }),
        },
      });

      return updated;
    });

    // 5. Broadcast live Socket.IO event AFTER database transaction succeeds
    if (io) {
      const payload = {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        outletId: updatedOrder.outletId,
        studentId: updatedOrder.studentId,
        status: updatedOrder.status,
        previousStatus: order.status,
        estimatedReady: updatedOrder.estimatedReady?.toISOString(),
        updatedAt: updatedOrder.updatedAt.toISOString(),
      };
      io.to(`student:${updatedOrder.studentId}`).emit("order:statusUpdate", payload);
      io.to(`outlet:${updatedOrder.outletId}`).emit("order:statusUpdate", payload);
      io.to("admin").emit("order:statusUpdate", payload);
    }

    res.json({
      success: true,
      message: `Order status updated to ${nextStatus}.`,
      data: updatedOrder,
    });
  })
);

// ── Student: Rate & Review Menu Item ────────────────────────────────────────
router.post(
  "/reviews",
  authenticate,
  requireRole("STUDENT"),
  validate({ body: createReviewSchema }),
  catchAsync(async (req: Request, res: Response) => {
    const { menuItemId, rating, comment } = req.body as z.infer<typeof createReviewSchema>;
    const userId = req.user!.id;

    const review = await prisma.review.upsert({
      where: { userId_menuItemId: { userId, menuItemId } },
      update: { rating, comment },
      create: { userId, menuItemId, rating, comment },
    });

    const stats = await prisma.review.aggregate({
      where: { menuItemId, isVisible: true },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await prisma.menuItem.update({
      where: { id: menuItemId },
      data: {
        avgRating: Number((stats._avg.rating ?? rating).toFixed(2)),
        totalRatings: stats._count.rating,
      },
    });

    res.status(201).json({
      success: true,
      message: "Thank you for your review!",
      data: review,
    });
  })
);

export default router;
