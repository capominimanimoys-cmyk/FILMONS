// Desktop Connect feed card for a Portfolio ALBUM entry (PortfolioFeedEntry,
// type: 'album'). Cover + item count instead of a single item's media/
// description -- an album has no single description/likes count of its own.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { Bookmark, BadgeCheck, Layers, MoreHorizontal, Heart, MessageCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { UserAvatar } from '../AccountTypeBadge';
import { PortfolioCommentSheet, timeAgo } from '../PortfolioCommentSheet';
import { TrustBadge } from '../trust/TrustBadge';
import { TrustDetailsSheet } from '../trust/TrustDetailsSheet';
import { TrustProfileOverlay } from '../trust/TrustProfileOverlay';
import { togglePortfolioSave, isPortfolioSaved, toggleAlbumLike, isAlbumLiked, type PortfolioFeedEntry } from '../../lib/portfolioApi';
import { logPortfolioInteraction } from '../../lib/personalization';
import { ViewPortfolioLink } from './ViewPortfolioLink';
import { DraggablePortfolioPage } from './DraggablePortfolioPage';
import type { TrustLevel } from '../../lib/trustApi';

export function PortfolioAlbumCard({ entry, trustLevel }: {
  entry: Extract<PortfolioFeedEntry, { type: 'album' }>;
  trustLevel?: TrustLevel;
}) {
  const { user, showGuestPrompt } = useAuth();
  const navigate = useNavigate();
  const { album, creator, coverUrl, coverAspectRatio, itemCount } = entry;
  const isOwn = !!user && user.id === creator.id;

  const [showAlbumOverlay, setShowAlbumOverlay] = useState(false);
  const [saved, setSaved] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(album.likes_count ?? 0);
  const [showComments, setShowComments] = useState(false);
  const [showTrustDetails, setShowTrustDetails] = useState(false);
  const [trustProfileOpen, setTrustProfileOpen] = useState(false);
  const [trustProfileClosing, setTrustProfileClosing] = useState(false);
  const closeTrustProfile = () => {
    setTrustProfileClosing(true);
    setTimeout(() => { setTrustProfileOpen(false); setTrustProfileClosing(false); }, 260);
  };

  useEffect(() => { if (user) isPortfolioSaved(user.id, album.id, 'portfolio_album').then(setSaved); }, [album.id, user?.id]);
  useEffect(() => { if (user) isAlbumLiked(album.id, user.id).then(setLiked); }, [album.id, user?.id]);

  const handleToggleSave = async () => {
    if (!user) { showGuestPrompt('Create your Filmons account to save portfolio work.', 'Sign up to save'); return; }
    const next = !saved;
    setSaved(next);
    const ok = await togglePortfolioSave(user.id, album.id, 'portfolio_album', !next, creator.id);
    if (!ok) { setSaved(!next); toast.error('Could not update save'); return; }
    logPortfolioInteraction(user.id, { category: (album as any).category ?? '' }, next ? 'save' : 'unsave');
  };

  // Engagement belongs to the Album itself, not its individual preview
  // tiles -- new portfolio_album_likes/comments (see migration), not the
  // per-item like/comment system.
  const handleToggleLike = async () => {
    if (!user) { showGuestPrompt('Create your Filmons account to like portfolio work.', 'Sign up to like posts'); return; }
    const next = !liked;
    setLiked(next);
    setLikesCount(c => c + (next ? 1 : -1));
    const ok = await toggleAlbumLike(album.id, user.id, !next);
    if (!ok) { setLiked(!next); setLikesCount(c => c + (next ? -1 : 1)); toast.error('Could not update like'); return; }
    logPortfolioInteraction(user.id, { category: (album as any).category ?? '' }, next ? 'like' : 'unlike');
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/portfolio/${creator.id}`;
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); } catch { toast.error('Could not copy link'); }
  };

  // Opens the draggable Portfolio overlay straight into THIS album (spec
  // §1/§11) rather than navigating away to /portfolio -- keeps /connect's
  // scroll position intact underneath.
  const openAlbum = () => setShowAlbumOverlay(true);

  return (
    <article className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-start gap-3">
        <button onClick={() => navigate(`/host/${creator.id}`)} className="shrink-0">
          <UserAvatar user={{ id: creator.id, name: creator.name, avatar: creator.avatar_url }} size={44} />
        </button>
        <div className="min-w-0 flex-1">
          <button onClick={() => navigate(`/host/${creator.id}`)} className="flex items-center gap-1">
            <p className="text-sm font-bold text-gray-900">{creator.name}</p>
            {creator.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 fill-blue-100 shrink-0" />}
          </button>
          <p className="text-xs text-gray-400 mt-0.5">
            {[creator.primary_role, creator.city].filter(Boolean).join(' · ')}{(creator.primary_role || creator.city) ? ' · ' : ''}{timeAgo(entry.created_at)}
          </p>
          {trustLevel && (
            <div className="mt-1">
              <TrustBadge level={trustLevel} size="sm" onClick={() => setShowTrustDetails(true)} />
            </div>
          )}
        </div>
        <button className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      <p className="text-[11px] font-black text-blue-600 uppercase tracking-wide mt-3">🎬 New Portfolio Album</p>

      <button onClick={openAlbum} className="relative block w-full mt-3 rounded-2xl overflow-hidden bg-gray-100" style={{ aspectRatio: coverAspectRatio || 4 / 5 }}>
        {coverUrl ? <img src={coverUrl} alt="" className="w-full h-full object-contain" /> : (
          <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">🎬</div>
        )}
        <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 text-xs font-bold text-white bg-black/60 px-2.5 py-1 rounded-full">
          <Layers className="w-3 h-3" /> {itemCount}
        </span>
      </button>

      <div className="mt-3">
        <p className="text-sm font-bold text-gray-900">{album.title}</p>
      </div>

      {/* No separate "View album" button -- the cover image itself already
          opens the album (see the button wrapping it above). This link is
          the wider action -> the creator's whole Portfolio. */}
      <ViewPortfolioLink creatorId={creator.id} creatorFirstName={creator.name.split(' ')[0]} isOwn={isOwn} className="mt-3" />

      <div className="flex items-center gap-5 mt-3 pt-3 border-t border-gray-50">
        <button onClick={handleToggleLike} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <Heart className={`w-5 h-5 ${liked ? 'text-red-500 fill-red-500' : 'text-gray-400'}`} /> Like{likesCount > 0 ? ` · ${likesCount}` : ''}
        </button>
        <button onClick={() => setShowComments(true)} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <MessageCircle className="w-5 h-5 text-gray-400" /> Comment{(album.comments_count ?? 0) > 0 ? ` · ${album.comments_count}` : ''}
        </button>
        <button onClick={handleShare} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <Send className="w-5 h-5 text-gray-400" /> Share
        </button>
        <button onClick={handleToggleSave} className="ml-auto flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <Bookmark className={`w-5 h-5 ${saved ? 'text-gray-900 fill-gray-900' : 'text-gray-400'}`} /> Save
        </button>
      </div>

      {showComments && createPortal(
        <PortfolioCommentSheet
          itemId={album.id} targetType="album" creatorId={creator.id} itemCategory={(album as any).category}
          canModerate={isOwn} onClose={() => setShowComments(false)}
        />,
        document.body,
      )}
      {showTrustDetails && createPortal(
        <TrustDetailsSheet
          userId={creator.id}
          onClose={() => setShowTrustDetails(false)}
          onViewFullProfile={() => { setShowTrustDetails(false); setTrustProfileOpen(true); }}
        />,
        document.body,
      )}
      {(trustProfileOpen || trustProfileClosing) && createPortal(
        <TrustProfileOverlay userId={creator.id} closing={trustProfileClosing} onClose={closeTrustProfile} />,
        document.body,
      )}
      {showAlbumOverlay && (
        <DraggablePortfolioPage creatorId={creator.id} initialAlbumId={album.id} onClose={() => setShowAlbumOverlay(false)} />
      )}
    </article>
  );
}
