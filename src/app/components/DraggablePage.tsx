// Generic draggable overlay page -- per the FILMONS "Draggable View
// Portfolio" spec (§22, "Build this as a reusable component... Do not
// hardcode this behavior directly into individual Portfolio cards").
//
// Unlike BottomSheet (single snap point, drag only dismisses) this supports
// N ordered snap points (heights, as a fraction of viewport height) with
// velocity-aware snapping between ALL of them, not just open/closed. It is
// a CONTROLLED component -- the caller owns `snapIndex` -- so a caller can
// programmatically jump to full screen (e.g. "tapped a grid item at 70%,
// expand to 100% first, then open the item" -- spec §9) instead of only
// reacting to gestures.
//
// Desktop (`lg:` and up) renders as a right-side drawer instead of a
// bottom sheet -- dragging a vertical sheet doesn't make sense with a mouse
// at that viewport, so desktop gets explicit expand/collapse controls
// instead of a drag handle (spec §19 asks for "Preview -> Expanded ->
// Closed", not literal cursor-dragging).
//
// Never unmounts the caller's background content -- this is purely an
// overlay portaled to document.body. The parent decides when to stop
// rendering <DraggablePage>; nothing here ever touches what's behind it
// (spec §12, "Background State -- CRITICAL").
import { useState, useRef, useEffect, useCallback, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface RenderState {
  snapIndex: number;
  isTop: boolean;     // at the highest snap point (full screen)
  isBottom: boolean;  // at the lowest non-closed snap point (preview)
}

export interface DraggablePageProps {
  /** Index into the sorted `snapPoints` array this page is currently at. */
  snapIndex: number;
  onSnapIndexChange: (index: number) => void;
  /** Fired when the user drags/taps below the lowest snap point. */
  onClose: () => void;
  /** Ascending fractions of viewport height, e.g. [0, 0.7, 1]. Index 0 is
   * always treated as "closed" and never actually rendered mid-drag. */
  snapPoints?: number[];
  expandOnTap?: boolean;
  dismissOnBackdrop?: boolean;
  /** The scrollable content element -- a downward drag only starts
   * dragging the page (rather than scrolling content) once this is
   * scrolled to the top. Spec §8. */
  scrollRef?: RefObject<HTMLElement | null>;
  header: (state: RenderState) => ReactNode;
  children: (state: RenderState) => ReactNode;
  zIndex?: number;
}

const SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';

export function DraggablePage({
  snapIndex, onSnapIndexChange, onClose,
  snapPoints = [0, 0.7, 1], expandOnTap = true, dismissOnBackdrop = true,
  scrollRef, header, children, zIndex = 75,
}: DraggablePageProps) {
  const sorted = [...snapPoints].sort((a, b) => a - b);
  const [show, setShow] = useState(false);
  const [dragPercent, setDragPercent] = useState<number | null>(null);

  const dragging = useRef(false);
  const movedFar = useRef(false);
  const startY = useRef(0);
  const startPercent = useRef(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const velocity = useRef(0);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
  }, []);

  const currentPercent = dragPercent ?? sorted[snapIndex] ?? sorted[1] ?? 0.7;
  const isTop = snapIndex === sorted.length - 1;
  const isBottom = snapIndex === 1 && sorted[0] === 0;

  const canStartDrag = () => !scrollRef?.current || scrollRef.current.scrollTop <= 0;

  const settle = useCallback((percent: number, vel: number) => {
    let nearest = sorted.reduce((best, p) => Math.abs(p - percent) < Math.abs(best - percent) ? p : best, sorted[0]);
    // A fast flick jumps one snap step in that direction even if the
    // release position is still closer to the point it started from.
    if (Math.abs(vel) > 0.45) {
      const dir = vel > 0 ? -1 : 1; // vel>0 == moving down == percent shrinking
      const idx = sorted.indexOf(nearest);
      const flicked = sorted[idx + dir];
      if (flicked !== undefined) nearest = flicked;
    }
    setDragPercent(null);
    const idx = sorted.indexOf(nearest);
    if (idx <= 0) { onClose(); return; }
    onSnapIndexChange(idx);
  }, [sorted, onClose, onSnapIndexChange]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canStartDrag()) return;
    dragging.current = true;
    movedFar.current = false;
    startY.current = e.clientY;
    lastY.current = e.clientY;
    lastT.current = performance.now();
    velocity.current = 0;
    startPercent.current = sorted[snapIndex] ?? 0.7;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const now = performance.now();
    const dt = Math.max(1, now - lastT.current);
    velocity.current = (e.clientY - lastY.current) / dt;
    lastY.current = e.clientY;
    lastT.current = now;
    const deltaY = e.clientY - startY.current;
    if (Math.abs(deltaY) > 6) movedFar.current = true;
    const deltaPercent = deltaY / window.innerHeight;
    setDragPercent(Math.min(1, Math.max(0, startPercent.current - deltaPercent)));
  };
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (!movedFar.current) { setDragPercent(null); return; } // tap, not drag -- let onClick handle it
    settle(dragPercent ?? startPercent.current, velocity.current);
  };

  const expand = () => onSnapIndexChange(sorted.length - 1);
  const stepDown = () => {
    const idx = snapIndex - 1;
    if (idx <= 0) onClose(); else onSnapIndexChange(idx);
  };

  const handleHeaderTap = () => {
    if (movedFar.current) return;
    if (expandOnTap && !isTop) expand();
  };

  const state: RenderState = { snapIndex, isTop, isBottom };
  const backdropOpacity = Math.min(1, currentPercent / (sorted[1] ?? 0.7)) * 0.5;

  return createPortal((
    <div className="fixed inset-0" style={{ zIndex }}>
      {/* Backdrop -- dims the still-visible, still-scrolled-to-its-own-
          position background. Tapping it always fully closes (spec §13),
          not a step-down, since it's only exposed at the preview height. */}
      <div
        className="absolute inset-0 bg-black"
        style={{ opacity: show ? backdropOpacity : 0, transition: dragging.current ? 'none' : `opacity 300ms ${SPRING}` }}
        onClick={dismissOnBackdrop ? onClose : undefined}
      />

      {/* Mobile: bottom sheet, vertical drag. */}
      <div
        className="lg:hidden absolute inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          height: `${(show ? currentPercent : 0) * 100}vh`,
          transition: dragging.current ? 'none' : `height 300ms ${SPRING}`,
        }}
      >
        <div
          className="pt-2.5 pb-1 shrink-0 touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={handleHeaderTap}
        >
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2" />
          {header(state)}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">{children(state)}</div>
      </div>

      {/* Desktop: right-side drawer, no drag -- tap header / explicit
          controls move between snap states (spec §19). */}
      <div
        className="hidden lg:flex absolute inset-y-0 right-0 bg-white shadow-2xl flex-col overflow-hidden"
        style={{
          width: isTop ? 'min(920px, 100%)' : '420px',
          transform: show ? 'translateX(0)' : 'translateX(100%)',
          transition: `transform 300ms ${SPRING}, width 300ms ${SPRING}`,
        }}
      >
        <div className="shrink-0 cursor-pointer" onClick={handleHeaderTap}>
          {header(state)}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">{children(state)}</div>
      </div>
    </div>
  ), document.body);
}

export { type RenderState as DraggablePageState };
