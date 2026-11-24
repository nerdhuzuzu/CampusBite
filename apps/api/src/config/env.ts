import { z } from "zod";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load .env from project root (two levels up from apps/api)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..", "..", "..");
dotenv.config({ path: path.join(rootDir, ".env") });

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .default("mysql://root:password@localhost:3306/campus_canteen"),
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  JWT_SECRET: z
    .string()
    .min(16)
    .default("campusbite-production-jwt-secret-key-2026-secure"),
  SESSION_SECRET: z
    .string()
    .min(16)
    .default("campusbite-production-session-secret-key-2026-secure"),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
  BACKEND_URL: z.string().default("http://localhost:5000"),
  AI_SERVICE_URL: z.string().default("http://localhost:8000"),
  AI_SERVICE_SECRET: z.string().default("ai-service-dev-secret"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  COOKIE_SECURE: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  COOKIE_DOMAIN: z.string().default("localhost"),
  LLM_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("gemini-2.0-flash"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
