import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";
import { execQuery, queryRows } from "../config/db.js";
import {
  authenticateV2,
  requireV2Role,
  signAccessToken,
  type V2Role,
} from "../middleware/auth.js";
import {
  issueAndSendOtp,
  verifySubmittedOtp,
  normalizeIndianMobile,
  normalizeEmailAddress,
  getOtpProvidersDiagnostics,
  verifySmtpConnectionHealth,
  OtpDeliveryError,
} from "../services/otp.service.js";

const router = Router();

const isProd = process.env.NODE_ENV === "production";
const COOKIE_OPTS = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? "none" : "lax") as "none" | "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

const sendOtpSchema = z.object({
  channel: z.string().default("EMAIL"),
  target: z.string().min(4).max(191),
  purpose: z.enum(["SIGNUP", "RESET_PASSWORD", "LOGIN"]).default("SIGNUP"),
});

const verifyOtpSchema = z.object({
  target: z.string().min(4).max(191),
  otp: z.string().length(6),
  purpose: z.enum(["SIGNUP", "RESET_PASSWORD", "LOGIN"]).default("SIGNUP"),
});

const customerRegisterSchema = z
  .object({
    fullName: z.string().min(2).max(160),
    channel: z.string().default("EMAIL"),
    email: z.string().min(4).max(191),
    phone: z.string().optional().nullable(),
    otp: z.string().length(6),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(1),
});

const resetPasswordSchema = z.object({
  target: z.string().min(4),
  otp: z.string().length(6),
  newPassword: z.string().min(8).max(128),
});

// ── 0. OTP Provider Diagnostics (Safe Diagnostic Endpoint — Never Exposes Secrets) ──
router.get("/auth/otp-status", async (_req: Request, res: Response) => {
  const diag = await getOtpProvidersDiagnostics();
  res.json({
    success: true,
    data: diag,
  });
});

router.post(
  "/auth/smtp-verify",
  authenticateV2,
  requireV2Role("ADMIN"),
  async (_req: Request, res: Response) => {
    const verifyResult = await verifySmtpConnectionHealth();
    const diag = await getOtpProvidersDiagnostics();
    res.json({
      success: true,
      data: {
        verifyResult,
        diagnostics: diag,
      },
    });
  }
);

// ── 1. Customer: Request Gmail / Email OTP (SMS OTP Disabled) ───────────────
router.post("/auth/customer/send-otp", async (req: Request, res: Response) => {
  try {
    const parsed = sendOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Invalid OTP request parameters.",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { channel, target, purpose } = parsed.data;

    // Enforce Email-Only OTP (Requirement 1)
    if (channel.toUpperCase() !== "EMAIL") {
      res.status(400).json({
        success: false,
        error:
          "Mobile SMS OTP verification is disabled. Please verify using your Gmail / Email address.",
        failureCategory: "SMS_VERIFICATION_DISABLED",
      });
      return;
    }

    const check = normalizeEmailAddress(target);
    if (!check.valid) {
      res.status(400).json({
        success: false,
        error: check.error,
        failureCategory: "INVALID_EMAIL_FORMAT",
      });
      return;
    }
    const canonicalEmail = check.email;

    if (purpose === "SIGNUP") {
      const existing = await queryRows<RowDataPacket[]>(
        "SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1",
        [canonicalEmail]
      );
      if (existing.length > 0) {
        res.status(409).json({
          success: false,
          error: "An account with this email address already exists.",
        });
        return;
      }
    } else if (purpose === "RESET_PASSWORD") {
      const existing = await queryRows<RowDataPacket[]>(
        "SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1",
        [canonicalEmail]
      );
      if (existing.length === 0) {
        res.status(404).json({
          success: false,
          error: "No customer account found with this email address.",
        });
        return;
      }
    }

    const result = await issueAndSendOtp({
      target: canonicalEmail,
      channel: "EMAIL",
      purpose,
      bypassCooldown: req.headers["x-test-bypass-cooldown"] === "1",
    });

    res.status(200).json({
      success: true,
      message: `Verification code sent via Gmail SMTP to ${canonicalEmail}.`,
      data: result,
    });
  } catch (err) {
    if (err instanceof OtpDeliveryError) {
      res.status(err.statusCode).json({
        success: false,
        error: err.message,
        failureCategory: err.failureCategory,
        setupGuidance: err.setupGuidance,
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: (err as Error).message || "Failed to send Email OTP.",
    });
  }
});

// ── 2. Customer: Verify Email OTP Code ──────────────────────────────────────
router.post("/auth/customer/verify-otp", async (req: Request, res: Response) => {
  try {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Enter a valid 6-digit OTP.",
      });
      return;
    }

    const verified = await verifySubmittedOtp({
      ...parsed.data,
      consumeOnSuccess: false,
    });
    res.json({
      success: true,
      message: "Email OTP verified successfully.",
      data: verified,
    });
  } catch (err) {
    if (err instanceof OtpDeliveryError) {
      res.status(err.statusCode).json({
        success: false,
        error: err.message,
        failureCategory: err.failureCategory,
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: (err as Error).message || "OTP verification failed.",
    });
  }
});

// ── 3. Customer: Complete Email-Only Registration (Mobile Optional, Not Required) ──
router.post("/auth/customer/register", async (req: Request, res: Response) => {
  try {
    if (req.body?.channel && String(req.body.channel).toUpperCase() !== "EMAIL") {
      res.status(400).json({
        success: false,
        error:
          "Mobile SMS OTP registration is disabled. Please register using Gmail / Email OTP verification.",
        failureCategory: "SMS_VERIFICATION_DISABLED",
      });
      return;
    }

    const parsed = customerRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Validation failed.",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { fullName, email, phone, otp, password } = parsed.data;

    const emailCheck = normalizeEmailAddress(email);
    if (!emailCheck.valid) {
      res.status(400).json({
        success: false,
        error: emailCheck.error || "A valid email address is required.",
      });
      return;
    }
    const emailVal = emailCheck.email;

    // Optional phone field (no mandatory phone verification)
    let phoneVal: string | null = null;
    if (phone && phone.trim().length > 0) {
      const mobileCheck = normalizeIndianMobile(phone.trim());
      phoneVal = mobileCheck.valid ? mobileCheck.e164 : phone.trim();
    }

    // Verify & consume the one-time Email OTP
    const verifiedOtp = await verifySubmittedOtp({
      target: emailVal,
      otp,
      purpose: "SIGNUP",
      consumeOnSuccess: true,
    });

    // Prevent duplicate email accounts
    const dupEmail = await queryRows<RowDataPacket[]>(
      "SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1",
      [emailVal]
    );
    if (dupEmail.length > 0) {
      res.status(409).json({
        success: false,
        error: "An account with this email address already exists.",
      });
      return;
    }

    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);

    await execQuery(
      `INSERT INTO users
       (id, role_id, full_name, email, phone, password_hash, email_verified, phone_verified, status)
       VALUES (?, 1, ?, ?, ?, ?, 1, 0, 'ACTIVE')`,
      [userId, fullName.trim(), emailVal, phoneVal, passwordHash]
    );

    // Link user_id to the verified OTP record in MySQL
    await execQuery(
      "UPDATE otp_verifications SET user_id = ? WHERE id = ?",
      [userId, verifiedOtp.verificationId]
    );

    await execQuery(
      `INSERT INTO audit_logs (id, actor_id, actor_role, entity_type, entity_id, action, new_name, metadata)
       VALUES (?, ?, 'CUSTOMER', 'USER', ?, 'CUSTOMER_REGISTERED', ?, ?)`,
      [
        crypto.randomUUID(),
        userId,
        userId,
        fullName.trim(),
        JSON.stringify({
          channel: "EMAIL",
          email: emailVal,
          phone: phoneVal,
          emailVerified: true,
          phoneVerified: false,
        }),
      ]
    );

    const token = signAccessToken({ id: userId, role: "CUSTOMER" });
    res.cookie("v2_token", token, COOKIE_OPTS).status(201).json({
      success: true,
      message: "Customer account verified and created.",
      data: {
        token,
        user: {
          id: userId,
          role: "CUSTOMER" as V2Role,
          fullName: fullName.trim(),
          email: emailVal,
          phone: phoneVal,
          emailVerified: true,
          phoneVerified: false,
        },
      },
    });
  } catch (err) {
    if (err instanceof OtpDeliveryError) {
      res.status(err.statusCode).json({
        success: false,
        error: err.message,
        failureCategory: err.failureCategory,
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: (err as Error).message || "Customer registration failed.",
    });
  }
});

// ── 4. Customer Login (Email + Password) ────────────────────────────────────
router.post("/auth/customer/login", async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Enter your email address and password.",
      });
      return;
    }

    const rawId = parsed.data.identifier.trim();
    const lowerId = rawId.toLowerCase();

    const rows = await queryRows<RowDataPacket[]>(
      `SELECT u.*, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE LOWER(u.email) = ? AND r.name = 'CUSTOMER'
       LIMIT 1`,
      [lowerId]
    );

    const user = rows[0];
    if (!user) {
      res.status(401).json({
        success: false,
        error: "Invalid customer email or password.",
      });
      return;
    }

    if (user.status !== "ACTIVE") {
      res.status(403).json({
        success: false,
        error: `Your customer account is ${user.status}.`,
      });
      return;
    }

    const valid = await bcrypt.compare(parsed.data.password, user.password_hash);
    if (!valid) {
      res.status(401).json({
        success: false,
        error: "Invalid customer email or password.",
      });
      return;
    }

    await execQuery("UPDATE users SET last_login_at = NOW() WHERE id = ?", [
      user.id,
    ]);

    const sessionId = crypto.randomUUID();
    const token = signAccessToken({ id: user.id, role: "CUSTOMER" });
    await execQuery(
      `INSERT INTO sessions (id, user_id, refresh_token_hash, ip_address, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
      [sessionId, user.id, await bcrypt.hash(token, 6), req.ip || null]
    );

    res.cookie("v2_token", token, COOKIE_OPTS).json({
      success: true,
      message: "Signed in to Customer Portal.",
      data: {
        token,
        user: {
          id: user.id,
          role: "CUSTOMER" as V2Role,
          fullName: user.full_name,
          email: user.email,
          phone: user.phone,
          emailVerified: Boolean(user.email_verified),
          phoneVerified: Boolean(user.phone_verified),
          walletBalance: Number(user.wallet_balance || 0),
        },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: (err as Error).message || "Customer login failed.",
    });
  }
});

// ── 5. Customer Password Reset via Gmail OTP ────────────────────────────────
router.post(
  "/auth/customer/reset-password",
  async (req: Request, res: Response) => {
    try {
      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: "Invalid password reset parameters.",
        });
        return;
      }

      const { target, otp, newPassword } = parsed.data;
      const verified = await verifySubmittedOtp({
        target,
        otp,
        purpose: "RESET_PASSWORD",
        consumeOnSuccess: true,
      });

      const rows = await queryRows<RowDataPacket[]>(
        "SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1",
        [verified.canonicalTarget]
      );

      if (rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Customer account not found.",
        });
        return;
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await execQuery("UPDATE users SET password_hash = ? WHERE id = ?", [
        passwordHash,
        rows[0].id,
      ]);

      res.json({
        success: true,
        message: "Password reset successfully. You may now sign in.",
      });
    } catch (err) {
      if (err instanceof OtpDeliveryError) {
        res.status(err.statusCode).json({
          success: false,
          error: err.message,
          failureCategory: err.failureCategory,
        });
        return;
      }
      res.status(400).json({
        success: false,
        error: (err as Error).message || "Password reset failed.",
      });
    }
  }
);

// ── 6. Canteen Manager Login ────────────────────────────────────────────────
router.post("/auth/manager/login", async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Enter your manager email/phone and password.",
      });
      return;
    }

    const identifier = parsed.data.identifier.trim().toLowerCase();
    const rows = await queryRows<RowDataPacket[]>(
      `SELECT u.*, r.name AS role_name, cm.canteen_id, c.name AS canteen_name, c.status AS canteen_status
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN canteen_managers cm ON cm.user_id = u.id
       LEFT JOIN canteens c ON c.id = cm.canteen_id
       WHERE (LOWER(u.email) = ? OR u.phone = ?) AND r.name = 'MANAGER'
       LIMIT 1`,
      [identifier, parsed.data.identifier.trim()]
    );

    const user = rows[0];
    if (!user) {
      res.status(401).json({
        success: false,
        error: "Invalid manager credentials.",
      });
      return;
    }

    if (user.status !== "ACTIVE") {
      res.status(403).json({
        success: false,
        error: `Manager account is ${user.status}.`,
      });
      return;
    }

    const valid = await bcrypt.compare(parsed.data.password, user.password_hash);
    if (!valid) {
      res.status(401).json({
        success: false,
        error: "Invalid manager credentials.",
      });
      return;
    }

    if (!user.canteen_id) {
      res.status(403).json({
        success: false,
        error: "This manager account is not assigned to any establishment yet.",
      });
      return;
    }

    await execQuery("UPDATE users SET last_login_at = NOW() WHERE id = ?", [
      user.id,
    ]);

    const token = signAccessToken({ id: user.id, role: "MANAGER" });
    res.cookie("v2_token", token, COOKIE_OPTS).json({
      success: true,
      message: "Signed in to Canteen Manager Console.",
      data: {
        token,
        user: {
          id: user.id,
          role: "MANAGER" as V2Role,
          fullName: user.full_name,
          email: user.email,
          phone: user.phone,
          canteenId: user.canteen_id,
          canteenName: user.canteen_name,
          canteenStatus: user.canteen_status,
        },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: (err as Error).message || "Manager login failed.",
    });
  }
});

// ── 7. Administrator Login ──────────────────────────────────────────────────
router.post("/auth/admin/login", async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Enter your administrator email and password.",
      });
      return;
    }

    const identifier = parsed.data.identifier.trim().toLowerCase();
    const rows = await queryRows<RowDataPacket[]>(
      `SELECT u.*, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE LOWER(u.email) = ? AND r.name = 'ADMIN'
       LIMIT 1`,
      [identifier]
    );

    const user = rows[0];
    if (!user) {
      res.status(401).json({
        success: false,
        error: "Invalid administrator credentials.",
      });
      return;
    }

    const valid = await bcrypt.compare(parsed.data.password, user.password_hash);
    if (!valid) {
      res.status(401).json({
        success: false,
        error: "Invalid administrator credentials.",
      });
      return;
    }

    await execQuery("UPDATE users SET last_login_at = NOW() WHERE id = ?", [
      user.id,
    ]);

    const token = signAccessToken({ id: user.id, role: "ADMIN" });
    res.cookie("v2_token", token, COOKIE_OPTS).json({
      success: true,
      message: "Authenticated as Platform Administrator.",
      data: {
        token,
        user: {
          id: user.id,
          role: "ADMIN" as V2Role,
          fullName: user.full_name,
          email: user.email,
          phone: user.phone,
        },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: (err as Error).message || "Administrator login failed.",
    });
  }
});

// ── 8. Current Authenticated Session & Profile Update (Optional Mobile Number) ──
router.get("/auth/me", authenticateV2, async (req: Request, res: Response) => {
  const rows = await queryRows<RowDataPacket[]>(
    `SELECT u.id, u.full_name, u.email, u.phone, u.email_verified, u.phone_verified,
            u.status, u.wallet_balance, u.created_at, u.last_login_at, r.name AS role_name,
            cm.canteen_id, c.name AS canteen_name, c.status AS canteen_status
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN canteen_managers cm ON cm.user_id = u.id
     LEFT JOIN canteens c ON c.id = cm.canteen_id
     WHERE u.id = ? LIMIT 1`,
    [req.user!.id]
  );

  const u = rows[0];
  res.json({
    success: true,
    data: {
      user: {
        id: u.id,
        role: u.role_name,
        fullName: u.full_name,
        email: u.email,
        phone: u.phone,
        emailVerified: Boolean(u.email_verified),
        phoneVerified: Boolean(u.phone_verified),
        status: u.status,
        walletBalance: Number(u.wallet_balance || 0),
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
        canteenId: u.canteen_id ?? null,
        canteenName: u.canteen_name ?? null,
        canteenStatus: u.canteen_status ?? null,
      },
    },
  });
});

router.patch(
  "/auth/customer/profile",
  authenticateV2,
  async (req: Request, res: Response) => {
    const { fullName, phone } = req.body as {
      fullName?: string;
      phone?: string;
    };
    if (fullName && fullName.trim().length >= 2) {
      await execQuery("UPDATE users SET full_name = ? WHERE id = ?", [
        fullName.trim(),
        req.user!.id,
      ]);
    }
    if (phone !== undefined) {
      const trimmed = phone ? phone.trim() : "";
      if (!trimmed) {
        await execQuery("UPDATE users SET phone = NULL WHERE id = ?", [
          req.user!.id,
        ]);
      } else {
        const mobileNorm = normalizeIndianMobile(trimmed);
        await execQuery("UPDATE users SET phone = ? WHERE id = ?", [
          mobileNorm.valid ? mobileNorm.e164 : trimmed,
          req.user!.id,
        ]);
      }
    }
    const updated = await queryRows<RowDataPacket[]>(
      "SELECT id, full_name, email, phone, email_verified, phone_verified, wallet_balance FROM users WHERE id = ?",
      [req.user!.id]
    );
    res.json({
      success: true,
      message: "Customer profile updated.",
      data: updated[0],
    });
  }
);

router.post("/auth/logout", (_req: Request, res: Response) => {
  res.clearCookie("v2_token", { path: "/" }).json({
    success: true,
    message: "Signed out.",
  });
});

export default router;
