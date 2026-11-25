import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChefHat,
  ClipboardList,
  UtensilsCrossed,
  Boxes,
  BarChart3,
  Plus,
  Pencil,
  Trash2,
  Upload,
  Check,
  X,
  LogOut,
  Users,
  Search,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Menu,
  Sun,
  Moon,
  Download,
  Settings,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import toast from "react-hot-toast";
import { apiV2, formatINR, getSocketV2, resolveMediaUrl } from "@/lib/api";
import { useV2Store } from "@/stores/v2Store";

type ManagerTab = "orders" | "menu" | "inventory" | "analytics" | "settings";

interface MenuItemRecord {
  id: string;
  canteen_id: string;
  category_id: string | null;
  category_name: string | null;
  name: string;
  description: string | null;
  price: number;
  dietary_type: "VEG" | "NON_VEG" | "VEGAN" | "EGG";
  preparation_time: number;
  stock_quantity: number;
  is_available: number;
  image_url: string | null;
  total_orders: number;
}

export function ManagerPortal() {
  const { user, logout, theme, toggleTheme } = useV2Store();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ManagerTab>("orders");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [orderFilter, setOrderFilter] = useState("ALL");
  const [menuSearch, setMenuSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Menu Item Modal
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItemRecord | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [menuForm, setMenuForm] = useState({
    name: "",
    categoryId: "",
    description: "",
    price: "120",
    dietaryType: "VEG" as "VEG" | "NON_VEG" | "VEGAN" | "EGG",
    preparationTime: "10",
    stockQuantity: "50",
    isAvailable: true,
    imageUrl: "",
    imageId: "",
  });

  // Category Form
  const [catName, setCatName] = useState("");

  // Reject Order Modal
  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Inventory Form & Stock Movement Modal
  const [invForm, setInvForm] = useState({
    itemName: "",
    unit: "kg",
    quantity: "25",
    minThreshold: "5",
    unitCost: "50",
  });
  const [movementTarget, setMovementTarget] = useState<{
    id: string;
    name: string;
    unit: string;
  } | null>(null);
  const [movementType, setMovementType] = useState<
    "PURCHASE" | "CONSUMPTION" | "WASTAGE"
  >("PURCHASE");
  const [movementQty, setMovementQty] = useState("10");
  const [movementReason, setMovementReason] = useState("");

  // Crowd Count Input
  const [crowdInput, setCrowdInput] = useState("8");

  // Outlet Settings Form
  const [settingsForm, setSettingsForm] = useState({
    openingTime: "08:00",
    closingTime: "20:00",
    description: "",
    contactPhone: "",
  });

  useEffect(() => {
    const socket = getSocketV2();
    if (user?.canteenId) {
      socket.emit("join:establishment", user.canteenId);
    }

    const onOrderEvent = () => {
      void queryClient.invalidateQueries({ queryKey: ["v2-mgr-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["v2-mgr-analytics"] });
      void queryClient.invalidateQueries({ queryKey: ["v2-mgr-menu"] });
    };

    const onEstUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ["v2-mgr-analytics"] });
    };

    socket.on("order:created", onOrderEvent);
    socket.on("order:updated", onOrderEvent);
    socket.on("establishment:updated", onEstUpdated);
    return () => {
      socket.off("order:created", onOrderEvent);
      socket.off("order:updated", onOrderEvent);
      socket.off("establishment:updated", onEstUpdated);
    };
  }, [user?.canteenId, queryClient]);

  const analyticsQuery = useQuery({
    queryKey: ["v2-mgr-analytics", startDate, endDate],
    queryFn: async () =>
      (
        await apiV2.get("/manager/analytics", {
          params: {
            ...(startDate ? { startDate } : {}),
            ...(endDate ? { endDate } : {}),
          },
        })
      ).data.data,
  });

  useEffect(() => {
    const est = analyticsQuery.data?.establishment;
    if (est) {
      setSettingsForm({
        openingTime: est.opening_time || "08:00",
        closingTime: est.closing_time || "20:00",
        description: est.description || "",
        contactPhone: est.contact_phone || "",
      });
    }
  }, [analyticsQuery.data?.establishment]);

  const ordersQuery = useQuery({
    queryKey: ["v2-mgr-orders"],
    queryFn: async () => (await apiV2.get("/manager/orders")).data.data,
    refetchInterval: 8000,
  });

  const categoriesQuery = useQuery({
    queryKey: ["v2-mgr-categories"],
    queryFn: async () => (await apiV2.get("/manager/categories")).data.data,
  });

  const menuQuery = useQuery<MenuItemRecord[]>({
    queryKey: ["v2-mgr-menu"],
    queryFn: async () => (await apiV2.get("/manager/menu")).data.data,
  });

  const inventoryQuery = useQuery({
    queryKey: ["v2-mgr-inventory"],
    queryFn: async () => (await apiV2.get("/manager/inventory")).data.data,
  });

  const handleImageFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await apiV2.post("/manager/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMenuForm((f) => ({
        ...f,
        imageUrl: res.data.data.imageUrl,
        imageId: res.data.data.imageId,
      }));
      toast.success("Food photograph uploaded to persistent storage!");
    } catch {
      toast.error("Image upload failed (Max 5MB JPEG/PNG/WEBP).");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: menuForm.name,
        categoryId: menuForm.categoryId || null,
        description: menuForm.description || null,
        price: Number(menuForm.price),
        dietaryType: menuForm.dietaryType,
        preparationTime: Number(menuForm.preparationTime),
        stockQuantity: Number(menuForm.stockQuantity),
        isAvailable: menuForm.isAvailable,
        imageUrl: menuForm.imageUrl || null,
        imageId: menuForm.imageId || null,
      };

      if (editingItem) {
        const res = await apiV2.put(`/manager/menu/${editingItem.id}`, payload);
        toast.success(res.data.message);
      } else {
        const res = await apiV2.post("/manager/menu", payload);
        toast.success(res.data.message);
      }
      setMenuModalOpen(false);
      setEditingItem(null);
      await queryClient.invalidateQueries({ queryKey: ["v2-mgr-menu"] });
      await queryClient.invalidateQueries({ queryKey: ["v2-mgr-analytics"] });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not save food item.";
      toast.error(msg);
    }
  };

  const handleToggleItemAvailability = async (item: MenuItemRecord) => {
    try {
      const res = await apiV2.patch(`/manager/menu/${item.id}/availability`, {
        isAvailable: item.is_available !== 1,
      });
      toast.success(res.data.message);
      await queryClient.invalidateQueries({ queryKey: ["v2-mgr-menu"] });
    } catch {
      toast.error("Failed to toggle availability.");
    }
  };

  const handleDeleteMenuItem = async (id: string) => {
    try {
      const res = await apiV2.delete(`/manager/menu/${id}`);
      toast.success(res.data.message);
      await queryClient.invalidateQueries({ queryKey: ["v2-mgr-menu"] });
    } catch {
      toast.error("Failed to delete menu item.");
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    try {
      await apiV2.post("/manager/categories", { name: catName.trim() });
      setCatName("");
      toast.success("Menu category created!");
      await queryClient.invalidateQueries({ queryKey: ["v2-mgr-categories"] });
    } catch {
      toast.error("Could not create category.");
    }
  };

  const handleUpdateOrderStatus = async (
    orderId: string,
    status: "ACCEPTED" | "PREPARING" | "READY" | "COMPLETED" | "REJECTED",
    reason?: string
  ) => {
    try {
      const res = await apiV2.patch(`/manager/orders/${orderId}/status`, {
        status,
        rejectionReason: reason,
      });
      toast.success(res.data.message);
      setRejectOrderId(null);
      setRejectionReason("");
      await queryClient.invalidateQueries({ queryKey: ["v2-mgr-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["v2-mgr-analytics"] });
    } catch {
      toast.error("Could not update order status.");
    }
  };

  const handleCreateInventoryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiV2.post("/manager/inventory", {
        itemName: invForm.itemName,
        unit: invForm.unit,
        quantity: Number(invForm.quantity),
        minThreshold: Number(invForm.minThreshold),
        unitCost: Number(invForm.unitCost),
      });
      setInvForm({
        itemName: "",
        unit: "kg",
        quantity: "25",
        minThreshold: "5",
        unitCost: "50",
      });
      toast.success("Inventory item saved!");
      await queryClient.invalidateQueries({ queryKey: ["v2-mgr-inventory"] });
      await queryClient.invalidateQueries({ queryKey: ["v2-mgr-analytics"] });
    } catch {
      toast.error("Could not create inventory item.");
    }
  };

  const handleRecordMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movementTarget) return;
    try {
      await apiV2.post(`/manager/inventory/${movementTarget.id}/movement`, {
        movementType,
        quantity: Number(movementQty),
        reason: movementReason || `${movementType} entry`,
      });
      toast.success("Inventory movement logged!");
      setMovementTarget(null);
      setMovementReason("");
      await queryClient.invalidateQueries({ queryKey: ["v2-mgr-inventory"] });
      await queryClient.invalidateQueries({ queryKey: ["v2-mgr-analytics"] });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not record stock movement.";
      toast.error(msg);
    }
  };

  const handleUpdateCrowd = async () => {
    try {
      const res = await apiV2.post("/manager/crowd", {
        peopleCount: Number(crowdInput),
      });
      toast.success(res.data.message);
      await queryClient.invalidateQueries({ queryKey: ["v2-mgr-analytics"] });
    } catch {
      toast.error("Failed to update crowd count.");
    }
  };

  const handleSaveOutletSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiV2.patch("/manager/settings", settingsForm);
      toast.success(res.data.message || "Outlet operating settings updated!");
      await queryClient.invalidateQueries({ queryKey: ["v2-mgr-analytics"] });
    } catch {
      toast.error("Could not update outlet settings.");
    }
  };

  const handleExportManagerCsv = () => {
    const data = analyticsQuery.data;
    if (!data) return;
    const rows = [
      ["Metric", "Value"],
      ["Establishment", data.establishment?.name || ""],
      ["Today Orders", String(data.summary?.todayOrders ?? 0)],
      ["Today Revenue (INR)", String(data.summary?.todayRevenue ?? 0)],
      ["Weekly Revenue (INR)", String(data.summary?.weeklyRevenue ?? 0)],
      ["Monthly Revenue (INR)", String(data.summary?.monthlyRevenue ?? 0)],
      ["Annual Revenue (INR)", String(data.summary?.annualRevenue ?? 0)],
      ["Total Revenue (INR)", String(data.summary?.totalRevenue ?? 0)],
      ["Average Order Value (INR)", String(data.summary?.averageOrderValue ?? 0)],
      ["Completed Orders", String(data.summary?.completedOrders ?? 0)],
      ["Rejected Orders", String(data.summary?.rejectedOrders ?? 0)],
      ["Cancelled Orders", String(data.summary?.cancelledOrders ?? 0)],
      ["Total Inventory Value (INR)", String(data.summary?.totalInventoryValue ?? 0)],
      ["Low Stock Count", String(data.summary?.lowStockCount ?? 0)],
      ["Out of Stock Count", String(data.summary?.outOfStockCount ?? 0)],
      [],
      ["Top Selling Dish", "Units Sold", "Revenue (INR)"],
      ...(data.popularItems ?? []).map(
        (p: { name: string; total_sold?: number; total_orders?: number; total_revenue?: number }) => [
          p.name,
          String(p.total_sold ?? p.total_orders ?? 0),
          String(p.total_revenue ?? 0),
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
    link.download = `campusbite-manager-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    toast.success("Establishment analytics exported to CSV!");
  };

  const establishment = analyticsQuery.data?.establishment;
  const summary = analyticsQuery.data?.summary;
  const orders = ordersQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const menuItems = menuQuery.data ?? [];
  const inventoryItems = inventoryQuery.data?.items ?? [];
  const inventoryMovements = inventoryQuery.data?.movements ?? [];

  const filteredOrders = orders.filter((o: { status: string }) =>
    orderFilter === "ALL" ? true : o.status === orderFilter
  );

  const filteredMenu = menuItems.filter((m) =>
    menuSearch.trim()
      ? m.name.toLowerCase().includes(menuSearch.trim().toLowerCase())
      : true
  );

  const navItems: Array<{
    id: ManagerTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "orders", label: "Live Order Queue (KDS)", icon: ClipboardList },
    { id: "menu", label: "Menu & Photography", icon: UtensilsCrossed },
    { id: "inventory", label: "Smart Inventory", icon: Boxes },
    { id: "analytics", label: "Sales & Analytics", icon: BarChart3 },
    { id: "settings", label: "Outlet Settings", icon: Settings },
  ];

  const SidebarContent = ({ onSelect }: { onSelect?: () => void }) => (
    <div className="flex h-full flex-col justify-between p-4">
      <div>
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ops-600 text-white shadow-sm">
            <ChefHat className="h-5 w-5" />
          </div>
          <div className="truncate">
            <span className="font-display text-base font-bold text-slate-900 dark:text-white">
              CampusBite
            </span>
            <span className="block truncate text-[11px] font-semibold uppercase tracking-wider text-ops-600">
              {establishment?.name || user?.canteenName || "Canteen Ops"}
            </span>
          </div>
        </div>

        <nav className="mt-6 space-y-1">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                onSelect?.();
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-colors ${
                tab === id
                  ? "bg-ops-600 text-white shadow-sm"
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
              navigate("/login/manager");
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
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Kitchen Feed Active
            </span>
            <span className="hidden sm:inline-block text-xs text-slate-500 dark:text-slate-400">
              {establishment?.name || user?.canteenName} • Hours:{" "}
              {establishment?.opening_time || "08:00"}–
              {establishment?.closing_time || "20:00"} • Crowd:{" "}
              <strong>{establishment?.crowd_level || "LOW"}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingItem(null);
                setMenuForm({
                  name: "",
                  categoryId: categories[0]?.id || "",
                  description: "",
                  price: "120",
                  dietaryType: "VEG",
                  preparationTime: "10",
                  stockQuantity: "50",
                  isAvailable: true,
                  imageUrl: "",
                  imageId: "",
                });
                setMenuModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-ops-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-ops-700"
            >
              <Plus className="h-4 w-4" />{" "}
              <span className="hidden sm:inline">Add Dish to Menu</span>
              <span className="sm:hidden">Add Dish</span>
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
          {/* Top KPI Strip */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-soft">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Today’s Orders
              </span>
              <p className="mt-1.5 font-display text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                {summary?.todayOrders ?? 0}
              </p>
              <span className="text-[11px] text-slate-500">
                AOV: {formatINR(summary?.averageOrderValue ?? 0)}
              </span>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-soft">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Today’s Revenue
              </span>
              <p className="mt-1.5 font-display text-2xl sm:text-3xl font-extrabold text-ops-600 dark:text-emerald-400">
                {formatINR(summary?.todayRevenue ?? 0)}
              </p>
              <span className="text-[11px] text-slate-500">
                Month: {formatINR(summary?.monthlyRevenue ?? 0)}
              </span>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-soft">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Active / Completed
              </span>
              <p className="mt-1.5 font-display text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                {summary?.pendingOrders ?? 0}{" "}
                <span className="text-base font-medium text-slate-400">
                  / {summary?.completedOrders ?? 0}
                </span>
              </p>
              <span className="text-[11px] text-slate-500">
                Avg Prep: ~{summary?.avgPrepTimeMinutes ?? 10}m
              </span>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-soft">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Inventory Alerts
              </span>
              <p className="mt-1.5 font-display text-2xl sm:text-3xl font-extrabold text-amber-600">
                {summary?.lowStockCount ?? 0}
              </p>
              <span className="text-[11px] text-slate-500">
                Stock Value: {formatINR(summary?.totalInventoryValue ?? 0)}
              </span>
            </div>
          </div>

          {/* ================================================================= */}
          {/* TAB 1: LIVE KITCHEN DISPLAY SYSTEM (KDS)                          */}
          {/* ================================================================= */}
          {tab === "orders" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
                  Kitchen Order Queue ({filteredOrders.length})
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "ALL",
                    "PLACED",
                    "ACCEPTED",
                    "PREPARING",
                    "READY",
                    "COMPLETED",
                    "REJECTED",
                  ].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setOrderFilter(st)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                        orderFilter === st
                          ? "bg-ops-600 text-white"
                          : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-14 text-center">
                  <ClipboardList className="mx-auto h-9 w-9 text-slate-300" />
                  <h3 className="mt-3 font-display text-sm font-bold text-slate-900 dark:text-white">
                    No orders in this queue
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Incoming customer orders stream here automatically via Socket.IO.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredOrders.map(
                    (o: {
                      id: string;
                      order_number: string;
                      customer_name: string;
                      status: string;
                      total_amount: number;
                      payment_method: string;
                      payment_status: string;
                      special_instructions: string | null;
                      rejection_reason: string | null;
                      created_at: string;
                      items: Array<{
                        id: string;
                        item_name_snapshot: string;
                        quantity: number;
                        line_total: number;
                      }>;
                    }) => (
                      <div
                        key={o.id}
                        className="flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-soft space-y-4"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="rounded-lg bg-ops-500/10 border border-ops-500/30 px-2.5 py-1 font-mono text-sm font-extrabold text-ops-600 dark:text-emerald-400">
                                Token #{o.order_number.split("-").pop() || o.order_number}
                              </span>
                              <span className="font-mono text-xs text-slate-400">
                                ({o.order_number})
                              </span>
                            </div>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                                o.status === "PLACED"
                                  ? "bg-amber-100 text-amber-800"
                                  : o.status === "COMPLETED"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : o.status === "REJECTED"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-ops-600 text-white"
                              }`}
                            >
                              {o.status}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                            {o.customer_name} •{" "}
                            <strong className="text-slate-900 dark:text-white">
                              {formatINR(o.total_amount)}
                            </strong>{" "}
                            ({o.payment_method})
                          </p>
                          <p className="text-[11px] text-slate-400">
                            <Clock className="inline h-3 w-3 mr-1" />
                            {new Date(o.created_at).toLocaleTimeString()}
                          </p>

                          <div className="mt-3 divide-y divide-slate-200/60 dark:divide-slate-800 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-xs">
                            {(o.items ?? []).map((it) => (
                              <div
                                key={it.id}
                                className="flex justify-between py-1 font-bold text-slate-800 dark:text-slate-200"
                              >
                                <span>
                                  {it.quantity} × {it.item_name_snapshot}
                                </span>
                                <span>{formatINR(it.line_total)}</span>
                              </div>
                            ))}
                          </div>

                          {o.special_instructions && (
                            <p className="mt-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-2.5 text-xs text-amber-900 dark:text-amber-200">
                              <strong>Chef Note:</strong> {o.special_instructions}
                            </p>
                          )}
                          {o.rejection_reason && (
                            <p className="mt-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 p-2.5 text-xs text-red-700 dark:text-red-300">
                              <strong>Rejected:</strong> {o.rejection_reason}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                          {o.status === "PLACED" && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateOrderStatus(o.id, "ACCEPTED")
                                }
                                className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-ops-600 px-3 py-2 text-xs font-bold text-white hover:bg-ops-700"
                              >
                                <Check className="h-3.5 w-3.5" /> Accept Order
                              </button>
                              <button
                                type="button"
                                onClick={() => setRejectOrderId(o.id)}
                                className="inline-flex items-center justify-center gap-1 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                              >
                                <X className="h-3.5 w-3.5" /> Reject
                              </button>
                            </>
                          )}
                          {o.status === "ACCEPTED" && (
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateOrderStatus(o.id, "PREPARING")
                              }
                              className="w-full rounded-xl bg-accent-500 px-3 py-2 text-xs font-bold text-white hover:bg-accent-600"
                            >
                              Start Kitchen Preparation →
                            </button>
                          )}
                          {o.status === "PREPARING" && (
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateOrderStatus(o.id, "READY")
                              }
                              className="w-full rounded-xl bg-ops-600 px-3 py-2 text-xs font-bold text-white hover:bg-ops-700"
                            >
                              Mark Order Ready for Counter Pickup →
                            </button>
                          )}
                          {o.status === "READY" && (
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateOrderStatus(o.id, "COMPLETED")
                              }
                              className="w-full rounded-xl bg-brand-700 px-3 py-2 text-xs font-bold text-white hover:bg-brand-800"
                            >
                              Verify Pickup Token & Complete Order ✓
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 2: MENU & PERSISTENT FOOD PHOTOGRAPHY                         */}
          {/* ================================================================= */}
          {tab === "menu" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-slate-900 dark:text-white">
                    Categories:
                  </span>
                  {categories.length === 0 ? (
                    <span className="text-slate-400">No categories yet</span>
                  ) : (
                    categories.map((c: { id: string; name: string }) => (
                      <span
                        key={c.id}
                        className="rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1 font-bold text-slate-800 dark:text-slate-200"
                      >
                        {c.name}
                      </span>
                    ))
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="search"
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      placeholder="Filter dishes…"
                      className="h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent pl-8 pr-3 text-xs"
                    />
                  </div>
                  <form onSubmit={handleCreateCategory} className="flex gap-2">
                    <input
                      type="text"
                      value={catName}
                      onChange={(e) => setCatName(e.target.value)}
                      placeholder="New category name…"
                      className="h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 text-xs"
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-ops-600 px-3.5 text-xs font-bold text-white hover:bg-ops-700"
                    >
                      + Category
                    </button>
                  </form>
                </div>
              </div>

              {filteredMenu.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-14 text-center">
                  <UtensilsCrossed className="mx-auto h-9 w-9 text-slate-300" />
                  <h3 className="mt-3 font-display text-sm font-bold text-slate-900 dark:text-white">
                    No dishes in menu catalogue
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Click “Add Dish to Menu” above to upload a food photo and publish a dish.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredMenu.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-soft"
                    >
                      <div>
                        {item.image_url ? (
                          <img
                            src={resolveMediaUrl(item.image_url) || item.image_url}
                            alt={item.name}
                            className="h-40 w-full object-cover border-b border-slate-100 dark:border-slate-800"
                          />
                        ) : (
                          <div className="flex h-32 w-full items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400">
                            <UtensilsCrossed className="h-7 w-7" />
                          </div>
                        )}
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-ops-600">
                                {item.dietary_type}{" "}
                                {item.category_name
                                  ? `• ${item.category_name}`
                                  : ""}
                              </span>
                              <h3 className="mt-0.5 font-display text-sm font-extrabold text-slate-900 dark:text-white">
                                {item.name}
                              </h3>
                            </div>
                            <span className="font-display text-sm font-extrabold text-slate-900 dark:text-white">
                              {formatINR(item.price)}
                            </span>
                          </div>
                          {item.description && (
                            <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                              {item.description}
                            </p>
                          )}
                          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                            <span>
                              Stock: <strong>{item.stock_quantity}</strong>
                            </span>
                            <span>Prep: ~{item.preparation_time}m</span>
                            <span>Orders: {item.total_orders}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-4 py-3 bg-slate-50/70 dark:bg-slate-800/40">
                        <button
                          type="button"
                          onClick={() => handleToggleItemAvailability(item)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                            item.is_available === 1
                              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                              : "bg-red-100 text-red-700 hover:bg-red-200"
                          }`}
                        >
                          {item.is_available === 1
                            ? "In Stock (Mark Sold Out)"
                            : "Sold Out (Mark Available)"}
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingItem(item);
                              setMenuForm({
                                name: item.name,
                                categoryId: item.category_id || "",
                                description: item.description || "",
                                price: String(item.price),
                                dietaryType: item.dietary_type,
                                preparationTime: String(item.preparation_time),
                                stockQuantity: String(item.stock_quantity),
                                isAvailable: item.is_available === 1,
                                imageUrl: item.image_url || "",
                                imageId: "",
                              });
                              setMenuModalOpen(true);
                            }}
                            className="rounded-lg p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                            title="Edit Dish"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMenuItem(item.id)}
                            className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                            title="Delete Dish"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 3: SMART INVENTORY & STOCK MOVEMENT LEDGER                    */}
          {/* ================================================================= */}
          {tab === "inventory" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-soft lg:col-span-4 space-y-4">
                <h2 className="font-display text-sm font-extrabold text-slate-900 dark:text-white">
                  Register Kitchen Ingredient
                </h2>
                <form
                  onSubmit={handleCreateInventoryItem}
                  className="space-y-3 text-xs"
                >
                  <div>
                    <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                      Ingredient Name
                    </label>
                    <input
                      type="text"
                      required
                      value={invForm.itemName}
                      onChange={(e) =>
                        setInvForm({ ...invForm, itemName: e.target.value })
                      }
                      placeholder="e.g. Fresh Malabar Paneer"
                      className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                        Initial Quantity
                      </label>
                      <input
                        type="number"
                        required
                        value={invForm.quantity}
                        onChange={(e) =>
                          setInvForm({ ...invForm, quantity: e.target.value })
                        }
                        className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                        Unit (kg, L, pcs)
                      </label>
                      <input
                        type="text"
                        required
                        value={invForm.unit}
                        onChange={(e) =>
                          setInvForm({ ...invForm, unit: e.target.value })
                        }
                        className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                        Low-Stock Alert Threshold
                      </label>
                      <input
                        type="number"
                        required
                        value={invForm.minThreshold}
                        onChange={(e) =>
                          setInvForm({
                            ...invForm,
                            minThreshold: e.target.value,
                          })
                        }
                        className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                        Unit Cost (₹)
                      </label>
                      <input
                        type="number"
                        required
                        value={invForm.unitCost}
                        onChange={(e) =>
                          setInvForm({ ...invForm, unitCost: e.target.value })
                        }
                        className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="h-10 w-full rounded-xl bg-ops-600 font-bold text-white hover:bg-ops-700"
                  >
                    Save Ingredient to Inventory
                  </button>
                </form>
              </div>

              <div className="space-y-6 lg:col-span-8">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-soft">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-sm font-extrabold text-slate-900 dark:text-white">
                      Live Ingredient Stock ({inventoryItems.length})
                    </h2>
                    <span className="text-xs text-slate-500">
                      Valuation:{" "}
                      <strong>
                        {formatINR(summary?.totalInventoryValue ?? 0)}
                      </strong>{" "}
                      • Purchased: {summary?.purchasedQty ?? 0} • Consumed:{" "}
                      {summary?.consumedQty ?? 0} • Wastage:{" "}
                      {summary?.wastageQty ?? 0}
                    </span>
                  </div>
                  {inventoryItems.length === 0 ? (
                    <p className="py-10 text-center text-xs text-slate-500">
                      No inventory items registered yet.
                    </p>
                  ) : (
                    <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {inventoryItems.map(
                        (inv: {
                          id: string;
                          item_name: string;
                          quantity: number;
                          unit: string;
                          min_threshold: number;
                          isLowStock: boolean;
                        }) => (
                          <div
                            key={inv.id}
                            className="flex flex-wrap items-center justify-between gap-2 py-3"
                          >
                            <div>
                              <span className="font-bold text-slate-900 dark:text-white">
                                {inv.item_name}
                              </span>
                              <span className="ml-2 text-slate-400">
                                (Alert ≤ {inv.min_threshold} {inv.unit})
                              </span>
                            </div>
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono text-sm font-extrabold text-slate-900 dark:text-white">
                                {inv.quantity} {inv.unit}
                              </span>
                              {inv.isLowStock && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-extrabold text-red-700">
                                  <AlertTriangle className="h-3 w-3" /> Low Stock
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setMovementTarget({
                                    id: inv.id,
                                    name: inv.item_name,
                                    unit: inv.unit,
                                  })
                                }
                                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100"
                              >
                                Restock / Deduct
                              </button>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>

                {inventoryMovements.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-soft">
                    <h3 className="font-display text-sm font-extrabold text-slate-900 dark:text-white">
                      Recent Stock Movement Audit Trail
                    </h3>
                    <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {inventoryMovements.map(
                        (m: {
                          id: string;
                          item_name: string;
                          unit: string;
                          movement_type: string;
                          quantity: number;
                          reason: string;
                          created_at: string;
                        }) => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between py-2.5"
                          >
                            <div className="flex items-center gap-2">
                              {m.movement_type === "PURCHASE" ? (
                                <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <ArrowDownRight className="h-4 w-4 text-red-600" />
                              )}
                              <div>
                                <span className="font-bold text-slate-900 dark:text-white">
                                  {m.item_name}
                                </span>{" "}
                                <span className="text-slate-500">
                                  ({m.movement_type} • {m.reason})
                                </span>
                              </div>
                            </div>
                            <span className="font-mono font-bold">
                              {m.quantity} {m.unit}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 4: COMPREHENSIVE SALES, OPERATIONAL & INVENTORY ANALYTICS     */}
          {/* ================================================================= */}
          {tab === "analytics" && (
            <div className="space-y-6">
              {/* Filter & CSV Export Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-soft">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-ops-600" />
                  <div>
                    <h2 className="font-display text-sm font-extrabold text-slate-900 dark:text-white">
                      Establishment Sales, Operational & Inventory Intelligence
                    </h2>
                    <p className="text-xs text-slate-500">
                      Scoped strictly to {establishment?.name || "your assigned outlet"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                  />
                  <span className="text-slate-400">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                  />
                  {(startDate || endDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setStartDate("");
                        setEndDate("");
                      }}
                      className="rounded-xl border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 font-bold"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleExportManagerCsv}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-ops-600 px-3.5 py-2 font-bold text-white hover:bg-ops-700"
                  >
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </button>
                </div>
              </div>

              {/* Period Revenue Summary Cards */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-soft">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Today’s Sales
                  </span>
                  <p className="mt-1 font-display text-lg font-extrabold text-slate-900 dark:text-white">
                    {formatINR(summary?.todayRevenue ?? 0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-soft">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    7-Day Sales
                  </span>
                  <p className="mt-1 font-display text-lg font-extrabold text-slate-900 dark:text-white">
                    {formatINR(summary?.weeklyRevenue ?? 0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-soft">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Monthly Sales
                  </span>
                  <p className="mt-1 font-display text-lg font-extrabold text-ops-600">
                    {formatINR(summary?.monthlyRevenue ?? 0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-soft">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Annual Sales
                  </span>
                  <p className="mt-1 font-display text-lg font-extrabold text-slate-900 dark:text-white">
                    {formatINR(summary?.annualRevenue ?? 0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-soft">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Refunds / Cancelled
                  </span>
                  <p className="mt-1 font-display text-lg font-extrabold text-red-600">
                    {formatINR(summary?.refundTotal ?? 0)} (
                    {(summary?.rejectedOrders ?? 0) +
                      (summary?.cancelledOrders ?? 0)}
                    )
                  </p>
                </div>
              </div>

              {/* Revenue Trend & Category Revenue Charts */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-soft">
                  <h3 className="font-display text-sm font-extrabold text-slate-900 dark:text-white">
                    Daily Sales Revenue Trend
                  </h3>
                  <div className="mt-4 h-64">
                    {(analyticsQuery.data?.revenueTrend ?? []).length === 0 ? (
                      <div className="flex h-full items-center justify-center text-xs text-slate-400">
                        No revenue data in selected window
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={analyticsQuery.data.revenueTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Line
                            type="monotone"
                            dataKey="revenue"
                            stroke="#0d9488"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-soft">
                  <h3 className="font-display text-sm font-extrabold text-slate-900 dark:text-white">
                    Category-Wise Revenue & Peak Ordering Hours
                  </h3>
                  <div className="mt-4 h-64">
                    {(analyticsQuery.data?.categoryRevenue ?? []).length === 0 ? (
                      <div className="flex h-full items-center justify-center text-xs text-slate-400">
                        No category sales recorded yet
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analyticsQuery.data.categoryRevenue}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="category_name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar
                            dataKey="revenue"
                            fill="#0d9488"
                            radius={[8, 8, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              {/* Best & Lowest Selling Dishes + Inventory Reorder Recommendations */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-soft space-y-3">
                  <h3 className="font-display text-sm font-extrabold text-slate-900 dark:text-white">
                    Best-Selling Dishes
                  </h3>
                  {(analyticsQuery.data?.popularItems ?? []).length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-400">
                      No dish sales recorded yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {analyticsQuery.data.popularItems.map(
                        (p: {
                          id: string;
                          name: string;
                          total_sold?: number;
                          total_orders?: number;
                          total_revenue?: number;
                        }) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between py-2.5"
                          >
                            <span className="font-bold text-slate-900 dark:text-white">
                              {p.name}
                            </span>
                            <span className="font-mono font-bold text-ops-600">
                              {p.total_sold ?? p.total_orders ?? 0} sold •{" "}
                              {formatINR(p.total_revenue ?? 0)}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-soft space-y-3">
                  <h3 className="font-display text-sm font-extrabold text-slate-900 dark:text-white">
                    Lowest-Selling Dishes
                  </h3>
                  {(analyticsQuery.data?.lowestSellingItems ?? []).length ===
                  0 ? (
                    <p className="py-6 text-center text-xs text-slate-400">
                      No menu items available.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {analyticsQuery.data.lowestSellingItems.map(
                        (p: {
                          id: string;
                          name: string;
                          total_sold: number;
                          total_revenue: number;
                        }) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between py-2.5"
                          >
                            <span className="font-bold text-slate-900 dark:text-white">
                              {p.name}
                            </span>
                            <span className="font-mono text-slate-500">
                              {p.total_sold} sold • {formatINR(p.total_revenue)}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-soft space-y-3">
                  <h3 className="font-display text-sm font-extrabold text-slate-900 dark:text-white">
                    Reorder Recommendations & Crowd
                  </h3>
                  {(analyticsQuery.data?.reorderRecommendations ?? [])
                    .length === 0 ? (
                    <p className="text-xs text-emerald-600 font-semibold">
                      All ingredients are stocked above threshold.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {analyticsQuery.data.reorderRecommendations.map(
                        (r: {
                          id: string;
                          itemName: string;
                          currentQuantity: number;
                          unit: string;
                          recommendedOrderQty: number;
                          estimatedCost: number;
                        }) => (
                          <div
                            key={r.id}
                            className="flex items-center justify-between py-2"
                          >
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">
                                {r.itemName}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                Have {r.currentQuantity} {r.unit} • Order +
                                {r.recommendedOrderQty} {r.unit}
                              </p>
                            </div>
                            <span className="font-mono font-bold text-amber-600">
                              {formatINR(r.estimatedCost)}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  )}

                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-ops-600" />
                      <span className="text-xs font-bold">
                        Live Crowd Telemetry ({establishment?.crowd_count ?? 0}{" "}
                        guests • {establishment?.crowd_level ?? "LOW"})
                      </span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="number"
                        min={0}
                        value={crowdInput}
                        onChange={(e) => setCrowdInput(e.target.value)}
                        className="h-9 w-24 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 text-xs font-bold"
                      />
                      <button
                        type="button"
                        onClick={handleUpdateCrowd}
                        className="rounded-xl bg-ops-600 px-3 text-xs font-bold text-white hover:bg-ops-700"
                      >
                        Broadcast Crowd
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 5: OUTLET OPERATING SETTINGS                                  */}
          {/* ================================================================= */}
          {tab === "settings" && (
            <div className="max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-soft space-y-4">
              <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
                Outlet Operating Hours & Profile
              </h2>
              <form
                onSubmit={handleSaveOutletSettings}
                className="space-y-3 text-xs"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block font-bold">
                      Opening Time
                    </label>
                    <input
                      type="text"
                      value={settingsForm.openingTime}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          openingTime: e.target.value,
                        })
                      }
                      className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-bold">
                      Closing Time
                    </label>
                    <input
                      type="text"
                      value={settingsForm.closingTime}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          closingTime: e.target.value,
                        })
                      }
                      className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block font-bold">
                    Outlet Description
                  </label>
                  <input
                    type="text"
                    value={settingsForm.description}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        description: e.target.value,
                      })
                    }
                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-bold">Contact Phone</label>
                  <input
                    type="text"
                    value={settingsForm.contactPhone}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        contactPhone: e.target.value,
                      })
                    }
                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-xl bg-ops-600 px-4 py-2.5 font-bold text-white hover:bg-ops-700"
                >
                  Save Outlet Settings
                </button>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: ADD / EDIT FOOD ITEM */}
      {menuModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
              {editingItem ? `Edit Dish — ${editingItem.name}` : "Add New Dish"}
            </h2>
            <form
              onSubmit={handleSaveMenuItem}
              className="mt-4 space-y-3 text-xs"
            >
              <div>
                <label className="mb-1 block font-bold">Dish Name *</label>
                <input
                  type="text"
                  required
                  value={menuForm.name}
                  onChange={(e) =>
                    setMenuForm({ ...menuForm, name: e.target.value })
                  }
                  placeholder="Paneer Tikka Sourdough Panini"
                  className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="mb-1 block font-bold">Price (₹) *</label>
                  <input
                    type="number"
                    required
                    value={menuForm.price}
                    onChange={(e) =>
                      setMenuForm({ ...menuForm, price: e.target.value })
                    }
                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-bold">Stock *</label>
                  <input
                    type="number"
                    required
                    value={menuForm.stockQuantity}
                    onChange={(e) =>
                      setMenuForm({
                        ...menuForm,
                        stockQuantity: e.target.value,
                      })
                    }
                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-bold">Prep (min) *</label>
                  <input
                    type="number"
                    required
                    value={menuForm.preparationTime}
                    onChange={(e) =>
                      setMenuForm({
                        ...menuForm,
                        preparationTime: e.target.value,
                      })
                    }
                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-bold">Category</label>
                  <select
                    value={menuForm.categoryId}
                    onChange={(e) =>
                      setMenuForm({ ...menuForm, categoryId: e.target.value })
                    }
                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5"
                  >
                    <option value="">General</option>
                    {categories.map((c: { id: string; name: string }) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-bold">Dietary Label</label>
                  <select
                    value={menuForm.dietaryType}
                    onChange={(e) =>
                      setMenuForm({
                        ...menuForm,
                        dietaryType: e.target
                          .value as MenuItemRecord["dietary_type"],
                      })
                    }
                    className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5"
                  >
                    <option value="VEG">VEG</option>
                    <option value="NON_VEG">NON_VEG</option>
                    <option value="VEGAN">VEGAN</option>
                    <option value="EGG">EGG</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-bold">Description</label>
                <input
                  type="text"
                  value={menuForm.description}
                  onChange={(e) =>
                    setMenuForm({ ...menuForm, description: e.target.value })
                  }
                  placeholder="Char-grilled cottage cheese with mint chutney"
                  className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                />
              </div>

              <div>
                <label className="mb-1 block font-bold">
                  Food Photograph (Persistent Upload or URL)
                </label>
                <div className="flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 font-bold hover:bg-slate-100">
                    <Upload className="h-3.5 w-3.5 text-ops-600" />
                    {uploadingImage ? "Uploading…" : "Upload Photo"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />
                  </label>
                  <input
                    type="text"
                    value={menuForm.imageUrl}
                    onChange={(e) =>
                      setMenuForm({ ...menuForm, imageUrl: e.target.value })
                    }
                    placeholder="Or paste image URL…"
                    className="h-10 flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setMenuModalOpen(false)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-ops-600 px-4 py-2 font-bold text-white hover:bg-ops-700"
                >
                  {editingItem ? "Save Changes" : "Publish Dish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: STOCK MOVEMENT */}
      {movementTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4">
            <h3 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
              Update Stock — {movementTarget.name}
            </h3>
            <form onSubmit={handleRecordMovement} className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block font-bold">Movement Type</label>
                <select
                  value={movementType}
                  onChange={(e) =>
                    setMovementType(
                      e.target.value as "PURCHASE" | "CONSUMPTION" | "WASTAGE"
                    )
                  }
                  className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
                >
                  <option value="PURCHASE">PURCHASE (Restock +)</option>
                  <option value="CONSUMPTION">CONSUMPTION (Kitchen Use -)</option>
                  <option value="WASTAGE">WASTAGE (Spoilage -)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block font-bold">
                  Quantity ({movementTarget.unit})
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={movementQty}
                  onChange={(e) => setMovementQty(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                />
              </div>
              <div>
                <label className="mb-1 block font-bold">Reason / Batch Note</label>
                <input
                  type="text"
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  placeholder="Morning supplier delivery"
                  className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMovementTarget(null)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-ops-600 px-4 py-2 font-bold text-white"
                >
                  Record Movement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REJECT ORDER WITH REASON */}
      {rejectOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-3 text-xs">
            <h2 className="font-display text-base font-extrabold text-red-600">
              Reject Order — Specify Reason
            </h2>
            <p className="text-slate-500">
              If paid via Wallet, the customer will be automatically refunded.
            </p>
            <input
              type="text"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., Ingredient out of stock / Kitchen closing"
              className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectOrderId(null)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  handleUpdateOrderStatus(
                    rejectOrderId,
                    "REJECTED",
                    rejectionReason || "Declined by kitchen"
                  )
                }
                className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
