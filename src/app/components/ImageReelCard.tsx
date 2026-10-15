// A picture (or a set of pictures) shown as a Reel: one full-screen image, or a swipeable carousel.
// Used for picture posts and portfolio pictures / albums. Pictures stay up until the user swipes.
import { useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, Share2, Bookmark, ArrowUpRight, ArrowLeft, Volume2, VolumeX, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { AccountTypeBadge } from './AccountTypeBadge';
import { Link2 } from 'lucide-react';
import { externalLinkLabel, normalizeExternalLink } from '../lib/externalLink';

/** The link attached to a portfolio work, as a small chip on a dark Reels slide. */
export function ReelLinkChip({ url }: { url?: string | null }) {
  const safe = normalizeExternalLink(url);
  if (!safe) return null;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer nofollow" onClick={e => e.stopPropagation()}
      className="pointer-events-auto mt-2 inline-flex items-center gap-1.5 max-w-full rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 px-2.5 py-1 text-xs font-semibold transition-colors">
      <Link2 className="w-3 h-3 shrink-0" />
      <span className="truncate">{externalLinkLabel(safe)}</span>
    </a>
  );
}

export interface ReelEngagement {
  liked: boolean; likes: number; comments: number; saved: boolean;
  onLike: () => void; onComment: () => void; onShare: () => void; onSave: () => void;
}

const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n);

export function ImageReelCard({
  images, active, near, source, title, caption, creator, engagement, viewLabel, onView, onProfile, onBack,
  audio, muted, onToggleMuted, link, extra,
}: {
  /** Caption / location / hashtags / mentions block supplied by the caller. */
  extra?: React.ReactNode;
  /** portfolio_items.external_link, when the creator attached one. */
  link?: string | null;
  images: string[]; active: boolean; near: boolean;
  source: 'Post' | 'Portfolio';
  title?: string; caption?: string;
  creator: { id: string; name: string; avatar?: string | null; accountType?: string | null };
  engagement: ReelEngagement;
  viewLabel: string; onView: () => void; onProfile: () => void; onBack: () => void;
  /** Music the creator added (posts). Plays while this reel is on screen and sound is on. */
  audio?: { url: string; start?: number };
  muted: boolean; onToggleMuted: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [dx, setDx] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const touch = useRef<{ x: number; y: number; dir: 'h' | 'v' | null; t: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const many = images.length > 1;

  useEffect(() => { if (!active) { setIdx(0); setDx(0); } }, [active]);

  // Music: only for the visible reel, only while sound is on.
  useEffect(() => {
    const a = audioRef.current; if (!a || !audio) return;
    if (active && !muted && !document.hidden) {
      if (audio.start) try { a.currentTime = audio.start; } catch { /* not seekable yet */ }
      a.play().catch(() => { /* blocked until the user taps */ });
    } else a.pause();
    return () => a.pause();
  }, [active, muted, audio?.url]);

  const go = (d: number) => setIdx(i => Math.max(0, Math.min(images.length - 1, i + d)));
  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dir: null, t: Date.now() }; };
  const onTouchMove = (e: React.TouchEvent) => {
    const t = touch.current; if (!t || !many) return;
    const mx = e.touches[0].clientX - t.x, my = e.touches[0].clientY - t.y;
    if (!t.dir && (Math.abs(mx) > 8 || Math.abs(my) > 8)) t.dir = Math.abs(mx) > Math.abs(my) ? 'h' : 'v';
    if (t.dir === 'h') setDx((idx === 0 && mx > 0) || (idx === images.length - 1 && mx < 0) ? mx * 0.3 : mx);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current; touch.current = null;
    if (!t) return;
    const mx = e.changedTouches[0].clientX - t.x, my = e.changedTouches[0].clientY - t.y;
    if (t.dir === 'h' && many) { if (Math.abs(mx) > 50) go(mx < 0 ? 1 : -1); setDx(0); return; }
    setDx(0);
    // A tap (no real movement) opens the original picture.
    if (Math.abs(mx) < 8 && Math.abs(my) < 8 && Date.now() - t.t < 400) setZoom(true);
  };

  const Count = ({ n }: { n: number }) => n > 0 ? <span className="text-white text-xs font-semibold drop-shadow">{fmt(n)}</span> : null;
  const text = (caption || '').trim();

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Slides (data-carousel lets the feed leave horizontal swipes to us) */}
      <div data-carousel className="absolute inset-0" onClick={() => { if (!('ontouchstart' in window)) setZoom(true); }} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
        <div className="flex h-full" style={{ width: `${images.length * 100}%`, transform: `translate3d(calc(-${idx * (100 / images.length)}% + ${dx}px), 0, 0)`, transition: dx ? 'none' : 'transform 280ms cubic-bezier(0.22,1,0.36,1)' }}>
          {images.map((src, i) => (
            <div key={i} className="relative h-full overflow-hidden" style={{ width: `${100 / images.length}%` }}>
              {near && Math.abs(i - idx) <= 1 ? (
                <>
                  {/* Soft blurred background so the full picture can be shown uncropped */}
                  <img src={src} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60" />
                  <img src={src} alt="" draggable={false} className="relative w-full h-full object-contain" loading={active ? 'eager' : 'lazy'} decoding="async" />
                </>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* Desktop arrows */}
      {many && idx > 0 && <button onClick={() => go(-1)} aria-label="Previous picture" className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white items-center justify-center z-10"><ChevronLeft className="w-5 h-5" /></button>}
      {many && idx < images.length - 1 && <button onClick={() => go(1)} aria-label="Next picture" className="hidden md:flex absolute right-16 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white items-center justify-center z-10"><ChevronRight className="w-5 h-5" /></button>}

      {/* Top bar: back, source label, counter, sound */}
      <div className="absolute top-0 left-0 right-0 flex items-center gap-2 p-4 bg-gradient-to-b from-black/50 to-transparent z-10 pointer-events-none">
        <button onClick={onBack} aria-label="Back" className="pointer-events-auto w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"><ArrowLeft className="w-5 h-5" /></button>
        <span className="px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-white text-[11px] font-bold tracking-wide">{source}</span>
        {many && <span className="px-2.5 py-1 rounded-full bg-black/40 text-white text-[11px] font-bold">{idx + 1}/{images.length}</span>}
        {audio && (
          <button onClick={onToggleMuted} aria-label={muted ? 'Turn music on' : 'Turn music off'} className="pointer-events-auto ml-auto w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white">
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        )}
      </div>
      {audio && <audio ref={audioRef} src={audio.url} loop preload="none" />}

      {/* Right actions */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 z-10">
        <div className="flex flex-col items-center gap-1">
          <button onClick={engagement.onLike} aria-label="Like" className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"><Heart className={`w-8 h-8 drop-shadow-lg ${engagement.liked ? 'fill-red-500 text-red-500' : 'text-white'}`} /></button>
          <Count n={engagement.likes} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <button onClick={engagement.onComment} aria-label="Comments" className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"><MessageCircle className="w-8 h-8 text-white drop-shadow-lg" /></button>
          <Count n={engagement.comments} />
        </div>
        <button onClick={engagement.onShare} aria-label="Share" className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"><Share2 className="w-7 h-7 text-white drop-shadow-lg" /></button>
        <button onClick={engagement.onSave} aria-label={engagement.saved ? 'Unsave' : 'Save'} className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"><Bookmark className={`w-7 h-7 drop-shadow-lg ${engagement.saved ? 'fill-white text-white' : 'text-white'}`} /></button>
      </div>

      {/* Bottom: dots, creator, caption / title, view button */}
      <div className="absolute left-0 right-0 bottom-0 px-4 pb-6 pt-24 pr-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10 pointer-events-none">
        {many && (
          <div className="flex gap-1.5 mb-3" aria-hidden>
            {images.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`} />)}
          </div>
        )}
        <button onClick={onProfile} className="pointer-events-auto flex items-center gap-2 max-w-full">
          {creator.avatar
            ? <img src={creator.avatar} alt="" className="w-9 h-9 rounded-full border border-white/50 object-cover" />
            : <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold">{creator.name?.[0]?.toUpperCase()}</div>}
          <span className="text-white font-semibold text-sm truncate drop-shadow">{creator.name}</span>
          <AccountTypeBadge type={creator.accountType ?? undefined} size="sm" />
        </button>
        {title && <p className="mt-2 text-white text-base font-bold leading-snug line-clamp-2 drop-shadow">{title}</p>}
        {text && (
          <p onClick={() => setExpanded(v => !v)} className={`pointer-events-auto mt-1 text-white/90 text-sm leading-snug whitespace-pre-line ${expanded ? '' : 'line-clamp-2'}`}>{text}</p>
        )}
        {extra && <div className="pointer-events-auto mt-1.5">{extra}</div>}
        <div><ReelLinkChip url={link} /></div>
        <button onClick={onView} className="pointer-events-auto mt-3 inline-flex items-center gap-1 px-4 py-2 rounded-full bg-white text-black text-sm font-bold active:scale-95 transition-transform">
          {viewLabel} <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>

      {zoom && <Lightbox images={images} start={idx} onClose={() => setZoom(false)} />}
    </div>
  );
}

/** Full-screen view of the original pictures. */
function Lightbox({ images, start, onClose }: { images: string[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const x0 = useRef<number | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI(v => Math.min(images.length - 1, v + 1)); if (e.key === 'ArrowLeft') setI(v => Math.max(0, v - 1)); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [images.length, onClose]);
  const stop = (e: React.SyntheticEvent): void => e.stopPropagation();
  return (
    <div className="fixed inset-0 z-[80] bg-black flex items-center justify-center" onClick={onClose}
      onTouchStart={e => { stop(e); x0.current = e.touches[0].clientX; }} onTouchMove={stop}
      onTouchEnd={e => { stop(e); if (x0.current == null) return; const d = e.changedTouches[0].clientX - x0.current; x0.current = null; if (Math.abs(d) > 50) setI(v => Math.max(0, Math.min(images.length - 1, v + (d < 0 ? 1 : -1)))); }}>
      <img src={images[i]} alt="" className="max-w-full max-h-full object-contain" onClick={stop} />
      <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center"><X className="w-5 h-5" /></button>
      {images.length > 1 && <span className="absolute top-5 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-black/50 text-white text-xs font-bold">{i + 1}/{images.length}</span>}
    </div>
  );
}
