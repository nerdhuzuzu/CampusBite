import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  QrCode,
  Sparkles,
  Plus,
  UtensilsCrossed,
  Flame,
  Mic,
  MicOff,
  MapPin,
  Users,
  ShoppingBag,
  ArrowRight,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import api from '@/lib/axios';
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
  Skeleton,
  WebsiteQrButton,
} from '@/components/ui';
import { formatPrice, getDietaryColor, getDietaryLabel, getOrderStatusColor } from '@/lib/utils';
import type { MenuItem, Order, Outlet } from '@/types';

interface EnrichedOutlet extends Outlet {
  qrToken?: string | null;
  activeOrders?: number;
  availableFoodCount?: number;
  estimatedWait?: number;
  isEstimate?: boolean;
  crowd?: {
    peopleCount: number;
    crowdLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    isSimulated: boolean;
  };
}

export function StudentDashboard() {
  const { user } = useAuthStore();
  const { addItem } = useCartStore();
  const navigate = useNavigate();

  const [selectedOutlet, setSelectedOutlet] = useState<EnrichedOutlet | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrTokenInput, setQrTokenInput] = useState('');
  const [qrVerifiedData, setQrVerifiedData] = useState<{
    outlet: Outlet;
    menuItems: MenuItem[];
  } | null>(null);

  // Voice ordering state (requires explicit user confirmation before adding to cart)
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceMatches, setVoiceMatches] = useState<MenuItem[]>([]);

  const outletsQuery = useQuery<EnrichedOutlet[]>({
    queryKey: ['outlets-enriched'],
    queryFn: async () => {
      const res = await api.get('/outlets');
      return res.data.data ?? [];
    },
  });

  const popularMenuQuery = useQuery<MenuItem[]>({
    queryKey: ['popular-menu'],
    queryFn: async () => {
      const res = await api.get('/menu', { params: { available: 'true' } });
      return (res.data.data ?? []).slice(0, 6);
    },
  });

  const activeOrdersQuery = useQuery<Order[]>({
    queryKey: ['my-orders-preview'],
    queryFn: async () => {
      const res = await api.get('/orders/my');
      return res.data.data ?? [];
    },
  });

  const outlets = outletsQuery.data ?? [];
  const popularItems = popularMenuQuery.data ?? [];
  const myOrders = activeOrdersQuery.data ?? [];
  const activeOrders = myOrders.filter((o) =>
    ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status)
  );

  // Verify QR code token or full /qr/:token URL against backend /api/qr/:token
  const handleVerifyQrToken = async (rawInput: string) => {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      toast.error('Enter or select a valid outlet QR code');
      return;
    }
    const extractedToken = trimmed.includes('/qr/')
      ? trimmed.split('/qr/').pop()?.split(/[?#]/)[0] ?? trimmed
      : trimmed;
    try {
      const res = await api.get(`/qr/${encodeURIComponent(extractedToken)}`);
      setQrVerifiedData(res.data.data);
      toast.success(res.data.message || 'Outlet QR verified!');
    } catch {
      toast.error('Invalid or expired QR token');
    }
  };

  // Browser Speech Recognition for Voice-Assisted Ordering
  const startVoiceRecognition = () => {
    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      toast.error('Browser speech recognition not supported — use the text input below.');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SpeechRecognitionCtor as any)();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setIsListening(true);
    recognition.onresult = (event: { results: Array<Array<{ transcript: string }>> }) => {
      const spoken = event.results[0]?.[0]?.transcript ?? '';
      setTranscript(spoken);
      setIsListening(false);
      void runVoiceSearch(spoken);
    };
    recognition.onerror = () => {
      setIsListening(false);
      toast.error('Could not capture voice input. Try typing your request below.');
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const runVoiceSearch = async (phrase: string) => {
    if (!phrase.trim()) return;
    const lower = phrase.toLowerCase();
    const budgetMatch = lower.match(/(?:under|below|within)\s*(?:₹|rs|rupees)?\s*(\d+)/);
    const params: Record<string, string> = { available: 'true' };
    if (budgetMatch) {
      params.maxPrice = budgetMatch[1];
    } else {
      const cleaned = lower
        .replace(/order|find|show|me|some|want|to|eat|a|an|please/g, '')
        .trim();
      if (cleaned) params.search = cleaned;
    }
    const res = await api.get('/menu', { params });
    setVoiceMatches((res.data.data ?? []).slice(0, 5));
  };

  return (
    <div className="space-y-8">
      {/* Hero Welcome Banner */}
      <Card className="relative overflow-hidden bg-gradient-to-r from-brand-800 via-brand-700 to-slate-900 p-6 sm:p-8 text-white border-none">
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Badge tone="accent" className="mb-2.5">
              Centralized Campus Dining • {outlets.length || 5} Live Outlets
            </Badge>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome back, {user?.firstName ?? 'Student'}!
            </h1>
            <p className="mt-1.5 text-sm text-white/80 max-w-xl">
              Explore live menus across Canteen 1, Canteen 2, Cafe 1, Cafe 2 & Dabeli Stall, scan outlet QR tokens, or use voice & AI ordering.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <WebsiteQrButton outlets={outlets} variant="secondary" />
            <Button
              variant="accent"
              leftIcon={<QrCode className="h-4 w-4" />}
              onClick={() => {
                setQrVerifiedData(null);
                setQrModalOpen(true);
              }}
            >
              Scan Outlet QR
            </Button>
            <Button
              variant="secondary"
              leftIcon={<Mic className="h-4 w-4 text-accent-500" />}
              onClick={() => setVoiceModalOpen(true)}
            >
              Voice Order
            </Button>
            <Button
              variant="secondary"
              leftIcon={<Sparkles className="h-4 w-4 text-accent-500" />}
              onClick={() => navigate('/student/recommendations')}
            >
              AI Chatbot & Picks
            </Button>
          </div>
        </div>
      </Card>

      {/* Active Order Live Banner */}
      {activeOrders.length > 0 && (
        <Card className="border-accent-500/40 bg-accent-50/50 p-4 sm:p-5 dark:bg-accent-500/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-500 text-white">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Active Order #{activeOrders[0].orderNumber}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${getOrderStatusColor(
                      activeOrders[0].status
                    )}`}
                  >
                    {activeOrders[0].status}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {activeOrders[0].outlet?.name} • {activeOrders[0].items.length} item(s) •{' '}
                  {formatPrice(Number(activeOrders[0].total))}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="accent"
              rightIcon={<ArrowRight className="h-4 w-4" />}
              onClick={() => navigate('/student/orders')}
            >
              Track Live Status
            </Button>
          </div>
        </Card>
      )}

      {/* Campus Digital Twin (2D Interactive Map + Outlet Telemetry) */}
      <section aria-labelledby="digital-twin-heading" className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className="p-5 lg:col-span-7 flex flex-col justify-between">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-accent-500" />
                <h2 id="digital-twin-heading" className="text-base font-bold text-slate-900 dark:text-white">
                  Campus Digital Twin Map
                </h2>
              </div>
              <p className="text-xs text-slate-500">
                Interactive campus outlet map with live kitchen queue & availability telemetry
              </p>
            </div>
            <Badge tone="info">Live Campus Telemetry</Badge>
          </div>

          <div className="relative h-64 w-full overflow-hidden rounded-2xl border border-slate-200 bg-grid bg-slate-100/80 dark:border-slate-800 dark:bg-slate-950">
            {outlets.map((o) => {
              const crowdTone =
                o.crowd?.crowdLevel === 'HIGH'
                  ? 'bg-red-500'
                  : o.crowd?.crowdLevel === 'MEDIUM'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500';
              const isSelected = selectedOutlet?.id === o.id;

              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelectedOutlet(o)}
                  style={{
                    left: `${Math.min(Math.max(o.locationX ?? 50, 12), 88)}%`,
                    top: `${Math.min(Math.max(o.locationY ?? 50, 15), 82)}%`,
                  }}
                  className={`group absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border px-2.5 py-1.5 text-left shadow-md transition hover:scale-105 ${
                    isSelected
                      ? 'border-accent-500 bg-brand-800 text-white z-20 ring-4 ring-accent-500/30'
                      : 'border-slate-200 bg-white/95 text-slate-900 dark:border-slate-700 dark:bg-slate-900/95 dark:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${crowdTone}`} />
                    <span className="text-xs font-extrabold">{o.name}</span>
                  </div>
                  <div className="text-[10px] opacity-80">
                    ~{o.estimatedWait || o.avgPrepTime}m est • {o.availableFoodCount ?? 0} dishes
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Low Crowd
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Medium Crowd
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> High Crowd
              </span>
            </div>
            <span>Click any outlet pin to inspect queue & QR details</span>
          </div>
        </Card>

        {/* All 5 Campus Outlets List */}
        <Card className="p-5 lg:col-span-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              All 5 Campus Outlets
            </h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('/student/menu')}>
              Explore Full Menu
            </Button>
          </div>

          {outletsQuery.isLoading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : outletsQuery.isError ? (
            <ErrorState
              message="Could not fetch outlets."
              onRetry={() => outletsQuery.refetch()}
            />
          ) : (
            <div className="space-y-2.5">
              {outlets.map((o) => (
                <div
                  key={o.id}
                  onClick={() => setSelectedOutlet(o)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200/80 p-3 transition hover:border-accent-500 dark:border-slate-800"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{o.name}</h3>
                      <Badge tone={o.isOpen ? 'success' : 'danger'}>
                        {o.isOpen ? 'Open' : 'Closed'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {o.openingTime}–{o.closingTime} • {o.availableFoodCount ?? 0} available items
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <span className="inline-flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200">
                      <Clock className="h-3.5 w-3.5 text-accent-500" />
                      ~{o.estimatedWait || o.avgPrepTime} min
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      <Users className="inline h-3 w-3 mr-0.5" />
                      {o.crowd?.crowdLevel ?? 'LOW'} Crowd
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* Popular Campus Food Today */}
      <section aria-labelledby="popular-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="popular-heading" className="text-lg font-bold text-slate-900 dark:text-white">
              Today’s Popular Campus Dishes
            </h2>
            <p className="text-xs text-slate-500">
              Live prices and availability directly from MySQL
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/student/menu')}
            rightIcon={<ArrowRight className="h-4 w-4" />}
          >
            Browse All {35}+ Dishes
          </Button>
        </div>

        {popularMenuQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-4 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-9 w-full" />
              </Card>
            ))}
          </div>
        ) : popularItems.length === 0 ? (
          <Card>
            <EmptyState
              icon={<UtensilsCrossed className="h-7 w-7" />}
              title="No dishes available"
              description="Check back soon for updated menus."
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {popularItems.map((item) => (
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
                    <p className="mt-1.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                      {item.description}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="text-xs text-slate-500">
                    <p className="font-semibold text-slate-700 dark:text-slate-300">
                      {item.outlet?.name ?? 'Campus Outlet'}
                    </p>
                    <p className="inline-flex items-center gap-2">
                      <span>~{item.preparationTime} min</span>
                      {item.calories && (
                        <span className="inline-flex items-center gap-0.5">
                          <Flame className="h-3 w-3 text-accent-500" />
                          {item.calories} kcal
                        </span>
                      )}
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant="accent"
                    leftIcon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => {
                      addItem(item);
                      toast.success(`Added ${item.name} to tray`);
                    }}
                  >
                    Add to Tray
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Selected Outlet Details Modal */}
      <Modal
        open={!!selectedOutlet}
        onClose={() => setSelectedOutlet(null)}
        title={selectedOutlet?.name ?? 'Outlet Details'}
      >
        {selectedOutlet && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {selectedOutlet.description}
            </p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <span className="text-slate-500">Estimated Waiting Time</span>
                <p className="mt-1 text-base font-extrabold">
                  ~{selectedOutlet.estimatedWait || selectedOutlet.avgPrepTime} mins (Estimate)
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <span className="text-slate-500">Current Crowd Density</span>
                <p className="mt-1 text-base font-extrabold">
                  {selectedOutlet.crowd?.crowdLevel ?? 'LOW'} ({selectedOutlet.crowd?.peopleCount ?? 0} active)
                </p>
              </div>
            </div>
            {selectedOutlet.qrToken && (
              <div className="flex flex-col items-center rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <QRCodeSVG value={`${window.location.origin}/qr/${selectedOutlet.qrToken}`} size={132} />
                <p className="mt-2 font-mono text-xs text-slate-500">
                  {window.location.origin}/qr/{selectedOutlet.qrToken}
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSelectedOutlet(null)}>
                Close
              </Button>
              <Button
                variant="accent"
                onClick={() => {
                  const id = selectedOutlet.id;
                  setSelectedOutlet(null);
                  navigate(`/student/menu?outletId=${id}`);
                }}
              >
                Browse {selectedOutlet.name} Menu
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* QR Code Ordering Modal */}
      <Modal
        open={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        title="QR-Based Outlet Ordering"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Each campus outlet has a unique signed QR token (no database secrets exposed). Scan or tap an outlet QR below to verify it with the backend and load its live menu:
          </p>

          <div className="flex gap-2">
            <Input
              value={qrTokenInput}
              onChange={(e) => setQrTokenInput(e.target.value)}
              placeholder="Paste or scan outlet QR token…"
            />
            <Button variant="primary" onClick={() => handleVerifyQrToken(qrTokenInput)}>
              Verify QR
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {outlets.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  if (o.qrToken) {
                    setQrTokenInput(o.qrToken);
                    void handleVerifyQrToken(o.qrToken);
                  }
                }}
                className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-accent-500 dark:border-slate-800"
              >
                {o.qrToken && (
                  <QRCodeSVG value={`${window.location.origin}/qr/${o.qrToken}`} size={48} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{o.name}</p>
                  <p className="truncate font-mono text-[11px] text-slate-500">
                    {o.qrToken ? `${window.location.origin}/qr/${o.qrToken}` : 'N/A'}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {qrVerifiedData && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <Badge tone="success">Verified Outlet QR</Badge>
                  <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                    {qrVerifiedData.outlet.name} — Live Menu
                  </h3>
                </div>
                <Button
                  size="sm"
                  variant="accent"
                  onClick={() => {
                    setQrModalOpen(false);
                    navigate('/student/orders');
                  }}
                >
                  Review Tray & Order
                </Button>
              </div>
              <div className="divide-y divide-slate-200/70 dark:divide-slate-800 max-h-56 overflow-y-auto">
                {qrVerifiedData.menuItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <span className="font-semibold">{item.name}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {formatPrice(Number(item.price))}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!item.isAvailable}
                      onClick={() => {
                        addItem(item);
                        toast.success(`Added ${item.name} from ${qrVerifiedData.outlet.name}`);
                      }}
                    >
                      {item.isAvailable ? 'Add' : 'Sold Out'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Voice-Assisted Ordering Modal */}
      <Modal
        open={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
        title="Voice-Assisted Food Ordering"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Speak a command like <em>“Show me food under 60 rupees”</em> or <em>“Masala Dosa”</em>. Spoken text is always shown for your explicit confirmation before adding items to your tray.
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant={isListening ? 'danger' : 'accent'}
              leftIcon={isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              onClick={startVoiceRecognition}
            >
              {isListening ? 'Listening…' : 'Start Voice Input'}
            </Button>
            <Input
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Or type spoken phrase here (e.g., under 60, sandwich)…"
            />
            <Button variant="outline" onClick={() => void runVoiceSearch(transcript)}>
              Search
            </Button>
          </div>

          {transcript && (
            <div className="rounded-xl bg-slate-100 p-3 text-xs dark:bg-slate-800">
              <span className="font-semibold text-slate-500">Recognized Phrase:</span>{' '}
              <span className="font-bold text-slate-900 dark:text-white">“{transcript}”</span>
            </div>
          )}

          {voiceMatches.length > 0 && (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {voiceMatches.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      {item.outlet?.name} • {formatPrice(Number(item.price))}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="accent"
                    onClick={() => {
                      addItem(item);
                      toast.success(`Confirmed & added ${item.name} to tray`);
                    }}
                  >
                    Confirm & Add
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

export default StudentDashboard;
