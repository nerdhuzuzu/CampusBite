import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/database.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { AppError, catchAsync } from "../../middleware/errorHandler.js";
import { validate } from "../../middleware/validate.js";

const router = Router();

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const createMenuItemSchema = z.object({
  name: z.string().min(2).max(120),
  categoryId: z.string().min(1),
  description: z.string().max(500).optional(),
  price: z.coerce.number().positive("Price must be positive"),
  dietaryType: z.enum(["VEG", "NON_VEG", "VEGAN", "EGG"]).default("VEG"),
  preparationTime: z.coerce.number().int().min(1).max(120).default(10),
  calories: z.coerce.number().int().min(0).max(5000).optional(),
  protein: z.coerce.number().min(0).max(500).optional(),
  isAvailable: z.boolean().default(true),
  outletId: z.string().optional(), // Only used if SUPER_ADMIN specifies it
});

const updateMenuItemSchema = createMenuItemSchema.partial();

// ── List Food Categories ────────────────────────────────────────────────────
router.get(
  "/categories",
  catchAsync(async (_req: Request, res: Response) => {
    const categories = await prisma.foodCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    res.json({ success: true, data: categories });
  })
);

// ── Multi-Outlet Menu Discovery & Price Comparison ──────────────────────────
router.get(
  "/menu",
  catchAsync(async (req: Request, res: Response) => {
    const {
      outletId,
      category,
      categoryId,
      dietary,
      available,
      search,
      minPrice,
      maxPrice,
      sortBy,
      sortOrder,
    } = req.query;

    const where: Record<string, unknown> = {
      isActive: true,
      deletedAt: null,
    };

    if (outletId) where.outletId = String(outletId);
    if (categoryId) where.categoryId = String(categoryId);
    if (category) {
      where.category = { slug: String(category).toLowerCase() };
    }
    if (dietary && dietary !== "ALL") {
      where.dietaryType = String(dietary);
    }
    if (available === "true") {
      where.isAvailable = true;
    }
    if (search) {
      where.name = { contains: String(search) };
    }
    if (minPrice || maxPrice) {
      const priceFilter: Record<string, number> = {};
      if (minPrice) priceFilter.gte = Number(minPrice);
      if (maxPrice) priceFilter.lte = Number(maxPrice);
      where.price = priceFilter;
    }

    const orderDir = sortOrder === "asc" ? "asc" : "desc";
    const orderBy =
      sortBy === "price"
        ? { price: orderDir as "asc" | "desc" }
        : sortBy === "rating"
          ? { avgRating: orderDir as "asc" | "desc" }
          : { popularityScore: "desc" as const };

    const items = await prisma.menuItem.findMany({
      where,
      include: {
        category: true,
        outlet: {
          select: {
            id: true,
            name: true,
            slug: true,
            isOpen: true,
            openingTime: true,
            closingTime: true,
            avgPrepTime: true,
          },
        },
        recipes: {
          include: {
            ingredient: { select: { id: true, name: true, unit: true, currentStock: true } },
          },
        },
      },
      orderBy,
    });

    res.json({ success: true, data: items });
  })
);

// ── Compare prices of similar dishes across outlets ─────────────────────────
router.get(
  "/menu/compare",
  catchAsync(async (req: Request, res: Response) => {
    const query = String(req.query.q ?? "").trim();
    const items = await prisma.menuItem.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(query ? { name: { contains: query } } : {}),
      },
      include: {
        outlet: { select: { id: true, name: true, slug: true, isOpen: true, avgPrepTime: true } },
        category: { select: { id: true, name: true } },
      },
      orderBy: { price: "asc" },
    });

    res.json({ success: true, data: items });
  })
);

// ── Manager / Super Admin: Create Menu Item ─────────────────────────────────
router.post(
  "/manager/menu",
  authenticate,
  requireRole("MANAGER", "SUPER_ADMIN"),
  validate({ body: createMenuItemSchema }),
  catchAsync(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof createMenuItemSchema>;
    const outletId =
      req.user!.role === "MANAGER" ? req.user!.outletId : body.outletId;

    if (!outletId) {
      throw new AppError(400, "Outlet ID is required to create a menu item.");
    }

    const baseSlug = slugify(body.name);
    const existing = await prisma.menuItem.findUnique({
      where: { outletId_slug: { outletId, slug: baseSlug } },
    });
    const slug = existing ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug;

    const item = await prisma.menuItem.create({
      data: {
        outletId,
        categoryId: body.categoryId,
        name: body.name,
        slug,
        description: body.description,
        price: body.price,
        dietaryType: body.dietaryType,
        preparationTime: body.preparationTime,
        calories: body.calories,
        protein: body.protein,
        isAvailable: body.isAvailable,
      },
      include: { category: true, outlet: { select: { id: true, name: true } } },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "CREATE",
        entity: "MenuItem",
        entityId: item.id,
        details: JSON.stringify({ name: item.name, price: item.price, outletId }),
      },
    });

    res.status(201).json({
      success: true,
      message: "Menu item created.",
      data: item,
    });
  })
);

// ── Manager / Super Admin: Update Menu Item (Outlet-isolated) ───────────────
router.patch(
  "/manager/menu/:id",
  authenticate,
  requireRole("MANAGER", "SUPER_ADMIN"),
  validate({ body: updateMenuItemSchema }),
  catchAsync(async (req: Request, res: Response) => {
    const existing = await prisma.menuItem.findFirst({
      where: { id: String(req.params.id), deletedAt: null },
    });

    if (!existing) {
      throw new AppError(404, "Menu item not found.");
    }

    if (req.user!.role === "MANAGER" && existing.outletId !== req.user!.outletId) {
      throw new AppError(403, "You cannot modify menu items belonging to another outlet.");
    }

    const { outletId: _ignore, ...updateData } = req.body as z.infer<typeof updateMenuItemSchema>;

    const updated = await prisma.menuItem.update({
      where: { id: existing.id },
      data: updateData,
      include: { category: true, outlet: { select: { id: true, name: true } } },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "UPDATE",
        entity: "MenuItem",
        entityId: updated.id,
        details: JSON.stringify(updateData),
      },
    });

    res.json({
      success: true,
      message: "Menu item updated.",
      data: updated,
    });
  })
);

// ── Manager / Super Admin: Soft-delete Menu Item (Outlet-isolated) ──────────
router.delete(
  "/manager/menu/:id",
  authenticate,
  requireRole("MANAGER", "SUPER_ADMIN"),
  catchAsync(async (req: Request, res: Response) => {
    const existing = await prisma.menuItem.findFirst({
      where: { id: String(req.params.id), deletedAt: null },
    });

    if (!existing) {
      throw new AppError(404, "Menu item not found.");
    }

    if (req.user!.role === "MANAGER" && existing.outletId !== req.user!.outletId) {
      throw new AppError(403, "You cannot delete menu items belonging to another outlet.");
    }

    await prisma.menuItem.update({
      where: { id: existing.id },
      data: { isActive: false, isAvailable: false, deletedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "DELETE",
        entity: "MenuItem",
        entityId: existing.id,
        details: JSON.stringify({ name: existing.name }),
      },
    });

    res.json({
      success: true,
      message: "Menu item removed.",
    });
  })
);

export default router;
