/**
 * RouteProgressBar — thin top progress line for route transitions.
 *
 * This is the lightweight alternative to the full-screen FilmonsLoader,
 * per spec: "Do not show the full-screen startup animation on every
 * route change." It's a brief momentum cue tied to navigation itself
 * (not to a specific page's data fetch, which each page already
 * indicates on its own via skeletons/spinners).
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

const RUN_MS = 500;

export function RouteProgressBar() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [full, setFull] = useState(false);
  const [fading, setFading] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }

    setFull(false);
    setFading(false);
    setVisible(true);
    const growTimer = setTimeout(() => setFull(true), 20);
    const fadeTimer = setTimeout(() => setFading(true), RUN_MS - 180);
    const hideTimer = setTimeout(() => setVisible(false), RUN_MS);
    return () => { clearTimeout(growTimer); clearTimeout(fadeTimer); clearTimeout(hideTimer); };
  }, [location.pathname]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[99998] h-[2px] bg-transparent pointer-events-none" aria-hidden="true">
      <div
        className="h-full bg-gray-900 motion-reduce:transition-none"
        style={{
          width: full ? '100%' : '0%',
          opacity: fading ? 0 : 1,
          transition: `width ${RUN_MS - 80}ms ease-out, opacity 180ms ease-in`,
        }}
      />
    </div>
  );
}
