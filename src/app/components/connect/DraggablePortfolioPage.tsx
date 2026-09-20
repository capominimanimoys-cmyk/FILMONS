// FILMONS "View Portfolio" draggable presentation -- mounts the SAME
// <Portfolio/> component /portfolio itself renders (see Portfolio.tsx's
// overrideUserId/initialAlbumId/embedded/onTabChange props), never a
// separate implementation.
//
// Mobile gets the full sequenced preview -> full-page transition (see
// MobilePortfolioTransition below): a 70%-height preview that expands into
// the actual /portfolio route, with the sheet's own growth animated
// BEFORE the route activates and the temporary preview chrome fades out
// -- not everything competing for attention at once, per the "sequence
// the transition" correction. Desktop keeps the simpler drawer built
// earlier (no literal cursor-dragging there, per that spec's own
// reasoning) -- this pass is explicitly mobile-scoped.
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { createPortal } from 'react-dom';
import { Maximize2 } from 'lucide-react';
import { DraggablePage } from '../DraggablePage';
import { Portfolio, type TabType } from '../../pages/Portfolio';

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isDesktop;
}

export function DraggablePortfolioPage(props: { creatorId: string; initialAlbumId?: string; onClose: () => void }) {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopPortfolioDrawer {...props} /> : <MobilePortfolioTransition {...props} />;
}

// ── Desktop: unchanged simple drawer (preview/expanded/closed via
// tap/buttons, no cursor-dragging) -- see DraggablePage's own header
// comment for why desktop doesn't get literal drag physics. ────────────
function DesktopPortfolioDrawer({ creatorId, initialAlbumId, onClose }: { creatorId: string; initialAlbumId?: string; onClose: () => void }) {
  const [snapIndex, setSnapIndex] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.history.pushState({ filmonsPortfolioOverlay: true }, '');
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line

  const handleClose = useCallback(() => {
    if (window.history.state?.filmonsPortfolioOverlay) window.history.back();
    else onClose();
  }, [onClose]);

  return (
    <DraggablePage
      snapIndex={snapIndex}
      onSnapIndexChange={setSnapIndex}
      onClose={handleClose}
      snapPoints={[0, 0.7, 1]}
      scrollRef={scrollRef}
      header={({ isTop }) => (
        <div className="flex items-center justify-between px-3 py-2">
          <p className="text-sm font-bold text-gray-900">Portfolio</p>
          <button onClick={() => setSnapIndex(isTop ? 1 : 2)} className="text-xs font-bold text-blue-600">
            {isTop ? 'Preview' : 'Expand'}
          </button>
        </div>
      )}
    >
      {({ isTop }) => (
        <div ref={scrollRef} className="overflow-y-auto h-full">
          <Portfolio overrideUserId={creatorId} initialAlbumId={initialAlbumId} embedded countsAsFullView={isTop} />
        </div>
      )}
    </DraggablePage>
  );
}

// ── Mobile: sequenced preview -> full-page transition ───────────────────
const HEADER_H = 56;                    // matches TopBar.tsx's own fixed height
const PREVIEW_TOP_VH = 30;              // leaves ~70% height visible
const SPRING = 'cubic-bezier(0.22, 0.8, 0.22, 1)';
const EXPAND_MS = 460;                  // Stage 1 -- sheet to top (spec: 420-500ms)
const SETTLE_MS = 280;                  // corner-radius / content padding
const HANDOFF_MS = 780;                 // total budget before the real routed page takes over

type Phase = 'preview' | 'dragging' | 'expanding' | 'settling' | 'full';

function MobilePortfolioTransition({ creatorId, initialAlbumId, onClose }: { creatorId: string; initialAlbumId?: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('preview');
  const [show, setShow] = useState(false);
  const [dragTopVh, setDragTopVh] = useState<number | null>(null); // live value while dragging, vh units
  const scrollRef = useRef<HTMLDivElement>(null);
  const isExpandingRef = useRef(false);
  const lastTabRef = useRef<TabType>('all');
  const reducedMotion = useRef(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const dragging = useRef(false);
  const movedFar = useRef(false);
  const startY = useRef(0);
  const startTopVh = useRef(PREVIEW_TOP_VH);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
  }, []);

  // One pushed history entry for the whole thing -- expandPortfolioToFullPage
  // below REPLACES it (not pushes another) when activating /portfolio, so
  // Back from full-page lands directly on whatever opened this (spec §12),
  // never back through the 70% preview.
  useEffect(() => {
    window.history.pushState({ filmonsPortfolioOverlay: true }, '');
    // Always closes this overlay on a real back navigation -- by the time
    // "full" is reached this component unmounts itself within ~40ms
    // anyway (see the HANDOFF_MS timer below), so there's no meaningful
    // window where the user is looking at the real routed page through
    // this popstate listener's back-compat path.
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line

  const handleClose = useCallback(() => {
    if (window.history.state?.filmonsPortfolioOverlay) window.history.back();
    else onClose();
  }, [onClose]);

  // The ONE function both "Open page" and drag-to-top call -- per spec §14,
  // there must be exactly one path through this sequence, not two.
  const expandPortfolioToFullPage = useCallback(() => {
    if (isExpandingRef.current || phase === 'full') return;
    isExpandingRef.current = true;

    const url = `/portfolio/${creatorId}`;
    if (reducedMotion.current) {
      setPhase('full');
      navigate(url, { replace: true, state: { initialTab: lastTabRef.current } });
      window.setTimeout(onClose, 50);
      return;
    }

    setDragTopVh(null);
    setPhase('expanding'); // Stage 1: sheet animates to just below the real header; backdrop fades; corners relax.

    window.setTimeout(() => {
      setPhase('settling'); // Stage 2: temporary preview header fades out, content spacing settles.
      // Activate the real route -- replace (not push) keeps this a single
      // history step from wherever "View Portfolio" was opened, and seeds
      // the category the user had selected so it doesn't reset to "All".
      navigate(url, { replace: true, state: { initialTab: lastTabRef.current } });
    }, EXPAND_MS);

    window.setTimeout(() => {
      setPhase('full');
    }, EXPAND_MS + SETTLE_MS);

    // Hand off to the real routed /portfolio page once it's had time to
    // mount and load -- this overlay unmounts, revealing it underneath.
    // Time-based rather than a readiness callback (the routed page has no
    // "ready" signal to hook into today) but by this point it's had the
    // whole expand+settle window plus a buffer to fetch the same data
    // this overlay already fetched moments earlier, so in practice it's
    // already rendered by the time the swap happens.
    window.setTimeout(() => { onClose(); }, HANDOFF_MS);
  }, [phase, creatorId, navigate, onClose]);

  const canStartDrag = () => !scrollRef.current || scrollRef.current.scrollTop <= 0;

  const onPointerDown = (e: React.PointerEvent) => {
    if (phase === 'expanding' || phase === 'settling' || phase === 'full') return;
    if (!canStartDrag()) return;
    dragging.current = true;
    movedFar.current = false;
    startY.current = e.clientY;
    startTopVh.current = dragTopVh ?? PREVIEW_TOP_VH;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const deltaY = e.clientY - startY.current;
    if (Math.abs(deltaY) > 6) { movedFar.current = true; setPhase('dragging'); }
    const deltaVh = (deltaY / window.innerHeight) * 100;
    const headerVh = (HEADER_H / window.innerHeight) * 100;
    setDragTopVh(Math.min(100, Math.max(headerVh, startTopVh.current + deltaVh)));
  };
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (!movedFar.current) { setDragTopVh(null); return; } // tap, not drag

    const headerVh = (HEADER_H / window.innerHeight) * 100;
    const current = dragTopVh ?? PREVIEW_TOP_VH;
    // Within ~16px of the top boundary commits to full-page, per spec §3.
    const commitThresholdVh = headerVh + (16 / window.innerHeight) * 100;
    if (current <= commitThresholdVh) {
      expandPortfolioToFullPage();
      return;
    }
    // Dragged down past the preview position -- dismiss; otherwise snap
    // back to the 70% preview.
    if (current > PREVIEW_TOP_VH + 15) { setDragTopVh(null); handleClose(); return; }
    setPhase('preview');
    setDragTopVh(null);
  };

  const topVh = phase === 'dragging' && dragTopVh != null
    ? dragTopVh
    : (phase === 'expanding' || phase === 'settling' || phase === 'full')
      ? (HEADER_H / window.innerHeight) * 100
      : PREVIEW_TOP_VH;

  const isSettledOrFull = phase === 'settling' || phase === 'full';
  const showTempHeader = phase === 'preview' || phase === 'dragging' || phase === 'expanding';
  const cornerRadius = isSettledOrFull ? 0 : 24;
  const backdropOpacity = phase === 'dragging'
    ? Math.max(0, Math.min(0.5, ((PREVIEW_TOP_VH - topVh) / PREVIEW_TOP_VH) * -0.5 + 0.5))
    : (phase === 'preview' ? 0.5 : 0);

  return createPortal((
    <div className="fixed inset-0 z-[75] lg:hidden">
      <div
        className="absolute inset-0 bg-black"
        style={{ opacity: show ? backdropOpacity : 0, transition: dragging.current ? 'none' : `opacity 250ms ${SPRING}` }}
        onClick={phase === 'preview' ? handleClose : undefined}
      />
      <div
        className="absolute inset-x-0 bottom-0 bg-white shadow-2xl overflow-hidden flex flex-col"
        style={{
          top: show ? `${topVh}vh` : '100vh',
          borderTopLeftRadius: cornerRadius, borderTopRightRadius: cornerRadius,
          transition: dragging.current
            ? 'none'
            : `top ${EXPAND_MS}ms ${SPRING}, border-radius ${SETTLE_MS}ms ease-out`,
        }}
      >
        {/* Temporary preview header -- drag handle + "Portfolio"/creator
            name + "Open page". Fades out (never abruptly removed) as the
            sheet settles into full-page position; the real Portfolio
            page's OWN header (avatar/name/tabs, part of Portfolio.tsx
            itself) is unaffected -- this is only the extra chrome unique
            to the preview. */}
        <div
          className="shrink-0 overflow-hidden touch-none"
          style={{
            maxHeight: showTempHeader ? 96 : 0,
            opacity: showTempHeader ? 1 : 0,
            transition: `opacity 180ms ease-out, max-height ${SETTLE_MS}ms ease-out`,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="pt-2.5 pb-1 cursor-grab active:cursor-grabbing">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2" />
            <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100">
              <div>
                <p className="text-lg font-bold text-gray-900">Portfolio</p>
                <PortfolioPreviewCreatorName creatorId={creatorId} />
              </div>
              <button
                onClick={e => { e.stopPropagation(); expandPortfolioToFullPage(); }}
                onPointerDown={e => e.stopPropagation()}
                className="h-11 rounded-xl bg-blue-50 px-3 text-sm font-semibold text-blue-600 flex items-center gap-1.5 shrink-0"
              >
                Open page <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto"
          style={{ paddingTop: isSettledOrFull ? 0 : undefined, transition: `padding-top ${SETTLE_MS}ms ease` }}
        >
          <Portfolio
            overrideUserId={creatorId}
            initialAlbumId={initialAlbumId}
            embedded
            countsAsFullView={isSettledOrFull}
            onTabChange={tab => { lastTabRef.current = tab; }}
          />
        </div>
      </div>
    </div>
  ), document.body);
}

// Tiny standalone fetch just for the preview header's creator-name line --
// not a second Portfolio data layer, just the one field this temporary
// chrome needs before the real embedded Portfolio (which has the full
// profile) has necessarily rendered its own header yet.
function PortfolioPreviewCreatorName({ creatorId }: { creatorId: string }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    import('../../lib/api').then(({ authApi }) => authApi.getUserById(creatorId)).then(u => {
      if (!cancelled) setName(u?.name ?? null);
    });
    return () => { cancelled = true; };
  }, [creatorId]);
  return <p className="text-xs text-gray-400 mt-0.5">{name ?? ' '}</p>;
}
