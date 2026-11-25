import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";
import { execQuery, queryRows, withTransaction } from "../config/db.js";
import { authenticateV2, requireV2Role } from "../middleware/auth.js";
import { ioV2 } from "../sockets/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `food-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`);
  },
});

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      cb(new Error("Only JPEG, PNG, WEBP, and GIF images are allowed."));
      return;
    }
    cb(null, true);
  },
});

const router = Router();
router.use(authenticateV2, requireV2Role("MANAGER"));

function getAssignedCanteenId(req: Request, res: Response): string | null {
  const canteenId = req.user?.canteenId;
  if (!canteenId) {
    res.status(403).json({
      success: false,
      error: "No establishment is assigned to this manager account.",
    });
    return null;
  }
  return canteenId;
}

const categorySchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(300).optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
});

const menuItemSchema = z.object({
  name: z.string().min(2).max(160),
  categoryId: z.string().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  price: z.coerce.number().positive("Price must be greater than zero"),
  dietaryType: z.enum(["VEG", "NON_VEG", "VEGAN", "EGG"]).default("VEG"),
  preparationTime: z.coerce.number().int().min(1).max(180).default(10),
  stockQuantity: z.coerce.number().int().min(0).default(50),
  isAvailable: z.boolean().default(true),
  imageUrl: z.string().max(500).optional().nullable(),
  imageId: z.string().optional().nullable(),
});

const inventoryItemSchema = z.object({
  itemName: z.string().min(2).max(160),
  unit: z.string().min(1).max(30).default("units"),
  quantity: z.coerce.number().min(0).default(0),
  minThreshold: z.coerce.number().min(0).default(5),
  unitCost: z.coerce.number().min(0).default(0),
});

// ── 1. Persistent Food Photograph Upload (MySQL LONGBLOB + Optional Cloudinary + Disk Cache) ──
router.post("/upload", (req: Request, res: Response) => {
  const canteenId = getAssignedCanteenId(req, res);
  if (!canteenId) return;

  upload.single("image")(req, res, async (err) => {
    if (err) {
      res.status(400).json({
        success: false,
        error: (err as Error).message || "File upload failed.",
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        error: "No image file provided.",
      });
      return;
    }

    const imageId = crypto.randomUUID();
    const fileBuffer = fs.existsSync(req.file.path)
      ? fs.readFileSync(req.file.path)
      : null;

    // Default to persistent database-backed media endpoint so images never disappear after container restart
    let publicUrl = `/api/v2/public/media/${imageId}`;
    let storageProvider = "MYSQL_BLOB";

    // Optional Cloudinary object-storage integration when CLOUDINARY_CLOUD_NAME is configured
    const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || "").trim();
    const cloudKey = (process.env.CLOUDINARY_API_KEY || "").trim();
    const cloudSecret = (process.env.CLOUDINARY_API_SECRET || "").trim();

    if (cloudName && cloudKey && cloudSecret && fileBuffer) {
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const folder = "campusbite_menu";
        const sigStr = `folder=${folder}&timestamp=${timestamp}${cloudSecret}`;
        const signature = crypto
          .createHash("sha1")
          .update(sigStr)
          .digest("hex");
        const base64Data = `data:${req.file.mimetype};base64,${fileBuffer.toString("base64")}`;
        const form = new URLSearchParams({
          file: base64Data,
          api_key: cloudKey,
          timestamp: String(timestamp),
          folder,
          signature,
        });
        const cloudRes = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
          { method: "POST", body: form }
        );
        if (cloudRes.ok) {
          const cloudJson = (await cloudRes.json()) as { secure_url?: string };
          if (cloudJson.secure_url) {
            publicUrl = cloudJson.secure_url;
            storageProvider = "CLOUDINARY";
          }
        }
      } catch {
        // Fallback seamlessly to persistent MySQL LONGBLOB media endpoint
      }
    }

    await execQuery(
      `INSERT INTO menu_images
       (id, canteen_id, file_name, file_path, public_url, mime_type, size_bytes, image_data, storage_provider, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        imageId,
        canteenId,
        req.file.filename,
        req.file.path,
        publicUrl,
        req.file.mimetype,
        req.file.size,
        fileBuffer,
        storageProvider,
        req.user!.id,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Food photograph uploaded to persistent storage.",
      data: {
        imageId,
        imageUrl: publicUrl,
        storageProvider,
        fileName: req.file.filename,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      },
    });
  });
});

// ── 2. Categories Management ────────────────────────────────────────────────
router.get("/categories", async (req: Request, res: Response) => {
  const canteenId = getAssignedCanteenId(req, res);
  if (!canteenId) return;

  const rows = await queryRows<RowDataPacket[]>(
    "SELECT * FROM menu_categories WHERE canteen_id = ? ORDER BY sort_order ASC, name ASC",
    [canteenId]
  );
  res.json({ success: true, data: rows });
});

router.post("/categories", async (req: Request, res: Response) => {
  const canteenId = getAssignedCanteenId(req, res);
  if (!canteenId) return;

  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: "Invalid category data.",
    });
    return;
  }

  const id = crypto.randomUUID();
  await execQuery(
    `INSERT INTO menu_categories (id, canteen_id, name, description, sort_order)
     VALUES (?, ?, ?, ?, ?)`,
    [
      id,
      canteenId,
      parsed.data.name.trim(),
      parsed.data.description || null,
      parsed.data.sortOrder,
    ]
  );

  const [created] = await queryRows<RowDataPacket[]>(
    "SELECT * FROM menu_categories WHERE id = ?",
    [id]
  );
  res.status(201).json({
    success: true,
    message: "Category created.",
    data: created,
  });
});

router.put("/categories/:id", async (req: Request, res: Response) => {
  const canteenId = getAssignedCanteenId(req, res);
  if (!canteenId) return;

  const catId = String(req.params.id);
  const rows = await queryRows<RowDataPacket[]>(
    "SELECT * FROM menu_categories WHERE id = ? AND canteen_id = ? LIMIT 1",
    [catId, canteenId]
  );
  if (rows.length === 0) {
    res.status(404).json({
      success: false,
      error: "Category not found in your assigned establishment.",
    });
    return;
  }

  const parsed = categorySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: "Invalid category fields." });
    return;
  }

  await execQuery(
    "UPDATE menu_categories SET name = ?, description = ?, sort_order = ? WHERE id = ?",
    [
      parsed.data.name ? parsed.data.name.trim() : rows[0].name,
      parsed.data.description !== undefined
        ? parsed.data.description
        : rows[0].description,
      parsed.data.sortOrder ?? rows[0].sort_order,
      catId,
    ]
  );

  const [updated] = await queryRows<RowDataPacket[]>(
    "SELECT * FROM menu_categories WHERE id = ?",
    [catId]
  );
  res.json({ success: true, message: "Category updated.", data: updated });
});

// ── 3. Menu Management (Strictly Scoped to Manager's Assigned Establishment) ──
router.get("/menu", async (req: Request, res: Response) => {
  const canteenId = getAssignedCanteenId(req, res);
  if (!canteenId) return;

  const items = await queryRows<RowDataPacket[]>(
    `SELECT mi.*, mc.name AS category_name
     FROM menu_items mi
     LEFT JOIN menu_categories mc ON mc.id = mi.category_id
     WHERE mi.canteen_id = ? AND mi.is_deleted = 0
     ORDER BY mi.created_at DESC`,
    [canteenId]
  );
  res.json({ success: true, data: items });
});

router.post("/menu", async (req: Request, res: Response) => {
  const canteenId = getAssignedCanteenId(req, res);
  if (!canteenId) return;

  const parsed = menuItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: "Validation failed for menu item.",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const d = parsed.data;
  const itemId = crypto.randomUUID();
  const isAvailable = d.isAvailable && d.stockQuantity > 0 ? 1 : 0;

  await withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO menu_items
       (id, canteen_id, category_id, name, description, price, dietary_type,
        preparation_time, stock_quantity, is_available, is_deleted, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        itemId,
        canteenId,
        d.categoryId || null,
        d.name.trim(),
        d.description || null,
        d.price,
        d.dietaryType,
        d.preparationTime,
        d.stockQuantity,
        isAvailable,
        d.imageUrl || null,
      ]
    );

    if (d.imageId) {
      await conn.execute(
        "UPDATE menu_images SET menu_item_id = ? WHERE id = ? AND canteen_id = ?",
        [itemId, d.imageId, canteenId]
      );
    }

    await conn.execute(
      `INSERT INTO audit_logs
       (id, actor_id, actor_role, canteen_id, entity_type, entity_id, action, new_name, metadata)
       VALUES (?, ?, 'MANAGER', ?, 'MENU_ITEM', ?, 'CREATE_MENU_ITEM', ?, ?)`,
      [
        crypto.randomUUID(),
        req.user!.id,
        canteenId,
        itemId,
        d.name.trim(),
        JSON.stringify({ price: d.price, stockQuantity: d.stockQuantity }),
      ]
    );
  });

  const [created] = await queryRows<RowDataPacket[]>(
    `SELECT mi.*, mc.name AS category_name
     FROM menu_items mi
     LEFT JOIN menu_categories mc ON mc.id = mi.category_id
     WHERE mi.id = ?`,
    [itemId]
  );

  if (ioV2) {
    ioV2.to("public").emit("menu:updated", {
      action: "CREATED",
      canteenId,
      item: created,
    });
  }

  res.status(201).json({
    success: true,
    message: `Added "${d.name.trim()}" to menu.`,
    data: created,
  });
});

router.put("/menu/:id", async (req: Request, res: Response) => {
  const canteenId = getAssignedCanteenId(req, res);
  if (!canteenId) return;

  const itemId = String(req.params.id);
  const existingRows = await queryRows<RowDataPacket[]>(
    "SELECT * FROM menu_items WHERE id = ? AND is_deleted = 0 LIMIT 1",
    [itemId]
  );

  const existing = existingRows[0];
  if (!existing) {
    res.status(404).json({ success: false, error: "Menu item not found." });
    return;
  }

  if (existing.canteen_id !== canteenId) {
    res.status(403).json({
      success: false,
      error: "Unauthorized: You cannot modify menu items belonging to another establishment.",
    });
    return;
  }

  const parsed = menuItemSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: "Invalid menu item update fields.",
    });
    return;
  }

  const d = parsed.data;
  const nextStock =
    d.stockQuantity !== undefined ? d.stockQuantity : existing.stock_quantity;
  const nextAvail =
    d.isAvailable !== undefined
      ? d.isAvailable && nextStock > 0
        ? 1
        : 0
      : existing.is_available;

  await execQuery(
    `UPDATE menu_items
     SET name = ?,
         category_id = ?,
         description = ?,
         price = ?,
         dietary_type = ?,
         preparation_time = ?,
         stock_quantity = ?,
         is_available = ?,
         image_url = ?
     WHERE id = ?`,
    [
      d.name ? d.name.trim() : existing.name,
      d.categoryId !== undefined ? d.categoryId || null : existing.category_id,
      d.description !== undefined ? d.description : existing.description,
      d.price ?? existing.price,
      d.dietaryType ?? existing.dietary_type,
      d.preparationTime ?? existing.preparation_time,
      nextStock,
      nextAvail,
      d.imageUrl !== undefined ? d.imageUrl : existing.image_url,
      itemId,
    ]
  );

  const [updated] = await queryRows<RowDataPacket[]>(
    `SELECT mi.*, mc.name AS category_name
     FROM menu_items mi
     LEFT JOIN menu_categories mc ON mc.id = mi.category_id
     WHERE mi.id = ?`,
    [itemId]
  );

  if (ioV2) {
    ioV2.to("public").emit("menu:updated", {
      action: "UPDATED",
      canteenId,
      item: updated,
    });
  }

  res.json({
    success: true,
    message: "Menu item updated.",
    data: updated,
  });
});

router.patch("/menu/:id/availability", async (req: Request, res: Response) => {
  const canteenId = getAssignedCanteenId(req, res);
  if (!canteenId) return;

  const itemId = String(req.params.id);
  const existingRows = await queryRows<RowDataPacket[]>(
    "SELECT * FROM menu_items WHERE id = ? AND is_deleted = 0 LIMIT 1",
    [itemId]
  );
  if (existingRows.length === 0) {
    res.status(404).json({ success: false, error: "Menu item not found." });
    return;
  }
  if (existingRows[0].canteen_id !== canteenId) {
    res.status(403).json({
      success: false,
      error: "Unauthorized establishment access.",
    });
    return;
  }

  const { isAvailable } = req.body as { isAvailable: boolean };
  await execQuery("UPDATE menu_items SET is_available = ? WHERE id = ?", [
    isAvailable ? 1 : 0,
    itemId,
  ]);

  const [updated] = await queryRows<RowDataPacket[]>(
    "SELECT * FROM menu_items WHERE id = ?",
    [itemId]
  );

  if (ioV2) {
    ioV2.to("public").emit("menu:updated", {
      action: "AVAILABILITY_CHANGED",
      canteenId,
      item: updated,
    });
  }

  res.json({
    success: true,
    message: `Item marked ${isAvailable ? "Available" : "Sold Out"}.`,
    data: updated,
  });
});

router.delete("/menu/:id", async (req: Request, res: Response) => {
  const canteenId = getAssignedCanteenId(req, res);
  if (!canteenId) return;

  const itemId = String(req.params.id);
  const existingRows = await queryRows<RowDataPacket[]>(
    "SELECT * FROM menu_items WHERE id = ? AND is_deleted = 0 LIMIT 1",
    [itemId]
  );
  if (existingRows.length === 0) {
    res.status(404).json({ success: false, error: "Menu item not found." });
    return;
  }
  if (existingRows[0].canteen_id !== canteenId) {
    res.status(403).json({
      success: false,
      error: "Unauthorized establishment access.",
    });
    return;
  }

  await execQuery(
    "UPDATE menu_items SET is_deleted = 1, is_available = 0 WHERE id = ?",
    [itemId]
  );

  if (ioV2) {
    ioV2.to("public").emit("menu:updated", {
      action: "DELETED",
      canteenId,
      itemId,
    });
  }

  res.json({
    success: true,
    message: "Menu item deleted.",
  });
});

// ── 4. Order Management (Incoming Orders, Accept, Reject with Reason, Prep, Ready, Complete) ──
router.get("/orders", async (req: Request, res: Response) => {
  const canteenId = getAssignedCanteenId(req, res);
  if (!canteenId) return;

  const orders = await queryRows<RowDataPacket[]>(
    `SELECT o.*, u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
     FROM orders o
     JOIN users u ON u.id = o.customer_id
     WHERE o.canteen_id = ?
     ORDER BY o.created_at DESC LIMIT 100`,
    [canteenId]
  );

  for (const order of orders) {
    const items = await queryRows<RowDataPacket[]>(
      "SELECT * FROM order_items WHERE order_id = ?",
      [order.id]
    );
    order.items = items;
  }

  res.json({ success: true, data: orders });
});

router.patch("/orders/:id/status", async (req: Request, res: Response) => {
  const canteenId = getAssignedCanteenId(req, res);
  if (!canteenId) return;

  const orderId = String(req.params.id);
  const { status, rejectionReason } = req.body as {
    status?:
      | "ACCEPTED"
      | "PREPARING"
      | "READY"
      | "COMPLETED"
      | "REJECTED";
    rejectionReason?: string;
  };

  if (
    !status ||
    !["ACCEPTED", "PREPARING", "READY", "COMPLETED", "REJECTED"].includes(
      status
    )
  ) {
    res.status(400).json({
      success: false,
      error: "Invalid order status.",
    });
    return;
  }

  const orderRows = await queryRows<RowDataPacket[]>(
    "SELECT * FROM orders WHERE id = ? LIMIT 1",
    [orderId]
  );
  const order = orderRows[0];
  if (!order) {
    res.status(404).json({ success: false, error: "Order not found." });
    return;
  }

  if (order.canteen_id !== canteenId) {
    res.status(403).json({
      success: false,
      error: "Unauthorized: Order belongs to another establishment.",
    });
    return;
  }

  await withTransaction(async (conn) => {
    const nextPayStatus =
      status === "COMPLETED"
        ? "PAID"
        : status === "REJECTED" && order.payment_status === "PAID"
          ? "REFUNDED"
          : order.payment_status;

    await conn.execute(
      `UPDATE orders
       SET status = ?, payment_status = ?, rejection_reason = ?
       WHERE id = ?`,
      [
        status,
        nextPayStatus,
        status === "REJECTED"
          ? rejectionReason || "Order declined by kitchen"
          : order.rejection_reason,
        orderId,
      ]
    );

    if (status === "COMPLETED") {
      await conn.execute(
        "UPDATE payments SET status = 'CAPTURED' WHERE order_id = ?",
        [orderId]
      );
    }

    // If REJECTED and paid via WALLET, refund the customer's wallet balance & ledger
    if (status === "REJECTED" && order.payment_status === "PAID") {
      await conn.execute(
        "UPDATE payments SET status = 'REFUNDED' WHERE order_id = ?",
        [orderId]
      );
      if (order.payment_method === "WALLET") {
        await conn.execute(
          "UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?",
          [order.total_amount, order.customer_id]
        );
        const [uRow] = await conn.query<RowDataPacket[]>(
          "SELECT wallet_balance FROM users WHERE id = ?",
          [order.customer_id]
        );
        await conn.execute(
          `INSERT INTO wallet_ledger (id, user_id, entry_type, amount, balance_after, reference_id, description)
           VALUES (?, ?, 'REFUND', ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            order.customer_id,
            order.total_amount,
            uRow[0]?.wallet_balance ?? 0,
            orderId,
            `Refund for rejected order ${order.order_number}`,
          ]
        );
      }
    }

    await conn.execute(
      `INSERT INTO notifications (id, user_id, title, message, type, metadata)
       VALUES (?, ?, ?, ?, 'ORDER_UPDATE', ?)`,
      [
        crypto.randomUUID(),
        order.customer_id,
        `Order ${order.order_number} is ${status}`,
        status === "REJECTED"
          ? `Your order was rejected: ${rejectionReason || "Unavailable"}`
          : `Your order at ${order.canteen_name_snapshot} is now ${status}.`,
        JSON.stringify({ orderId, status, rejectionReason }),
      ]
    );
  });

  const [updated] = await queryRows<RowDataPacket[]>(
    "SELECT * FROM orders WHERE id = ?",
    [orderId]
  );

  // Broadcast live update to Customer, Manager, and Admin rooms after DB commit
  if (ioV2) {
    const payload = {
      orderId,
      orderNumber: updated.order_number,
      canteenId,
      customerId: updated.customer_id,
      status: updated.status,
      rejectionReason: updated.rejection_reason,
      updatedAt: updated.updated_at,
    };
    ioV2.to(`user:${updated.customer_id}`).emit("order:updated", payload);
    ioV2.to(`establishment:${canteenId}`).emit("order:updated", payload);
    ioV2.to("admin").emit("order:updated", payload);
  }

  res.json({
    success: true,
    message: `Order ${updated.order_number} marked as ${status}.`,
    data: updated,
  });
});

// ── 5. Smart Inventory & Stock Movements ────────────────────────────────────
router.get("/inventory", async (req: Request, res: Response) => {
  const canteenId = getAssignedCanteenId(req, res);
  if (!canteenId) return;

  const items = await queryRows<RowDataPacket[]>(
    "SELECT * FROM inventory WHERE canteen_id = ? ORDER BY item_name ASC",
    [canteenId]
  );
  const movements = await queryRows<RowDataPacket[]>(
    `SELECT im.*, inv.item_name, inv.unit
     FROM inventory_movements im
     JOIN inventory inv ON inv.id = im.inventory_id
     WHERE im.canteen_id = ?
     ORDER BY im.created_at DESC LIMIT 30`,
    [canteenId]
  );

  res.json({
    success: true,
    data: {
      items: items.map((i) => ({
        ...i,
        isLowStock: Number(i.quantity) <= Number(i.min_threshold),
      })),
      movements,
    },
  });
});

router.post("/inventory", async (req: Request, res: Response) => {
  const canteenId = getAssignedCanteenId(req, res);
  if (!canteenId) return;

  const parsed = inventoryItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: "Invalid inventory parameters.",
    });
    return;
  }

  const d = parsed.data;
  const invId = crypto.randomUUID();

  await withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO inventory (id, canteen_id, item_name, unit, quantity, min_threshold, unit_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        invId,
        canteenId,
        d.itemName.trim(),
        d.unit,
        d.quantity,
        d.minThreshold,
        d.unitCost,
      ]
    );

    if (d.quantity > 0) {
      await conn.execute(
        `INSERT INTO inventory_movements (id, inventory_id, canteen_id, movement_type, quantity, reason, performed_by)
         VALUES (?, ?, ?, 'PURCHASE', ?, 'Initial stock entry', ?)`,
        [crypto.randomUUID(), invId, canteenId, d.quantity, req.user!.id]
      );
    }
  });

  const [created] = await queryRows<RowDataPacket[]>(
    "SELECT * FROM inventory WHERE id = ?",
    [invId]
  );
  res.status(201).json({
    success: true,
    message: "Inventory item created.",
    data: created,
  });
});

router.post("/inventory/:id/movement", async (req: Request, res: Response) => {
  const canteenId = getAssignedCanteenId(req, res);
  if (!canteenId) return;

  const invId = String(req.params.id);
  const { movementType, quantity, reason } = req.body as {
    movementType: "PURCHASE" | "CONSUMPTION" | "WASTAGE" | "ADJUSTMENT";
    quantity: number;
    reason?: string;
  };

  const qty = Number(quantity);
  if (!qty || qty <= 0) {
    res.status(400).json({
      success: false,
      error: "Quantity must be positive.",
    });
    return;
  }

  const rows = await queryRows<RowDataPacket[]>(
    "SELECT * FROM inventory WHERE id = ? AND canteen_id = ? LIMIT 1",
    [invId, canteenId]
  );
  if (rows.length === 0) {
    res.status(404).json({
      success: false,
      error: "Inventory item not found.",
    });
    return;
  }

  const currentQty = Number(rows[0].quantity);
  const isDeduct = movementType === "CONSUMPTION" || movementType === "WASTAGE";
  if (isDeduct && currentQty < qty) {
    res.status(400).json({
      success: false,
      error: `Insufficient stock (${currentQty} ${rows[0].unit} available).`,
    });
    return;
  }

  const nextQty = isDeduct ? currentQty - qty : currentQty + qty;

  await withTransaction(async (conn) => {
    await conn.execute("UPDATE inventory SET quantity = ? WHERE id = ?", [
      nextQty,
      invId,
    ]);
    await conn.execute(
      `INSERT INTO inventory_movements (id, inventory_id, canteen_id, movement_type, quantity, reason, performed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        invId,
        canteenId,
        movementType,
        qty,
        reason || movementType,
        req.user!.id,
      ]
    );
  });

  const [updated] = await queryRows<RowDataPacket[]>(
    "SELECT * FROM inventory WHERE id = ?",
    [invId]
  );
  res.json({
    success: true,
    message: "Inventory stock updated.",
    data: updated,
  });
});

// ── 6. Real MySQL Manager Business Intelligence, Sales, Operational, Inventory & Food Analytics (Section 8) ──
router.get("/analytics", async (req: Request, res: Response) => {
  const canteenId = getAssignedCanteenId(req, res);
  if (!canteenId) return;

  const startDate = req.query.startDate ? String(req.query.startDate) : null;
  const endDate = req.query.endDate ? String(req.query.endDate) : null;
  let dateWhere = "";
  const dateParams: unknown[] = [canteenId];

  if (startDate && endDate) {
    dateWhere = "AND DATE(created_at) >= ? AND DATE(created_at) <= ?";
    dateParams.push(startDate, endDate);
  }

  const [establishment] = await queryRows<RowDataPacket[]>(
    "SELECT * FROM canteens WHERE id = ?",
    [canteenId]
  );

  // 8.1 Sales & 8.2 Operational Summary
  const [stats] = await queryRows<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS totalOrders,
       SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS todayOrders,
       COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() AND status NOT IN ('REJECTED', 'CANCELLED') THEN total_amount ELSE 0 END), 0) AS todayRevenue,
       COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND status NOT IN ('REJECTED', 'CANCELLED') THEN total_amount ELSE 0 END), 0) AS weeklyRevenue,
       COALESCE(SUM(CASE WHEN DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m') AND status NOT IN ('REJECTED', 'CANCELLED') THEN total_amount ELSE 0 END), 0) AS monthlyRevenue,
       COALESCE(SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE()) AND status NOT IN ('REJECTED', 'CANCELLED') THEN total_amount ELSE 0 END), 0) AS annualRevenue,
       COALESCE(SUM(CASE WHEN status NOT IN ('REJECTED', 'CANCELLED') THEN total_amount ELSE 0 END), 0) AS totalRevenue,
       COALESCE(AVG(CASE WHEN status NOT IN ('REJECTED', 'CANCELLED') THEN total_amount END), 0) AS avgOrderValue,
       SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completedOrders,
       SUM(CASE WHEN status IN ('PLACED', 'ACCEPTED', 'PREPARING', 'READY') THEN 1 ELSE 0 END) AS pendingOrders,
       SUM(CASE WHEN status = 'ACCEPTED' THEN 1 ELSE 0 END) AS acceptedOrders,
       SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejectedOrders,
       SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelledOrders,
       COALESCE(SUM(CASE WHEN payment_status = 'REFUNDED' THEN total_amount ELSE 0 END), 0) AS refundedAmount,
       SUM(CASE WHEN payment_status = 'REFUNDED' THEN 1 ELSE 0 END) AS refundCount,
       COALESCE(AVG(CASE WHEN status = 'COMPLETED' THEN TIMESTAMPDIFF(MINUTE, created_at, updated_at) END), 0) AS avgCompletionMinutes
     FROM orders
     WHERE canteen_id = ? ${dateWhere}`,
    dateParams
  );

  // Daily Revenue Trend (last 14 days or custom range)
  const revenueTrends = await queryRows<RowDataPacket[]>(
    `SELECT
       DATE_FORMAT(created_at, '%Y-%m-%d') AS date,
       COUNT(*) AS orders,
       COALESCE(SUM(CASE WHEN status NOT IN ('REJECTED', 'CANCELLED') THEN total_amount ELSE 0 END), 0) AS revenue
     FROM orders
     WHERE canteen_id = ? ${dateWhere}
     GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
     ORDER BY date DESC
     LIMIT 14`,
    dateParams
  );

  // Revenue by Food Category
  const categoryRevenue = await queryRows<RowDataPacket[]>(
    `SELECT
       COALESCE(mc.name, 'General') AS category,
       SUM(oi.quantity) AS unitsSold,
       COALESCE(SUM(oi.line_total), 0) AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
     LEFT JOIN menu_categories mc ON mc.id = mi.category_id
     WHERE o.canteen_id = ? AND o.status NOT IN ('REJECTED', 'CANCELLED')
     GROUP BY COALESCE(mc.name, 'General')
     ORDER BY revenue DESC`,
    [canteenId]
  );

  // Item-wise Sales & Performance (Best & Lowest Selling)
  const itemPerformance = await queryRows<RowDataPacket[]>(
    `SELECT
       mi.id,
       mi.name,
       mi.price,
       mi.stock_quantity,
       mi.is_available,
       mi.preparation_time,
       mi.avg_rating,
       mi.total_reviews,
       COALESCE(mc.name, 'General') AS category_name,
       COALESCE(SUM(CASE WHEN o.status NOT IN ('REJECTED', 'CANCELLED') THEN oi.quantity ELSE 0 END), 0) AS units_sold,
       COALESCE(SUM(CASE WHEN o.status NOT IN ('REJECTED', 'CANCELLED') THEN oi.line_total ELSE 0 END), 0) AS revenue
     FROM menu_items mi
     LEFT JOIN menu_categories mc ON mc.id = mi.category_id
     LEFT JOIN order_items oi ON oi.menu_item_id = mi.id
     LEFT JOIN orders o ON o.id = oi.order_id
     WHERE mi.canteen_id = ? AND mi.is_deleted = 0
     GROUP BY mi.id
     ORDER BY revenue DESC, units_sold DESC`,
    [canteenId]
  );

  // Peak Ordering Hours
  const peakHours = await queryRows<RowDataPacket[]>(
    `SELECT
       CONCAT(LPAD(HOUR(created_at), 2, '0'), ':00') AS hour,
       COUNT(*) AS orders,
       COALESCE(SUM(CASE WHEN status NOT IN ('REJECTED', 'CANCELLED') THEN total_amount ELSE 0 END), 0) AS revenue
     FROM orders
     WHERE canteen_id = ?
     GROUP BY hour
     ORDER BY hour ASC`,
    [canteenId]
  );

  // Peak Business Days
  const peakDays = await queryRows<RowDataPacket[]>(
    `SELECT
       DAYNAME(created_at) AS dayName,
       COUNT(*) AS orders,
       COALESCE(SUM(CASE WHEN status NOT IN ('REJECTED', 'CANCELLED') THEN total_amount ELSE 0 END), 0) AS revenue
     FROM orders
     WHERE canteen_id = ?
     GROUP BY dayName
     ORDER BY orders DESC`,
    [canteenId]
  );

  // Payment Method Breakdown
  const paymentMethodBreakdown = await queryRows<RowDataPacket[]>(
    `SELECT
       payment_method AS method,
       COUNT(*) AS orders,
       COALESCE(SUM(CASE WHEN status NOT IN ('REJECTED', 'CANCELLED') THEN total_amount ELSE 0 END), 0) AS revenue
     FROM orders
     WHERE canteen_id = ?
     GROUP BY payment_method
     ORDER BY revenue DESC`,
    [canteenId]
  );

  // 8.3 Inventory Analytics (Valuation, Low-Stock, Out-of-Stock, Consumption vs Wastage)
  const inventoryItems = await queryRows<RowDataPacket[]>(
    `SELECT id, item_name, unit, quantity, min_threshold, unit_cost,
            (quantity * unit_cost) AS stock_value
     FROM inventory
     WHERE canteen_id = ?
     ORDER BY quantity ASC`,
    [canteenId]
  );

  const [invMovementStats] = await queryRows<RowDataPacket[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN movement_type = 'PURCHASE' THEN quantity ELSE 0 END), 0) AS totalPurchasedQty,
       COALESCE(SUM(CASE WHEN movement_type = 'CONSUMPTION' THEN quantity ELSE 0 END), 0) AS totalConsumedQty,
       COALESCE(SUM(CASE WHEN movement_type = 'WASTAGE' THEN quantity ELSE 0 END), 0) AS totalWastageQty
     FROM inventory_movements
     WHERE canteen_id = ?`,
    [canteenId]
  );

  const lowStockItems = inventoryItems.filter(
    (i) => Number(i.quantity) <= Number(i.min_threshold)
  );
  const outOfStockItems = inventoryItems.filter(
    (i) => Number(i.quantity) <= 0
  );
  const totalInventoryValue = inventoryItems.reduce(
    (sum, i) => sum + Number(i.stock_value || 0),
    0
  );

  const avgPrepTimeConfig = Number(
    itemPerformance.length > 0
      ? itemPerformance.reduce((s, i) => s + Number(i.preparation_time || 10), 0) /
          itemPerformance.length
      : 10
  );

  res.json({
    success: true,
    data: {
      establishment,
      summary: {
        todayOrders: Number(stats?.todayOrders || 0),
        todayRevenue: Number(stats?.todayRevenue || 0),
        weeklyRevenue: Number(stats?.weeklyRevenue || 0),
        monthlyRevenue: Number(stats?.monthlyRevenue || 0),
        annualRevenue: Number(stats?.annualRevenue || 0),
        totalOrders: Number(stats?.totalOrders || 0),
        totalRevenue: Number(stats?.totalRevenue || 0),
        avgOrderValue: Number(Number(stats?.avgOrderValue || 0).toFixed(2)),
        averageOrderValue: Number(Number(stats?.avgOrderValue || 0).toFixed(2)),
        completedOrders: Number(stats?.completedOrders || 0),
        pendingOrders: Number(stats?.pendingOrders || 0),
        acceptedOrders: Number(stats?.acceptedOrders || 0),
        rejectedOrders: Number(stats?.rejectedOrders || 0),
        cancelledOrders: Number(stats?.cancelledOrders || 0),
        refundedAmount: Number(stats?.refundedAmount || 0),
        refundTotal: Number(stats?.refundedAmount || 0),
        refundCount: Number(stats?.refundCount || 0),
        avgPrepTimeMinutes: Number(avgPrepTimeConfig.toFixed(1)),
        avgCompletionMinutes: Number(
          Number(stats?.avgCompletionMinutes || avgPrepTimeConfig).toFixed(1)
        ),
        lowStockCount: lowStockItems.length,
        outOfStockCount: outOfStockItems.length,
        totalInventoryValue: Number(totalInventoryValue.toFixed(2)),
        totalPurchasedQty: Number(invMovementStats?.totalPurchasedQty || 0),
        purchasedQty: Number(invMovementStats?.totalPurchasedQty || 0),
        totalConsumedQty: Number(invMovementStats?.totalConsumedQty || 0),
        consumedQty: Number(invMovementStats?.totalConsumedQty || 0),
        totalWastageQty: Number(invMovementStats?.totalWastageQty || 0),
        wastageQty: Number(invMovementStats?.totalWastageQty || 0),
      },
      revenueTrends: [...revenueTrends].reverse(),
      revenueTrend: [...revenueTrends]
        .reverse()
        .map((r) => ({ ...r, day: r.date })),
      categoryRevenue: categoryRevenue.map((c) => ({
        ...c,
        category_name: c.category,
      })),
      popularItems: itemPerformance.slice(0, 8).map((p) => ({
        ...p,
        total_sold: Number(p.units_sold || 0),
        total_orders: Number(p.units_sold || 0),
        total_revenue: Number(p.revenue || 0),
      })),
      lowestSellingItems: [...itemPerformance]
        .reverse()
        .slice(0, 5)
        .map((p) => ({
          ...p,
          total_sold: Number(p.units_sold || 0),
          total_revenue: Number(p.revenue || 0),
        })),
      itemPerformance,
      peakHours,
      peakDays,
      paymentMethodBreakdown,
      lowStockItems,
      outOfStockItems,
      reorderRecommendations: lowStockItems.map((i) => {
        const recQty = Math.max(
          10,
          Number(i.min_threshold) * 3 - Number(i.quantity)
        );
        return {
          id: i.id,
          itemName: i.item_name,
          currentQty: Number(i.quantity),
          currentQuantity: Number(i.quantity),
          minThreshold: Number(i.min_threshold),
          recommendedOrderQty: recQty,
          estimatedCost: Number((recQty * Number(i.unit_cost || 0)).toFixed(2)),
          unit: i.unit,
        };
      }),
    },
  });
});

// ── 7. Manager Outlet Operating Settings Update (V1 Feature Migration) ──────
router.patch("/settings", async (req: Request, res: Response) => {
  const canteenId = getAssignedCanteenId(req, res);
  if (!canteenId) return;

  const { openingTime, closingTime, description, contactPhone } = req.body as {
    openingTime?: string;
    closingTime?: string;
    description?: string;
    contactPhone?: string;
  };

  const [existing] = await queryRows<RowDataPacket[]>(
    "SELECT * FROM canteens WHERE id = ?",
    [canteenId]
  );
  if (!existing) {
    res.status(404).json({ success: false, error: "Establishment not found." });
    return;
  }

  await execQuery(
    `UPDATE canteens
     SET opening_time = ?, closing_time = ?, description = ?, contact_phone = ?
     WHERE id = ?`,
    [
      openingTime || existing.opening_time,
      closingTime || existing.closing_time,
      description !== undefined ? description : existing.description,
      contactPhone !== undefined ? contactPhone : existing.contact_phone,
      canteenId,
    ]
  );

  const [updated] = await queryRows<RowDataPacket[]>(
    "SELECT * FROM canteens WHERE id = ?",
    [canteenId]
  );

  res.json({
    success: true,
    message: "Establishment operating settings saved.",
    data: updated,
  });
});

router.post("/crowd", async (req: Request, res: Response) => {
  const canteenId = getAssignedCanteenId(req, res);
  if (!canteenId) return;

  const peopleCount = Math.max(0, Number(req.body?.peopleCount || 0));
  const crowdLevel =
    peopleCount > 20 ? "HIGH" : peopleCount > 8 ? "MEDIUM" : "LOW";

  await execQuery(
    `UPDATE canteens
     SET crowd_count = ?, crowd_level = ?, crowd_updated_at = NOW()
     WHERE id = ?`,
    [peopleCount, crowdLevel, canteenId]
  );

  res.json({
    success: true,
    message: "Crowd telemetry updated.",
    data: { canteenId, peopleCount, crowdLevel },
  });
});

export default router;
