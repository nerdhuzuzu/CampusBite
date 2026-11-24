import type { Request, Response } from "express";
import { prisma } from "../../config/database.js";
import { AppError, catchAsync } from "../../middleware/errorHandler.js";
import {
  hashPassword,
  comparePassword,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../../utils/helpers.js";
import { env } from "../../config/env.js";
import type { LoginInput, RegisterInput } from "./auth.schema.js";
import logger from "../../utils/logger.js";

const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.COOKIE_SECURE || env.NODE_ENV === "production",
  sameSite: (env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.COOKIE_SECURE || env.NODE_ENV === "production",
  sameSite: (env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: "/",
};

function attachAuthCookies(res: Response, payload: { id: string; role: string }) {
  const token = generateToken(payload, "7d");
  const refreshToken = generateRefreshToken(payload, "30d");
  res.cookie("token", token, ACCESS_COOKIE_OPTIONS);
  res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);
}

// ── Student Registration ────────────────────────────────────────────────────

export const registerStudent = catchAsync(
  async (req: Request, res: Response) => {
    const body = req.body as RegisterInput;

    const existing = await prisma.user.findUnique({
      where: { email: body.email },
    });
    if (existing) {
      throw new AppError(409, "An account with this email already exists.");
    }

    const passwordHash = await hashPassword(body.password);

    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        role: "STUDENT",
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        studentProfile: {
          create: {
            enrollmentNo: body.enrollmentNo,
            department: body.department,
            year: body.year,
            dietaryType: body.dietaryType,
          },
        },
        preferences: {
          create: {
            preferVeg: body.dietaryType !== "NON_VEG",
          },
        },
      },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "REGISTER_STUDENT",
        entity: "User",
        entityId: user.id,
        details: JSON.stringify({ email: user.email }),
        ipAddress: req.ip,
      },
    });

    logger.info({ userId: user.id }, "Student registered");

    res.status(201).json({
      success: true,
      message: "Registration successful. Please log in.",
      data: { user },
    });
  }
);

// ── Student Login ───────────────────────────────────────────────────────────

export const loginStudent = catchAsync(async (req: Request, res: Response) => {
  const { email, password } = req.body as LoginInput;

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      passwordHash: true,
      isActive: true,
    },
  });

  if (!user || user.role !== "STUDENT") {
    throw new AppError(401, "Invalid email or password.");
  }
  if (!user.isActive) {
    throw new AppError(403, "Account has been deactivated.");
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const { passwordHash: _, ...safeUser } = user;
  attachAuthCookies(res, { id: user.id, role: user.role });

  res.json({
    success: true,
    message: "Login successful.",
    data: { user: safeUser },
  });
});

// ── Manager Login ───────────────────────────────────────────────────────────

export const loginManager = catchAsync(async (req: Request, res: Response) => {
  const { email, password } = req.body as LoginInput;

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      passwordHash: true,
      isActive: true,
      managerProfile: {
        select: {
          outletId: true,
          outlet: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  if (!user || user.role !== "MANAGER") {
    throw new AppError(401, "Invalid email or password.");
  }
  if (!user.isActive) {
    throw new AppError(403, "Account has been deactivated.");
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "LOGIN_MANAGER",
      entity: "User",
      entityId: user.id,
      details: JSON.stringify({ outletId: user.managerProfile?.outletId }),
      ipAddress: req.ip,
    },
  });

  const { passwordHash: _, ...safeUser } = user;
  attachAuthCookies(res, { id: user.id, role: user.role });

  res.json({
    success: true,
    message: "Login successful.",
    data: { user: safeUser },
  });
});

// ── Admin Login ─────────────────────────────────────────────────────────────

export const loginAdmin = catchAsync(async (req: Request, res: Response) => {
  const { email, password } = req.body as LoginInput;

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      passwordHash: true,
      isActive: true,
    },
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    throw new AppError(401, "Invalid email or password.");
  }
  if (!user.isActive) {
    throw new AppError(403, "Account has been deactivated.");
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "LOGIN_ADMIN",
      entity: "User",
      entityId: user.id,
      ipAddress: req.ip,
    },
  });

  const { passwordHash: _, ...safeUser } = user;
  attachAuthCookies(res, { id: user.id, role: user.role });

  res.json({
    success: true,
    message: "Login successful.",
    data: { user: safeUser },
  });
});

// ── Refresh Access Token ────────────────────────────────────────────────────

export const refreshSession = catchAsync(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken as string | undefined;
  if (!refreshToken) {
    throw new AppError(401, "Refresh token not found.");
  }

  let decoded: { id?: string };
  try {
    decoded = verifyRefreshToken(refreshToken) as { id?: string };
  } catch {
    throw new AppError(401, "Invalid or expired refresh token.");
  }

  const user = await prisma.user.findUnique({
    where: { id: String(decoded.id) },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      isActive: true,
      managerProfile: {
        include: { outlet: { select: { id: true, name: true, slug: true } } },
      },
    },
  });

  if (!user || !user.isActive) {
    throw new AppError(401, "User account is inactive or not found.");
  }

  attachAuthCookies(res, { id: user.id, role: user.role });

  res.json({
    success: true,
    message: "Session refreshed.",
    data: { user },
  });
});

// ── Logout ──────────────────────────────────────────────────────────────────

export const logout = (_req: Request, res: Response) => {
  res
    .clearCookie("token", { path: "/" })
    .clearCookie("refreshToken", { path: "/" })
    .json({
      success: true,
      message: "Logged out successfully.",
    });
};

// ── Get Current User ────────────────────────────────────────────────────────

export const getMe = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(401, "Not authenticated.");
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      phone: true,
      avatarUrl: true,
      studentProfile: true,
      managerProfile: {
        include: {
          outlet: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  if (!user) {
    throw new AppError(404, "User not found.");
  }

  res.json({
    success: true,
    data: { user },
  });
});
