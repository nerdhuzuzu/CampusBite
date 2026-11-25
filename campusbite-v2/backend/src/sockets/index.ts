import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { verifyAccessToken } from "../middleware/auth.js";
import { queryRows } from "../config/db.js";
import type { RowDataPacket } from "mysql2/promise";

export let ioV2: Server | null = null;

function extractCookieToken(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)v2_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function initSocketV2(httpServer: HttpServer): Server {
  const origins = (process.env.V2_CORS_ORIGINS || "http://localhost:5174")
    .split(",")
    .map((o) => o.trim());

  ioV2 = new Server(httpServer, {
    cors: {
      origin: origins,
      credentials: true,
    },
  });

  ioV2.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        extractCookieToken(socket.handshake.headers.cookie);

      if (!token) {
        socket.data.user = null;
        next();
        return;
      }

      const decoded = verifyAccessToken(token);
      const rows = await queryRows<RowDataPacket[]>(
        `SELECT u.id, u.status, r.name AS role_name, cm.canteen_id
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN canteen_managers cm ON cm.user_id = u.id
         WHERE u.id = ? LIMIT 1`,
        [decoded.id]
      );

      if (rows[0] && rows[0].status === "ACTIVE") {
        socket.data.user = {
          id: rows[0].id,
          role: rows[0].role_name,
          canteenId: rows[0].canteen_id ?? null,
        };
      }
      next();
    } catch {
      socket.data.user = null;
      next();
    }
  });

  ioV2.on("connection", (socket) => {
    socket.join("public");

    const user = socket.data.user;
    if (user) {
      socket.join(`user:${user.id}`);
      if (user.role === "ADMIN") {
        socket.join("admin");
      }
      if (user.role === "MANAGER" && user.canteenId) {
        socket.join(`establishment:${user.canteenId}`);
      }
    }

    socket.on("join:establishment", (canteenId: string) => {
      if (!user) return;
      if (
        user.role === "ADMIN" ||
        (user.role === "MANAGER" && user.canteenId === canteenId)
      ) {
        socket.join(`establishment:${canteenId}`);
      }
    });
  });

  return ioV2;
}
