import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";
import { execQuery, queryRows, withTransaction } from "../config/db.js";
import { authenticateV2, requireV2Role } from "../middleware/auth.js";
import { ioV2 } from "../sockets/index.js";

const router = Router();

router.use(authenticateV2, requireV2Role("ADMIN"));

const establishmentSchema = z.object({
  name: z.string().min(2).max(160),
  type: z
    .enum(["CANTEEN", "CAFE", "FOOD_STALL", "RESTAURANT"])
    .default("CANTEEN"),
  description: z.string().max(1000).optional().nullable(),
  logoUrl: z.string().max(500).optional().nullable(),
  coverImageUrl: z.string().max(500).optional().nullable(),
  contactEmail: z.string().email().optional().nullable().or(z.literal("")),
  contactPhone: z.string().max(40).optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  openingTime: z.string().default("08:00"),
  closingTime: z.string().default("20:00"),
  managerId: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "SUSPENDED", "ARCHIVED"]).default("ACTIVE"),
});

const createManagerSchema = z.object({
  fullName: z.string().min(2).max(160),
  email: z.string().email(),
  phone: z.string().max(30).optional().nullable(),
  password: z.string().min(8).max(128),
  canteenId: z.string().min(1),
});

// ── 1. Platform Overview & Real MySQL Intelligence Analytics (Section 9) ────
router.get("/overview", async (req: Request, res: Response) => {
  const startDate = req.query.startDate ? String(req.query.startDate) : null;
  const endDate = req.query.endDate ? String(req.query.endDate) : null;
  const canteenFilter = req.query.canteenId ? String(req.query.canteenId) : null;

  let orderWhere = "WHERE 1=1";
  const orderParams: unknown[] = [];
  if (startDate && endDate) {
    orderWhere += " AND DATE(o.created_at) >= ? AND DATE(o.created_at) <= ?";
    orderParams.push(startDate, endDate);
  }
  if (canteenFilter && canteenFilter !== "ALL") {
    orderWhere += " AND o.canteen_id = ?";
    orderParams.push(canteenFilter);
  }

  const [canteenStats] = await queryRows<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS totalEstablishments,
       SUM(CASE WHEN status = 'ACTIVE' AND is_deleted = 0 THEN 1 ELSE 0 END) AS activeEstablishments,
       SUM(CASE WHEN status = 'SUSPENDED' AND is_deleted = 0 THEN 1 ELSE 0 END) AS suspendedEstablishments,
       SUM(CASE WHEN status = 'ARCHIVED' OR is_deleted = 1 THEN 1 ELSE 0 END) AS archivedEstablishments
     FROM canteens`
  );

  const [userStats] = await queryRows<RowDataPacket[]>(
    `SELECT
       SUM(CASE WHEN r.name = 'CUSTOMER' THEN 1 ELSE 0 END) AS totalCustomers,
       SUM(CASE WHEN r.name = 'CUSTOMER' AND u.status = 'ACTIVE' THEN 1 ELSE 0 END) AS activeCustomers,
       SUM(CASE WHEN r.name = 'CUSTOMER' AND u.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS newCustomers30d,
       SUM(CASE WHEN r.name = 'MANAGER' THEN 1 ELSE 0 END) AS totalManagers
     FROM users u
     JOIN roles r ON r.id = u.role_id`
  );

  const [orderStats] = await queryRows<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS totalOrders,
       COALESCE(SUM(CASE WHEN o.status NOT IN ('REJECTED', 'CANCELLED') THEN o.total_amount ELSE 0 END), 0) AS totalRevenue,
       COALESCE(SUM(CASE WHEN DATE(o.created_at) = CURDATE() AND o.status NOT IN ('REJECTED', 'CANCELLED') THEN o.total_amount ELSE 0 END), 0) AS dailyRevenue,
       COALESCE(SUM(CASE WHEN o.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND o.status NOT IN ('REJECTED', 'CANCELLED') THEN o.total_amount ELSE 0 END), 0) AS weeklyRevenue,
       COALESCE(SUM(CASE WHEN DATE_FORMAT(o.created_at, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m') AND o.status NOT IN ('REJECTED', 'CANCELLED') THEN o.total_amount ELSE 0 END), 0) AS monthlyRevenue,
       COALESCE(SUM(CASE WHEN YEAR(o.created_at) = YEAR(CURDATE()) AND o.status NOT IN ('REJECTED', 'CANCELLED') THEN o.total_amount ELSE 0 END), 0) AS annualRevenue,
       COALESCE(AVG(CASE WHEN o.status NOT IN ('REJECTED', 'CANCELLED') THEN o.total_amount END), 0) AS avgOrderValue,
       SUM(CASE WHEN o.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completedOrders,
       SUM(CASE WHEN o.status IN ('PLACED', 'ACCEPTED', 'PREPARING', 'READY') THEN 1 ELSE 0 END) AS activeOrders,
       SUM(CASE WHEN o.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelledOrders,
       SUM(CASE WHEN o.status = 'REJECTED' THEN 1 ELSE 0 END) AS rejectedOrders,
       COALESCE(SUM(CASE WHEN o.payment_status = 'REFUNDED' THEN o.total_amount ELSE 0 END), 0) AS refundedAmount,
       SUM(CASE WHEN o.payment_status = 'REFUNDED' THEN 1 ELSE 0 END) AS refundCount,
       COALESCE(AVG(CASE WHEN o.status = 'COMPLETED' THEN TIMESTAMPDIFF(MINUTE, o.created_at, o.updated_at) END), 0) AS avgCompletionMinutes
     FROM orders o
     ${orderWhere}`,
    orderParams
  );

  const [menuStats] = await queryRows<RowDataPacket[]>(
    "SELECT COUNT(*) AS totalMenuItems FROM menu_items WHERE is_deleted = 0"
  );

  const [lowStockStats] = await queryRows<RowDataPacket[]>(
    "SELECT COUNT(*) AS lowStockCount FROM inventory WHERE quantity <= min_threshold"
  );

  const [walletStats] = await queryRows<RowDataPacket[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) AS totalTopups,
       COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) AS totalWalletPurchases,
       COALESCE(SUM(CASE WHEN entry_type = 'REFUND' THEN amount ELSE 0 END), 0) AS totalWalletRefunds
     FROM wallet_ledger`
  );

  // Returning customers count (customers with >= 2 orders)
  const [retentionStats] = await queryRows<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS orderingCustomers,
       SUM(CASE WHEN cnt >= 2 THEN 1 ELSE 0 END) AS returningCustomers,
       COALESCE(AVG(spent), 0) AS avgCustomerSpend
     FROM (
       SELECT customer_id, COUNT(*) AS cnt,
              SUM(CASE WHEN status NOT IN ('REJECTED', 'CANCELLED') THEN total_amount ELSE 0 END) AS spent
       FROM orders
       GROUP BY customer_id
     ) t`
  );

  // Establishment Performance Comparison
  const establishmentPerformance = await queryRows<RowDataPacket[]>(
    `SELECT
       c.id, c.name, c.type, c.status, c.is_deleted, c.location, c.crowd_level, c.crowd_count,
       COUNT(DISTINCT CASE WHEN mi.is_deleted = 0 THEN mi.id END) AS menuItemCount,
       COUNT(DISTINCT o.id) AS totalOrders,
       COALESCE(SUM(CASE WHEN o.status NOT IN ('REJECTED', 'CANCELLED') THEN o.total_amount ELSE 0 END), 0) AS revenue,
       COALESCE(AVG(CASE WHEN o.status NOT IN ('REJECTED', 'CANCELLED') THEN o.total_amount END), 0) AS avgOrderValue,
       COALESCE(AVG(mi.avg_rating), 0) AS avgRating
     FROM canteens c
     LEFT JOIN menu_items mi ON mi.canteen_id = c.id
     LEFT JOIN orders o ON o.canteen_id = c.id
     GROUP BY c.id
     ORDER BY revenue DESC, c.created_at DESC`
  );

  // Financial Revenue Trends (Daily)
  const financialTrends = await queryRows<RowDataPacket[]>(
    `SELECT
       DATE_FORMAT(o.created_at, '%Y-%m-%d') AS date,
       COUNT(*) AS orders,
       COALESCE(SUM(CASE WHEN o.status NOT IN ('REJECTED', 'CANCELLED') THEN o.total_amount ELSE 0 END), 0) AS revenue
     FROM orders o
     ${orderWhere}
     GROUP BY DATE_FORMAT(o.created_at, '%Y-%m-%d')
     ORDER BY date DESC
     LIMIT 14`,
    orderParams
  );

  // Payment Method Breakdown
  const paymentMethodBreakdown = await queryRows<RowDataPacket[]>(
    `SELECT
       o.payment_method AS method,
       COUNT(*) AS orders,
       COALESCE(SUM(CASE WHEN o.status NOT IN ('REJECTED', 'CANCELLED') THEN o.total_amount ELSE 0 END), 0) AS revenue
     FROM orders o
     ${orderWhere}
     GROUP BY o.payment_method
     ORDER BY revenue DESC`,
    orderParams
  );

  // Peak Ordering Hours across Campus
  const peakHours = await queryRows<RowDataPacket[]>(
    `SELECT
       CONCAT(LPAD(HOUR(o.created_at), 2, '0'), ':00') AS hour,
       COUNT(*) AS orders,
       COALESCE(SUM(CASE WHEN o.status NOT IN ('REJECTED', 'CANCELLED') THEN o.total_amount ELSE 0 END), 0) AS revenue
     FROM orders o
     ${orderWhere}
     GROUP BY hour
     ORDER BY hour ASC`,
    orderParams
  );

  const totalOrdersCount = Number(orderStats?.totalOrders || 0);
  const cancelledCount = Number(orderStats?.cancelledOrders || 0);
  const rejectedCount = Number(orderStats?.rejectedOrders || 0);
  const orderingCusts = Number(retentionStats?.orderingCustomers || 0);
  const returningCusts = Number(retentionStats?.returningCustomers || 0);

  res.json({
    success: true,
    data: {
      summary: {
        totalEstablishments: Number(canteenStats?.totalEstablishments || 0),
        activeEstablishments: Number(canteenStats?.activeEstablishments || 0),
        suspendedEstablishments: Number(
          canteenStats?.suspendedEstablishments || 0
        ),
        archivedEstablishments: Number(
          canteenStats?.archivedEstablishments || 0
        ),
        totalCustomers: Number(userStats?.totalCustomers || 0),
        activeCustomers: Number(userStats?.activeCustomers || 0),
        newCustomers30d: Number(userStats?.newCustomers30d || 0),
        orderingCustomers: orderingCusts,
        returningCustomers: returningCusts,
        retentionRatePct:
          orderingCusts > 0
            ? Number(((returningCusts / orderingCusts) * 100).toFixed(1))
            : 0,
        avgCustomerSpend: Number(
          Number(retentionStats?.avgCustomerSpend || 0).toFixed(2)
        ),
        totalManagers: Number(userStats?.totalManagers || 0),
        totalOrders: totalOrdersCount,
        activeOrders: Number(orderStats?.activeOrders || 0),
        completedOrders: Number(orderStats?.completedOrders || 0),
        cancelledOrders: cancelledCount,
        rejectedOrders: rejectedCount,
        cancellationRatePct:
          totalOrdersCount > 0
            ? Number(((cancelledCount / totalOrdersCount) * 100).toFixed(1))
            : 0,
        rejectionRatePct:
          totalOrdersCount > 0
            ? Number(((rejectedCount / totalOrdersCount) * 100).toFixed(1))
            : 0,
        totalRevenue: Number(orderStats?.totalRevenue || 0),
        dailyRevenue: Number(orderStats?.dailyRevenue || 0),
        weeklyRevenue: Number(orderStats?.weeklyRevenue || 0),
        monthlyRevenue: Number(orderStats?.monthlyRevenue || 0),
        annualRevenue: Number(orderStats?.annualRevenue || 0),
        avgOrderValue: Number(Number(orderStats?.avgOrderValue || 0).toFixed(2)),
        averageOrderValue: Number(
          Number(orderStats?.avgOrderValue || 0).toFixed(2)
        ),
        refundedAmount: Number(orderStats?.refundedAmount || 0),
        refundCount: Number(orderStats?.refundCount || 0),
        avgCompletionMinutes: Number(
          Number(orderStats?.avgCompletionMinutes || 10).toFixed(1)
        ),
        totalMenuItems: Number(menuStats?.totalMenuItems || 0),
        lowStockAlertsCount: Number(lowStockStats?.lowStockCount || 0),
        walletTopupsTotal: Number(walletStats?.totalTopups || 0),
        walletTopUpsTotal: Number(walletStats?.totalTopups || 0),
        walletPurchasesTotal: Number(walletStats?.totalWalletPurchases || 0),
        walletRefundsTotal: Number(walletStats?.totalWalletRefunds || 0),
      },
      establishmentPerformance,
      establishmentBreakdown: establishmentPerformance.map((e) => ({
        ...e,
        order_count: Number(e.totalOrders || 0),
      })),
      financialTrends: [...financialTrends].reverse(),
      financialTrend: [...financialTrends]
        .reverse()
        .map((f) => ({ ...f, day: f.date })),
      paymentMethodBreakdown,
      peakHours,
    },
  });
});

// ── 2. List All Establishments (Phase 11.1) ─────────────────────────────────
router.get("/establishments", async (_req: Request, res: Response) => {
  const rows = await queryRows<RowDataPacket[]>(
    `SELECT
       c.*,
       u.id AS manager_user_id,
       u.full_name AS manager_name,
       u.email AS manager_email,
       u.phone AS manager_phone,
       (SELECT COUNT(*) FROM menu_items mi WHERE mi.canteen_id = c.id AND mi.is_deleted = 0) AS menu_items_count,
       (SELECT COUNT(*) FROM orders o WHERE o.canteen_id = c.id) AS total_orders,
       (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.canteen_id = c.id AND o.status NOT IN ('REJECTED', 'CANCELLED')) AS total_revenue
     FROM canteens c
     LEFT JOIN canteen_managers cm ON cm.canteen_id = c.id
     LEFT JOIN users u ON u.id = cm.user_id
     ORDER BY c.is_deleted ASC, c.created_at DESC`
  );

  res.json({ success: true, data: rows });
});

// ── 3. Create Establishment (Phase 11.2) ────────────────────────────────────
router.post("/establishments", async (req: Request, res: Response) => {
  const parsed = establishmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: "Validation failed for establishment.",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const d = parsed.data;
  const canteenId = crypto.randomUUID();
  const qrToken = crypto.randomBytes(24).toString("base64url");

  await withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO canteens
       (id, name, type, description, logo_url, cover_image_url, contact_email, contact_phone,
        location, opening_time, closing_time, status, qr_token, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        canteenId,
        d.name.trim(),
        d.type,
        d.description || null,
        d.logoUrl || null,
        d.coverImageUrl || null,
        d.contactEmail || null,
        d.contactPhone || null,
        d.location || null,
        d.openingTime,
        d.closingTime,
        d.status,
        qrToken,
      ]
    );

    if (d.managerId) {
      await conn.execute(
        "DELETE FROM canteen_managers WHERE canteen_id = ? OR user_id = ?",
        [canteenId, d.managerId]
      );
      await conn.execute(
        `INSERT INTO canteen_managers (id, canteen_id, user_id, assigned_by)
         VALUES (?, ?, ?, ?)`,
        [crypto.randomUUID(), canteenId, d.managerId, req.user!.id]
      );
    }

    await conn.execute(
      `INSERT INTO audit_logs
       (id, actor_id, actor_role, canteen_id, entity_type, entity_id, action, new_name, metadata, ip_address)
       VALUES (?, ?, 'ADMIN', ?, 'CANTEEN', ?, 'CREATE_ESTABLISHMENT', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        req.user!.id,
        canteenId,
        canteenId,
        d.name.trim(),
        JSON.stringify({ type: d.type, status: d.status, managerId: d.managerId }),
        req.ip || null,
      ]
    );
  });

  const [created] = await queryRows<RowDataPacket[]>(
    "SELECT * FROM canteens WHERE id = ?",
    [canteenId]
  );

  if (ioV2) {
    ioV2.to("public").emit("establishment:updated", {
      action: "CREATED",
      canteenId,
      establishment: created,
    });
  }

  res.status(201).json({
    success: true,
    message: `Establishment "${d.name.trim()}" created.`,
    data: created,
  });
});

// ── 4. Edit / Rename Any Establishment (Phase 11.3) ─────────────────────────
router.put("/establishments/:id", async (req: Request, res: Response) => {
  const canteenId = String(req.params.id);
  const existingRows = await queryRows<RowDataPacket[]>(
    "SELECT * FROM canteens WHERE id = ? LIMIT 1",
    [canteenId]
  );

  const existing = existingRows[0];
  if (!existing) {
    res.status(404).json({
      success: false,
      error: "Establishment not found.",
    });
    return;
  }

  const parsed = establishmentSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: "Invalid establishment update fields.",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const d = parsed.data;
  const previousName = existing.name as string;
  const nextName = d.name ? d.name.trim() : previousName;

  await withTransaction(async (conn) => {
    await conn.execute(
      `UPDATE canteens
       SET name = ?,
           type = ?,
           description = ?,
           logo_url = ?,
           cover_image_url = ?,
           contact_email = ?,
           contact_phone = ?,
           location = ?,
           opening_time = ?,
           closing_time = ?,
           status = ?
       WHERE id = ?`,
      [
        nextName,
        d.type ?? existing.type,
        d.description !== undefined ? d.description : existing.description,
        d.logoUrl !== undefined ? d.logoUrl : existing.logo_url,
        d.coverImageUrl !== undefined
          ? d.coverImageUrl
          : existing.cover_image_url,
        d.contactEmail !== undefined
          ? d.contactEmail || null
          : existing.contact_email,
        d.contactPhone !== undefined
          ? d.contactPhone
          : existing.contact_phone,
        d.location !== undefined ? d.location : existing.location,
        d.openingTime ?? existing.opening_time,
        d.closingTime ?? existing.closing_time,
        d.status ?? existing.status,
        canteenId,
      ]
    );

    if (d.managerId !== undefined) {
      await conn.execute(
        "DELETE FROM canteen_managers WHERE canteen_id = ?",
        [canteenId]
      );
      if (d.managerId) {
        await conn.execute(
          "DELETE FROM canteen_managers WHERE user_id = ?",
          [d.managerId]
        );
        await conn.execute(
          `INSERT INTO canteen_managers (id, canteen_id, user_id, assigned_by)
           VALUES (?, ?, ?, ?)`,
          [crypto.randomUUID(), canteenId, d.managerId, req.user!.id]
        );
      }
    }

    const actionType =
      previousName !== nextName
        ? "RENAME_ESTABLISHMENT"
        : "UPDATE_ESTABLISHMENT";

    await conn.execute(
      `INSERT INTO audit_logs
       (id, actor_id, actor_role, canteen_id, entity_type, entity_id, action, previous_name, new_name, metadata, ip_address)
       VALUES (?, ?, 'ADMIN', ?, 'CANTEEN', ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        req.user!.id,
        canteenId,
        canteenId,
        actionType,
        previousName,
        nextName,
        JSON.stringify(d),
        req.ip || null,
      ]
    );
  });

  const [updated] = await queryRows<RowDataPacket[]>(
    `SELECT c.*, cm.user_id AS manager_user_id, u.full_name AS manager_name, u.email AS manager_email
     FROM canteens c
     LEFT JOIN canteen_managers cm ON cm.canteen_id = c.id
     LEFT JOIN users u ON u.id = cm.user_id
     WHERE c.id = ?`,
    [canteenId]
  );

  // Immediately broadcast rename/update to all connected Customer, Manager & Admin dashboards
  if (ioV2) {
    ioV2.to("public").emit("establishment:updated", {
      action: previousName !== nextName ? "RENAMED" : "UPDATED",
      canteenId,
      previousName,
      newName: nextName,
      establishment: updated,
    });
    ioV2.to(`establishment:${canteenId}`).emit("establishment:updated", {
      action: previousName !== nextName ? "RENAMED" : "UPDATED",
      canteenId,
      previousName,
      newName: nextName,
      establishment: updated,
    });
  }

  res.json({
    success: true,
    message:
      previousName !== nextName
        ? `Renamed "${previousName}" to "${nextName}".`
        : "Establishment updated.",
    data: updated,
  });
});

// ── 5. Establishment Status Management: Activate / Suspend / Archive (Phase 11.5) ──
router.patch(
  "/establishments/:id/status",
  async (req: Request, res: Response) => {
    const canteenId = String(req.params.id);
    const { status } = req.body as {
      status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
    };

    if (!status || !["ACTIVE", "SUSPENDED", "ARCHIVED"].includes(status)) {
      res.status(400).json({
        success: false,
        error: "Status must be ACTIVE, SUSPENDED, or ARCHIVED.",
      });
      return;
    }

    const existingRows = await queryRows<RowDataPacket[]>(
      "SELECT * FROM canteens WHERE id = ? LIMIT 1",
      [canteenId]
    );
    if (existingRows.length === 0) {
      res.status(404).json({
        success: false,
        error: "Establishment not found.",
      });
      return;
    }

    const prevStatus = existingRows[0].status;
    await execQuery(
      "UPDATE canteens SET status = ?, is_deleted = ? WHERE id = ?",
      [status, status === "ARCHIVED" ? existingRows[0].is_deleted : 0, canteenId]
    );

    if (status === "ARCHIVED") {
      await execQuery(
        "UPDATE menu_items SET is_available = 0 WHERE canteen_id = ?",
        [canteenId]
      );
    }

    await execQuery(
      `INSERT INTO audit_logs
       (id, actor_id, actor_role, canteen_id, entity_type, entity_id, action, previous_name, new_name, metadata, ip_address)
       VALUES (?, ?, 'ADMIN', ?, 'CANTEEN', ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        req.user!.id,
        canteenId,
        canteenId,
        `STATUS_${status}`,
        existingRows[0].name,
        existingRows[0].name,
        JSON.stringify({ previousStatus: prevStatus, newStatus: status }),
        req.ip || null,
      ]
    );

    const [updated] = await queryRows<RowDataPacket[]>(
      "SELECT * FROM canteens WHERE id = ?",
      [canteenId]
    );

    if (ioV2) {
      ioV2.to("public").emit("establishment:updated", {
        action: `STATUS_${status}`,
        canteenId,
        establishment: updated,
      });
      ioV2.to(`establishment:${canteenId}`).emit("establishment:updated", {
        action: `STATUS_${status}`,
        canteenId,
        establishment: updated,
      });
    }

    res.json({
      success: true,
      message: `Establishment status changed to ${status}.`,
      data: updated,
    });
  }
);

// ── 6. Safe Delete Establishment Protecting Financial Records (Phase 11.4) ──
router.delete("/establishments/:id", async (req: Request, res: Response) => {
  const canteenId = String(req.params.id);
  const existingRows = await queryRows<RowDataPacket[]>(
    "SELECT * FROM canteens WHERE id = ? LIMIT 1",
    [canteenId]
  );

  const existing = existingRows[0];
  if (!existing) {
    res.status(404).json({
      success: false,
      error: "Establishment not found.",
    });
    return;
  }

  // Check if historical orders or financial payments exist for this establishment
  const [finHistory] = await queryRows<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM orders WHERE canteen_id = ?) AS orderCount,
       (SELECT COUNT(*) FROM payments WHERE canteen_id = ?) AS paymentCount`,
    [canteenId, canteenId]
  );

  const hasFinancialHistory =
    Number(finHistory?.orderCount || 0) > 0 ||
    Number(finHistory?.paymentCount || 0) > 0;

  if (hasFinancialHistory) {
    // Archive/soft-delete establishment, disable active menu items, preserve orders & payments
    await withTransaction(async (conn) => {
      await conn.execute(
        "UPDATE canteens SET status = 'ARCHIVED', is_deleted = 1 WHERE id = ?",
        [canteenId]
      );
      await conn.execute(
        "UPDATE menu_items SET is_available = 0, is_deleted = 1 WHERE canteen_id = ?",
        [canteenId]
      );
      await conn.execute(
        `INSERT INTO audit_logs
         (id, actor_id, actor_role, canteen_id, entity_type, entity_id, action, previous_name, metadata, ip_address)
         VALUES (?, ?, 'ADMIN', ?, 'CANTEEN', ?, 'SAFE_ARCHIVE_DELETE_WITH_HISTORY', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          req.user!.id,
          canteenId,
          canteenId,
          existing.name,
          JSON.stringify({
            preservedOrders: finHistory.orderCount,
            preservedPayments: finHistory.paymentCount,
          }),
          req.ip || null,
        ]
      );
    });

    if (ioV2) {
      ioV2.to("public").emit("establishment:updated", {
        action: "ARCHIVED_DELETED",
        canteenId,
      });
    }

    res.json({
      success: true,
      deletionMode: "ARCHIVED_PRESERVING_FINANCIAL_HISTORY",
      message: `"${existing.name}" has historical orders/payments and was safely archived and removed from active customer listings while preserving all financial records.`,
    });
    return;
  }

  // No historical orders or payments -> safe permanent deletion
  await withTransaction(async (conn) => {
    await conn.execute("DELETE FROM canteens WHERE id = ?", [canteenId]);
    await conn.execute(
      `INSERT INTO audit_logs
       (id, actor_id, actor_role, canteen_id, entity_type, entity_id, action, previous_name, metadata, ip_address)
       VALUES (?, ?, 'ADMIN', ?, 'CANTEEN', ?, 'PERMANENT_DELETE_ESTABLISHMENT', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        req.user!.id,
        canteenId,
        canteenId,
        existing.name,
        JSON.stringify({ hadFinancialHistory: false }),
        req.ip || null,
      ]
    );
  });

  if (ioV2) {
    ioV2.to("public").emit("establishment:updated", {
      action: "DELETED",
      canteenId,
    });
  }

  res.json({
    success: true,
    deletionMode: "PERMANENT_DELETE",
    message: `"${existing.name}" had no historical transactions and was permanently deleted.`,
  });
});

// ── 7. Manager Management: List, Create & Assign Managers ───────────────────
router.get("/managers", async (_req: Request, res: Response) => {
  const rows = await queryRows<RowDataPacket[]>(
    `SELECT u.id, u.full_name, u.email, u.phone, u.status, u.last_login_at, u.created_at,
            cm.canteen_id, c.name AS canteen_name, c.type AS canteen_type, c.status AS canteen_status
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN canteen_managers cm ON cm.user_id = u.id
     LEFT JOIN canteens c ON c.id = cm.canteen_id
     WHERE r.name = 'MANAGER'
     ORDER BY u.created_at DESC`
  );
  res.json({ success: true, data: rows });
});

router.post("/managers", async (req: Request, res: Response) => {
  const parsed = createManagerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: "Invalid manager account parameters.",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { fullName, email, phone, password, canteenId } = parsed.data;
  const cleanEmail = email.trim().toLowerCase();

  const existing = await queryRows<RowDataPacket[]>(
    "SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1",
    [cleanEmail]
  );
  if (existing.length > 0) {
    res.status(409).json({
      success: false,
      error: "A user with this email already exists.",
    });
    return;
  }

  const canteenRows = await queryRows<RowDataPacket[]>(
    "SELECT id, name FROM canteens WHERE id = ? LIMIT 1",
    [canteenId]
  );
  if (canteenRows.length === 0) {
    res.status(404).json({
      success: false,
      error: "Target establishment not found.",
    });
    return;
  }

  const managerId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);

  await withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO users (id, role_id, full_name, email, phone, password_hash, email_verified, status)
       VALUES (?, 2, ?, ?, ?, ?, 1, 'ACTIVE')`,
      [managerId, fullName.trim(), cleanEmail, phone || null, passwordHash]
    );

    await conn.execute(
      "DELETE FROM canteen_managers WHERE canteen_id = ?",
      [canteenId]
    );

    await conn.execute(
      `INSERT INTO canteen_managers (id, canteen_id, user_id, assigned_by)
       VALUES (?, ?, ?, ?)`,
      [crypto.randomUUID(), canteenId, managerId, req.user!.id]
    );

    await conn.execute(
      `INSERT INTO audit_logs
       (id, actor_id, actor_role, canteen_id, entity_type, entity_id, action, new_name, metadata, ip_address)
       VALUES (?, ?, 'ADMIN', ?, 'MANAGER', ?, 'CREATE_AND_ASSIGN_MANAGER', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        req.user!.id,
        canteenId,
        managerId,
        fullName.trim(),
        JSON.stringify({
          email: cleanEmail,
          canteenId,
          canteenName: canteenRows[0].name,
        }),
        req.ip || null,
      ]
    );
  });

  res.status(201).json({
    success: true,
    message: `Manager "${fullName.trim()}" created and assigned to "${canteenRows[0].name}".`,
    data: {
      id: managerId,
      fullName: fullName.trim(),
      email: cleanEmail,
      canteenId,
      canteenName: canteenRows[0].name,
    },
  });
});

router.patch("/managers/:id/assign", async (req: Request, res: Response) => {
  const managerId = String(req.params.id);
  const { canteenId } = req.body as { canteenId?: string };

  if (!canteenId) {
    res.status(400).json({
      success: false,
      error: "canteenId is required.",
    });
    return;
  }

  await withTransaction(async (conn) => {
    await conn.execute(
      "DELETE FROM canteen_managers WHERE user_id = ? OR canteen_id = ?",
      [managerId, canteenId]
    );
    await conn.execute(
      `INSERT INTO canteen_managers (id, canteen_id, user_id, assigned_by)
       VALUES (?, ?, ?, ?)`,
      [crypto.randomUUID(), canteenId, managerId, req.user!.id]
    );
    await conn.execute(
      `INSERT INTO audit_logs
       (id, actor_id, actor_role, canteen_id, entity_type, entity_id, action, metadata)
       VALUES (?, ?, 'ADMIN', ?, 'MANAGER', ?, 'REASSIGN_MANAGER', ?)`,
      [
        crypto.randomUUID(),
        req.user!.id,
        canteenId,
        managerId,
        JSON.stringify({ managerId, canteenId }),
      ]
    );
  });

  res.json({
    success: true,
    message: "Manager establishment assignment updated.",
  });
});

// ── 8. Customer Management & Account Suspension/Reactivation ────────────────
router.get("/customers", async (req: Request, res: Response) => {
  const search = String(req.query.search || "").trim();
  const params: unknown[] = [];
  let filterSql = "";
  if (search) {
    filterSql = "AND (u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const rows = await queryRows<RowDataPacket[]>(
    `SELECT u.id, u.full_name, u.email, u.phone, u.email_verified, u.phone_verified,
            u.status, u.wallet_balance, u.last_login_at, u.created_at,
            (SELECT COUNT(*) FROM orders o WHERE o.customer_id = u.id) AS total_orders,
            (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.customer_id = u.id AND o.status NOT IN ('REJECTED', 'CANCELLED')) AS total_spent
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.name = 'CUSTOMER' ${filterSql}
     ORDER BY u.created_at DESC`,
    params
  );

  res.json({ success: true, data: rows });
});

router.patch("/users/:id/status", async (req: Request, res: Response) => {
  const targetUserId = String(req.params.id);
  const { status } = req.body as { status?: "ACTIVE" | "SUSPENDED" };

  if (!status || !["ACTIVE", "SUSPENDED"].includes(status)) {
    res.status(400).json({
      success: false,
      error: "Status must be ACTIVE or SUSPENDED.",
    });
    return;
  }

  const rows = await queryRows<RowDataPacket[]>(
    `SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [targetUserId]
  );
  if (rows.length === 0) {
    res.status(404).json({ success: false, error: "User not found." });
    return;
  }
  if (rows[0].role_name === "ADMIN") {
    res.status(400).json({
      success: false,
      error: "Cannot suspend an administrator account.",
    });
    return;
  }

  await execQuery("UPDATE users SET status = ? WHERE id = ?", [
    status,
    targetUserId,
  ]);

  await execQuery(
    `INSERT INTO audit_logs
     (id, actor_id, actor_role, entity_type, entity_id, action, new_name, metadata)
     VALUES (?, ?, 'ADMIN', 'USER', ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      req.user!.id,
      targetUserId,
      `USER_${status}`,
      rows[0].full_name,
      JSON.stringify({ email: rows[0].email, status }),
    ]
  );

  res.json({
    success: true,
    message: `Account "${rows[0].full_name}" is now ${status}.`,
  });
});

// ── 9. Order, Menu, Inventory, Payment Monitoring & Audit Logs ──────────────
router.get("/orders", async (_req: Request, res: Response) => {
  const orders = await queryRows<RowDataPacket[]>(
    `SELECT o.*, u.full_name AS customer_name, u.email AS customer_email, c.name AS current_canteen_name
     FROM orders o
     JOIN users u ON u.id = o.customer_id
     LEFT JOIN canteens c ON c.id = o.canteen_id
     ORDER BY o.created_at DESC LIMIT 100`
  );
  res.json({ success: true, data: orders });
});

router.get("/payments", async (_req: Request, res: Response) => {
  const payments = await queryRows<RowDataPacket[]>(
    `SELECT p.*, u.full_name AS customer_name, o.order_number
     FROM payments p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN orders o ON o.id = p.order_id
     ORDER BY p.created_at DESC LIMIT 100`
  );
  res.json({ success: true, data: payments });
});

router.get("/menu", async (_req: Request, res: Response) => {
  const items = await queryRows<RowDataPacket[]>(
    `SELECT mi.*, c.name AS canteen_name, mc.name AS category_name
     FROM menu_items mi
     JOIN canteens c ON c.id = mi.canteen_id
     LEFT JOIN menu_categories mc ON mc.id = mi.category_id
     WHERE mi.is_deleted = 0
     ORDER BY mi.created_at DESC`
  );
  res.json({ success: true, data: items });
});

router.get("/inventory", async (_req: Request, res: Response) => {
  const items = await queryRows<RowDataPacket[]>(
    `SELECT inv.*, c.name AS canteen_name
     FROM inventory inv
     JOIN canteens c ON c.id = inv.canteen_id
     ORDER BY inv.updated_at DESC`
  );
  res.json({ success: true, data: items });
});

router.get("/audit-logs", async (_req: Request, res: Response) => {
  const logs = await queryRows<RowDataPacket[]>(
    `SELECT a.*, u.full_name AS actor_name, u.email AS actor_email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_id
     ORDER BY a.created_at DESC LIMIT 150`
  );
  res.json({ success: true, data: logs });
});

export default router;
