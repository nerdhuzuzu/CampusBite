import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Wallet,
  Save,
  User,
  RotateCcw,
  TrendingUp,
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
  Select,
  Skeleton,
} from '@/components/ui';
import { formatDateTime, formatPrice } from '@/lib/utils';

interface WalletData {
  totalSpent: number;
  totalRefunded: number;
  totalOrders: number;
  monthlyBudget: number | null;
  categorySpending: Array<{ name: string; amount: number }>;
  outletSpending: Array<{ name: string; amount: number }>;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    description: string;
    createdAt: string;
  }>;
}

export function StudentProfilePage() {
  const queryClient = useQueryClient();
  const [dietaryType, setDietaryType] = useState<'VEG' | 'NON_VEG' | 'VEGAN' | 'EGG'>('VEG');
  const [allergies, setAllergies] = useState('');
  const [monthlyBudget, setMonthlyBudget] = useState('3000');
  const [spiceLevel, setSpiceLevel] = useState('3');
  const [saving, setSaving] = useState(false);

  const profileQuery = useQuery({
    queryKey: ['student-profile'],
    queryFn: async () => (await api.get('/student/profile')).data.data,
  });

  const walletQuery = useQuery<WalletData>({
    queryKey: ['student-wallet'],
    queryFn: async () => (await api.get('/student/wallet')).data.data,
  });

  useEffect(() => {
    const p = profileQuery.data;
    if (p) {
      if (p.studentProfile?.dietaryType) setDietaryType(p.studentProfile.dietaryType);
      if (p.studentProfile?.allergies) setAllergies(p.studentProfile.allergies);
      if (p.studentProfile?.monthlyBudget) {
        setMonthlyBudget(String(p.studentProfile.monthlyBudget));
      }
      if (p.preferences?.spiceLevel) {
        setSpiceLevel(String(p.preferences.spiceLevel));
      }
    }
  }, [profileQuery.data]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/student/profile', {
        dietaryType,
        allergies,
        monthlyBudget: monthlyBudget ? Number(monthlyBudget) : undefined,
        spiceLevel: Number(spiceLevel),
      });
      toast.success('Dietary preferences & budget updated!');
      await queryClient.invalidateQueries({ queryKey: ['student-profile'] });
      await queryClient.invalidateQueries({ queryKey: ['student-wallet'] });
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const wallet = walletQuery.data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Student Profile & Digital Spending Tracker
        </h1>
        <p className="text-sm text-slate-500">
          Manage your dietary preferences, allergies, monthly budget, and counter payment history.
        </p>
      </div>

      {/* Spending KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">
              Total Campus Spending
            </span>
            <Wallet className="h-5 w-5 text-accent-500" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
            {walletQuery.isLoading ? '…' : formatPrice(wallet?.totalSpent ?? 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Across {wallet?.totalOrders ?? 0} recorded orders
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">
              Cancelled Order Refunds
            </span>
            <RotateCcw className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {walletQuery.isLoading ? '…' : formatPrice(wallet?.totalRefunded ?? 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Eligible cancellations refunded</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">
              Monthly Dining Budget
            </span>
            <TrendingUp className="h-5 w-5 text-brand-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
            {formatPrice(Number(monthlyBudget || 0))}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Counter payments & spending tracker (No stored monetary balance)
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Dietary Preferences Form */}
        <Card className="p-6 lg:col-span-5">
          <div className="mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-brand-700 dark:text-accent-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Dietary Preferences & Allergies
            </h2>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <Select
              label="Primary Dietary Preference"
              value={dietaryType}
              onChange={(e) =>
                setDietaryType(e.target.value as 'VEG' | 'NON_VEG' | 'VEGAN' | 'EGG')
              }
              options={[
                { value: 'VEG', label: 'Vegetarian' },
                { value: 'NON_VEG', label: 'Non-Vegetarian' },
                { value: 'VEGAN', label: 'Vegan' },
                { value: 'EGG', label: 'Eggetarian' },
              ]}
            />

            <Select
              label="Preferred Spice Level (1–5)"
              value={spiceLevel}
              onChange={(e) => setSpiceLevel(e.target.value)}
              options={[
                { value: '1', label: '1 — Mild' },
                { value: '2', label: '2 — Light Medium' },
                { value: '3', label: '3 — Medium' },
                { value: '4', label: '4 — Spicy' },
                { value: '5', label: '5 — Extra Hot' },
              ]}
            />

            <Input
              label="Food Allergies / Restrictions"
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="e.g., Peanuts, Lactose, Gluten…"
            />

            <Input
              label="Monthly Spending Target (₹)"
              type="number"
              value={monthlyBudget}
              onChange={(e) => setMonthlyBudget(e.target.value)}
            />

            <Button
              type="submit"
              variant="accent"
              fullWidth
              loading={saving}
              leftIcon={<Save className="h-4 w-4" />}
            >
              Save Preferences
            </Button>
          </form>
        </Card>

        {/* Spending Breakdown & Transactions */}
        <Card className="p-6 lg:col-span-7 space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Spending by Outlet & Category
            </h2>
            <p className="text-xs text-slate-500">
              Aggregated from your verified campus orders
            </p>
          </div>

          {walletQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (wallet?.outletSpending.length ?? 0) > 0 ? (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={wallet?.outletSpending}>
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="amount" fill="#f97316" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-xs text-slate-500">
              Place an order to see your outlet and category spending charts.
            </p>
          )}

          <div>
            <h3 className="mb-2.5 text-sm font-bold text-slate-900 dark:text-white">
              Recent Counter Payment & Refund Ledger
            </h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
              {(wallet?.transactions ?? []).length === 0 ? (
                <p className="py-4 text-xs text-slate-500">No ledger entries yet.</p>
              ) : (
                wallet?.transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between py-2.5 text-xs">
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {tx.description}
                      </p>
                      <p className="text-slate-400">{formatDateTime(tx.createdAt)}</p>
                    </div>
                    <Badge tone={tx.type === 'REFUND' ? 'success' : 'neutral'}>
                      {tx.type === 'REFUND' ? '+' : '-'}
                      {formatPrice(Number(tx.amount))}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default StudentProfilePage;
