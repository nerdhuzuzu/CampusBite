import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { ProtectedRoute } from './ProtectedRoute';
import { FullPageSpinner } from '@/components/ui';
import { StudentLayout } from '@/layouts/StudentLayout';
import { ManagerLayout } from '@/layouts/ManagerLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { StudentLogin } from '@/pages/auth/StudentLogin';
import { StudentRegister } from '@/pages/auth/StudentRegister';
import { ManagerLogin } from '@/pages/auth/ManagerLogin';
import { AdminLogin } from '@/pages/auth/AdminLogin';
import { NotFound } from '@/pages/NotFound';

const StudentDashboard = lazy(() => import('@/pages/student/Dashboard'));
const StudentMenuPage = lazy(() => import('@/pages/student/MenuPage'));
const StudentOrdersPage = lazy(() => import('@/pages/student/OrdersPage'));
const StudentRecommendationsPage = lazy(
  () => import('@/pages/student/RecommendationsPage')
);
const StudentProfilePage = lazy(() => import('@/pages/student/ProfilePage'));
const QrLandingPage = lazy(() => import('@/pages/student/QrLandingPage'));
const ManagerDashboard = lazy(() => import('@/pages/manager/Dashboard'));
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'));

function RootRedirect() {
  const { user, isAuthenticated } = useAuthStore();
  if (isAuthenticated && user) {
    if (user.role === 'SUPER_ADMIN') return <Navigate to="/admin/dashboard" replace />;
    if (user.role === 'MANAGER') return <Navigate to="/manager/dashboard" replace />;
    return <Navigate to="/student/dashboard" replace />;
  }
  return <Navigate to="/login/student" replace />;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />

        {/* Separate Authentication Portals */}
        <Route path="/login/student" element={<StudentLogin />} />
        <Route path="/register/student" element={<StudentRegister />} />
        <Route path="/login/manager" element={<ManagerLogin />} />
        <Route path="/login/admin" element={<AdminLogin />} />

        {/* Public Scannable QR Redirect Route */}
        <Route path="/qr/:token" element={<QrLandingPage />} />

        {/* Student Portal */}
        <Route
          path="/student"
          element={
            <ProtectedRoute allowedRoles={['STUDENT']}>
              <StudentLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<StudentDashboard />} />
          <Route path="menu" element={<StudentMenuPage />} />
          <Route path="orders" element={<StudentOrdersPage />} />
          <Route path="recommendations" element={<StudentRecommendationsPage />} />
          <Route path="profile" element={<StudentProfilePage />} />
        </Route>

        {/* Outlet Manager Console */}
        <Route
          path="/manager"
          element={
            <ProtectedRoute allowedRoles={['MANAGER']}>
              <ManagerLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<ManagerDashboard />} />
          <Route path="orders" element={<ManagerDashboard />} />
          <Route path="menu" element={<ManagerDashboard />} />
          <Route path="inventory" element={<ManagerDashboard />} />
          <Route path="analytics" element={<ManagerDashboard />} />
          <Route path="settings" element={<ManagerDashboard />} />
        </Route>

        {/* Super Admin Command Center */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="outlets" element={<AdminDashboard />} />
          <Route path="managers" element={<AdminDashboard />} />
          <Route path="students" element={<AdminDashboard />} />
          <Route path="analytics" element={<AdminDashboard />} />
          <Route path="audit-logs" element={<AdminDashboard />} />
          <Route path="settings" element={<AdminDashboard />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export default AppRoutes;
