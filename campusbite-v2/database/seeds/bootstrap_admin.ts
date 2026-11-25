/**
 * CampusBite V2 — Secure Environment-Driven Administrator Bootstrap
 *
 * Rules:
 * - Never seeds demo establishments (No Canteen 1, Canteen 2, Cafe 1, Cafe 2, Dabeli Stall).
 * - Never seeds demo food items, orders, or fake analytics.
 * - Reads ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_PASSWORD, ADMIN_BOOTSTRAP_NAME from .env.
 */
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { pool, ensureV2Schema, queryRows, execQuery } from "../../backend/src/config/db.js";
import type { RowDataPacket } from "mysql2/promise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "..", "..", "backend", ".env") });

async function main() {
  await ensureV2Schema();

  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim();
  const fullName = process.env.ADMIN_BOOTSTRAP_NAME?.trim() || "Platform Administrator";

  if (!email || !password) {
    console.error(
      "❌ Missing ADMIN_BOOTSTRAP_EMAIL or ADMIN_BOOTSTRAP_PASSWORD in campusbite-v2/backend/.env"
    );
    process.exit(1);
  }

  const roles = await queryRows<RowDataPacket[]>(
    "SELECT id FROM roles WHERE name = 'ADMIN' LIMIT 1"
  );
  const adminRoleId = roles[0]?.id ?? 3;
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await queryRows<RowDataPacket[]>(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [email]
  );

  if (existing.length > 0) {
    await execQuery(
      "UPDATE users SET full_name = ?, password_hash = ?, role_id = ?, status = 'ACTIVE', email_verified = 1 WHERE id = ?",
      [fullName, passwordHash, adminRoleId, existing[0].id]
    );
    console.log(`✔ Updated bootstrap administrator (${email}) in campusbite_v2`);
  } else {
    const id = crypto.randomUUID();
    await execQuery(
      `INSERT INTO users (id, role_id, full_name, email, password_hash, email_verified, status)
       VALUES (?, ?, ?, ?, ?, 1, 'ACTIVE')`,
      [id, adminRoleId, fullName, email, passwordHash]
    );
    await execQuery(
      `INSERT INTO audit_logs (id, actor_id, actor_role, entity_type, entity_id, action, new_name, metadata)
       VALUES (?, ?, 'ADMIN', 'USER', ?, 'BOOTSTRAP_ADMIN', ?, ?)`,
      [crypto.randomUUID(), id, id, fullName, JSON.stringify({ email })]
    );
    console.log(`✔ Created bootstrap administrator (${email}) in campusbite_v2`);
  }
}

main()
  .catch((err) => {
    console.error("❌ Bootstrap failed:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
