// Desktop (lg: only) Tinder-style fanned card deck for Home. Deliberately
// separate from SwipeStack's gesture handling: navigation here is pure
// prev/next browsing (arrows, keyboard, click-a-background-card, or a drag
// that always resolves to next/previous) — never a like/pass/save side
// effect, per the spec's explicit "browsing, not like/dislike" requirement.
// SwipeStack itself is untouched and keeps serving <1024px.
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DeckItem } from './SwipeStack';
import { ListingSlideCard } from './ListingSlideCard';

const FAN_DEPTH = 5;

function fanStyle(stackPos: number): React.CSSProperties {
  if (stackPos === 0) return { transform: 'translate(0,0) scale(1) rotate(0deg)', zIndex: 50, transition: 'transform 300ms cubic-bezier(.2,.8,.2,1), opacity 300ms' };
  const tx = stackPos * 14;
  const ty = stackPos * 10;
  const scale = 1 - stackPos * 0.045;
  const rot = stackPos % 2 === 0 ? -1.5 * stackPos : 1.5 * stackPos;
  return {
    transform: `translate(${tx}px, ${ty}px) scale(${scale}) rotate(${rot}deg)`,
    zIndex: 50 - stackPos * 10,
    transition: 'transform 300ms cubic-bezier(.2,.8,.2,1), opacity 300ms',
  };
}

interface ListingCardStackProps {
  items: DeckItem[];
  idx: number;
  goNext: () => void;
  goPrev: () => void;
  goTo: (i: number) => void;
  isFirst: boolean;
  isLast: boolean;
}

export function ListingCardStack({ items, idx, goNext, goPrev, goTo, isFirst, isLast }: ListingCardStackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(0);
  const startX = useRef<number | null>(null);

  // Keyboard left/right — only while the stack is actually on screen (this
  // component only mounts at lg:, so no conflict with mobile SwipeStack).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  const cards = items.slice(idx, idx + FAN_DEPTH);
  if (cards.length === 0) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current == null) return;
    setDrag(e.clientX - startX.current);
  };
  const endDrag = () => {
    if (startX.current == null) return;
    if (drag < -80) goNext();
    else if (drag > 80) goPrev();
    setDrag(0);
    startX.current = null;
  };

  return (
    // isolate confines the deck's internal z-index scale (0-50, for the
    // card fan) to its own stacking context -- without it those values
    // compare directly against the page's sticky search bar (z-20) in the
    // shared root stacking context and win, so the deck painted in front
    // of the search bar while scrolling past it.
    <div className="flex items-center justify-center gap-6 w-full isolate">
      <button
        onClick={goPrev}
        disabled={isFirst}
        aria-label="Previous listing"
        className="w-11 h-11 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center shrink-0 hover:border-gray-300 disabled:opacity-30 disabled:cursor-default transition-all"
      >
        <ChevronLeft className="w-5 h-5 text-gray-600" />
      </button>

      <div
        ref={containerRef}
        className="relative w-full max-w-xl select-none"
        style={{ minHeight: 560 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {[...cards].reverse().map((item, rIdx) => {
          const stackPos = cards.length - 1 - rIdx;
          const isTop = stackPos === 0;
          const key = item.kind === 'listing' ? `l-${item.data.id}` : `c-${item.data.id}`;
          const style = isTop && drag !== 0
            ? { transform: `translateX(${drag}px) rotate(${drag * 0.02}deg)`, zIndex: 50, cursor: 'grabbing' as const }
            : fanStyle(stackPos);
          return (
            <div key={key} className="absolute inset-x-0 top-0" style={style}>
              {isTop ? (
                <ListingSlideCard item={item} />
              ) : (
                <div className="relative cursor-pointer" onClick={() => goTo(idx + stackPos)}>
                  <div className="absolute inset-0 z-10" />
                  <div className="pointer-events-none">
                    <ListingSlideCard item={item} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={goNext}
        disabled={isLast}
        aria-label="Next listing"
        className="w-11 h-11 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center shrink-0 hover:border-gray-300 disabled:opacity-30 disabled:cursor-default transition-all"
      >
        <ChevronRight className="w-5 h-5 text-gray-600" />
      </button>
    </div>
  );
}
