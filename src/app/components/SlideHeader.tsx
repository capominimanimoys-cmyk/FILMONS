import { useEffect, useRef, useState, type ReactNode } from 'react';

// Wraps a Search header's content so it can slide fully out of view on
// scroll-down (useSearchChromeVisibility drives `visible`) without
// leaving an empty gap where it used to be. A plain `transform:
// translateY(-100%)` alone would slide it out VISUALLY but still occupy
// its normal-flow layout space (transforms don't affect layout) -- the
// outer div's `max-height`, animated from the content's own MEASURED
// height (ResizeObserver, since these headers are variable-height --
// search box, pill row, filter chips -- unlike TopBar.tsx's single fixed
// 56px it can just hardcode) down to 0, is what actually reclaims the
// space in sync with the inner slide.
export function SlideHeader({ visible, children }: { visible: boolean; children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!innerRef.current) return;
    const ro = new ResizeObserver(entries => setHeight(entries[0].contentRect.height));
    ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div style={{
      maxHeight: visible ? (height ?? undefined) : 0,
      overflow: 'hidden',
      transition: visible ? 'max-height 300ms cubic-bezier(.22,1,.36,1)' : 'max-height 280ms cubic-bezier(.22,1,.36,1)',
    }}>
      <div ref={innerRef} style={{
        transform: visible ? 'translateY(0)' : 'translateY(-100%)',
        opacity: visible ? 1 : 0,
        transition: visible
          ? 'transform 300ms cubic-bezier(.22,1,.36,1), opacity 240ms ease'
          : 'transform 280ms cubic-bezier(.22,1,.36,1), opacity 220ms ease',
      }}>
        {children}
      </div>
    </div>
  );
}
