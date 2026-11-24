import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { UtensilsCrossed, ChefHat, ShieldCheck, Sun, Moon, Sparkles, QrCode, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useThemeStore } from '@/stores/themeStore';
import { WebsiteQrButton } from '@/components/ui';
import { cn } from '@/lib/utils';

type PortalType = 'student' | 'manager' | 'admin';

interface AuthLayoutProps {
  portal: PortalType;
  title: string;
  subtitle: string;
  children: ReactNode;
}

const portalConfig: Record<
  PortalType,
  {
    badge: string;
    gradient: string;
    accentText: string;
    icon: ReactNode;
    headline: string;
    highlights: { icon: ReactNode; text: string }[];
  }
> = {
  student: {
    badge: 'Student Dining Portal',
    gradient: 'from-brand-800 via-brand-700 to-slate-900',
    accentText: 'text-accent-400',
    icon: <UtensilsCrossed className="h-6 w-6 text-white" />,
    headline: 'Skip the queue. Order from all 5 campus outlets in seconds.',
    highlights: [
      { icon: <QrCode className="h-4 w-4 text-accent-400" />, text: 'Instant QR ordering & live kitchen status tracking' },
      { icon: <Sparkles className="h-4 w-4 text-accent-400" />, text: 'AI-powered food recommendations & budget assistant' },
      { icon: <Clock className="h-4 w-4 text-accent-400" />, text: 'Real-time crowd levels & queue wait-time estimates' },
    ],
  },
  manager: {
    badge: 'Outlet Operations Console',
    gradient: 'from-ops-700 via-ops-600 to-slate-900',
    accentText: 'text-emerald-300',
    icon: <ChefHat className="h-6 w-6 text-white" />,
    headline: 'Real-time kitchen display, smart inventory & demand forecasting.',
    highlights: [
      { icon: <Clock className="h-4 w-4 text-emerald-300" />, text: 'Live Socket.IO order stream & one-tap status updates' },
      { icon: <Sparkles className="h-4 w-4 text-emerald-300" />, text: 'Recipe-linked ingredient stock reservations & low-stock alerts' },
      { icon: <ChefHat className="h-4 w-4 text-emerald-300" />, text: 'ML demand forecasts & peak-hour kitchen load planning' },
    ],
  },
  admin: {
    badge: 'Super Admin Command Center',
    gradient: 'from-hq-700 via-hq-600 to-slate-900',
    accentText: 'text-indigo-300',
    icon: <ShieldCheck className="h-6 w-6 text-white" />,
    headline: 'Centralized governance across every campus food outlet.',
    highlights: [
      { icon: <ShieldCheck className="h-4 w-4 text-indigo-300" />, text: 'Role-based access control & outlet manager assignments' },
      { icon: <Sparkles className="h-4 w-4 text-indigo-300" />, text: 'Cross-outlet revenue analytics, crowd & AI model telemetry' },
      { icon: <Clock className="h-4 w-4 text-indigo-300" />, text: 'Comprehensive security audit logs & platform configuration' },
    ],
  },
};

export function AuthLayout({ portal, title, subtitle, children }: AuthLayoutProps) {
  const { theme, toggleTheme } = useThemeStore();
  const cfg = portalConfig[portal];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row">
      {/* Left Hero Panel */}
      <div
        className={cn(
          'relative hidden lg:flex lg:w-5/12 xl:w-1/2 flex-col justify-between p-12 text-white bg-gradient-to-br overflow-hidden',
          cfg.gradient
        )}
      >
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md border border-white/15">
            {cfg.icon}
          </div>
          <div>
            <span className="text-lg font-extrabold tracking-tight">CampusBite</span>
            <span className="block text-xs text-white/70">{cfg.badge}</span>
          </div>
        </div>

        <div className="relative z-10 my-auto max-w-lg">
          <span className={cn('inline-block text-xs font-bold uppercase tracking-widest mb-3', cfg.accentText)}>
            Centralized Campus Canteen System
          </span>
          <h1 className="text-3xl xl:text-4xl font-extrabold leading-tight tracking-tight">
            {cfg.headline}
          </h1>
          <div className="mt-8 space-y-4">
            {cfg.highlights.map((item, index) => (
              <div key={index} className="flex items-start gap-3 rounded-xl bg-white/5 p-3.5 backdrop-blur-sm border border-white/10">
                <div className="mt-0.5">{item.icon}</div>
                <p className="text-sm text-white/90">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-white/60">
          <span>5 Campus Outlets • Live Kitchen Sync</span>
          <span>RBAC & HTTP-Only JWT Protected</span>
        </div>
      </div>

      {/* Right Auth Form Panel */}
      <div className="flex flex-1 flex-col justify-between p-6 sm:p-10 lg:p-12">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white">
              {cfg.icon}
            </div>
            <div>
              <span className="font-bold text-slate-900 dark:text-white">CampusBite</span>
              <span className="block text-[11px] text-slate-500">{cfg.badge}</span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <WebsiteQrButton />
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-xs font-medium dark:border-slate-800 dark:bg-slate-900">
              <Link
                to="/login/student"
                className={cn(
                  'rounded-lg px-2.5 py-1 transition',
                  portal === 'student'
                    ? 'bg-brand-700 text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                )}
              >
                Student
              </Link>
              <Link
                to="/login/manager"
                className={cn(
                  'rounded-lg px-2.5 py-1 transition',
                  portal === 'manager'
                    ? 'bg-ops-600 text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                )}
              >
                Manager
              </Link>
              <Link
                to="/login/admin"
                className={cn(
                  'rounded-lg px-2.5 py-1 transition',
                  portal === 'admin'
                    ? 'bg-hq-600 text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                )}
              >
                Admin
              </Link>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Form card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mx-auto my-8 w-full max-w-md"
        >
          <div className="mb-6">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {title}
            </h2>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            {children}
          </div>
        </motion.div>

        <p className="text-center text-xs text-slate-400">
          CampusBite Centralized Canteen Platform • College Mini Project
        </p>
      </div>
    </div>
  );
}
