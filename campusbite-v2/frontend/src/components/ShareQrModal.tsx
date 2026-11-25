import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import {
  UtensilsCrossed,
  Copy,
  Check,
  Share2,
  Download,
  X,
  ExternalLink,
  Smartphone,
} from "lucide-react";
import toast from "react-hot-toast";

/**
 * Resolves the production public CampusBite URL for the Share QR code.
 * Never uses localhost for the QR code when VITE_PUBLIC_APP_URL is configured.
 */
export function resolvePublicV2Url(): string {
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL || "").trim();
  if (
    configured &&
    !configured.includes("localhost") &&
    !configured.includes("127.0.0.1")
  ) {
    return configured.replace(/\/+$/, "");
  }
  if (
    typeof window !== "undefined" &&
    window.location.origin &&
    !window.location.origin.includes("localhost") &&
    !window.location.origin.includes("127.0.0.1")
  ) {
    return window.location.origin;
  }
  return "https://campusbite-v2.vercel.app";
}

interface ShareQrModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShareQrModal({ isOpen, onClose }: ShareQrModalProps) {
  const [copied, setCopied] = useState(false);
  const qrWrapperRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const publicUrl = resolvePublicV2Url();

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(publicUrl);
      } else {
        const input = document.createElement("input");
        input.value = publicUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopied(true);
      toast.success("CampusBite link copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Could not copy link to clipboard.");
    }
  };

  const handleNativeShare = async () => {
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
      ) {
        await navigator.share({
          title: "CampusBite — Centralized Campus Food Ordering",
          text: "Explore CampusBite and order your favourite campus food!",
          url: publicUrl,
        });
        toast.success("Shared CampusBite!");
      } else {
        await handleCopyLink();
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        toast.error("Native share was unable to complete.");
      }
    }
  };

  const handleDownloadQrPng = () => {
    try {
      const sourceCanvas = qrWrapperRef.current?.querySelector("canvas");
      if (!sourceCanvas) {
        toast.error("QR canvas is not ready for download.");
        return;
      }

      const exportCanvas = document.createElement("canvas");
      const size = 600;
      const padding = 48;
      exportCanvas.width = size;
      exportCanvas.height = size;
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) {
        toast.error("Unable to initialize PNG export canvas.");
        return;
      }

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(
        sourceCanvas,
        padding,
        padding,
        size - padding * 2,
        size - padding * 2
      );

      const dataUrl = exportCanvas.toDataURL("image/png");
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = "campusbite-qr-code.png";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      toast.success("Downloaded CampusBite QR code (PNG)!");
    } catch {
      toast.error("Failed to download QR code image.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-campusbite-heading"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lift dark:border-slate-800 dark:bg-slate-900">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Share Modal"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Brand Logo & Heading */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-md">
            <UtensilsCrossed className="h-6 w-6" />
          </div>
          <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-accent-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-accent-700 border border-accent-200 dark:bg-accent-500/15 dark:text-accent-400 dark:border-accent-500/30">
            <Smartphone className="h-3 w-3" /> Mobile Instant Access
          </span>
          <h2
            id="share-campusbite-heading"
            className="mt-2 text-xl font-extrabold tracking-tight text-slate-900 dark:text-white"
          >
            Share CampusBite
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400 max-w-xs">
            Scan this QR code to explore CampusBite and order your favourite food.
          </p>
        </div>

        {/* High-Contrast White-Background Dynamic QR Code */}
        <div className="mt-5 flex flex-col items-center">
          <div
            ref={qrWrapperRef}
            className="rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-inner"
          >
            <QRCodeCanvas
              value={publicUrl}
              size={220}
              level="H"
              marginSize={2}
              bgColor="#FFFFFF"
              fgColor="#0E1C33"
            />
          </div>

          {/* Official Website URL Badge */}
          <div className="mt-4 flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
            <div className="truncate text-left">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Official CampusBite URL
              </span>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 truncate font-mono text-xs font-semibold text-slate-800 hover:text-accent-600 dark:text-slate-200"
              >
                {publicUrl}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </div>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 shadow-2xs transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                  Copy Link
                </>
              )}
            </button>
          </div>
        </div>

        {/* Primary Action Buttons: Native Share, Download QR Code, Close */}
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleNativeShare}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-800 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <Share2 className="h-4 w-4 text-accent-500" />
            Native Share
          </button>
          <button
            type="button"
            onClick={handleDownloadQrPng}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-brand-800"
          >
            <Download className="h-4 w-4" />
            Download QR Code
          </button>
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={onClose}
            className="h-10 w-full rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
