import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiV2 } from "@/lib/api";

export type V2Role = "CUSTOMER" | "MANAGER" | "ADMIN";
export type ThemeMode = "light" | "dark";

export interface V2User {
  id: string;
  role: V2Role;
  fullName: string;
  email: string | null;
  phone: string | null;
  walletBalance?: number;
  canteenId?: string | null;
  canteenName?: string | null;
  canteenStatus?: string | null;
}

export interface V2CartItem {
  id: string;
  canteenId: string;
  canteenName: string;
  name: string;
  price: number;
  dietaryType: string;
  imageUrl?: string | null;
  quantity: number;
}

function applyDocumentTheme(theme: ThemeMode) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }
}

interface V2State {
  user: V2User | null;
  isLoadingAuth: boolean;
  theme: ThemeMode;
  cart: V2CartItem[];
  cartCanteenId: string | null;
  cartCanteenName: string | null;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  setSession: (user: V2User, token?: string) => void;
  fetchMe: () => Promise<void>;
  logout: () => Promise<void>;
  addToCart: (
    item: Omit<V2CartItem, "quantity">
  ) => { status: "ADDED" | "SWITCHED_OUTLET"; previousCanteenName?: string };
  updateQty: (id: string, qty: number) => void;
  clearCart: () => void;
}

export const useV2Store = create<V2State>()(
  persist(
    (set, get) => ({
      user: null,
      isLoadingAuth: true,
      theme: "light",
      cart: [],
      cartCanteenId: null,
      cartCanteenName: null,

      toggleTheme: () => {
        const next: ThemeMode = get().theme === "light" ? "dark" : "light";
        applyDocumentTheme(next);
        set({ theme: next });
      },

      setTheme: (theme) => {
        applyDocumentTheme(theme);
        set({ theme });
      },

      setSession: (user, token) => {
        if (token) localStorage.setItem("campusbite_v2_token", token);
        set({ user, isLoadingAuth: false });
      },

      fetchMe: async () => {
        try {
          const res = await apiV2.get("/auth/me");
          set({ user: res.data.data.user, isLoadingAuth: false });
        } catch {
          localStorage.removeItem("campusbite_v2_token");
          set({ user: null, isLoadingAuth: false });
        }
      },

      logout: async () => {
        try {
          await apiV2.post("/auth/logout");
        } catch {
          // ignore
        }
        localStorage.removeItem("campusbite_v2_token");
        set({ user: null });
      },

      addToCart: (item) => {
        const { cart, cartCanteenId, cartCanteenName } = get();
        if (cartCanteenId && cartCanteenId !== item.canteenId) {
          const prevName = cartCanteenName || "previous outlet";
          set({
            cart: [{ ...item, quantity: 1 }],
            cartCanteenId: item.canteenId,
            cartCanteenName: item.canteenName,
          });
          return {
            status: "SWITCHED_OUTLET",
            previousCanteenName: prevName,
          };
        }
        const existing = cart.find((c) => c.id === item.id);
        if (existing) {
          set({
            cart: cart.map((c) =>
              c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
            ),
          });
        } else {
          set({
            cart: [...cart, { ...item, quantity: 1 }],
            cartCanteenId: item.canteenId,
            cartCanteenName: item.canteenName,
          });
        }
        return { status: "ADDED" };
      },

      updateQty: (id, qty) => {
        if (qty <= 0) {
          const next = get().cart.filter((c) => c.id !== id);
          set({
            cart: next,
            cartCanteenId: next.length ? get().cartCanteenId : null,
            cartCanteenName: next.length ? get().cartCanteenName : null,
          });
        } else {
          set({
            cart: get().cart.map((c) =>
              c.id === id ? { ...c, quantity: qty } : c
            ),
          });
        }
      },

      clearCart: () =>
        set({ cart: [], cartCanteenId: null, cartCanteenName: null }),
    }),
    {
      name: "campusbite-v2-store",
      partialize: (s) => ({
        theme: s.theme,
        cart: s.cart,
        cartCanteenId: s.cartCanteenId,
        cartCanteenName: s.cartCanteenName,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) applyDocumentTheme(state.theme);
      },
    }
  )
);
