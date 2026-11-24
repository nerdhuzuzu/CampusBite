import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import compression from "compression";
import { createServer } from "node:http";
import { env } from "./config/env.js";
import { prisma } from "./config/database.js";
import { setupSocketIO } from "./sockets/index.js";
import { generalLimiter, authLimiter, aiLimiter } from "./middleware/rateLimiter.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import logger from "./utils/logger.js";
import authRoutes from "./modules/auth/auth.routes.js";
import outletsRoutes from "./modules/outlets/outlets.routes.js";
import menuRoutes from "./modules/menu/menu.routes.js";
import ordersRoutes from "./modules/orders/orders.routes.js";
import inventoryRoutes from "./modules/inventory/inventory.routes.js";
import analyticsRoutes from "./modules/analytics/analytics.routes.js";
import aiRoutes from "./modules/ai/ai.routes.js";

const app = express();
const httpServer = createServer(app);

// ── Security middleware ─────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGINS.split(",").map((o) => o.trim()),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
  })
);

// ── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(compression());

// ── Rate limiting ───────────────────────────────────────────────────────────
app.use("/api/", generalLimiter);
app.use("/api/auth/student/login", authLimiter);
app.use("/api/auth/manager/login", authLimiter);
app.use("/api/auth/admin/login", authLimiter);
app.use("/api/ai/", aiLimiter);

// ── Socket.IO ───────────────────────────────────────────────────────────────
const io = setupSocketIO(httpServer);

// ── Health check ────────────────────────────────────────────────────────────
let dbConnected = false;

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbConnected = true;
  } catch {
    dbConnected = false;
  }
  res.json({
    success: true,
    data: {
      status: "ok",
      database: dbConnected ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      uptime: process.uptime(),
    },
  });
});

// ── API routes ──────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api", outletsRoutes);
app.use("/api", menuRoutes);
app.use("/api", ordersRoutes);
app.use("/api", inventoryRoutes);
app.use("/api", analyticsRoutes);
app.use("/api", aiRoutes);

// ── 404 & Error handlers ────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start server ────────────────────────────────────────────────────────────
const PORT = env.PORT;

const start = async () => {
  try {
    await prisma.$connect();
    dbConnected = true;
    logger.info("✅ Database connected");
  } catch (dbErr) {
    dbConnected = false;
    logger.warn(
      { err: (dbErr as Error).message },
      "⚠️ Database connection failed on startup — verify DATABASE_URL in .env. Starting API server in degraded mode."
    );
  }

  httpServer.listen(PORT, () => {
    logger.info(`🚀 Server running on http://localhost:${PORT}`);
    logger.info(`📌 Environment: ${env.NODE_ENV}`);
    logger.info(`🔗 Frontend: ${env.FRONTEND_URL}`);
    logger.info(`🤖 AI Service: ${env.AI_SERVICE_URL}`);
  });
};

if (process.env.NODE_ENV !== "test") {
  void start();
}

export { app, httpServer, io };
