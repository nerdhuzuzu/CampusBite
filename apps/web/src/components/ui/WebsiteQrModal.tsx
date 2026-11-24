import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Copy, ExternalLink, Printer, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button, Card, Input, Modal } from '@/components/ui';

interface WebsiteQrModalProps {
  open: boolean;
  onClose: () => void;
  outlets?: Array<{ id: string; name: string; qrToken?: string | null }>;
}

export function WebsiteQrModal({ open, onClose, outlets = [] }: WebsiteQrModalProps) {
  const [baseUrl, setBaseUrl] = useState(() => window.location.origin);

  const cleanBase = baseUrl.trim().replace(/\/+$/, '') || window.location.origin;
  const mainWebsiteUrl = `${cleanBase}/login/student`;

  const copyUrl = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Copied ${label} link!`);
    } catch {
      toast.error('Could not copy link');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="CampusBite Website & Outlet Redirect QR Codes"
      size="lg"
    >
      <div className="space-y-5">
        <div className="rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600 dark:bg-slate-800/70 dark:text-slate-300 space-y-2">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
            <Globe className="h-4 w-4 text-accent-500" />
            <span>Website Base URL (Customize for Mobile Wi-Fi / Deployed Domain)</span>
          </div>
          <p>
            Scanning these QR codes with any smartphone camera redirects students directly to the CampusBite website. If testing on a phone over the same Wi-Fi, replace <code>localhost</code> with your laptop’s Wi-Fi IP address:
          </p>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:5173 or https://campusbite.college.edu"
          />
        </div>

        {/* Main Website QR Card */}
        <Card className="p-5 border-accent-500/50 bg-gradient-to-br from-brand-800 via-brand-700 to-slate-900 text-white">
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <div className="rounded-2xl bg-white p-3.5 shadow-lg shrink-0">
              <QRCodeSVG value={mainWebsiteUrl} size={148} level="M" />
            </div>
            <div className="space-y-2 text-center sm:text-left">
              <Badge tone="accent">Main Campus Website QR</Badge>
              <h3 className="text-lg font-extrabold">
                Scan to Open CampusBite Website
              </h3>
              <p className="text-xs text-white/80">
                Place this QR at the campus entrance, notice boards, or hostel mess. Students scan it with their phone camera to open the CampusBite web app directly.
              </p>
              <p className="font-mono text-xs text-accent-300 break-all">
                {mainWebsiteUrl}
              </p>
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 pt-1">
                <Button
                  size="sm"
                  variant="accent"
                  leftIcon={<Copy className="h-3.5 w-3.5" />}
                  onClick={() => void copyUrl(mainWebsiteUrl, 'Website')}
                >
                  Copy Website URL
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Printer className="h-3.5 w-3.5" />}
                  onClick={() => window.print()}
                >
                  Print QR Poster
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Per-Outlet Direct Website Redirect QR Codes */}
        {outlets.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Direct Outlet Menu Redirect QR Codes ({outlets.length})
              </h4>
              <span className="text-xs text-slate-500">
                Redirects directly to each outlet’s menu on the website
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-h-64 overflow-y-auto pr-1">
              {outlets.map((o) => {
                const outletRedirectUrl = o.qrToken
                  ? `${cleanBase}/qr/${o.qrToken}`
                  : `${cleanBase}/student/menu?outletId=${o.id}`;
                return (
                  <div
                    key={o.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="rounded-lg bg-white p-1.5 border border-slate-100 shrink-0">
                      <QRCodeSVG value={outletRedirectUrl} size={64} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {o.name}
                      </p>
                      <p className="truncate font-mono text-[10px] text-slate-500">
                        {outletRedirectUrl}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void copyUrl(outletRedirectUrl, o.name)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-accent-600 hover:underline dark:text-accent-400"
                        >
                          <Copy className="h-3 w-3" /> Copy URL
                        </button>
                        <a
                          href={outletRedirectUrl}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300"
                        >
                          <ExternalLink className="h-3 w-3" /> Open
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function WebsiteQrButton({
  outlets,
  variant = 'outline',
}: {
  outlets?: Array<{ id: string; name: string; qrToken?: string | null }>;
  variant?: 'primary' | 'accent' | 'secondary' | 'outline' | 'ghost';
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size="sm"
        leftIcon={<QrCode className="h-4 w-4 text-accent-500" />}
        onClick={() => setOpen(true)}
      >
        Website QR Code
      </Button>
      <WebsiteQrModal open={open} onClose={() => setOpen(false)} outlets={outlets} />
    </>
  );
}
