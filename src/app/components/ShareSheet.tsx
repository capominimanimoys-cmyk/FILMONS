import { X, Copy, Code } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  /** Actual URL that gets copied and used in share links. */
  url:        string;
  /** Pretty display URL shown in the text box (e.g. without protocol). */
  displayUrl?: string;
  /** Sheet heading — e.g. "Share Portfolio", "Share Album", "Share Work". */
  heading?:   string;
  onClose:    () => void;
}

export function ShareSheet({ url, displayUrl, heading = 'Share Portfolio', onClose }: Props) {
  const shown   = displayUrl ?? url.replace(/^https?:\/\//, '');
  const enc     = encodeURIComponent(url);
  const encText = encodeURIComponent(heading);

  const embedCode = `<iframe src="${url}" width="100%" height="600" frameborder="0" allowfullscreen style="border:none;border-radius:16px"></iframe>`;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error('Could not copy — try manually');
    }
  };

  const open = (href: string) => window.open(href, '_blank', 'noopener,noreferrer');

  const SOCIALS = [
    { label: 'Messages',  emoji: '💬', action: () => open(`sms:?body=${enc}`) },
    { label: 'WhatsApp',  emoji: '🟢', action: () => open(`https://wa.me/?text=${enc}`) },
    { label: 'Facebook',  emoji: '🔵', action: () => open(`https://www.facebook.com/sharer/sharer.php?u=${enc}`) },
    { label: 'X',         emoji: '🐦', action: () => open(`https://x.com/intent/tweet?url=${enc}&text=${encText}`) },
    { label: 'LinkedIn',  emoji: '💼', action: () => open(`https://www.linkedin.com/sharing/share-offsite/?url=${enc}`) },
    { label: 'Copy Link', emoji: '🔗', action: () => copy(url, 'Link copied.') },
  ];

  return (
    <>
      <style>{`@keyframes ssUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div className="fixed inset-0 z-[80] bg-black/50" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[81] bg-white rounded-t-3xl flex flex-col"
        style={{
          animation: 'ssUp 0.28s cubic-bezier(0.32,0.72,0,1)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          maxHeight: '88vh',
        }}
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
              <button
                key={btn.label}
                onClick={btn.action}
                className="flex flex-col items-center gap-2 py-3.5 px-2 bg-gray-50 rounded-2xl hover:bg-gray-100 active:scale-95 transition-all"
              >
                <span className="text-2xl leading-none">{btn.emoji}</span>
                <span className="text-[10px] font-bold text-gray-600">{btn.label}</span>
              </button>
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
