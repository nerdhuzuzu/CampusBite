import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Home,
  UtensilsCrossed,
  ShoppingBag,
  Sparkles,
  User,
  ShoppingCart,
  Sun,
  Moon,
  LogOut,
  Plus,
  Minus,
  Trash2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import { useThemeStore } from '@/stores/themeStore';
import { Avatar, Badge, Button, DropdownMenu, Modal } from '@/components/ui';
import { FloatingChatbot } from '@/components/chat/FloatingChatbot';
import { cn, formatPrice } from '@/lib/utils';

const navItems = [
  { to: '/student/dashboard', label: 'Home', icon: Home },
  { to: '/student/menu', label: 'Menu', icon: UtensilsCrossed },
  { to: '/student/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/student/recommendations', label: 'AI Picks', icon: Sparkles },
  { to: '/student/profile', label: 'Profile', icon: User },
];

export function StudentLayout() {
  const { user, logout } = useAuthStore();
  const { items, updateQuantity, removeItem, clearCart, getTotal, getItemCount } = useCartStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const [cartOpen, setCartOpen] = useState(false);

  const count = getItemCount();
  const total = getTotal();

  const handleLogout = async () => {
    await logout();
    toast.success('Signed out of student portal');
    navigate('/login/student');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm">
              <UtensilsCrossed className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                CampusBite
              </span>
              <Badge tone="accent" className="ml-2">Student</Badge>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Student navigation">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition',
                    isActive
                      ? 'bg-brand-700 text-white shadow-sm dark:bg-brand-600'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              aria-label="Open food cart"
              className="relative flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
              <ShoppingCart className="h-4 w-4 text-accent-500" />
              <span className="hidden sm:inline">{formatPrice(total)}</span>
              {count > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1.5 text-[11px] font-bold text-white">
                  {count}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <DropdownMenu
              trigger={
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 pr-2.5 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
                >
                  <Avatar firstName={user?.firstName} lastName={user?.lastName} size="sm" />
                  <span className="hidden sm:block text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {user?.firstName ?? 'Student'}
                  </span>
                </button>
              }
              items={[
                {
                  label: 'My Profile & Diet',
                  icon: <User className="h-4 w-4" />,
                  onClick: () => navigate('/student/profile'),
                },
                {
                  label: 'Order History',
                  icon: <ShoppingBag className="h-4 w-4" />,
                  onClick: () => navigate('/student/orders'),
                },
                {
                  label: 'Sign Out',
                  icon: <LogOut className="h-4 w-4" />,
                  danger: true,
                  onClick: handleLogout,
                },
              ]}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 sm:px-6 md:pb-10">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Outlet />
        </motion.div>
      </main>

      {/* Floating Role-Aware AI Assistant */}
      <FloatingChatbot />

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile bottom navigation"
        className="fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden dark:border-slate-800 dark:bg-slate-900/95"
      >
        <div className="grid grid-cols-5 h-16">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition',
                  isActive
                    ? 'text-accent-600 dark:text-accent-400'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Cart Modal */}
      <Modal
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title={`Your Tray (${count} item${count === 1 ? '' : 's'})`}
        footer={
          items.length > 0 ? (
            <div className="flex w-full items-center justify-between">
              <Button variant="ghost" size="sm" onClick={clearCart} leftIcon={<Trash2 className="h-4 w-4" />}>
                Clear
              </Button>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold">Total: {formatPrice(total)}</span>
                <Button
                  variant="accent"
                  onClick={() => {
                    setCartOpen(false);
                    navigate('/student/orders');
                    toast.success('Proceeding to order review');
                  }}
                >
                  Checkout
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Your tray is empty. Browse campus outlets and add items to order!
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
            {items.map(({ menuItem, quantity }) => (
              <div key={menuItem.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{menuItem.name}</p>
                  <p className="text-xs text-slate-500">{formatPrice(Number(menuItem.price))} each</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateQuantity(menuItem.id, quantity - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center text-sm font-bold">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(menuItem.id, quantity + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(menuItem.id)}
                    className="ml-1 text-slate-400 hover:text-red-500"
                    aria-label="Remove item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
