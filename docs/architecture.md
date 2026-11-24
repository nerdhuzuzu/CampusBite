# Architecture Overview

## System Architecture

The Campus Canteen Management System follows a three-tier architecture with an additional AI microservice.

```
┌────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ Student App  │  │ Manager App  │  │  Admin App   │            │
│  │ (Mobile-1st) │  │  (Desktop)   │  │  (Desktop)   │            │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘            │
│         │                 │                  │                     │
│         └─────────────────┼──────────────────┘                     │
│                           │                                        │
│              React + Vite + TypeScript                             │
│              Tailwind CSS, Zustand, React Query                   │
│              Socket.IO Client                                      │
└───────────────────────────┬────────────────────────────────────────┘
                            │ HTTP/REST + WebSocket
┌───────────────────────────┼────────────────────────────────────────┐
│                      API LAYER                                     │
│                           │                                        │
│  ┌────────────────────────┴────────────────────────────┐          │
│  │            Node.js + Express + TypeScript           │          │
│  │                                                      │          │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │          │
│  │  │  Auth   │ │  Orders  │ │   Menu   │ │  QR    │ │          │
│  │  │ Module  │ │  Module  │ │  Module  │ │ Module │ │          │
│  │  └─────────┘ └──────────┘ └──────────┘ └────────┘ │          │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │          │
│  │  │Inventory│ │Analytics │ │Payments  │ │Sockets │ │          │
│  │  │ Module  │ │  Module  │ │  Module  │ │ Module │ │          │
│  │  └─────────┘ └──────────┘ └──────────┘ └────────┘ │          │
│  └─────────────────────┬──────────────────────────────┘          │
│                        │                                          │
│               Prisma ORM (MySQL)                                  │
│               JWT + Cookie Auth                                   │
│               Socket.IO Server                                    │
└────────────────────────┬──────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────────┐
        │                │                    │
        ▼                ▼                    ▼
┌───────────────┐ ┌──────────────┐  ┌────────────────────┐
│   MySQL 8.0   │ │   Redis      │  │  Python AI Service │
│   (Primary    │ │   (Optional  │  │  (FastAPI)         │
│    Database)  │ │    Cache)    │  │                    │
│               │ │              │  │  ┌──────────────┐ │
│  Users        │ └──────────────┘  │  │Recommendations│ │
│  Outlets      │                   │  │   Engine      │ │
│  Menu Items   │                   │  └──────────────┘ │
│  Orders       │                   │  ┌──────────────┐ │
│  Inventory    │                   │  │  Forecasting │ │
│  Payments     │                   │  │   Engine     │ │
│  Analytics    │                   │  └──────────────┘ │
│  Audit Logs   │                   │  ┌──────────────┐ │
│               │                   │  │   Crowd      │ │
│               │                   │  │  Detection   │ │
│               │                   │  └──────────────┘ │
│               │                   │  ┌──────────────┐ │
│               │                   │  │   Chatbot    │ │
│               │                   │  │   Engine     │ │
│               │                   │  └──────────────┘ │
└───────────────┘                   └────────────────────┘
```

## Communication Patterns

### REST API
- All CRUD operations use standard REST endpoints
- Consistent response format: `{ success, data, message, error, meta }`
- Authentication via HTTP-only JWT cookies
- Role-based authorization middleware

### WebSocket (Socket.IO)
- Real-time order status updates
- Kitchen dashboard live orders
- Crowd level updates
- Queue predictions
- Notifications

### Backend → AI Service
- Authenticated HTTP requests (shared secret in header)
- Used for: recommendations, forecasting, crowd detection, chatbot
- Fallback responses when AI service is unavailable

## Security Architecture

1. **Authentication**: JWT tokens in HTTP-only, Secure cookies
2. **Authorization**: Role-based (STUDENT, MANAGER, SUPER_ADMIN) + outlet-level
3. **Input Validation**: Zod schemas on every endpoint
4. **Rate Limiting**: Per-endpoint rate limits
5. **CSRF Protection**: Token-based for state-changing requests
6. **Headers**: Helmet with HSTS (production)
7. **Database**: Parameterized queries via Prisma ORM
8. **Secrets**: Environment variables, never in code

## Data Flow: Order Placement

```
Student scans QR → Validates outlet → Browses menu → Adds to cart
    → Submits order → Backend validates (prices, stock, availability)
    → Creates order in DB (transaction) → Reserves ingredients
    → Broadcasts to kitchen (Socket.IO) → Returns order confirmation
    → Student receives real-time status updates
```
