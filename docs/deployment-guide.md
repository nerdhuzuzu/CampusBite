# Deployment Guide

## Production Architecture

```
                    ┌─────────────────┐
                    │  Cloudflare /   │
                    │  Nginx (HTTPS)  │
                    └───────┬─────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
    ┌───────────┐   ┌───────────┐   ┌───────────┐
    │  Frontend │   │  Backend  │   │ AI Service│
    │  (Vercel) │   │  (VPS /   │   │ (VPS /   │
    │           │   │   Railway)│   │  Railway) │
    └───────────┘   └─────┬─────┘   └───────────┘
                          │
                    ┌─────┴─────┐
                    │  MySQL    │
                    │ (Managed) │
                    └───────────┘
```

## Frontend Deployment (Vercel)

```bash
cd apps/web
npm run build
# Deploy dist/ to Vercel
```

**Environment variables for Vercel:**
```
VITE_API_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com
```

## Backend Deployment

### Option A: Railway / Render
1. Connect your Git repository
2. Set root directory to `apps/api`
3. Build command: `npm run build`
4. Start command: `npm start`
5. Set all environment variables

### Option B: VPS (Ubuntu)
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Clone and install
git clone <repo> /opt/campus-canteen
cd /opt/campus-canteen/apps/api
npm install --production
npm run build

# Use PM2 for process management
npm install -g pm2
pm2 start dist/server.js --name canteen-api
pm2 save
pm2 startup
```

### Nginx Reverse Proxy (HTTPS + WSS)
```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

## AI Service Deployment

```bash
cd apps/ai-service
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```

## Database (Managed MySQL)

Recommended providers:
- PlanetScale
- AWS RDS
- DigitalOcean Managed MySQL

```bash
# Run migrations against production DB
DATABASE_URL="mysql://user:pass@host:3306/campus_canteen" npx prisma migrate deploy
```

## Security Checklist

- [ ] All secrets in environment variables
- [ ] HTTPS enabled on all services
- [ ] WSS for WebSocket connections
- [ ] `COOKIE_SECURE=true` in production
- [ ] Strong JWT_SECRET (64+ characters)
- [ ] MySQL not exposed publicly
- [ ] CORS restricted to frontend domain
- [ ] Rate limiting enabled
- [ ] Helmet security headers active
- [ ] HSTS enabled
- [ ] Regular database backups configured
- [ ] Log monitoring set up
- [ ] Default passwords changed

## Health Checks

| Service | Endpoint | Expected |
|---------|----------|----------|
| Backend | GET /api/health | `{ status: "ok" }` |
| AI Service | GET /health | `{ status: "healthy" }` |
| Database | Prisma connection test | No errors |

## Backup Strategy

```bash
# MySQL backup
mysqldump -u user -p campus_canteen > backup_$(date +%Y%m%d).sql

# Automated daily backup (cron)
0 2 * * * mysqldump -u user -p'pass' campus_canteen | gzip > /backups/canteen_$(date +\%Y\%m\%d).sql.gz
```
