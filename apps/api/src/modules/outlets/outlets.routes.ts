import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../../config/database.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { AppError, catchAsync } from "../../middleware/errorHandler.js";
import { validate } from "../../middleware/validate.js";

const router = Router();

const createOutletSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  openingTime: z.string().default("08:00"),
  closingTime: z.string().default("20:00"),
  avgPrepTime: z.coerce.number().int().min(1).max(120).default(15),
  activeCounters: z.coerce.number().int().min(1).max(20).default(1),
  locationX: z.coerce.number().min(0).max(100).optional(),
  locationY: z.coerce.number().min(0).max(100).optional(),
});

const updateOutletSchema = createOutletSchema.partial().extend({
  isOpen: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// ── Public / Student: List all active outlets with live queue & crowd info ──
router.get(
  "/outlets",
  catchAsync(async (req: Request, res: Response) => {
    const { isOpen, search } = req.query;
    const where: Record<string, unknown> = {
      isActive: true,
      deletedAt: null,
    };
    if (isOpen === "true") where.isOpen = true;
    if (search) where.name = { contains: String(search) };

    const outlets = await prisma.outlet.findMany({
      where,
      include: {
        qrCodes: { where: { isActive: true }, select: { token: true }, take: 1 },
        _count: {
          select: {
            menuItems: { where: { isActive: true, isAvailable: true, deletedAt: null } },
            orders: { where: { status: { in: ["PLACED", "ACCEPTED", "PREPARING"] } } },
          },
        },
        crowdSnapshots: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });

    const data = outlets.map((o) => {
      const activeOrders = o._count.orders;
      const availableFoodCount = o._count.menuItems;
      const counters = Math.max(o.activeCounters, 1);
      const estimatedWait = Math.round(Math.ceil(activeOrders / counters) * o.avgPrepTime * 1.1);
      const latestCrowd = o.crowdSnapshots[0] ?? {
        peopleCount: activeOrders * 2 + 3,
        crowdLevel: activeOrders > 8 ? "HIGH" : activeOrders > 3 ? "MEDIUM" : "LOW",
        isSimulated: true,
        source: "SIMULATED",
      };

      return {
        id: o.id,
        name: o.name,
        slug: o.slug,
        description: o.description,
        imageUrl: o.imageUrl,
        locationX: o.locationX ?? 50,
        locationY: o.locationY ?? 50,
        openingTime: o.openingTime,
        closingTime: o.closingTime,
        isActive: o.isActive,
        isOpen: o.isOpen,
        avgPrepTime: o.avgPrepTime,
        activeCounters: o.activeCounters,
        qrToken: o.qrCodes[0]?.token ?? null,
        activeOrders,
        availableFoodCount,
        estimatedWait,
        isEstimate: true,
        crowd: {
          peopleCount: latestCrowd.peopleCount,
          crowdLevel: latestCrowd.crowdLevel,
          isSimulated: latestCrowd.isSimulated,
        },
      };
    });

    res.json({ success: true, data });
  })
);

// ── Single Outlet Details ───────────────────────────────────────────────────
router.get(
  "/outlets/:id",
  catchAsync(async (req: Request, res: Response) => {
    const outlet = await prisma.outlet.findFirst({
      where: { id: String(req.params.id), deletedAt: null },
      include: {
        qrCodes: { where: { isActive: true }, select: { token: true }, take: 1 },
        menuItems: {
          where: { isActive: true, deletedAt: null },
          include: { category: true },
          orderBy: { popularityScore: "desc" },
        },
      },
    });

    if (!outlet) {
      throw new AppError(404, "Outlet not found.");
    }

    res.json({
      success: true,
      data: {
        ...outlet,
        qrToken: outlet.qrCodes[0]?.token ?? null,
      },
    });
  })
);

// ── Outlet Menu ─────────────────────────────────────────────────────────────
router.get(
  "/outlets/:id/menu",
  catchAsync(async (req: Request, res: Response) => {
    const outlet = await prisma.outlet.findFirst({
      where: { id: String(req.params.id), isActive: true, deletedAt: null },
    });
    if (!outlet) {
      throw new AppError(404, "Outlet not found or inactive.");
    }

    const items = await prisma.menuItem.findMany({
      where: { outletId: outlet.id, isActive: true, deletedAt: null },
      include: {
        category: true,
        outlet: { select: { id: true, name: true, slug: true, isOpen: true, avgPrepTime: true } },
      },
      orderBy: [{ isAvailable: "desc" }, { name: "asc" }],
    });

    res.json({ success: true, data: { outlet, items } });
  })
);

// ── QR Token Verification & Outlet Menu Lookup ──────────────────────────────
router.get(
  "/qr/:token",
  catchAsync(async (req: Request, res: Response) => {
    const token = String(req.params.token);
    const qr = await prisma.qRCode.findUnique({
      where: { token },
      include: {
        outlet: {
          include: {
            menuItems: {
              where: { isActive: true, deletedAt: null },
              include: { category: true },
              orderBy: { name: "asc" },
            },
          },
        },
      },
    });

    if (!qr || !qr.isActive || !qr.outlet.isActive || qr.outlet.deletedAt) {
      throw new AppError(404, "Invalid or expired outlet QR code.");
    }

    if (qr.expiresAt && qr.expiresAt < new Date()) {
      throw new AppError(410, "This QR code has expired.");
    }

    res.json({
      success: true,
      message: `Verified QR code for ${qr.outlet.name}`,
      data: {
        outlet: {
          id: qr.outlet.id,
          name: qr.outlet.name,
          slug: qr.outlet.slug,
          description: qr.outlet.description,
          isOpen: qr.outlet.isOpen,
          openingTime: qr.outlet.openingTime,
          closingTime: qr.outlet.closingTime,
          avgPrepTime: qr.outlet.avgPrepTime,
        },
        menuItems: qr.outlet.menuItems,
      },
    });
  })
);

// ── Manager: Update Own Assigned Outlet Operating Hours / Status ────────────
router.patch(
  "/manager/outlet",
  authenticate,
  requireRole("MANAGER"),
  validate({ body: updateOutletSchema }),
  catchAsync(async (req: Request, res: Response) => {
    const outletId = req.user?.outletId;
    if (!outletId) {
      throw new AppError(403, "No outlet assigned to this manager account.");
    }

    const updated = await prisma.outlet.update({
      where: { id: outletId },
      data: req.body,
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "UPDATE",
        entity: "Outlet",
        entityId: outletId,
        details: JSON.stringify(req.body),
      },
    });

    res.json({
      success: true,
      message: "Outlet settings updated.",
      data: updated,
    });
  })
);

// ── Super Admin: Create Outlet ──────────────────────────────────────────────
router.post(
  "/admin/outlets",
  authenticate,
  requireRole("SUPER_ADMIN"),
  validate({ body: createOutletSchema }),
  catchAsync(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof createOutletSchema>;
    const slug = slugify(body.name);

    const existing = await prisma.outlet.findUnique({ where: { slug } });
    if (existing) {
      throw new AppError(409, "An outlet with this name/slug already exists.");
    }

    const outlet = await prisma.outlet.create({
      data: {
        ...body,
        slug,
        qrCodes: {
          create: {
            token: crypto.randomBytes(24).toString("base64url"),
          },
        },
      },
      include: { qrCodes: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "CREATE",
        entity: "Outlet",
        entityId: outlet.id,
        details: JSON.stringify({ name: outlet.name, slug: outlet.slug }),
      },
    });

    res.status(201).json({
      success: true,
      message: "Outlet created successfully.",
      data: outlet,
    });
  })
);

// ── Super Admin: Update / Deactivate Outlet ─────────────────────────────────
router.patch(
  "/admin/outlets/:id",
  authenticate,
  requireRole("SUPER_ADMIN"),
  validate({ body: updateOutletSchema }),
  catchAsync(async (req: Request, res: Response) => {
    const outlet = await prisma.outlet.update({
      where: { id: String(req.params.id) },
      data: req.body,
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "UPDATE",
        entity: "Outlet",
        entityId: outlet.id,
        details: JSON.stringify(req.body),
      },
    });

    res.json({
      success: true,
      message: "Outlet updated successfully.",
      data: outlet,
    });
  })
);

export default router;
