import type { ReactNode } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Button, Card, FullPageSpinner } from '@/components/ui';

type Role = 'STUDENT' | 'MANAGER' | 'SUPER_ADMIN';

interface ProtectedRouteProps {
  allowedRoles: Role[];
  children: ReactNode;
}

const loginByRole: Record<Role, string> = {
  STUDENT: '/login/student',
  MANAGER: '/login/manager',
  SUPER_ADMIN: '/login/admin',
};

const dashboardByRole: Record<Role, string> = {
  STUDENT: '/student/dashboard',
  MANAGER: '/manager/dashboard',
  SUPER_ADMIN: '/admin/dashboard',
};

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  const primaryRole = allowedRoles[0] ?? 'STUDENT';

  if (!isAuthenticated || !user) {
    return <Navigate to={loginByRole[primaryRole]} replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    const ownDashboard = dashboardByRole[user.role] ?? '/login/student';
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <Card className="max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-red-600">
            HTTP 403 • Forbidden
          </span>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white">
            Access Denied
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Your account role (<span className="font-semibold">{user.role}</span>) is not permitted to access this portal.
          </p>
          <div className="mt-6 flex justify-center">
            <Link to={ownDashboard}>
              <Button variant="primary" rightIcon={<ArrowRight className="h-4 w-4" />}>
                Go to Your Dashboard
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

export default ProtectedRoute;
