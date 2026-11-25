import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  UtensilsCrossed,
  Mail,
  Lock,
  ShieldCheck,
  ChefHat,
  ArrowRight,
  KeyRound,
  CheckCircle2,
  Share2,
  Clock,
  Sparkles,
  Store,
  CreditCard,
  AlertCircle,
  Sun,
  Moon,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { apiV2 } from "@/lib/api";
import { useV2Store } from "@/stores/v2Store";
import { ShareQrModal } from "@/components/ShareQrModal";

type PortalRoleTab = "customer" | "manager" | "admin";

const PORTAL_HERO_CONFIG: Record<
  PortalRoleTab,
  {
    badge: string;
    gradient: string;
    accentText: string;
    icon: ReactNode;
    headline: string;
    highlights: Array<{ icon: ReactNode; text: string }>;
  }
> = {
  customer: {
    badge: "Customer Dining Portal",
    gradient: "from-brand-800 via-brand-700 to-slate-900",
    accentText: "text-accent-400",
    icon: <UtensilsCrossed className="h-6 w-6 text-white" />,
    headline:
      "Skip the counter queue. Order fresh campus meals in seconds.",
    highlights: [
      {
        icon: <Store className="h-4 w-4 text-accent-400" />,
        text: "Live multi-establishment menus, stock tracking & outlet pickup tokens",
      },
      {
        icon: <Sparkles className="h-4 w-4 text-accent-400" />,
        text: "AI-powered food recommendations, personal spending analytics & monthly budget limits",
      },
      {
        icon: <CreditCard className="h-4 w-4 text-accent-400" />,
        text: "Server-verified checkout, digital wallet ledger & real-time kitchen tracking",
      },
    ],
  },
  manager: {
    badge: "Outlet Operations Console",
    gradient: "from-ops-700 via-ops-600 to-slate-900",
    accentText: "text-emerald-300",
    icon: <ChefHat className="h-6 w-6 text-white" />,
    headline:
      "Real-time kitchen display, smart inventory & sales intelligence.",
    highlights: [
      {
        icon: <Clock className="h-4 w-4 text-emerald-300" />,
        text: "Live Socket.IO order stream, pickup token verification & one-tap kitchen updates",
      },
      {
        icon: <Sparkles className="h-4 w-4 text-emerald-300" />,
        text: "Persistent food photography, ingredient stock movements & low-stock alerts",
      },
      {
        icon: <ChefHat className="h-4 w-4 text-emerald-300" />,
        text: "Daily, weekly, monthly & category revenue analytics with downloadable CSV reports",
      },
    ],
  },
  admin: {
    badge: "Super Admin Command Center",
    gradient: "from-hq-700 via-hq-600 to-slate-900",
    accentText: "text-indigo-300",
    icon: <ShieldCheck className="h-6 w-6 text-white" />,
    headline:
      "Centralized governance across every campus food establishment.",
    highlights: [
      {
        icon: <ShieldCheck className="h-4 w-4 text-indigo-300" />,
        text: "Role-based access control, establishment lifecycle control & manager assignments",
      },
      {
        icon: <Sparkles className="h-4 w-4 text-indigo-300" />,
        text: "Cross-establishment revenue comparisons, customer retention & financial telemetry",
      },
      {
        icon: <Clock className="h-4 w-4 text-indigo-300" />,
        text: "Tamper-evident security audit logs, Gmail SMTP diagnostics & CSV reporting",
      },
    ],
  },
};

function AuthShell({
  title,
  subtitle,
  activeTab,
  showShareButton = false,
  onOpenShare,
  children,
}: {
  roleBadge?: string;
  title: string;
  subtitle: string;
  activeTab: PortalRoleTab;
  showShareButton?: boolean;
  onOpenShare?: () => void;
  children: React.ReactNode;
}) {
  const { theme, toggleTheme } = useV2Store();
  const cfg = PORTAL_HERO_CONFIG[activeTab];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row">
      {/* Left CampusBite V1 Gradient Hero Panel */}
      <aside
        className={`relative hidden lg:flex lg:w-5/12 xl:w-1/2 flex-col justify-between p-12 text-white bg-gradient-to-br overflow-hidden ${cfg.gradient}`}
      >
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md border border-white/15">
            {cfg.icon}
          </div>
          <div>
            <span className="text-lg font-extrabold tracking-tight">
              CampusBite
            </span>
            <span className="block text-xs text-white/75">{cfg.badge}</span>
          </div>
        </div>

        <div className="relative z-10 my-auto max-w-lg">
          <span
            className={`inline-block text-xs font-bold uppercase tracking-widest mb-3 ${cfg.accentText}`}
          >
            Centralized Campus Canteen System
          </span>
          <h1 className="text-3xl xl:text-4xl font-extrabold leading-tight tracking-tight">
            {cfg.headline}
          </h1>
          <div className="mt-8 space-y-4">
            {cfg.highlights.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 rounded-xl bg-white/5 p-3.5 backdrop-blur-sm border border-white/10"
              >
                <div className="mt-0.5">{item.icon}</div>
                <p className="text-sm text-white/90">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-white/60">
          <span>Campus Establishments • Live Kitchen Sync</span>
          <span>RBAC & HTTP-Only JWT Protected</span>
        </div>
      </aside>

      {/* Right Authentication Form Panel */}
      <div className="flex flex-1 flex-col justify-between p-4 sm:p-8 lg:p-12">
        {/* Top bar */}
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 lg:hidden">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl text-white ${
                activeTab === "manager"
                  ? "bg-ops-600"
                  : activeTab === "admin"
                    ? "bg-hq-600"
                    : "bg-brand-700"
              }`}
            >
              {cfg.icon}
            </div>
            <div>
              <span className="font-extrabold text-slate-900 dark:text-white">
                CampusBite
              </span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                {cfg.badge}
              </span>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Link
              to="/"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              title="Browse Public Campus Menus"
            >
              <Store className="h-3.5 w-3.5 text-accent-500" />
              <span>Browse Menus</span>
            </Link>

            {showShareButton && onOpenShare && (
              <button
                type="button"
                onClick={onOpenShare}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-accent-200 bg-accent-50 px-3.5 text-xs font-bold text-accent-700 shadow-2xs transition hover:bg-accent-100 dark:border-accent-500/30 dark:bg-accent-500/15 dark:text-accent-300"
                title="Share CampusBite via QR Code"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Share</span>
              </button>
            )}

            <nav
              aria-label="Portal Role Switcher"
              className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold shadow-2xs dark:border-slate-800 dark:bg-slate-900"
            >
              <Link
                to="/login/customer"
                className={`rounded-lg px-2.5 py-1.5 transition ${
                  activeTab === "customer"
                    ? "bg-brand-700 text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                Customer
              </Link>
              <Link
                to="/login/manager"
                className={`rounded-lg px-2.5 py-1.5 transition ${
                  activeTab === "manager"
                    ? "bg-ops-600 text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                Manager
              </Link>
              <Link
                to="/login/admin"
                className={`rounded-lg px-2.5 py-1.5 transition ${
                  activeTab === "admin"
                    ? "bg-hq-600 text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                Admin
              </Link>
            </nav>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          </div>
        </header>

        {/* Main Card Container */}
        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="mx-auto my-8 w-full max-w-md"
        >
          <div className="mb-6">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {title}
            </h2>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            {children}
          </div>
        </motion.main>

        <footer className="text-center text-xs text-slate-400">
          CampusBite Centralized Canteen Platform • Protected by Role-Based Access Control
        </footer>
      </div>
    </div>
  );
}

// ── 1. Customer Login Page (Email + Password, Forgot Password via Gmail OTP, Share QR Modal) ──
export function CustomerLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = searchParams.get("redirect") || "/customer/dashboard";
  const setSession = useV2Store((s) => s.setSession);
  const cartCount = useV2Store((s) =>
    s.cart.reduce((sum, item) => sum + item.quantity, 0)
  );
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // Password Recovery Modal State
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetOtpSent, setResetOtpSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiV2.post("/auth/customer/login", {
        identifier,
        password,
      });
      setSession(res.data.data.user, res.data.data.token);
      toast.success(
        cartCount > 0
          ? `Welcome back! Your tray (${cartCount} item${cartCount === 1 ? "" : "s"}) is ready for checkout.`
          : "Welcome back to CampusBite!"
      );
      navigate(
        redirectTarget === "checkout"
          ? "/customer/dashboard?checkout=1"
          : redirectTarget.startsWith("/")
            ? redirectTarget
            : "/customer/dashboard"
      );
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Customer sign-in failed.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSendResetOtp = async () => {
    if (!resetEmail.trim()) {
      toast.error("Enter your registered Gmail / Email address.");
      return;
    }
    setResetLoading(true);
    setResetError(null);
    try {
      const res = await apiV2.post("/auth/customer/send-otp", {
        channel: "EMAIL",
        target: resetEmail.trim(),
        purpose: "RESET_PASSWORD",
      });
      setResetOtpSent(true);
      toast.success(
        res.data.message || "Password reset code sent to your email."
      );
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Failed to send password reset code.";
      setResetError(msg);
      toast.error(msg);
    } finally {
      setResetLoading(false);
    }
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setResetError(null);
    try {
      const res = await apiV2.post("/auth/customer/reset-password", {
        target: resetEmail.trim(),
        otp: resetOtp.trim(),
        newPassword: resetNewPassword,
      });
      toast.success(res.data.message || "Password reset! You may now sign in.");
      setResetModalOpen(false);
      setIdentifier(resetEmail.trim());
      setResetOtp("");
      setResetNewPassword("");
      setResetOtpSent(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Password reset failed.";
      setResetError(msg);
      toast.error(msg);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <>
      <AuthShell
        activeTab="customer"
        title="Customer Sign In"
        subtitle="Sign in with your verified Gmail or email address and password."
        showShareButton={true}
        onOpenShare={() => setShareModalOpen(true)}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="email"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="yourname@gmail.com"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15 focus:outline-none transition dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setResetEmail(identifier);
                  setResetError(null);
                  setResetModalOpen(true);
                }}
                className="text-xs font-bold text-accent-600 hover:underline dark:text-accent-400"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15 focus:outline-none transition dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent-500 text-sm font-bold text-white shadow-sm shadow-accent-500/20 transition hover:bg-accent-600 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign In to CampusBite"}
            <ArrowRight className="h-4 w-4" />
          </button>

          <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800">
            <span>New to CampusBite?</span>
            <Link
              to={
                searchParams.get("redirect")
                  ? `/register/customer?redirect=${encodeURIComponent(
                      searchParams.get("redirect")!
                    )}`
                  : "/register/customer"
              }
              className="font-bold text-accent-600 hover:text-accent-700 hover:underline dark:text-accent-400"
            >
              Create Customer Account →
            </Link>
          </div>
        </form>
      </AuthShell>

      {/* QR Code exists ONLY inside this modal when triggered by the Share button */}
      <ShareQrModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
      />

      {/* Password Recovery via Gmail OTP Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-lift space-y-4 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setResetModalOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>

            <div>
              <span className="inline-block rounded-md bg-accent-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-700 dark:bg-accent-500/15 dark:text-accent-400">
                Gmail OTP Recovery
              </span>
              <h3 className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">
                Reset Customer Password
              </h3>
              <p className="text-xs text-slate-500">
                Receive a 6-digit verification code via Gmail SMTP to set a new password.
              </p>
            </div>

            {resetError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                {resetError}
              </div>
            )}

            <form
              onSubmit={handleConfirmResetPassword}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                  Registered Email Address
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="yourname@gmail.com"
                    className="h-11 flex-1 rounded-xl border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
                  />
                  <button
                    type="button"
                    disabled={resetLoading}
                    onClick={handleSendResetOtp}
                    className="rounded-xl bg-brand-700 px-3.5 font-bold text-white hover:bg-brand-800 disabled:opacity-50"
                  >
                    {resetOtpSent ? "Resend OTP" : "Send Email OTP"}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                  6-Digit Email Verification Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={resetOtp}
                  onChange={(e) =>
                    setResetOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="Enter 6-digit code"
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 font-mono tracking-widest dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700 dark:text-slate-300">
                  New Password (min 8 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetModalOpen(false)}
                  className="h-10 rounded-xl border border-slate-300 px-4 font-bold dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="h-10 rounded-xl bg-accent-500 px-4 font-bold text-white hover:bg-accent-600 disabled:opacity-50"
                >
                  Reset Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ── 2. Customer Registration (Gmail / Email-Only OTP — Mobile SMS Disabled) ──
export function CustomerRegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = searchParams.get("redirect") || "/customer/dashboard";
  const setSession = useV2Store((s) => s.setSession);
  const cartCount = useV2Store((s) =>
    s.cart.reduce((sum, item) => sum + item.quantity, 0)
  );

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [providerInfo, setProviderInfo] = useState<{
    providerName?: string;
    deliveryStatus?: string;
    expiryMinutes?: number;
  } | null>(null);
  const [deliveryErrorBanner, setDeliveryErrorBanner] = useState<{
    message: string;
    setupGuidance?: string;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setInterval(() => {
      setCooldownSec((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSec]);

  const targetEmail = email.trim();

  const handleSendOtp = async () => {
    if (!targetEmail) {
      toast.error("Enter your Gmail / Email address first.");
      return;
    }

    setSendingOtp(true);
    setDeliveryErrorBanner(null);

    try {
      const res = await apiV2.post("/auth/customer/send-otp", {
        channel: "EMAIL",
        target: targetEmail,
        purpose: "SIGNUP",
      });
      const data = res.data.data;
      setOtpSent(true);
      setOtpVerified(false);
      setCooldownSec(Number(data?.resendCooldownSeconds || 30));
      setProviderInfo({
        providerName: data?.providerName,
        deliveryStatus: data?.deliveryStatus,
        expiryMinutes: data?.expiryMinutes || 5,
      });
      toast.success(
        res.data.message || `Verification code sent to ${targetEmail}!`
      );
    } catch (err: unknown) {
      const errData = (
        err as {
          response?: {
            data?: { error?: string; setupGuidance?: string };
          };
        }
      )?.response?.data;
      const msg = errData?.error || "Could not send verification Email OTP.";
      setOtpSent(false);
      setDeliveryErrorBanner({
        message: msg,
        setupGuidance: errData?.setupGuidance,
      });
      toast.error(msg);
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.trim().length !== 6) {
      toast.error("Enter the 6-digit verification code from your email.");
      return;
    }
    setVerifyingOtp(true);
    try {
      await apiV2.post("/auth/customer/verify-otp", {
        target: targetEmail,
        otp: otp.trim(),
        purpose: "SIGNUP",
      });
      setOtpVerified(true);
      toast.success("Email OTP verified! Set your password to complete signup.");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Invalid OTP code.";
      setOtpVerified(false);
      toast.error(msg);
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (otp.trim().length !== 6) {
      toast.error("Please enter your 6-digit Email OTP verification code.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiV2.post("/auth/customer/register", {
        fullName,
        channel: "EMAIL",
        email: targetEmail,
        otp: otp.trim(),
        password,
        confirmPassword,
      });
      setSession(res.data.data.user, res.data.data.token);
      toast.success(
        cartCount > 0
          ? `Account created! Your tray (${cartCount} item${cartCount === 1 ? "" : "s"}) is preserved for checkout.`
          : "Welcome to CampusBite!"
      );
      navigate(
        redirectTarget === "checkout"
          ? "/customer/dashboard?checkout=1"
          : redirectTarget.startsWith("/")
            ? redirectTarget
            : "/customer/dashboard"
      );
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Customer registration failed.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      activeTab="customer"
      title="Create Customer Account"
      subtitle="Verify your Gmail or email address with a one-time 6-digit security code."
    >
      {/* Active Verification Banner */}
      <div className="mb-5 flex items-center gap-2 rounded-xl border border-accent-200/80 bg-accent-50/70 px-3.5 py-2.5 text-xs font-semibold text-accent-900 dark:border-accent-500/30 dark:bg-accent-500/10 dark:text-accent-300">
        <Mail className="h-4 w-4 shrink-0 text-accent-600 dark:text-accent-400" />
        <span>
          Gmail / Email OTP Verification (5-minute validity • One-time use)
        </span>
      </div>

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
            Full Name
          </label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Aarav Mehta"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
            Gmail / Email Address
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setOtpVerified(false);
              }}
              placeholder="yourname@gmail.com"
              className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="button"
              disabled={sendingOtp || cooldownSec > 0}
              onClick={handleSendOtp}
              className="h-11 shrink-0 rounded-xl bg-brand-700 px-3.5 text-xs font-bold text-white transition hover:bg-brand-800 disabled:opacity-50"
            >
              {sendingOtp
                ? "Sending…"
                : cooldownSec > 0
                  ? `Resend (${cooldownSec}s)`
                  : otpSent
                    ? "Resend OTP"
                    : "Send Email OTP"}
            </button>
          </div>
        </div>

        {/* Genuine Provider Delivery Error Banner (Never shows fake success) */}
        {deliveryErrorBanner && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-red-900">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>Email OTP Delivery Error</span>
            </div>
            <p className="leading-relaxed">{deliveryErrorBanner.message}</p>
            {deliveryErrorBanner.setupGuidance && (
              <p className="font-mono text-[11px] text-red-700 bg-red-100/70 rounded px-2 py-1">
                {deliveryErrorBanner.setupGuidance}
              </p>
            )}
          </div>
        )}

        {/* Provider Acceptance Confirmation Banner */}
        {otpSent && providerInfo && !deliveryErrorBanner && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              Accepted by {providerInfo.providerName}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
              <Clock className="h-3 w-3" /> Expires in{" "}
              {providerInfo.expiryMinutes || 5} mins
            </span>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
            6-Digit Email Verification OTP
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <KeyRound className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                required
                maxLength={6}
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="Enter 6-digit OTP"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 font-mono text-sm tracking-widest text-slate-900 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <button
              type="button"
              disabled={verifyingOtp || otp.trim().length !== 6}
              onClick={handleVerifyOtp}
              className={`inline-flex h-11 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-bold transition ${
                otpVerified
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              } disabled:opacity-50`}
            >
              <CheckCircle2
                className={`h-4 w-4 ${
                  otpVerified ? "text-emerald-600" : "text-slate-400"
                }`}
              />
              {verifyingOtp
                ? "Checking…"
                : otpVerified
                  ? "Verified"
                  : "Verify Code"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
              Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
              Confirm Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent-500 text-sm font-bold text-white shadow-sm shadow-accent-500/20 transition hover:bg-accent-600 disabled:opacity-50"
        >
          {loading
            ? "Creating Customer Account…"
            : "Verify & Create Customer Account"}
          <ArrowRight className="h-4 w-4" />
        </button>

        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
          <span>Already have a customer account?</span>
          <Link
            to={
              searchParams.get("redirect")
                ? `/login/customer?redirect=${encodeURIComponent(
                    searchParams.get("redirect")!
                  )}`
                : "/login/customer"
            }
            className="font-bold text-slate-900 hover:text-accent-600 hover:underline dark:text-white"
          >
            Customer Sign In →
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}

// ── 3. Canteen Manager Login (Teal/Emerald Ops Identity) ────────────────────
export function ManagerLoginPage() {
  const navigate = useNavigate();
  const setSession = useV2Store((s) => s.setSession);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiV2.post("/auth/manager/login", {
        identifier,
        password,
      });
      setSession(res.data.data.user, res.data.data.token);
      toast.success(`Signed in to ${res.data.data.user.canteenName}`);
      navigate("/manager/dashboard");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Manager authentication failed.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      activeTab="manager"
      title="Canteen Manager Sign In"
      subtitle="Authenticate with your manager email or mobile number assigned by the platform administrator."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
            Manager Email or Mobile Number
          </label>
          <div className="relative">
            <ChefHat className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="manager@establishment.com"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 text-sm text-slate-900 focus:border-ops-600 focus:ring-4 focus:ring-ops-500/15 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 text-sm text-slate-900 focus:border-ops-600 focus:ring-4 focus:ring-ops-500/15 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ops-600 text-sm font-bold text-white shadow-sm transition hover:bg-ops-700 disabled:opacity-50"
        >
          {loading ? "Opening Console…" : "Launch Outlet Operations Console"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </AuthShell>
  );
}

// ── 4. Administrator Login (Indigo/Violet HQ Identity) ──────────────────────
export function AdminLoginPage() {
  const navigate = useNavigate();
  const setSession = useV2Store((s) => s.setSession);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiV2.post("/auth/admin/login", {
        identifier,
        password,
      });
      setSession(res.data.data.user, res.data.data.token);
      toast.success("Authenticated as Platform Administrator");
      navigate("/admin/dashboard");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Administrator login failed.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      activeTab="admin"
      title="Administrator Sign In"
      subtitle="Restricted to authorized platform administrators provisioned via environment bootstrap."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
            Administrator Email
          </label>
          <div className="relative">
            <ShieldCheck className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
            <input
              type="email"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="admin@campusbite.com"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 text-sm text-slate-900 focus:border-hq-600 focus:ring-4 focus:ring-hq-500/15 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 text-sm text-slate-900 focus:border-hq-600 focus:ring-4 focus:ring-hq-500/15 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-hq-600 text-sm font-bold text-white shadow-sm transition hover:bg-hq-700 disabled:opacity-50"
        >
          {loading ? "Authenticating…" : "Sign In to Super Admin HQ"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </AuthShell>
  );
}
