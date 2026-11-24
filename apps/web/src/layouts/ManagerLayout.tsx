import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  Boxes,
  BarChart3,
  Settings,
  ChefHat,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  Radio,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { Avatar, Badge } from '@/components/ui';
import { FloatingChatbot } from '@/components/chat/FloatingChatbot';
import { cn } from '@/lib/utils';

const managerLinks = [
  { to: '/manager/dashboard', label: 'Kitchen Overview', icon: LayoutDashboard },
  { to: '/manager/orders', label: 'Live Orders', icon: ClipboardList },
  { to: '/manager/menu', label: 'Menu & Pricing', icon: UtensilsCrossed },
  { to: '/manager/inventory', label: 'Smart Inventory', icon: Boxes },
  { to: '/manager/analytics', label: 'Sales & Forecast', icon: BarChart3 },
  { to: '/manager/settings', label: 'Outlet Settings', icon: Settings },
];

export function ManagerLayout() {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success('Signed out of manager console');
    navigate('/login/manager');
  };

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between p-4">
      <div>
        <div className="flex items-center justify-between px-2 py-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ops-600 text-white shadow-sm">
              <ChefHat className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-extrabold text-slate-900 dark:text-white">CampusBite</span>
              <span className="block text-[11px] font-semibold text-ops-600 dark:text-emerald-400">
                Outlet Manager
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1 text-slate-400 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-6 space-y-1" aria-label="Manager navigation">
          {managerLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition',
                  isActive
                    ? 'bg-ops-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar firstName={user?.firstName} lastName={user?.lastName} size="sm" />
            <div className="truncate">
              <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="truncate text-[11px] text-slate-500">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Sign Out"
            aria-label="Sign Out"
            className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 w-64 bg-white dark:bg-slate-900 shadow-lift">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 sm:px-6 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="rounded-xl border border-slate-200 p-2 text-slate-600 lg:hidden dark:border-slate-800 dark:text-slate-300"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Badge tone="success">
              <Radio className="h-3 w-3 animate-pulse" />
              Kitchen Feed Active
            </Badge>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
        <FloatingChatbot />
      </div>
    </div>
  );
}
