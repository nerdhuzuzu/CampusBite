import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/database.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { AppError, catchAsync } from "../../middleware/errorHandler.js";
import { validate } from "../../middleware/validate.js";

const router = Router();

const createIngredientSchema = z.object({
  name: z.string().min(2).max(100),
  unit: z.string().min(1).max(20),
  currentStock: z.coerce.number().min(0).default(0),
  minStockLevel: z.coerce.number().min(0).default(5),
  costPerUnit: z.coerce.number().min(0).default(0),
  outletId: z.string().optional(),
});

const updateIngredientSchema = createIngredientSchema.partial();

const stockActionSchema = z.object({
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  unitCost: z.coerce.number().min(0).optional(),
  reason: z.string().max(300).optional(),
});

const recipeSchema = z.object({
  menuItemId: z.string().min(1),
  ingredientId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1).max(20),
});

// ── List Ingredients, Low-Stock Warnings & Recent Movements ─────────────────
router.get(
  "/manager/inventory",
  authenticate,
  requireRole("MANAGER", "SUPER_ADMIN"),
  catchAsync(async (req: Request, res: Response) => {
    const outletId =
      req.user!.role === "MANAGER"
        ? req.user!.outletId
        : (req.query.outletId as string | undefined);

    const where = outletId ? { outletId, isActive: true } : { isActive: true };

    const ingredients = await prisma.ingredient.findMany({
      where,
      include: {
        outlet: { select: { id: true, name: true } },
        recipes: {
          include: { menuItem: { select: { id: true, name: true } } },
        },
        movements: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: { name: "asc" },
    });

    const data = ingredients.map((ing) => {
      const current = Number(ing.currentStock);
      const reserved = Number(ing.reservedStock);
      const min = Number(ing.minStockLevel);
      const available = Number((current - reserved).toFixed(3));
      const isLowStock = available <= min;

      return {
        ...ing,
        currentStock: current,
        reservedStock: reserved,
        availableStock: available,
        minStockLevel: min,
        costPerUnit: Number(ing.costPerUnit),
        isLowStock,
      };
    });

    res.json({
      success: true,
      data: {
        ingredients: data,
        lowStockCount: data.filter((i) => i.isLowStock).length,
      },
    });
  })
);

// ── Add Ingredient ──────────────────────────────────────────────────────────
router.post(
  "/manager/inventory",
  authenticate,
  requireRole("MANAGER", "SUPER_ADMIN"),
  validate({ body: createIngredientSchema }),
  catchAsync(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof createIngredientSchema>;
    const outletId =
      req.user!.role === "MANAGER" ? req.user!.outletId : body.outletId;

    if (!outletId) {
      throw new AppError(400, "Outlet ID is required.");
    }

    const ingredient = await prisma.ingredient.create({
      data: {
        outletId,
        name: body.name,
        unit: body.unit,
        currentStock: body.currentStock,
        minStockLevel: body.minStockLevel,
        costPerUnit: body.costPerUnit,
      },
    });

    res.status(201).json({
      success: true,
      message: "Ingredient added to inventory.",
      data: ingredient,
    });
  })
);

// ── Update Ingredient ───────────────────────────────────────────────────────
router.patch(
  "/manager/inventory/:id",
  authenticate,
  requireRole("MANAGER", "SUPER_ADMIN"),
  validate({ body: updateIngredientSchema }),
  catchAsync(async (req: Request, res: Response) => {
    const existing = await prisma.ingredient.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!existing) {
      throw new AppError(404, "Ingredient not found.");
    }
    if (req.user!.role === "MANAGER" && existing.outletId !== req.user!.outletId) {
      throw new AppError(403, "You cannot modify inventory for another outlet.");
    }

    const { outletId: _ignore, ...updateData } = req.body as z.infer<typeof updateIngredientSchema>;
    const updated = await prisma.ingredient.update({
      where: { id: existing.id },
      data: updateData,
    });

    res.json({
      success: true,
      message: "Ingredient updated.",
      data: updated,
    });
  })
);

// ── Record Stock Purchase ───────────────────────────────────────────────────
router.post(
  "/manager/inventory/:id/purchase",
  authenticate,
  requireRole("MANAGER", "SUPER_ADMIN"),
  validate({ body: stockActionSchema }),
  catchAsync(async (req: Request, res: Response) => {
    const { quantity, unitCost, reason } = req.body as z.infer<typeof stockActionSchema>;

    const existing = await prisma.ingredient.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!existing) {
      throw new AppError(404, "Ingredient not found.");
    }
    if (req.user!.role === "MANAGER" && existing.outletId !== req.user!.outletId) {
      throw new AppError(403, "You cannot modify inventory for another outlet.");
    }

    const cost = unitCost ?? Number(existing.costPerUnit);
    const totalCost = Number((cost * quantity).toFixed(2));

    const updated = await prisma.$transaction(async (tx) => {
      const ing = await tx.ingredient.update({
        where: { id: existing.id },
        data: {
          currentStock: { increment: quantity },
          costPerUnit: cost,
        },
      });

      await tx.purchase.create({
        data: {
          ingredientId: existing.id,
          quantity,
          unitCost: cost,
          totalCost,
          notes: reason ?? "Stock purchase recorded",
        },
      });

      await tx.inventoryMovement.create({
        data: {
          ingredientId: existing.id,
          type: "PURCHASE",
          quantity,
          reason: reason ?? "Stock purchase",
          performedBy: req.user!.id,
        },
      });

      return ing;
    });

    res.status(201).json({
      success: true,
      message: "Stock purchase recorded.",
      data: updated,
    });
  })
);

// ── Record Stock Wastage (Prevents Negative Stock) ──────────────────────────
router.post(
  "/manager/inventory/:id/wastage",
  authenticate,
  requireRole("MANAGER", "SUPER_ADMIN"),
  validate({ body: stockActionSchema }),
  catchAsync(async (req: Request, res: Response) => {
    const { quantity, reason } = req.body as z.infer<typeof stockActionSchema>;

    const existing = await prisma.ingredient.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!existing) {
      throw new AppError(404, "Ingredient not found.");
    }
    if (req.user!.role === "MANAGER" && existing.outletId !== req.user!.outletId) {
      throw new AppError(403, "You cannot modify inventory for another outlet.");
    }

    const available =
      Number(existing.currentStock) - Number(existing.reservedStock);
    if (quantity > available) {
      throw new AppError(
        400,
        `Cannot record wastage greater than available unreserved stock (${available} ${existing.unit}).`
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const ing = await tx.ingredient.update({
        where: { id: existing.id },
        data: {
          currentStock: { decrement: quantity },
        },
      });

      await tx.inventoryMovement.create({
        data: {
          ingredientId: existing.id,
          type: "WASTAGE",
          quantity,
          reason: reason ?? "Ingredient wastage",
          performedBy: req.user!.id,
        },
      });

      return ing;
    });

    res.json({
      success: true,
      message: "Wastage recorded and stock deducted.",
      data: updated,
    });
  })
);

// ── Upsert Recipe Link (MenuItem <-> Ingredient) ────────────────────────────
router.post(
  "/manager/recipes",
  authenticate,
  requireRole("MANAGER", "SUPER_ADMIN"),
  validate({ body: recipeSchema }),
  catchAsync(async (req: Request, res: Response) => {
    const { menuItemId, ingredientId, quantity, unit } = req.body as z.infer<typeof recipeSchema>;

    const menuItem = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
    if (!menuItem) {
      throw new AppError(404, "Menu item not found.");
    }
    if (req.user!.role === "MANAGER" && menuItem.outletId !== req.user!.outletId) {
      throw new AppError(403, "You cannot modify recipes for another outlet.");
    }

    const recipe = await prisma.recipe.upsert({
      where: { menuItemId_ingredientId: { menuItemId, ingredientId } },
      update: { quantity, unit },
      create: { menuItemId, ingredientId, quantity, unit },
      include: {
        ingredient: { select: { id: true, name: true, unit: true } },
        menuItem: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({
      success: true,
      message: "Recipe ingredient requirement saved.",
      data: recipe,
    });
  })
);

export default router;
