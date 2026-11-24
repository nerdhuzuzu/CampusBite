import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  QrCode,
  Clock,
  UtensilsCrossed,
  ArrowRight,
  Plus,
  LogIn,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/axios';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  FullPageSpinner,
} from '@/components/ui';
import { formatPrice, getDietaryColor, getDietaryLabel } from '@/lib/utils';
import type { MenuItem, Outlet } from '@/types';

export function QrLandingPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const { addItem } = useCartStore();

  const qrQuery = useQuery<{ outlet: Outlet; menuItems: MenuItem[] }>({
    queryKey: ['qr-redirect', token],
    enabled: !!token,
    queryFn: async () => {
      const res = await api.get(`/qr/${encodeURIComponent(token!)}`);
      return res.data.data;
    },
  });

  if (qrQuery.isLoading) {
    return <FullPageSpinner />;
  }

  if (qrQuery.isError || !qrQuery.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <Card className="max-w-md p-6">
          <ErrorState
            message="This QR code is invalid or expired. Please scan a valid CampusBite QR code."
            onRetry={() => navigate('/login/student')}
          />
        </Card>
      </div>
    );
  }

  const { outlet, menuItems } = qrQuery.data;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Verified Outlet Header */}
        <Card className="bg-gradient-to-r from-brand-800 via-brand-700 to-slate-900 p-6 sm:p-8 text-white border-none">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Badge tone="success">
                  <QrCode className="h-3.5 w-3.5" />
                  QR Redirect Verified
                </Badge>
                <Badge tone={outlet.isOpen ? 'accent' : 'danger'}>
                  {outlet.isOpen ? 'Open Now' : 'Closed'}
                </Badge>
              </div>
              <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold">
                {outlet.name} — Live Menu
              </h1>
              <p className="mt-1 text-sm text-white/80">
                {outlet.description} • Hours: {outlet.openingTime}–{outlet.closingTime} •{' '}
                <Clock className="inline h-3.5 w-3.5" /> ~{outlet.avgPrepTime} min prep
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              {isAuthenticated && user?.role === 'STUDENT' ? (
                <Button
                  variant="accent"
                  rightIcon={<ArrowRight className="h-4 w-4" />}
                  onClick={() => navigate(`/student/menu?outletId=${outlet.id}`)}
                >
                  Open in Student Portal
                </Button>
              ) : (
                <Link to="/login/student">
                  <Button
                    variant="accent"
                    leftIcon={<LogIn className="h-4 w-4" />}
                  >
                    Sign In to Place Order
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </Card>

        {/* Live Outlet Menu */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {menuItems.map((item) => (
            <Card key={item.id} className="flex flex-col justify-between p-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span
                      className={`text-[11px] font-bold uppercase ${getDietaryColor(
                        item.dietaryType
                      )}`}
                    >
                      ● {getDietaryLabel(item.dietaryType)}
                    </span>
                    <h3 className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">
                      {item.name}
                    </h3>
                  </div>
                  <span className="text-base font-extrabold text-brand-700 dark:text-accent-400">
                    {formatPrice(Number(item.price))}
                  </span>
                </div>
                {item.description && (
                  <p className="mt-1.5 text-xs text-slate-500">{item.description}</p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  <UtensilsCrossed className="inline h-3.5 w-3.5 mr-1 text-accent-500" />
                  ~{item.preparationTime} min
                </span>
                <Button
                  size="sm"
                  variant={item.isAvailable ? 'accent' : 'secondary'}
                  disabled={!item.isAvailable}
                  leftIcon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => {
                    addItem({ ...item, outlet });
                    if (isAuthenticated && user?.role === 'STUDENT') {
                      toast.success(`Added ${item.name} to tray`);
                    } else {
                      toast.success(`Added ${item.name}! Sign in to complete your order.`);
                      navigate('/login/student');
                    }
                  }}
                >
                  {item.isAvailable ? 'Add & Order' : 'Sold Out'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export default QrLandingPage;
