import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";
import { execQuery, queryRows, withTransaction } from "../config/db.js";
import { authenticateV2, requireV2Role } from "../middleware/auth.js";
import { ioV2 } from "../sockets/index.js";

const router = Router();

const createOrderSchema = z.object({
  canteenId: z.string().min(1),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        quantity: z.coerce.number().int().min(1).max(30),
      })
    )
    .min(1, "Cart cannot be empty"),
  paymentMethod: z.enum(["CASH", "RAZORPAY", "WALLET"]).default("CASH"),
  addressId: z.string().optional().nullable(),
  specialInstructions: z.string().max(500).optional().nullable(),
  idempotencyKey: z.string().max(128).optional().nullable(),
});

const verifyPaymentSchema = z.object({
  orderId: z.string().min(1),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

// ── 1. Public / Customer: Browse Active Establishments (Excludes Suspended & Archived) ──
router.get("/public/establishments", async (req: Request, res: Response) => {
  const { search, type } = req.query;
  const params: unknown[] = [];
  let whereSql = "WHERE c.status = 'ACTIVE' AND c.is_deleted = 0";

  if (type && type !== "ALL") {
    whereSql += " AND c.type = ?";
    params.push(String(type));
  }
  if (search) {
    whereSql += " AND (c.name LIKE ? OR c.description LIKE ? OR c.location LIKE ?)";
    const s = `%${String(search).trim()}%`;
    params.push(s, s, s);
  }

  const rows = await queryRows<RowDataPacket[]>(
    `SELECT
       c.id,
       c.name,
       c.type,
       c.description,
       c.logo_url,
       c.cover_image_url,
       c.location,
       c.opening_time,
       c.closing_time,
       c.status,
       c.crowd_level,
       c.crowd_count,
       (SELECT COUNT(*) FROM menu_items mi WHERE mi.canteen_id = c.id AND mi.is_deleted = 0 AND mi.is_available = 1) AS available_items_count,
       (SELECT COUNT(*) FROM menu_items mi WHERE mi.canteen_id = c.id AND mi.is_deleted = 0) AS total_items_count
     FROM canteens c
     ${whereSql}
     ORDER BY c.name ASC`,
    params
  );

  res.json({ success: true, data: rows });
});

// ── 2. Public / Customer: Single Establishment & Menu Catalogue ─────────────
router.get(
  "/public/establishments/:id/menu",
  async (req: Request, res: Response) => {
    const canteenId = String(req.params.id);
    const canteenRows = await queryRows<RowDataPacket[]>(
      `SELECT
         id, name, type, description, logo_url, cover_image_url,
         location, opening_time, closing_time, status, crowd_level, crowd_count
       FROM canteens
       WHERE id = ? AND status = 'ACTIVE' AND is_deleted = 0
       LIMIT 1`,
      [canteenId]
    );

    const canteen = canteenRows[0];
    if (!canteen) {
      res.status(404).json({
        success: false,
        error: "Establishment not found or currently inactive.",
      });
      return;
    }

    const categories = await queryRows<RowDataPacket[]>(
      `SELECT id, canteen_id, name, description, sort_order
       FROM menu_categories
       WHERE canteen_id = ? AND is_active = 1
       ORDER BY sort_order ASC, name ASC`,
      [canteenId]
    );

    const items = await queryRows<RowDataPacket[]>(
      `SELECT
         mi.id,
         mi.canteen_id,
         mi.category_id,
         mc.name AS category_name,
         mi.name,
         mi.description,
         mi.price,
         mi.dietary_type,
         mi.preparation_time,
         mi.stock_quantity,
         mi.is_available,
         mi.image_url,
         mi.avg_rating,
         mi.total_reviews
       FROM menu_items mi
       LEFT JOIN menu_categories mc ON mc.id = mi.category_id
       WHERE mi.canteen_id = ? AND mi.is_deleted = 0
       ORDER BY mi.is_available DESC, mi.name ASC`,
      [canteenId]
    );

    res.json({
      success: true,
      data: {
        establishment: canteen,
        categories,
        items,
      },
    });
  }
);

// ── 3. Public / Customer: QR Token Lookup ───────────────────────────────────
router.get("/public/qr/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token);
  const rows = await queryRows<RowDataPacket[]>(
    "SELECT * FROM canteens WHERE qr_token = ? AND status = 'ACTIVE' AND is_deleted = 0 LIMIT 1",
    [token]
  );

  if (rows.length === 0) {
    res.status(404).json({
      success: false,
      error: "Invalid QR code or establishment is not currently active.",
    });
    return;
  }

  const items = await queryRows<RowDataPacket[]>(
    "SELECT * FROM menu_items WHERE canteen_id = ? AND is_deleted = 0 AND is_available = 1",
    [rows[0].id]
  );

  res.json({
    success: true,
    data: {
      establishment: rows[0],
      items,
    },
  });
});

// ── 3b. Public Persistent Media Endpoint (Serves Food Images from MySQL LONGBLOB across redeployments) ──
router.get("/public/media/:imageId", async (req: Request, res: Response) => {
  const imageId = String(req.params.imageId || "").trim();
  const rows = await queryRows<RowDataPacket[]>(
    `SELECT mime_type, image_data, file_name, size_bytes
     FROM menu_images
     WHERE id = ? OR file_name = ?
     LIMIT 1`,
    [imageId, imageId]
  );

  const img = rows[0];
  if (!img || !img.image_data) {
    res.status(404).json({
      success: false,
      error: "Image asset not found.",
    });
    return;
  }

  res.setHeader("Content-Type", img.mime_type || "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(img.image_data);
});

// ── 4. Customer: Transactional Order Checkout (Server-Side Pricing & Snapshots) ──
router.post(
  "/customer/orders",
  authenticateV2,
  requireV2Role("CUSTOMER"),
  async (req: Request, res: Response) => {
    try {
      const parsed = createOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: "Invalid order request.",
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const d = parsed.data;
      const customerId = req.user!.id;

      // Idempotency duplicate submission prevention
      if (d.idempotencyKey) {
        const existing = await queryRows<RowDataPacket[]>(
          "SELECT * FROM orders WHERE idempotency_key = ? LIMIT 1",
          [d.idempotencyKey]
        );
        if (existing.length > 0) {
          const items = await queryRows<RowDataPacket[]>(
            "SELECT * FROM order_items WHERE order_id = ?",
            [existing[0].id]
          );
          res.status(200).json({
            success: true,
            message: "Returned existing idempotent order.",
            data: { ...existing[0], items },
          });
          return;
        }
      }

      // Verify establishment is ACTIVE (blocks SUSPENDED or ARCHIVED establishments)
      const canteenRows = await queryRows<RowDataPacket[]>(
        "SELECT * FROM canteens WHERE id = ? LIMIT 1",
        [d.canteenId]
      );
      const canteen = canteenRows[0];
      if (!canteen || canteen.is_deleted === 1) {
        res.status(404).json({
          success: false,
          error: "Establishment not found.",
        });
        return;
      }

      if (canteen.status !== "ACTIVE") {
        res.status(400).json({
          success: false,
          error: `"${canteen.name}" is currently ${canteen.status} and is not accepting new orders.`,
        });
        return;
      }

      // Check if customer has enabled a strict monthly spending restriction (Section 7.3)
      const currentMonthYear = new Date().toISOString().slice(0, 7);
      const budgetRows = await queryRows<RowDataPacket[]>(
        "SELECT * FROM customer_budgets WHERE user_id = ? AND month_year = ? LIMIT 1",
        [customerId, currentMonthYear]
      );
      const prefRows = await queryRows<RowDataPacket[]>(
        "SELECT * FROM customer_preferences WHERE user_id = ? LIMIT 1",
        [customerId]
      );

      const budgetRecord = budgetRows[0];
      const prefRecord = prefRows[0];
      const isBudgetEnabled =
        budgetRecord !== undefined
          ? Number(budgetRecord.is_enabled) === 1
          : prefRecord !== undefined
            ? Number(prefRecord.budget_enabled) === 1
            : false;
      const isStrictRestricted =
        budgetRecord !== undefined
          ? Number(budgetRecord.restrict_spending) === 1
          : prefRecord !== undefined
            ? Number(prefRecord.restrict_spending) === 1
            : false;
      const activeMonthlyLimit = Number(
        budgetRecord?.monthly_limit ?? prefRecord?.default_monthly_budget ?? 0
      );

      if (isBudgetEnabled && isStrictRestricted && activeMonthlyLimit > 0) {
        // Compute current month's net spending + projected order total
        const [monthSpentRow] = await queryRows<RowDataPacket[]>(
          `SELECT COALESCE(SUM(total_amount), 0) AS netSpent
           FROM orders
           WHERE customer_id = ?
             AND DATE_FORMAT(created_at, '%Y-%m') = ?
             AND status NOT IN ('REJECTED', 'CANCELLED')
             AND payment_status != 'REFUNDED'`,
          [customerId, currentMonthYear]
        );
        let projectedSubtotal = 0;
        for (const reqItem of d.items) {
          const [pItem] = await queryRows<RowDataPacket[]>(
            "SELECT price FROM menu_items WHERE id = ? LIMIT 1",
            [reqItem.menuItemId]
          );
          if (pItem) {
            projectedSubtotal += Number(pItem.price) * reqItem.quantity;
          }
        }
        const projectedOrderTotal = Number(
          (projectedSubtotal * 1.05).toFixed(2)
        );
        const currentMonthSpent = Number(monthSpentRow?.netSpent || 0);
        if (currentMonthSpent + projectedOrderTotal > activeMonthlyLimit) {
          res.status(400).json({
            success: false,
            error: `Monthly spending restriction reached: Your limit for ${currentMonthYear} is ₹${activeMonthlyLimit.toFixed(
              2
            )} (already spent ₹${currentMonthSpent.toFixed(
              2
            )}). You can adjust or disable your budget restriction in Spending Analytics.`,
            failureCategory: "MONTHLY_BUDGET_RESTRICTION_EXCEEDED",
          });
          return;
        }
      }

      let addressSnapshot: string | null = null;
      if (d.addressId) {
        const addrRows = await queryRows<RowDataPacket[]>(
          "SELECT * FROM addresses WHERE id = ? AND user_id = ? LIMIT 1",
          [d.addressId, customerId]
        );
        if (addrRows[0]) {
          addressSnapshot = `${addrRows[0].label}: ${addrRows[0].building_or_block}${
            addrRows[0].room_or_landmark ? `, ${addrRows[0].room_or_landmark}` : ""
          }`;
        }
      }

      const orderId = crypto.randomUUID();
      const orderNumber = `CB2-${new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "")}-${crypto.randomInt(1000, 9999)}`;

      const createdResult = await withTransaction(async (conn) => {
        let subtotal = 0;
        const snapshots: Array<{
          menuItemId: string;
          nameSnapshot: string;
          unitPriceSnapshot: number;
          quantity: number;
          lineTotal: number;
        }> = [];

        // Lock and validate each menu item server-side
        for (const reqItem of d.items) {
          const [itemRows] = await conn.query<RowDataPacket[]>(
            "SELECT * FROM menu_items WHERE id = ? AND canteen_id = ? AND is_deleted = 0 FOR UPDATE",
            [reqItem.menuItemId, canteen.id]
          );

          const dbItem = itemRows[0];
          if (!dbItem) {
            throw new Error(
              `Menu item ${reqItem.menuItemId} does not belong to ${canteen.name}.`
            );
          }

          if (dbItem.is_available !== 1 || Number(dbItem.stock_quantity) < reqItem.quantity) {
            throw new Error(
              `"${dbItem.name}" is unavailable or has insufficient stock (${dbItem.stock_quantity} left).`
            );
          }

          const unitPrice = Number(dbItem.price);
          const lineTotal = Number((unitPrice * reqItem.quantity).toFixed(2));
          subtotal = Number((subtotal + lineTotal).toFixed(2));

          const nextStock = Number(dbItem.stock_quantity) - reqItem.quantity;
          await conn.execute(
            `UPDATE menu_items
             SET stock_quantity = ?,
                 is_available = ?,
                 total_orders = total_orders + ?
             WHERE id = ?`,
            [nextStock, nextStock > 0 ? 1 : 0, reqItem.quantity, dbItem.id]
          );

          snapshots.push({
            menuItemId: dbItem.id,
            nameSnapshot: dbItem.name,
            unitPriceSnapshot: unitPrice,
            quantity: reqItem.quantity,
            lineTotal,
          });
        }

        const taxAmount = Number((subtotal * 0.05).toFixed(2)); // 5% GST
        const totalAmount = Number((subtotal + taxAmount).toFixed(2));

        let paymentStatus: "PENDING" | "PAID" = "PENDING";
        let gatewayOrderId: string | null = null;

        // If paying via WALLET, verify and deduct customer wallet balance atomically
        if (d.paymentMethod === "WALLET") {
          const [uRows] = await conn.query<RowDataPacket[]>(
            "SELECT wallet_balance FROM users WHERE id = ? FOR UPDATE",
            [customerId]
          );
          const currentBalance = Number(uRows[0]?.wallet_balance || 0);
          if (currentBalance < totalAmount) {
            throw new Error(
              `Insufficient wallet balance (₹${currentBalance.toFixed(
                2
              )} available, ₹${totalAmount.toFixed(2)} required).`
            );
          }
          const balanceAfter = Number((currentBalance - totalAmount).toFixed(2));
          await conn.execute(
            "UPDATE users SET wallet_balance = ? WHERE id = ?",
            [balanceAfter, customerId]
          );
          await conn.execute(
            `INSERT INTO wallet_ledger (id, user_id, entry_type, amount, balance_after, reference_id, description)
             VALUES (?, ?, 'DEBIT', ?, ?, ?, ?)`,
            [
              crypto.randomUUID(),
              customerId,
              totalAmount,
              balanceAfter,
              orderId,
              `Order ${orderNumber} at ${canteen.name}`,
            ]
          );
          paymentStatus = "PAID";
        } else if (d.paymentMethod === "RAZORPAY") {
          gatewayOrderId = `order_rzp_${crypto.randomBytes(8).toString("hex")}`;
        }

        // Insert order with permanent canteen_id AND historical canteen_name_snapshot
        await conn.execute(
          `INSERT INTO orders
           (id, order_number, customer_id, canteen_id, canteen_name_snapshot, status,
            subtotal, tax_amount, total_amount, payment_method, payment_status,
            delivery_address_snapshot, special_instructions, idempotency_key)
           VALUES (?, ?, ?, ?, ?, 'PLACED', ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            orderNumber,
            customerId,
            canteen.id,
            canteen.name,
            subtotal,
            taxAmount,
            totalAmount,
            d.paymentMethod,
            paymentStatus,
            addressSnapshot,
            d.specialInstructions || null,
            d.idempotencyKey || null,
          ]
        );

        for (const snap of snapshots) {
          await conn.execute(
            `INSERT INTO order_items
             (id, order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, line_total)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              crypto.randomUUID(),
              orderId,
              snap.menuItemId,
              snap.nameSnapshot,
              snap.unitPriceSnapshot,
              snap.quantity,
              snap.lineTotal,
            ]
          );
        }

        const paymentId = crypto.randomUUID();
        const txRef = `TXN-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
        await conn.execute(
          `INSERT INTO payments
           (id, order_id, user_id, canteen_id, canteen_name_snapshot, amount, currency,
            method, status, gateway_order_id, transaction_ref, idempotency_key)
           VALUES (?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?)`,
          [
            paymentId,
            orderId,
            customerId,
            canteen.id,
            canteen.name,
            totalAmount,
            d.paymentMethod,
            paymentStatus === "PAID" ? "CAPTURED" : "PENDING",
            gatewayOrderId,
            txRef,
            d.idempotencyKey || null,
          ]
        );

        return {
          orderId,
          orderNumber,
          subtotal,
          taxAmount,
          totalAmount,
          paymentStatus,
          gatewayOrderId,
          transactionRef: txRef,
          snapshots,
        };
      });

      const [orderRecord] = await queryRows<RowDataPacket[]>(
        "SELECT * FROM orders WHERE id = ?",
        [orderId]
      );
      const orderItems = await queryRows<RowDataPacket[]>(
        "SELECT * FROM order_items WHERE order_id = ?",
        [orderId]
      );

      // Immediately notify manager & admin via Socket.IO after DB commit
      if (ioV2) {
        const eventPayload = {
          ...orderRecord,
          items: orderItems,
        };
        ioV2
          .to(`establishment:${canteen.id}`)
          .emit("order:created", eventPayload);
        ioV2.to("admin").emit("order:created", eventPayload);
      }

      res.status(201).json({
        success: true,
        message: `Order ${createdResult.orderNumber} placed successfully.`,
        data: {
          ...orderRecord,
          items: orderItems,
          gatewayOrderId: createdResult.gatewayOrderId,
          transactionRef: createdResult.transactionRef,
        },
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: (err as Error).message || "Checkout failed.",
      });
    }
  }
);

// ── 5. Razorpay HMAC-SHA256 Payment Signature Verification ──────────────────
router.post(
  "/customer/payments/verify",
  authenticateV2,
  requireV2Role("CUSTOMER"),
  async (req: Request, res: Response) => {
    const parsed = verifyPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Invalid payment verification payload.",
      });
      return;
    }

    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } =
      parsed.data;

    const secret =
      process.env.RAZORPAY_KEY_SECRET || "rzp_secret_campusbite_v2_hmac_key";
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      await execQuery(
        `INSERT INTO audit_logs
         (id, actor_id, actor_role, entity_type, entity_id, action, metadata)
         VALUES (?, ?, 'CUSTOMER', 'PAYMENT', ?, 'INVALID_PAYMENT_SIGNATURE', ?)`,
        [
          crypto.randomUUID(),
          req.user!.id,
          orderId,
          JSON.stringify({ razorpayOrderId, razorpayPaymentId }),
        ]
      );
      res.status(400).json({
        success: false,
        error: "Payment signature verification failed.",
      });
      return;
    }

    await withTransaction(async (conn) => {
      await conn.execute(
        "UPDATE orders SET payment_status = 'PAID' WHERE id = ? AND customer_id = ?",
        [orderId, req.user!.id]
      );
      await conn.execute(
        `UPDATE payments
         SET status = 'CAPTURED', gateway_payment_id = ?, gateway_signature = ?
         WHERE order_id = ?`,
        [razorpayPaymentId, razorpaySignature, orderId]
      );
    });

    res.json({
      success: true,
      message: "Payment signature verified and captured.",
    });
  }
);

// ── 5b. Razorpay Production Webhook Verification (Idempotent Server-to-Server Capture) ──
router.post(
  "/webhooks/razorpay",
  async (req: Request, res: Response) => {
    const signature = String(req.headers["x-razorpay-signature"] || "");
    const webhookSecret = (
      process.env.RAZORPAY_WEBHOOK_SECRET ||
      process.env.RAZORPAY_KEY_SECRET ||
      ""
    ).trim();

    if (!webhookSecret || !signature) {
      res.status(400).json({
        success: false,
        error: "Webhook signature or secret missing.",
      });
      return;
    }

    const payloadString = JSON.stringify(req.body);
    const expectedSig = crypto
      .createHmac("sha256", webhookSecret)
      .update(payloadString)
      .digest("hex");

    if (expectedSig !== signature) {
      res.status(400).json({
        success: false,
        error: "Invalid Razorpay webhook signature.",
      });
      return;
    }

    const event = String(req.body?.event || "");
    const paymentEntity = req.body?.payload?.payment?.entity;

    if (event === "payment.captured" && paymentEntity?.order_id) {
      const gatewayOrderId = String(paymentEntity.order_id);
      const gatewayPaymentId = String(paymentEntity.id || "");

      await withTransaction(async (conn) => {
        const [payRows] = await conn.query<RowDataPacket[]>(
          "SELECT id, order_id, status FROM payments WHERE gateway_order_id = ? LIMIT 1 FOR UPDATE",
          [gatewayOrderId]
        );
        if (payRows[0] && payRows[0].status !== "CAPTURED") {
          await conn.execute(
            "UPDATE payments SET status = 'CAPTURED', gateway_payment_id = ?, gateway_signature = ? WHERE id = ?",
            [gatewayPaymentId, signature, payRows[0].id]
          );
          if (payRows[0].order_id) {
            await conn.execute(
              "UPDATE orders SET payment_status = 'PAID' WHERE id = ?",
              [payRows[0].order_id]
            );
          }
        }
      });
    }

    res.json({ success: true, received: true });
  }
);

// ── 6. Customer Orders & Live Status Tracking ───────────────────────────────
router.get(
  "/customer/orders",
  authenticateV2,
  requireV2Role("CUSTOMER"),
  async (req: Request, res: Response) => {
    const orders = await queryRows<RowDataPacket[]>(
      `SELECT o.*, c.name AS current_canteen_name
       FROM orders o
       LEFT JOIN canteens c ON c.id = o.canteen_id
       WHERE o.customer_id = ?
       ORDER BY o.created_at DESC`,
      [req.user!.id]
    );

    for (const ord of orders) {
      const items = await queryRows<RowDataPacket[]>(
        "SELECT * FROM order_items WHERE order_id = ?",
        [ord.id]
      );
      ord.items = items;
    }

    res.json({ success: true, data: orders });
  }
);

// ── 7. Digital Wallet & Financial Ledger ────────────────────────────────────
router.get(
  "/customer/wallet",
  authenticateV2,
  requireV2Role("CUSTOMER"),
  async (req: Request, res: Response) => {
    const [u] = await queryRows<RowDataPacket[]>(
      "SELECT wallet_balance FROM users WHERE id = ?",
      [req.user!.id]
    );
    const ledger = await queryRows<RowDataPacket[]>(
      "SELECT * FROM wallet_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
      [req.user!.id]
    );
    const payments = await queryRows<RowDataPacket[]>(
      "SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
      [req.user!.id]
    );

    res.json({
      success: true,
      data: {
        walletBalance: Number(u?.wallet_balance || 0),
        ledger,
        payments,
      },
    });
  }
);

router.post(
  "/customer/wallet/topup",
  authenticateV2,
  requireV2Role("CUSTOMER"),
  async (req: Request, res: Response) => {
    const amount = Number(req.body?.amount || 0);
    if (!amount || amount <= 0 || amount > 25000) {
      res.status(400).json({
        success: false,
        error: "Top-up amount must be between ₹1 and ₹25,000.",
      });
      return;
    }

    const result = await withTransaction(async (conn) => {
      await conn.execute(
        "UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?",
        [amount, req.user!.id]
      );
      const [uRow] = await conn.query<RowDataPacket[]>(
        "SELECT wallet_balance FROM users WHERE id = ?",
        [req.user!.id]
      );
      const balanceAfter = Number(uRow[0]?.wallet_balance || 0);
      const refId = `TOPUP-${Date.now()}`;
      await conn.execute(
        `INSERT INTO wallet_ledger (id, user_id, entry_type, amount, balance_after, reference_id, description)
         VALUES (?, ?, 'CREDIT', ?, ?, ?, 'Wallet credit top-up')`,
        [crypto.randomUUID(), req.user!.id, amount, balanceAfter, refId]
      );
      return { balanceAfter, refId };
    });

    res.status(201).json({
      success: true,
      message: `Added ₹${amount} to your digital wallet.`,
      data: result,
    });
  }
);

// ── 8. Customer Addresses CRUD ──────────────────────────────────────────────
router.get(
  "/customer/addresses",
  authenticateV2,
  requireV2Role("CUSTOMER"),
  async (req: Request, res: Response) => {
    const rows = await queryRows<RowDataPacket[]>(
      "SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC",
      [req.user!.id]
    );
    res.json({ success: true, data: rows });
  }
);

router.post(
  "/customer/addresses",
  authenticateV2,
  requireV2Role("CUSTOMER"),
  async (req: Request, res: Response) => {
    const { label, buildingOrBlock, roomOrLandmark, notes } = req.body as {
      label?: string;
      buildingOrBlock?: string;
      roomOrLandmark?: string;
      notes?: string;
    };
    if (!label || !buildingOrBlock) {
      res.status(400).json({
        success: false,
        error: "Label and building/block are required.",
      });
      return;
    }

    const id = crypto.randomUUID();
    await execQuery(
      `INSERT INTO addresses (id, user_id, label, building_or_block, room_or_landmark, notes, is_default)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        id,
        req.user!.id,
        label.trim(),
        buildingOrBlock.trim(),
        roomOrLandmark || null,
        notes || null,
      ]
    );

    const [created] = await queryRows<RowDataPacket[]>(
      "SELECT * FROM addresses WHERE id = ?",
      [id]
    );
    res.status(201).json({
      success: true,
      message: "Delivery / pickup address saved.",
      data: created,
    });
  }
);

router.delete(
  "/customer/addresses/:id",
  authenticateV2,
  requireV2Role("CUSTOMER"),
  async (req: Request, res: Response) => {
    await execQuery("DELETE FROM addresses WHERE id = ? AND user_id = ?", [
      String(req.params.id),
      req.user!.id,
    ]);
    res.json({ success: true, message: "Address removed." });
  }
);

// ── 9. Customer Reviews ─────────────────────────────────────────────────────
router.post(
  "/customer/reviews",
  authenticateV2,
  requireV2Role("CUSTOMER"),
  async (req: Request, res: Response) => {
    const { menuItemId, canteenId, rating, comment, orderId } = req.body as {
      menuItemId?: string;
      canteenId?: string;
      rating?: number;
      comment?: string;
      orderId?: string;
    };

    const r = Number(rating);
    if (!menuItemId || !canteenId || !r || r < 1 || r > 5) {
      res.status(400).json({
        success: false,
        error: "menuItemId, canteenId, and rating (1-5) are required.",
      });
      return;
    }

    const revId = crypto.randomUUID();
    await execQuery(
      `INSERT INTO reviews (id, order_id, customer_id, canteen_id, menu_item_id, rating, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        revId,
        orderId || null,
        req.user!.id,
        canteenId,
        menuItemId,
        r,
        comment || null,
      ]
    );

    const [stats] = await queryRows<RowDataPacket[]>(
      "SELECT AVG(rating) AS avgRating, COUNT(*) AS totalReviews FROM reviews WHERE menu_item_id = ?",
      [menuItemId]
    );

    await execQuery(
      "UPDATE menu_items SET avg_rating = ?, total_reviews = ? WHERE id = ?",
      [
        Number(stats?.avgRating || r).toFixed(2),
        Number(stats?.totalReviews || 1),
        menuItemId,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Review submitted.",
    });
  }
);

// ── 10. Grounded AI Recommendations & Role-Aware AI Assistant ───────────────
router.get(
  "/ai/recommendations",
  authenticateV2,
  async (_req: Request, res: Response) => {
    const items = await queryRows<RowDataPacket[]>(
      `SELECT mi.*, c.name AS canteen_name, mc.name AS category_name
       FROM menu_items mi
       JOIN canteens c ON c.id = mi.canteen_id
       LEFT JOIN menu_categories mc ON mc.id = mi.category_id
       WHERE mi.is_deleted = 0 AND mi.is_available = 1 AND c.status = 'ACTIVE' AND c.is_deleted = 0
       ORDER BY mi.total_orders DESC, mi.avg_rating DESC, mi.price ASC
       LIMIT 8`
    );

    res.json({
      success: true,
      data: items,
    });
  }
);

router.post("/ai/chat", authenticateV2, async (req: Request, res: Response) => {
  const message = String(req.body?.message || "").trim();
  if (!message) {
    res.status(400).json({ success: false, error: "Message is required." });
    return;
  }

  const activeItems = await queryRows<RowDataPacket[]>(
    `SELECT mi.id, mi.name, mi.price, mi.dietary_type, mi.preparation_time, c.name AS canteen_name
     FROM menu_items mi
     JOIN canteens c ON c.id = mi.canteen_id
     WHERE mi.is_deleted = 0 AND mi.is_available = 1 AND c.status = 'ACTIVE' AND c.is_deleted = 0
     ORDER BY mi.total_orders DESC, mi.price ASC LIMIT 10`
  );

  const myOrders = await queryRows<RowDataPacket[]>(
    `SELECT order_number, canteen_name_snapshot, status, total_amount
     FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 3`,
    [req.user!.id]
  );

  let reply = "";
  if (activeItems.length === 0) {
    reply =
      "No active menu items are registered in CampusBite yet. Once an administrator registers an establishment and its manager adds dishes, I will recommend live items and prices here.";
  } else if (message.toLowerCase().includes("order")) {
    reply =
      myOrders.length === 0
        ? "You have no orders recorded yet."
        : "Your recent orders:\n" +
          myOrders
            .map(
              (o) =>
                `• #${o.order_number} (${o.canteen_name_snapshot}) — ${o.status} (₹${o.total_amount})`
            )
            .join("\n");
  } else {
    reply =
      "Here are live available dishes from active CampusBite establishments:\n" +
      activeItems
        .slice(0, 5)
        .map(
          (i) =>
            `• ${i.name} at ${i.canteen_name} — ₹${i.price} (${i.dietary_type}, ~${i.preparation_time}m)`
        )
        .join("\n");
  }

  res.json({
    success: true,
    data: {
      response: reply,
      items: activeItems.slice(0, 4),
    },
  });
});

// ── 11. Customer Personal Spending Analytics & Monthly Budget System (Section 7) ──
router.get(
  "/customer/spending-analytics",
  authenticateV2,
  requireV2Role("CUSTOMER"),
  async (req: Request, res: Response) => {
    const customerId = req.user!.id;
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonth = `${prevDate.getFullYear()}-${String(
      prevDate.getMonth() + 1
    ).padStart(2, "0")}`;

    const requestedMonth = String(req.query.month || currentMonth).slice(0, 7);
    const startDate = req.query.startDate ? String(req.query.startDate) : null;
    const endDate = req.query.endDate ? String(req.query.endDate) : null;

    let periodWhere = "AND DATE_FORMAT(o.created_at, '%Y-%m') = ?";
    const periodParams: unknown[] = [customerId, requestedMonth];

    if (startDate && endDate) {
      periodWhere = "AND DATE(o.created_at) >= ? AND DATE(o.created_at) <= ?";
      periodParams.splice(1, 1, startDate, endDate);
    }

    // 1. Selected Period Summary (Net Spending excludes REJECTED/CANCELLED/REFUNDED; never double-counts wallet top-ups)
    const [periodSummary] = await queryRows<RowDataPacket[]>(
      `SELECT
         COUNT(*) AS totalOrders,
         SUM(CASE WHEN o.status NOT IN ('REJECTED', 'CANCELLED') AND o.payment_status != 'REFUNDED' THEN 1 ELSE 0 END) AS activeOrCompletedOrders,
         COALESCE(SUM(CASE WHEN o.status NOT IN ('REJECTED', 'CANCELLED') AND o.payment_status != 'REFUNDED' THEN o.total_amount ELSE 0 END), 0) AS netSpent,
         COALESCE(SUM(CASE WHEN o.status NOT IN ('REJECTED', 'CANCELLED') AND o.payment_status != 'REFUNDED' THEN o.tax_amount ELSE 0 END), 0) AS totalTax,
         COALESCE(SUM(CASE WHEN o.payment_status = 'REFUNDED' OR o.status IN ('REJECTED', 'CANCELLED') THEN o.total_amount ELSE 0 END), 0) AS refundedOrCancelledAmount,
         COALESCE(AVG(CASE WHEN o.status NOT IN ('REJECTED', 'CANCELLED') AND o.payment_status != 'REFUNDED' THEN o.total_amount END), 0) AS avgOrderValue
       FROM orders o
       WHERE o.customer_id = ? ${periodWhere}`,
      periodParams
    );

    // 2. Current Month vs Previous Month Comparison
    const [monthComparison] = await queryRows<RowDataPacket[]>(
      `SELECT
         COALESCE(SUM(CASE WHEN DATE_FORMAT(created_at, '%Y-%m') = ? AND status NOT IN ('REJECTED', 'CANCELLED') AND payment_status != 'REFUNDED' THEN total_amount ELSE 0 END), 0) AS currentMonthSpent,
         COALESCE(SUM(CASE WHEN DATE_FORMAT(created_at, '%Y-%m') = ? AND status NOT IN ('REJECTED', 'CANCELLED') AND payment_status != 'REFUNDED' THEN total_amount ELSE 0 END), 0) AS previousMonthSpent,
         COALESCE(SUM(CASE WHEN status NOT IN ('REJECTED', 'CANCELLED') AND payment_status != 'REFUNDED' THEN total_amount ELSE 0 END), 0) AS allTimeSpent,
         COUNT(CASE WHEN status NOT IN ('REJECTED', 'CANCELLED') THEN 1 END) AS allTimeOrders
       FROM orders
       WHERE customer_id = ?`,
      [currentMonth, previousMonth, customerId]
    );

    // 3. Daily Spending Breakdown for selected period
    const dailyBreakdown = await queryRows<RowDataPacket[]>(
      `SELECT
         DATE_FORMAT(o.created_at, '%Y-%m-%d') AS date,
         COUNT(*) AS orders,
         COALESCE(SUM(CASE WHEN o.status NOT IN ('REJECTED', 'CANCELLED') AND o.payment_status != 'REFUNDED' THEN o.total_amount ELSE 0 END), 0) AS amount
       FROM orders o
       WHERE o.customer_id = ? ${periodWhere}
       GROUP BY DATE_FORMAT(o.created_at, '%Y-%m-%d')
       ORDER BY date ASC`,
      periodParams
    );

    // 4. Weekly Spending Breakdown (last 8 weeks)
    const weeklyBreakdown = await queryRows<RowDataPacket[]>(
      `SELECT
         DATE_FORMAT(DATE_SUB(DATE(created_at), INTERVAL WEEKDAY(created_at) DAY), '%Y-%m-%d') AS weekStart,
         COUNT(*) AS orders,
         COALESCE(SUM(CASE WHEN status NOT IN ('REJECTED', 'CANCELLED') AND payment_status != 'REFUNDED' THEN total_amount ELSE 0 END), 0) AS amount
       FROM orders
       WHERE customer_id = ?
       GROUP BY weekStart
       ORDER BY weekStart DESC
       LIMIT 8`,
      [customerId]
    );

    // 5. Monthly Spending History (last 12 months) + Historical Budgets
    const monthlyHistoryRows = await queryRows<RowDataPacket[]>(
      `SELECT
         DATE_FORMAT(o.created_at, '%Y-%m') AS monthYear,
         COUNT(*) AS orders,
         COALESCE(SUM(CASE WHEN o.status NOT IN ('REJECTED', 'CANCELLED') AND o.payment_status != 'REFUNDED' THEN o.total_amount ELSE 0 END), 0) AS spent
       FROM orders o
       WHERE o.customer_id = ?
       GROUP BY monthYear
       ORDER BY monthYear DESC
       LIMIT 12`,
      [customerId]
    );

    const userBudgets = await queryRows<RowDataPacket[]>(
      "SELECT * FROM customer_budgets WHERE user_id = ? ORDER BY month_year DESC LIMIT 12",
      [customerId]
    );
    const [userPref] = await queryRows<RowDataPacket[]>(
      "SELECT * FROM customer_preferences WHERE user_id = ? LIMIT 1",
      [customerId]
    );

    const budgetByMonth = new Map<string, RowDataPacket>();
    for (const b of userBudgets) {
      budgetByMonth.set(String(b.month_year), b);
    }

    const defaultLimit = Number(userPref?.default_monthly_budget ?? 3000);
    const defaultThreshold = Number(
      userPref?.default_alert_threshold_pct ?? 75
    );
    const defaultRestrict = Number(userPref?.restrict_spending ?? 0) === 1;
    const defaultEnabled =
      userPref !== undefined ? Number(userPref.budget_enabled) === 1 : true;

    const targetMonthBudgetRow = budgetByMonth.get(requestedMonth);
    const monthlyLimit = Number(
      targetMonthBudgetRow?.monthly_limit ?? defaultLimit
    );
    const alertThresholdPct = Number(
      targetMonthBudgetRow?.alert_threshold_pct ?? defaultThreshold
    );
    const restrictSpending =
      targetMonthBudgetRow !== undefined
        ? Number(targetMonthBudgetRow.restrict_spending) === 1
        : defaultRestrict;
    const isEnabled =
      targetMonthBudgetRow !== undefined
        ? Number(targetMonthBudgetRow.is_enabled) === 1
        : defaultEnabled;

    const selectedPeriodSpent = Number(periodSummary?.netSpent || 0);
    const remainingBudget = Number(
      Math.max(0, monthlyLimit - selectedPeriodSpent).toFixed(2)
    );
    const consumedPct =
      monthlyLimit > 0
        ? Number(((selectedPeriodSpent / monthlyLimit) * 100).toFixed(2))
        : 0;

    let alertLevel: "NORMAL" | "APPROACHING_LIMIT" | "LIMIT_REACHED" = "NORMAL";
    if (isEnabled && monthlyLimit > 0) {
      if (consumedPct >= 100) {
        alertLevel = "LIMIT_REACHED";
      } else if (consumedPct >= alertThresholdPct) {
        alertLevel = "APPROACHING_LIMIT";
      }
    }

    // 6. Most Frequently Ordered Dishes
    const topDishes = await queryRows<RowDataPacket[]>(
      `SELECT
         oi.menu_item_id AS menuItemId,
         oi.item_name_snapshot AS name,
         SUM(oi.quantity) AS totalQuantity,
         COUNT(DISTINCT oi.order_id) AS orderCount,
         COALESCE(SUM(oi.line_total), 0) AS totalSpent
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.customer_id = ?
         AND o.status NOT IN ('REJECTED', 'CANCELLED')
         AND o.payment_status != 'REFUNDED'
         ${periodWhere}
       GROUP BY oi.menu_item_id, oi.item_name_snapshot
       ORDER BY totalQuantity DESC, totalSpent DESC
       LIMIT 6`,
      periodParams
    );

    // 7. Most Frequently Visited Establishments
    const establishmentSpending = await queryRows<RowDataPacket[]>(
      `SELECT
         o.canteen_id AS canteenId,
         o.canteen_name_snapshot AS name,
         COUNT(*) AS orders,
         COALESCE(SUM(o.total_amount), 0) AS amount
       FROM orders o
       WHERE o.customer_id = ?
         AND o.status NOT IN ('REJECTED', 'CANCELLED')
         AND o.payment_status != 'REFUNDED'
         ${periodWhere}
       GROUP BY o.canteen_id, o.canteen_name_snapshot
       ORDER BY amount DESC, orders DESC`,
      periodParams
    );

    // 8. Category-Wise Spending
    const categorySpending = await queryRows<RowDataPacket[]>(
      `SELECT
         COALESCE(mc.name, 'General') AS name,
         SUM(oi.quantity) AS itemsOrdered,
         COALESCE(SUM(oi.line_total), 0) AS amount
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN menu_categories mc ON mc.id = mi.category_id
       WHERE o.customer_id = ?
         AND o.status NOT IN ('REJECTED', 'CANCELLED')
         AND o.payment_status != 'REFUNDED'
         ${periodWhere}
       GROUP BY COALESCE(mc.name, 'General')
       ORDER BY amount DESC`,
      periodParams
    );

    // 9. Payment-Method Breakdown
    const paymentMethodBreakdown = await queryRows<RowDataPacket[]>(
      `SELECT
         o.payment_method AS method,
         COUNT(*) AS orders,
         COALESCE(SUM(o.total_amount), 0) AS amount
       FROM orders o
       WHERE o.customer_id = ?
         AND o.status NOT IN ('REJECTED', 'CANCELLED')
         AND o.payment_status != 'REFUNDED'
         ${periodWhere}
       GROUP BY o.payment_method
       ORDER BY amount DESC`,
      periodParams
    );

    const monthlyHistory = monthlyHistoryRows.map((m) => {
      const b = budgetByMonth.get(String(m.monthYear));
      const limit = Number(b?.monthly_limit ?? defaultLimit);
      const spent = Number(m.spent || 0);
      return {
        monthYear: m.monthYear,
        orders: Number(m.orders || 0),
        spent,
        budgetLimit: limit,
        remaining: Number(Math.max(0, limit - spent).toFixed(2)),
        consumedPct:
          limit > 0 ? Number(((spent / limit) * 100).toFixed(2)) : 0,
      };
    });

    res.json({
      success: true,
      data: {
        period: {
          requestedMonth,
          currentMonth,
          previousMonth,
          startDate,
          endDate,
        },
        summary: {
          selectedPeriodSpent,
          selectedPeriodOrders: Number(
            periodSummary?.activeOrCompletedOrders || 0
          ),
          totalOrdersIncludingCancelled: Number(
            periodSummary?.totalOrders || 0
          ),
          totalTax: Number(periodSummary?.totalTax || 0),
          refundedOrCancelledAmount: Number(
            periodSummary?.refundedOrCancelledAmount || 0
          ),
          avgOrderValue: Number(
            Number(periodSummary?.avgOrderValue || 0).toFixed(2)
          ),
          currentMonthSpent: Number(monthComparison?.currentMonthSpent || 0),
          previousMonthSpent: Number(monthComparison?.previousMonthSpent || 0),
          allTimeSpent: Number(monthComparison?.allTimeSpent || 0),
          allTimeOrders: Number(monthComparison?.allTimeOrders || 0),
        },
        budget: {
          monthYear: requestedMonth,
          monthlyLimit,
          spent: selectedPeriodSpent,
          remaining: remainingBudget,
          consumedPct,
          alertThresholdPct,
          restrictSpending,
          isEnabled,
          alertLevel,
        },
        preferences: {
          dietaryType: userPref?.dietary_type || "VEG",
          spiceLevel: Number(userPref?.spice_level ?? 3),
          allergies: userPref?.allergies || "",
        },
        dailyBreakdown,
        weeklyBreakdown: [...weeklyBreakdown].reverse(),
        monthlyHistory: [...monthlyHistory].reverse(),
        topDishes,
        establishmentSpending,
        categorySpending,
        paymentMethodBreakdown,
      },
    });
  }
);

router.put(
  "/customer/budget",
  authenticateV2,
  requireV2Role("CUSTOMER"),
  async (req: Request, res: Response) => {
    const customerId = req.user!.id;
    const nowMonth = new Date().toISOString().slice(0, 7);
    const {
      monthYear = nowMonth,
      monthlyLimit,
      alertThresholdPct = 75,
      restrictSpending = false,
      isEnabled = true,
      dietaryType,
      spiceLevel,
      allergies,
    } = req.body as {
      monthYear?: string;
      monthlyLimit?: number;
      alertThresholdPct?: number;
      restrictSpending?: boolean;
      isEnabled?: boolean;
      dietaryType?: "VEG" | "NON_VEG" | "VEGAN" | "EGG";
      spiceLevel?: number | string;
      allergies?: string;
    };

    const limitNum = Number(monthlyLimit ?? 3000);
    if (Number.isNaN(limitNum) || limitNum < 0 || limitNum > 500000) {
      res.status(400).json({
        success: false,
        error: "Monthly budget limit must be between ₹0 and ₹5,00,000.",
      });
      return;
    }

    const validThresholds = [50, 75, 90, 100];
    const thresholdNum = validThresholds.includes(Number(alertThresholdPct))
      ? Number(alertThresholdPct)
      : 75;
    const cleanMonth = String(monthYear || nowMonth).slice(0, 7);

    await execQuery(
      `INSERT INTO customer_budgets
       (id, user_id, month_year, monthly_limit, alert_threshold_pct, restrict_spending, is_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         monthly_limit = VALUES(monthly_limit),
         alert_threshold_pct = VALUES(alert_threshold_pct),
         restrict_spending = VALUES(restrict_spending),
         is_enabled = VALUES(is_enabled)`,
      [
        crypto.randomUUID(),
        customerId,
        cleanMonth,
        limitNum,
        thresholdNum,
        restrictSpending ? 1 : 0,
        isEnabled ? 1 : 0,
      ]
    );

    const spiceMap: Record<string, number> = {
      MILD: 1,
      LOW: 2,
      MEDIUM: 3,
      HIGH: 4,
      EXTRA_HOT: 5,
    };
    const parsedSpice =
      spiceLevel === undefined || spiceLevel === null
        ? null
        : typeof spiceLevel === "string" && spiceMap[spiceLevel.toUpperCase()]
          ? spiceMap[spiceLevel.toUpperCase()]
          : !Number.isNaN(Number(spiceLevel))
            ? Number(spiceLevel)
            : 3;

    await execQuery(
      `INSERT INTO customer_preferences
       (user_id, dietary_type, spice_level, allergies, default_monthly_budget, default_alert_threshold_pct, restrict_spending, budget_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         dietary_type = COALESCE(?, dietary_type),
         spice_level = COALESCE(?, spice_level),
         allergies = COALESCE(?, allergies),
         default_monthly_budget = VALUES(default_monthly_budget),
         default_alert_threshold_pct = VALUES(default_alert_threshold_pct),
         restrict_spending = VALUES(restrict_spending),
         budget_enabled = VALUES(budget_enabled)`,
      [
        customerId,
        dietaryType || "VEG",
        parsedSpice ?? 3,
        allergies ?? null,
        limitNum,
        thresholdNum,
        restrictSpending ? 1 : 0,
        isEnabled ? 1 : 0,
        dietaryType ?? null,
        parsedSpice,
        allergies !== undefined ? allergies : null,
      ]
    );

    res.json({
      success: true,
      message: "Monthly spending limit and dining preferences saved.",
      data: {
        monthYear: cleanMonth,
        monthlyLimit: limitNum,
        alertThresholdPct: thresholdNum,
        restrictSpending: Boolean(restrictSpending),
        isEnabled: Boolean(isEnabled),
      },
    });
  }
);

// ── 12. Cross-Establishment Price Comparison (V1 Feature Migration) ─────────
router.get(
  "/public/menu/compare",
  async (req: Request, res: Response) => {
    const q = String(req.query.q || "").trim();
    const params: unknown[] = [];
    let filterSql = "";
    if (q) {
      filterSql = "AND (mi.name LIKE ? OR mc.name LIKE ?)";
      params.push(`%${q}%`, `%${q}%`);
    }

    const items = await queryRows<RowDataPacket[]>(
      `SELECT
         mi.id,
         mi.canteen_id,
         mi.category_id,
         mi.name,
         mi.description,
         mi.price,
         mi.dietary_type,
         mi.preparation_time,
         mi.stock_quantity,
         mi.is_available,
         mi.image_url,
         mi.avg_rating,
         mi.total_reviews,
         c.name AS canteen_name,
         c.location AS canteen_location,
         mc.name AS category_name
       FROM menu_items mi
       JOIN canteens c ON c.id = mi.canteen_id
       LEFT JOIN menu_categories mc ON mc.id = mi.category_id
       WHERE mi.is_deleted = 0 AND c.status = 'ACTIVE' AND c.is_deleted = 0
         ${filterSql}
       ORDER BY mi.price ASC, mi.avg_rating DESC
       LIMIT 30`,
      params
    );

    res.json({
      success: true,
      data: items,
    });
  }
);

export default router;
