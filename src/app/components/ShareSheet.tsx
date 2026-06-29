import { useState, type ReactNode } from 'react';
import { X, Copy, Code, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { CreatorCardSheet, type CreatorCardProps } from './CreatorCardSheet';

interface Props {
  url:          string;
  displayUrl?:  string;
  heading?:     string;
  onClose:      () => void;
  creatorCard?: CreatorCardProps;
}

// ── Social icon SVGs ──────────────────────────────────────────────────────────

function SocialButton({ label, color, icon, onClick }: {
  label: string; color: string;
  icon: ReactNode; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 py-3.5 px-2 rounded-2xl bg-gray-50 hover:bg-gray-100 active:scale-95 transition-all"
    >
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center"
        style={{ background: color }}
      >
        {icon}
      </div>
      <span className="text-[10px] font-bold text-gray-600 leading-none">{label}</span>
    </button>
  );
}

const IGIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="2" width="20" height="20" rx="5.5" fill="url(#ig)" />
    <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="2" />
    <circle cx="17.5" cy="6.5" r="1.2" fill="white" />
    <defs>
      <linearGradient id="ig" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#f09433" />
        <stop offset="25%" stopColor="#e6683c" />
        <stop offset="50%" stopColor="#dc2743" />
        <stop offset="75%" stopColor="#cc2366" />
        <stop offset="100%" stopColor="#bc1888" />
      </linearGradient>
    </defs>
  </svg>
);

const WAIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
    <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.659 1.438 5.168L2.05 21.8a.5.5 0 00.632.633l4.743-1.414A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.952 7.952 0 01-4.09-1.131l-.29-.174-3.006.897.86-2.942-.19-.3A7.965 7.965 0 014 12c0-4.418 3.582-8 8-8s8 3.582 8 8-3.582 8-8 8z" />
  </svg>
);

const FBIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zM17.084 19.77h1.833L7.084 4.126H5.117L17.084 19.77z" />
  </svg>
);

const LIIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const TKIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.29 6.29 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.83a8.23 8.23 0 004.84 1.55V6.93a4.85 4.85 0 01-1.07-.24z" />
  </svg>
);

const MsgIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
  </svg>
);

// ── Main component ────────────────────────────────────────────────────────────

export function ShareSheet({ url, displayUrl, heading = 'Share Portfolio', onClose, creatorCard }: Props) {
  const [showCreatorCard, setShowCreatorCard] = useState(false);

  const shown   = displayUrl ?? url.replace(/^https?:\/\//, '');
  const enc     = encodeURIComponent(url);
  const encText = encodeURIComponent(heading);

  const embedCode = `<iframe src="${url}" width="100%" height="600" frameborder="0" allowfullscreen style="border:none;border-radius:16px"></iframe>`;

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(label); }
    catch { toast.error('Could not copy — try manually'); }
  };

  const open = (href: string) => window.open(href, '_blank', 'noopener,noreferrer');

  const nativeShare = async () => {
    try {
      await navigator.share({ title: heading, url });
    } catch (e: any) {
      if (e?.name !== 'AbortError') copy(url, 'Link copied.');
    }
  };

  const SOCIALS: { label: string; color: string; icon: ReactNode; action: () => void }[] = [
    {
      label: 'Instagram', color: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)',
      icon: <IGIcon />,
      action: () => {
        // Instagram doesn't have a direct share URL — use Web Share API or copy
        if (navigator.share) nativeShare();
        else copy(url, 'Link copied — paste in Instagram!');
      },
    },
    {
      label: 'WhatsApp', color: '#25D366',
      icon: <WAIcon />,
      action: () => open(`https://wa.me/?text=${encText}%20${enc}`),
    },
    {
      label: 'Facebook', color: '#1877F2',
      icon: <FBIcon />,
      action: () => open(`https://www.facebook.com/sharer/sharer.php?u=${enc}`),
    },
    {
      label: 'X', color: '#000000',
      icon: <XIcon />,
      action: () => open(`https://x.com/intent/tweet?url=${enc}&text=${encText}`),
    },
    {
      label: 'LinkedIn', color: '#0A66C2',
      icon: <LIIcon />,
      action: () => open(`https://www.linkedin.com/sharing/share-offsite/?url=${enc}`),
    },
    {
      label: 'TikTok', color: 'linear-gradient(135deg,#010101,#010101)',
      icon: <TKIcon />,
      action: () => copy(url, 'Link copied — paste in TikTok bio!'),
    },
    {
      label: 'Messages', color: 'linear-gradient(135deg,#34d058,#0a84ff)',
      icon: <MsgIcon />,
      action: () => open(`sms:?body=${encText}%20${enc}`),
    },
    {
      label: 'Copy Link', color: '#6B7280',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
        </svg>
      ),
      action: () => copy(url, 'Link copied.'),
    },
    {
      label: 'More', color: '#9CA3AF',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
      ),
      action: nativeShare,
    },
  ];

  if (showCreatorCard && creatorCard) {
    return (
      <CreatorCardSheet
        {...creatorCard}
        shareUrl={url}
        displayUrl={displayUrl ?? url}
        onClose={() => setShowCreatorCard(false)}
      />
    );
  }

  return (
    <>
      <style>{`@keyframes ssUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div className="fixed inset-0 z-[80] bg-black/55" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[81] bg-white rounded-t-3xl flex flex-col"
        style={{ animation: 'ssUp 0.28s cubic-bezier(0.32,0.72,0,1)', paddingBottom: 'env(safe-area-inset-bottom)', maxHeight: '90vh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <h3 className="text-base font-black text-gray-900">{heading}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

          {/* Creator Card CTA */}
          {creatorCard && (
            <button
              onClick={() => setShowCreatorCard(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-gray-100 active:scale-[0.98] transition-all text-left"
              style={{ background: 'linear-gradient(135deg,#07091e 0%,#0f1040 50%,#07091e 100%)' }}
            >
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                <ImageIcon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white">Creator Card</p>
                <p className="text-xs text-white/45 mt-0.5">Generate a branded share image</p>
              </div>
              <span className="text-white/35 text-xl leading-none">›</span>
            </button>
          )}

          {/* URL bar */}
          <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Link</p>
              <p className="text-xs text-gray-700 font-mono truncate">{shown}</p>
            </div>
            <button
              onClick={() => copy(url, 'Link copied.')}
              className="shrink-0 flex items-center gap-1.5 bg-blue-600 text-white text-xs font-black px-3 py-2 rounded-xl active:scale-95 transition-all"
            >
              <Copy className="w-3 h-3" /> Copy
            </button>
          </div>

          {/* Social grid */}
          <div className="grid grid-cols-3 gap-2">
            {SOCIALS.map(btn => (
              <SocialButton key={btn.label} {...btn} />
            ))}
          </div>

          {/* Embed code */}
          <div className="bg-gray-900 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Code className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Embed Code</p>
              </div>
              <button
                onClick={() => copy(embedCode, 'Embed code copied.')}
                className="flex items-center gap-1 text-xs font-bold text-blue-400 active:scale-95 transition-all"
              >
                <Copy className="w-3 h-3" /> Copy
              </button>
            </div>
            <p className="text-[10px] text-gray-500 font-mono break-all leading-relaxed select-all">
              {embedCode}
            </p>
          </div>

        </div>
      </div>
    </>
  );
}
