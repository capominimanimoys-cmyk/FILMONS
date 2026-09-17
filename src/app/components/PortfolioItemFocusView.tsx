// Full-screen "Portfolio Item Detail" focus view -- extracted out of
// PortfolioFeedCard.tsx so the new desktop Connect cards reuse the exact
// same item-detail view instead of a second implementation (per spec:
// "Click media/title -> Open Portfolio Item Detail", distinct from "View
// in Portfolio -> Open creator's full public Portfolio"). An immersive
// overlay, not a route: the underlying feed is never unmounted, so scroll
// position and the active tab/category are preserved automatically just by
// closing this. Hides the global TopBar/MobileBottomNav for the duration
// via the same 'filmons:home-bars-hidden' window event Home.tsx's own
// auto-hide-on-scroll already dispatches -- inert on desktop (no listener
// consequence there beyond nothing, since that chrome is mobile-only), so
// safe to reuse unconditionally.
import { useState, useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PortfolioMedia } from './PortfolioMedia';
import { PortfolioItem } from '../lib/portfolioApi';
import { logPortfolioInteraction } from '../lib/personalization';

export function PortfolioItemFocusView({ item, onClose }: { item: PortfolioItem; onClose: () => void }) {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const closedRef = useRef(false);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
    window.dispatchEvent(new CustomEvent('filmons:home-bars-hidden', { detail: { hidden: true } }));
    logPortfolioInteraction(user?.id, { category: item.category, subcategory: item.subcategory }, 'view');
    return () => { window.dispatchEvent(new CustomEvent('filmons:home-bars-hidden', { detail: { hidden: false } })); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    setShow(false);
    setTimeout(onClose, 320);
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black flex flex-col"
      style={{
        transform: show ? 'translateX(0)' : 'translateX(100%)',
        opacity: show ? 1 : 0,
        transition: show ? 'transform 350ms ease-out, opacity 350ms ease-out' : 'transform 280ms ease-in, opacity 280ms ease-in',
      }}
    >
      <div className="px-4 py-3 shrink-0" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <button
          onClick={close}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto flex items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-3">
          {/* Uncapped -- "the full original media can be shown when the
              user opens the Portfolio item detail" (the feed's own height
              cap is specifically about keeping the compact feed dense, not
              a constraint that should follow the media into its own
              detail view). */}
          <PortfolioMedia item={item} capHeight={false} />
          {item.title && <p className="text-sm font-bold text-white">{item.title}</p>}
          {item.description && <p className="text-sm text-white/70 leading-snug">{item.description}</p>}
        </div>
      </div>
    </div>
  );
}
