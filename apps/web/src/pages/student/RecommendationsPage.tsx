import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Plus,
  ThumbsUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/axios';
import { useCartStore } from '@/stores/cartStore';
import {
  Badge,
  Button,
  Card,
  Select,
  Skeleton,
} from '@/components/ui';
import { ChatPanel } from '@/components/chat/FloatingChatbot';
import { formatPrice, getDietaryLabel } from '@/lib/utils';
import type { MenuItem } from '@/types';

interface RecItem {
  itemId: string;
  itemName: string;
  outlet: string;
  outletId: string;
  category: string;
  price: number;
  dietaryType: string;
  preparationTime: number;
  calories?: number;
  protein?: number;
  score: number;
  explanation: string;
  menuItem: MenuItem;
}

export function StudentRecommendationsPage() {
  const { addItem } = useCartStore();
  const queryClient = useQueryClient();
  const [dietFilter, setDietFilter] = useState<'VEG' | 'NON_VEG' | 'VEGAN' | 'EGG'>('VEG');
  const [budget, setBudget] = useState<string>('120');
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});

  const recsQuery = useQuery<{ recommendations: RecItem[]; isFallback: boolean }>({
    queryKey: ['ai-recommendations', dietFilter, budget],
    queryFn: async () => {
      const res = await api.post('/ai/recommendations', {
        dietaryType: dietFilter,
        budget: budget ? Number(budget) : undefined,
        limit: 6,
      });
      return res.data.data;
    },
  });

  const handleFeedback = async (rec: RecItem) => {
    try {
      await api.post('/ai/recommendations/feedback', {
        menuItemId: rec.itemId,
        helpful: true,
      });
      setLikedIds((prev) => ({ ...prev, [rec.itemId]: true }));
      toast.success(`Preference saved for ${rec.category} dishes!`);
      await queryClient.invalidateQueries({ queryKey: ['ai-recommendations'] });
    } catch {
      toast.error('Failed to record preference feedback');
    }
  };

  const recommendations = recsQuery.data?.recommendations ?? [];

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      {/* Left: Hybrid AI Food Recommendations */}
      <div className="space-y-5 lg:col-span-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent-500" />
              <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
                AI Food Recommendation Engine
              </h1>
            </div>
            <p className="text-xs text-slate-500">
              Hybrid content, order history & popularity scoring grounded in live available dishes
            </p>
          </div>
        </div>

        <Card className="p-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Dietary Preference"
            value={dietFilter}
            onChange={(e) =>
              setDietFilter(e.target.value as 'VEG' | 'NON_VEG' | 'VEGAN' | 'EGG')
            }
            options={[
              { value: 'VEG', label: 'Vegetarian' },
              { value: 'NON_VEG', label: 'Non-Vegetarian' },
              { value: 'VEGAN', label: 'Vegan' },
              { value: 'EGG', label: 'Eggetarian' },
            ]}
          />
          <Select
            label="Max Dish Budget"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            options={[
              { value: '50', label: 'Under ₹50' },
              { value: '80', label: 'Under ₹80' },
              { value: '120', label: 'Under ₹120' },
              { value: '200', label: 'Under ₹200' },
            ]}
          />
        </Card>

        {recsQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-4 space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-9 w-full" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {recommendations.map((rec) => (
              <Card key={rec.itemId} className="flex flex-col justify-between p-4">
                <div>
                  <div className="flex items-center justify-between">
                    <Badge tone="accent">{Math.round(rec.score * 100)}% Match</Badge>
                    <span className="text-base font-extrabold text-brand-700 dark:text-accent-400">
                      {formatPrice(rec.price)}
                    </span>
                  </div>
                  <h3 className="mt-2 text-base font-bold text-slate-900 dark:text-white">
                    {rec.itemName}
                  </h3>
                  <p className="text-xs font-semibold text-slate-500">
                    {rec.outlet} • {getDietaryLabel(rec.dietaryType)}
                  </p>
                  <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    ✨ {rec.explanation}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    disabled={likedIds[rec.itemId]}
                    onClick={() => void handleFeedback(rec)}
                    className={`inline-flex items-center gap-1 text-xs font-semibold transition ${
                      likedIds[rec.itemId]
                        ? 'text-emerald-600'
                        : 'text-slate-500 hover:text-accent-600'
                    }`}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                    {likedIds[rec.itemId] ? 'Preference Saved' : 'Like Category'}
                  </button>
                  <Button
                    size="sm"
                    variant="accent"
                    leftIcon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => {
                      addItem(rec.menuItem);
                      toast.success(`Added ${rec.itemName} to tray`);
                    }}
                  >
                    Add to Tray
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Right: Persistent, Grounded AI Campus Food Assistant */}
      <div className="lg:col-span-5">
        <ChatPanel className="h-[640px]" />
      </div>
    </div>
  );
}

export default StudentRecommendationsPage;
