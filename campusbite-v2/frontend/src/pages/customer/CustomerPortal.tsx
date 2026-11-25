import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UtensilsCrossed,
  Store,
  ShoppingBag,
  ShoppingCart,
  User,
  Wallet,
  Plus,
  Minus,
  Trash2,
  LogOut,
  LogIn,
  UserPlus,
  Lock,
  Search,
  MapPin,
  Bot,
  Send,
  Clock,
  Star,
  Sparkles,
  Flame,
  CreditCard,
  ShieldCheck,
  Ticket,
  TrendingUp,
  Sun,
  Moon,
  Scale,
  Mic,
  MicOff,
  AlertTriangle,
  Download,
  X,
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
} from "recharts";
import toast from "react-hot-toast";
import { apiV2, formatINR, getSocketV2, resolveMediaUrl } from "@/lib/api";
import { useV2Store } from "@/stores/v2Store";

type CustomerTab = "browse" | "orders" | "spending" | "wallet" | "ai" | "profile";

interface ActiveEstablishment {
  id: string;
  name: string;
  type: string;
  description: string | null;
  logo_url?: string | null;
  cover_image_url?: string | null;
  location: string | null;
  opening_time: string;
  closing_time: string;
  status?: string;
  crowd_level: string;
  crowd_count: number;
  available_items_count: number;
  total_items_count?: number;
}

interface MenuItemRecord {
  id: string;
  canteen_id: string;
  category_id: string | null;
  category_name: string | null;
  canteen_name?: string;
  name: string;
  description: string | null;
  price: number;
  dietary_type: "VEG" | "NON_VEG" | "VEGAN" | "EGG";
  preparation_time: number;
  stock_quantity: number;
  is_available: number;
  image_url: string | null;
  avg_rating: number;
  total_reviews: number;
}

function DietaryBadge({ type }: { type: string }) {
  const isVeg = type === "VEG" || type === "VEGAN";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider border ${
        isVeg
          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
          : type === "EGG"
            ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300"
            : "border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          isVeg
            ? "bg-emerald-600"
            : type === "EGG"
              ? "bg-amber-500"
              : "bg-red-600"
        }`}
      />
      {type.replace("_", "-")}
    </span>
  );
}

const ORDER_STEPS = ["PLACED", "ACCEPTED", "PREPARING", "READY", "COMPLETED"];

export function CustomerPortal() {
  const {
    user,
    logout,
    theme,
    toggleTheme,
    cart,
    cartCanteenId,
    cartCanteenName,
    addToCart,
    updateQty,
    clearCart,
  } = useV2Store();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const isGuest = !user || user.role !== "CUSTOMER";

  const [tab, setTab] = useState<CustomerTab>("browse");
  const [authPromptModal, setAuthPromptModal] = useState<{
    open: boolean;
    reason: string;
  }>({ open: false, reason: "" });
  const [search, setSearch] = useState("");
  const [menuSearch, setMenuSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [dietFilter, setDietFilter] = useState("ALL");
  const [maxPriceFilter, setMaxPriceFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [selectedCanteenId, setSelectedCanteenId] = useState<string | null>(
    null
  );
  const [detailDish, setDetailDish] = useState<MenuItemRecord | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH" | "WALLET" | "RAZORPAY"
  >("WALLET");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);

  // V1 Price Comparison & Voice-Assisted Ordering Modals
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareKeyword, setCompareKeyword] = useState("Sandwich");
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");

  // Review state
  const [reviewOrder, setReviewOrder] = useState<{
    orderId: string;
    canteenId: string;
    menuItemId: string;
    dishName: string;
  } | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");

  // Wallet Topup
  const [topupAmount, setTopupAmount] = useState("500");

  // Spending Analytics & Monthly Budget State (Section 7)
  const nowMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(nowMonth);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [budgetLimitInput, setBudgetLimitInput] = useState("3000");
  const [alertThresholdInput, setAlertThresholdInput] = useState<number>(75);
  const [restrictSpendingInput, setRestrictSpendingInput] = useState(false);
  const [budgetEnabledInput, setBudgetEnabledInput] = useState(true);
  const [savingBudget, setSavingBudget] = useState(false);

  // Profile & Dietary Preferences Form
  const [profileName, setProfileName] = useState(user?.fullName || "");
  const [profilePhone, setProfilePhone] = useState(user?.phone || "");
  const [prefDiet, setPrefDiet] = useState<"VEG" | "NON_VEG" | "VEGAN" | "EGG">(
    "VEG"
  );
  const [prefSpice, setPrefSpice] = useState("3");
  const [prefAllergies, setPrefAllergies] = useState("");

  // AI Assistant
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const socket = getSocketV2();
    const refreshLive = () => {
      void queryClient.invalidateQueries({
        queryKey: ["v2-public-establishments"],
      });
      void queryClient.invalidateQueries({ queryKey: ["v2-public-menu"] });
      void queryClient.invalidateQueries({ queryKey: ["v2-customer-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["v2-customer-wallet"] });
      void queryClient.invalidateQueries({
        queryKey: ["v2-customer-spending"],
      });
    };
    socket.on("establishment:updated", refreshLive);
    socket.on("menu:updated", refreshLive);
    socket.on(
      "order:updated",
      (payload: { orderNumber?: string; status?: string }) => {
        if (payload?.orderNumber) {
          toast.success(
            `Order #${payload.orderNumber} is now ${payload.status}!`
          );
        }
        refreshLive();
      }
    );
    return () => {
      socket.off("establishment:updated", refreshLive);
      socket.off("menu:updated", refreshLive);
      socket.off("order:updated", refreshLive);
    };
  }, [queryClient]);

  const establishmentsQuery = useQuery<ActiveEstablishment[]>({
    queryKey: ["v2-public-establishments", search, typeFilter],
    queryFn: async () =>
      (
        await apiV2.get("/public/establishments", {
          params: {
            ...(search ? { search } : {}),
            ...(typeFilter !== "ALL" ? { type: typeFilter } : {}),
          },
        })
      ).data.data,
  });

  const activeCanteenId =
    selectedCanteenId || establishmentsQuery.data?.[0]?.id || null;

  const menuQuery = useQuery({
    queryKey: ["v2-public-menu", activeCanteenId],
    enabled: !!activeCanteenId,
    queryFn: async () =>
      (await apiV2.get(`/public/establishments/${activeCanteenId}/menu`)).data
        .data,
  });

  const compareMenuQuery = useQuery<MenuItemRecord[]>({
    queryKey: ["v2-compare-menu", compareKeyword],
    enabled: compareModalOpen,
    queryFn: async () =>
      (
        await apiV2.get("/public/menu/compare", {
          params: { q: compareKeyword },
        })
      ).data.data,
  });

  const ordersQuery = useQuery({
    queryKey: ["v2-customer-orders", user?.id],
    enabled: !isGuest,
    queryFn: async () => (await apiV2.get("/customer/orders")).data.data,
    refetchInterval: 8000,
  });

  const walletQuery = useQuery({
    queryKey: ["v2-customer-wallet", user?.id],
    enabled: !isGuest,
    queryFn: async () => (await apiV2.get("/customer/wallet")).data.data,
  });

  const spendingQuery = useQuery({
    queryKey: [
      "v2-customer-spending",
      user?.id,
      selectedMonth,
      customStartDate,
      customEndDate,
    ],
    enabled: !isGuest,
    queryFn: async () =>
      (
        await apiV2.get("/customer/spending-analytics", {
          params: {
            month: selectedMonth,
            ...(customStartDate && customEndDate
              ? { startDate: customStartDate, endDate: customEndDate }
              : {}),
          },
        })
      ).data.data,
  });

  const aiRecsQuery = useQuery<MenuItemRecord[]>({
    queryKey: ["v2-ai-recommendations", user?.id],
    enabled: !isGuest,
    queryFn: async () => (await apiV2.get("/ai/recommendations")).data.data,
  });

  useEffect(() => {
    if (user?.fullName) setProfileName(user.fullName);
    if (user?.phone !== undefined) setProfilePhone(user.phone || "");
  }, [user?.fullName, user?.phone]);

  useEffect(() => {
    if (searchParams.get("checkout") === "1") {
      setTab("browse");
      if (cart.length > 0) {
        setMobileCartOpen(true);
      }
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("checkout");
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams, cart.length]);

  // Sync budget & preferences form when spending analytics loads
  useEffect(() => {
    const b = spendingQuery.data?.budget;
    const p = spendingQuery.data?.preferences;
    if (b) {
      setBudgetLimitInput(String(b.monthlyLimit ?? 3000));
      setAlertThresholdInput(Number(b.alertThresholdPct ?? 75));
      setRestrictSpendingInput(Boolean(b.restrictSpending));
      setBudgetEnabledInput(Boolean(b.isEnabled));
    }
    if (p) {
      if (p.dietaryType) setPrefDiet(p.dietaryType);
      if (p.spiceLevel) setPrefSpice(String(p.spiceLevel));
      if (p.allergies !== undefined) setPrefAllergies(p.allergies || "");
    }
  }, [spendingQuery.data]);

  const cartSubtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartTax = Number((cartSubtotal * 0.05).toFixed(2));
  const cartTotal = Number((cartSubtotal + cartTax).toFixed(2));
  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);

  const handleAddItemToTray = (item: {
    id: string;
    canteenId: string;
    canteenName: string;
    name: string;
    price: number;
    dietaryType: string;
    imageUrl?: string | null;
  }) => {
    const result = addToCart(item);
    if (result.status === "SWITCHED_OUTLET") {
      toast(
        `Orders are placed one outlet at a time. Switched tray from ${result.previousCanteenName} to ${item.canteenName} and added ${item.name}.`,
        { icon: "🍽️", duration: 4000 }
      );
    } else {
      toast.success(`Added ${item.name} to tray`);
    }
  };

  const handleCheckout = async () => {
    if (!cartCanteenId || cart.length === 0) return;
    if (isGuest) {
      setMobileCartOpen(false);
      setAuthPromptModal({
        open: true,
        reason:
          "Please sign in or create a customer account to place your order. Your tray items and quantities are saved and will be ready for checkout immediately after authentication.",
      });
      return;
    }
    setPlacingOrder(true);
    try {
      const res = await apiV2.post("/customer/orders", {
        canteenId: cartCanteenId,
        items: cart.map((c) => ({ menuItemId: c.id, quantity: c.quantity })),
        paymentMethod,
        specialInstructions: specialInstructions.trim() || null,
        idempotencyKey: `v2-${user?.id}-${Date.now()}`,
      });
      clearCart();
      setSpecialInstructions("");
      setMobileCartOpen(false);
      toast.success(
        `${res.data.message} Show your pickup token at the outlet counter!`
      );
      setTab("orders");
      await queryClient.invalidateQueries({ queryKey: ["v2-customer-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["v2-customer-wallet"] });
      await queryClient.invalidateQueries({
        queryKey: ["v2-customer-spending"],
      });
      await queryClient.invalidateQueries({ queryKey: ["v2-public-menu"] });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Order checkout failed.";
      toast.error(msg);
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiV2.post("/customer/wallet/topup", {
        amount: Number(topupAmount),
      });
      toast.success(res.data.message);
      await queryClient.invalidateQueries({ queryKey: ["v2-customer-wallet"] });
    } catch {
      toast.error("Wallet top-up failed.");
    }
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBudget(true);
    try {
      const res = await apiV2.put("/customer/budget", {
        monthYear: selectedMonth,
        monthlyLimit: Number(budgetLimitInput),
        alertThresholdPct: alertThresholdInput,
        restrictSpending: restrictSpendingInput,
        isEnabled: budgetEnabledInput,
        dietaryType: prefDiet,
        spiceLevel: Number(prefSpice),
        allergies: prefAllergies,
      });
      toast.success(res.data.message);
      await queryClient.invalidateQueries({
        queryKey: ["v2-customer-spending"],
      });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Failed to save budget settings.";
      toast.error(msg);
    } finally {
      setSavingBudget(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiV2.patch("/auth/customer/profile", {
        fullName: profileName,
        phone: profilePhone,
      });
      await apiV2.put("/customer/budget", {
        monthYear: selectedMonth,
        monthlyLimit: Number(budgetLimitInput),
        alertThresholdPct: alertThresholdInput,
        restrictSpending: restrictSpendingInput,
        isEnabled: budgetEnabledInput,
        dietaryType: prefDiet,
        spiceLevel: Number(prefSpice),
        allergies: prefAllergies,
      });
      toast.success("Customer profile & dietary preferences saved!");
      await queryClient.invalidateQueries({
        queryKey: ["v2-customer-spending"],
      });
    } catch {
      toast.error("Failed to update profile.");
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewOrder) return;
    try {
      await apiV2.post("/customer/reviews", {
        orderId: reviewOrder.orderId,
        canteenId: reviewOrder.canteenId,
        menuItemId: reviewOrder.menuItemId,
        rating: reviewRating,
        comment: reviewComment,
      });
      toast.success("Thank you! Your dish review is now live.");
      setReviewOrder(null);
      setReviewComment("");
      await queryClient.invalidateQueries({ queryKey: ["v2-public-menu"] });
    } catch {
      toast.error("Could not submit review.");
    }
  };

  const handleAskAi = async (e: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const promptToSend = (customText ?? aiPrompt).trim();
    if (!promptToSend) return;
    setAiLoading(true);
    try {
      const res = await apiV2.post("/ai/chat", { message: promptToSend });
      setAiReply(res.data.data.response);
      if (!customText) setAiPrompt("");
    } catch {
      toast.error("AI assistant request failed.");
    } finally {
      setAiLoading(false);
    }
  };

  // Voice-Assisted Search (V1 Feature Migration)
  const startVoiceSearch = () => {
    const SpeechRecognitionCtor =
      (
        window as unknown as {
          SpeechRecognition?: unknown;
          webkitSpeechRecognition?: unknown;
        }
      ).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      toast.error(
        "Browser speech recognition not supported — type your dish or budget below."
      );
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SpeechRecognitionCtor as any)();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    setIsListening(true);
    recognition.onresult = (event: {
      results: Array<Array<{ transcript: string }>>;
    }) => {
      const spoken = event.results[0]?.[0]?.transcript ?? "";
      setVoiceTranscript(spoken);
      setIsListening(false);
      setMenuSearch(spoken.replace(/under|rupees|order|show|me/gi, "").trim());
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const handleExportSpendingCsv = () => {
    const daily = spendingQuery.data?.dailyBreakdown ?? [];
    const rows = [
      ["Date", "Orders", "Net Spent (INR)"],
      ...daily.map((d: { date: string; orders: number; amount: number }) => [
        d.date,
        String(d.orders),
        String(d.amount),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campusbite-spending-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded personal spending report (CSV)!");
  };

  const establishments = establishmentsQuery.data ?? [];
  const selectedEst = menuQuery.data?.establishment;
  const categories = menuQuery.data?.categories ?? [];
  const rawMenuItems: MenuItemRecord[] = menuQuery.data?.items ?? [];

  const filteredMenuItems = rawMenuItems.filter((item) => {
    if (dietFilter !== "ALL" && item.dietary_type !== dietFilter) return false;
    if (categoryFilter !== "ALL" && item.category_id !== categoryFilter)
      return false;
    if (maxPriceFilter && Number(item.price) > Number(maxPriceFilter))
      return false;
    if (
      menuSearch.trim() &&
      !item.name.toLowerCase().includes(menuSearch.trim().toLowerCase()) &&
      !(item.description || "")
        .toLowerCase()
        .includes(menuSearch.trim().toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const orders = ordersQuery.data ?? [];
  const activeOrdersCount = orders.filter((o: { status: string }) =>
    ["PLACED", "ACCEPTED", "PREPARING", "READY"].includes(o.status)
  ).length;
  const walletBalance = Number(walletQuery.data?.walletBalance ?? 0);
  const spending = spendingQuery.data;
  const budget = spending?.budget;

  const navItems: Array<{
    id: CustomerTab;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    requiresAuth?: boolean;
  }> = [
    { id: "browse", label: "Explore Food", shortLabel: "Menu", icon: Store },
    {
      id: "orders",
      label: "Live Orders",
      shortLabel: "Orders",
      icon: ShoppingBag,
      badge: activeOrdersCount,
      requiresAuth: true,
    },
    {
      id: "spending",
      label: "Spending & Budget",
      shortLabel: "Budget",
      icon: TrendingUp,
      requiresAuth: true,
    },
    {
      id: "wallet",
      label: "Wallet",
      shortLabel: "Wallet",
      icon: Wallet,
      requiresAuth: true,
    },
    {
      id: "ai",
      label: "AI Picks",
      shortLabel: "AI",
      icon: Sparkles,
      requiresAuth: true,
    },
    {
      id: "profile",
      label: "Profile",
      shortLabel: "Profile",
      icon: User,
      requiresAuth: true,
    },
  ];

  const handleSelectTab = (targetTab: CustomerTab) => {
    if (isGuest && targetTab !== "browse") {
      setAuthPromptModal({
        open: true,
        reason:
          "Please sign in or create a customer account to view your orders, personal spending analytics, digital wallet, AI recommendations, and profile.",
      });
      return;
    }
    setTab(targetTab);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Top Navbar (Matching CampusBite V1 StudentLayout) */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm">
              <UtensilsCrossed className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                  CampusBite
                </span>
                <span className="rounded-full bg-accent-100 px-2.5 py-0.5 text-xs font-semibold text-accent-700 dark:bg-accent-500/15 dark:text-accent-400">
                  {isGuest ? "Campus Menus" : "Customer"}
                </span>
              </div>
              <span className="hidden sm:block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Centralized Campus Dining & Instant Takeaway
              </span>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav
            aria-label="Customer navigation"
            className="hidden md:flex items-center gap-1"
          >
            {navItems.map(({ id, label, icon: Icon, badge, requiresAuth }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectTab(id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  tab === id
                    ? "bg-brand-700 text-white shadow-sm dark:bg-brand-600"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
                {isGuest && requiresAuth ? (
                  <Lock className="h-3 w-3 opacity-60" />
                ) : null}
                {badge ? (
                  <span className="ml-0.5 rounded-full bg-accent-500 px-1.5 py-0.2 text-[10px] font-extrabold text-white">
                    {badge}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileCartOpen(true)}
              aria-label="Open order tray"
              className="relative flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
              <ShoppingCart className="h-4 w-4 text-accent-500" />
              <span className="hidden sm:inline">{formatINR(cartTotal)}</span>
              {cartItemCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1.5 text-[11px] font-bold text-white">
                  {cartItemCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            {isGuest ? (
              <div className="flex items-center gap-1.5">
                <Link
                  to="/login/customer"
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                >
                  <LogIn className="h-3.5 w-3.5 text-brand-700 dark:text-accent-400" />
                  <span>Sign In</span>
                </Link>
                <Link
                  to="/register/customer"
                  className="hidden sm:inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent-500 px-3.5 text-xs font-bold text-white shadow-2xs transition hover:bg-accent-600"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Register</span>
                </Link>
              </div>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  navigate("/");
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-red-50 hover:border-red-200 hover:text-red-600 dark:border-slate-800 dark:hover:bg-red-500/10"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 sm:px-6 md:pb-10">
        {/* Monthly Budget Alert Banner (Section 7.2 & 7.3) */}
        {budget?.isEnabled &&
          budget?.alertLevel &&
          budget.alertLevel !== "NORMAL" && (
            <div
              className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-xs ${
                budget.alertLevel === "LIMIT_REACHED"
                  ? "border-red-300 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-200"
                  : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-extrabold">
                    {budget.alertLevel === "LIMIT_REACHED"
                      ? `Monthly Dining Budget Reached (${budget.consumedPct}% of ${formatINR(
                          budget.monthlyLimit
                        )})`
                      : `Approaching Monthly Dining Budget (${budget.consumedPct}% of ${formatINR(
                          budget.monthlyLimit
                        )} consumed)`}
                  </p>
                  <p className="opacity-90">
                    Spent {formatINR(budget.spent)} • Remaining:{" "}
                    {formatINR(budget.remaining)} •{" "}
                    {budget.restrictSpending
                      ? "Strict Spending Restriction Enabled"
                      : "Informational Budget Alert (Orders remain enabled)"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTab("spending")}
                className="rounded-xl bg-slate-900 px-3 py-1.5 font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
              >
                Manage Budget
              </button>
            </div>
          )}

        {/* ================================================================= */}
        {/* TAB 1: BROWSE ESTABLISHMENTS, DIGITAL TWIN MAP & LIVE MENU        */}
        {/* ================================================================= */}
        {tab === "browse" && (
          <div className="space-y-6">
            {/* CampusBite V1 Deep Navy Gradient Hero Banner */}
            <div className="rounded-2xl bg-gradient-to-r from-brand-800 via-brand-700 to-slate-900 p-6 sm:p-8 text-white shadow-soft relative overflow-hidden">
              <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                <div className="space-y-2 max-w-xl">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-500/20 border border-accent-400/30 px-3 py-0.5 text-xs font-semibold text-accent-300">
                    <Flame className="h-3.5 w-3.5" /> Centralized Campus Dining •{" "}
                    {establishments.length} Live Outlets
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                    {isGuest
                      ? "Explore Live Campus Menus & Order Fresh Meals"
                      : `Welcome back, ${user?.fullName || "Customer"}!`}
                  </h1>
                  <p className="text-xs sm:text-sm text-white/80">
                    {isGuest
                      ? "Browse every active campus canteen, cafe, and food stall without logging in. Add dishes to your tray and sign in only when you are ready to place your order."
                      : "Explore live menus across campus establishments, compare dish prices across outlets, track your monthly dining budget, and pick up at the counter with your token number."}
                  </p>
                  <div className="pt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCompareModalOpen(true)}
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white/10 border border-white/20 px-3.5 text-xs font-bold text-white hover:bg-white/20"
                    >
                      <Scale className="h-4 w-4 text-accent-400" />
                      Compare Dish Prices
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoiceModalOpen(true)}
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white/10 border border-white/20 px-3.5 text-xs font-bold text-white hover:bg-white/20"
                    >
                      <Mic className="h-4 w-4 text-accent-400" />
                      Voice Order
                    </button>
                    {isGuest ? (
                      <Link
                        to="/login/customer"
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent-500 px-3.5 text-xs font-bold text-white shadow-sm hover:bg-accent-600"
                      >
                        <LogIn className="h-4 w-4" />
                        Sign In / Register to Order
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSelectTab("spending")}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent-500 px-3.5 text-xs font-bold text-white shadow-sm hover:bg-accent-600"
                      >
                        <TrendingUp className="h-4 w-4" />
                        Monthly Budget & Analytics
                      </button>
                    )}
                  </div>
                </div>

                {/* Global Establishment Search & Type Pills */}
                <div className="w-full lg:w-96 space-y-2.5">
                  <div className="relative">
                    <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-300" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search canteens, cafes, stalls…"
                      className="h-11 w-full rounded-xl border border-white/20 bg-white/10 pl-10 pr-4 text-xs text-white placeholder:text-white/60 focus:border-accent-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: "ALL", label: "All Spots" },
                      { id: "CANTEEN", label: "Canteens" },
                      { id: "CAFE", label: "Cafes" },
                      { id: "FOOD_STALL", label: "Food Stalls" },
                      { id: "RESTAURANT", label: "Restaurants" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTypeFilter(t.id)}
                        className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                          typeFilter === t.id
                            ? "bg-accent-500 text-white"
                            : "bg-white/10 text-white/80 hover:bg-white/20"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left 8 Columns: Establishments Strip + Active Menu */}
              <div className="space-y-6 lg:col-span-8">
                {establishments.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-14 text-center shadow-soft dark:border-slate-800 dark:bg-slate-900">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                      <Store className="h-6 w-6" />
                    </div>
                    <h2 className="mt-4 text-base font-bold text-slate-900 dark:text-white">
                      No active establishments registered yet
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                      Once the platform administrator registers an active canteen or cafe, it will appear here automatically.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* V1 Campus Digital Twin Interactive Map + Outlet Selector */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-accent-500" />
                            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                              Campus Digital Twin & Establishment Directory ({establishments.length})
                            </h2>
                          </div>
                          <p className="text-xs text-slate-500">
                            Select any campus outlet pin or card below to inspect live crowd density and menu
                          </p>
                        </div>
                        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-800 dark:bg-blue-500/15 dark:text-blue-300">
                          Live Campus Telemetry
                        </span>
                      </div>

                      {/* 2D Campus Map Canvas */}
                      <div className="relative h-44 w-full overflow-hidden rounded-2xl border border-slate-200 bg-grid bg-slate-100/80 dark:border-slate-800 dark:bg-slate-950">
                        {establishments.map((est, idx) => {
                          const active = est.id === activeCanteenId;
                          const leftPct = 18 + ((idx * 23) % 68);
                          const topPct = 24 + ((idx * 31) % 55);
                          const dotColor =
                            est.crowd_level === "HIGH"
                              ? "bg-red-500"
                              : est.crowd_level === "MEDIUM"
                                ? "bg-amber-500"
                                : "bg-emerald-500";
                          return (
                            <button
                              key={est.id}
                              type="button"
                              onClick={() => {
                                setSelectedCanteenId(est.id);
                                setCategoryFilter("ALL");
                              }}
                              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border px-3 py-1.5 text-left shadow-md transition hover:scale-105 ${
                                active
                                  ? "border-accent-500 bg-brand-800 text-white z-20 ring-4 ring-accent-500/30"
                                  : "border-slate-200 bg-white/95 text-slate-900 dark:border-slate-700 dark:bg-slate-900/95 dark:text-white"
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`h-2.5 w-2.5 rounded-full ${dotColor}`}
                                />
                                <span className="text-xs font-extrabold">
                                  {est.name}
                                </span>
                              </div>
                              <div className="text-[10px] opacity-80">
                                {est.available_items_count} dishes •{" "}
                                {est.crowd_level} crowd
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {establishments.map((est) => {
                          const active = est.id === activeCanteenId;
                          return (
                            <button
                              key={est.id}
                              type="button"
                              onClick={() => {
                                setSelectedCanteenId(est.id);
                                setCategoryFilter("ALL");
                              }}
                              className={`text-left rounded-2xl border p-4 transition-all ${
                                active
                                  ? "border-accent-500 bg-brand-50/40 ring-2 ring-accent-500/20 shadow-sm dark:bg-brand-900/30"
                                  : "border-slate-200/80 bg-white hover:border-accent-500 dark:border-slate-800 dark:bg-slate-900"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5">
                                  {est.logo_url ? (
                                    <img
                                      src={resolveMediaUrl(est.logo_url) || est.logo_url}
                                      alt={est.name}
                                      className="h-10 w-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                                    />
                                  ) : (
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white">
                                      <Store className="h-5 w-5" />
                                    </div>
                                  )}
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="inline-block rounded-md bg-brand-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-brand-800 dark:bg-brand-800 dark:text-brand-200">
                                        {est.type.replace("_", " ")}
                                      </span>
                                      <span className="inline-block rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                                        {est.status === "ACTIVE" || !est.status
                                          ? "OPEN"
                                          : est.status}
                                      </span>
                                    </div>
                                    <h3 className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">
                                      {est.name}
                                    </h3>
                                  </div>
                                </div>
                                <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                                  {est.available_items_count} dishes
                                </span>
                              </div>
                              {est.description && (
                                <p className="mt-1 text-xs text-slate-500 line-clamp-1">
                                  {est.description}
                                </p>
                              )}
                              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-2.5 text-[11px] font-medium text-slate-500 dark:border-slate-800">
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-accent-500" />
                                  {est.location || "Main Campus"}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-accent-500" />
                                  {est.opening_time}–{est.closing_time}
                                </span>
                                <span
                                  className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                    est.crowd_level === "HIGH"
                                      ? "bg-red-100 text-red-800"
                                      : est.crowd_level === "MEDIUM"
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-emerald-100 text-emerald-800"
                                  }`}
                                >
                                  Crowd: {est.crowd_level}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Selected Establishment Menu Catalogue */}
                    {selectedEst && (
                      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-soft space-y-5 dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
                          <div>
                            <div className="flex items-center gap-2">
                              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                                {selectedEst.name} — Live Menu
                              </h2>
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                                OPEN
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {selectedEst.location || "Campus Dining"} • Hours:{" "}
                              {selectedEst.opening_time} to{" "}
                              {selectedEst.closing_time}
                            </p>
                          </div>

                          {/* Dish Search + Dietary & Price Filters */}
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                              <input
                                type="search"
                                value={menuSearch}
                                onChange={(e) => setMenuSearch(e.target.value)}
                                placeholder="Search dishes…"
                                className="h-9 rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs focus:border-accent-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                              />
                            </div>
                            {["ALL", "VEG", "NON_VEG", "VEGAN"].map((d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setDietFilter(d)}
                                className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold transition ${
                                  dietFilter === d
                                    ? "bg-brand-700 text-white"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                                }`}
                              >
                                {d.replace("_", "-")}
                              </button>
                            ))}
                            {["", "60", "120", "200"].map((bp) => (
                              <button
                                key={bp || "any"}
                                type="button"
                                onClick={() => setMaxPriceFilter(bp)}
                                className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold transition ${
                                  maxPriceFilter === bp
                                    ? "bg-accent-500 text-white"
                                    : "border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                                }`}
                              >
                                {bp ? `≤ ₹${bp}` : "Any ₹"}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Category Pills */}
                        {categories.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setCategoryFilter("ALL")}
                              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                                categoryFilter === "ALL"
                                  ? "bg-accent-500 text-white shadow-2xs"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                              }`}
                            >
                              All Categories ({rawMenuItems.length})
                            </button>
                            {categories.map(
                              (cat: { id: string; name: string }) => (
                                <button
                                  key={cat.id}
                                  type="button"
                                  onClick={() => setCategoryFilter(cat.id)}
                                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                                    categoryFilter === cat.id
                                      ? "bg-accent-500 text-white shadow-2xs"
                                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                                  }`}
                                >
                                  {cat.name}
                                </button>
                              )
                            )}
                          </div>
                        )}

                        {filteredMenuItems.length === 0 ? (
                          <div className="py-12 text-center">
                            <UtensilsCrossed className="mx-auto h-8 w-8 text-slate-300" />
                            <p className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                              No matching dishes available
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              Try relaxing your search, dietary, or price filter.
                            </p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {filteredMenuItems.map((item) => {
                              const inCart = cart.find((c) => c.id === item.id);
                              const available =
                                item.is_available === 1 &&
                                item.stock_quantity > 0;
                              return (
                                <div
                                  key={item.id}
                                  className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-soft transition hover:border-accent-500 dark:border-slate-800 dark:bg-slate-900"
                                >
                                  <div className="flex gap-3.5">
                                    {item.image_url ? (
                                      <img
                                        src={resolveMediaUrl(item.image_url) || item.image_url}
                                        alt={item.name}
                                        loading="lazy"
                                        onClick={() => setDetailDish(item)}
                                        className="h-22 w-22 cursor-pointer rounded-xl object-cover shrink-0 border border-slate-100 dark:border-slate-800"
                                      />
                                    ) : (
                                      <div
                                        onClick={() => setDetailDish(item)}
                                        className="flex h-22 w-22 cursor-pointer items-center justify-center rounded-xl bg-brand-50 text-brand-700 shrink-0 dark:bg-slate-800 dark:text-slate-400"
                                      >
                                        <UtensilsCrossed className="h-6 w-6" />
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between gap-1">
                                        <DietaryBadge
                                          type={item.dietary_type}
                                        />
                                        {Number(item.avg_rating) > 0 && (
                                          <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                            <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                                            {Number(item.avg_rating).toFixed(1)}
                                          </span>
                                        )}
                                      </div>
                                      <h4
                                        onClick={() => setDetailDish(item)}
                                        className="mt-1.5 cursor-pointer text-sm font-extrabold text-slate-900 hover:text-accent-600 truncate dark:text-white"
                                      >
                                        {item.name}
                                      </h4>
                                      <p className="mt-0.5 text-sm font-extrabold text-brand-700 dark:text-accent-400">
                                        {formatINR(item.price)}
                                      </p>
                                      {item.description && (
                                        <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                                          {item.description}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                                    <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
                                      <span className="inline-flex items-center gap-1">
                                        <Clock className="h-3 w-3 text-accent-500" />
                                        ~{item.preparation_time}m
                                      </span>
                                      <span>•</span>
                                      {available ? (
                                        <span
                                          className={
                                            item.stock_quantity <= 5
                                              ? "font-bold text-amber-600"
                                              : "text-emerald-700 dark:text-emerald-400 font-semibold"
                                          }
                                        >
                                          Available ({item.stock_quantity} left)
                                        </span>
                                      ) : (
                                        <span className="rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-red-700 dark:bg-red-500/20 dark:text-red-300">
                                          Unavailable / Out of Stock
                                        </span>
                                      )}
                                    </div>

                                    {inCart ? (
                                      <div className="inline-flex items-center gap-2 rounded-xl border border-accent-200 bg-accent-50 px-2 py-1 dark:border-accent-500/30 dark:bg-accent-500/15">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateQty(
                                              item.id,
                                              inCart.quantity - 1
                                            )
                                          }
                                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-accent-700 shadow-2xs hover:bg-accent-100 dark:bg-slate-800 dark:text-accent-300"
                                        >
                                          <Minus className="h-3 w-3" />
                                        </button>
                                        <span className="w-5 text-center font-mono text-xs font-extrabold text-accent-900 dark:text-white">
                                          {inCart.quantity}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateQty(
                                              item.id,
                                              inCart.quantity + 1
                                            )
                                          }
                                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-accent-700 shadow-2xs hover:bg-accent-100 dark:bg-slate-800 dark:text-accent-300"
                                        >
                                          <Plus className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={!available}
                                        onClick={() =>
                                          handleAddItemToTray({
                                            id: item.id,
                                            canteenId: selectedEst.id,
                                            canteenName: selectedEst.name,
                                            name: item.name,
                                            price: Number(item.price),
                                            dietaryType: item.dietary_type,
                                            imageUrl: item.image_url,
                                          })
                                        }
                                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent-500 px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-accent-600 disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                                      >
                                        <Plus className="h-3.5 w-3.5" />
                                        {available
                                          ? "Add to Tray"
                                          : "Unavailable"}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Right 4 Columns: Sticky Tray & Server-Validated Checkout */}
              <div className="lg:col-span-4">
                <div className="sticky top-22 rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-soft space-y-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-400">
                        <ShoppingCart className="h-4 w-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                          Your Order Tray
                        </h2>
                        <span className="block text-[11px] text-slate-500">
                          {cartItemCount} item{cartItemCount === 1 ? "" : "s"}{" "}
                          selected
                        </span>
                      </div>
                    </div>
                    {cart.length > 0 && (
                      <button
                        type="button"
                        onClick={clearCart}
                        className="text-xs font-bold text-red-600 hover:underline"
                      >
                        Clear Tray
                      </button>
                    )}
                  </div>

                  {cart.length === 0 ? (
                    <div className="py-10 text-center space-y-2">
                      <ShoppingBag className="mx-auto h-8 w-8 text-slate-300" />
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Your tray is empty
                      </p>
                      <p className="text-xs text-slate-500">
                        Tap “Add to Tray” on any available dish to begin checkout.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-xl bg-brand-50/70 px-3 py-2 text-xs text-brand-900 border border-brand-200/70 dark:bg-brand-900/30 dark:border-brand-800 dark:text-brand-200">
                        Establishment:{" "}
                        <strong className="font-extrabold">
                          {cartCanteenName}
                        </strong>
                      </div>

                      <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto pr-1 dark:divide-slate-800">
                        {cart.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between py-2.5 text-xs gap-2"
                          >
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate dark:text-white">
                                {c.name}
                              </p>
                              <p className="text-slate-500">
                                {formatINR(c.price)} × {c.quantity} ={" "}
                                <strong className="text-slate-800 dark:text-slate-200">
                                  {formatINR(c.price * c.quantity)}
                                </strong>
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => updateQty(c.id, c.quantity - 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 dark:border-slate-700"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="w-5 text-center font-mono font-bold">
                                {c.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateQty(c.id, c.quantity + 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 dark:border-slate-700"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => updateQty(c.id, 0)}
                                className="ml-1 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-3 border-t border-slate-100 pt-3.5 text-xs dark:border-slate-800">
                        <div>
                          <label className="mb-1.5 block font-bold text-slate-700 dark:text-slate-300">
                            Payment Mode
                          </label>
                          <select
                            value={paymentMethod}
                            onChange={(e) =>
                              setPaymentMethod(
                                e.target.value as
                                  | "CASH"
                                  | "WALLET"
                                  | "RAZORPAY"
                              )
                            }
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-semibold text-slate-800 focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          >
                            <option value="WALLET">
                              CampusBite Wallet ({formatINR(walletBalance)})
                            </option>
                            <option value="CASH">Pay Cash at Counter</option>
                            <option value="RAZORPAY">
                              Razorpay Online Checkout
                            </option>
                          </select>
                        </div>

                        <div>
                          <label className="mb-1.5 block font-bold text-slate-700 dark:text-slate-300">
                            Cooking Notes (Optional)
                          </label>
                          <input
                            type="text"
                            value={specialInstructions}
                            onChange={(e) =>
                              setSpecialInstructions(e.target.value)
                            }
                            placeholder="e.g., Less spicy, extra chutney…"
                            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-slate-800 focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          />
                        </div>

                        <div className="rounded-xl bg-slate-50 p-3 space-y-1.5 text-slate-600 border border-slate-200/70 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-300">
                          <div className="flex justify-between">
                            <span>Item Subtotal</span>
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {formatINR(cartSubtotal)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>GST & Kitchen Charges (5%)</span>
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {formatINR(cartTax)}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-1.5 border-t border-slate-200 dark:border-slate-700 dark:text-white">
                            <span>Total Payable</span>
                            <span className="text-brand-700 dark:text-accent-400">
                              {formatINR(cartTotal)}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={placingOrder}
                          onClick={handleCheckout}
                          className="h-11 w-full rounded-xl bg-accent-500 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm shadow-accent-500/20 transition hover:bg-accent-600 disabled:opacity-50"
                        >
                          {placingOrder
                            ? "Confirming with Kitchen…"
                            : isGuest
                              ? `Sign In to Checkout • ${formatINR(cartTotal)}`
                              : `Place Order • ${formatINR(cartTotal)}`}
                        </button>
                        {isGuest && (
                          <p className="text-center text-[11px] text-slate-500">
                            Your guest tray is saved automatically. Sign in or create an account when ready to order.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: LIVE ORDER TRACKING & PICKUP TOKENS                        */}
        {/* ================================================================= */}
        {tab === "orders" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  Live Order Tracker & Pickup Tokens ({orders.length})
                </h1>
                <p className="text-xs text-slate-500">
                  Show your Pickup Token at the outlet counter when status turns READY FOR PICKUP
                </p>
              </div>
            </div>

            {orders.length === 0 ? (
              <div className="rounded-2xl border border-slate-200/80 bg-white p-14 text-center shadow-soft dark:border-slate-800 dark:bg-slate-900">
                <ShoppingBag className="mx-auto h-9 w-9 text-slate-300" />
                <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-white">
                  No orders placed yet
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Your live and historical campus orders will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map(
                  (o: {
                    id: string;
                    order_number: string;
                    canteen_id: string;
                    canteen_name_snapshot: string;
                    status: string;
                    subtotal: number;
                    tax_amount: number;
                    total_amount: number;
                    payment_method: string;
                    payment_status: string;
                    rejection_reason: string | null;
                    created_at: string;
                    items: Array<{
                      id: string;
                      menu_item_id: string;
                      item_name_snapshot: string;
                      unit_price_snapshot: number;
                      quantity: number;
                      line_total: number;
                    }>;
                  }) => {
                    const stepIndex = ORDER_STEPS.indexOf(o.status);
                    const pickupToken =
                      o.order_number.split("-").pop() || o.order_number;
                    return (
                      <div
                        key={o.id}
                        className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft space-y-4 dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5 dark:border-slate-800">
                          <div className="flex items-center gap-3.5">
                            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-accent-300 bg-accent-50 px-3.5 py-2 text-center dark:border-accent-500/40 dark:bg-accent-500/15">
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-accent-700 dark:text-accent-300">
                                <Ticket className="h-3 w-3" /> Pickup Token
                              </span>
                              <span className="font-mono text-xl font-extrabold tracking-wider text-slate-900 dark:text-white">
                                #{pickupToken}
                              </span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                                  {o.canteen_name_snapshot}
                                </span>
                                <span className="font-mono text-xs text-slate-400">
                                  ({o.order_number})
                                </span>
                              </div>
                              <p className="mt-0.5 text-[11px] font-semibold text-accent-700 dark:text-accent-400">
                                Show Token #{pickupToken} at the{" "}
                                {o.canteen_name_snapshot} outlet counter to
                                collect your order
                              </p>
                              <p className="text-[11px] text-slate-400">
                                Ordered on{" "}
                                {new Date(o.created_at).toLocaleString()} •{" "}
                                {o.payment_method} ({o.payment_status})
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-base font-extrabold text-brand-700 dark:text-accent-400">
                              {formatINR(o.total_amount)}
                            </span>
                            <span
                              className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${
                                o.status === "COMPLETED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : o.status === "REJECTED"
                                    ? "bg-red-100 text-red-700"
                                    : o.status === "READY"
                                      ? "bg-emerald-600 text-white shadow-xs"
                                      : "bg-accent-100 text-accent-800"
                              }`}
                            >
                              {o.status === "READY"
                                ? "READY FOR PICKUP"
                                : o.status}
                            </span>
                          </div>
                        </div>

                        {/* Live Step Progress Bar */}
                        {o.status !== "REJECTED" && o.status !== "CANCELLED" && (
                          <div className="grid grid-cols-5 gap-2 pt-1">
                            {ORDER_STEPS.map((st, idx) => {
                              const done = stepIndex >= idx;
                              return (
                                <div key={st} className="space-y-1">
                                  <div
                                    className={`h-2 rounded-full ${
                                      done
                                        ? "bg-accent-500"
                                        : "bg-slate-200 dark:bg-slate-800"
                                    }`}
                                  />
                                  <span
                                    className={`block text-[10px] font-bold ${
                                      done
                                        ? "text-accent-600 dark:text-accent-400"
                                        : "text-slate-400"
                                    }`}
                                  >
                                    {st}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {o.rejection_reason && (
                          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                            <strong>Kitchen Rejection Reason:</strong>{" "}
                            {o.rejection_reason}
                          </div>
                        )}

                        <div className="rounded-xl bg-slate-50 p-3.5 space-y-2 text-xs dark:bg-slate-800/50">
                          {(o.items ?? []).map((it) => (
                            <div
                              key={it.id}
                              className="flex flex-wrap items-center justify-between gap-2"
                            >
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {it.quantity} × {it.item_name_snapshot}{" "}
                                <span className="text-slate-400">
                                  (@{formatINR(it.unit_price_snapshot)})
                                </span>
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-slate-900 dark:text-white">
                                  {formatINR(it.line_total)}
                                </span>
                                {o.status === "COMPLETED" && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setReviewOrder({
                                        orderId: o.id,
                                        canteenId: o.canteen_id,
                                        menuItemId: it.menu_item_id,
                                        dishName: it.item_name_snapshot,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
                                  >
                                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                                    Rate Dish
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: CUSTOMER SPENDING ANALYTICS & MONTHLY BUDGET (SECTION 7)   */}
        {/* ================================================================= */}
        {tab === "spending" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Personal Spending Analytics & Monthly Dining Budget
                </h1>
                <p className="text-xs text-slate-500">
                  Calculated directly from your verified MySQL orders (excludes cancelled/refunded orders; never double-counts wallet top-ups)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setCustomStartDate("");
                    setCustomEndDate("");
                  }}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-slate-900"
                />
                <button
                  type="button"
                  onClick={handleExportSpendingCsv}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </button>
              </div>
            </div>

            {/* Custom Date Range Filter */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-xs shadow-soft dark:border-slate-800 dark:bg-slate-900">
              <span className="font-bold text-slate-700 dark:text-slate-300">
                Quick Period:
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth(
                    spending?.period?.currentMonth || nowMonth
                  );
                  setCustomStartDate("");
                  setCustomEndDate("");
                }}
                className={`rounded-xl px-3 py-1.5 font-bold ${
                  selectedMonth ===
                    (spending?.period?.currentMonth || nowMonth) &&
                  !customStartDate
                    ? "bg-brand-700 text-white"
                    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                Current Month
              </button>
              <button
                type="button"
                onClick={() => {
                  if (spending?.period?.previousMonth) {
                    setSelectedMonth(spending.period.previousMonth);
                    setCustomStartDate("");
                    setCustomEndDate("");
                  }
                }}
                className={`rounded-xl px-3 py-1.5 font-bold ${
                  selectedMonth === spending?.period?.previousMonth &&
                  !customStartDate
                    ? "bg-brand-700 text-white"
                    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                Previous Month
              </button>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="text-slate-500">Custom Range:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 px-2.5 dark:border-slate-700 dark:bg-slate-800"
                />
                <span>to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 px-2.5 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>

            {/* Spending Summary KPI Cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Selected Period Spend
                </span>
                <p className="mt-2 text-2xl font-extrabold text-brand-700 dark:text-accent-400">
                  {formatINR(spending?.summary?.selectedPeriodSpent ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Across {spending?.summary?.selectedPeriodOrders ?? 0} orders
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Current vs Previous Month
                </span>
                <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
                  {formatINR(spending?.summary?.currentMonthSpent ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Prev Month:{" "}
                  {formatINR(spending?.summary?.previousMonthSpent ?? 0)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Average Order Value
                </span>
                <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
                  {formatINR(spending?.summary?.avgOrderValue ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  All-Time Spend:{" "}
                  {formatINR(spending?.summary?.allTimeSpent ?? 0)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Refunds & Cancellations
                </span>
                <p className="mt-2 text-2xl font-extrabold text-emerald-600">
                  {formatINR(
                    spending?.summary?.refundedOrCancelledAmount ?? 0
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Excluded from net spending
                </p>
              </div>
            </div>

            {/* Monthly Budget Control & Progress Bar (Section 7.2 & 7.3) */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-soft lg:col-span-5 space-y-4 dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Monthly Spending Limit ({selectedMonth})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Configure informational budget alerts or optional spending restrictions
                  </p>
                </div>

                {/* Progress Card */}
                <div className="rounded-2xl bg-gradient-to-br from-brand-800 via-brand-700 to-slate-900 p-5 text-white space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/80">
                      Monthly Budget: {formatINR(budget?.monthlyLimit ?? 3000)}
                    </span>
                    <span className="rounded-full bg-accent-500 px-2.5 py-0.5 font-extrabold">
                      {budget?.consumedPct ?? 0}% Consumed
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-white/15">
                    <div
                      className={`h-full rounded-full transition-all ${
                        (budget?.consumedPct ?? 0) >= 100
                          ? "bg-red-500"
                          : (budget?.consumedPct ?? 0) >=
                              (budget?.alertThresholdPct ?? 75)
                            ? "bg-amber-400"
                            : "bg-emerald-400"
                      }`}
                      style={{
                        width: `${Math.min(100, budget?.consumedPct ?? 0)}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs font-semibold">
                    <span>Spent: {formatINR(budget?.spent ?? 0)}</span>
                    <span>Remaining: {formatINR(budget?.remaining ?? 0)}</span>
                  </div>
                </div>

                <form onSubmit={handleSaveBudget} className="space-y-3.5 text-xs">
                  <div>
                    <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                      Monthly Spending Limit (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={budgetLimitInput}
                      onChange={(e) => setBudgetLimitInput(e.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block font-bold text-slate-700 dark:text-slate-300">
                      Alert Threshold Percentage
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[50, 75, 90, 100].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setAlertThresholdInput(pct)}
                          className={`h-10 rounded-xl border font-extrabold transition ${
                            alertThresholdInput === pct
                              ? "border-accent-500 bg-accent-500 text-white"
                              : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 font-semibold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={budgetEnabledInput}
                      onChange={(e) => setBudgetEnabledInput(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-700"
                    />
                    Enable Monthly Budget Tracking & Alerts
                  </label>

                  <label className="flex items-start gap-2.5 font-semibold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={restrictSpendingInput}
                      onChange={(e) =>
                        setRestrictSpendingInput(e.target.checked)
                      }
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-accent-600"
                    />
                    <span>
                      Enable Optional Strict Spending Restriction
                      <span className="block text-[11px] font-normal text-slate-500">
                        When unchecked (default), budget limits are informational only and never block your orders.
                      </span>
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={savingBudget}
                    className="h-11 w-full rounded-xl bg-accent-500 font-bold text-white shadow-sm hover:bg-accent-600 disabled:opacity-50"
                  >
                    {savingBudget ? "Saving…" : "Save Monthly Budget Settings"}
                  </button>
                </form>
              </div>

              {/* Charts: Daily Trend & Outlet/Category Breakdown */}
              <div className="space-y-6 lg:col-span-7">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-soft space-y-4 dark:border-slate-800 dark:bg-slate-900">
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Daily Spending Trend ({selectedMonth})
                  </h2>
                  {(spending?.dailyBreakdown ?? []).length === 0 ? (
                    <p className="py-10 text-center text-xs text-slate-500">
                      No orders recorded in this period yet.
                    </p>
                  ) : (
                    <div className="h-52 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={spending?.dailyBreakdown}>
                          <XAxis dataKey="date" fontSize={11} />
                          <YAxis fontSize={11} />
                          <Tooltip />
                          <Line
                            type="monotone"
                            dataKey="amount"
                            stroke="#f97316"
                            strokeWidth={2.5}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft space-y-3 dark:border-slate-800 dark:bg-slate-900">
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      Spending by Establishment
                    </h3>
                    {(spending?.establishmentSpending ?? []).length === 0 ? (
                      <p className="py-8 text-center text-xs text-slate-500">
                        No establishment data yet.
                      </p>
                    ) : (
                      <div className="h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={spending?.establishmentSpending}>
                            <XAxis dataKey="name" fontSize={10} />
                            <YAxis fontSize={10} />
                            <Tooltip />
                            <Bar
                              dataKey="amount"
                              fill="#1e3a5f"
                              radius={[6, 6, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft space-y-3 dark:border-slate-800 dark:bg-slate-900">
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      Category-Wise Spending
                    </h3>
                    {(spending?.categorySpending ?? []).length === 0 ? (
                      <p className="py-8 text-center text-xs text-slate-500">
                        No category data yet.
                      </p>
                    ) : (
                      <div className="h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={spending?.categorySpending}>
                            <XAxis dataKey="name" fontSize={10} />
                            <YAxis fontSize={10} />
                            <Tooltip />
                            <Bar
                              dataKey="amount"
                              fill="#f97316"
                              radius={[6, 6, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Top Ordered Dishes, Payment Breakdown & Historical Budget Table */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft space-y-3 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Most Frequently Ordered Dishes
                </h3>
                {(spending?.topDishes ?? []).length === 0 ? (
                  <p className="py-6 text-xs text-slate-500">
                    No dish history in this period.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                    {spending.topDishes.map(
                      (d: {
                        menuItemId: string;
                        name: string;
                        totalQuantity: number;
                        totalSpent: number;
                      }) => (
                        <div
                          key={d.menuItemId}
                          className="flex items-center justify-between py-2.5"
                        >
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {d.name}
                          </span>
                          <span className="font-mono font-semibold text-brand-700 dark:text-accent-400">
                            {d.totalQuantity}× • {formatINR(d.totalSpent)}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft space-y-3 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Payment-Method Breakdown
                </h3>
                {(spending?.paymentMethodBreakdown ?? []).length === 0 ? (
                  <p className="py-6 text-xs text-slate-500">
                    No payments in this period.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                    {spending.paymentMethodBreakdown.map(
                      (pm: {
                        method: string;
                        orders: number;
                        amount: number;
                      }) => (
                        <div
                          key={pm.method}
                          className="flex items-center justify-between py-2.5"
                        >
                          <span className="font-bold">{pm.method}</span>
                          <span>
                            {pm.orders} orders •{" "}
                            <strong>{formatINR(pm.amount)}</strong>
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft space-y-3 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Monthly Budget History
                </h3>
                {(spending?.monthlyHistory ?? []).length === 0 ? (
                  <p className="py-6 text-xs text-slate-500">
                    No monthly history yet.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                    {spending.monthlyHistory.map(
                      (mh: {
                        monthYear: string;
                        spent: number;
                        budgetLimit: number;
                        consumedPct: number;
                      }) => (
                        <div
                          key={mh.monthYear}
                          className="flex items-center justify-between py-2.5"
                        >
                          <span className="font-mono font-bold">
                            {mh.monthYear}
                          </span>
                          <span>
                            {formatINR(mh.spent)} / {formatINR(mh.budgetLimit)}{" "}
                            ({mh.consumedPct}%)
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: DIGITAL WALLET & DOUBLE-ENTRY FINANCIAL LEDGER             */}
        {/* ================================================================= */}
        {tab === "wallet" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-soft space-y-5 lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="rounded-2xl bg-gradient-to-br from-brand-800 via-brand-700 to-slate-900 p-5 text-white space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-accent-300">
                    CampusBite Digital Wallet
                  </span>
                  <CreditCard className="h-4 w-4 text-white/70" />
                </div>
                <p className="text-3xl font-extrabold">
                  {formatINR(walletBalance)}
                </p>
                <p className="text-[11px] text-white/75">
                  Instant 1-click checkout & automated rejection refunds
                </p>
              </div>

              <form onSubmit={handleTopup} className="space-y-3 text-xs">
                <label className="block font-bold text-slate-700 dark:text-slate-300">
                  Top Up Wallet Balance (₹)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {["200", "500", "1000"].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setTopupAmount(amt)}
                      className={`h-10 rounded-xl border font-bold transition ${
                        topupAmount === amt
                          ? "border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300"
                          : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      }`}
                    >
                      +₹{amt}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min={1}
                  max={25000}
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-800"
                />
                <button
                  type="submit"
                  className="h-11 w-full rounded-xl bg-accent-500 font-bold text-white shadow-sm hover:bg-accent-600"
                >
                  Add Funds to Wallet
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-soft space-y-4 lg:col-span-8 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                Double-Entry Wallet Statement
              </h2>
              {(walletQuery.data?.ledger ?? []).length === 0 ? (
                <p className="py-12 text-center text-xs text-slate-500">
                  No wallet transactions recorded yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                  {walletQuery.data.ledger.map(
                    (l: {
                      id: string;
                      entry_type: string;
                      amount: number;
                      balance_after: number;
                      description: string;
                      created_at: string;
                    }) => (
                      <div
                        key={l.id}
                        className="flex items-center justify-between py-3"
                      >
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">
                            {l.description}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {new Date(l.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <span
                            className={`font-mono text-sm font-extrabold ${
                              l.entry_type === "DEBIT"
                                ? "text-red-600"
                                : "text-emerald-600"
                            }`}
                          >
                            {l.entry_type === "DEBIT" ? "-" : "+"}
                            {formatINR(l.amount)}
                          </span>
                          <p className="text-[11px] text-slate-400">
                            Closing: {formatINR(l.balance_after)}
                          </p>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 5: AI RECOMMENDATIONS & GROUNDED CONCIERGE (V1 LAYOUT)        */}
        {/* ================================================================= */}
        {tab === "ai" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left 7 Cols: Hybrid AI Food Recommendations */}
            <div className="space-y-4 lg:col-span-7">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-accent-500" />
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
                    AI Food Recommendation Engine
                  </h1>
                  <p className="text-xs text-slate-500">
                    Grounded in live available dishes across active CampusBite establishments
                  </p>
                </div>
              </div>

              {(aiRecsQuery.data ?? []).length === 0 ? (
                <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center shadow-soft dark:border-slate-800 dark:bg-slate-900">
                  <Sparkles className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm font-bold">
                    No active dishes to recommend yet
                  </p>
                  <p className="text-xs text-slate-500">
                    Once an establishment publishes dishes, AI recommendations will appear here.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {(aiRecsQuery.data ?? []).map((rec) => (
                    <div
                      key={rec.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <DietaryBadge type={rec.dietary_type} />
                          <span className="text-base font-extrabold text-brand-700 dark:text-accent-400">
                            {formatINR(rec.price)}
                          </span>
                        </div>
                        <h3 className="mt-2 text-base font-bold text-slate-900 dark:text-white">
                          {rec.name}
                        </h3>
                        <p className="text-xs font-semibold text-slate-500">
                          {rec.canteen_name} • ~{rec.preparation_time}m prep
                        </p>
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                        <span className="text-xs text-slate-500">
                          ★ {Number(rec.avg_rating || 5).toFixed(1)} rating
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            addToCart({
                              id: rec.id,
                              canteenId: rec.canteen_id,
                              canteenName: rec.canteen_name || "Campus Outlet",
                              name: rec.name,
                              price: Number(rec.price),
                              dietaryType: rec.dietary_type,
                              imageUrl: rec.image_url,
                            });
                            toast.success(`Added ${rec.name} to tray`);
                          }}
                          className="inline-flex h-9 items-center gap-1 rounded-xl bg-accent-500 px-3 text-xs font-bold text-white hover:bg-accent-600"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add to Tray
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right 5 Cols: CampusBite AI Chat Panel */}
            <div className="lg:col-span-5">
              <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lift dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2.5 border-b border-slate-200 bg-gradient-to-r from-brand-800 via-brand-700 to-slate-900 px-4 py-3.5 text-white">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                    <Bot className="h-5 w-5 text-accent-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold">
                      CampusBite AI Assistant
                    </h2>
                    <p className="text-[11px] text-white/75">
                      Live MySQL Menu & Order Status Grounding
                    </p>
                  </div>
                </div>

                <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
                  {[
                    "What should I eat today?",
                    "Where is my current order?",
                    "Show top available dishes",
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={(e) => void handleAskAi(e, q)}
                      className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                <div className="min-h-[260px] p-4 text-xs space-y-3">
                  {aiReply ? (
                    <div className="whitespace-pre-line rounded-2xl bg-slate-100 p-4 leading-relaxed text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                      {aiReply}
                    </div>
                  ) : (
                    <p className="py-12 text-center text-slate-400">
                      Ask CampusBite AI about live dish prices, preparation times, or your order status!
                    </p>
                  )}
                </div>

                <form
                  onSubmit={(e) => void handleAskAi(e)}
                  className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
                >
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Ask about available food or order status…"
                    className="h-11 flex-1 rounded-xl border border-slate-200 px-3.5 text-xs focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                  />
                  <button
                    type="submit"
                    disabled={aiLoading}
                    className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-accent-500 px-4 text-xs font-bold text-white hover:bg-accent-600 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 6: CUSTOMER ACCOUNT PROFILE & DIETARY PREFERENCES             */}
        {/* ================================================================= */}
        {tab === "profile" && (
          <div className="mx-auto max-w-3xl">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-soft space-y-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                    Customer Account & Dietary Preferences
                  </h2>
                  <p className="text-xs text-slate-500">
                    Orders placed with this account generate a unique Outlet Pickup Token Number for counter collection.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  <ShieldCheck className="h-3.5 w-3.5" /> Verified Customer
                </span>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                      Customer ID
                    </label>
                    <input
                      type="text"
                      disabled
                      value={user?.id || ""}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-slate-500 dark:border-slate-800 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                      Registered Email
                    </label>
                    <input
                      type="text"
                      disabled
                      value={user?.email || "Not linked"}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-500 dark:border-slate-800 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                      Mobile Number (Optional)
                    </label>
                    <input
                      type="text"
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      placeholder="Optional (+919876543210)"
                      className="h-11 w-full rounded-xl border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <div>
                    <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                      Primary Dietary Preference
                    </label>
                    <select
                      value={prefDiet}
                      onChange={(e) =>
                        setPrefDiet(
                          e.target.value as "VEG" | "NON_VEG" | "VEGAN" | "EGG"
                        )
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="VEG">Vegetarian</option>
                      <option value="NON_VEG">Non-Vegetarian</option>
                      <option value="VEGAN">Vegan</option>
                      <option value="EGG">Eggetarian</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                      Preferred Spice Level (1–5)
                    </label>
                    <select
                      value={prefSpice}
                      onChange={(e) => setPrefSpice(e.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="1">1 — Mild</option>
                      <option value="2">2 — Light Medium</option>
                      <option value="3">3 — Medium</option>
                      <option value="4">4 — Spicy</option>
                      <option value="5">5 — Extra Hot</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                      Food Allergies / Notes
                    </label>
                    <input
                      type="text"
                      value={prefAllergies}
                      onChange={(e) => setPrefAllergies(e.target.value)}
                      placeholder="e.g., Peanuts, Lactose"
                      className="h-11 w-full rounded-xl border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="h-11 rounded-xl bg-brand-700 px-6 font-bold text-white hover:bg-brand-800"
                >
                  Save Profile & Preferences
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (Matching CampusBite V1 StudentLayout) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden dark:border-slate-800 dark:bg-slate-900/95"
      >
        <div className="grid grid-cols-6 h-16">
          {navItems.map(({ id, shortLabel, icon: Icon, badge }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleSelectTab(id)}
              className={`relative flex flex-col items-center justify-center gap-1 text-[10px] font-bold transition ${
                tab === id
                  ? "text-accent-600 dark:text-accent-400"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{shortLabel}</span>
              {badge ? (
                <span className="absolute right-2 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[9px] font-extrabold text-white">
                  {badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </nav>

      {/* GUEST CHECKOUT / AUTHENTICATION PROMPT MODAL */}
      {authPromptModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-lift space-y-4 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setAuthPromptModal({ open: false, reason: "" })}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-sm">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <span className="inline-block rounded-md bg-accent-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-accent-700 dark:bg-accent-500/15 dark:text-accent-300">
                  Authentication Required to Order
                </span>
                <h3 className="mt-0.5 text-lg font-extrabold text-slate-900 dark:text-white">
                  Sign In or Register to Continue
                </h3>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {authPromptModal.reason}
            </p>

            {cart.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                <p className="font-bold">
                  ✓ Your Tray is Saved ({cartItemCount} item
                  {cartItemCount === 1 ? "" : "s"} • {formatINR(cartTotal)})
                </p>
                <p className="mt-0.5 text-[11px] opacity-90">
                  From <strong>{cartCanteenName}</strong>. You will be returned directly to checkout after signing in.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 pt-1">
              <Link
                to="/login/customer?redirect=checkout"
                onClick={() => setAuthPromptModal({ open: false, reason: "" })}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 text-xs font-extrabold text-white shadow-sm hover:bg-brand-800"
              >
                <LogIn className="h-4 w-4" />
                Sign In
              </Link>
              <Link
                to="/register/customer?redirect=checkout"
                onClick={() => setAuthPromptModal({ open: false, reason: "" })}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent-500 px-4 text-xs font-extrabold text-white shadow-sm hover:bg-accent-600"
              >
                <UserPlus className="h-4 w-4" />
                Create Account
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE / HEADER CART MODAL */}
      {mobileCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white p-6 shadow-lift space-y-4 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Your Order Tray ({cartItemCount})
              </h3>
              <button
                type="button"
                onClick={() => setMobileCartOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {cart.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                Your tray is empty. Browse campus outlets and add dishes!
              </p>
            ) : (
              <>
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto text-xs dark:divide-slate-800">
                  {cart.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between py-2.5"
                    >
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">
                          {c.name}
                        </p>
                        <p className="text-slate-500">
                          {formatINR(c.price)} × {c.quantity}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateQty(c.id, c.quantity - 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-5 text-center font-bold">
                          {c.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQty(c.id, c.quantity + 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm font-extrabold dark:border-slate-800">
                  <span>Total (incl. 5% GST)</span>
                  <span className="text-brand-700 dark:text-accent-400">
                    {formatINR(cartTotal)}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={placingOrder}
                  onClick={handleCheckout}
                  className="h-11 w-full rounded-xl bg-accent-500 text-xs font-extrabold text-white hover:bg-accent-600"
                >
                  {placingOrder
                    ? "Placing Order…"
                    : isGuest
                      ? `Sign In to Checkout • ${formatINR(cartTotal)}`
                      : `Confirm & Place Order • ${formatINR(cartTotal)}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* V1 CROSS-ESTABLISHMENT PRICE COMPARISON MODAL */}
      {compareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-lift space-y-4 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Compare Dish Prices Across Campus Establishments
              </h3>
              <button
                type="button"
                onClick={() => setCompareModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {["Sandwich", "Bowl", "Rice", "Coffee", "Paneer", "Dosa"].map(
                (kw) => (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => setCompareKeyword(kw)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                      compareKeyword === kw
                        ? "bg-brand-700 text-white"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {kw}
                  </button>
                )
              )}
            </div>

            <input
              type="search"
              value={compareKeyword}
              onChange={(e) => setCompareKeyword(e.target.value)}
              placeholder="Type dish keyword to compare prices…"
              className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-xs dark:border-slate-700 dark:bg-slate-800"
            />

            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto text-xs dark:divide-slate-800">
              {(compareMenuQuery.data ?? []).length === 0 ? (
                <p className="py-8 text-center text-slate-500">
                  No matching dishes found across active establishments.
                </p>
              ) : (
                (compareMenuQuery.data ?? []).map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-2.5"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {item.name}
                        </span>
                        {idx === 0 && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            Best Price
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500">
                        {item.canteen_name} • ~{item.preparation_time}m prep
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-extrabold text-brand-700 dark:text-accent-400">
                        {formatINR(item.price)}
                      </span>
                      <button
                        type="button"
                        disabled={
                          item.is_available !== 1 || item.stock_quantity <= 0
                        }
                        onClick={() =>
                          handleAddItemToTray({
                            id: item.id,
                            canteenId: item.canteen_id,
                            canteenName: item.canteen_name || "Campus Outlet",
                            name: item.name,
                            price: Number(item.price),
                            dietaryType: item.dietary_type,
                            imageUrl: item.image_url,
                          })
                        }
                        className="rounded-xl bg-accent-500 px-3 py-1.5 font-bold text-white hover:bg-accent-600 disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* V1 VOICE-ASSISTED ORDERING MODAL */}
      {voiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lift space-y-4 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Voice-Assisted Dish Search
              </h3>
              <button
                type="button"
                onClick={() => setVoiceModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Speak a dish name (e.g. “Paneer Bowl” or “Sandwich”) to filter the live menu.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={startVoiceSearch}
                className={`inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white ${
                  isListening ? "bg-red-600" : "bg-accent-500"
                }`}
              >
                {isListening ? (
                  <>
                    <MicOff className="h-4 w-4" /> Listening…
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" /> Speak Now
                  </>
                )}
              </button>
              <input
                type="text"
                value={voiceTranscript}
                onChange={(e) => {
                  setVoiceTranscript(e.target.value);
                  setMenuSearch(e.target.value);
                }}
                placeholder="Or type spoken phrase here…"
                className="h-11 flex-1 rounded-xl border border-slate-200 px-3 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setVoiceModalOpen(false)}
                className="h-10 rounded-xl bg-brand-700 px-4 text-xs font-bold text-white"
              >
                Apply Filter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISH DETAIL MODAL */}
      {detailDish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-lift space-y-4 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setDetailDish(null)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
            {detailDish.image_url && (
              <img
                src={resolveMediaUrl(detailDish.image_url) || detailDish.image_url}
                alt={detailDish.name}
                className="h-48 w-full rounded-xl object-cover"
              />
            )}
            <div className="flex items-center justify-between">
              <DietaryBadge type={detailDish.dietary_type} />
              <span className="text-lg font-extrabold text-brand-700 dark:text-accent-400">
                {formatINR(detailDish.price)}
              </span>
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                {detailDish.name}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {detailDish.description ||
                  "Prepared fresh to order by our campus kitchen team."}
              </p>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
              <span>Prep Time: ~{detailDish.preparation_time} mins</span>
              <span>Available Stock: {detailDish.stock_quantity}</span>
            </div>
            <button
              type="button"
              disabled={
                detailDish.is_available !== 1 || detailDish.stock_quantity <= 0
              }
              onClick={() => {
                if (selectedEst) {
                  handleAddItemToTray({
                    id: detailDish.id,
                    canteenId: selectedEst.id,
                    canteenName: selectedEst.name,
                    name: detailDish.name,
                    price: Number(detailDish.price),
                    dietaryType: detailDish.dietary_type,
                    imageUrl: detailDish.image_url,
                  });
                  setDetailDish(null);
                }
              }}
              className="h-11 w-full rounded-xl bg-accent-500 text-xs font-extrabold text-white hover:bg-accent-600 disabled:opacity-40"
            >
              Add to Order Tray • {formatINR(detailDish.price)}
            </button>
          </div>
        </div>
      )}

      {/* REVIEW MODAL */}
      {reviewOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lift space-y-4 dark:bg-slate-900">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              Rate “{reviewOrder.dishName}”
            </h3>
            <form onSubmit={handleSubmitReview} className="space-y-3 text-xs">
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewRating(star)}
                    className={`rounded-lg border px-3 py-1.5 font-bold ${
                      reviewRating >= star
                        ? "border-amber-400 bg-amber-50 text-amber-700"
                        : "border-slate-200 text-slate-400"
                    }`}
                  >
                    ★ {star}
                  </button>
                ))}
              </div>
              <textarea
                rows={3}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Share your feedback on taste, portion, and speed…"
                className="w-full rounded-xl border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-800"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReviewOrder(null)}
                  className="h-10 rounded-xl border border-slate-300 px-4 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-10 rounded-xl bg-accent-500 px-4 font-bold text-white"
                >
                  Submit Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
