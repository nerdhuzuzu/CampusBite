import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  Users,
  Plus,
  Trash2,
  Check,
  X,
  ChefHat,
  CheckCircle2,
  Boxes,
  TrendingUp,
  Settings,
  AlertTriangle,
  Pencil,
  Save,
  Link2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
} from 'recharts';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import api from '@/lib/axios';
import { connectSocket, getSocket } from '@/lib/socket';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
} from '@/components/ui';
import { formatDateTime, formatPrice, getOrderStatusColor } from '@/lib/utils';
import type { FoodCategory, MenuItem, Order, OrderStatus } from '@/types';

interface IngredientRow {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  minStockLevel: number;
  costPerUnit: number;
  isLowStock: boolean;
}

export function ManagerDashboard() {
  const location = useLocation();
  const section = location.pathname.split('/')[2] || 'dashboard';
  const queryClient = useQueryClient();

  // Menu creation & edit modal state
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [dishName, setDishName] = useState('');
  const [dishPrice, setDishPrice] = useState('60');
  const [dishCategoryId, setDishCategoryId] = useState('');
  const [dishDiet, setDishDiet] = useState<'VEG' | 'NON_VEG' | 'VEGAN' | 'EGG'>('VEG');
  const [dishPrep, setDishPrep] = useState('10');

  // Recipe linking modal state
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [recipeMenuItemId, setRecipeMenuItemId] = useState('');
  const [recipeIngredientId, setRecipeIngredientId] = useState('');
  const [recipeQty, setRecipeQty] = useState('50');

  // Inventory modal state
  const [ingModalOpen, setIngModalOpen] = useState(false);
  const [ingName, setIngName] = useState('');
  const [ingUnit, setIngUnit] = useState('g');
  const [ingStock, setIngStock] = useState('1000');
  const [ingMin, setIngMin] = useState('200');

  const [stockActionModal, setStockActionModal] = useState<{
    id: string;
    name: string;
    type: 'purchase' | 'wastage';
  } | null>(null);
  const [actionQty, setActionQty] = useState('500');
  const [actionReason, setActionReason] = useState('');

  // Crowd logger & Outlet Settings form state
  const [crowdCountInput, setCrowdCountInput] = useState('6');
  const [openingTime, setOpeningTime] = useState('08:00');
  const [closingTime, setClosingTime] = useState('20:00');
  const [avgPrepTime, setAvgPrepTime] = useState('12');
  const [activeCounters, setActiveCounters] = useState('2');
  const [isOpenOutlet, setIsOpenOutlet] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const meQuery = useQuery({
    queryKey: ['manager-me'],
    queryFn: async () => (await api.get('/auth/me')).data.data.user,
  });

  const assignedOutletId: string | undefined =
    meQuery.data?.managerProfile?.outletId || meQuery.data?.managerProfile?.outlet?.id;
  const assignedOutletName: string =
    meQuery.data?.managerProfile?.outlet?.name ?? 'Assigned Campus Outlet';

  // Join Socket.IO outlet room for live kitchen orders
  useEffect(() => {
    if (!assignedOutletId) return;
    connectSocket();
    const socket = getSocket();
    socket.emit('join:outlet', assignedOutletId);

    const onNewOrder = (payload: { orderNumber: string; total: number }) => {
      toast.success(`New Kitchen Order #${payload.orderNumber} (₹${payload.total})!`);
      void queryClient.invalidateQueries({ queryKey: ['manager-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['manager-analytics'] });
      void queryClient.invalidateQueries({ queryKey: ['manager-queue'] });
    };

    const onStatusUpdate = () => {
      void queryClient.invalidateQueries({ queryKey: ['manager-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['manager-inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['manager-queue'] });
    };

    socket.on('order:new', onNewOrder);
    socket.on('order:statusUpdate', onStatusUpdate);
    return () => {
      socket.off('order:new', onNewOrder);
      socket.off('order:statusUpdate', onStatusUpdate);
    };
  }, [assignedOutletId, queryClient]);

  const ordersQuery = useQuery<Order[]>({
    queryKey: ['manager-orders'],
    queryFn: async () => (await api.get('/manager/orders')).data.data ?? [],
    refetchInterval: 8000,
  });

  const menuQuery = useQuery<MenuItem[]>({
    queryKey: ['manager-menu', assignedOutletId],
    enabled: !!assignedOutletId,
    queryFn: async () =>
      (await api.get('/menu', { params: { outletId: assignedOutletId } })).data.data ?? [],
  });

  const categoriesQuery = useQuery<FoodCategory[]>({
    queryKey: ['categories-list'],
    queryFn: async () => (await api.get('/categories')).data.data ?? [],
  });

  const inventoryQuery = useQuery<{ ingredients: IngredientRow[]; lowStockCount: number }>({
    queryKey: ['manager-inventory'],
    queryFn: async () => (await api.get('/manager/inventory')).data.data,
  });

  const analyticsQuery = useQuery({
    queryKey: ['manager-analytics'],
    queryFn: async () => (await api.get('/manager/analytics')).data.data,
  });

  const forecastQuery = useQuery({
    queryKey: ['manager-forecast', assignedOutletId],
    enabled: !!assignedOutletId,
    queryFn: async () =>
      (await api.get(`/ai/forecast/outlet/${assignedOutletId}?days=7`)).data.data,
  });

  const queueQuery = useQuery({
    queryKey: ['manager-queue', assignedOutletId],
    enabled: !!assignedOutletId,
    queryFn: async () => (await api.get(`/ai/queue/${assignedOutletId}`)).data.data,
  });

  const crowdQuery = useQuery({
    queryKey: ['manager-crowd', assignedOutletId],
    enabled: !!assignedOutletId,
    queryFn: async () => (await api.get(`/ai/crowd/${assignedOutletId}`)).data.data,
  });

  // Sync outlet settings when analytics loads
  useEffect(() => {
    const o = analyticsQuery.data?.outlet;
    if (o) {
      setOpeningTime(o.openingTime ?? '08:00');
      setClosingTime(o.closingTime ?? '20:00');
      setAvgPrepTime(String(o.avgPrepTime ?? 12));
      setActiveCounters(String(o.activeCounters ?? 1));
      setIsOpenOutlet(Boolean(o.isOpen));
    }
  }, [analyticsQuery.data?.outlet]);

  // Update order status handler
  const handleStatusTransition = async (orderId: string, nextStatus: OrderStatus) => {
    try {
      await api.patch(`/manager/orders/${orderId}/status`, {
        status: nextStatus,
        note: `Updated to ${nextStatus} by kitchen manager`,
      });
      toast.success(`Order updated to ${nextStatus}`);
      await queryClient.invalidateQueries({ queryKey: ['manager-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['manager-inventory'] });
      await queryClient.invalidateQueries({ queryKey: ['manager-analytics'] });
      await queryClient.invalidateQueries({ queryKey: ['manager-queue'] });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Could not update order status');
    }
  };

  // Toggle menu item availability
  const handleToggleAvailability = async (item: MenuItem) => {
    try {
      await api.patch(`/manager/menu/${item.id}`, {
        isAvailable: !item.isAvailable,
      });
      toast.success(
        `${item.name} marked ${!item.isAvailable ? 'Available' : 'Sold Out'}`
      );
      await queryClient.invalidateQueries({ queryKey: ['manager-menu'] });
    } catch {
      toast.error('Failed to update availability');
    }
  };

  // Create or update menu item
  const handleSaveMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const catId = dishCategoryId || categoriesQuery.data?.[0]?.id;
    if (!catId || !dishName.trim()) return;
    try {
      if (editingItem) {
        await api.patch(`/manager/menu/${editingItem.id}`, {
          name: dishName.trim(),
          categoryId: catId,
          price: Number(dishPrice),
          dietaryType: dishDiet,
          preparationTime: Number(dishPrep),
        });
        toast.success(`Updated ${dishName}`);
      } else {
        await api.post('/manager/menu', {
          name: dishName.trim(),
          categoryId: catId,
          price: Number(dishPrice),
          dietaryType: dishDiet,
          preparationTime: Number(dishPrep),
        });
        toast.success(`Added ${dishName} to ${assignedOutletName}`);
      }
      setDishName('');
      setEditingItem(null);
      setMenuModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['manager-menu'] });
    } catch {
      toast.error('Failed to save menu item');
    }
  };

  // Delete menu item
  const handleDeleteMenuItem = async (id: string, name: string) => {
    try {
      await api.delete(`/manager/menu/${id}`);
      toast.success(`Removed ${name}`);
      await queryClient.invalidateQueries({ queryKey: ['manager-menu'] });
    } catch {
      toast.error('Failed to remove item');
    }
  };

  // Save recipe link
  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetItem = recipeMenuItemId || menuQuery.data?.[0]?.id;
    const targetIng = recipeIngredientId || inventoryQuery.data?.ingredients?.[0]?.id;
    if (!targetItem || !targetIng) return;
    const ingObj = inventoryQuery.data?.ingredients?.find((i) => i.id === targetIng);
    try {
      await api.post('/manager/recipes', {
        menuItemId: targetItem,
        ingredientId: targetIng,
        quantity: Number(recipeQty),
        unit: ingObj?.unit ?? 'g',
      });
      toast.success('Recipe ingredient requirement linked!');
      setRecipeModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['manager-inventory'] });
    } catch {
      toast.error('Failed to link recipe ingredient');
    }
  };

  // Create ingredient
  const handleCreateIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingName.trim()) return;
    try {
      await api.post('/manager/inventory', {
        name: ingName.trim(),
        unit: ingUnit,
        currentStock: Number(ingStock),
        minStockLevel: Number(ingMin),
      });
      toast.success(`Added ${ingName} to inventory`);
      setIngName('');
      setIngModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['manager-inventory'] });
    } catch {
      toast.error('Failed to add ingredient');
    }
  };

  // Record purchase or wastage
  const handleStockAction = async () => {
    if (!stockActionModal) return;
    try {
      await api.post(
        `/manager/inventory/${stockActionModal.id}/${stockActionModal.type}`,
        {
          quantity: Number(actionQty),
          reason:
            actionReason.trim() ||
            (stockActionModal.type === 'purchase'
              ? 'Supplier restock'
              : 'Kitchen wastage'),
        }
      );
      toast.success(
        `Recorded ${stockActionModal.type} for ${stockActionModal.name}`
      );
      setStockActionModal(null);
      setActionReason('');
      await queryClient.invalidateQueries({ queryKey: ['manager-inventory'] });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Inventory transaction failed');
    }
  };

  // Record live crowd observation
  const handleLogCrowd = async () => {
    try {
      await api.post('/manager/crowd', {
        peopleCount: Number(crowdCountInput),
      });
      toast.success('Live crowd headcount updated in database');
      await queryClient.invalidateQueries({ queryKey: ['manager-crowd'] });
    } catch {
      toast.error('Failed to record crowd headcount');
    }
  };

  // Save outlet operating settings
  const handleSaveOutletSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await api.patch('/manager/outlet', {
        openingTime,
        closingTime,
        avgPrepTime: Number(avgPrepTime),
        activeCounters: Number(activeCounters),
        isOpen: isOpenOutlet,
      });
      toast.success('Outlet operating configuration saved!');
      await queryClient.invalidateQueries({ queryKey: ['manager-analytics'] });
      await queryClient.invalidateQueries({ queryKey: ['manager-queue'] });
    } catch {
      toast.error('Failed to save outlet configuration');
    } finally {
      setSavingSettings(false);
    }
  };

  const orders = ordersQuery.data ?? [];
  const liveOrders = orders.filter((o) =>
    ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status)
  );
  const menuItems = menuQuery.data ?? [];
  const ingredients = inventoryQuery.data?.ingredients ?? [];
  const analytics = analyticsQuery.data;
  const forecasts = forecastQuery.data?.forecasts ?? [];
  const liveWait = queueQuery.data?.estimatedWait ?? analytics?.outlet?.avgPrepTime ?? 10;
  const liveCrowd = crowdQuery.data?.crowdLevel ?? 'LOW';
  const livePeople = crowdQuery.data?.peopleCount ?? 0;

  return (
    <div className="space-y-8">
      {/* Top Outlet Banner */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Badge tone="success" className="mb-1">
            Scoped Outlet Authorization • {assignedOutletName}
          </Badge>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {assignedOutletName} — Operations Console
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditingItem(null);
              setDishName('');
              setDishPrice('60');
              setDishPrep('10');
              setMenuModalOpen(true);
            }}
          >
            New Dish
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Link2 className="h-4 w-4" />}
            onClick={() => setRecipeModalOpen(true)}
          >
            Link Recipe
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Boxes className="h-4 w-4" />}
            onClick={() => setIngModalOpen(true)}
          >
            Add Ingredient
          </Button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">
              Live Kitchen Queue
            </span>
            <ClipboardList className="h-5 w-5 text-ops-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
            {liveOrders.length} active
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {analytics?.summary?.todayOrders ?? 0} total orders today
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">
              Outlet Sales Revenue
            </span>
            <TrendingUp className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {formatPrice(analytics?.summary?.totalRevenue ?? 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {analytics?.summary?.completedOrders ?? 0} completed orders
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">
              Menu & Low-Stock Alerts
            </span>
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
            {inventoryQuery.data?.lowStockCount ?? 0} alerts
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {menuItems.filter((m) => m.isAvailable).length}/{menuItems.length} dishes in stock
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">
              Queue Wait & Crowd
            </span>
            <Users className="h-5 w-5 text-indigo-500" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
            ~{liveWait}m wait
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Crowd: {liveCrowd} ({livePeople} active)
          </p>
        </Card>
      </div>

      {/* SECTION 1: LIVE KITCHEN DASHBOARD */}
      {(section === 'dashboard' || section === 'orders') && (
        <section aria-labelledby="kitchen-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 id="kitchen-heading" className="text-lg font-bold text-slate-900 dark:text-white">
                Real-Time Kitchen Order Board ({orders.length})
              </h2>
              <p className="text-xs text-slate-500">
                Every status change is persisted in MySQL before broadcasting via Socket.IO
              </p>
            </div>
          </div>

          {ordersQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Skeleton className="h-44 w-full" />
              <Skeleton className="h-44 w-full" />
            </div>
          ) : orders.length === 0 ? (
            <Card>
              <EmptyState
                icon={<ChefHat className="h-7 w-7" />}
                title="No orders in the kitchen queue"
                description="Incoming student orders will appear here instantly in real time."
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {orders.map((order) => (
                <Card key={order.id} className="flex flex-col justify-between p-5 space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-base font-extrabold text-slate-900 dark:text-white">
                        #{order.orderNumber}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${getOrderStatusColor(
                          order.status
                        )}`}
                      >
                        {order.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDateTime(order.createdAt)} • Total:{' '}
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {formatPrice(Number(order.total))}
                      </span>
                    </p>

                    <div className="mt-3 divide-y divide-slate-100 rounded-xl bg-slate-50 p-3 dark:divide-slate-800 dark:bg-slate-800/50">
                      {order.items.map((it) => (
                        <div key={it.id} className="flex justify-between py-1 text-xs font-semibold">
                          <span>
                            {it.quantity} × {it.name}
                          </span>
                          <span>{formatPrice(Number(it.subtotal))}</span>
                        </div>
                      ))}
                    </div>

                    {order.notes && (
                      <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        Note: {order.notes}
                      </p>
                    )}
                  </div>

                  {/* Action Buttons per Lifecycle Stage */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {order.status === 'PLACED' && (
                      <>
                        <Button
                          size="sm"
                          variant="primary"
                          className="bg-ops-600 hover:bg-ops-700"
                          leftIcon={<Check className="h-3.5 w-3.5" />}
                          onClick={() => handleStatusTransition(order.id, 'ACCEPTED')}
                        >
                          Accept & Reserve Stock
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          leftIcon={<X className="h-3.5 w-3.5" />}
                          onClick={() => handleStatusTransition(order.id, 'REJECTED')}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                    {order.status === 'ACCEPTED' && (
                      <Button
                        size="sm"
                        variant="accent"
                        leftIcon={<ChefHat className="h-3.5 w-3.5" />}
                        onClick={() => handleStatusTransition(order.id, 'PREPARING')}
                      >
                        Start Preparation (Deduct Stock)
                      </Button>
                    )}
                    {order.status === 'PREPARING' && (
                      <Button
                        size="sm"
                        variant="primary"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                        onClick={() => handleStatusTransition(order.id, 'READY')}
                      >
                        Mark Ready for Pickup
                      </Button>
                    )}
                    {order.status === 'READY' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                        onClick={() => handleStatusTransition(order.id, 'COMPLETED')}
                      >
                        Complete Order
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION 2: MENU & PRICING MANAGEMENT */}
      {(section === 'dashboard' || section === 'menu') && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Outlet Menu & Live Availability ({menuItems.length})
              </h2>
              <p className="text-xs text-slate-500">
                Edit prices, toggle availability, or add new dishes to {assignedOutletName}
              </p>
            </div>
            <Button
              size="sm"
              variant="accent"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setEditingItem(null);
                setDishName('');
                setDishPrice('60');
                setDishPrep('10');
                setMenuModalOpen(true);
              }}
            >
              Add Menu Item
            </Button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {menuItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">{item.name}</span>
                    <Badge tone="neutral">{item.dietaryType}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    {item.category?.name} • Prep ~{item.preparationTime} min
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    {formatPrice(Number(item.price))}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<Pencil className="h-3.5 w-3.5" />}
                    onClick={() => {
                      setEditingItem(item);
                      setDishName(item.name);
                      setDishPrice(String(item.price));
                      setDishCategoryId(item.categoryId);
                      setDishDiet(item.dietaryType);
                      setDishPrep(String(item.preparationTime));
                      setMenuModalOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant={item.isAvailable ? 'secondary' : 'accent'}
                    onClick={() => handleToggleAvailability(item)}
                  >
                    {item.isAvailable ? 'Mark Sold Out' : 'Mark Available'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => handleDeleteMenuItem(item.id, item.name)}
                    className="rounded-lg p-1.5 text-slate-400 hover:text-red-600"
                    aria-label={`Delete ${item.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* SECTION 3: SMART INVENTORY MANAGEMENT */}
      {(section === 'dashboard' || section === 'inventory') && (
        <Card className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Smart Ingredient Inventory & Stock Reservations
              </h2>
              <p className="text-xs text-slate-500">
                Tracks total stock, reserved stock (for ACCEPTED orders), and low-stock thresholds
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Link2 className="h-4 w-4" />}
                onClick={() => setRecipeModalOpen(true)}
              >
                Link Recipe Ingredient
              </Button>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => setIngModalOpen(true)}
              >
                New Ingredient
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800">
                  <th className="pb-2.5">Ingredient</th>
                  <th className="pb-2.5">Current Stock</th>
                  <th className="pb-2.5">Reserved</th>
                  <th className="pb-2.5">Available</th>
                  <th className="pb-2.5">Min Threshold</th>
                  <th className="pb-2.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {ingredients.map((ing) => (
                  <tr key={ing.id}>
                    <td className="py-3 font-bold text-slate-900 dark:text-white">{ing.name}</td>
                    <td className="py-3">
                      {ing.currentStock} {ing.unit}
                    </td>
                    <td className="py-3 text-amber-600 font-semibold">
                      {ing.reservedStock} {ing.unit}
                    </td>
                    <td className="py-3 font-bold">
                      {ing.availableStock} {ing.unit}{' '}
                      {ing.isLowStock && (
                        <Badge tone="danger" className="ml-1">
                          Low Stock
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 text-slate-500">
                      {ing.minStockLevel} {ing.unit}
                    </td>
                    <td className="py-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setStockActionModal({
                            id: ing.id,
                            name: ing.name,
                            type: 'purchase',
                          })
                        }
                      >
                        + Purchase
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setStockActionModal({
                            id: ing.id,
                            name: ing.name,
                            type: 'wastage',
                          })
                        }
                      >
                        - Wastage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* SECTION 4: ANALYTICS & AI DEMAND FORECASTING */}
      {(section === 'dashboard' || section === 'analytics') && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  7-Day ML Demand Forecast
                </h2>
                <p className="text-xs text-slate-500">
                  XGBoost model calibrated with historical outlet orders
                </p>
              </div>
              <Badge tone="info">XGBoost Forecast</Badge>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forecasts}>
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="predictedDemand"
                    stroke="#0d9488"
                    strokeWidth={2.5}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Hourly Order Distribution
              </h2>
              <p className="text-xs text-slate-500">
                Real database order timestamps for {assignedOutletName}
              </p>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics?.hourlyOrders ?? []}>
                  <XAxis dataKey="hour" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="orders" fill="#f97316" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* SECTION 5: OUTLET SETTINGS, LIVE CROWD LOGGING & QR STANDEE */}
      {section === 'settings' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Card className="p-6 space-y-4 lg:col-span-7">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-ops-600" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {assignedOutletName} — Operating Configuration
              </h2>
            </div>

            <form onSubmit={handleSaveOutletSettings} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Opening Time (HH:MM)"
                  value={openingTime}
                  onChange={(e) => setOpeningTime(e.target.value)}
                  required
                />
                <Input
                  label="Closing Time (HH:MM)"
                  value={closingTime}
                  onChange={(e) => setClosingTime(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Average Prep Time (Minutes)"
                  type="number"
                  value={avgPrepTime}
                  onChange={(e) => setAvgPrepTime(e.target.value)}
                  required
                />
                <Input
                  label="Active Service Counters"
                  type="number"
                  value={activeCounters}
                  onChange={(e) => setActiveCounters(e.target.value)}
                  required
                />
              </div>

              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={isOpenOutlet}
                  onChange={(e) => setIsOpenOutlet(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-ops-600"
                />
                Outlet is Open for Student Orders
              </label>

              <Button
                type="submit"
                variant="primary"
                loading={savingSettings}
                className="bg-ops-600 hover:bg-ops-700"
                leftIcon={<Save className="h-4 w-4" />}
              >
                Save Outlet Configuration
              </Button>
            </form>
          </Card>

          <Card className="p-6 space-y-5 lg:col-span-5">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Record Live Crowd Observation
              </h3>
              <p className="text-xs text-slate-500">
                Update the live customer headcount stored in MySQL CrowdSnapshot
              </p>
              <div className="mt-3 flex gap-2">
                <Input
                  type="number"
                  value={crowdCountInput}
                  onChange={(e) => setCrowdCountInput(e.target.value)}
                  placeholder="Headcount at counter"
                />
                <Button variant="outline" onClick={handleLogCrowd}>
                  Update Crowd
                </Button>
              </div>
            </div>

            {assignedOutletId && (
              <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Outlet Menu Website Redirect QR
                </h3>
                <div className="mt-3 inline-flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800">
                  <QRCodeSVG
                    value={`${window.location.origin}/student/menu?outletId=${assignedOutletId}`}
                    size={136}
                  />
                  <span className="mt-2 font-mono text-[11px] text-slate-500">
                    {assignedOutletName} Direct Menu QR
                  </span>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Add / Edit Menu Item Modal */}
      <Modal
        open={menuModalOpen}
        onClose={() => setMenuModalOpen(false)}
        title={
          editingItem
            ? `Edit ${editingItem.name}`
            : `Add Dish to ${assignedOutletName}`
        }
      >
        <form onSubmit={handleSaveMenuItem} className="space-y-3.5">
          <Input
            label="Dish Name"
            value={dishName}
            onChange={(e) => setDishName(e.target.value)}
            placeholder="e.g., Paneer Bhurji Sandwich"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Price (₹)"
              type="number"
              value={dishPrice}
              onChange={(e) => setDishPrice(e.target.value)}
              required
            />
            <Input
              label="Prep Time (Minutes)"
              type="number"
              value={dishPrep}
              onChange={(e) => setDishPrep(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Category"
              value={dishCategoryId}
              onChange={(e) => setDishCategoryId(e.target.value)}
              options={(categoriesQuery.data ?? []).map((c) => ({
                value: c.id,
                label: c.name,
              }))}
            />
            <Select
              label="Dietary Type"
              value={dishDiet}
              onChange={(e) =>
                setDishDiet(e.target.value as 'VEG' | 'NON_VEG' | 'VEGAN' | 'EGG')
              }
              options={[
                { value: 'VEG', label: 'Vegetarian' },
                { value: 'NON_VEG', label: 'Non-Vegetarian' },
                { value: 'VEGAN', label: 'Vegan' },
                { value: 'EGG', label: 'Eggetarian' },
              ]}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setMenuModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="accent">
              {editingItem ? 'Update Dish' : 'Save Dish'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Link Recipe Ingredient Modal */}
      <Modal
        open={recipeModalOpen}
        onClose={() => setRecipeModalOpen(false)}
        title="Link Recipe Ingredient to Dish"
      >
        <form onSubmit={handleSaveRecipe} className="space-y-3.5">
          <p className="text-xs text-slate-500">
            Linking an ingredient automatically reserves stock when an order is ACCEPTED and deducts stock when preparation starts.
          </p>
          <Select
            label="Menu Dish"
            value={recipeMenuItemId}
            onChange={(e) => setRecipeMenuItemId(e.target.value)}
            options={menuItems.map((m) => ({ value: m.id, label: m.name }))}
          />
          <Select
            label="Required Ingredient"
            value={recipeIngredientId}
            onChange={(e) => setRecipeIngredientId(e.target.value)}
            options={ingredients.map((i) => ({
              value: i.id,
              label: `${i.name} (${i.unit})`,
            }))}
          />
          <Input
            label="Quantity Required per 1 Dish"
            type="number"
            value={recipeQty}
            onChange={(e) => setRecipeQty(e.target.value)}
            required
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setRecipeModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="bg-ops-600 hover:bg-ops-700">
              Save Recipe Link
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Ingredient Modal */}
      <Modal
        open={ingModalOpen}
        onClose={() => setIngModalOpen(false)}
        title="Add Ingredient to Outlet Inventory"
      >
        <form onSubmit={handleCreateIngredient} className="space-y-3.5">
          <Input
            label="Ingredient Name"
            value={ingName}
            onChange={(e) => setIngName(e.target.value)}
            placeholder="e.g., Mozzarella Cheese"
            required
          />
          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Unit"
              value={ingUnit}
              onChange={(e) => setIngUnit(e.target.value)}
              options={[
                { value: 'g', label: 'Grams (g)' },
                { value: 'kg', label: 'Kilograms (kg)' },
                { value: 'ml', label: 'Milliliters (ml)' },
                { value: 'L', label: 'Liters (L)' },
                { value: 'pcs', label: 'Pieces (pcs)' },
              ]}
            />
            <Input
              label="Initial Stock"
              type="number"
              value={ingStock}
              onChange={(e) => setIngStock(e.target.value)}
              required
            />
            <Input
              label="Min Threshold"
              type="number"
              value={ingMin}
              onChange={(e) => setIngMin(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setIngModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Add Ingredient
            </Button>
          </div>
        </form>
      </Modal>

      {/* Purchase / Wastage Modal */}
      <Modal
        open={!!stockActionModal}
        onClose={() => setStockActionModal(null)}
        title={
          stockActionModal?.type === 'purchase'
            ? `Record Stock Purchase — ${stockActionModal.name}`
            : `Record Stock Wastage — ${stockActionModal?.name}`
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStockActionModal(null)}>
              Cancel
            </Button>
            <Button
              variant={stockActionModal?.type === 'wastage' ? 'danger' : 'primary'}
              onClick={handleStockAction}
            >
              Confirm
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Quantity"
            type="number"
            value={actionQty}
            onChange={(e) => setActionQty(e.target.value)}
          />
          <Input
            label="Reason / Reference Note"
            value={actionReason}
            onChange={(e) => setActionReason(e.target.value)}
            placeholder="e.g., Morning supplier delivery / Expired batch"
          />
        </div>
      </Modal>
    </div>
  );
}

export default ManagerDashboard;
