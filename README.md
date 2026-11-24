# Campus Canteen Management System

A centralized digital platform for managing multiple food outlets inside a college campus. Built with React, Node.js, Python FastAPI, and MySQL.

## 🏗 Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌───────────────────┐
│   React Frontend    │────▶│  Node.js Backend API │────▶│  Python AI Service│
│   (Vite + TS)       │◀────│  (Express + Prisma)  │◀────│  (FastAPI + ML)   │
└─────────────────────┘     └──────────┬───────────┘     └───────────────────┘
                                       │
                                       ▼
                               ┌───────────────┐
                               │    MySQL 8.0   │
                               └───────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Python 3.10+
- MySQL 8.0

### 1. Clone & Install

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd apps/api && npm install

# Install frontend dependencies  
cd apps/web && npm install

# Install AI service dependencies
cd apps/ai-service && pip install -r requirements.txt
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your MySQL credentials and secrets
```

### 3. Set Up Database

```bash
# Create database
mysql -u root -e "CREATE DATABASE IF NOT EXISTS campus_canteen;"

# Run migrations
npx prisma migrate dev

# Seed initial data
npx prisma db seed
```

### 4. Start Development Servers

```bash
# Terminal 1: Backend API
npm run dev:api

# Terminal 2: Frontend  
npm run dev:web

# Terminal 3: AI Service
npm run dev:ai
```

### 5. Access the Application

| Service | URL |
|---------|-----|
| Student App | http://localhost:5173/login/student |
| Manager Dashboard | http://localhost:5173/login/manager |
| Admin Dashboard | http://localhost:5173/login/admin |
| Backend API | http://localhost:5000/api/health |
| AI Service | http://localhost:8000/health |

### Default Accounts (Development Only)

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@campus.com | Admin@123 |
| Manager (Canteen 1) | manager1@campus.com | Manager@123 |
| Manager (Canteen 2) | manager2@campus.com | Manager@123 |
| Manager (Cafe 1) | manager3@campus.com | Manager@123 |
| Manager (Cafe 2) | manager4@campus.com | Manager@123 |
| Manager (Dabeli Stall) | manager5@campus.com | Manager@123 |
| Student (Demo) | student@campus.com | Student@123 |

> ⚠️ **Change all default passwords before any production deployment.**

## 📁 Project Structure

```
campus-canteen/
├── apps/
│   ├── web/          # React + Vite frontend
│   ├── api/          # Node.js + Express backend
│   └── ai-service/   # Python FastAPI AI service
├── packages/
│   └── shared/       # Shared TypeScript types & constants
├── prisma/
│   ├── schema.prisma # Database schema
│   ├── migrations/   # Database migrations
│   └── seed.ts       # Development seed data
├── docs/             # Documentation
└── docker-compose.yml
```

## 🔑 Features

- **Multi-outlet Management** — 5 campus food outlets with independent management
- **QR-based Ordering** — Scan outlet QR codes to browse menus and place orders
- **Real-time Kitchen Dashboard** — Live order tracking with Socket.IO
- **AI Food Recommendations** — Personalized suggestions based on preferences and history
- **Demand Forecasting** — ML-based demand predictions for inventory planning
- **Smart Inventory** — Recipe-based ingredient tracking with stock reservations
- **Crowd Detection** — Computer vision-based crowd estimation (YOLO)
- **AI Chatbot** — Natural language food assistant with database-grounded responses
- **Voice Ordering** — Browser speech recognition for hands-free ordering
- **Digital Campus Twin** — Interactive campus map with live outlet data
- **Analytics Dashboards** — Comprehensive charts for managers and admins
- **Role-based Access** — Students, Managers, Super Admin with strict RBAC

## 🔒 Security

- JWT authentication with HTTP-only cookies
- Role-based access control (RBAC)
- Outlet-level authorization
- Input validation with Zod
- Rate limiting
- CSRF protection
- Helmet security headers
- Parameterized ORM queries (Prisma)

## 📄 License

This project is for educational purposes.
