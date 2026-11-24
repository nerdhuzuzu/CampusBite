# Setup Guide

## Prerequisites

- **Node.js** 18.0 or later
- **Python** 3.10 or later
- **MySQL** 8.0

## Step 1: Install Dependencies

### Backend (Node.js)
```bash
cd apps/api
npm install
```

### Frontend (React)
```bash
cd apps/web
npm install
```

### AI Service (Python)
```bash
cd apps/ai-service
pip install -r requirements.txt

# Optional: For crowd detection (YOLO + OpenCV)
pip install -r requirements-cv.txt
```

## Step 2: Configure Environment

```bash
# From project root
cp .env.example .env
```

Edit `.env` and configure:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL connection string | `mysql://root:password@localhost:3306/campus_canteen` |
| `JWT_SECRET` | Secret for JWT signing (64+ chars) | Random string |
| `SESSION_SECRET` | Session secret | Random string |
| `AI_SERVICE_SECRET` | Shared secret for AI service auth | Random string |
| `FRONTEND_URL` | Frontend URL | `http://localhost:5173` |
| `AI_SERVICE_URL` | AI service URL | `http://localhost:8000` |

### Generate Secure Secrets
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Step 3: Set Up Database

```bash
# Create the database
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS campus_canteen CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Run Prisma migrations
npx prisma migrate dev --name init

# Seed development data
npx prisma db seed
```

## Step 4: Start Development Servers

Open three terminal windows:

```bash
# Terminal 1: Backend API (port 5000)
npm run dev:api

# Terminal 2: Frontend (port 5173)
npm run dev:web

# Terminal 3: AI Service (port 8000)
npm run dev:ai
```

## Step 5: Verify Setup

1. Backend health: http://localhost:5000/api/health
2. AI health: http://localhost:8000/health
3. Frontend: http://localhost:5173

## Troubleshooting

### MySQL Connection Refused
- Ensure MySQL is running: `Get-Service MYSQL80`
- Check credentials in `.env`
- Try connecting manually: `mysql -u root -p`

### Port Already in Use
- Change PORT in `.env` for backend
- Change `server.port` in `apps/web/vite.config.ts` for frontend
- Use `--port` flag for AI service

### Prisma Errors
```bash
# Reset database
npx prisma migrate reset

# Regenerate client
npx prisma generate
```

### AI Service Dependencies
If ML dependencies fail to install:
```bash
# Install core only
pip install fastapi uvicorn pydantic pydantic-settings httpx python-dotenv

# The AI service will use fallback/simulated responses
```
