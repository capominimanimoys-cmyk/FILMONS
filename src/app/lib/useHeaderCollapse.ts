import { useEffect, useRef, useState } from 'react';

/**
 * Collapse-on-scroll for sticky page headers.
 *
 * Attach `titleRef` to the top row of a sticky header and apply `style` to the
 * sticky wrapper: scrolling down slides the title row out of view (the tab bar
 * stays pinned), scrolling up brings it straight back. Uses a transform, so it
 * causes no layout shift and no scroll jitter.
 */
export function useHeaderCollapse(threshold = 60) {
  const titleRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const update = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      if (y <= 10) setCollapsed(false);
      else if (delta > 6 && y > threshold) setCollapsed(true);
      else if (delta < -6) setCollapsed(false);
      if (Math.abs(delta) > 6 || y <= 10) lastY = y;
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  const height = titleRef.current?.offsetHeight ?? 0;
  const style = {
    transform: collapsed && height ? `translateY(-${height}px)` : 'translateY(0)',
    transition: 'transform 220ms ease',
  } as const;

  return { titleRef, style, collapsed };
}
