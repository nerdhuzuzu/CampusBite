import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Store,
  Users,
  UserCog,
  ClipboardList,
  UtensilsCrossed,
  Boxes,
  CreditCard,
  FileText,
  Plus,
  Pencil,
  Trash2,
  LogOut,
  ShieldCheck,
  Search,
  PauseCircle,
  PlayCircle,
  Archive,
  Settings,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Phone,
  Menu,
  X,
  Sun,
  Moon,
  Download,
  BarChart3,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import toast from "react-hot-toast";
import { apiV2, formatINR, getSocketV2 } from "@/lib/api";
import { useV2Store } from "@/stores/v2Store";

type AdminTab =
  | "overview"
  | "establishments"
  | "managers"
  | "customers"
  | "orders"
  | "menu"
  | "inventory"
  | "payments"
  | "audit"
  | "settings";

interface EstablishmentRecord {
  id: string;
  name: string;
  type: "CANTEEN" | "CAFE" | "FOOD_STALL" | "RESTAURANT";
  description: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  location: string | null;
  opening_time: string;
  closing_time: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  is_deleted: number;
  created_at: string;
  manager_user_id: string | null;
  manager_name: string | null;
  manager_email: string | null;
  menu_items_count: number;
  total_orders: number;
  total_revenue: number;
}

export function AdminPortal() {
  const { user, logout, theme, toggleTheme } = useV2Store();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterCanteenId, setFilterCanteenId] = useState("");

  // Create / Edit Establishment Modal
  const [estModalOpen, setEstModalOpen] = useState(false);
  const [editingEst, setEditingEst] = useState<EstablishmentRecord | null>(null);
  const [estForm, setEstForm] = useState({
    name: "",
    type: "CANTEEN" as "CANTEEN" | "CAFE" | "FOOD_STALL" | "RESTAURANT",
    description: "",
    logoUrl: "",
    coverImageUrl: "",
    contactEmail: "",
    contactPhone: "",
    location: "",
    openingTime: "08:00",
    closingTime: "20:00",
    managerId: "",
    status: "ACTIVE" as "ACTIVE" | "SUSPENDED" | "ARCHIVED",
  });

  // Delete Establishment Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState<EstablishmentRecord | null>(
    null
  );
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Create Manager Modal
  const [mgrModalOpen, setMgrModalOpen] = useState(false);
  const [mgrForm, setMgrForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    canteenId: "",
  });

  useEffect(() => {
    const socket = getSocketV2();
    const refreshAll = () => {
      void queryClient.invalidateQueries({ queryKey: ["v2-admin-overview"] });
      void queryClient.invalidateQueries({
        queryKey: ["v2-admin-establishments"],
      });
      void queryClient.invalidateQueries({ queryKey: ["v2-admin-orders"] });
    };
    socket.on("establishment:updated", refreshAll);
    socket.on("order:created", refreshAll);
    socket.on("order:updated", refreshAll);
    return () => {
      socket.off("establishment:updated", refreshAll);
      socket.off("order:created", refreshAll);
      socket.off("order:updated", refreshAll);
    };
  }, [queryClient]);

  const overviewQuery = useQuery({
    queryKey: [
      "v2-admin-overview",
      filterStartDate,
      filterEndDate,
      filterCanteenId,
    ],
    queryFn: async () =>
      (
        await apiV2.get("/admin/overview", {
          params: {
            ...(filterStartDate ? { startDate: filterStartDate } : {}),
            ...(filterEndDate ? { endDate: filterEndDate } : {}),
            ...(filterCanteenId ? { canteenId: filterCanteenId } : {}),
          },
        })
      ).data.data,
  });

  const establishmentsQuery = useQuery<EstablishmentRecord[]>({
    queryKey: ["v2-admin-establishments"],
    queryFn: async () => (await apiV2.get("/admin/establishments")).data.data,
  });

  const managersQuery = useQuery({
    queryKey: ["v2-admin-managers"],
    queryFn: async () => (await apiV2.get("/admin/managers")).data.data,
  });

  const customersQuery = useQuery({
    queryKey: ["v2-admin-customers", customerSearch],
    queryFn: async () =>
      (
        await apiV2.get("/admin/customers", {
          params: customerSearch ? { search: customerSearch } : {},
        })
      ).data.data,
  });

  const ordersQuery = useQuery({
    queryKey: ["v2-admin-orders"],
    queryFn: async () => (await apiV2.get("/admin/orders")).data.data,
  });

  const paymentsQuery = useQuery({
    queryKey: ["v2-admin-payments"],
    queryFn: async () => (await apiV2.get("/admin/payments")).data.data,
  });

  const menuQuery = useQuery({
    queryKey: ["v2-admin-menu"],
    queryFn: async () => (await apiV2.get("/admin/menu")).data.data,
  });

  const inventoryQuery = useQuery({
    queryKey: ["v2-admin-inventory"],
    queryFn: async () => (await apiV2.get("/admin/inventory")).data.data,
  });

  const auditQuery = useQuery({
    queryKey: ["v2-admin-audit"],
    queryFn: async () => (await apiV2.get("/admin/audit-logs")).data.data,
  });

  const otpStatusQuery = useQuery({
    queryKey: ["v2-otp-status"],
    queryFn: async () => (await apiV2.get("/auth/otp-status")).data.data,
  });

  const openCreateEstablishment = () => {
    setEditingEst(null);
    setEstForm({
      name: "",
      type: "CANTEEN",
      description: "",
      logoUrl: "",
      coverImageUrl: "",
      contactEmail: "",
      contactPhone: "",
      location: "",
      openingTime: "08:00",
      closingTime: "20:00",
      managerId: "",
      status: "ACTIVE",
    });
    setEstModalOpen(true);
  };

  const openEditEstablishment = (est: EstablishmentRecord) => {
    setEditingEst(est);
    setEstForm({
      name: est.name,
      type: est.type,
      description: est.description || "",
      logoUrl: est.logo_url || "",
      coverImageUrl: est.cover_image_url || "",
      contactEmail: est.contact_email || "",
      contactPhone: est.contact_phone || "",
      location: est.location || "",
      openingTime: est.opening_time || "08:00",
      closingTime: est.closing_time || "20:00",
      managerId: est.manager_user_id || "",
      status: est.status,
    });
    setEstModalOpen(true);
  };

  const handleSaveEstablishment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingEst) {
        const res = await apiV2.put(
          `/admin/establishments/${editingEst.id}`,
          estForm
        );
        toast.success(res.data.message);
      } else {
        const res = await apiV2.post("/admin/establishments", estForm);
        toast.success(res.data.message);
      }
      setEstModalOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["v2-admin-establishments"],
      });
      await queryClient.invalidateQueries({ queryKey: ["v2-admin-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["v2-admin-managers"] });
      await queryClient.invalidateQueries({ queryKey: ["v2-admin-audit"] });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Failed to save establishment.";
      toast.error(msg);
    }
  };

  const handleChangeEstStatus = async (
    id: string,
    status: "ACTIVE" | "SUSPENDED" | "ARCHIVED"
  ) => {
    try {
      const res = await apiV2.patch(`/admin/establishments/${id}/status`, {
        status,
      });
      toast.success(res.data.message);
      await queryClient.invalidateQueries({
        queryKey: ["v2-admin-establishments"],
      });
      await queryClient.invalidateQueries({ queryKey: ["v2-admin-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["v2-admin-audit"] });
    } catch {
      toast.error("Failed to update status.");
    }
  };

  const handleConfirmDeleteEstablishment = async () => {
    if (!deleteTarget) return;
    try {
      const res = await apiV2.delete(
        `/admin/establishments/${deleteTarget.id}`
      );
      toast.success(res.data.message);
      setDeleteTarget(null);
      setDeleteConfirmText("");
      await queryClient.invalidateQueries({
        queryKey: ["v2-admin-establishments"],
      });
      await queryClient.invalidateQueries({ queryKey: ["v2-admin-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["v2-admin-audit"] });
    } catch {
      toast.error("Failed to delete establishment.");
    }
  };

  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiV2.post("/admin/managers", mgrForm);
      toast.success(res.data.message);
      setMgrModalOpen(false);
      setMgrForm({
        fullName: "",
        email: "",
        phone: "",
        password: "",
        canteenId: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["v2-admin-managers"] });
      await queryClient.invalidateQueries({
        queryKey: ["v2-admin-establishments"],
      });
      await queryClient.invalidateQueries({ queryKey: ["v2-admin-audit"] });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not create manager.";
      toast.error(msg);
    }
  };

  const handleToggleUserStatus = async (
    userId: string,
    currentStatus: string
  ) => {
    const next = currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    try {
      const res = await apiV2.patch(`/admin/users/${userId}/status`, {
        status: next,
      });
      toast.success(res.data.message);
      await queryClient.invalidateQueries({ queryKey: ["v2-admin-customers"] });
      await queryClient.invalidateQueries({ queryKey: ["v2-admin-managers"] });
      await queryClient.invalidateQueries({ queryKey: ["v2-admin-audit"] });
    } catch {
      toast.error("Failed to update account status.");
    }
  };

  const handleExportAdminCsv = () => {
    const data = overviewQuery.data;
    if (!data) return;
    const s = data.summary || {};
    const rows = [
      ["Platform Metric", "Value"],
      ["Active Establishments", String(s.activeEstablishments ?? 0)],
      ["Total Establishments", String(s.totalEstablishments ?? 0)],
      ["Total Customers", String(s.totalCustomers ?? 0)],
      ["Customer Retention Rate (%)", String(s.retentionRatePct ?? 0)],
      ["Average Customer Spend (INR)", String(s.avgCustomerSpend ?? 0)],
      ["Total Orders", String(s.totalOrders ?? 0)],
      ["Daily Revenue (INR)", String(s.dailyRevenue ?? 0)],
      ["Weekly Revenue (INR)", String(s.weeklyRevenue ?? 0)],
      ["Monthly Revenue (INR)", String(s.monthlyRevenue ?? 0)],
      ["Annual Revenue (INR)", String(s.annualRevenue ?? 0)],
      ["Total Platform Revenue (INR)", String(s.totalRevenue ?? 0)],
      ["Average Order Value (INR)", String(s.averageOrderValue ?? 0)],
      ["Cancellation Rate (%)", String(s.cancellationRatePct ?? 0)],
      ["Rejection Rate (%)", String(s.rejectionRatePct ?? 0)],
      ["Wallet Top-Ups Total (INR)", String(s.walletTopUpsTotal ?? 0)],
      [],
      ["Establishment", "Type", "Status", "Orders", "Revenue (INR)"],
      ...(data.establishmentBreakdown ?? []).map(
        (e: {
          name: string;
          type: string;
          status: string;
          order_count: number;
          revenue: number;
        }) => [
          e.name,
          e.type,
          e.status,
          String(e.order_count ?? 0),
          String(e.revenue ?? 0),
        ]
      ),
    ];
    const csvContent =
      "data:text/csv;charset=utf-8," +
      rows
        .map((r: string[]) =>
          r.map((c: string) => `"${String(c).replace(/"/g, '""')}"`).join(",")
        )
        .join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = `campusbite-platform-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    toast.success("Platform analytics exported to CSV!");
  };

  const summary = overviewQuery.data?.summary;
  const establishments = establishmentsQuery.data ?? [];
  const managers = managersQuery.data ?? [];
  const customers = customersQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];
  const menuItems = menuQuery.data ?? [];
  const inventoryItems = inventoryQuery.data ?? [];
  const auditLogs = auditQuery.data ?? [];
  const otpDiag = otpStatusQuery.data;

  const navButtons: Array<{
    id: AdminTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "overview", label: "Platform Overview", icon: BarChart3 },
    { id: "establishments", label: "Establishments", icon: Store },
    { id: "managers", label: "Canteen Managers", icon: UserCog },
    { id: "customers", label: "Customers", icon: Users },
    { id: "orders", label: "Order Monitoring", icon: ClipboardList },
    { id: "menu", label: "Menu Catalogue", icon: UtensilsCrossed },
    { id: "inventory", label: "Inventory Audit", icon: Boxes },
    { id: "payments", label: "Payments & Ledger", icon: CreditCard },
    { id: "audit", label: "Security Audit Logs", icon: FileText },
    { id: "settings", label: "OTP & Platform Config", icon: Settings },
  ];

  const SidebarContent = ({ onSelect }: { onSelect?: () => void }) => (
    <div className="flex h-full flex-col justify-between p-4">
      <div>
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-hq-600 text-white shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <span className="font-display text-base font-bold text-slate-900 dark:text-white">
              CampusBite
            </span>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-hq-600">
              HQ Governance
            </span>
          </div>
        </div>

        <nav className="mt-6 space-y-1">
          {navButtons.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                onSelect?.();
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-colors ${
                tab === id
                  ? "bg-hq-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="truncate">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {user?.fullName}
            </p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate("/login/admin");
            }}
            className="rounded-xl p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-64 bg-white dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onSelect={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur-md sm:px-6 dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="inline-flex items-center gap-2 rounded-full bg-hq-500/10 px-3 py-1 text-xs font-semibold text-hq-600 dark:text-indigo-400">
              Super Admin Access
            </span>
            <h1 className="hidden sm:block font-display text-sm font-extrabold text-slate-900 dark:text-white">
              {navButtons.find((n) => n.id === tab)?.label}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openCreateEstablishment}
              className="inline-flex items-center gap-1.5 rounded-xl bg-hq-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-hq-700"
            >
              <Plus className="h-4 w-4" />{" "}
              <span className="hidden sm:inline">Create Establishment</span>
              <span className="sm:hidden">New Outlet</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMgrForm((f) => ({
                  ...f,
                  canteenId: establishments[0]?.id || "",
                }));
                setMgrModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50"
            >
              <UserCog className="h-4 w-4 text-hq-600" />{" "}
              <span className="hidden sm:inline">Provision Manager</span>
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Primary Platform KPI Strip */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-soft">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Establishments
              </span>
              <p className="mt-1.5 font-display text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                {summary?.activeEstablishments ?? 0}{" "}
                <span className="text-sm font-medium text-slate-400">
                  / {summary?.totalEstablishments ?? 0}
                </span>
              </p>
              <span className="text-[11px] text-slate-500">
                Suspended: {summary?.suspendedEstablishments ?? 0}
              </span>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-soft">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Customers
              </span>
              <p className="mt-1.5 font-display text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                {summary?.totalCustomers ?? 0}
              </p>
              <span className="text-[11px] text-slate-500">
                Retention: {summary?.retentionRatePct ?? 0}% • New (30d):{" "}
                {summary?.newCustomers30d ?? 0}
              </span>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-soft">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Managers
              </span>
              <p className="mt-1.5 font-display text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                {summary?.totalManagers ?? 0}
              </p>
              <span className="text-[11px] text-slate-500">
                Avg Completion: ~{summary?.avgCompletionMinutes ?? 12}m
              </span>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-soft">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Total Orders
              </span>
              <p className="mt-1.5 font-display text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                {summary?.totalOrders ?? 0}
              </p>
              <span className="text-[11px] text-slate-500">
                AOV: {formatINR(summary?.averageOrderValue ?? 0)}
              </span>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-soft">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Verified GMV
              </span>
              <p className="mt-1.5 font-display text-2xl sm:text-3xl font-extrabold text-hq-600 dark:text-indigo-400">
                {formatINR(summary?.totalRevenue ?? 0)}
              </p>
              <span className="text-[11px] text-slate-500">
                Today: {formatINR(summary?.dailyRevenue ?? 0)}
              </span>
            </div>
          </div>

          {/* ================================================================= */}
          {/* TAB 1: PLATFORM OVERVIEW & FINANCIAL / OPERATIONAL ANALYTICS      */}
          {/* ================================================================= */}
          {tab === "overview" && (
            <div className="space-y-6">
              {/* Filter & CSV Export Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-soft">
                <div>
                  <h2 className="font-display text-sm font-extrabold text-slate-900 dark:text-white">
                    Platform-Wide Financial, Establishment & Customer Analytics
                  </h2>
                  <p className="text-xs text-slate-500">
                    Filter across date ranges or inspect individual establishment performance
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <select
                    value={filterCanteenId}
                    onChange={(e) => setFilterCanteenId(e.target.value)}
                    className="h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5"
                  >
                    <option value="">All Establishments</option>
                    {establishments.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-2.5"
                  />
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-2.5"
                  />
                  {(filterStartDate || filterEndDate || filterCanteenId) && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterStartDate("");
                        setFilterEndDate("");
                        setFilterCanteenId("");
                      }}
                      className="rounded-xl border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 font-bold"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleExportAdminCsv}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-hq-600 px-3.5 py-2 font-bold text-white hover:bg-hq-700"
                  >
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </button>
                </div>
              </div>

              {/* Financial & Operational KPIs */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-soft">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Weekly Revenue
                  </span>
                  <p className="mt-1 font-display text-base font-extrabold text-slate-900 dark:text-white">
                    {formatINR(summary?.weeklyRevenue ?? 0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-soft">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Monthly Revenue
                  </span>
                  <p className="mt-1 font-display text-base font-extrabold text-hq-600">
                    {formatINR(summary?.monthlyRevenue ?? 0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-soft">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Annual Revenue
                  </span>
                  <p className="mt-1 font-display text-base font-extrabold text-slate-900 dark:text-white">
                    {formatINR(summary?.annualRevenue ?? 0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-soft">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Avg Customer Spend
                  </span>
                  <p className="mt-1 font-display text-base font-extrabold text-slate-900 dark:text-white">
                    {formatINR(summary?.avgCustomerSpend ?? 0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-soft">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Wallet Top-Ups
                  </span>
                  <p className="mt-1 font-display text-base font-extrabold text-emerald-600">
                    {formatINR(summary?.walletTopUpsTotal ?? 0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-soft">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Cancel / Reject Rate
                  </span>
                  <p className="mt-1 font-display text-base font-extrabold text-red-600">
                    {summary?.cancellationRatePct ?? 0}% /{" "}
                    {summary?.rejectionRatePct ?? 0}%
                  </p>
                </div>
              </div>

              {/* Charts: Establishment Revenue Comparison & Financial Trends */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-soft">
                  <h3 className="font-display text-sm font-extrabold text-slate-900 dark:text-white">
                    Establishment Revenue Comparison
                  </h3>
                  <div className="mt-4 h-64">
                    {(overviewQuery.data?.establishmentBreakdown ?? [])
                      .length === 0 ? (
                      <div className="flex h-full items-center justify-center text-xs text-slate-400">
                        No establishments registered yet
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={overviewQuery.data.establishmentBreakdown}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar
                            dataKey="revenue"
                            fill="#4f46e5"
                            radius={[8, 8, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-soft">
                  <h3 className="font-display text-sm font-extrabold text-slate-900 dark:text-white">
                    Platform Daily Financial Trend
                  </h3>
                  <div className="mt-4 h-64">
                    {(overviewQuery.data?.financialTrend ?? []).length === 0 ? (
                      <div className="flex h-full items-center justify-center text-xs text-slate-400">
                        No financial transactions in selected period
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={overviewQuery.data.financialTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Line
                            type="monotone"
                            dataKey="revenue"
                            stroke="#4f46e5"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: ESTABLISHMENT MANAGEMENT */}
          {(tab === "establishments" || tab === "overview") && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 px-6 py-4">
                <div>
                  <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
                    Registered Campus Establishments ({establishments.length})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Create, rename by permanent ID (preserving order snapshots), assign managers, suspend, or safely delete
                  </p>
                </div>
              </div>

              {establishments.length === 0 ? (
                <div className="p-14 text-center">
                  <Store className="mx-auto h-9 w-9 text-slate-300" />
                  <h3 className="mt-3 font-display text-sm font-bold text-slate-900 dark:text-white">
                    No establishments registered
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                    CampusBite starts with zero demo establishments. Click “Create Establishment” above to register your first campus canteen or cafe.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-5 py-3.5">Establishment</th>
                        <th className="px-4 py-3.5">Category</th>
                        <th className="px-4 py-3.5">Assigned Manager</th>
                        <th className="px-4 py-3.5">Hours & Contact</th>
                        <th className="px-4 py-3.5">Dishes / Orders</th>
                        <th className="px-4 py-3.5">Status</th>
                        <th className="px-5 py-3.5 text-right">Governance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {establishments.map((est) => (
                        <tr
                          key={est.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                        >
                          <td className="px-5 py-3.5">
                            <p className="font-display font-extrabold text-slate-900 dark:text-white">
                              {est.name}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {est.location || "Main Campus"} • Added{" "}
                              {new Date(est.created_at).toLocaleDateString()}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 font-bold text-slate-700 dark:text-slate-300">
                            {est.type}
                          </td>
                          <td className="px-4 py-3.5">
                            {est.manager_name ? (
                              <div>
                                <p className="font-bold text-slate-900 dark:text-white">
                                  {est.manager_name}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {est.manager_email}
                                </p>
                              </div>
                            ) : (
                              <span className="text-slate-400">Unassigned</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                            <p className="font-semibold">
                              {est.opening_time} – {est.closing_time}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {est.contact_phone || est.contact_email || "—"}
                            </p>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {est.menu_items_count} dishes
                            </span>{" "}
                            • {est.total_orders} orders (
                            {formatINR(est.total_revenue)})
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                                est.status === "ACTIVE" && !est.is_deleted
                                  ? "bg-emerald-100 text-emerald-800"
                                  : est.status === "SUSPENDED"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {est.is_deleted ? "ARCHIVED" : est.status}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditEstablishment(est)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100"
                              >
                                <Pencil className="h-3 w-3" /> Edit / Rename
                              </button>

                              {est.status === "ACTIVE" ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleChangeEstStatus(est.id, "SUSPENDED")
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                                >
                                  <PauseCircle className="h-3 w-3" /> Suspend
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleChangeEstStatus(est.id, "ACTIVE")
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                                >
                                  <PlayCircle className="h-3 w-3" /> Activate
                                </button>
                              )}

                              {est.status !== "ARCHIVED" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleChangeEstStatus(est.id, "ARCHIVED")
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                                >
                                  <Archive className="h-3 w-3" /> Archive
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteTarget(est);
                                  setDeleteConfirmText("");
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
                              >
                                <Trash2 className="h-3 w-3" /> Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB: MANAGERS */}
          {tab === "managers" && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-soft space-y-4">
              <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
                Canteen Managers ({managers.length})
              </h2>
              {managers.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  No manager accounts created yet. Click “Provision Manager” above.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {managers.map(
                    (m: {
                      id: string;
                      full_name: string;
                      email: string;
                      phone: string | null;
                      status: string;
                      canteen_id: string | null;
                      canteen_name: string | null;
                    }) => (
                      <div
                        key={m.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3.5 text-xs"
                      >
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">
                            {m.full_name}
                          </p>
                          <p className="text-slate-500">
                            {m.email} {m.phone ? `• ${m.phone}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1 font-bold text-slate-800 dark:text-slate-200">
                            Assigned: {m.canteen_name || "Unassigned"}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleUserStatus(m.id, m.status)}
                            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1 font-bold hover:bg-slate-100"
                          >
                            {m.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: CUSTOMERS */}
          {tab === "customers" && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-soft space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
                  Registered Customers ({customers.length})
                </h2>
                <div className="relative w-72">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="search"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search name, email, or phone…"
                    className="h-9 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent pl-8 pr-3 text-xs"
                  />
                </div>
              </div>
              {customers.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  No customers registered yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {customers.map(
                    (c: {
                      id: string;
                      full_name: string;
                      email: string | null;
                      phone: string | null;
                      email_verified: number;
                      phone_verified: number;
                      status: string;
                      total_orders: number;
                      total_spent: number;
                    }) => (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-3.5 text-xs"
                      >
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">
                            {c.full_name}
                          </p>
                          <p className="text-slate-500">
                            {c.email || c.phone} • {c.total_orders} orders (
                            {formatINR(c.total_spent)})
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.email_verified === 1 && (
                            <span className="rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                              Email Verified
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                              c.status === "ACTIVE"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {c.status}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleUserStatus(c.id, c.status)}
                            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1 font-bold hover:bg-slate-100"
                          >
                            {c.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: ORDERS */}
          {tab === "orders" && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-soft space-y-4">
              <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
                Platform Orders & Historical Snapshots ({orders.length})
              </h2>
              {orders.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  No orders received yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {orders.map(
                    (o: {
                      id: string;
                      order_number: string;
                      canteen_name_snapshot: string;
                      current_canteen_name: string | null;
                      customer_name: string;
                      status: string;
                      total_amount: number;
                      payment_method: string;
                      payment_status: string;
                      created_at: string;
                    }) => (
                      <div
                        key={o.id}
                        className="flex flex-wrap items-center justify-between py-3.5 gap-2"
                      >
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">
                            <span className="font-mono">#{o.order_number}</span> •
                            Historical Snapshot:{" "}
                            <span className="underline text-hq-600">
                              {o.canteen_name_snapshot}
                            </span>
                            {o.current_canteen_name &&
                              o.current_canteen_name !==
                                o.canteen_name_snapshot && (
                                <span className="ml-1.5 text-slate-400">
                                  (Live name: {o.current_canteen_name})
                                </span>
                              )}
                          </p>
                          <p className="text-slate-500">
                            Customer: {o.customer_name} •{" "}
                            {new Date(o.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-display font-extrabold">
                            {formatINR(o.total_amount)}
                          </span>
                          <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 font-bold">
                            {o.payment_method} ({o.payment_status})
                          </span>
                          <span className="rounded-full bg-hq-600 px-2.5 py-0.5 font-bold text-white">
                            {o.status}
                          </span>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: MENU MONITORING */}
          {tab === "menu" && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-soft space-y-4">
              <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
                Cross-Establishment Menu Catalogue ({menuItems.length})
              </h2>
              {menuItems.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  No menu items published across establishments yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {menuItems.map(
                    (m: {
                      id: string;
                      name: string;
                      canteen_name: string;
                      price: number;
                      stock_quantity: number;
                      is_available: number;
                    }) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between py-3"
                      >
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {m.name}
                          </span>{" "}
                          <span className="text-slate-500">
                            ({m.canteen_name})
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold">{formatINR(m.price)}</span>
                          <span>Stock: {m.stock_quantity}</span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-bold ${
                              m.is_available
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {m.is_available ? "Available" : "Sold Out"}
                          </span>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: INVENTORY MONITORING */}
          {tab === "inventory" && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-soft space-y-4">
              <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
                Cross-Establishment Inventory ({inventoryItems.length})
              </h2>
              {inventoryItems.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  No inventory items recorded yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {inventoryItems.map(
                    (inv: {
                      id: string;
                      item_name: string;
                      canteen_name: string;
                      quantity: number;
                      unit: string;
                      min_threshold: number;
                    }) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between py-3"
                      >
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {inv.item_name}
                          </span>{" "}
                          <span className="text-slate-500">
                            ({inv.canteen_name})
                          </span>
                        </div>
                        <span className="font-mono font-bold">
                          {inv.quantity} {inv.unit} (Min: {inv.min_threshold})
                        </span>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: PAYMENTS */}
          {tab === "payments" && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-soft space-y-4">
              <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
                Financial Transactions & Snapshots ({payments.length})
              </h2>
              {payments.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  No payment transactions recorded yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {payments.map(
                    (p: {
                      id: string;
                      transaction_ref: string;
                      canteen_name_snapshot: string | null;
                      customer_name: string;
                      amount: number;
                      method: string;
                      status: string;
                      created_at: string;
                    }) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between py-3"
                      >
                        <div>
                          <p className="font-mono font-bold text-slate-900 dark:text-white">
                            {p.transaction_ref}
                          </p>
                          <p className="text-slate-500">
                            {p.customer_name} • Establishment Snapshot:{" "}
                            <strong>{p.canteen_name_snapshot || "Wallet"}</strong>
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-display font-extrabold">
                            {formatINR(p.amount)}
                          </p>
                          <p className="text-slate-500">
                            {p.method} • {p.status}
                          </p>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: AUDIT LOGS */}
          {tab === "audit" && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-soft space-y-4">
              <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
                Tamper-Evident Security Audit Trail ({auditLogs.length})
              </h2>
              <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs max-h-[540px] overflow-y-auto">
                {auditLogs.map(
                  (log: {
                    id: string;
                    action: string;
                    entity_type: string;
                    previous_name: string | null;
                    new_name: string | null;
                    actor_email: string | null;
                    created_at: string;
                  }) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between py-3"
                    >
                      <div>
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          [{log.action}]
                        </span>{" "}
                        <span className="font-semibold text-slate-600 dark:text-slate-400">
                          {log.entity_type}
                        </span>
                        {log.previous_name &&
                          log.new_name &&
                          log.previous_name !== log.new_name && (
                            <span className="ml-2 rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-amber-900 font-semibold">
                              Renamed: “{log.previous_name}” → “{log.new_name}”
                            </span>
                          )}
                        <p className="text-[11px] text-slate-500">
                          Actor: {log.actor_email || "System"}
                        </p>
                      </div>
                      <span className="text-slate-400">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* TAB: OTP & PLATFORM CONFIGURATION DIAGNOSTICS */}
          {tab === "settings" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-soft space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Mail className="h-5 w-5 text-hq-600" />
                    <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
                      Gmail SMTP Email OTP Diagnostics
                    </h2>
                  </div>
                  {otpDiag?.email?.configured ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                      <CheckCircle2 className="h-3.5 w-3.5" /> SMTP Configured
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5" /> SMTP Credentials Missing
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">
                      SMTP Connection Status
                    </span>
                    <span className="mt-1 block font-bold text-slate-900 dark:text-white">
                      {otpDiag?.email?.connectionVerified === true
                        ? "VERIFIED (STARTTLS)"
                        : otpDiag?.email?.connectionVerified === false
                          ? "FAILED"
                          : otpDiag?.email?.configured
                            ? "READY TO VERIFY"
                            : "NOT CONFIGURED"}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">
                      Last Delivery Attempt Status
                    </span>
                    <span className="mt-1 block font-mono font-bold text-slate-900 dark:text-white">
                      {otpDiag?.email?.lastDeliveryStatus || "NO_ATTEMPTS_YET"}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">
                      Provider Error Category
                    </span>
                    <span className="mt-1 block font-mono font-bold text-red-600">
                      {otpDiag?.email?.providerErrorCategory || "NONE"}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">
                      SMTP Host & Port
                    </span>
                    <span className="mt-1 block font-mono font-bold text-slate-900 dark:text-white">
                      {otpDiag?.email?.host || "smtp.gmail.com"}:
                      {otpDiag?.email?.port || 587}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-500">
                    Expiry: {otpDiag?.security?.expiryMinutes || 5}m • Cooldown:{" "}
                    {otpDiag?.security?.resendCooldownSeconds || 30}s • Max
                    Attempts: {otpDiag?.security?.maxAttempts || 5}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await apiV2.post("/auth/smtp-verify");
                        const verified = res.data.data?.verifyResult?.verified;
                        if (verified) {
                          toast.success(
                            "Gmail SMTP STARTTLS connection verified!"
                          );
                        } else {
                          toast.error(
                            `SMTP check failed: ${
                              res.data.data?.verifyResult?.failureCategory ||
                              "Unconfigured"
                            }`
                          );
                        }
                        await queryClient.invalidateQueries({
                          queryKey: ["v2-otp-status"],
                        });
                      } catch {
                        toast.error("Could not test SMTP connection.");
                      }
                    }}
                    className="rounded-xl bg-hq-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-hq-700"
                  >
                    Test SMTP Connection
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-soft space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Phone className="h-5 w-5 text-slate-400" />
                    <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
                      Mobile SMS OTP Status
                    </h2>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-extrabold text-slate-700 dark:text-slate-300">
                    SMS Verification Disabled
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {otpDiag?.sms?.message ||
                    "Mobile SMS OTP verification is disabled. Gmail SMTP Email OTP is the sole active customer verification method."}
                </p>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3.5 text-xs text-slate-600 dark:text-slate-300 space-y-1 border border-slate-200 dark:border-slate-800">
                  <p>
                    • Active Channel: <strong>EMAIL ONLY (Gmail SMTP)</strong>
                  </p>
                  <p>
                    • Customer Registration Mobile Requirement:{" "}
                    <strong>Not Required</strong>
                  </p>
                  <p>
                    • Customer Profile Mobile Field: <strong>Optional</strong>
                  </p>
                  <p>
                    • DLT Registration Requirement: <strong>Not Required</strong>
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: CREATE / EDIT ESTABLISHMENT */}
      {estModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
              {editingEst
                ? `Edit / Rename Establishment — ${editingEst.name}`
                : "Create New Campus Establishment"}
            </h2>
            <form
              onSubmit={handleSaveEstablishment}
              className="mt-4 space-y-3 text-xs"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-bold">
                    Establishment Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={estForm.name}
                    onChange={(e) =>
                      setEstForm({ ...estForm, name: e.target.value })
                    }
                    placeholder="e.g., North Block Bistro"
                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-bold">
                    Establishment Type
                  </label>
                  <select
                    value={estForm.type}
                    onChange={(e) =>
                      setEstForm({
                        ...estForm,
                        type: e.target.value as EstablishmentRecord["type"],
                      })
                    }
                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5"
                  >
                    <option value="CANTEEN">CANTEEN</option>
                    <option value="CAFE">CAFE</option>
                    <option value="FOOD_STALL">FOOD_STALL</option>
                    <option value="RESTAURANT">RESTAURANT</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-bold">Description</label>
                <input
                  type="text"
                  value={estForm.description}
                  onChange={(e) =>
                    setEstForm({ ...estForm, description: e.target.value })
                  }
                  placeholder="Fresh meals, artisan coffee, and quick bites"
                  className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-bold">Contact Email</label>
                  <input
                    type="email"
                    value={estForm.contactEmail}
                    onChange={(e) =>
                      setEstForm({ ...estForm, contactEmail: e.target.value })
                    }
                    placeholder="contact@bistro.edu"
                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-bold">Contact Phone</label>
                  <input
                    type="text"
                    value={estForm.contactPhone}
                    onChange={(e) =>
                      setEstForm({ ...estForm, contactPhone: e.target.value })
                    }
                    placeholder="9876543210"
                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block font-bold">Location</label>
                  <input
                    type="text"
                    value={estForm.location}
                    onChange={(e) =>
                      setEstForm({ ...estForm, location: e.target.value })
                    }
                    placeholder="Academic Block A"
                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-bold">Opening Hours</label>
                  <input
                    type="text"
                    value={estForm.openingTime}
                    onChange={(e) =>
                      setEstForm({ ...estForm, openingTime: e.target.value })
                    }
                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-bold">Closing Hours</label>
                  <input
                    type="text"
                    value={estForm.closingTime}
                    onChange={(e) =>
                      setEstForm({ ...estForm, closingTime: e.target.value })
                    }
                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-bold">
                    Assigned Manager
                  </label>
                  <select
                    value={estForm.managerId}
                    onChange={(e) =>
                      setEstForm({ ...estForm, managerId: e.target.value })
                    }
                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5"
                  >
                    <option value="">— Unassigned —</option>
                    {managers.map(
                      (m: { id: string; full_name: string; email: string }) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name} ({m.email})
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-bold">
                    Operational Status
                  </label>
                  <select
                    value={estForm.status}
                    onChange={(e) =>
                      setEstForm({
                        ...estForm,
                        status: e.target.value as EstablishmentRecord["status"],
                      })
                    }
                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEstModalOpen(false)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-hq-600 px-4 py-2 font-bold text-white hover:bg-hq-700"
                >
                  {editingEst ? "Save Changes" : "Create Establishment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SAFE DELETE ESTABLISHMENT CONFIRMATION */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4">
            <h2 className="font-display text-base font-extrabold text-red-600">
              Delete Establishment — “{deleteTarget.name}”
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              If this establishment has historical orders or payments, CampusBite will safely archive it, disable its active menu items, and remove it from active customer listings while preserving all financial records and historical snapshots.
            </p>
            <div>
              <label className="mb-1 block text-xs font-bold">
                Type <strong>DELETE</strong> to confirm:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 text-xs font-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmText !== "DELETE"}
                onClick={handleConfirmDeleteEstablishment}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-40"
              >
                Confirm Safe Deletion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE & ASSIGN MANAGER */}
      {mgrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
              Provision & Assign Canteen Manager
            </h2>
            <form
              onSubmit={handleCreateManager}
              className="mt-4 space-y-3 text-xs"
            >
              <div>
                <label className="mb-1 block font-bold">Full Name *</label>
                <input
                  type="text"
                  required
                  value={mgrForm.fullName}
                  onChange={(e) =>
                    setMgrForm({ ...mgrForm, fullName: e.target.value })
                  }
                  placeholder="Rohan Kulkarni"
                  className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                />
              </div>
              <div>
                <label className="mb-1 block font-bold">Email *</label>
                <input
                  type="email"
                  required
                  value={mgrForm.email}
                  onChange={(e) =>
                    setMgrForm({ ...mgrForm, email: e.target.value })
                  }
                  placeholder="rohan@campusbite.com"
                  className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                />
              </div>
              <div>
                <label className="mb-1 block font-bold">Phone</label>
                <input
                  type="text"
                  value={mgrForm.phone}
                  onChange={(e) =>
                    setMgrForm({ ...mgrForm, phone: e.target.value })
                  }
                  placeholder="9876543210"
                  className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                />
              </div>
              <div>
                <label className="mb-1 block font-bold">Password *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={mgrForm.password}
                  onChange={(e) =>
                    setMgrForm({ ...mgrForm, password: e.target.value })
                  }
                  placeholder="Min 8 characters"
                  className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                />
              </div>
              <div>
                <label className="mb-1 block font-bold">
                  Assign Establishment *
                </label>
                <select
                  required
                  value={mgrForm.canteenId}
                  onChange={(e) =>
                    setMgrForm({ ...mgrForm, canteenId: e.target.value })
                  }
                  className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5"
                >
                  <option value="">Select establishment…</option>
                  {establishments
                    .filter((e) => !e.is_deleted)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.type})
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setMgrModalOpen(false)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-hq-600 px-4 py-2 font-bold text-white hover:bg-hq-700"
                >
                  Create & Assign Manager
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
