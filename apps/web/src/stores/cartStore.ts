import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, MenuItem } from '@/types';

interface CartState {
  items: CartItem[];
  outletId: string | null;
  addItem: (menuItem: MenuItem) => void;
  removeItem: (menuItemId: string) => void;
  updateQuantity: (menuItemId: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      outletId: null,

      addItem: (menuItem: MenuItem) => {
        const { items, outletId } = get();

        // If cart has items from different outlet, clear it
        if (outletId && outletId !== menuItem.outletId) {
          set({
            items: [{ menuItem, quantity: 1 }],
            outletId: menuItem.outletId,
          });
          return;
        }

        const existingIndex = items.findIndex(
          (item) => item.menuItem.id === menuItem.id
        );

        if (existingIndex >= 0) {
          const newItems = [...items];
          newItems[existingIndex] = {
            ...newItems[existingIndex],
            quantity: newItems[existingIndex].quantity + 1,
          };
          set({ items: newItems });
        } else {
          set({
            items: [...items, { menuItem, quantity: 1 }],
            outletId: menuItem.outletId,
          });
        }
      },

      removeItem: (menuItemId: string) => {
        const newItems = get().items.filter(
          (item) => item.menuItem.id !== menuItemId
        );
        set({
          items: newItems,
          outletId: newItems.length === 0 ? null : get().outletId,
        });
      },

      updateQuantity: (menuItemId: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(menuItemId);
          return;
        }

        const newItems = get().items.map((item) =>
          item.menuItem.id === menuItemId ? { ...item, quantity } : item
        );
        set({ items: newItems });
      },

      clearCart: () => {
        set({ items: [], outletId: null });
      },

      getTotal: () => {
        return get().items.reduce(
          (total, item) => total + item.menuItem.price * item.quantity,
          0
        );
      },

      getItemCount: () => {
        return get().items.reduce((count, item) => count + item.quantity, 0);
      },
    }),
    {
      name: 'canteen-cart',
    }
  )
);
