/**
 * Filmons — AudioFeedCard
 * SoundCloud-inspired feed card for standalone audio posts.
 * Layout: square cover → title/artist strip → waveform player.
 * Self-contained audio element; obeys global __filmons_audio singleton.
 */
import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Music2, ExternalLink } from 'lucide-react';

interface Props {
  audioSrc:    string;
  audioTitle:  string;
  audioArtist: string;
  coverUrl?:   string;
  onNavigate?: () => void;
}

// 52-bar deterministic waveform — same shape every render, no layout shift
const BARS = Array.from({ length: 52 }, (_, i) => ({
  h: 16 + Math.sin(i * 0.68) * 11 + Math.cos(i * 1.4) * 7 + (i % 4 === 0 ? 7 : 0),
}));

function fmt(s: number) {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

export function AudioFeedCard({ audioSrc, audioTitle, audioArtist, coverUrl, onNavigate }: Props) {
  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [curTime,  setCurTime]  = useState(0);
  const [duration, setDuration] = useState(0);
  const [imgErr,   setImgErr]   = useState(false);

  // Latch the first non-empty coverUrl so it never disappears mid-render
  const stableCover = useRef<string | undefined>(undefined);
  if (coverUrl && !stableCover.current) stableCover.current = coverUrl;
  const displayCover = stableCover.current;

  // Create the audio element once per real src — guard against empty string
  useEffect(() => {
    if (!audioSrc) return;
    // If we already have an element for this exact src, don't recreate
    if ((audioRef.current as any)?._src === audioSrc) return;

    audioRef.current?.pause();
    const a = new Audio(audioSrc);
    (a as any)._src = audioSrc;
    a.preload = 'metadata';
    a.onloadedmetadata = () => setDuration(a.duration || 0);
    a.ontimeupdate = () => {
      setCurTime(a.currentTime);
      setProgress(a.duration ? (a.currentTime / a.duration) * 100 : 0);
    };
    a.onended = () => { setPlaying(false); setProgress(0); setCurTime(0); };
    audioRef.current = a;

    return () => {
      a.pause();
      const w = window as any;
      if (w.__filmons_audio === a) w.__filmons_audio = null;
    };
  }, [audioSrc]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      const w = window as any;
      if (w.__filmons_audio && w.__filmons_audio !== a) w.__filmons_audio.pause();
      w.__filmons_audio = a;
      a.play().catch(() => {});
      setPlaying(true);
    }
  };

  const seekOnBar = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const a = audioRef.current;
    if (!a?.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - rect.left) / rect.width) * a.duration;
  };

  const showCover = !!displayCover && !imgErr;

  return (
    <>
      <style>{`
        @keyframes afc-pulse {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1);   }
        }
      `}</style>

      {/* ── Cover image ────────────────────────────────────────────── */}
      <div
        className="relative w-full cursor-pointer select-none"
        style={{ aspectRatio: '1 / 1', background: '#111827' }}
        onClick={onNavigate}
      >
        {showCover ? (
          <img
            src={displayCover}
            alt={audioTitle}
            className="w-full h-full object-cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          /* Default cover — gradient with animated waveform */
          <div
            className="w-full h-full flex flex-col items-center justify-center gap-4"
            style={{ background: 'linear-gradient(160deg,#1e1b4b 0%,#3730a3 50%,#1e1b4b 100%)' }}
          >
            <div className="flex items-end gap-px" style={{ height: 60, width: 200 }}>
              {BARS.slice(0, 30).map((bar, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-full"
                  style={{
                    height: bar.h * 1.8,
                    background: 'rgba(167,139,250,0.35)',
                    animation: playing
                      ? `afc-pulse ${0.5 + i * 0.03}s ease-in-out ${i * 0.02}s infinite alternate`
                      : 'none',
                  }}
                />
              ))}
            </div>
            <Music2 className="w-10 h-10 opacity-20 text-white" />
          </div>
        )}

        {/* Bottom gradient so play button reads against any cover */}
        <div
          className="absolute inset-x-0 bottom-0 pointer-events-none"
          style={{ height: '45%', background: 'linear-gradient(to top,rgba(0,0,0,0.72) 0%,transparent 100%)' }}
        />

        {/* Play / pause pill — bottom-left of cover */}
        <button
          onClick={toggle}
          className="absolute bottom-3 left-3 flex items-center gap-2 px-4 py-2 rounded-full transition-all active:scale-95 z-10"
          style={{
            background: playing ? 'rgba(99,102,241,0.95)' : 'rgba(255,255,255,0.96)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}
        >
          {playing
            ? <Pause className="w-4 h-4 text-white" />
            : <Play  className="w-4 h-4 text-gray-900 ml-0.5" />}
          <span
            className="text-xs font-black"
            style={{ color: playing ? '#fff' : '#111827' }}
          >
            {playing ? 'Playing' : 'Play'}
          </span>
        </button>

        {/* Duration badge — bottom-right */}
        {duration > 0 && (
          <div
            className="absolute bottom-3 right-3 px-2 py-1 rounded-full z-10"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
          >
            <span className="text-[11px] font-mono text-white/80">{fmt(duration)}</span>
          </div>
        )}
      </div>

      {/* ── Info + waveform player ──────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2">

        {/* Title row */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-[12px] font-black text-white"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
            >
              ♫
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-black text-gray-900 leading-tight truncate">{audioTitle}</p>
              <p className="text-[12px] text-gray-400 mt-0.5 truncate">by {audioArtist}</p>
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onNavigate?.(); }}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 transition-colors hover:bg-gray-200 active:bg-gray-300"
          >
            <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>

        {/* Waveform progress + time */}
        <div className="flex items-center gap-2.5">
          {/* Small inline play/pause */}
          <button
            onClick={toggle}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90"
            style={{ background: playing ? '#6366f1' : '#f3f4f6' }}
          >
            {playing
              ? <Pause className="w-3.5 h-3.5 text-white" />
              : <Play  className="w-3.5 h-3.5 text-gray-600 ml-0.5" />}
          </button>

          {/* Waveform bars — seekable */}
          <div
            className="flex-1 flex items-end gap-px cursor-pointer"
            style={{ height: 28 }}
            onClick={seekOnBar}
          >
            {BARS.map((bar, i) => {
              const pct    = (i / BARS.length) * 100;
              const filled = progress > pct;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-full"
                  style={{
                    height: Math.min(bar.h, 26),
                    background: filled ? '#6366f1' : '#e5e7eb',
                    animation: playing && filled
                      ? `afc-pulse ${0.45 + i * 0.02}s ease-in-out ${i * 0.012}s infinite alternate`
                      : 'none',
                    transition: 'background 0.08s',
                  }}
                />
              );
            })}
          </div>

          {/* Elapsed / total */}
          <span className="text-[11px] font-mono text-gray-400 shrink-0 tabular-nums">
            {fmt(curTime)}<span className="text-gray-300"> / </span>{fmt(duration)}
          </span>
        </div>
      </div>
    </>
  );
}
