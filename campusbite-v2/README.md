# CampusBite — Centralized Campus Food Ordering & Canteen Management Platform

**CampusBite** (`campusbite-v2/`) is a production-ready, multi-establishment campus food ordering and restaurant management platform. It unifies CampusBite V1's signature visual identity and verified campus dining features with a 21-table normalized MySQL architecture, Gmail SMTP Email-Only OTP authentication, persistent MySQL LONGBLOB food photography storage, real-time Socket.IO synchronization, and comprehensive role-based financial, operational, inventory, and personal spending analytics.

---

## 1. Strict V1 / V2 Isolation Guarantee

| Dimension | CampusBite V1 (Protected Reference) | CampusBite (`campusbite-v2/`) |
| :--- | :--- | :--- |
| **Directory** | Root (`apps/web`, `apps/api`, `prisma`) | `campusbite-v2/` (`frontend/`, `backend/`, `database/`) |
| **MySQL Database** | `campus_canteen` / TiDB `test` | `campusbite_v2` (Enforced in `db.ts`; blocks `campus_canteen`) |
| **Ports (Local)** | Frontend `:5173`, API `:5000` | Frontend `:5174`, API `:5002` |
| **User-Facing Brand** | CampusBite | **CampusBite** |
| **Authentication** | V1 Student Auth | Public Guest Menu Browsing + Gmail SMTP Email-Only OTP |

---

## 2. Local Development Setup

### Prerequisites
- Node.js `>= 20.x`
- MySQL `8.0+` (or TiDB Cloud Serverless MySQL-compatible cluster)

### Step 1: Configure Backend Environment
```bash
cd campusbite-v2/backend
cp .env.example .env
# Edit .env with your MySQL credentials (V2_DB_NAME=campusbite_v2) and Gmail SMTP App Password
```

### Step 2: Run Database Migration & Provision Bootstrap Administrator
```bash
cd campusbite-v2/backend
npm install
npm run bootstrap:admin
```

### Step 3: Start Backend & Frontend
```bash
# Terminal 1 — Backend API & Socket.IO (Port 5002)
cd campusbite-v2/backend
npm run dev

# Terminal 2 — React + Vite Frontend (Port 5174)
cd campusbite-v2/frontend
npm install
npm run dev
```

### Step 4: Run Automated End-to-End Test Suite
```bash
cd campusbite-v2/backend
npm test
```

---

## 3. Production Deployment Guide

### A. Production MySQL Database (TiDB Cloud / Managed MySQL)
1. Create a dedicated database named **`campusbite_v2`** on your MySQL 8.0 or TiDB Cloud cluster:
   ```sql
   CREATE DATABASE IF NOT EXISTS campusbite_v2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
2. Never point `V2_DATABASE_URL` or `V2_DB_NAME` to V1's `campus_canteen` database (`src/config/db.ts` enforces an explicit isolation block).
3. **Database Backups & Recovery**:
   - **Logical Backup**:
     ```bash
     mysqldump -h <HOST> -P <PORT> -u <USER> -p --single-transaction --routines --triggers campusbite_v2 > campusbite_v2_backup_$(date +%F).sql
     ```
   - **Point-in-Time / Snapshot Restore**:
     ```bash
     mysql -h <HOST> -P <PORT> -u <USER> -p campusbite_v2 < campusbite_v2_backup_YYYY-MM-DD.sql
     ```

### B. Persistent Node.js + Socket.IO Backend (Render / Railway / Docker)
1. Deploy using [render.yaml](file:///f:/COLLEGE%20TY/MINI%20PROJECT/adv%20project/campusbite-v2/render.yaml) or [Dockerfile](file:///f:/COLLEGE%20TY/MINI%20PROJECT/adv%20project/campusbite-v2/Dockerfile).
   - **Root Directory**: `campusbite-v2/backend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Health Check Path**: `/api/v2/health`
2. Configure the following Environment Variables in your backend hosting dashboard:
   - `NODE_ENV=production`
   - `PORT=5002`
   - `V2_DATABASE_URL` (or `V2_DB_HOST`, `V2_DB_PORT`, `V2_DB_USER`, `V2_DB_PASSWORD`, `V2_DB_NAME=campusbite_v2`, `V2_DB_SSL=true`)
   - `V2_JWT_SECRET` & `V2_REFRESH_SECRET` (64-character random hex secrets)
   - `V2_FRONTEND_URL` & `V2_CORS_ORIGINS` (your deployed Vercel frontend URL)
   - `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS` (16-char Google App Password), `SMTP_FROM`
   - `ADMIN_BOOTSTRAP_EMAIL` & `ADMIN_BOOTSTRAP_PASSWORD`
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (use `rzp_test_*` keys for test mode validation)
3. Provision the initial administrator once connected:
   ```bash
   npm run bootstrap:admin
   ```

### C. Frontend Deployment on Vercel (Separate Project from V1)
1. Import the GitHub repository into **Vercel** as a **new project** (e.g., `campusbite-v2` — do **not** overwrite the existing V1 Vercel project `campusbite-blond-five.vercel.app`).
2. Set **Root Directory** to: `campusbite-v2/frontend`
3. Vercel automatically detects [vercel.json](file:///f:/COLLEGE%20TY/MINI%20PROJECT/adv%20project/campusbite-v2/frontend/vercel.json) (`buildCommand: npm run build`, `outputDirectory: dist`, SPA rewrites).
4. Set Frontend Environment Variables in Vercel:
   - `VITE_V2_API_URL=https://<your-backend-domain>/api/v2`
   - `VITE_V2_WS_URL=https://<your-backend-domain>`
   - `VITE_PUBLIC_APP_URL=https://<your-vercel-domain>`
