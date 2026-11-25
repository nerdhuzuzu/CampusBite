import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureV2Schema, pool, queryRows } from "./config/db.js";
import { initSocketV2 } from "./sockets/index.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import managerRoutes from "./routes/manager.routes.js";
import customerRoutes from "./routes/customer.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Trust HTTPS reverse proxies (Render, Railway, Fly.io, Cloudflare, Vercel)
app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

const origins = (process.env.V2_CORS_ORIGINS || "http://localhost:5174")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || origins.includes("*") || origins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not permitted by CampusBite CORS`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(compression());

// Serve local disk cache of uploaded food photographs (in addition to persistent MySQL /api/v2/public/media/:imageId)
app.use(
  "/uploads",
  express.static(path.resolve(__dirname, "..", "uploads"))
);

// Rate limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/v2", apiLimiter);

// Initialize Socket.IO
const io = initSocketV2(httpServer);

// Health check
app.get("/api/v2/health", async (_req: Request, res: Response) => {
  try {
    const dbRows = await queryRows("SELECT DATABASE() AS db");
    const dbName = (dbRows[0] as { db?: string })?.db || "campusbite_v2";
    res.json({
      success: true,
      data: {
        service: "campusbite-api",
        version: "2.0.0",
        database: dbName,
        status: "connected",
        environment: process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: (err as Error).message,
    });
  }
});

// Mount V2 Routes
app.use("/api/v2", authRoutes);
app.use("/api/v2/admin", adminRoutes);
app.use("/api/v2/manager", managerRoutes);
app.use("/api/v2", customerRoutes);

// 404 & Global Error Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({
    success: false,
    error: err.message || "Internal server error",
  });
});

const PORT = Number(process.env.PORT || 5002);

export async function startV2Server() {
  await ensureV2Schema();
  return new Promise<void>((resolve) => {
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 CampusBite Backend running on port ${PORT}`);
      resolve();
    });
  });
}

// Graceful shutdown for SIGTERM / SIGINT in container / cloud hosts
function registerGracefulShutdown() {
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Closing HTTP, Socket.IO, and MySQL pool gracefully…`);
    try {
      io.close();
      httpServer.close();
      await pool.end();
      process.exit(0);
    } catch {
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

if (process.env.NODE_ENV !== "test") {
  registerGracefulShutdown();
  void startV2Server();
}

export { app, httpServer, io };
export default app;
