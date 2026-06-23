/**
 * Filmons — AudioPostCard
 * Standalone dark card for audio posts in the feed.
 * Completely visually separate from the white photo/video PostCard.
 *
 * Receives pre-computed state from PostCard (which owns all hooks) and renders
 * its own dark-gradient, self-contained card with header, cover, player, and actions.
 */
import { useState, useRef, useEffect } from 'react';
import {
  Play, Pause, Heart, MessageCircle, Repeat2, Share2,
  Bookmark, MoreHorizontal, Music2, ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { UserAvatar, AccountTypeBadge } from './AccountTypeBadge';

// ── tiny helpers ──────────────────────────────────────────────────────────────
function fmt(s: number) {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}
function fmtCount(n: number) {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
function timeAgo(d?: string | null) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const BARS = Array.from({ length: 48 }, (_, i) => ({
  h: 14 + Math.sin(i * 0.68) * 10 + Math.cos(i * 1.4) * 7 + (i % 4 === 0 ? 7 : 0),
}));

// ── Props ─────────────────────────────────────────────────────────────────────
export interface AudioPostCardProps {
  post:           any;       // normalized post object
  audioSrc:       string;
  coverUrl?:      string;
  isLiked:        boolean;
  likesCount:     number;
  commentCount:   number;
  saved:          boolean;
  hasReposted:    boolean;
  repostCount:    number;
  isOwn:          boolean;
  onLike:         () => void;
  onSave:         () => void;
  onComment:      () => void;
  onShare:        () => void;
  onRepost:       () => void;
  onNavigateAudio:() => void;
  onNavigateProfile: () => void;
  onMenuOpen:     () => void;   // opens PostCard's own/other menu
}

// ── Component ─────────────────────────────────────────────────────────────────
export function AudioPostCard({
  post, audioSrc, coverUrl,
  isLiked, likesCount, commentCount, saved, hasReposted, repostCount,
  isOwn, onLike, onSave, onComment, onShare, onRepost,
  onNavigateAudio, onNavigateProfile, onMenuOpen,
}: AudioPostCardProps) {
  const navigate = useNavigate();

  // ── Audio player state ──────────────────────────────────────────────────────
  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [curTime,  setCurTime]  = useState(0);
  const [duration, setDuration] = useState(0);
  const [imgErr,   setImgErr]   = useState(false);

  // Latch first non-empty cover so it never disappears mid-render
  const stableCover = useRef<string | undefined>(undefined);
  if (coverUrl && !stableCover.current) stableCover.current = coverUrl;
  const displayCover = stableCover.current;

  useEffect(() => {
    if (!audioSrc) return;
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
      a.pause(); setPlaying(false);
    } else {
      const w = window as any;
      if (w.__filmons_audio && w.__filmons_audio !== a) w.__filmons_audio.pause();
      w.__filmons_audio = a;
      a.play().catch(() => {});
      setPlaying(true);
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const a = audioRef.current;
    if (!a?.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - rect.left) / rect.width) * a.duration;
  };

  const showCover = !!displayCover && !imgErr;
  const audioTitle  = post.audioTitle  || post.audio_title  || '';
  const audioArtist = post.audioArtist || post.audio_artist || post.userName || '';

  return (
    <>
      <style>{`
        @keyframes apc-wave {
          from { transform: scaleY(0.35); }
          to   { transform: scaleY(1);    }
        }
      `}</style>

      {/* ── Outer dark card ────────────────────────────────────────────────── */}
      <div
        className="mx-3 my-2 rounded-3xl overflow-hidden"
        style={{ background: 'linear-gradient(160deg,#0f0a1e 0%,#1e1040 45%,#0d1117 100%)' }}
      >

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <button onClick={onNavigateProfile} className="shrink-0">
            <UserAvatar
              user={{ name: post.userName, avatar: post.userAvatar, id: post.userId }}
              size={36}
            />
          </button>
          <div className="flex-1 min-w-0">
            <button onClick={onNavigateProfile} className="text-left block">
              <p className="text-[13px] font-black text-white leading-tight truncate flex items-center gap-1.5">
                {post.userName}
                {post.userAccountType && (
                  <AccountTypeBadge type={post.userAccountType} size="sm" />
                )}
              </p>
              <p className="text-[11px] text-white/40 leading-tight mt-0.5">
                {timeAgo(post.createdAt)}
              </p>
            </button>
          </div>
          <button
            onClick={onMenuOpen}
            className="w-8 h-8 flex items-center justify-center rounded-full text-white/40 hover:text-white/70 transition-colors shrink-0"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* ── Cover image ────────────────────────────────────────────────── */}
        <div
          className="relative w-full cursor-pointer"
          style={{ aspectRatio: '1/1', background: '#0a0520' }}
          onClick={onNavigateAudio}
        >
          {showCover ? (
            <img
              src={displayCover}
              alt={audioTitle}
              className="w-full h-full object-cover"
              onError={() => setImgErr(true)}
            />
          ) : (
            <div
              className="w-full h-full flex flex-col items-center justify-center gap-3"
              style={{ background: 'linear-gradient(135deg,#1e1b4b,#3730a3,#1e1b4b)' }}
            >
              <div className="flex items-end gap-px" style={{ height: 56, width: '60%' }}>
                {BARS.slice(0, 28).map((bar, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-full"
                    style={{
                      height: bar.h * 1.5,
                      background: 'rgba(129,140,248,0.3)',
                      animation: playing
                        ? `apc-wave ${0.5 + i * 0.03}s ease-in-out ${i * 0.02}s infinite alternate`
                        : 'none',
                    }}
                  />
                ))}
              </div>
              <Music2 className="w-9 h-9 text-white/20" />
            </div>
          )}

          {/* Bottom gradient */}
          <div
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{ height: '40%', background: 'linear-gradient(to top,rgba(15,10,30,0.9),transparent)' }}
          />

          {/* Play pill */}
          <button
            onClick={toggle}
            className="absolute bottom-3 left-3 flex items-center gap-2 px-4 py-2 rounded-full z-10 transition-all active:scale-95"
            style={{
              background: playing ? 'rgba(99,102,241,0.95)' : 'rgba(255,255,255,0.92)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}
          >
            {playing
              ? <Pause className="w-4 h-4 text-white" />
              : <Play  className="w-4 h-4 text-gray-900 ml-0.5" />}
            <span className="text-xs font-black" style={{ color: playing ? '#fff' : '#111' }}>
              {playing ? 'Playing' : 'Play'}
            </span>
          </button>

          {/* Duration badge */}
          {duration > 0 && (
            <div
              className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full z-10"
              style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
            >
              <span className="text-[11px] font-mono text-white/75">{fmt(duration)}</span>
            </div>
          )}
        </div>

        {/* ── Song info ──────────────────────────────────────────────────── */}
        <div className="px-4 pt-3.5 pb-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-[11px] font-black text-white"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                >
                  ♫
                </div>
                <p className="text-[15px] font-black text-white leading-tight truncate">{audioTitle}</p>
              </div>
              <p className="text-[12px] text-white/45 truncate pl-6">by {audioArtist}</p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); onNavigateAudio(); }}
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            >
              <ExternalLink className="w-3.5 h-3.5 text-white/50" />
            </button>
          </div>

          {/* ── Waveform player ─────────────────────────────────────────── */}
          <div className="flex items-center gap-2.5 mt-3 mb-1">
            <button
              onClick={toggle}
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90"
              style={{ background: playing ? '#6366f1' : 'rgba(255,255,255,0.12)' }}
            >
              {playing
                ? <Pause className="w-3.5 h-3.5 text-white" />
                : <Play  className="w-3.5 h-3.5 text-white ml-0.5" />}
            </button>

            <div
              className="flex-1 flex items-end gap-px cursor-pointer"
              style={{ height: 28 }}
              onClick={seek}
            >
              {BARS.map((bar, i) => {
                const filled = progress > (i / BARS.length) * 100;
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-full"
                    style={{
                      height: Math.min(bar.h, 26),
                      background: filled ? '#818cf8' : 'rgba(255,255,255,0.12)',
                      animation: playing && filled
                        ? `apc-wave ${0.45 + i * 0.02}s ease-in-out ${i * 0.012}s infinite alternate`
                        : 'none',
                      transition: 'background 0.08s',
                    }}
                  />
                );
              })}
            </div>

            <span className="text-[11px] font-mono text-white/35 shrink-0 tabular-nums">
              {fmt(curTime)}<span className="text-white/20"> / </span>{fmt(duration)}
            </span>
          </div>
        </div>

        {/* ── Caption ────────────────────────────────────────────────────── */}
        {post.content && (
          <p className="px-4 pt-1 pb-2 text-[13px] text-white/60 leading-relaxed line-clamp-2">
            {post.content}
          </p>
        )}

        {/* ── Action row ─────────────────────────────────────────────────── */}
        <div
          className="flex items-center px-3 py-3 mt-1"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Like */}
          <button
            onClick={onLike}
            className={`flex items-center gap-1.5 px-2.5 py-2 rounded-full transition-all active:scale-90 ${isLiked ? 'text-red-400' : 'text-white/45 hover:text-white/70'}`}
          >
            <Heart className={`w-5 h-5 ${isLiked ? 'fill-red-400' : ''}`} />
            {likesCount > 0 && <span className="text-[13px] font-semibold">{fmtCount(likesCount)}</span>}
          </button>

          {/* Comment */}
          <button
            onClick={onComment}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-full text-white/45 hover:text-white/70 transition-all active:scale-90"
          >
            <MessageCircle className="w-5 h-5" />
            {commentCount > 0 && <span className="text-[13px] font-semibold">{fmtCount(commentCount)}</span>}
          </button>

          {/* Repost */}
          <button
            onClick={onRepost}
            className={`flex items-center gap-1.5 px-2.5 py-2 rounded-full transition-all active:scale-90 ${hasReposted ? 'text-green-400' : 'text-white/45 hover:text-white/70'}`}
          >
            <Repeat2 className="w-5 h-5" />
            {repostCount > 0 && <span className="text-[13px] font-semibold">{fmtCount(repostCount)}</span>}
          </button>

          {/* Share */}
          <button
            onClick={onShare}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-full text-white/45 hover:text-white/70 transition-all active:scale-90"
          >
            <Share2 className="w-5 h-5" />
          </button>

          {/* Save — pushed right */}
          <button
            onClick={onSave}
            className={`ml-auto px-2.5 py-2 rounded-full transition-all active:scale-90 ${saved ? 'text-indigo-400' : 'text-white/45 hover:text-white/70'}`}
          >
            <Bookmark className={`w-5 h-5 ${saved ? 'fill-indigo-400' : ''}`} />
          </button>
        </div>

      </div>
    </>
  );
}
