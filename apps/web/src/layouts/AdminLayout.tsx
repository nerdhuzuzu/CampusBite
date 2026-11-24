import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Store,
  UserCog,
  Users,
  BarChart3,
  FileSearch,
  Settings,
  ShieldCheck,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { Avatar, Badge } from '@/components/ui';
import { FloatingChatbot } from '@/components/chat/FloatingChatbot';
import { cn } from '@/lib/utils';

const adminLinks = [
  { to: '/admin/dashboard', label: 'Command Overview', icon: LayoutDashboard },
  { to: '/admin/outlets', label: 'Campus Outlets', icon: Store },
  { to: '/admin/managers', label: 'Outlet Managers', icon: UserCog },
  { to: '/admin/students', label: 'Students', icon: Users },
  { to: '/admin/analytics', label: 'Platform Analytics', icon: BarChart3 },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: FileSearch },
  { to: '/admin/settings', label: 'System Settings', icon: Settings },
];

export function AdminLayout() {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success('Signed out of Super Admin portal');
    navigate('/login/admin');
  };

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between p-4">
      <div>
        <div className="flex items-center justify-between px-2 py-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-hq-600 text-white shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-extrabold text-slate-900 dark:text-white">CampusBite</span>
              <span className="block text-[11px] font-semibold text-hq-600 dark:text-indigo-400">
                Super Admin HQ
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

        <nav className="mt-6 space-y-1" aria-label="Super Admin navigation">
          {adminLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition',
                  isActive
                    ? 'bg-hq-600 text-white shadow-sm'
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
      <aside className="hidden lg:block w-64 shrink-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 w-64 bg-white dark:bg-slate-900 shadow-lift">
            {sidebarContent}
          </aside>
        </div>
      )}

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
            <Badge tone="info">Super Admin Access • All 5 Outlets</Badge>
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
