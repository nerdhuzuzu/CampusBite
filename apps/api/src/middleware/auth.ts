import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/helpers.js";
import { prisma } from "../config/database.js";
import { AppError } from "./errorHandler.js";
import type { AuthUser } from "../types/index.js";
import type { UserRole } from "@prisma/client";

/**
 * Authenticate the request by reading the JWT from the HTTP-only cookie
 * named "token". Attaches user info to req.user.
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.cookies?.token as string | undefined;

    if (!token) {
      throw new AppError(401, "Authentication required. Please log in.");
    }

    const decoded = verifyToken(token);

    // Fetch user from DB to ensure they still exist and are active
    const user = await prisma.user.findUnique({
      where: { id: decoded.id as string },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        managerProfile: {
          select: { outletId: true },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new AppError(401, "User account not found or deactivated.");
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      outletId: user.managerProfile?.outletId,
    };

    req.user = authUser;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError(401, "Invalid or expired authentication token."));
    }
  }
};

/**
 * Role-based access control. Must be used AFTER `authenticate`.
 * Accepts one or more roles that are permitted to access the route.
 */
export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, "Authentication required."));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(
        new AppError(
          403,
          `Access denied. Required role(s): ${roles.join(", ")}`
        )
      );
      return;
    }

    next();
  };
};

/**
 * Ensure the authenticated manager has access to the outlet specified
 * by `req.params.outletId`. Super admins bypass the check.
 */
export const requireOutletAccess = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    next(new AppError(401, "Authentication required."));
    return;
  }

  // Super admins can access any outlet
  if (req.user.role === "SUPER_ADMIN") {
    next();
    return;
  }

  const paramOutletId = req.params.outletId;

  if (!paramOutletId) {
    next(new AppError(400, "Outlet ID is required in route parameters."));
    return;
  }

  if (req.user.outletId !== paramOutletId) {
    next(new AppError(403, "You do not have access to this outlet."));
    return;
  }

  next();
};
