import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import pino from "pino";
import type { RowDataPacket } from "mysql2/promise";
import { execQuery, queryRows } from "../config/db.js";

export type OtpChannel = "EMAIL" | "SMS";
export type OtpPurpose = "SIGNUP" | "RESET_PASSWORD" | "LOGIN";

export const OTP_EXPIRY_MINUTES = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_HOURLY_REQUESTS = 8;

/**
 * Mobile SMS OTP is explicitly disabled in active authentication flows.
 * Kept isolated for potential future activation.
 */
export const SMS_OTP_ENABLED = false;

/**
 * Structured logger that strictly redacts any sensitive credentials or OTP codes.
 */
export const otpLogger = pino({
  name: "campusbite-v2-otp-engine",
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: [
      "otp",
      "rawOtp",
      "otpHash",
      "apiKey",
      "password",
      "smtpPass",
      "authToken",
    ],
    censor: "[REDACTED]",
  },
});

// Track last SMTP connection & delivery telemetry in memory (never stores secrets or OTPs)
let lastSmtpDiagnostics: {
  connectionVerified: boolean | null;
  lastCheckedAt: string | null;
  lastDeliveryStatus: string | null;
  lastDeliveryAt: string | null;
  lastFailureCategory: string | null;
} = {
  connectionVerified: null,
  lastCheckedAt: null,
  lastDeliveryStatus: null,
  lastDeliveryAt: null,
  lastFailureCategory: null,
};

/**
 * Optional Indian Mobile Number normalizer used only for optional profile phone storage.
 */
export function normalizeIndianMobile(rawInput: string): {
  valid: boolean;
  e164: string;
  tenDigit: string;
  nineOnePrefix: string;
  error?: string;
} {
  const stripped = rawInput.replace(/[\s\-()]/g, "");

  if (/^(\+?91){2,}\d{10}$/.test(stripped)) {
    return {
      valid: false,
      e164: "",
      tenDigit: "",
      nineOnePrefix: "",
      error:
        "Duplicate country code (+91) detected. Enter a 10-digit Indian mobile number or +91 followed by 10 digits.",
    };
  }

  let tenDigit = "";
  if (/^[6-9]\d{9}$/.test(stripped)) {
    tenDigit = stripped;
  } else if (/^\+91[6-9]\d{9}$/.test(stripped)) {
    tenDigit = stripped.slice(3);
  } else if (/^91[6-9]\d{9}$/.test(stripped)) {
    tenDigit = stripped.slice(2);
  } else {
    return {
      valid: false,
      e164: "",
      tenDigit: "",
      nineOnePrefix: "",
      error:
        "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9 (with or without +91).",
    };
  }

  return {
    valid: true,
    e164: `+91${tenDigit}`,
    tenDigit,
    nineOnePrefix: `91${tenDigit}`,
  };
}

/**
 * Validates and normalizes an Email address.
 */
export function normalizeEmailAddress(rawInput: string): {
  valid: boolean;
  email: string;
  error?: string;
} {
  const email = rawInput.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(email) || email.length > 191) {
    return {
      valid: false,
      email: "",
      error: "Enter a valid email address (e.g., yourname@gmail.com).",
    };
  }
  return { valid: true, email };
}

/**
 * Builds the responsive, branded CampusBite V2 HTML email template.
 */
export function buildCampusBiteOtpEmailHtml(params: {
  otpCode: string;
  purpose: OtpPurpose;
  recipientEmail: string;
}): { subject: string; html: string; text: string } {
  const subject = "Your CampusBite Verification Code";
  const actionLabel =
    params.purpose === "RESET_PASSWORD"
      ? "reset your CampusBite V2 password"
      : "verify your email and complete your CampusBite V2 registration";

  const text = [
    "CampusBite — Centralized Campus Dining & Food Ordering Platform",
    "",
    `Welcome to CampusBite! Use the 6-digit verification code below to ${actionLabel}:`,
    "",
    `VERIFICATION CODE: ${params.otpCode}`,
    "",
    `This code expires in ${OTP_EXPIRY_MINUTES} minutes and can only be used once.`,
    "",
    "SECURITY WARNING: Never share this code with anyone. CampusBite staff will never ask for your OTP.",
    "If you did not request this code, please ignore this email or contact support@campusbite.com.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,0.05);">
          <!-- Brand Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#15294a 0%,#1e3a5f 60%,#0f172a 100%);padding:24px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="display:inline-block;background-color:#f97316;color:#ffffff;font-weight:800;font-size:13px;padding:5px 10px;border-radius:8px;letter-spacing:0.5px;">CAMPUSBITE</span>
                    <h1 style="margin:12px 0 0 0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Email Verification Code</h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Main Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">
                Hello,
              </p>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#334155;">
                Welcome to <strong>CampusBite</strong>! Use the six-digit verification code below to ${actionLabel}:
              </p>
              <!-- OTP Display Box -->
              <div style="background-color:#fff7ed;border:2px dashed #fdba74;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px 0;">
                <span style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#c2410c;margin-bottom:6px;">One-Time Verification Code</span>
                <span style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:800;letter-spacing:8px;color:#0f172a;">${params.otpCode}</span>
              </div>
              <!-- Expiry Info -->
              <p style="margin:0 0 16px 0;font-size:13px;line-height:1.5;color:#475569;">
                ⏱ <strong>Expiration:</strong> This code is valid for <strong>${OTP_EXPIRY_MINUTES} minutes</strong> and can only be used once.
              </p>
              <!-- Security Warning -->
              <div style="background-color:#f8fafc;border-left:4px solid #1e3a5f;padding:12px 16px;border-radius:6px;margin:0 0 24px 0;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#475569;">
                  🔒 <strong>Security Notice:</strong> Never share this verification code with anyone. CampusBite administrators or restaurant staff will never ask you for your OTP.
                </p>
              </div>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">
                Requested for: <strong style="color:#0f172a;">${params.recipientEmail}</strong><br />
                Need assistance? Contact CampusBite Support at <a href="mailto:support@campusbite.com" style="color:#ea580c;text-decoration:none;font-weight:600;">support@campusbite.com</a>.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f1f5f9;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:11px;color:#64748b;">
                © ${new Date().getFullYear()} CampusBite • Smart Campus Dining & Canteen Operations
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

export interface SendOtpResult {
  verificationId: string;
  target: string;
  channel: "EMAIL";
  expiresAt: string;
  expiryMinutes: number;
  resendCooldownSeconds: number;
  deliveryStatus: "PROVIDER_ACCEPTED";
  providerName: string;
  providerReferenceId: string | null;
  providerConfigured: boolean;
}

export class OtpDeliveryError extends Error {
  public readonly statusCode: number;
  public readonly failureCategory: string;
  public readonly setupGuidance?: string;

  constructor(params: {
    message: string;
    statusCode?: number;
    failureCategory: string;
    setupGuidance?: string;
  }) {
    super(params.message);
    this.name = "OtpDeliveryError";
    this.statusCode = params.statusCode ?? 503;
    this.failureCategory = params.failureCategory;
    this.setupGuidance = params.setupGuidance;
  }
}

// Custom test transport override hook so automated Vitest suites can test Nodemailer SMTP pipeline without returning OTPs in API responses
let customNodemailerTransport: nodemailer.Transporter | null = null;
export function setTestNodemailerTransport(t: nodemailer.Transporter | null) {
  customNodemailerTransport = t;
}

/**
 * Verifies live SMTP connection status without exposing credentials.
 */
export async function verifySmtpConnectionHealth(): Promise<{
  configured: boolean;
  verified: boolean;
  host: string;
  port: number;
  failureCategory: string | null;
}> {
  const host = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim();

  if (!customNodemailerTransport && (!host || !user || !pass)) {
    lastSmtpDiagnostics.connectionVerified = false;
    lastSmtpDiagnostics.lastCheckedAt = new Date().toISOString();
    lastSmtpDiagnostics.lastFailureCategory = "MISSING_SMTP_CREDENTIALS";
    return {
      configured: false,
      verified: false,
      host,
      port,
      failureCategory: "MISSING_SMTP_CREDENTIALS",
    };
  }

  const transporter =
    customNodemailerTransport ||
    nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port === 587,
      auth: { user, pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });

  try {
    await transporter.verify();
    lastSmtpDiagnostics.connectionVerified = true;
    lastSmtpDiagnostics.lastCheckedAt = new Date().toISOString();
    lastSmtpDiagnostics.lastFailureCategory = null;
    return {
      configured: true,
      verified: true,
      host,
      port,
      failureCategory: null,
    };
  } catch (err) {
    const errMsg = (err as Error).message || "";
    const category = /535|auth|credentials|username and password not accepted/i.test(
      errMsg
    )
      ? "SMTP_AUTH_REJECTED"
      : "SMTP_CONNECTION_ERROR";
    lastSmtpDiagnostics.connectionVerified = false;
    lastSmtpDiagnostics.lastCheckedAt = new Date().toISOString();
    lastSmtpDiagnostics.lastFailureCategory = category;
    return {
      configured: true,
      verified: false,
      host,
      port,
      failureCategory: category,
    };
  }
}

/**
 * Dispatches an Email OTP via configured Gmail SMTP / Nodemailer with STARTTLS.
 */
async function sendEmailThroughProvider(params: {
  recipientEmail: string;
  otpCode: string;
  purpose: OtpPurpose;
}): Promise<{
  providerName: string;
  providerRefId: string;
  deliveryStatus: "PROVIDER_ACCEPTED";
}> {
  const host = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim();
  const from = (process.env.SMTP_FROM || user || "no-reply@campusbite.com").trim();

  if (!customNodemailerTransport && (!host || !user || !pass)) {
    lastSmtpDiagnostics.lastDeliveryStatus = "FAILED";
    lastSmtpDiagnostics.lastDeliveryAt = new Date().toISOString();
    lastSmtpDiagnostics.lastFailureCategory = "MISSING_SMTP_CREDENTIALS";
    throw new OtpDeliveryError({
      message:
        "Gmail SMTP is not configured on the backend server. Please configure SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER, and SMTP_PASS (16-character Google App Password) in backend .env.",
      statusCode: 503,
      failureCategory: "MISSING_SMTP_CREDENTIALS",
      setupGuidance:
        "Set SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=your-email@gmail.com, SMTP_PASS=your-16-char-google-app-password in campusbite-v2/backend/.env",
    });
  }

  otpLogger.info(
    {
      event: "EMAIL_SMTP_CONNECTING",
      host,
      port,
      recipient: params.recipientEmail,
    },
    "Connecting to Gmail SMTP server with STARTTLS for Email OTP delivery"
  );

  const transporter =
    customNodemailerTransport ||
    nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port === 587,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

  try {
    await transporter.verify();
    lastSmtpDiagnostics.connectionVerified = true;
    lastSmtpDiagnostics.lastCheckedAt = new Date().toISOString();
    otpLogger.info(
      { event: "EMAIL_SMTP_AUTHENTICATED", host, port },
      "SMTP connection & STARTTLS authentication verified"
    );
  } catch (err) {
    const errMsg = (err as Error).message || "SMTP authentication error";
    const isAuthErr = /535|auth|credentials|username and password not accepted/i.test(
      errMsg
    );
    const category = isAuthErr
      ? "SMTP_AUTH_REJECTED"
      : "SMTP_CONNECTION_ERROR";
    lastSmtpDiagnostics.connectionVerified = false;
    lastSmtpDiagnostics.lastCheckedAt = new Date().toISOString();
    lastSmtpDiagnostics.lastDeliveryStatus = "FAILED";
    lastSmtpDiagnostics.lastDeliveryAt = new Date().toISOString();
    lastSmtpDiagnostics.lastFailureCategory = category;

    otpLogger.error(
      {
        event: "EMAIL_SMTP_AUTH_FAILED",
        host,
        port,
        failureCategory: category,
      },
      "SMTP verification failed before sending OTP email"
    );
    throw new OtpDeliveryError({
      message: isAuthErr
        ? "Gmail SMTP authentication failed. Ensure 2-Step Verification is enabled on your Google account and SMTP_PASS is a 16-character Google App Password (not your regular Gmail password)."
        : "Unable to connect to the Gmail SMTP server. Please check SMTP_HOST and SMTP_PORT.",
      statusCode: 502,
      failureCategory: category,
    });
  }

  const template = buildCampusBiteOtpEmailHtml({
    otpCode: params.otpCode,
    purpose: params.purpose,
    recipientEmail: params.recipientEmail,
  });

  try {
    const info = await transporter.sendMail({
      from,
      to: params.recipientEmail,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    if (info.rejected && info.rejected.length > 0) {
      lastSmtpDiagnostics.lastDeliveryStatus = "FAILED";
      lastSmtpDiagnostics.lastDeliveryAt = new Date().toISOString();
      lastSmtpDiagnostics.lastFailureCategory = "SMTP_RECIPIENT_REJECTED";
      throw new OtpDeliveryError({
        message: "The email provider rejected the recipient email address.",
        statusCode: 502,
        failureCategory: "SMTP_RECIPIENT_REJECTED",
      });
    }

    const messageId = info.messageId || `smtp-${Date.now()}`;
    lastSmtpDiagnostics.lastDeliveryStatus = "PROVIDER_ACCEPTED";
    lastSmtpDiagnostics.lastDeliveryAt = new Date().toISOString();
    lastSmtpDiagnostics.lastFailureCategory = null;

    otpLogger.info(
      {
        event: "EMAIL_PROVIDER_ACCEPTED",
        recipient: params.recipientEmail,
        messageId,
        acceptedCount: info.accepted?.length ?? 1,
      },
      "Email OTP accepted by Gmail SMTP provider"
    );

    return {
      providerName: host.includes("gmail") ? "GMAIL_SMTP" : "NODEMAILER_SMTP",
      providerRefId: messageId,
      deliveryStatus: "PROVIDER_ACCEPTED",
    };
  } catch (err) {
    if (err instanceof OtpDeliveryError) throw err;
    lastSmtpDiagnostics.lastDeliveryStatus = "FAILED";
    lastSmtpDiagnostics.lastDeliveryAt = new Date().toISOString();
    lastSmtpDiagnostics.lastFailureCategory = "SMTP_DISPATCH_ERROR";

    otpLogger.error(
      {
        event: "EMAIL_SEND_FAILED",
        recipient: params.recipientEmail,
        failureCategory: "SMTP_DISPATCH_ERROR",
      },
      "Failed to dispatch OTP email via SMTP"
    );
    throw new OtpDeliveryError({
      message:
        "Email OTP delivery failed while communicating with the SMTP server. Please try again.",
      statusCode: 502,
      failureCategory: "SMTP_DISPATCH_ERROR",
    });
  }
}

/**
 * Isolated SMS provider implementation — disabled in active flows (Requirement 1).
 * Retained for potential future activation.
 */
export async function sendSmsThroughProviderDisabled(): Promise<never> {
  throw new OtpDeliveryError({
    message:
      "Mobile SMS OTP verification is disabled. Please use Gmail / Email OTP verification.",
    statusCode: 400,
    failureCategory: "SMS_VERIFICATION_DISABLED",
  });
}

/**
 * Inspects currently configured Email SMTP & disabled SMS status for Admin Diagnostics (Requirement 7).
 * Never exposes SMTP passwords, app passwords, OTPs, or API keys.
 */
export async function getOtpProvidersDiagnostics() {
  const smtpConfigured = Boolean(
    customNodemailerTransport ||
      (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  );
  const host = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = Number(process.env.SMTP_PORT || 587);

  // Pull latest delivery attempt record from MySQL otp_verifications table
  let latestDbAttempt: {
    delivery_status?: string;
    failure_category?: string | null;
    provider_name?: string | null;
    created_at?: string;
  } | null = null;

  try {
    const rows = await queryRows<RowDataPacket[]>(
      `SELECT delivery_status, failure_category, provider_name, created_at
       FROM otp_verifications
       ORDER BY created_at DESC LIMIT 1`
    );
    if (rows[0]) {
      latestDbAttempt = {
        delivery_status: rows[0].delivery_status,
        failure_category: rows[0].failure_category || null,
        provider_name: rows[0].provider_name || null,
        created_at: rows[0].created_at,
      };
    }
  } catch {
    // Ignore DB lookup errors during diagnostics
  }

  return {
    email: {
      configured: smtpConfigured,
      provider: smtpConfigured
        ? host.includes("gmail")
          ? "GMAIL_SMTP"
          : "NODEMAILER_SMTP"
        : "MISSING",
      host,
      port,
      tlsMode: port === 587 ? "STARTTLS" : "SSL/TLS",
      connectionVerified: lastSmtpDiagnostics.connectionVerified,
      lastCheckedAt: lastSmtpDiagnostics.lastCheckedAt,
      lastDeliveryStatus:
        latestDbAttempt?.delivery_status ||
        lastSmtpDiagnostics.lastDeliveryStatus ||
        "NO_ATTEMPTS_YET",
      lastDeliveryAt:
        latestDbAttempt?.created_at || lastSmtpDiagnostics.lastDeliveryAt,
      providerErrorCategory:
        latestDbAttempt?.failure_category ||
        lastSmtpDiagnostics.lastFailureCategory ||
        null,
    },
    sms: {
      enabled: false,
      status: "DISABLED",
      message:
        "Mobile SMS OTP verification is disabled. Gmail SMTP Email OTP is the sole active verification method.",
    },
    security: {
      expiryMinutes: OTP_EXPIRY_MINUTES,
      resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      maxAttempts: OTP_MAX_ATTEMPTS,
      hourlyRateLimit: OTP_MAX_HOURLY_REQUESTS,
    },
  };
}

/**
 * Email-Only OTP issuance & delivery workflow (Requirements 1, 2, 3, 4).
 * Never returns raw OTP values in API responses and never logs OTP values.
 */
export async function issueAndSendOtp(params: {
  target: string;
  channel?: OtpChannel;
  purpose: OtpPurpose;
  bypassCooldown?: boolean;
}): Promise<SendOtpResult> {
  const requestedChannel = params.channel || "EMAIL";

  if (requestedChannel !== "EMAIL" || SMS_OTP_ENABLED) {
    otpLogger.warn(
      {
        event: "SMS_OTP_BLOCKED",
        requestedChannel,
        purpose: params.purpose,
      },
      "Rejected non-EMAIL OTP request because SMS verification is disabled"
    );
    throw new OtpDeliveryError({
      message:
        "Mobile SMS OTP verification is disabled. Please verify using your Gmail / Email address.",
      statusCode: 400,
      failureCategory: "SMS_VERIFICATION_DISABLED",
    });
  }

  otpLogger.info(
    {
      event: "OTP_REQUEST_RECEIVED",
      channel: "EMAIL",
      purpose: params.purpose,
    },
    "Received customer Email OTP generation request"
  );

  // 1. Validate & normalize Email address
  const emailCheck = normalizeEmailAddress(params.target);
  if (!emailCheck.valid) {
    otpLogger.warn(
      {
        event: "OTP_EMAIL_VALIDATION_FAILED",
        failureCategory: "INVALID_EMAIL_FORMAT",
      },
      emailCheck.error
    );
    throw new OtpDeliveryError({
      message: emailCheck.error || "Invalid email address.",
      statusCode: 400,
      failureCategory: "INVALID_EMAIL_FORMAT",
    });
  }

  const canonicalEmail = emailCheck.email;
  otpLogger.info(
    { event: "OTP_EMAIL_VALIDATED", email: canonicalEmail },
    "Email format validated"
  );

  // 2. Enforce 30-second resend cooldown & hourly rate-limiting
  const recentRows = await queryRows<RowDataPacket[]>(
    `SELECT id, last_sent_at FROM otp_verifications
     WHERE target = ? AND purpose = ?
     ORDER BY created_at DESC LIMIT 1`,
    [canonicalEmail, params.purpose]
  );

  if (recentRows.length > 0 && !params.bypassCooldown) {
    const lastSent = new Date(recentRows[0].last_sent_at).getTime();
    const elapsedSeconds = (Date.now() - lastSent) / 1000;
    if (elapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
      const waitSec = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds);
      throw new OtpDeliveryError({
        message: `Please wait ${waitSec} seconds before requesting another OTP.`,
        statusCode: 429,
        failureCategory: "OTP_RESEND_COOLDOWN_ACTIVE",
      });
    }
  }

  const [hourlyCountRow] = await queryRows<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM otp_verifications
     WHERE target = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
    [canonicalEmail]
  );
  if (
    Number(hourlyCountRow?.cnt || 0) >= OTP_MAX_HOURLY_REQUESTS &&
    !params.bypassCooldown
  ) {
    throw new OtpDeliveryError({
      message:
        "Too many OTP requests for this email address in the last hour. Please try again later.",
      statusCode: 429,
      failureCategory: "OTP_HOURLY_RATE_LIMIT_EXCEEDED",
    });
  }

  // 3. Invalidate all previous unverified OTPs for this email & purpose
  await execQuery(
    `UPDATE otp_verifications
     SET invalidated = 1
     WHERE target = ? AND purpose = ? AND verified = 0`,
    [canonicalEmail, params.purpose]
  );

  // 4. Generate cryptographically secure 6-digit OTP and store ONLY the bcrypt hash
  const rawOtp = crypto.randomInt(100000, 999999).toString();
  const otpHash = await bcrypt.hash(rawOtp, 10);
  const verificationId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await execQuery(
    `INSERT INTO otp_verifications
     (id, target, email, phone, channel, otp_hash, purpose, attempts, max_attempts,
      verified, invalidated, delivery_status, expires_at, last_sent_at)
     VALUES (?, ?, ?, NULL, 'EMAIL', ?, ?, 0, ?, 0, 0, 'DISPATCHING', ?, NOW())`,
    [
      verificationId,
      canonicalEmail,
      canonicalEmail,
      otpHash,
      params.purpose,
      OTP_MAX_ATTEMPTS,
      expiresAt,
    ]
  );

  otpLogger.info(
    {
      event: "OTP_GENERATED_AND_HASH_STORED",
      verificationId,
      channel: "EMAIL",
      target: canonicalEmail,
      expiresAt: expiresAt.toISOString(),
    },
    "Hashed OTP persisted in MySQL otp_verifications table"
  );

  // 5. Dispatch exclusively through Gmail SMTP / Nodemailer
  try {
    const providerResult = await sendEmailThroughProvider({
      recipientEmail: canonicalEmail,
      otpCode: rawOtp,
      purpose: params.purpose,
    });

    await execQuery(
      `UPDATE otp_verifications
       SET delivery_status = ?, provider_name = ?, provider_ref_id = ?
       WHERE id = ?`,
      [
        providerResult.deliveryStatus,
        providerResult.providerName,
        providerResult.providerRefId,
        verificationId,
      ]
    );

    // NEVER return rawOtp in API responses (Requirement 4)
    return {
      verificationId,
      target: canonicalEmail,
      channel: "EMAIL",
      expiresAt: expiresAt.toISOString(),
      expiryMinutes: OTP_EXPIRY_MINUTES,
      resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      deliveryStatus: providerResult.deliveryStatus,
      providerName: providerResult.providerName,
      providerReferenceId: providerResult.providerRefId,
      providerConfigured: true,
    };
  } catch (err) {
    const otpErr =
      err instanceof OtpDeliveryError
        ? err
        : new OtpDeliveryError({
            message: (err as Error).message || "Email OTP dispatch failed.",
            statusCode: 502,
            failureCategory: "UNEXPECTED_DISPATCH_ERROR",
          });

    // Record failure in MySQL and invalidate the unsendable OTP so no fake success is ever shown
    await execQuery(
      `UPDATE otp_verifications
       SET delivery_status = 'FAILED',
           invalidated = 1,
           failure_category = ?
       WHERE id = ?`,
      [otpErr.failureCategory, verificationId]
    );

    throw otpErr;
  }
}

/**
 * Verifies a submitted 6-digit Email OTP against the latest non-invalidated MySQL record.
 */
export async function verifySubmittedOtp(params: {
  target: string;
  otp: string;
  purpose: OtpPurpose;
  consumeOnSuccess?: boolean;
}): Promise<{
  verificationId: string;
  canonicalTarget: string;
  channel: "EMAIL";
}> {
  const emailCheck = normalizeEmailAddress(params.target);
  if (!emailCheck.valid) {
    throw new OtpDeliveryError({
      message: emailCheck.error || "Enter a valid email address.",
      statusCode: 400,
      failureCategory: "INVALID_EMAIL_FORMAT",
    });
  }
  const canonicalTarget = emailCheck.email;

  const rows = await queryRows<RowDataPacket[]>(
    `SELECT * FROM otp_verifications
     WHERE target = ? AND channel = 'EMAIL' AND purpose = ?
     ORDER BY created_at DESC LIMIT 1`,
    [canonicalTarget, params.purpose]
  );

  const record = rows[0];
  if (!record) {
    throw new OtpDeliveryError({
      message:
        "No active verification code found for this email address. Please request a new OTP.",
      statusCode: 400,
      failureCategory: "OTP_RECORD_NOT_FOUND",
    });
  }

  if (record.invalidated === 1) {
    const category =
      record.failure_category === "OTP_EXPIRED"
        ? "OTP_EXPIRED"
        : record.failure_category === "MAX_ATTEMPTS_EXCEEDED"
          ? "MAX_ATTEMPTS_EXCEEDED"
          : record.verified === 1
            ? "OTP_ALREADY_USED"
            : "OTP_INVALIDATED";
    const msg =
      category === "OTP_ALREADY_USED"
        ? "This verification code has already been used. Please request a new OTP."
        : category === "OTP_EXPIRED"
          ? `This verification code has expired (${OTP_EXPIRY_MINUTES}-minute limit). Please request a new OTP.`
          : "This verification code is no longer active. Please request a new OTP.";
    throw new OtpDeliveryError({
      message: msg,
      statusCode: 400,
      failureCategory: category,
    });
  }

  if (new Date(record.expires_at).getTime() < Date.now()) {
    await execQuery(
      "UPDATE otp_verifications SET invalidated = 1, failure_category = 'OTP_EXPIRED' WHERE id = ?",
      [record.id]
    );
    throw new OtpDeliveryError({
      message: `This verification code has expired (${OTP_EXPIRY_MINUTES}-minute limit). Please request a new OTP.`,
      statusCode: 400,
      failureCategory: "OTP_EXPIRED",
    });
  }

  // If already verified in Step 2 (pre-check) and now being consumed during Step 3 (final registration)
  if (record.verified === 1) {
    const isMatch = await bcrypt.compare(params.otp.trim(), record.otp_hash);
    if (!isMatch) {
      throw new OtpDeliveryError({
        message: "Verification code mismatch. Please enter the verified 6-digit OTP.",
        statusCode: 400,
        failureCategory: "OTP_MISMATCH",
      });
    }
    if (params.consumeOnSuccess) {
      await execQuery(
        "UPDATE otp_verifications SET invalidated = 1 WHERE id = ?",
        [record.id]
      );
    }
    return {
      verificationId: record.id,
      canonicalTarget,
      channel: "EMAIL",
    };
  }

  if (record.attempts >= record.max_attempts) {
    await execQuery(
      "UPDATE otp_verifications SET invalidated = 1, failure_category = 'MAX_ATTEMPTS_EXCEEDED' WHERE id = ?",
      [record.id]
    );
    throw new OtpDeliveryError({
      message:
        "Maximum OTP verification attempts (5) exceeded. Please request a new verification code.",
      statusCode: 400,
      failureCategory: "MAX_ATTEMPTS_EXCEEDED",
    });
  }

  await execQuery(
    "UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = ?",
    [record.id]
  );

  const isMatch = await bcrypt.compare(params.otp.trim(), record.otp_hash);
  if (!isMatch) {
    const remaining = Math.max(0, record.max_attempts - (record.attempts + 1));
    if (remaining === 0) {
      await execQuery(
        "UPDATE otp_verifications SET invalidated = 1, failure_category = 'MAX_ATTEMPTS_EXCEEDED' WHERE id = ?",
        [record.id]
      );
    }
    otpLogger.warn(
      {
        event: "OTP_VERIFICATION_FAILED",
        verificationId: record.id,
        channel: "EMAIL",
        target: canonicalTarget,
        remainingAttempts: remaining,
      },
      "Customer submitted an incorrect OTP code"
    );
    throw new OtpDeliveryError({
      message: `Invalid 6-digit OTP code (${remaining} attempt${
        remaining === 1 ? "" : "s"
      } remaining).`,
      statusCode: 400,
      failureCategory: "INVALID_OTP_CODE",
    });
  }

  await execQuery(
    `UPDATE otp_verifications
     SET verified = 1,
         verified_at = NOW(),
         invalidated = ?,
         delivery_status = 'OTP_VERIFIED'
     WHERE id = ?`,
    [params.consumeOnSuccess ? 1 : 0, record.id]
  );

  otpLogger.info(
    {
      event: "OTP_VERIFIED_SUCCESS",
      verificationId: record.id,
      channel: "EMAIL",
      target: canonicalTarget,
      consumed: Boolean(params.consumeOnSuccess),
    },
    "Customer Email OTP verified successfully"
  );

  return {
    verificationId: record.id,
    canonicalTarget,
    channel: "EMAIL",
  };
}
