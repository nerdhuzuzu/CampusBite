import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  UtensilsCrossed,
  Plus,
  Flame,
  Scale,
  ArrowUpDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/axios';
import { useCartStore } from '@/stores/cartStore';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Modal,
  SearchInput,
  Select,
  Skeleton,
} from '@/components/ui';
import { formatPrice, getDietaryColor, getDietaryLabel } from '@/lib/utils';
import type { FoodCategory, MenuItem, Outlet } from '@/types';

export function StudentMenuPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialOutlet = searchParams.get('outletId') ?? 'ALL';

  const [search, setSearch] = useState('');
  const [outletId, setOutletId] = useState(initialOutlet);
  const [categoryId, setCategoryId] = useState('ALL');
  const [dietary, setDietary] = useState('ALL');
  const [maxPrice, setMaxPrice] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [sortBy, setSortBy] = useState<'popularity' | 'price' | 'rating'>('popularity');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [compareQuery, setCompareQuery] = useState('Sandwich');
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  const { addItem } = useCartStore();

  const outletsQuery = useQuery<Outlet[]>({
    queryKey: ['outlets-list'],
    queryFn: async () => (await api.get('/outlets')).data.data ?? [],
  });

  const categoriesQuery = useQuery<FoodCategory[]>({
    queryKey: ['categories-list'],
    queryFn: async () => (await api.get('/categories')).data.data ?? [],
  });

  const menuQuery = useQuery<MenuItem[]>({
    queryKey: ['full-menu', outletId, categoryId, dietary, maxPrice, onlyAvailable, search, sortBy, sortOrder],
    queryFn: async () => {
      const params: Record<string, string> = { sortBy, sortOrder };
      if (outletId !== 'ALL') params.outletId = outletId;
      if (categoryId !== 'ALL') params.categoryId = categoryId;
      if (dietary !== 'ALL') params.dietary = dietary;
      if (maxPrice) params.maxPrice = maxPrice;
      if (onlyAvailable) params.available = 'true';
      if (search.trim()) params.search = search.trim();
      const res = await api.get('/menu', { params });
      return res.data.data ?? [];
    },
  });

  const compareItemsQuery = useQuery<MenuItem[]>({
    queryKey: ['compare-menu', compareQuery],
    enabled: compareModalOpen,
    queryFn: async () => {
      const res = await api.get('/menu/compare', { params: { q: compareQuery } });
      return res.data.data ?? [];
    },
  });

  const outlets = outletsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const items = menuQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Multi-Outlet Campus Menu
          </h1>
          <p className="text-sm text-slate-500">
            Browse, filter, and compare live dishes across all 5 campus food outlets.
          </p>
        </div>
        <Button
          variant="outline"
          leftIcon={<Scale className="h-4 w-4 text-accent-500" />}
          onClick={() => setCompareModalOpen(true)}
        >
          Compare Dish Prices Across Outlets
        </Button>
      </div>

      {/* Filters Card */}
      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search dishes by name (e.g., Dosa, Sandwich, Biryani, Dabeli)…"
            />
          </div>
          <Select
            value={outletId}
            onChange={(e) => {
              setOutletId(e.target.value);
              if (e.target.value === 'ALL') {
                searchParams.delete('outletId');
              } else {
                searchParams.set('outletId', e.target.value);
              }
              setSearchParams(searchParams);
            }}
            options={[
              { value: 'ALL', label: 'All 5 Campus Outlets' },
              ...outlets.map((o) => ({ value: o.id, label: o.name })),
            ]}
          />
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={[
              { value: 'ALL', label: 'All Food Categories' },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          {/* Dietary pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(['ALL', 'VEG', 'NON_VEG', 'VEGAN', 'EGG'] as const).map((dt) => (
              <button
                key={dt}
                type="button"
                onClick={() => setDietary(dt)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  dietary === dt
                    ? 'bg-brand-700 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {dt === 'ALL' ? 'All Diets' : getDietaryLabel(dt)}
              </button>
            ))}
          </div>

          {/* Budget & Sort */}
          <div className="flex flex-wrap items-center gap-2">
            {(['', '40', '80', '120'] as const).map((b) => (
              <button
                key={b || 'any'}
                type="button"
                onClick={() => setMaxPrice(b)}
                className={`rounded-xl px-2.5 py-1 text-xs font-semibold transition ${
                  maxPrice === b
                    ? 'bg-accent-500 text-white'
                    : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                {b ? `Under ₹${b}` : 'Any Price'}
              </button>
            ))}

            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 ml-2">
              <input
                type="checkbox"
                checked={onlyAvailable}
                onChange={(e) => setOnlyAvailable(e.target.checked)}
                className="rounded border-slate-300 text-accent-500"
              />
              In Stock Only
            </label>

            <button
              type="button"
              onClick={() => {
                if (sortBy !== 'price') {
                  setSortBy('price');
                  setSortOrder('asc');
                } else {
                  setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
                }
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {sortBy === 'price' ? `Price (${sortOrder.toUpperCase()})` : 'Sort by Price'}
            </button>
          </div>
        </div>
      </Card>

      {/* Menu Grid */}
      {menuQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Card key={i} className="p-4 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-9 w-full" />
            </Card>
          ))}
        </div>
      ) : menuQuery.isError ? (
        <Card>
          <ErrorState
            message="Failed to fetch menu items."
            onRetry={() => menuQuery.refetch()}
          />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UtensilsCrossed className="h-7 w-7" />}
            title="No menu items match your filters"
            description="Try relaxing your price or dietary filter."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="flex flex-col justify-between p-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] font-bold uppercase ${getDietaryColor(
                          item.dietaryType
                        )}`}
                      >
                        ● {getDietaryLabel(item.dietaryType)}
                      </span>
                      {item.category && (
                        <Badge tone="neutral">{item.category.name}</Badge>
                      )}
                    </div>
                    <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                      {item.name}
                    </h3>
                  </div>
                  <span className="text-base font-extrabold text-brand-700 dark:text-accent-400">
                    {formatPrice(Number(item.price))}
                  </span>
                </div>

                {item.description && (
                  <p className="mt-1.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                    {item.description}
                  </p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  <p className="font-bold text-slate-700 dark:text-slate-200">
                    {item.outlet?.name}
                  </p>
                  <p className="inline-flex items-center gap-2">
                    <span>Prep ~{item.preparationTime}m</span>
                    {item.calories && (
                      <span className="inline-flex items-center gap-0.5">
                        <Flame className="h-3 w-3 text-accent-500" />
                        {item.calories} kcal
                      </span>
                    )}
                    {item.protein ? <span>• {item.protein}g protein</span> : null}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant={item.isAvailable ? 'accent' : 'secondary'}
                  disabled={!item.isAvailable}
                  leftIcon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => {
                    addItem(item);
                    toast.success(`Added ${item.name} to tray`);
                  }}
                >
                  {item.isAvailable ? 'Add' : 'Sold Out'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Cross-Outlet Price Comparison Modal */}
      <Modal
        open={compareModalOpen}
        onClose={() => setCompareModalOpen(false)}
        title="Cross-Outlet Price Comparison"
        size="lg"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {['Sandwich', 'Rice', 'Coffee', 'Roll', 'Salad', 'Dabeli'].map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => setCompareQuery(kw)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                  compareQuery === kw
                    ? 'bg-brand-700 text-white'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {kw}
              </button>
            ))}
          </div>

          <SearchInput
            value={compareQuery}
            onChange={setCompareQuery}
            placeholder="Type dish keyword to compare prices across outlets…"
          />

          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
            {(compareItemsQuery.data ?? []).map((item, idx) => (
              <div key={item.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">{item.name}</span>
                    {idx === 0 && <Badge tone="success">Cheapest Match</Badge>}
                  </div>
                  <p className="text-xs text-slate-500">
                    {item.outlet?.name} • Prep ~{item.preparationTime} min
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-base font-extrabold text-brand-700 dark:text-accent-400">
                    {formatPrice(Number(item.price))}
                  </span>
                  <Button
                    size="sm"
                    variant="accent"
                    disabled={!item.isAvailable}
                    onClick={() => {
                      addItem(item);
                      toast.success(`Added ${item.name} (${item.outlet?.name})`);
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default StudentMenuPage;
