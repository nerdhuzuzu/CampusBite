// User types
export interface User {
  id: string;
  email: string;
  role: 'STUDENT' | 'MANAGER' | 'SUPER_ADMIN';
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
}

export interface StudentProfile {
  id: string;
  enrollmentNo?: string;
  department?: string;
  year?: number;
  dietaryType: 'VEG' | 'NON_VEG' | 'VEGAN' | 'EGG';
}

// Outlet types
export interface Outlet {
  id: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  isActive: boolean;
  isOpen: boolean;
  openingTime: string;
  closingTime: string;
  avgPrepTime: number;
  locationX?: number;
  locationY?: number;
}

// Menu types
export interface FoodCategory {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string;
}

export interface MenuItem {
  id: string;
  outletId: string;
  outlet?: Outlet;
  categoryId: string;
  category?: FoodCategory;
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
  dietaryType: 'VEG' | 'NON_VEG' | 'VEGAN' | 'EGG';
  isAvailable: boolean;
  calories?: number;
  protein?: number;
  preparationTime: number;
  avgRating: number;
  totalRatings: number;
  popularityScore: number;
}

// Order types
export type OrderStatus =
  | 'PLACED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export interface Order {
  id: string;
  orderNumber: string;
  outletId: string;
  outlet?: Outlet;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
  createdAt: string;
  estimatedReady?: string;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

// Cart
export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
}

// Analytics
export interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
  completedOrders: number;
}

// Crowd
export interface CrowdInfo {
  outletId: string;
  peopleCount: number;
  crowdLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  isSimulated: boolean;
}

// Queue
export interface QueueInfo {
  outletId: string;
  estimatedWait: number;
  queueLength: number;
  isEstimate: boolean;
}

// Chat
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
