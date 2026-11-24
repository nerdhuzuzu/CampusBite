import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Store,
  Users,
  UserCog,
  TrendingUp,
  ShieldCheck,
  Plus,
  FileSearch,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import toast from 'react-hot-toast';
import api from '@/lib/axios';
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Skeleton,
  WebsiteQrButton,
} from '@/components/ui';
import { formatDateTime, formatPrice } from '@/lib/utils';
import type { Outlet } from '@/types';

export function AdminDashboard() {
  const location = useLocation();
  const section = location.pathname.split('/')[2] || 'dashboard';
  const queryClient = useQueryClient();

  // Create outlet modal
  const [outletModalOpen, setOutletModalOpen] = useState(false);
  const [outletName, setOutletName] = useState('');
  const [outletDesc, setOutletDesc] = useState('');

  // Create manager modal
  const [mgrModalOpen, setMgrModalOpen] = useState(false);
  const [mgrEmail, setMgrEmail] = useState('');
  const [mgrPassword, setMgrPassword] = useState('Manager@123');
  const [mgrFirst, setMgrFirst] = useState('');
  const [mgrLast, setMgrLast] = useState('');
  const [mgrOutletId, setMgrOutletId] = useState('');

  const analyticsQuery = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: async () => (await api.get('/admin/analytics')).data.data,
  });

  const outletsQuery = useQuery<Outlet[]>({
    queryKey: ['admin-outlets'],
    queryFn: async () => (await api.get('/outlets')).data.data ?? [],
  });

  const managersQuery = useQuery({
    queryKey: ['admin-managers'],
    queryFn: async () => (await api.get('/admin/managers')).data.data ?? [],
  });

  const studentsQuery = useQuery({
    queryKey: ['admin-students'],
    queryFn: async () => (await api.get('/admin/students')).data.data ?? [],
  });

  const auditQuery = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: async () => (await api.get('/admin/audit-logs')).data.data ?? [],
  });

  const healthQuery = useQuery({
    queryKey: ['admin-health'],
    queryFn: async () => (await api.get('/health')).data.data,
  });

  const handleToggleUserStatus = async (userId: string, currentActive: boolean) => {
    try {
      const res = await api.patch(`/admin/users/${userId}/status`, {
        isActive: !currentActive,
      });
      toast.success(res.data.message);
      await queryClient.invalidateQueries({ queryKey: ['admin-managers'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-students'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-audit-logs'] });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Could not update user status');
    }
  };

  const handleToggleOutletOpen = async (outlet: Outlet) => {
    try {
      await api.patch(`/admin/outlets/${outlet.id}`, { isOpen: !outlet.isOpen });
      toast.success(`${outlet.name} is now ${!outlet.isOpen ? 'Open' : 'Closed'}`);
      await queryClient.invalidateQueries({ queryKey: ['admin-outlets'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-analytics'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-audit-logs'] });
    } catch {
      toast.error('Failed to update outlet status');
    }
  };

  const handleCreateOutlet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outletName.trim()) return;
    try {
      await api.post('/admin/outlets', {
        name: outletName.trim(),
        description: outletDesc.trim() || undefined,
      });
      toast.success(`Created outlet ${outletName}`);
      setOutletName('');
      setOutletDesc('');
      setOutletModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['admin-outlets'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-analytics'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-audit-logs'] });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Could not create outlet');
    }
  };

  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetOutlet = mgrOutletId || outletsQuery.data?.[0]?.id;
    if (!targetOutlet) return;
    try {
      await api.post('/admin/managers', {
        email: mgrEmail.trim(),
        password: mgrPassword,
        firstName: mgrFirst.trim(),
        lastName: mgrLast.trim(),
        outletId: targetOutlet,
      });
      toast.success(`Created manager ${mgrEmail}`);
      setMgrEmail('');
      setMgrFirst('');
      setMgrLast('');
      setMgrModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['admin-managers'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-audit-logs'] });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Could not create manager');
    }
  };

  const summary = analyticsQuery.data?.summary;
  const outletComparison = analyticsQuery.data?.outletComparison ?? [];
  const outlets = outletsQuery.data ?? [];
  const managers = managersQuery.data ?? [];
  const students = studentsQuery.data ?? [];
  const auditLogs = auditQuery.data ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Badge tone="info" className="mb-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            Super Admin Governance • Centralized Campus Ecosystem
          </Badge>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Super Admin Command Center
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <WebsiteQrButton outlets={outlets as Array<{ id: string; name: string; qrToken?: string | null }>} />
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setOutletModalOpen(true)}
          >
            Add Outlet
          </Button>
          <Button
            size="sm"
            variant="primary"
            className="bg-hq-600 hover:bg-hq-700"
            leftIcon={<UserCog className="h-4 w-4" />}
            onClick={() => setMgrModalOpen(true)}
          >
            Provision Manager
          </Button>
        </div>
      </div>

      {/* Platform KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">
              Campus Outlets
            </span>
            <Store className="h-5 w-5 text-hq-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
            {summary?.totalOutlets ?? outlets.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Centralized digital dining</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">
              Platform Revenue
            </span>
            <TrendingUp className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {formatPrice(summary?.totalRevenue ?? 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Across {summary?.totalOrders ?? 0} campus orders
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">
              Registered Students
            </span>
            <Users className="h-5 w-5 text-accent-500" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
            {summary?.totalStudents ?? students.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Active student accounts</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">
              Outlet Managers
            </span>
            <UserCog className="h-5 w-5 text-blue-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
            {summary?.totalManagers ?? managers.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">RBAC outlet-scoped</p>
        </Card>
      </div>

      {/* Analytics Comparison Chart */}
      {(section === 'dashboard' || section === 'analytics') && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Outlet-Wise Sales & Order Comparison
              </h2>
              <p className="text-xs text-slate-500">
                Real-time aggregation across all campus outlets
              </p>
            </div>
          </div>
          {analyticsQuery.isLoading ? (
            <Skeleton className="h-60 w-full" />
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={outletComparison}>
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      )}

      {/* Outlets Directory */}
      {(section === 'dashboard' || section === 'outlets') && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Campus Outlets Governance ({outlets.length})
            </h2>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setOutletModalOpen(true)}
            >
              Add New Outlet
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800">
                  <th className="pb-3">Outlet</th>
                  <th className="pb-3">Hours</th>
                  <th className="pb-3">Prep Time</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {outlets.map((o) => (
                  <tr key={o.id}>
                    <td className="py-3 font-bold text-slate-900 dark:text-white">{o.name}</td>
                    <td className="py-3 text-slate-500">
                      {o.openingTime} – {o.closingTime}
                    </td>
                    <td className="py-3 text-slate-500">~{o.avgPrepTime} min</td>
                    <td className="py-3">
                      <Badge tone={o.isOpen ? 'success' : 'danger'}>
                        {o.isOpen ? 'Open' : 'Closed'}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleToggleOutletOpen(o)}
                      >
                        {o.isOpen ? 'Close Outlet' : 'Open Outlet'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Managers Directory */}
      {(section === 'dashboard' || section === 'managers') && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Assigned Outlet Managers ({managers.length})
            </h2>
            <Button
              size="sm"
              variant="primary"
              className="bg-hq-600 hover:bg-hq-700"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setMgrModalOpen(true)}
            >
              Create Manager Account
            </Button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {managers.map(
              (m: {
                id: string;
                email: string;
                firstName: string;
                lastName: string;
                isActive: boolean;
                managerProfile?: { outlet?: { name: string } };
              }) => (
                <div key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">
                      {m.firstName} {m.lastName}
                    </p>
                    <p className="text-xs text-slate-500">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="info">
                      {m.managerProfile?.outlet?.name ?? 'Unassigned'}
                    </Badge>
                    <Button
                      size="sm"
                      variant={m.isActive ? 'secondary' : 'accent'}
                      onClick={() => handleToggleUserStatus(m.id, m.isActive)}
                    >
                      {m.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </div>
              )
            )}
          </div>
        </Card>
      )}

      {/* Students Directory */}
      {section === 'students' && (
        <Card className="p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Registered Campus Students ({students.length})
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {students.map(
              (s: {
                id: string;
                email: string;
                firstName: string;
                lastName: string;
                studentProfile?: { department?: string; dietaryType?: string };
                _count?: { orders: number };
              }) => (
                <div key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">
                      {s.firstName} {s.lastName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {s.email} • {s.studentProfile?.department ?? 'Campus Student'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{s.studentProfile?.dietaryType ?? 'VEG'}</Badge>
                    <Badge tone="accent">{s._count?.orders ?? 0} orders</Badge>
                  </div>
                </div>
              )
            )}
          </div>
        </Card>
      )}

      {/* Security Audit Logs */}
      {(section === 'dashboard' || section === 'audit-logs') && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-hq-600" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Security & Administrative Audit Logs ({auditLogs.length})
            </h2>
          </div>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-500">
              Administrative mutations (creating outlets, managers, menu edits) are logged here automatically.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
              {auditLogs.map(
                (log: {
                  id: string;
                  action: string;
                  entity: string;
                  details?: string;
                  createdAt: string;
                  user?: { email: string; role: string };
                }) => (
                  <div key={log.id} className="flex items-center justify-between py-2 text-xs">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white">
                        [{log.action}] {log.entity}
                      </span>{' '}
                      <span className="text-slate-500">
                        by {log.user?.email ?? 'System'} ({log.user?.role})
                      </span>
                      {log.details && (
                        <p className="font-mono text-[11px] text-slate-400">{log.details}</p>
                      )}
                    </div>
                    <span className="text-slate-400">{formatDateTime(log.createdAt)}</span>
                  </div>
                )
              )}
            </div>
          )}
        </Card>
      )}

      {/* System Settings & Live Platform Telemetry */}
      {section === 'settings' && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Platform Infrastructure & Security Telemetry
              </h2>
              <p className="text-xs text-slate-500">
                Real-time health check from Node.js API, MySQL connection pool & RBAC guard
              </p>
            </div>
            <Badge tone={healthQuery.data?.database === 'connected' ? 'success' : 'danger'}>
              MySQL: {healthQuery.data?.database ?? 'checking…'}
            </Badge>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
              <span className="text-slate-500">API Environment</span>
              <p className="mt-1 text-base font-extrabold uppercase">
                {healthQuery.data?.environment ?? 'development'}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
              <span className="text-slate-500">Authentication Policy</span>
              <p className="mt-1 text-base font-extrabold">
                HTTP-Only JWT + 30d Refresh Rotation
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
              <span className="text-slate-500">Server Uptime</span>
              <p className="mt-1 text-base font-extrabold">
                {Math.round(healthQuery.data?.uptime ?? 0)}s
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Create Outlet Modal */}
      <Modal
        open={outletModalOpen}
        onClose={() => setOutletModalOpen(false)}
        title="Add New Campus Food Outlet"
      >
        <form onSubmit={handleCreateOutlet} className="space-y-3.5">
          <Input
            label="Outlet Name"
            value={outletName}
            onChange={(e) => setOutletName(e.target.value)}
            placeholder="e.g., Juice & Shake Bar"
            required
          />
          <Input
            label="Description"
            value={outletDesc}
            onChange={(e) => setOutletDesc(e.target.value)}
            placeholder="Fresh fruit juices, smoothies and healthy bowls"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOutletModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="bg-hq-600 hover:bg-hq-700">
              Create Outlet
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Manager Modal */}
      <Modal
        open={mgrModalOpen}
        onClose={() => setMgrModalOpen(false)}
        title="Provision & Assign Outlet Manager"
      >
        <form onSubmit={handleCreateManager} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First Name"
              value={mgrFirst}
              onChange={(e) => setMgrFirst(e.target.value)}
              required
            />
            <Input
              label="Last Name"
              value={mgrLast}
              onChange={(e) => setMgrLast(e.target.value)}
              required
            />
          </div>
          <Input
            label="Manager Email"
            type="email"
            value={mgrEmail}
            onChange={(e) => setMgrEmail(e.target.value)}
            placeholder="manager6@campus.com"
            required
          />
          <Input
            label="Initial Password"
            type="password"
            value={mgrPassword}
            onChange={(e) => setMgrPassword(e.target.value)}
            required
          />
          <Select
            label="Assign to Campus Outlet"
            value={mgrOutletId}
            onChange={(e) => setMgrOutletId(e.target.value)}
            options={outlets.map((o) => ({ value: o.id, label: o.name }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setMgrModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="bg-hq-600 hover:bg-hq-700">
              Provision Manager
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default AdminDashboard;
