# CampusBite V2 — Architecture, Security & Deployment Documentation

## 1. Executive Architecture & V1 Isolation Guarantee

**CampusBite V2** is an independent, multi-tenant Campus Food Ordering and Canteen Management SaaS Platform located entirely inside `campusbite-v2/`.

### Strict Isolation between V1 and V2

| Dimension | CampusBite V1 (Protected Legacy) | CampusBite V2 (New Commercial SaaS) |
| :--- | :--- | :--- |
| **Live URL / Port** | `https://campusbite-blond-five.vercel.app/` | Frontend: `http://localhost:5174` / Separate Vercel Project<br>Backend: `http://localhost:5002` / Persistent Node Host |
| **Source Directory** | Root workspace (`apps/`, `packages/`, `prisma/`, `api/`) | `campusbite-v2/` (`frontend/`, `backend/`, `database/`, `documentation/`) |
| **MySQL Database** | `campus_canteen` (Local) / `test` (TiDB Cloud) | `campusbite_v2` (Strictly isolated 19-table relational schema) |
| **API Namespace** | `/api/*` | `/api/v2/*` |
| **Demo Data Policy** | Pre-seeded college canteens & sample menu items | **Zero Demo Data** — Starts clean with only the Bootstrap Administrator |
| **Customer Terminology** | Student Login / Enrollment Number | **Customer Login & Registration** (Email OTP or Mobile SMS OTP; no Enrollment Number) |

---

## 2. 19-Table Normalized MySQL Schema (`campusbite_v2`)

Defined in `campusbite-v2/database/migrations/001_initial_schema.sql`:

1. `roles` — Role definitions (`ADMIN`, `MANAGER`, `CUSTOMER`).
2. `users` — Unified accounts with `role_id`, `full_name`, `email`, `phone`, `password_hash`, `status` (`ACTIVE`, `SUSPENDED`, `ARCHIVED`), `email_verified`, `phone_verified`, `wallet_balance`, `last_login_at`.
3. `sessions` — Refresh token and device session tracking.
4. `otp_verifications` — Email & SMS OTP verification records storing `otp_hash` (bcrypt), `channel` (`EMAIL` | `SMS`), `purpose` (`REGISTER` | `RESET_PASSWORD`), `attempt_count`, `max_attempts` (5), `resend_available_at` (30s cooldown), `expires_at` (10 min), and `verification_token`.
5. `canteens` — Establishments (`CANTEEN`, `CAFE`, `STALL`, `RESTAURANT`) with permanent UUID `id`, `name`, `slug`, `status` (`ACTIVE`, `INACTIVE`, `SUSPENDED`, `ARCHIVED`), `is_deleted`, operating hours, crowd occupancy, and `qr_token`.
6. `canteen_managers` — Maps manager user accounts to their assigned `canteen_id`.
7. `menu_categories` — Establishment-scoped food categories with display ordering.
8. `menu_items` — Establishment-scoped food items with `price`, `is_veg`, `preparation_time_min`, `stock_quantity`, `low_stock_threshold`, `is_available`, and `image_url`.
9. `menu_images` — Persistent uploaded food photography registry (`/uploads/...` or cloud object storage URLs).
10. `inventory` — Dedicated stock tracking records synchronized with `menu_items`.
11. `inventory_movements` — Immutable audit trail of every stock restock, order deduction, wastage, or adjustment.
12. `addresses` — Customer campus delivery and pickup locations.
13. `orders` — Transactional order header storing permanent `canteen_id` **plus** `canteen_name_snapshot` so renaming an establishment never corrupts historical receipts.
14. `order_items` — Order line items storing `item_name_snapshot` and `unit_price_snapshot` at the moment of purchase.
15. `payments` — Payment ledger supporting `WALLET`, `RAZORPAY`, and `UPI` with HMAC-SHA256 signature verification and `canteen_name_snapshot`.
16. `reviews` — Verified customer ratings (1–5 stars) and comments linked to completed orders.
17. `notifications` — Persistent user notifications synchronized with Socket.IO events.
18. `audit_logs` — Tamper-evident administrative and managerial action logs (`old_value_json`, `new_value_json`, `ip_address`).
19. `wallet_ledger` — Double-entry customer wallet credits, order debits, and automated order-rejection refunds.

---

## 3. Role-Based Portals & Authentication Flows

### A. Customer Portal (`/auth/customer`, `/customer`)
- **Two Registration Options**:
  - **Option 1 — Email Registration**: Full Name + Email Address + 6-digit Email OTP verification + Password.
  - **Option 2 — Mobile Registration**: Full Name + Mobile Number + 6-digit SMS OTP verification + Password.
- **No Enrollment Number**: All student/college enrollment number fields are removed.
- **Features**: Browse active establishments, filter by type (`CANTEEN`, `CAFE`, `STALL`), filter Veg/Non-Veg, inspect persistent food photos, add to cart, server-validated checkout (5% GST calculated server-side), CampusBite Wallet top-up & double-entry ledger, Razorpay checkout signature verification, live Socket.IO order status tracker (`PLACED -> ACCEPTED -> PREPARING -> READY -> COMPLETED`), QR pickup pass, address book, and verified order reviews.

### B. Canteen Manager Portal (`/auth/manager`, `/manager`)
- **Scoped Access**: Managers are created and assigned to an establishment by the Administrator. Every API route verifies `req.user.canteenId` so a manager can never view or mutate another establishment's data.
- **Features**:
  - **Persistent Food Photo Upload**: `POST /api/v2/manager/upload` validates MIME type (`image/jpeg`, `image/png`, `image/webp`) and file size (max 5 MB), stores the file in `campusbite-v2/backend/uploads/`, and records metadata in `menu_images`.
  - **Menu & Category Management**: Create/edit categories and food items, toggle immediate availability / sold-out status.
  - **Live Order Queue**: Accept orders, reject orders with a mandatory reason (automatically refunding paid Wallet/Razorpay orders), and advance preparation stages (`ACCEPTED -> PREPARING -> READY -> COMPLETED`) with instant Socket.IO customer notifications.
  - **Inventory & Analytics**: Restock items, log wastage, adjust live dining crowd occupancy, and inspect real MySQL revenue and low-stock alerts.

### C. Administrator Portal (`/auth/admin`, `/admin`)
- **Bootstrap Provisioning**: Seeded via `npm run bootstrap:admin` reading `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` from `campusbite-v2/backend/.env`.
- **Complete Establishment Lifecycle Control (Phase 11)**:
  - **Create / Edit / Rename**: Update any establishment's name, type, location, hours, or contact info by permanent ID. Renaming broadcasts `establishment:updated` over Socket.IO while preserving `canteen_name_snapshot` on historical orders and payments.
  - **Suspend / Reactivate / Archive**: Suspended establishments are immediately hidden from customer ordering and blocked from checkout.
  - **Safe Delete Rule**: `DELETE /api/v2/admin/establishments/:id` inspects historical `orders` and `payments`. If financial history exists, it safely archives and soft-deletes the establishment (`ARCHIVED_PRESERVING_FINANCIAL_HISTORY`) and disables its menu items. If zero orders/payments exist, it permanently removes the record (`PERMANENT_DELETE`).
- **Platform Monitoring**: Create and reassign managers, suspend/reactivate customer or manager accounts, monitor all orders, menu items, inventory, payments, revenue analytics, and audit logs.

---

## 4. Local Setup & Production Deployment Guide

### Local Development
1. **Database Initialization & Admin Bootstrap**:
   ```bash
   cd campusbite-v2/backend
   npm install
   npm run bootstrap:admin
   ```
2. **Start V2 Backend (`http://localhost:5002`)**:
   ```bash
   cd campusbite-v2/backend
   npm run dev
   ```
3. **Start V2 Frontend (`http://localhost:5174`)**:
   ```bash
   cd campusbite-v2/frontend
   npm install
   npm run dev
   ```
4. **Run Phase 13 Automated E2E Test Suite**:
   ```bash
   cd campusbite-v2/backend
   npm test
   ```

### Independent Production Deployment
1. **Managed MySQL (`campusbite_v2`)**:
   - Provision a dedicated database named `campusbite_v2` on TiDB Cloud, PlanetScale, AWS RDS, or Railway MySQL.
   - Run `campusbite-v2/database/migrations/001_initial_schema.sql` and `npm run bootstrap:admin`.
2. **Persistent Node.js + Socket.IO Backend**:
   - Deploy `campusbite-v2/backend` to Render, Railway, or Fly.io (persistent WebSocket support for Socket.IO).
   - Configure environment variables from `campusbite-v2/backend/.env.example`.
3. **Separate Vercel Project for V2 Frontend**:
   - Import `campusbite-v2/frontend` as a **new, separate Vercel project** named `campusbite-v2` (do **not** overwrite the V1 Vercel project `campusbite-blond-five.vercel.app`).
   - Set `VITE_V2_API_URL` and `VITE_V2_SOCKET_URL` to your deployed V2 backend URL.
