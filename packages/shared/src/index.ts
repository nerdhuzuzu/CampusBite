// =============================================================================
// Shared Constants — Campus Canteen Management System
// =============================================================================

export const ORDER_STATUSES = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'REJECTED', 'CANCELLED'] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

export const USER_ROLES = ['STUDENT', 'MANAGER', 'SUPER_ADMIN'] as const;
export type UserRole = typeof USER_ROLES[number];

export const DIETARY_TYPES = ['VEG', 'NON_VEG', 'VEGAN', 'EGG'] as const;
export type DietaryType = typeof DIETARY_TYPES[number];

export const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'WALLET', 'PAY_AT_COUNTER'] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export const PAYMENT_STATUSES = ['PENDING', 'COMPLETED', 'REFUNDED', 'FAILED'] as const;
export type PaymentStatus = typeof PAYMENT_STATUSES[number];

export const CROWD_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type CrowdLevel = typeof CROWD_LEVELS[number];

// Valid order status transitions
export const VALID_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY'],
  READY: ['COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

// Socket event names
export const SOCKET_EVENTS = {
  ORDER_NEW: 'order:new',
  ORDER_STATUS_UPDATE: 'order:statusUpdate',
  ORDER_CANCELLED: 'order:cancelled',
  NOTIFICATION: 'notification',
  CROWD_UPDATE: 'crowd:update',
  QUEUE_UPDATE: 'queue:update',
  KITCHEN_ALERT: 'kitchen:alert',
} as const;

// API response format
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

// Pagination
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
