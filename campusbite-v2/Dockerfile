FROM node:22-alpine AS builder
WORKDIR /app/campusbite-v2/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
COPY database/ /app/campusbite-v2/database/
RUN npm run build

FROM node:22-alpine
WORKDIR /app/campusbite-v2/backend
ENV NODE_ENV=production
ENV PORT=5002
COPY --from=builder /app/campusbite-v2/backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/campusbite-v2/backend/dist ./dist
COPY --from=builder /app/campusbite-v2/database /app/campusbite-v2/database
EXPOSE 5002
CMD ["node", "dist/server.js"]
