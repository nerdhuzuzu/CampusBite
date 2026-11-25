import mysql, {
  type Pool,
  type PoolConnection,
  type RowDataPacket,
  type ResultSetHeader,
  type PoolOptions,
} from "mysql2/promise";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

function buildPoolOptions(): PoolOptions {
  const dbUrl = (process.env.V2_DATABASE_URL || "").trim();
  const forceSsl =
    process.env.V2_DB_SSL === "true" ||
    process.env.V2_DB_SSL === "1" ||
    dbUrl.includes("ssl=") ||
    dbUrl.includes("tidbcloud.com") ||
    (process.env.V2_DB_HOST || "").includes("tidbcloud.com");

  const sslConfig = forceSsl
    ? {
        minVersion: "TLSv1.2" as const,
        rejectUnauthorized:
          process.env.V2_DB_SSL_REJECT_UNAUTHORIZED !== "false",
      }
    : undefined;

  if (dbUrl) {
    const parsed = new URL(dbUrl);
    const dbNameFromUrl = parsed.pathname.replace(/^\//, "") || "campusbite_v2";
    // Enforce strict V1 / V2 isolation: never connect V2 to V1's campus_canteen database
    if (dbNameFromUrl === "campus_canteen") {
      throw new Error(
        "CRITICAL ISOLATION BLOCK: V2_DATABASE_URL points to V1 database 'campus_canteen'. CampusBite V2 must use 'campusbite_v2'."
      );
    }
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: dbNameFromUrl,
      ssl: sslConfig,
      waitForConnections: true,
      connectionLimit: Number(process.env.V2_DB_POOL_LIMIT || 12),
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      multipleStatements: true,
      decimalNumbers: true,
    };
  }

  const dbName = (process.env.V2_DB_NAME || "campusbite_v2").trim();
  if (dbName === "campus_canteen") {
    throw new Error(
      "CRITICAL ISOLATION BLOCK: V2_DB_NAME is set to V1 database 'campus_canteen'. CampusBite V2 must use 'campusbite_v2'."
    );
  }

  return {
    host: process.env.V2_DB_HOST || "localhost",
    port: Number(process.env.V2_DB_PORT || 3306),
    user: process.env.V2_DB_USER || "root",
    password: process.env.V2_DB_PASSWORD || "",
    database: dbName,
    ssl: sslConfig,
    waitForConnections: true,
    connectionLimit: Number(process.env.V2_DB_POOL_LIMIT || 12),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    multipleStatements: true,
    decimalNumbers: true,
  };
}

export const dbConfig = buildPoolOptions();
export const pool: Pool = mysql.createPool(dbConfig);

export async function queryRows<T extends RowDataPacket[]>(
  sql: string,
  params: unknown[] = []
): Promise<T> {
  const [rows] = await pool.query<T>(sql, params);
  return rows;
}

export async function execQuery(
  sql: string,
  params: unknown[] = []
): Promise<ResultSetHeader> {
  const [res] = await pool.query<ResultSetHeader>(sql, params);
  return res;
}

export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function ensureV2Schema(): Promise<void> {
  const migrationPath = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "database",
    "migrations",
    "001_initial_schema.sql"
  );
  if (fs.existsSync(migrationPath)) {
    const sql = fs.readFileSync(migrationPath, "utf8");
    await pool.query(sql);
  }

  // Ensure enhanced OTP verification, persistent image BLOB, and diagnostic columns exist
  const schemaAlterMigrations = [
    "ALTER TABLE otp_verifications ADD COLUMN user_id CHAR(36) NULL AFTER id",
    "ALTER TABLE otp_verifications ADD COLUMN email VARCHAR(191) NULL AFTER target",
    "ALTER TABLE otp_verifications ADD COLUMN phone VARCHAR(30) NULL AFTER email",
    "ALTER TABLE otp_verifications ADD COLUMN verified_at DATETIME NULL AFTER verified",
    "ALTER TABLE otp_verifications ADD COLUMN invalidated TINYINT(1) NOT NULL DEFAULT 0 AFTER verified_at",
    "ALTER TABLE otp_verifications ADD COLUMN provider_name VARCHAR(60) NULL AFTER invalidated",
    "ALTER TABLE otp_verifications ADD COLUMN provider_ref_id VARCHAR(191) NULL AFTER provider_name",
    "ALTER TABLE otp_verifications ADD COLUMN failure_category VARCHAR(120) NULL AFTER delivery_status",
    "ALTER TABLE menu_images ADD COLUMN image_data LONGBLOB NULL AFTER size_bytes",
    "ALTER TABLE menu_images ADD COLUMN storage_provider VARCHAR(40) NOT NULL DEFAULT 'MYSQL_BLOB' AFTER image_data",
  ];
  for (const stmt of schemaAlterMigrations) {
    try {
      await pool.query(stmt);
    } catch {
      // Ignore ER_DUP_FIELDNAME (1060) if column already exists
    }
  }
}
