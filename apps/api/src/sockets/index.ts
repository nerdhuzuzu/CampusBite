import { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "../types/index.js";
import { verifyToken } from "../utils/helpers.js";
import { prisma } from "../config/database.js";
import { env } from "../config/env.js";
import logger from "../utils/logger.js";

export let io: Server<ClientToServerEvents, ServerToClientEvents>;

export function setupSocketIO(httpServer: HttpServer): Server {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS.split(",").map((o) => o.trim()),
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ── Authentication middleware ───────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        parseCookieToken(socket.handshake.headers.cookie);

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = verifyToken(token);

      const user = await prisma.user.findUnique({
        where: { id: decoded.id as string },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          managerProfile: { select: { outletId: true } },
        },
      });

      if (!user || !user.isActive) {
        return next(new Error("User not found or deactivated"));
      }

      // Attach user data to socket
      socket.data.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        outletId: user.managerProfile?.outletId,
      };

      next();
    } catch {
      next(new Error("Invalid authentication token"));
    }
  });

  // ── Connection handler ────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const user = socket.data.user;
    logger.info({ userId: user.id, role: user.role }, "Socket connected");

    // Automatically join role-based rooms
    if (user.role === "SUPER_ADMIN") {
      socket.join("admin");
      logger.debug({ userId: user.id }, "Joined admin room");
    }

    // Student room — students can only join their own room
    socket.on("join:student", (studentId: string) => {
      if (user.role === "STUDENT" && user.id === studentId) {
        socket.join(`student:${studentId}`);
        logger.debug({ userId: user.id }, `Joined student:${studentId}`);
      } else if (user.role === "SUPER_ADMIN") {
        // Admins can observe any student room
        socket.join(`student:${studentId}`);
      }
    });

    // Outlet room — only the assigned manager or super admin
    socket.on("join:outlet", (outletId: string) => {
      if (user.role === "MANAGER" && user.outletId === outletId) {
        socket.join(`outlet:${outletId}`);
        logger.debug({ userId: user.id }, `Joined outlet:${outletId}`);
      } else if (user.role === "SUPER_ADMIN") {
        socket.join(`outlet:${outletId}`);
        logger.debug({ userId: user.id }, `Admin joined outlet:${outletId}`);
      }
    });

    socket.on("disconnect", (reason) => {
      logger.debug({ userId: user.id, reason }, "Socket disconnected");
    });
  });

  logger.info("Socket.IO server initialized");
  return io;
}

/**
 * Parse the "token" cookie from a raw Cookie header string.
 */
function parseCookieToken(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}
