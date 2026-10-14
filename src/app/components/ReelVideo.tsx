// One reel video: poster + fitted blurred backdrop, buffering spinner, retry, blocked-autoplay play button,
// tap to pause/resume, thin progress bar. Only the active reel plays; pauses when the app is backgrounded.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';

export function ReelVideo({ src, poster, active, hasPlayer, preload, muted }: {
  src: string; poster?: string; active: boolean; hasPlayer: boolean;
  preload: 'auto' | 'metadata' | 'none'; muted: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const want = useRef(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const tryPlay = useCallback(() => {
    const v = ref.current;
    if (!v || !want.current) return;
    v.play().then(() => { setPlaying(true); setBlocked(false); }).catch(e => {
      if (e?.name === 'NotAllowedError') { setBlocked(true); setPlaying(false); }
    });
  }, []);

  useEffect(() => {
    const v = ref.current;
    want.current = active;
    if (!v) return;
    if (active) {
      setBlocked(false);
      if (v.readyState >= 3) tryPlay();
      else { v.addEventListener('canplay', tryPlay, { once: true }); if (v.preload !== 'auto') v.load(); }
    } else { v.pause(); setPlaying(false); }
    return () => v.removeEventListener('canplay', tryPlay);
  }, [active, hasPlayer, attempt, tryPlay]);

  useEffect(() => {
    const onVis = () => {
      const v = ref.current; if (!v) return;
      if (document.hidden) { v.pause(); setPlaying(false); } else if (active) tryPlay();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [active, tryPlay]);

  useEffect(() => () => { const v = ref.current; if (v) { v.pause(); v.removeAttribute('src'); v.load(); } }, []);
  useEffect(() => { if (!hasPlayer) { setReady(false); setPlaying(false); } }, [hasPlayer]);

  const toggle = () => {
    const v = ref.current; if (!v) return;
    if (playing) { want.current = false; v.pause(); setPlaying(false); } else { want.current = true; tryPlay(); }
  };

  return (
    <div className="absolute inset-0 bg-black overflow-hidden" onClick={toggle}>
      {/* Fitted background: a blurred, enlarged poster fills the bars around a horizontal video */}
      {poster && <img src={poster} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50" />}
      {poster && !(ready && playing) && <img src={poster} alt="" className="absolute inset-0 w-full h-full object-contain" />}
      {hasPlayer && !failed && (
        <video key={attempt} ref={ref} src={src} poster={poster} muted={muted} loop playsInline preload={preload}
          onCanPlay={() => setReady(true)} onWaiting={() => setReady(false)}
          onPlaying={() => { setReady(true); setPlaying(true); }}
          onTimeUpdate={e => { const v = e.currentTarget; if (bar.current && v.duration) bar.current.style.width = `${(v.currentTime / v.duration) * 100}%`; }}
          onError={() => { if (ref.current?.error) { setFailed(true); setPlaying(false); } }}
          className="relative w-full h-full object-contain" />
      )}
      {active && hasPlayer && !failed && !blocked && !ready && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}
      {active && failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40" onClick={e => e.stopPropagation()}>
          <p className="text-white text-sm">This video couldn't be played.</p>
          <button onClick={() => { setFailed(false); setReady(false); setAttempt(n => n + 1); }} className="px-5 py-2 rounded-full bg-white text-black text-sm font-semibold">Retry</button>
        </div>
      )}
      {!playing && !failed && (blocked || (ready && active)) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 bg-black/40 rounded-full flex items-center justify-center backdrop-blur-sm"><Play className="w-7 h-7 text-white fill-white ml-1" /></div>
        </div>
      )}
      <div className="absolute left-0 right-0 bottom-0 h-[3px] bg-white/20 pointer-events-none z-20">
        <div ref={bar} className="h-full bg-white" style={{ width: 0 }} />
      </div>
    </div>
  );
}
