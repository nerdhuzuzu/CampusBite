import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../server.js";
import { prisma } from "../config/database.js";

describe("Campus Canteen Management System — Critical Acceptance Tests", () => {
  let studentCookie = "";
  let manager1Cookie = "";
  let adminCookie = "";
  let canteen1Id = "";
  let canteen2ItemId = "";
  let canteen1ItemId = "";
  let canteen1ItemPrice = 0;
  let canteen1QrToken = "";

  beforeAll(async () => {
    const toCookieHeader = (raw: string | string[] | undefined) =>
      (Array.isArray(raw) ? raw : raw ? [raw] : []).join("; ");

    // 1. Login as seeded student
    const studentRes = await request(app)
      .post("/api/auth/student/login")
      .send({ email: "student@campus.com", password: "Student@123" });
    expect(studentRes.status).toBe(200);
    studentCookie = toCookieHeader(studentRes.headers["set-cookie"]);

    // 2. Login as seeded Manager 1 (Canteen 1)
    const mgrRes = await request(app)
      .post("/api/auth/manager/login")
      .send({ email: "manager1@campus.com", password: "Manager@123" });
    expect(mgrRes.status).toBe(200);
    manager1Cookie = toCookieHeader(mgrRes.headers["set-cookie"]);
    canteen1Id = mgrRes.body.data.user.managerProfile.outletId;

    // 3. Login as seeded Super Admin
    const adminRes = await request(app)
      .post("/api/auth/admin/login")
      .send({ email: "admin@campus.com", password: "Admin@123" });
    expect(adminRes.status).toBe(200);
    adminCookie = toCookieHeader(adminRes.headers["set-cookie"]);

    // Fetch sample items & QR token from DB
    const c1Item = await prisma.menuItem.findFirst({
      where: { outletId: canteen1Id, isAvailable: true, deletedAt: null },
    });
    canteen1ItemId = c1Item!.id;
    canteen1ItemPrice = Number(c1Item!.price);

    const c2Item = await prisma.menuItem.findFirst({
      where: { outletId: { not: canteen1Id }, deletedAt: null },
    });
    canteen2ItemId = c2Item!.id;

    const qr = await prisma.qRCode.findFirst({
      where: { outletId: canteen1Id, isActive: true },
    });
    canteen1QrToken = qr!.token;
  });

  it("1. Unauthenticated requests return HTTP 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("2. A student cannot access manager or Super Admin APIs (HTTP 403)", async () => {
    const mgrRes = await request(app)
      .get("/api/manager/orders")
      .set("Cookie", studentCookie);
    expect(mgrRes.status).toBe(403);

    const adminRes = await request(app)
      .get("/api/admin/analytics")
      .set("Cookie", studentCookie);
    expect(adminRes.status).toBe(403);
  });

  it("3. A manager cannot modify another outlet's menu item (HTTP 403)", async () => {
    const res = await request(app)
      .patch(`/api/manager/menu/${canteen2ItemId}`)
      .set("Cookie", manager1Cookie)
      .send({ price: 999 });
    expect(res.status).toBe(403);
  });

  it("4. Super Admin can access centralized analytics across all 5 outlets", async () => {
    const res = await request(app)
      .get("/api/admin/analytics")
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.summary.totalOutlets).toBeGreaterThanOrEqual(5);
  });

  it("5. QR code token opens and verifies the exact assigned outlet", async () => {
    const res = await request(app).get(`/api/qr/${canteen1QrToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.outlet.id).toBe(canteen1Id);
    expect(Array.isArray(res.body.data.menuItems)).toBe(true);
  });

  it("6. Order totals are calculated by the backend and idempotency prevents duplicate orders", async () => {
    const idempotencyKey = `test-idem-${Date.now()}`;
    const orderRes1 = await request(app)
      .post("/api/orders")
      .set("Cookie", studentCookie)
      .send({
        outletId: canteen1Id,
        items: [{ menuItemId: canteen1ItemId, quantity: 2 }],
        paymentMethod: "PAY_AT_COUNTER",
        idempotencyKey,
      });

    expect(orderRes1.status).toBe(201);
    expect(Number(orderRes1.body.data.total)).toBe(canteen1ItemPrice * 2);

    // Duplicate submission with the same idempotencyKey returns the exact same order
    const orderRes2 = await request(app)
      .post("/api/orders")
      .set("Cookie", studentCookie)
      .send({
        outletId: canteen1Id,
        items: [{ menuItemId: canteen1ItemId, quantity: 2 }],
        paymentMethod: "PAY_AT_COUNTER",
        idempotencyKey,
      });

    expect(orderRes2.status).toBe(200);
    expect(orderRes2.body.data.id).toBe(orderRes1.body.data.id);
  });

  it("7. Unavailable food cannot be ordered (HTTP 400)", async () => {
    // Temporarily mark item unavailable
    await prisma.menuItem.update({
      where: { id: canteen1ItemId },
      data: { isAvailable: false },
    });

    const res = await request(app)
      .post("/api/orders")
      .set("Cookie", studentCookie)
      .send({
        outletId: canteen1Id,
        items: [{ menuItemId: canteen1ItemId, quantity: 1 }],
      });

    expect(res.status).toBe(400);

    // Restore availability
    await prisma.menuItem.update({
      where: { id: canteen1ItemId },
      data: { isAvailable: true },
    });
  });

  it("8. AI Chatbot and Recommendation Engine return database-grounded results", async () => {
    const recRes = await request(app)
      .post("/api/ai/recommendations")
      .set("Cookie", studentCookie)
      .send({ dietaryType: "VEG", budget: 120, limit: 4 });
    expect(recRes.status).toBe(200);
    expect(recRes.body.data.recommendations.length).toBeGreaterThan(0);

    const chatRes = await request(app)
      .post("/api/ai/chat")
      .set("Cookie", studentCookie)
      .send({ message: "Show me food under ₹60" });
    expect(chatRes.status).toBe(200);
    expect(chatRes.body.data.toolCalls.length).toBeGreaterThan(0);
    expect(chatRes.body.data.messageId).toBeTruthy();

    // Verify conversation history persistence in MySQL
    const convRes = await request(app)
      .get("/api/ai/conversations")
      .set("Cookie", studentCookie);
    expect(convRes.status).toBe(200);
    expect(convRes.body.data.messages.length).toBeGreaterThanOrEqual(2);

    // Record chat feedback in MySQL
    const fbRes = await request(app)
      .post("/api/ai/chat/feedback")
      .set("Cookie", studentCookie)
      .send({ messageId: chatRes.body.data.messageId, helpful: true });
    expect(fbRes.status).toBe(200);

    // Record recommendation feedback in MySQL
    const recFbRes = await request(app)
      .post("/api/ai/recommendations/feedback")
      .set("Cookie", studentCookie)
      .send({ menuItemId: canteen1ItemId, helpful: true });
    expect(recFbRes.status).toBe(200);
  });

  it("9. Refresh token endpoint rotates session cookies cleanly", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", studentCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe("STUDENT");
  });

  it("10. Manager can record live crowd headcount and update outlet settings", async () => {
    const crowdRes = await request(app)
      .post("/api/manager/crowd")
      .set("Cookie", manager1Cookie)
      .send({ peopleCount: 8 });
    expect(crowdRes.status).toBe(201);
    expect(crowdRes.body.data.isSimulated).toBe(false);

    const outletRes = await request(app)
      .patch("/api/manager/outlet")
      .set("Cookie", manager1Cookie)
      .send({ avgPrepTime: 14 });
    expect(outletRes.status).toBe(200);
    expect(outletRes.body.data.avgPrepTime).toBe(14);
  });
});
