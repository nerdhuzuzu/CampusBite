import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";

/**
 * Generate a human-readable order number.
 * Format: CC-YYYYMMDD-XXXX (random 4-digit suffix)
 */
export function generateOrderNumber(): string {
  const now = new Date();
  const dateStr =
    now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, "0") +
    now.getDate().toString().padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000).toString();
  return `CC-${dateStr}-${rand}`;
}

/**
 * Sign a JWT with the configured secret.
 */
export function generateToken(
  payload: Record<string, unknown>,
  expiresIn: string | number = "7d"
): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: expiresIn as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Verify and decode a JWT. Returns the decoded payload or throws.
 */
export function verifyToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
}

/**
 * Sign a refresh token using SESSION_SECRET.
 */
export function generateRefreshToken(
  payload: Record<string, unknown>,
  expiresIn: string | number = "30d"
): string {
  return jwt.sign(payload, env.SESSION_SECRET, {
    expiresIn: expiresIn as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Verify a refresh token signed with SESSION_SECRET.
 */
export function verifyRefreshToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, env.SESSION_SECRET) as jwt.JwtPayload;
}

/**
 * Hash a plain-text password with bcrypt (12 rounds).
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Compare a plain-text password against a bcrypt hash.
 */
export async function comparePassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
