/**
 * Development seed script — Campus Canteen Management System
 *
 * Creates: Super Admin, 5 outlets, 5 managers, demo student, categories,
 * sample menus, and QR codes. Idempotent (safe to re-run) via upsert.
 *
 * ⚠️ DEVELOPMENT DATA ONLY. Credentials below are for local testing.
 *    Override with SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD env vars and
 *    change all passwords before any production use.
 */
import { PrismaClient, DietaryType } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const prisma = new PrismaClient();

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Placeholder map coordinates (0-100 grid) — NOT real campus locations.
const OUTLETS = [
  { name: "Canteen 1", description: "Main campus canteen serving full meals, thalis and South Indian breakfast.", openingTime: "08:00", closingTime: "20:00", avgPrepTime: 15, activeCounters: 2, locationX: 20, locationY: 30 },
  { name: "Canteen 2", description: "Second canteen near the engineering block — Chinese, rice bowls and snacks.", openingTime: "08:30", closingTime: "19:30", avgPrepTime: 14, activeCounters: 2, locationX: 70, locationY: 25 },
  { name: "Cafe 1", description: "Coffee, sandwiches and quick bites near the library.", openingTime: "09:00", closingTime: "21:00", avgPrepTime: 8, activeCounters: 1, locationX: 40, locationY: 65 },
  { name: "Cafe 2", description: "Shakes, wraps, pastries and cold beverages by the sports ground.", openingTime: "10:00", closingTime: "21:00", avgPrepTime: 9, activeCounters: 1, locationX: 80, locationY: 70 },
  { name: "Dabeli Stall", description: "Street-style dabeli, vada pav and chaat.", openingTime: "11:00", closingTime: "19:00", avgPrepTime: 5, activeCounters: 1, locationX: 55, locationY: 45 },
];

const CATEGORIES = ["Snacks", "Beverages", "Main Course", "Desserts", "South Indian", "Chinese", "Sandwiches", "Salads"];

type SeedItem = { name: string; category: string; price: number; dietaryType?: DietaryType; prep?: number; calories?: number; protein?: number; description?: string };

const MENUS: Record<string, SeedItem[]> = {
  "Canteen 1": [
    { name: "Masala Dosa", category: "South Indian", price: 60, prep: 10, calories: 350, protein: 8 },
    { name: "Idli Sambar", category: "South Indian", price: 40, prep: 6, calories: 220, protein: 7 },
    { name: "Veg Thali", category: "Main Course", price: 110, prep: 8, calories: 750, protein: 20 },
    { name: "Chicken Biryani", category: "Main Course", price: 140, dietaryType: "NON_VEG", prep: 12, calories: 680, protein: 32 },
    { name: "Paneer Butter Masala with Roti", category: "Main Course", price: 120, prep: 12, calories: 620, protein: 22 },
    { name: "Samosa (2 pcs)", category: "Snacks", price: 30, prep: 3, calories: 300, protein: 5 },
    { name: "Masala Chai", category: "Beverages", price: 15, prep: 3, calories: 90, protein: 2 },
    { name: "Gulab Jamun (2 pcs)", category: "Desserts", price: 35, prep: 2, calories: 300, protein: 3 },
  ],
  "Canteen 2": [
    { name: "Veg Hakka Noodles", category: "Chinese", price: 80, prep: 10, calories: 480, protein: 10 },
    { name: "Chicken Fried Rice", category: "Chinese", price: 110, dietaryType: "NON_VEG", prep: 10, calories: 560, protein: 25 },
    { name: "Veg Manchurian", category: "Chinese", price: 90, prep: 12, calories: 420, protein: 9 },
    { name: "Egg Fried Rice", category: "Chinese", price: 90, dietaryType: "EGG", prep: 9, calories: 520, protein: 18 },
    { name: "Rajma Chawal", category: "Main Course", price: 90, prep: 6, calories: 560, protein: 18 },
    { name: "Veg Sandwich", category: "Sandwiches", price: 50, prep: 6, calories: 280, protein: 8 },
    { name: "Cold Coffee", category: "Beverages", price: 50, prep: 4, calories: 220, protein: 6 },
  ],
  "Cafe 1": [
    { name: "Cappuccino", category: "Beverages", price: 70, prep: 4, calories: 120, protein: 6 },
    { name: "Grilled Cheese Sandwich", category: "Sandwiches", price: 80, prep: 7, calories: 420, protein: 15 },
    { name: "Chicken Club Sandwich", category: "Sandwiches", price: 130, dietaryType: "NON_VEG", prep: 9, calories: 520, protein: 30 },
    { name: "Paneer Tikka Sandwich", category: "Sandwiches", price: 100, prep: 8, calories: 460, protein: 20 },
    { name: "Greek Salad", category: "Salads", price: 120, prep: 5, calories: 250, protein: 8 },
    { name: "Chocolate Brownie", category: "Desserts", price: 70, prep: 2, calories: 380, protein: 5 },
    { name: "Iced Lemon Tea", category: "Beverages", price: 50, prep: 3, calories: 90, protein: 0 },
  ],
  "Cafe 2": [
    { name: "Chocolate Shake", category: "Beverages", price: 90, prep: 5, calories: 450, protein: 10 },
    { name: "Mango Smoothie", category: "Beverages", price: 80, prep: 5, calories: 300, protein: 6 },
    { name: "Paneer Kathi Roll", category: "Snacks", price: 90, prep: 7, calories: 480, protein: 18 },
    { name: "Chicken Kathi Roll", category: "Snacks", price: 110, dietaryType: "NON_VEG", prep: 8, calories: 520, protein: 28 },
    { name: "Sprouts Protein Salad", category: "Salads", price: 90, dietaryType: "VEGAN", prep: 5, calories: 220, protein: 14 },
    { name: "Veg Sandwich", category: "Sandwiches", price: 55, prep: 6, calories: 280, protein: 8 },
    { name: "Blueberry Muffin", category: "Desserts", price: 60, prep: 2, calories: 350, protein: 5 },
  ],
  "Dabeli Stall": [
    { name: "Classic Dabeli", category: "Snacks", price: 25, prep: 3, calories: 280, protein: 6 },
    { name: "Cheese Dabeli", category: "Snacks", price: 35, prep: 4, calories: 340, protein: 9 },
    { name: "Vada Pav", category: "Snacks", price: 20, prep: 3, calories: 290, protein: 6 },
    { name: "Pani Puri (6 pcs)", category: "Snacks", price: 30, dietaryType: "VEGAN", prep: 3, calories: 200, protein: 4 },
    { name: "Bhel Puri", category: "Snacks", price: 35, dietaryType: "VEGAN", prep: 4, calories: 250, protein: 6 },
    { name: "Masala Chaas", category: "Beverages", price: 20, prep: 2, calories: 60, protein: 3 },
  ],
};

async function main() {
  console.log("🌱 Seeding development data...");

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@campus.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin@123";
  const managerHash = await bcrypt.hash("Manager@123", 12);
  const studentHash = await bcrypt.hash("Student@123", 12);

  // ── Super Admin ────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: "SUPER_ADMIN",
      firstName: "Super",
      lastName: "Admin",
    },
  });
  console.log(`  ✔ Super Admin: ${adminEmail}`);

  // ── Categories ─────────────────────────────────────────────────────────
  const categoryIds: Record<string, string> = {};
  for (const [i, name] of CATEGORIES.entries()) {
    const c = await prisma.foodCategory.upsert({
      where: { slug: slugify(name) },
      update: { sortOrder: i },
      create: { name, slug: slugify(name), sortOrder: i },
    });
    categoryIds[name] = c.id;
  }
  console.log(`  ✔ ${CATEGORIES.length} categories`);

  // ── Outlets, managers, menus, QR codes ────────────────────────────────
  for (const [i, o] of OUTLETS.entries()) {
    const slug = slugify(o.name);
    const outlet = await prisma.outlet.upsert({
      where: { slug },
      update: { ...o },
      create: { ...o, slug },
    });

    const email = `manager${i + 1}@campus.com`;
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash: managerHash,
        role: "MANAGER",
        firstName: "Manager",
        lastName: o.name,
        managerProfile: { create: { outletId: outlet.id } },
      },
    });

    for (const item of MENUS[o.name] ?? []) {
      const itemSlug = slugify(item.name);
      await prisma.menuItem.upsert({
        where: { outletId_slug: { outletId: outlet.id, slug: itemSlug } },
        update: { price: item.price },
        create: {
          outletId: outlet.id,
          categoryId: categoryIds[item.category],
          name: item.name,
          slug: itemSlug,
          description: item.description ?? `${item.name} freshly prepared at ${o.name}.`,
          price: item.price,
          dietaryType: item.dietaryType ?? "VEG",
          preparationTime: item.prep ?? 10,
          calories: item.calories,
          protein: item.protein,
        },
      });
    }

    // One active QR token per outlet (opaque random token, no secrets/DB ids)
    const existingQr = await prisma.qRCode.findFirst({ where: { outletId: outlet.id, isActive: true } });
    if (!existingQr) {
      await prisma.qRCode.create({
        data: { outletId: outlet.id, token: crypto.randomBytes(24).toString("base64url") },
      });
    }

    // Seed sample ingredients for smart inventory management
    const sampleIngredients = [
      { name: "Bread Slices", unit: "pcs", currentStock: 120, minStockLevel: 20, costPerUnit: 2.5 },
      { name: "Cheese", unit: "g", currentStock: 2500, minStockLevel: 500, costPerUnit: 0.6 },
      { name: "Fresh Vegetables", unit: "g", currentStock: 5000, minStockLevel: 1000, costPerUnit: 0.15 },
      { name: "Milk", unit: "ml", currentStock: 8000, minStockLevel: 1500, costPerUnit: 0.06 },
    ];
    for (const ing of sampleIngredients) {
      await prisma.ingredient.upsert({
        where: { outletId_name: { outletId: outlet.id, name: ing.name } },
        update: {},
        create: { outletId: outlet.id, ...ing },
      });
    }
    console.log(`  ✔ ${o.name} (${email}) — ${(MENUS[o.name] ?? []).length} items`);
  }

  // ── Demo student ───────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { email: "student@campus.com" },
    update: {},
    create: {
      email: "student@campus.com",
      passwordHash: studentHash,
      role: "STUDENT",
      firstName: "Demo",
      lastName: "Student",
      studentProfile: { create: { enrollmentNo: "DEMO001", department: "Computer Engineering", year: 3, dietaryType: "VEG" } },
      preferences: { create: {} },
    },
  });
  console.log("  ✔ Demo student: student@campus.com");
  console.log("✅ Seed complete (development data only)");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
