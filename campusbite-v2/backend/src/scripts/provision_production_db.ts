/**
 * CampusBite — Production Cloud Database Provisioning & Migration Utility
 *
 * Safely provisions the dedicated `campusbite_v2` database on a MySQL / TiDB Cloud
 * cluster over TLSv1.2, applies `001_initial_schema.sql`, and bootstraps the
 * platform administrator without touching CampusBite V1's database.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import mysql, { type RowDataPacket } from "mysql2/promise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendEnvPath = path.resolve(__dirname, "..", "..", ".env");
const rootEnvPath = path.resolve(__dirname, "..", "..", "..", "..", ".env");

dotenv.config({ path: backendEnvPath });

async function main() {
  let dbUrlStr = (process.env.V2_DATABASE_URL || "").trim();

  if (!dbUrlStr && fs.existsSync(rootEnvPath)) {
    const rootParsed = dotenv.parse(fs.readFileSync(rootEnvPath, "utf8"));
    if (rootParsed.DATABASE_URL) {
      const u = new URL(rootParsed.DATABASE_URL);
      u.pathname = "/campusbite_v2";
      dbUrlStr = u.toString();
    }
  }

  if (!dbUrlStr) {
    console.error("❌ V2_DATABASE_URL is not set.");
    process.exit(1);
  }

  const parsedUrl = new URL(dbUrlStr);
  const host = parsedUrl.hostname;
  const port = Number(parsedUrl.port || 4000);
  const user = decodeURIComponent(parsedUrl.username);
  const password = decodeURIComponent(parsedUrl.password);
  const targetDb = "campusbite_v2";

  console.log(`🔒 Connecting to MySQL / TiDB Cloud (${host}:${port}) over TLSv1.2...`);

  const adminConn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  await adminConn.query(
    `CREATE DATABASE IF NOT EXISTS \`${targetDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await adminConn.end();

  const v2Conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database: targetDb,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    multipleStatements: true,
  });

  const migrationPath = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "database",
    "migrations",
    "001_initial_schema.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf8");
  await v2Conn.query(sql);

  const alterMigrations = [
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
  for (const stmt of alterMigrations) {
    try {
      await v2Conn.query(stmt);
    } catch {
      // Column already exists
    }
  }

  // Bootstrap administrator in production campusbite_v2
  const adminEmail =
    process.env.ADMIN_BOOTSTRAP_EMAIL?.trim() || "admin@campusbite-v2.com";
  const adminPassword =
    process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim() || "AdminV2@2026!";
  const adminName =
    process.env.ADMIN_BOOTSTRAP_NAME?.trim() || "CampusBite Administrator";

  const [roleRows] = await v2Conn.query<RowDataPacket[]>(
    "SELECT id FROM roles WHERE name = 'ADMIN' LIMIT 1"
  );
  const adminRoleId = roleRows[0]?.id ?? 3;
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const [existingAdmin] = await v2Conn.query<RowDataPacket[]>(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [adminEmail]
  );

  if (existingAdmin.length === 0) {
    const adminId = crypto.randomUUID();
    await v2Conn.execute(
      `INSERT INTO users (id, role_id, full_name, email, password_hash, email_verified, status)
       VALUES (?, ?, ?, ?, ?, 1, 'ACTIVE')`,
      [adminId, adminRoleId, adminName, adminEmail, passwordHash]
    );
    await v2Conn.execute(
      `INSERT INTO audit_logs (id, actor_id, actor_role, entity_type, entity_id, action, new_name, metadata)
       VALUES (?, ?, 'ADMIN', 'USER', ?, 'BOOTSTRAP_ADMIN', ?, ?)`,
      [
        crypto.randomUUID(),
        adminId,
        adminId,
        adminName,
        JSON.stringify({ email: adminEmail }),
      ]
    );
    console.log(`✔ Provisioned bootstrap administrator (${adminEmail}) in ${targetDb}`);
  } else {
    console.log(`✔ Bootstrap administrator (${adminEmail}) already exists in ${targetDb}`);
  }

  const [tables] = await v2Conn.query<RowDataPacket[]>("SHOW TABLES");
  console.log(
    `✅ Production database '${targetDb}' verified with ${tables.length} tables.`
  );
  await v2Conn.end();
}

main().catch((err) => {
  console.error("❌ Cloud database provisioning failed:", err.message);
  process.exit(1);
});
