import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/database.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { AppError, catchAsync } from "../../middleware/errorHandler.js";
import { validate } from "../../middleware/validate.js";
import { hashPassword } from "../../utils/helpers.js";

const router = Router();

const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).optional(),
  dietaryType: z.enum(["VEG", "NON_VEG", "VEGAN", "EGG"]).optional(),
  allergies: z.string().max(500).optional(),
  monthlyBudget: z.coerce.number().min(0).max(100000).optional(),
  spiceLevel: z.coerce.number().int().min(1).max(5).optional(),
  maxBudget: z.coerce.number().min(0).max(5000).optional(),
});

const createManagerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  outletId: z.string().min(1),
});

// ── Student: Profile & Dietary Preferences ──────────────────────────────────
router.get(
  "/student/profile",
  authenticate,
  requireRole("STUDENT"),
  catchAsync(async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        studentProfile: true,
        preferences: true,
      },
    });
    res.json({ success: true, data: user });
  })
);

router.patch(
  "/student/profile",
  authenticate,
  requireRole("STUDENT"),
  validate({ body: updateProfileSchema }),
  catchAsync(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof updateProfileSchema>;
    const userId = req.user!.id;

    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.firstName ? { firstName: body.firstName } : {}),
        ...(body.lastName ? { lastName: body.lastName } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        studentProfile: {
          upsert: {
            create: {
              dietaryType: body.dietaryType ?? "VEG",
              allergies: body.allergies,
              monthlyBudget: body.monthlyBudget,
            },
            update: {
              ...(body.dietaryType ? { dietaryType: body.dietaryType } : {}),
              ...(body.allergies !== undefined ? { allergies: body.allergies } : {}),
              ...(body.monthlyBudget !== undefined ? { monthlyBudget: body.monthlyBudget } : {}),
            },
          },
        },
        preferences: {
          upsert: {
            create: {
              preferVeg: (body.dietaryType ?? "VEG") !== "NON_VEG",
              spiceLevel: body.spiceLevel ?? 3,
              maxBudget: body.maxBudget,
            },
            update: {
              ...(body.dietaryType ? { preferVeg: body.dietaryType !== "NON_VEG" } : {}),
              ...(body.spiceLevel !== undefined ? { spiceLevel: body.spiceLevel } : {}),
              ...(body.maxBudget !== undefined ? { maxBudget: body.maxBudget } : {}),
            },
          },
        },
      },
    });

    const updated = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        studentProfile: true,
        preferences: true,
      },
    });

    res.json({
      success: true,
      message: "Dietary preferences & profile updated.",
      data: updated,
    });
  })
);

// ── Student: Digital Spending Tracker & Refund History ──────────────────────
router.get(
  "/student/wallet",
  authenticate,
  requireRole("STUDENT"),
  catchAsync(async (req: Request, res: Response) => {
    const orders = await prisma.order.findMany({
      where: { studentId: req.user!.id },
      include: {
        outlet: { select: { id: true, name: true } },
        items: { include: { menuItem: { include: { category: true } } } },
        payment: true,
        refund: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const activeOrders = orders.filter(
      (o) => !["CANCELLED", "REJECTED"].includes(o.status)
    );
    const totalSpent = activeOrders.reduce((acc, o) => acc + Number(o.total), 0);
    const totalRefunded = orders
      .filter((o) => o.refund)
      .reduce((acc, o) => acc + Number(o.refund?.amount ?? 0), 0);

    // Category spending breakdown
    const byCategory: Record<string, number> = {};
    for (const o of activeOrders) {
      for (const item of o.items) {
        const cat = item.menuItem?.category?.name ?? "General";
        byCategory[cat] = Number(
          ((byCategory[cat] ?? 0) + Number(item.subtotal)).toFixed(2)
        );
      }
    }

    // Outlet spending breakdown
    const byOutlet: Record<string, number> = {};
    for (const o of activeOrders) {
      const name = o.outlet.name;
      byOutlet[name] = Number(((byOutlet[name] ?? 0) + Number(o.total)).toFixed(2));
    }

    const studentProfile = await prisma.studentProfile.findUnique({
      where: { userId: req.user!.id },
      include: {
        walletTransactions: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });

    res.json({
      success: true,
      data: {
        totalSpent: Number(totalSpent.toFixed(2)),
        totalRefunded: Number(totalRefunded.toFixed(2)),
        totalOrders: orders.length,
        monthlyBudget: studentProfile?.monthlyBudget
          ? Number(studentProfile.monthlyBudget)
          : null,
        categorySpending: Object.entries(byCategory).map(([name, amount]) => ({
          name,
          amount,
        })),
        outletSpending: Object.entries(byOutlet).map(([name, amount]) => ({
          name,
          amount,
        })),
        transactions: studentProfile?.walletTransactions ?? [],
      },
    });
  })
);

// ── Manager: Outlet Analytics Dashboard ─────────────────────────────────────
router.get(
  "/manager/analytics",
  authenticate,
  requireRole("MANAGER", "SUPER_ADMIN"),
  catchAsync(async (req: Request, res: Response) => {
    const outletId =
      req.user!.role === "MANAGER"
        ? req.user!.outletId
        : (req.query.outletId as string | undefined);

    if (!outletId) {
      throw new AppError(400, "Outlet ID is required.");
    }

    const [outlet, orders, menuItems, ingredients] = await Promise.all([
      prisma.outlet.findUnique({ where: { id: outletId } }),
      prisma.order.findMany({
        where: { outletId },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.menuItem.findMany({
        where: { outletId, isActive: true, deletedAt: null },
        orderBy: { totalOrders: "desc" },
        take: 10,
      }),
      prisma.ingredient.findMany({
        where: { outletId, isActive: true },
      }),
    ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayOrders = orders.filter((o) => o.createdAt >= todayStart);
    const completedOrders = orders.filter((o) => o.status === "COMPLETED");
    const pendingOrders = orders.filter((o) =>
      ["PLACED", "ACCEPTED", "PREPARING", "READY"].includes(o.status)
    );
    const cancelledOrRejected = orders.filter((o) =>
      ["CANCELLED", "REJECTED"].includes(o.status)
    );

    const totalRevenue = orders
      .filter((o) => !["CANCELLED", "REJECTED"].includes(o.status))
      .reduce((sum, o) => sum + Number(o.total), 0);

    const lowStockWarnings = ingredients.filter(
      (i) => Number(i.currentStock) - Number(i.reservedStock) <= Number(i.minStockLevel)
    );

    // Peak hours breakdown
    const hourCounts: Record<number, number> = {};
    for (let h = 8; h <= 20; h++) hourCounts[h] = 0;
    for (const o of orders) {
      const hr = o.createdAt.getHours();
      hourCounts[hr] = (hourCounts[hr] ?? 0) + 1;
    }

    res.json({
      success: true,
      data: {
        outlet,
        summary: {
          todayOrders: todayOrders.length,
          totalOrders: orders.length,
          completedOrders: completedOrders.length,
          pendingOrders: pendingOrders.length,
          cancelledOrRejected: cancelledOrRejected.length,
          totalRevenue: Number(totalRevenue.toFixed(2)),
          lowStockCount: lowStockWarnings.length,
        },
        popularItems: menuItems.map((m) => ({
          id: m.id,
          name: m.name,
          price: Number(m.price),
          totalOrders: m.totalOrders,
          avgRating: m.avgRating,
        })),
        hourlyOrders: Object.entries(hourCounts).map(([hour, count]) => ({
          hour: `${hour}:00`,
          orders: count,
        })),
        lowStockWarnings: lowStockWarnings.map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          available: Number(i.currentStock) - Number(i.reservedStock),
          minStockLevel: Number(i.minStockLevel),
        })),
      },
    });
  })
);

// ── Super Admin: Centralized Campus Analytics ───────────────────────────────
router.get(
  "/admin/analytics",
  authenticate,
  requireRole("SUPER_ADMIN"),
  catchAsync(async (_req: Request, res: Response) => {
    const [outlets, studentCount, managerCount, orders, popularItems, ingredients] =
      await Promise.all([
        prisma.outlet.findMany({
          where: { deletedAt: null },
          include: {
            orders: true,
            _count: { select: { menuItems: { where: { deletedAt: null } } } },
          },
          orderBy: { name: "asc" },
        }),
        prisma.user.count({ where: { role: "STUDENT" } }),
        prisma.user.count({ where: { role: "MANAGER" } }),
        prisma.order.findMany(),
        prisma.menuItem.findMany({
          where: { isActive: true, deletedAt: null },
          include: { outlet: { select: { name: true } } },
          orderBy: [{ totalOrders: "desc" }, { popularityScore: "desc" }],
          take: 8,
        }),
        prisma.ingredient.findMany({
          where: { isActive: true },
          include: { outlet: { select: { name: true } } },
        }),
      ]);

    const validOrders = orders.filter(
      (o) => !["CANCELLED", "REJECTED"].includes(o.status)
    );
    const totalRevenue = validOrders.reduce((sum, o) => sum + Number(o.total), 0);

    const outletComparison = outlets.map((o) => {
      const valid = o.orders.filter(
        (ord) => !["CANCELLED", "REJECTED"].includes(ord.status)
      );
      const rev = valid.reduce((sum, ord) => sum + Number(ord.total), 0);
      return {
        id: o.id,
        name: o.name,
        isOpen: o.isOpen,
        totalOrders: o.orders.length,
        revenue: Number(rev.toFixed(2)),
        menuCount: o._count.menuItems,
      };
    });

    const lowStockWarnings = ingredients
      .filter(
        (i) => Number(i.currentStock) - Number(i.reservedStock) <= Number(i.minStockLevel)
      )
      .map((i) => ({
        id: i.id,
        name: i.name,
        outletName: i.outlet.name,
        available: Number(i.currentStock) - Number(i.reservedStock),
        minStockLevel: Number(i.minStockLevel),
        unit: i.unit,
      }));

    res.json({
      success: true,
      data: {
        summary: {
          totalOutlets: outlets.length,
          totalStudents: studentCount,
          totalManagers: managerCount,
          totalOrders: orders.length,
          totalRevenue: Number(totalRevenue.toFixed(2)),
          lowStockCount: lowStockWarnings.length,
        },
        outletComparison,
        popularItems: popularItems.map((m) => ({
          id: m.id,
          name: m.name,
          outletName: m.outlet.name,
          price: Number(m.price),
          totalOrders: m.totalOrders,
        })),
        lowStockWarnings,
      },
    });
  })
);

// ── Super Admin: Manage Managers ────────────────────────────────────────────
router.get(
  "/admin/managers",
  authenticate,
  requireRole("SUPER_ADMIN"),
  catchAsync(async (_req: Request, res: Response) => {
    const managers = await prisma.user.findMany({
      where: { role: "MANAGER" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        managerProfile: {
          include: { outlet: { select: { id: true, name: true, slug: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    res.json({ success: true, data: managers });
  })
);

router.post(
  "/admin/managers",
  authenticate,
  requireRole("SUPER_ADMIN"),
  validate({ body: createManagerSchema }),
  catchAsync(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof createManagerSchema>;

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw new AppError(409, "A user with this email already exists.");
    }

    const passwordHash = await hashPassword(body.password);

    const manager = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        role: "MANAGER",
        firstName: body.firstName,
        lastName: body.lastName,
        managerProfile: {
          create: { outletId: body.outletId },
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        managerProfile: {
          include: { outlet: { select: { id: true, name: true, slug: true } } },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "CREATE_MANAGER",
        entity: "User",
        entityId: manager.id,
        details: JSON.stringify({ email: manager.email, outletId: body.outletId }),
      },
    });

    res.status(201).json({
      success: true,
      message: "Manager account created and assigned to outlet.",
      data: manager,
    });
  })
);

// ── Super Admin: List Students ──────────────────────────────────────────────
router.get(
  "/admin/students",
  authenticate,
  requireRole("SUPER_ADMIN"),
  catchAsync(async (_req: Request, res: Response) => {
    const students = await prisma.user.findMany({
      where: { role: "STUDENT" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        studentProfile: true,
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: students });
  })
);

// ── Super Admin: Audit Logs ─────────────────────────────────────────────────
router.get(
  "/admin/audit-logs",
  authenticate,
  requireRole("SUPER_ADMIN"),
  catchAsync(async (_req: Request, res: Response) => {
    const logs = await prisma.auditLog.findMany({
      include: {
        user: { select: { id: true, email: true, role: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    res.json({ success: true, data: logs });
  })
);

// ── Super Admin: Toggle User Active Status ──────────────────────────────────
router.patch(
  "/admin/users/:id/status",
  authenticate,
  requireRole("SUPER_ADMIN"),
  catchAsync(async (req: Request, res: Response) => {
    const userId = String(req.params.id);
    const { isActive } = req.body as { isActive: boolean };

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      throw new AppError(404, "User not found.");
    }
    if (target.role === "SUPER_ADMIN") {
      throw new AppError(400, "Cannot deactivate a Super Admin account.");
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive: Boolean(isActive) },
      select: { id: true, email: true, role: true, isActive: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: updated.isActive ? "ACTIVATE_USER" : "DEACTIVATE_USER",
        entity: "User",
        entityId: updated.id,
        details: JSON.stringify({ email: updated.email, isActive: updated.isActive }),
      },
    });

    res.json({
      success: true,
      message: `User ${updated.email} ${updated.isActive ? "activated" : "deactivated"}.`,
      data: updated,
    });
  })
);

export default router;
