import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { useV2Store, type V2Role } from "@/stores/v2Store";
import {
  CustomerLoginPage,
  CustomerRegisterPage,
  ManagerLoginPage,
  AdminLoginPage,
} from "@/pages/auth/AuthPortals";
import { CustomerPortal } from "@/pages/customer/CustomerPortal";
import { ManagerPortal } from "@/pages/manager/ManagerPortal";
import { AdminPortal } from "@/pages/admin/AdminPortal";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function RequireV2Auth({
  role,
  children,
}: {
  role: V2Role;
  children: React.ReactNode;
}) {
  const { user, isLoadingAuth } = useV2Store();

  if (isLoadingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-500">
        Verifying session…
      </div>
    );
  }

  const loginPath =
    role === "ADMIN"
      ? "/login/admin"
      : role === "MANAGER"
        ? "/login/manager"
        : "/login/customer";

  if (!user) {
    return <Navigate to={loginPath} replace />;
  }

  if (user.role !== role) {
    const ownPath =
      user.role === "ADMIN"
        ? "/admin/dashboard"
        : user.role === "MANAGER"
          ? "/manager/dashboard"
          : "/";
    return <Navigate to={ownPath} replace />;
  }

  return <>{children}</>;
}

/**
 * Public-first customer route:
 * - Unauthenticated guests and authenticated CUSTOMER users see CustomerPortal immediately without forced redirects.
 * - Authenticated ADMIN or MANAGER users visiting "/" are routed to their respective operational consoles.
 */
function PublicOrCustomerRoute() {
  const { user } = useV2Store();

  if (user?.role === "ADMIN") {
    return <Navigate to="/admin/dashboard" replace />;
  }
  if (user?.role === "MANAGER") {
    return <Navigate to="/manager/dashboard" replace />;
  }

  return <CustomerPortal />;
}

export function App() {
  const fetchMe = useV2Store((s) => s.fetchMe);
  const theme = useV2Store((s) => s.theme);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PublicOrCustomerRoute />} />
          <Route path="/login/customer" element={<CustomerLoginPage />} />
          <Route path="/register/customer" element={<CustomerRegisterPage />} />
          <Route path="/login/manager" element={<ManagerLoginPage />} />
          <Route path="/login/admin" element={<AdminLoginPage />} />

          <Route path="/customer/*" element={<PublicOrCustomerRoute />} />
          <Route
            path="/manager/*"
            element={
              <RequireV2Auth role="MANAGER">
                <ManagerPortal />
              </RequireV2Auth>
            }
          />
          <Route
            path="/admin/*"
            element={
              <RequireV2Auth role="ADMIN">
                <AdminPortal />
              </RequireV2Auth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
