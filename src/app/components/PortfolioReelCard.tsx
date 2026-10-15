// A portfolio video shown as a Reel. Likes / comments / views belong to the ORIGINAL portfolio item (no duplicate post).
import { useEffect, useState } from 'react';
import { Heart, MessageCircle, Share2, Bookmark, ArrowUpRight, ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { ReelVideo } from './ReelVideo';
import { AccountTypeBadge } from './AccountTypeBadge';
import { ReelLinkChip } from './ImageReelCard';
import {
  ReelPortfolioVideo, isItemLiked, toggleItemLike, isPortfolioSaved, togglePortfolioSave,
  incrementItemView, logPortfolioEngagementEvent,
} from '../lib/portfolioApi';

const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n);

export function PortfolioReelCard({ reel, active, hasPlayer, preload, muted, onToggleMuted, onBack, onProfile, onViewProject, onComment, commentDelta, onShare }: {
  onShare: () => void;
  reel: ReelPortfolioVideo; active: boolean; hasPlayer: boolean; preload: 'auto' | 'metadata' | 'none';
  muted: boolean; onToggleMuted: () => void; onBack: () => void; onProfile: () => void; onViewProject: () => void;
  onComment: () => void; commentDelta: number;
}) {
  const { user, showGuestPrompt } = useAuth();
  const { item, creator } = reel;
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(item.likes_count ?? 0);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [views, setViews] = useState(item.views_count ?? 0);

  // Viewer-specific state is fetched only for reels near the screen.
  useEffect(() => {
    if (!hasPlayer || !user) return;
    let off = false;
    isItemLiked(item.id, user.id).then(v => { if (!off) setLiked(v); }).catch(() => {});
    isPortfolioSaved(user.id, item.id, 'portfolio_item').then(v => { if (!off) setSaved(v); }).catch(() => {});
    return () => { off = true; };
  }, [hasPlayer, item.id, user?.id]);

  // Count one view once the reel has been on screen for 2s.
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => {
      const key = `filmons:reelview:${item.id}`;
      try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
      incrementItemView(item.id, item.user_id, user?.id).catch(() => {});
      setViews(v => v + 1);
    }, 2000);
    return () => clearTimeout(t);
  }, [active, item.id]);

  const like = async () => {
    if (!user) { showGuestPrompt?.(); return; }
    if (busy) return;
    const was = liked; setBusy(true); setLiked(!was); setLikes(c => Math.max(0, c + (was ? -1 : 1)));
    const ok = await toggleItemLike(item.id, user.id, was, item.user_id).catch(() => false);
    if (!ok) { setLiked(was); setLikes(c => Math.max(0, c + (was ? 1 : -1))); toast.error('Could not update like'); }
    setBusy(false);
  };
  const save = async () => {
    if (!user) { showGuestPrompt?.(); return; }
    const was = saved; setSaved(!was);
    const ok = await togglePortfolioSave(user.id, item.id, 'portfolio_item', was, item.user_id).catch(() => false);
    if (!ok) setSaved(was); else toast.success(was ? 'Removed from saved' : 'Saved');
  };
  const comments = Math.max(0, (item.comments_count ?? 0) + commentDelta);
  const roles = item.role?.trim();
  const poster = item.thumbnail_url || undefined;
  const Count = ({ n }: { n: number }) => n > 0 ? <span className="text-white text-xs font-semibold drop-shadow">{fmt(n)}</span> : null;

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <ReelVideo src={item.media_url!} poster={poster} active={active} hasPlayer={hasPlayer} preload={preload} muted={muted} />

      {/* Top: back + Portfolio badge + mute */}
      <div className="absolute top-0 left-0 right-0 flex items-center gap-2 p-4 bg-gradient-to-b from-black/50 to-transparent z-10">
        <button onClick={onBack} aria-label="Back" className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"><ArrowLeft className="w-5 h-5" /></button>
        <span className="px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-white text-[11px] font-bold tracking-wide">Portfolio</span>
        <button onClick={onToggleMuted} aria-label={muted ? 'Unmute' : 'Mute'} className="ml-auto w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white">
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Right actions */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 z-10">
        <div className="flex flex-col items-center gap-1">
          <button onClick={like} aria-label="Like" className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform">
            <Heart className={`w-8 h-8 drop-shadow-lg ${liked ? 'fill-red-500 text-red-500' : 'text-white'}`} />
          </button><Count n={likes} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <button onClick={onComment} aria-label="Comments" className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"><MessageCircle className="w-8 h-8 text-white drop-shadow-lg" /></button>
          <Count n={comments} />
        </div>
        <button onClick={() => { logPortfolioEngagementEvent(item.user_id, item.id, 'share', user?.id); onShare(); }} aria-label="Share" className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"><Share2 className="w-7 h-7 text-white drop-shadow-lg" /></button>
        <button onClick={save} aria-label={saved ? 'Unsave' : 'Save'} className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform">
          <Bookmark className={`w-7 h-7 drop-shadow-lg ${saved ? 'fill-white text-white' : 'text-white'}`} />
        </button>
      </div>

      {/* Bottom: creator, title, role, View project */}
      <div className="absolute left-0 right-0 bottom-0 px-4 pb-6 pt-24 pr-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10 pointer-events-none">
        <button onClick={onProfile} className="pointer-events-auto flex items-center gap-2 max-w-full">
          {creator.avatar_url
            ? <img src={creator.avatar_url} alt="" className="w-9 h-9 rounded-full border border-white/50 object-cover" />
            : <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold">{creator.name?.[0]?.toUpperCase()}</div>}
          <span className="text-white font-semibold text-sm truncate drop-shadow">{creator.name}</span>
          <AccountTypeBadge type={creator.account_type ?? undefined} size="sm" />
        </button>
        {item.title && <p className="mt-2 text-white text-base font-bold leading-snug line-clamp-2 drop-shadow">{item.title}</p>}
        {(roles || views > 0) && (
          <p className="mt-0.5 text-white/80 text-xs">{[roles, views > 0 ? `${fmt(views)} views` : ''].filter(Boolean).join(' · ')}</p>
        )}
        <div><ReelLinkChip url={item.external_link} /></div>
        <button onClick={onViewProject} className="pointer-events-auto mt-3 inline-flex items-center gap-1 px-4 py-2 rounded-full bg-white text-black text-sm font-bold active:scale-95 transition-transform">
          View project <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
