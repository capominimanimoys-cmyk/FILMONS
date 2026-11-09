import { useEffect, useRef, useState } from 'react';

/** Muted looping preview for a listing whose cover is a video frame. Sits over the cover image (which is the poster),
 *  only loads/plays while the card is on screen, and does nothing for reduced-motion or data-saver users. */
export function CoverVideoPreview({ src, startAt = 0 }: { src: string; startAt?: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const vidRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const allowed = typeof window !== 'undefined'
    && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    && !(navigator as any).connection?.saveData;

  useEffect(() => {
    const el = boxRef.current;
    if (!allowed || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting && e.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, [allowed]);

  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;
    if (visible) v.play().catch(() => {}); else { v.pause(); setReady(false); }
  }, [visible]);

  if (!allowed || failed) return null;
  return (
    <div ref={boxRef} className="absolute inset-0 pointer-events-none">
      {visible && (
        <video ref={vidRef} src={`${src.split('#')[0]}#t=${startAt || 0.1}`} muted loop playsInline autoPlay preload="metadata"
          className={`w-full h-full object-cover transition-opacity duration-300 ${ready ? 'opacity-100' : 'opacity-0'}`}
          onLoadedMetadata={e => { if (startAt) e.currentTarget.currentTime = startAt; }}
          onPlaying={() => setReady(true)}
          onTimeUpdate={e => { const v = e.currentTarget; if (v.currentTime > startAt + 6) v.currentTime = startAt; }}
          onError={() => setFailed(true)} />
      )}
    </div>
  );
}
