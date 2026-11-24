import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingBag,
  CheckCircle2,
  XCircle,
  Star,
  Plus,
  Minus,
  Trash2,
  Radio,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/axios';
import { connectSocket, getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Select,
  Skeleton,
} from '@/components/ui';
import { formatDateTime, formatPrice, getOrderStatusColor } from '@/lib/utils';
import type { Order, OrderStatus } from '@/types';

const LIFECYCLE_STEPS: OrderStatus[] = [
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'COMPLETED',
];

export function StudentOrdersPage() {
  const { user } = useAuthStore();
  const { items, outletId, updateQuantity, removeItem, clearCart, getTotal } = useCartStore();
  const queryClient = useQueryClient();

  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'PAY_AT_COUNTER' | 'CASH' | 'UPI'>('PAY_AT_COUNTER');
  const [upiRef, setUpiRef] = useState('');
  const [isPlacing, setIsPlacing] = useState(false);

  // Rating modal state
  const [reviewItem, setReviewItem] = useState<{ menuItemId: string; name: string } | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const ordersQuery = useQuery<Order[]>({
    queryKey: ['student-orders'],
    queryFn: async () => (await api.get('/orders/my')).data.data ?? [],
  });

  // Real-time Socket.IO subscription for order status updates
  useEffect(() => {
    if (!user?.id) return;
    connectSocket();
    const socket = getSocket();
    socket.emit('join:student', user.id);

    const onStatusUpdate = (payload: { orderNumber: string; status: string }) => {
      toast.success(`Order ${payload.orderNumber} is now ${payload.status}!`);
      void queryClient.invalidateQueries({ queryKey: ['student-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['my-orders-preview'] });
    };

    socket.on('order:statusUpdate', onStatusUpdate);
    return () => {
      socket.off('order:statusUpdate', onStatusUpdate);
    };
  }, [user?.id, queryClient]);

  const handlePlaceOrder = async () => {
    if (!outletId || items.length === 0) return;
    setIsPlacing(true);
    try {
      const idempotencyKey = `${user?.id ?? 'anon'}-${outletId}-${Date.now()}`;
      const res = await api.post('/orders', {
        outletId,
        items: items.map((i) => ({
          menuItemId: i.menuItem.id,
          quantity: i.quantity,
        })),
        notes: notes.trim() || undefined,
        paymentMethod,
        transactionRef: paymentMethod === 'UPI' ? upiRef.trim() || undefined : undefined,
        idempotencyKey,
      });

      clearCart();
      setNotes('');
      setUpiRef('');
      toast.success(`Order ${res.data.data.orderNumber} placed!`);
      await queryClient.invalidateQueries({ queryKey: ['student-orders'] });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Could not place order.');
    } finally {
      setIsPlacing(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      await api.post(`/orders/${orderId}/cancel`, {
        reason: 'Cancelled by student from order tracker',
      });
      toast.success('Order cancelled and stock reservations released');
      await queryClient.invalidateQueries({ queryKey: ['student-orders'] });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Could not cancel order');
    }
  };

  const handleSubmitReview = async () => {
    if (!reviewItem) return;
    try {
      await api.post('/reviews', {
        menuItemId: reviewItem.menuItemId,
        rating,
        comment: comment.trim() || undefined,
      });
      toast.success(`Rated ${reviewItem.name} ${rating}/5 stars!`);
      setReviewItem(null);
      setComment('');
    } catch {
      toast.error('Failed to submit review');
    }
  };

  const orders = ordersQuery.data ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Tray Checkout & Live Order Tracking
          </h1>
          <p className="text-sm text-slate-500">
            Track kitchen status transitions in real time via Socket.IO.
          </p>
        </div>
        <Badge tone="success">
          <Radio className="h-3 w-3 animate-pulse" />
          Live Socket.IO Sync Active
        </Badge>
      </div>

      {/* Current Tray Checkout Section */}
      {items.length > 0 && (
        <Card className="border-accent-500/50 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Badge tone="accent">Ready to Order</Badge>
              <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                Confirm Your Tray ({items[0]?.menuItem.outlet?.name ?? 'Selected Outlet'})
              </h2>
            </div>
            <Button variant="ghost" size="sm" onClick={clearCart} leftIcon={<Trash2 className="h-4 w-4" />}>
              Clear Tray
            </Button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map(({ menuItem, quantity }) => (
              <div key={menuItem.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{menuItem.name}</p>
                  <p className="text-xs text-slate-500">
                    {formatPrice(Number(menuItem.price))} × {quantity} ={' '}
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {formatPrice(Number(menuItem.price) * quantity)}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateQuantity(menuItem.id, quantity - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center text-sm font-bold">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(menuItem.id, quantity + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(menuItem.id)}
                    className="ml-2 text-slate-400 hover:text-red-600"
                    aria-label="Remove item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Special Cooking Instructions (Optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Less spicy, no onions, pack separately…"
            />
            <Select
              label="Counter Payment Mode"
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(e.target.value as 'PAY_AT_COUNTER' | 'CASH' | 'UPI')
              }
              options={[
                { value: 'PAY_AT_COUNTER', label: 'Pay at Outlet Counter' },
                { value: 'CASH', label: 'Cash at Counter' },
                { value: 'UPI', label: 'UPI Reference at Counter' },
              ]}
            />
          </div>

          {paymentMethod === 'UPI' && (
            <Input
              label="UPI Reference / UTR Number (Optional)"
              value={upiRef}
              onChange={(e) => setUpiRef(e.target.value)}
              placeholder="Enter 12-digit UPI transaction reference if required by outlet"
            />
          )}

          <div className="flex flex-col gap-3 pt-3 border-t border-slate-200 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <div>
              <span className="text-xs text-slate-500">Backend-Verified Order Total</span>
              <p className="text-2xl font-extrabold text-brand-700 dark:text-accent-400">
                {formatPrice(getTotal())}
              </p>
            </div>
            <Button
              variant="accent"
              size="lg"
              loading={isPlacing}
              onClick={handlePlaceOrder}
              leftIcon={<CheckCircle2 className="h-5 w-5" />}
            >
              Confirm & Send Order to Kitchen
            </Button>
          </div>
        </Card>
      )}

      {/* Orders List */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          Your Orders ({orders.length})
        </h2>

        {ordersQuery.isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-5 space-y-3">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-12 w-full" />
              </Card>
            ))}
          </div>
        ) : ordersQuery.isError ? (
          <Card>
            <ErrorState
              message="Failed to fetch your orders."
              onRetry={() => ordersQuery.refetch()}
            />
          </Card>
        ) : orders.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ShoppingBag className="h-7 w-7" />}
              title="No orders placed yet"
              description="Add items from any of the 5 campus outlets to place your first order."
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const stepIdx = LIFECYCLE_STEPS.indexOf(order.status);
              const isTerminalNegative =
                order.status === 'CANCELLED' || order.status === 'REJECTED';
              const canCancel = ['PLACED', 'ACCEPTED'].includes(order.status);

              return (
                <Card key={order.id} className="p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2.5">
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
                        {order.outlet?.name} • Placed {formatDateTime(order.createdAt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                        {formatPrice(Number(order.total))}
                      </span>
                      {canCancel && (
                        <Button
                          variant="danger"
                          size="sm"
                          leftIcon={<XCircle className="h-4 w-4" />}
                          onClick={() => handleCancelOrder(order.id)}
                        >
                          Cancel Order
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Lifecycle Stepper */}
                  {!isTerminalNegative && (
                    <div className="grid grid-cols-5 gap-2 pt-1">
                      {LIFECYCLE_STEPS.map((step, idx) => {
                        const completed = idx <= stepIdx;
                        return (
                          <div key={step} className="space-y-1.5">
                            <div
                              className={`h-2 rounded-full transition ${
                                completed
                                  ? 'bg-accent-500'
                                  : 'bg-slate-200 dark:bg-slate-800'
                              }`}
                            />
                            <span
                              className={`block text-[10px] font-bold uppercase ${
                                completed
                                  ? 'text-accent-600 dark:text-accent-400'
                                  : 'text-slate-400'
                              }`}
                            >
                              {step}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Order Items */}
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between py-1.5 text-xs"
                      >
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {item.quantity} × {item.name}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="font-bold">
                            {formatPrice(Number(item.subtotal))}
                          </span>
                          {order.status === 'COMPLETED' && (
                            <button
                              type="button"
                              onClick={() =>
                                setReviewItem({
                                  menuItemId: item.menuItemId,
                                  name: item.name,
                                })
                              }
                              className="inline-flex items-center gap-1 text-accent-600 hover:underline"
                            >
                              <Star className="h-3.5 w-3.5" /> Rate
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Review Modal */}
      <Modal
        open={!!reviewItem}
        onClose={() => setReviewItem(null)}
        title={`Rate ${reviewItem?.name ?? 'Dish'}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReviewItem(null)}>
              Cancel
            </Button>
            <Button variant="accent" onClick={handleSubmitReview}>
              Submit Review
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className={`rounded-xl p-2 ${
                  star <= rating ? 'text-amber-500' : 'text-slate-300'
                }`}
              >
                <Star className="h-6 w-6 fill-current" />
              </button>
            ))}
          </div>
          <Input
            label="Your Review (Optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="How was the taste and portion size?"
          />
        </div>
      </Modal>
    </div>
  );
}

export default StudentOrdersPage;
