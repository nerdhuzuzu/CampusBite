import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { RowDataPacket } from "mysql2/promise";
import { queryRows } from "../config/db.js";

export type V2Role = "CUSTOMER" | "MANAGER" | "ADMIN";

export interface V2AuthUser {
  id: string;
  role: V2Role;
  fullName: string;
  email: string | null;
  phone: string | null;
  canteenId?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: V2AuthUser;
    }
  }
}

const getJwtSecret = () =>
  process.env.V2_JWT_SECRET || "v2-fallback-jwt-secret-key-campusbite-2026";

export function signAccessToken(payload: { id: string; role: V2Role }): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyAccessToken(token: string): { id: string; role: V2Role } {
  return jwt.verify(token, getJwtSecret()) as { id: string; role: V2Role };
}

export async function authenticateV2(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const cookieToken = req.cookies?.v2_token as string | undefined;
    const headerAuth = req.headers.authorization;
    const bearerToken =
      headerAuth && headerAuth.startsWith("Bearer ")
        ? headerAuth.slice(7)
        : undefined;
    const token = cookieToken || bearerToken;

    if (!token) {
      res.status(401).json({
        success: false,
        error: "Authentication required. Please sign in.",
      });
      return;
    }

    const decoded = verifyAccessToken(token);

    const rows = await queryRows<RowDataPacket[]>(
      `SELECT u.id, u.full_name, u.email, u.phone, u.status, r.name AS role_name,
              cm.canteen_id
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN canteen_managers cm ON cm.user_id = u.id
       WHERE u.id = ? LIMIT 1`,
      [decoded.id]
    );

    const user = rows[0];
    if (!user) {
      res.status(401).json({
        success: false,
        error: "Account no longer exists.",
      });
      return;
    }

    if (user.status !== "ACTIVE") {
      res.status(403).json({
        success: false,
        error: `Account is currently ${user.status}. Contact platform administrator.`,
      });
      return;
    }

    req.user = {
      id: user.id,
      role: user.role_name as V2Role,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      canteenId: user.canteen_id ?? null,
    };
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: "Invalid or expired authentication session.",
    });
  }
}

export function requireV2Role(...roles: V2Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: "Authentication required.",
      });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Access denied. Required role: ${roles.join(" or ")}.`,
      });
      return;
    }
    next();
  };
}
