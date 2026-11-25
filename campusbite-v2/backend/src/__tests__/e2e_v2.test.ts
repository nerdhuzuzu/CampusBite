import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import nodemailer from "nodemailer";
import { app, httpServer } from "../server.js";
import { queryRows, execQuery, ensureV2Schema } from "../config/db.js";
import {
  normalizeEmailAddress,
  buildCampusBiteOtpEmailHtml,
  setTestNodemailerTransport,
  OTP_EXPIRY_MINUTES,
  SMS_OTP_ENABLED,
} from "../services/otp.service.js";

describe("CampusBite V2 — Final Email-Only Gmail SMTP OTP & End-to-End Regression Suite", () => {
  let adminToken = "";
  let customerEmailToken = "";
  let managerToken = "";
  let manager2Token = "";

  let establishmentId = "";
  let establishment2Id = "";
  let categoryId = "";
  let menuItemId = "";
  let uploadedImageUrl = "";
  let orderId = "";
  let addressId = "";

  // Captures emails dispatched through the Nodemailer SMTP pipeline (since API responses NEVER return raw OTPs)
  const capturedEmails: Array<{
    to: string;
    subject: string;
    text: string;
    html: string;
    extractedOtp: string;
  }> = [];

  const testSuffix = Date.now().toString().slice(-6);
  const customer1Email = `cust1.${testSuffix}@gmail.com`;
  const managerEmail = `mgr.${testSuffix}@campusbite-v2.test`;
  const manager2Email = `mgr2.${testSuffix}@campusbite-v2.test`;

  beforeAll(async () => {
    await ensureV2Schema();
    const rows = await queryRows("SELECT DATABASE() as db");
    expect((rows[0] as any).db).toBe("campusbite_v2");

    // Configure an in-memory Nodemailer stream transport so we test the real Nodemailer sendMail pipeline
    // while verifying that the HTTP API never leaks or returns OTP codes.
    const testTransporter = nodemailer.createTransport({
      jsonTransport: true,
    });
    const origSendMail = testTransporter.sendMail.bind(testTransporter);
    testTransporter.sendMail = (async (mailOptions: any) => {
      const info = await origSendMail(mailOptions);
      const text = String(mailOptions.text || "");
      const match = text.match(/VERIFICATION CODE:\s*(\d{6})/);
      capturedEmails.push({
        to: String(mailOptions.to || ""),
        subject: String(mailOptions.subject || ""),
        text,
        html: String(mailOptions.html || ""),
        extractedOtp: match ? match[1] : "",
      });
      return info;
    }) as any;
    testTransporter.verify = (async () => true) as any;

    setTestNodemailerTransport(testTransporter);
  });

  afterAll(async () => {
    setTestNodemailerTransport(null);

    // Clean up test records so campusbite_v2 remains a clean production database with 0 demo records
    await execQuery(`DELETE FROM reviews`);
    await execQuery(`DELETE FROM payments`);
    await execQuery(`DELETE FROM order_items`);
    await execQuery(`DELETE FROM orders`);
    await execQuery(`DELETE FROM inventory_movements`);
    await execQuery(`DELETE FROM inventory`);
    await execQuery(`DELETE FROM menu_images`);
    await execQuery(`DELETE FROM menu_items`);
    await execQuery(`DELETE FROM menu_categories`);
    await execQuery(`DELETE FROM canteen_managers`);
    await execQuery(`DELETE FROM canteens`);
    await execQuery(`DELETE FROM wallet_ledger`);
    await execQuery(`DELETE FROM addresses`);
    await execQuery(`DELETE FROM customer_budgets`);
    await execQuery(`DELETE FROM customer_preferences`);
    await execQuery(`DELETE FROM notifications`);
    await execQuery(`DELETE FROM otp_verifications`);
    await execQuery(`DELETE FROM sessions`);
    await execQuery(`DELETE FROM users WHERE email != ? OR email IS NULL`, [
      process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@campusbite-v2.com",
    ]);
    await execQuery(`DELETE FROM audit_logs WHERE action != 'BOOTSTRAP_ADMIN'`);

    httpServer.close();
  });

  // =========================================================================
  // TEST 0 — SMS DISABLED & GMAIL EMAIL-ONLY CONFIGURATION DIAGNOSTICS
  // =========================================================================
  describe("Test 0 — SMS Disabled Enforcement & Gmail SMTP Diagnostics (Requirements 1, 2, 7)", () => {
    it("confirms SMS_OTP_ENABLED is false and blocks any SMS OTP requests with 400 SMS_VERIFICATION_DISABLED", async () => {
      expect(SMS_OTP_ENABLED).toBe(false);

      const smsSendAttempt = await request(app)
        .post("/api/v2/auth/customer/send-otp")
        .send({
          target: "+919876543210",
          channel: "SMS",
          purpose: "SIGNUP",
        });

      expect(smsSendAttempt.status).toBe(400);
      expect(smsSendAttempt.body.failureCategory).toBe(
        "SMS_VERIFICATION_DISABLED"
      );

      const smsRegAttempt = await request(app)
        .post("/api/v2/auth/customer/register")
        .send({
          fullName: "Blocked SMS User",
          channel: "SMS",
          email: "blocked@gmail.com",
          otp: "123456",
          password: "Password@123!",
          confirmPassword: "Password@123!",
        });

      expect(smsRegAttempt.status).toBe(400);
      expect(smsRegAttempt.body.failureCategory).toBe(
        "SMS_VERIFICATION_DISABLED"
      );
    });

    it("generates branded Gmail HTML template and reports SMS disabled in /api/v2/auth/otp-status without leaking secrets", async () => {
      expect(OTP_EXPIRY_MINUTES).toBe(5);
      const emailCheck = normalizeEmailAddress("  TestUser@Gmail.com ");
      expect(emailCheck.valid).toBe(true);
      expect(emailCheck.email).toBe("testuser@gmail.com");

      const tpl = buildCampusBiteOtpEmailHtml({
        otpCode: "482910",
        purpose: "SIGNUP",
        recipientEmail: "testuser@gmail.com",
      });
      expect(tpl.subject).toBe("Your CampusBite Verification Code");
      expect(tpl.html).toContain("CAMPUSBITE");
      expect(tpl.html).toContain("5 minutes");

      const statusRes = await request(app).get("/api/v2/auth/otp-status");
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.sms.enabled).toBe(false);
      expect(statusRes.body.data.sms.status).toBe("DISABLED");
      expect(statusRes.body.data.security.expiryMinutes).toBe(5);
      expect(statusRes.body.data.security.resendCooldownSeconds).toBe(30);
    });
  });

  // =========================================================================
  // TEST A — EMAIL-ONLY CUSTOMER REGISTRATION, LOGIN & PASSWORD RECOVERY
  // =========================================================================
  describe("Test A — Gmail Email-Only Customer Registration, Login & Password Recovery (Requirements 3, 4, 5)", () => {
    it("registers Customer via Gmail Email OTP (never returning OTP in API response), enforces 30s cooldown, persists email_verified=1, logs in, and resets password via Gmail OTP", async () => {
      // 1. Request Email OTP
      const sendRes = await request(app)
        .post("/api/v2/auth/customer/send-otp")
        .send({ target: customer1Email, channel: "EMAIL", purpose: "SIGNUP" });

      expect(sendRes.status).toBe(200);
      expect(sendRes.body.success).toBe(true);
      expect(sendRes.body.data.channel).toBe("EMAIL");
      expect(sendRes.body.data.deliveryStatus).toBe("PROVIDER_ACCEPTED");
      // Strictly verify that raw OTP is NEVER returned in API response (Requirement 4)
      expect(sendRes.body.data.dispatchedOtpForTesting).toBeUndefined();
      expect(sendRes.body.data.otp).toBeUndefined();

      // Retrieve the OTP from the captured Nodemailer email
      const sentMail = capturedEmails.find((m) => m.to === customer1Email);
      expect(sentMail).toBeTruthy();
      const otpCode = sentMail!.extractedOtp;
      expect(otpCode).toMatch(/^\d{6}$/);

      // 2. Test 30-second Resend Cooldown
      const cooldownRes = await request(app)
        .post("/api/v2/auth/customer/send-otp")
        .send({ target: customer1Email, channel: "EMAIL", purpose: "SIGNUP" });
      expect(cooldownRes.status).toBe(429);
      expect(cooldownRes.body.failureCategory).toBe(
        "OTP_RESEND_COOLDOWN_ACTIVE"
      );

      // 3. Verify Email OTP
      const verifyRes = await request(app)
        .post("/api/v2/auth/customer/verify-otp")
        .send({ target: customer1Email, otp: otpCode, purpose: "SIGNUP" });
      expect(verifyRes.status).toBe(200);

      // 4. Complete Customer Registration (No mobile number required!)
      const regRes = await request(app)
        .post("/api/v2/auth/customer/register")
        .send({
          fullName: "Aarav Customer Gmail",
          channel: "EMAIL",
          email: customer1Email,
          otp: otpCode,
          password: "Customer@2026!",
          confirmPassword: "Customer@2026!",
        });

      expect(regRes.status).toBe(201);
      expect(regRes.body.data.user.role).toBe("CUSTOMER");
      expect(regRes.body.data.user.email).toBe(customer1Email);
      expect(regRes.body.data.user.emailVerified).toBe(true);
      expect(regRes.body.data.user.phone).toBeNull();

      // 5. Verify MySQL persistence
      const dbUser = await queryRows(
        "SELECT email_verified, phone_verified, phone FROM users WHERE email = ?",
        [customer1Email]
      );
      expect((dbUser[0] as any).email_verified).toBe(1);
      expect((dbUser[0] as any).phone_verified).toBe(0);
      expect((dbUser[0] as any).phone).toBeNull();

      // 6. Test Reused OTP Rejection (One-time verification enforcement)
      const reusedVerify = await request(app)
        .post("/api/v2/auth/customer/verify-otp")
        .send({ target: customer1Email, otp: otpCode, purpose: "SIGNUP" });
      expect(reusedVerify.status).toBe(400);
      expect(reusedVerify.body.failureCategory).toBe("OTP_ALREADY_USED");

      // 7. Test Password Recovery via Gmail OTP (Requirement 5)
      const resetSend = await request(app)
        .post("/api/v2/auth/customer/send-otp")
        .set("x-test-bypass-cooldown", "1")
        .send({
          target: customer1Email,
          channel: "EMAIL",
          purpose: "RESET_PASSWORD",
        });
      expect(resetSend.status).toBe(200);

      const resetMail = [...capturedEmails]
        .reverse()
        .find((m) => m.to === customer1Email);
      expect(resetMail).toBeTruthy();

      const resetConfirm = await request(app)
        .post("/api/v2/auth/customer/reset-password")
        .send({
          target: customer1Email,
          otp: resetMail!.extractedOtp,
          newPassword: "NewCustomer@2026!",
        });
      expect(resetConfirm.status).toBe(200);

      // 8. Login with newly reset password
      const loginRes = await request(app)
        .post("/api/v2/auth/customer/login")
        .send({ identifier: customer1Email, password: "NewCustomer@2026!" });
      expect(loginRes.status).toBe(200);
      customerEmailToken = loginRes.body.data.token;
      expect(customerEmailToken).toBeTruthy();

      // 9. Optional mobile number update in Customer Profile
      const profRes = await request(app)
        .patch("/api/v2/auth/customer/profile")
        .set("Authorization", `Bearer ${customerEmailToken}`)
        .send({ fullName: "Aarav Customer Gmail", phone: "9876543210" });
      expect(profRes.status).toBe(200);
      expect(profRes.body.data.phone).toBe("+919876543210");
    });
  });

  // =========================================================================
  // TEST B — MANAGER MANAGEMENT & ESTABLISHMENT CREATION
  // =========================================================================
  describe("Test B — Admin Login, SMTP Health Check, Establishment Creation & Manager Assignment", () => {
    it("logs in as Bootstrap Admin, verifies SMTP health endpoint, creates an Establishment, creates a Manager, and verifies Manager scoped login", async () => {
      const adminLogin = await request(app)
        .post("/api/v2/auth/admin/login")
        .send({
          identifier:
            process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@campusbite-v2.com",
          password: process.env.BOOTSTRAP_ADMIN_PASSWORD || "AdminV2@2026!",
        });

      expect(adminLogin.status).toBe(200);
      adminToken = adminLogin.body.data.token;

      // Admin tests SMTP connection health (Requirement 7)
      const smtpVerifyRes = await request(app)
        .post("/api/v2/auth/smtp-verify")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(smtpVerifyRes.status).toBe(200);
      expect(smtpVerifyRes.body.data.verifyResult.verified).toBe(true);
      expect(smtpVerifyRes.body.data.diagnostics.sms.enabled).toBe(false);

      const createEst = await request(app)
        .post("/api/v2/admin/establishments")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Artisan Roast & Kitchen",
          type: "CAFE",
          location: "North Academic Quadrangle",
          description: "Specialty coffee, sourdough sandwiches, and hot bowls.",
          contactEmail: "artisan@campusbite-v2.test",
          contactPhone: "+919900112233",
          openingTime: "08:00",
          closingTime: "21:00",
          status: "ACTIVE",
        });

      expect(createEst.status).toBe(201);
      establishmentId = createEst.body.data.id;

      const createEst2 = await request(app)
        .post("/api/v2/admin/establishments")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Secondary Juice Bar",
          type: "FOOD_STALL",
          location: "Sports Complex",
          status: "ACTIVE",
        });
      expect(createEst2.status).toBe(201);
      establishment2Id = createEst2.body.data.id;

      const createMgr = await request(app)
        .post("/api/v2/admin/managers")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          fullName: "Rohan Canteen Manager",
          email: managerEmail,
          phone: `+919777${testSuffix}`,
          password: "Manager@2026!",
          canteenId: establishmentId,
        });
      expect(createMgr.status).toBe(201);

      const createMgr2 = await request(app)
        .post("/api/v2/admin/managers")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          fullName: "Vikram Stall Manager",
          email: manager2Email,
          password: "Manager2@2026!",
          canteenId: establishment2Id,
        });
      expect(createMgr2.status).toBe(201);

      const mgrLogin = await request(app)
        .post("/api/v2/auth/manager/login")
        .send({ identifier: managerEmail, password: "Manager@2026!" });
      expect(mgrLogin.status).toBe(200);
      managerToken = mgrLogin.body.data.token;

      const mgr2Login = await request(app)
        .post("/api/v2/auth/manager/login")
        .send({ identifier: manager2Email, password: "Manager2@2026!" });
      expect(mgr2Login.status).toBe(200);
      manager2Token = mgr2Login.body.data.token;
    });
  });

  // =========================================================================
  // TEST C — FOOD ITEM CREATION & PERSISTENT IMAGE UPLOAD
  // =========================================================================
  describe("Test C — Manager Menu Category, Image Upload & Food Item Persistence", () => {
    it("uploads a real image, creates a category and food item in MySQL, and verifies customer visibility", async () => {
      const pngBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64"
      );

      const uploadRes = await request(app)
        .post("/api/v2/manager/upload")
        .set("Authorization", `Bearer ${managerToken}`)
        .attach("image", pngBuffer, {
          filename: "paneer-bowl.png",
          contentType: "image/png",
        });

      expect(uploadRes.status).toBe(201);
      uploadedImageUrl = uploadRes.body.data.imageUrl;
      expect(uploadedImageUrl).toContain("/api/v2/public/media/");

      // Verify persistent MySQL LONGBLOB media endpoint serves the binary image
      const mediaRes = await request(app).get(uploadedImageUrl);
      expect(mediaRes.status).toBe(200);
      expect(mediaRes.headers["content-type"]).toContain("image/png");

      const catRes = await request(app)
        .post("/api/v2/manager/categories")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          name: "Signature Bowls",
          description: "Freshly cooked grain and protein bowls",
          sortOrder: 1,
        });
      expect(catRes.status).toBe(201);
      categoryId = catRes.body.data.id;

      const itemRes = await request(app)
        .post("/api/v2/manager/menu")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          name: "Smoky Peri-Peri Paneer Rice Bowl",
          description:
            "Char-grilled cottage cheese with herbed cilantro rice and peri-peri glaze.",
          price: 180,
          categoryId,
          imageUrl: uploadedImageUrl,
          dietaryType: "VEG",
          preparationTime: 12,
          stockQuantity: 25,
          isAvailable: true,
        });

      expect(itemRes.status).toBe(201);
      menuItemId = itemRes.body.data.id;

      // Create an unavailable / out-of-stock item to verify public guests see unavailable items labeled properly
      const unavailRes = await request(app)
        .post("/api/v2/manager/menu")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          name: "Sold-Out Truffle Fries",
          description: "Crispy fries with truffle seasoning.",
          price: 140,
          categoryId,
          dietaryType: "VEG",
          preparationTime: 8,
          stockQuantity: 0,
          isAvailable: false,
        });
      expect(unavailRes.status).toBe(201);

      // Unauthenticated public visitor browses active establishments without login
      const pubEstablishments = await request(app).get(
        "/api/v2/public/establishments"
      );
      expect(pubEstablishments.status).toBe(200);
      expect(pubEstablishments.body.data.length).toBeGreaterThanOrEqual(1);
      const pubEst = pubEstablishments.body.data.find(
        (e: any) => e.id === establishmentId
      );
      expect(pubEst).toBeTruthy();
      expect(pubEst.name).toBe("Artisan Roast & Kitchen");
      expect(pubEst.opening_time).toBe("08:00");
      expect(pubEst.closing_time).toBe("21:00");
      // Verify internal fields are NOT leaked in public establishment listing
      expect(pubEst.contact_email).toBeUndefined();
      expect(pubEst.contact_phone).toBeUndefined();
      expect(pubEst.qr_token).toBeUndefined();
      expect(pubEst.is_deleted).toBeUndefined();

      // Unauthenticated public visitor opens outlet menu without login
      const pubMenu = await request(app).get(
        `/api/v2/public/establishments/${establishmentId}/menu`
      );
      expect(pubMenu.status).toBe(200);
      expect(pubMenu.body.data.categories.length).toBe(1);
      expect(pubMenu.body.data.items.length).toBe(2);
      const availItem = pubMenu.body.data.items.find(
        (i: any) => i.id === menuItemId
      );
      const soldOutItem = pubMenu.body.data.items.find(
        (i: any) => i.name === "Sold-Out Truffle Fries"
      );
      expect(availItem.is_available).toBe(1);
      expect(soldOutItem.is_available).toBe(0);
      expect(soldOutItem.stock_quantity).toBe(0);

      // Unauthenticated guest attempting to place an order directly is blocked with 401
      const unauthOrderAttempt = await request(app)
        .post("/api/v2/customer/orders")
        .send({
          canteenId: establishmentId,
          items: [{ menuItemId, quantity: 1 }],
          paymentMethod: "CASH",
        });
      expect(unauthOrderAttempt.status).toBe(401);

      // Unauthenticated guest attempting to access private customer orders, wallet, or spending is blocked with 401
      expect(
        (await request(app).get("/api/v2/customer/orders")).status
      ).toBe(401);
      expect(
        (await request(app).get("/api/v2/customer/wallet")).status
      ).toBe(401);
      expect(
        (await request(app).get("/api/v2/customer/spending-analytics")).status
      ).toBe(401);
      expect(
        (await request(app).get("/api/v2/manager/orders")).status
      ).toBe(401);
    });
  });

  // =========================================================================
  // TEST D — ORDER WORKFLOW & REAL-TIME STATUS LIFECYCLE
  // =========================================================================
  describe("Test D — Customer Checkout, Server-Side Pricing, Inventory Lock & Manager Order Fulfillment", () => {
    it("tops up wallet, places order with server-side tax calculation, and transitions ACCEPTED -> PREPARING -> READY -> COMPLETED", async () => {
      const addrRes = await request(app)
        .post("/api/v2/customer/addresses")
        .set("Authorization", `Bearer ${customerEmailToken}`)
        .send({
          label: "Library Study Desk",
          buildingOrBlock: "Central Library",
          roomOrLandmark: "Floor 2 Reading Hall",
        });
      expect(addrRes.status).toBe(201);
      addressId = addrRes.body.data.id;

      const topupRes = await request(app)
        .post("/api/v2/customer/wallet/topup")
        .set("Authorization", `Bearer ${customerEmailToken}`)
        .send({ amount: 500 });
      expect(topupRes.status).toBe(201);

      const orderRes = await request(app)
        .post("/api/v2/customer/orders")
        .set("Authorization", `Bearer ${customerEmailToken}`)
        .send({
          canteenId: establishmentId,
          items: [{ menuItemId, quantity: 2 }],
          paymentMethod: "WALLET",
          addressId,
          specialInstructions: "Extra peri-peri sauce please",
          idempotencyKey: `idem-${Date.now()}`,
        });

      expect(orderRes.status).toBe(201);
      orderId = orderRes.body.data.id;
      expect(Number(orderRes.body.data.total_amount)).toBe(378);

      for (const nextStatus of [
        "ACCEPTED",
        "PREPARING",
        "READY",
        "COMPLETED",
      ]) {
        const statusRes = await request(app)
          .patch(`/api/v2/manager/orders/${orderId}/status`)
          .set("Authorization", `Bearer ${managerToken}`)
          .send({ status: nextStatus });
        expect(statusRes.status).toBe(200);
      }

      const revRes = await request(app)
        .post("/api/v2/customer/reviews")
        .set("Authorization", `Bearer ${customerEmailToken}`)
        .send({
          orderId,
          canteenId: establishmentId,
          menuItemId,
          rating: 5,
          comment: "Fresh, hot, and super fast service!",
        });
      expect(revRes.status).toBe(201);

      // Verify Customer Spending Analytics & Monthly Budget System (Sections 7, 8)
      const budgetSetRes = await request(app)
        .put("/api/v2/customer/budget")
        .set("Authorization", `Bearer ${customerEmailToken}`)
        .send({
          monthlyLimit: 300,
          alertThresholdPct: 75,
          restrictSpending: false,
          isEnabled: true,
          dietaryType: "VEG",
          spiceLevel: "MEDIUM",
          allergies: "Peanuts",
        });
      expect(budgetSetRes.status).toBe(200);
      expect(budgetSetRes.body.data.monthlyLimit).toBe(300);

      const spendRes = await request(app)
        .get("/api/v2/customer/spending-analytics")
        .set("Authorization", `Bearer ${customerEmailToken}`);
      expect(spendRes.status).toBe(200);
      expect(spendRes.body.data.summary.currentMonthSpent).toBeGreaterThanOrEqual(378);
      expect(spendRes.body.data.budget.alertLevel).toBe("LIMIT_REACHED");
      expect(spendRes.body.data.preferences.dietaryType).toBe("VEG");

      // Enable strict spending restriction and verify order blocking when budget is exceeded
      await request(app)
        .put("/api/v2/customer/budget")
        .set("Authorization", `Bearer ${customerEmailToken}`)
        .send({
          monthlyLimit: 300,
          alertThresholdPct: 75,
          restrictSpending: true,
          isEnabled: true,
        });

      const blockedOrderRes = await request(app)
        .post("/api/v2/customer/orders")
        .set("Authorization", `Bearer ${customerEmailToken}`)
        .send({
          canteenId: establishmentId,
          items: [{ menuItemId, quantity: 1 }],
          paymentMethod: "CASH",
        });
      expect(blockedOrderRes.status).toBe(400);
      expect(blockedOrderRes.body.error).toContain("Monthly spending restriction reached");

      // Cross-establishment price comparison endpoint
      const compareRes = await request(app).get(
        "/api/v2/public/menu/compare?q=Paneer"
      );
      expect(compareRes.status).toBe(200);
      expect(compareRes.body.data.length).toBeGreaterThanOrEqual(1);

      // Manager Analytics & Settings verification (Section 9)
      const mgrAnalytics = await request(app)
        .get("/api/v2/manager/analytics")
        .set("Authorization", `Bearer ${managerToken}`);
      expect(mgrAnalytics.status).toBe(200);
      expect(mgrAnalytics.body.data.summary.totalRevenue).toBeGreaterThanOrEqual(378);
      expect(Array.isArray(mgrAnalytics.body.data.revenueTrend)).toBe(true);
      expect(Array.isArray(mgrAnalytics.body.data.categoryRevenue)).toBe(true);

      const mgrSettings = await request(app)
        .patch("/api/v2/manager/settings")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          openingTime: "07:30",
          closingTime: "21:30",
          description: "Updated gourmet kitchen hours",
          contactPhone: "+919900112233",
        });
      expect(mgrSettings.status).toBe(200);

      // Admin Platform Analytics verification (Section 10)
      const adminOverview = await request(app)
        .get("/api/v2/admin/overview")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(adminOverview.status).toBe(200);
      expect(adminOverview.body.data.summary.totalRevenue).toBeGreaterThanOrEqual(378);
      expect(Array.isArray(adminOverview.body.data.establishmentBreakdown)).toBe(true);
      expect(Array.isArray(adminOverview.body.data.financialTrend)).toBe(true);
    }, 15000);
  });

  // =========================================================================
  // TEST E — ADMIN CONTROL: RENAME, SNAPSHOT INTEGRITY, SUSPEND & SAFE DELETE
  // =========================================================================
  describe("Test E — Admin Establishment Rename, Snapshot Preservation, Suspension & Safe Deletion", () => {
    it("renames establishment by permanent ID while preserving historical order snapshots, suspends ordering, and safely archives/deletes", async () => {
      const renameRes = await request(app)
        .put(`/api/v2/admin/establishments/${establishmentId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "The Grand Campus Bistro",
          type: "CANTEEN",
          location: "Central Student Plaza",
        });
      expect(renameRes.status).toBe(200);

      const histOrders = await queryRows(
        "SELECT canteen_name_snapshot FROM orders WHERE id = ?",
        [orderId]
      );
      expect((histOrders[0] as any).canteen_name_snapshot).toBe(
        "Artisan Roast & Kitchen"
      );

      const suspendRes = await request(app)
        .patch(`/api/v2/admin/establishments/${establishmentId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "SUSPENDED" });
      expect(suspendRes.status).toBe(200);

      const safeDeleteRes = await request(app)
        .delete(`/api/v2/admin/establishments/${establishmentId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(safeDeleteRes.status).toBe(200);
      expect(safeDeleteRes.body.deletionMode).toBe(
        "ARCHIVED_PRESERVING_FINANCIAL_HISTORY"
      );

      const permDeleteRes = await request(app)
        .delete(`/api/v2/admin/establishments/${establishment2Id}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(permDeleteRes.status).toBe(200);
      expect(permDeleteRes.body.deletionMode).toBe("PERMANENT_DELETE");
    });
  });

  // =========================================================================
  // TEST F & G — SECURITY, OTP EXPIRY, RBAC & INPUT VALIDATION
  // =========================================================================
  describe("Test F & G — Security, Expired OTP, Invalid OTP, RBAC Isolation & Malicious Upload Protection", () => {
    it("enforces unauthenticated 401, customer-to-admin 403, cross-manager 403, duplicate email 409, invalid OTP 400, and expired OTP 400", async () => {
      const unauth = await request(app).get("/api/v2/admin/overview");
      expect(unauth.status).toBe(401);

      const custToAdmin = await request(app)
        .get("/api/v2/admin/overview")
        .set("Authorization", `Bearer ${customerEmailToken}`);
      expect(custToAdmin.status).toBe(403);

      await execQuery("UPDATE menu_items SET is_deleted = 0 WHERE id = ?", [
        menuItemId,
      ]);
      const crossMgr = await request(app)
        .put(`/api/v2/manager/menu/${menuItemId}`)
        .set("Authorization", `Bearer ${manager2Token}`)
        .send({ name: "UnauthorizedTamper", price: 1 });
      expect(crossMgr.status).toBe(403);

      // Duplicate email registration attempt -> 409
      const dupOtp = await request(app)
        .post("/api/v2/auth/customer/send-otp")
        .send({ target: customer1Email, channel: "EMAIL", purpose: "SIGNUP" });
      expect(dupOtp.status).toBe(409);

      // Invalid OTP code -> 400
      const freshEmail = `invalid.${testSuffix}@gmail.com`;
      await request(app)
        .post("/api/v2/auth/customer/send-otp")
        .send({ target: freshEmail, channel: "EMAIL", purpose: "SIGNUP" });

      const freshMail = [...capturedEmails]
        .reverse()
        .find((m) => m.to === freshEmail);
      expect(freshMail).toBeTruthy();

      const badVerify = await request(app)
        .post("/api/v2/auth/customer/verify-otp")
        .send({ target: freshEmail, otp: "000000", purpose: "SIGNUP" });
      expect(badVerify.status).toBe(400);
      expect(badVerify.body.failureCategory).toBe("INVALID_OTP_CODE");

      // Expired OTP test -> Force expires_at into the past and verify rejection
      await execQuery(
        "UPDATE otp_verifications SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE email = ?",
        [freshEmail]
      );
      const expiredVerify = await request(app)
        .post("/api/v2/auth/customer/verify-otp")
        .send({
          target: freshEmail,
          otp: freshMail!.extractedOtp,
          purpose: "SIGNUP",
        });
      expect(expiredVerify.status).toBe(400);
      expect(expiredVerify.body.failureCategory).toBe("OTP_EXPIRED");
    });
  });

  // =========================================================================
  // TEST H — V1 AND V2 INDEPENDENCE VERIFICATION
  // =========================================================================
  describe("Test H — CampusBite V1 and V2 Complete Independence", () => {
    it("verifies V2 uses campusbite_v2 exclusively", async () => {
      const healthRes = await request(app).get("/api/v2/health");
      expect(healthRes.status).toBe(200);
      expect(healthRes.body.data.database).toBe("campusbite_v2");
      expect(healthRes.body.data.status).toBe("connected");
    });
  });
});
