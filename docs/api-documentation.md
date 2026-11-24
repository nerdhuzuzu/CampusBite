# API Documentation

## Base URL
- Development: `http://localhost:5000/api`
- Production: `https://your-domain.com/api`

## Authentication
All authenticated endpoints require a valid JWT cookie (`token`). The cookie is set automatically on login.

## Response Format
```json
{
  "success": true,
  "data": {},
  "message": "Operation successful",
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

## Error Format
```json
{
  "success": false,
  "error": "Error message",
  "message": "Human-readable description"
}
```

## Status Codes
| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (not logged in) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 409 | Conflict (duplicate) |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

---

## Authentication Endpoints

### POST /api/auth/student/register
Register a new student account.

**Body:**
```json
{
  "email": "student@university.edu",
  "password": "SecurePass@123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "9876543210",
  "enrollmentNo": "EN2024001",
  "department": "Computer Science",
  "year": 3,
  "dietaryType": "VEG"
}
```

### POST /api/auth/student/login
### POST /api/auth/manager/login
### POST /api/auth/admin/login

**Body:**
```json
{
  "email": "user@campus.com",
  "password": "password"
}
```

**Response:** Sets HTTP-only cookie and returns user info.

### POST /api/auth/logout
Clears authentication cookie.

### GET /api/auth/me
Returns current authenticated user.

---

## Outlet Endpoints

### GET /api/outlets
List all active outlets.

**Query:** `?search=cafe&isOpen=true`

### GET /api/outlets/:id
Get outlet details with current crowd/queue info.

### POST /api/admin/outlets
(Super Admin) Create a new outlet.

### PATCH /api/admin/outlets/:id
(Super Admin) Update outlet.

---

## Menu Endpoints

### GET /api/menu
Browse all menu items across outlets.

**Query:** `?outletId=xxx&category=snacks&dietary=VEG&minPrice=20&maxPrice=100&available=true&search=sandwich&sortBy=price&sortOrder=asc&page=1&limit=20`

### GET /api/outlets/:id/menu
Get menu for a specific outlet.

### POST /api/manager/menu
(Manager) Add menu item to their outlet.

### PATCH /api/manager/menu/:id
(Manager) Update menu item.

### DELETE /api/manager/menu/:id
(Manager) Soft-delete menu item.

---

## Order Endpoints

### POST /api/orders
Place a new order.

**Body:**
```json
{
  "outletId": "outlet-uuid",
  "items": [
    { "menuItemId": "item-uuid", "quantity": 2, "notes": "Extra spicy" }
  ],
  "notes": "Please pack separately",
  "paymentMethod": "PAY_AT_COUNTER",
  "idempotencyKey": "unique-client-generated-key"
}
```

### GET /api/orders/my
(Student) List own orders with pagination.

### GET /api/orders/:id
Get order details (students can only view own orders).

### POST /api/orders/:id/cancel
(Student) Cancel an eligible order.

### PATCH /api/manager/orders/:id/status
(Manager) Update order status.

**Body:**
```json
{
  "status": "ACCEPTED",
  "note": "Starting preparation"
}
```

---

## Inventory Endpoints

### GET /api/manager/inventory
(Manager) List ingredients for their outlet.

### POST /api/manager/inventory
(Manager) Add ingredient.

### PATCH /api/manager/inventory/:id
(Manager) Update ingredient stock.

### POST /api/manager/inventory/:id/purchase
(Manager) Record purchase.

### POST /api/manager/inventory/:id/wastage
(Manager) Record wastage.

---

## Analytics Endpoints

### GET /api/manager/analytics
(Manager) Outlet analytics.

**Query:** `?from=2024-01-01&to=2024-12-31`

### GET /api/admin/analytics
(Super Admin) Platform-wide analytics.

---

## AI Endpoints

### POST /api/ai/chat
Send message to AI chatbot.

### POST /api/ai/recommendations
Get food recommendations.

### GET /api/ai/forecast/outlet/:outletId
Demand forecast for outlet.

### GET /api/ai/queue/:outletId
Queue/wait time prediction.

### GET /api/ai/crowd/:outletId
Crowd detection data.

---

## WebSocket Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `join:outlet` | `{ outletId }` | Manager joins outlet room |
| `join:student` | `{ studentId }` | Student joins personal room |
| `join:admin` | — | Admin joins admin room |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `order:new` | Order object | New order (kitchen) |
| `order:statusUpdate` | `{ orderId, status, timestamp }` | Status change |
| `order:cancelled` | `{ orderId, reason }` | Order cancelled |
| `notification` | `{ title, message, type }` | General notification |
| `crowd:update` | CrowdInfo | Crowd level change |
| `queue:update` | QueueInfo | Queue prediction update |
