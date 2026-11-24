import { UserRole } from "@prisma/client";

// ── Authenticated user attached to request ──────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  outletId?: string;
}

// ── Express augmentation ────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// ── Socket.IO event types ───────────────────────────────────────────────────

export interface ServerToClientEvents {
  "order:new": (data: OrderEventPayload) => void;
  "order:statusUpdate": (data: OrderStatusPayload) => void;
  notification: (data: NotificationPayload) => void;
}

export interface ClientToServerEvents {
  "join:outlet": (outletId: string) => void;
  "join:student": (studentId: string) => void;
  "join:admin": () => void;
}

export interface OrderEventPayload {
  orderId: string;
  orderNumber: string;
  outletId: string;
  studentId: string;
  status: string;
  total: number;
  items: Array<{ name: string; quantity: number }>;
  createdAt: string;
}

export interface OrderStatusPayload {
  orderId: string;
  orderNumber: string;
  outletId: string;
  studentId: string;
  status: string;
  previousStatus: string;
  estimatedReady?: string;
  updatedAt: string;
}

export interface NotificationPayload {
  id: string;
  title: string;
  message: string;
  type: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ── API response types ──────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
