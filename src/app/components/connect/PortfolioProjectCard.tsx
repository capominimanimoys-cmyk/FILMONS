// Desktop Connect feed's richest card -- a Portfolio item entry
// (PortfolioFeedEntry, type: 'item'). Reuses the EXACT same engagement
// primitives PortfolioFeedCard.tsx (mobile) does -- toggleItemLike,
// togglePortfolioSave, PortfolioCommentSheet -- rather than a second
// engagement system, per spec. Media uses the shared PortfolioMedia
// component so aspect ratio (poster = container = playback ratio, no
// layout jump on play) is identical to mobile.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { Heart, MessageCircle, Send, Bookmark, BadgeCheck, MoreHorizontal, Link2, EyeOff, Flag, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { UserAvatar } from '../AccountTypeBadge';
import { PortfolioMedia } from '../PortfolioMedia';
import { PortfolioItemFocusView } from '../PortfolioItemFocusView';
import { PortfolioCommentSheet, timeAgo } from '../PortfolioCommentSheet';
import { TrustBadge } from '../trust/TrustBadge';
import { TrustDetailsSheet } from '../trust/TrustDetailsSheet';
import { TrustProfileOverlay } from '../trust/TrustProfileOverlay';
import { ViewPortfolioLink } from './ViewPortfolioLink';
import { PostMoreMenu } from './PostMoreMenu';
import { SharePostSheet } from './SharePostSheet';
import { getSharedContentDeepLink } from '../../lib/shareApi';
import { toggleItemLike, isItemLiked, togglePortfolioSave, isPortfolioSaved, type PortfolioFeedEntry } from '../../lib/portfolioApi';
import { logPortfolioInteraction } from '../../lib/personalization';
import type { TrustLevel } from '../../lib/trustApi';

export function PortfolioProjectCard({ entry, trustLevel }: {
  entry: Extract<PortfolioFeedEntry, { type: 'item' }>;
  trustLevel?: TrustLevel;
}) {
  const { user, showGuestPrompt } = useAuth();
  const navigate = useNavigate();
  const { item, creator } = entry;
  const isOwn = !!user && user.id === creator.id;

  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(item.likes_count ?? 0);
  const [saved, setSaved] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showItemDetail, setShowItemDetail] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [showTrustDetails, setShowTrustDetails] = useState(false);
  const [trustProfileOpen, setTrustProfileOpen] = useState(false);
  const [trustProfileClosing, setTrustProfileClosing] = useState(false);
  const closeTrustProfile = () => {
    setTrustProfileClosing(true);
    setTimeout(() => { setTrustProfileOpen(false); setTrustProfileClosing(false); }, 260);
  };

  useEffect(() => { if (user) isItemLiked(item.id, user.id).then(setLiked); }, [item.id, user?.id]);
  useEffect(() => { if (user) isPortfolioSaved(user.id, item.id, 'portfolio_item').then(setSaved); }, [item.id, user?.id]);

  const handleToggleLike = async () => {
    if (!user) { showGuestPrompt('Create your Filmons account to like portfolio work.', 'Sign up to like posts'); return; }
    const next = !liked;
    setLiked(next);
    setLikesCount(c => c + (next ? 1 : -1));
    const ok = await toggleItemLike(item.id, user.id, !next, creator.id);
    if (!ok) { setLiked(!next); setLikesCount(c => c + (next ? -1 : 1)); toast.error('Could not update like'); return; }
    logPortfolioInteraction(user.id, { category: item.category, subcategory: item.subcategory }, next ? 'like' : 'unlike');
  };

  const handleToggleSave = async () => {
    if (!user) { showGuestPrompt('Create your Filmons account to save portfolio work.', 'Sign up to save'); return; }
    const next = !saved;
    setSaved(next);
    const ok = await togglePortfolioSave(user.id, item.id, 'portfolio_item', !next, creator.id);
    if (!ok) { setSaved(!next); toast.error('Could not update save'); return; }
    logPortfolioInteraction(user.id, { category: item.category, subcategory: item.subcategory }, next ? 'save' : 'unsave');
  };

  // Two distinct destinations, per spec: media/title -> item detail
  // overlay (this page, no navigation); avatar/name -> Profile. The
  // "View [Name]'s Portfolio" action (ViewPortfolioLink) is its own third
  // destination -- creator.id is the actual owner's id regardless of who's
  // viewing, so it never routes to the VIEWER's own /portfolio unless they
  // really are the owner.
  const openItemDetail = () => setShowItemDetail(true);

  const shareSnapshot = {
    contentType: 'portfolio_item' as const,
    contentId: item.id,
    creatorId: creator.id,
    creatorName: creator.name,
    creatorAvatar: creator.avatar_url ?? undefined,
    creatorVerified: creator.is_verified,
    title: item.title,
    caption: item.description,
    thumbnailUrl: item.thumbnail_url || item.media_url,
    meta: [item.category, item.subcategory].filter(Boolean) as string[],
  };

  if (hidden) return null;

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
        <button onClick={() => setShowMoreMenu(true)} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Title/caption above media, per the FILMONS universal post-layout
          rule -- replaces the old "New Portfolio Work" eyebrow label. Same
          typography as PortfolioAlbumCard's title/caption so the two
          "project" card types read consistently side by side. */}
      <button onClick={openItemDetail} className="block mt-3 text-left">
        <p className="text-base font-black text-gray-900 leading-snug hover:underline">{item.title}</p>
        {item.description && <p className="text-sm text-gray-600 mt-1 leading-relaxed line-clamp-3">{item.description}</p>}
      </button>

      <button onClick={openItemDetail} className="block w-full mt-3">
        <PortfolioMedia item={item} />
      </button>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {[item.category, item.subcategory, creator.city].filter(Boolean).map(tag => (
          <span key={tag} className="text-[11px] font-semibold text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">{tag}</span>
        ))}
      </div>

      {/* Lightweight action, not a big CTA -- shouldn't compete with the
          media/identity above it. Converts "saw one piece of work" into
          "discovered the whole Portfolio." */}
      <ViewPortfolioLink creatorId={creator.id} creatorFirstName={creator.name.split(' ')[0]} isOwn={isOwn} className="mt-3" />

      <div className="flex items-center gap-5 mt-4 pt-3 border-t border-gray-50">
        <button onClick={handleToggleLike} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <Heart className={`w-5 h-5 ${liked ? 'text-red-500 fill-red-500' : 'text-gray-400'}`} /> Like{likesCount > 0 ? ` · ${likesCount}` : ''}
        </button>
        <button onClick={() => setShowComments(true)} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <MessageCircle className="w-5 h-5 text-gray-400" /> Comment{(item.comments_count ?? 0) > 0 ? ` · ${item.comments_count}` : ''}
        </button>
        <button onClick={() => setShowShareSheet(true)} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <Send className="w-5 h-5 text-gray-400" /> Share
        </button>
        <button onClick={handleToggleSave} className="ml-auto flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <Bookmark className={`w-5 h-5 ${saved ? 'text-gray-900 fill-gray-900' : 'text-gray-400'}`} /> Save
        </button>
      </div>

      {showItemDetail && createPortal(
        <PortfolioItemFocusView item={item} onClose={() => setShowItemDetail(false)} />,
        document.body,
      )}
      {showComments && createPortal(
        <PortfolioCommentSheet
          itemId={item.id} creatorId={creator.id} itemCategory={item.category} itemSubcategory={item.subcategory}
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
      {showMoreMenu && (
        <PostMoreMenu
          onClose={() => setShowMoreMenu(false)}
          actions={[
            { icon: ExternalLink, label: 'View portfolio', onClick: () => { setShowMoreMenu(false); navigate(`/portfolio/${creator.id}`); } },
            { icon: Bookmark, label: saved ? 'Unsave' : 'Save', onClick: () => { setShowMoreMenu(false); handleToggleSave(); } },
            { icon: Link2, label: 'Copy link', onClick: async () => { setShowMoreMenu(false); try { await navigator.clipboard.writeText(getSharedContentDeepLink(shareSnapshot)); toast.success('Link copied'); } catch { toast.error('Could not copy link'); } } },
            { icon: EyeOff, label: 'Hide this post', onClick: () => { setShowMoreMenu(false); setHidden(true); toast('Post hidden', { description: "You won't see this again" }); } },
            { icon: Flag, label: 'Report', onClick: () => { setShowMoreMenu(false); toast.warning("Reported. We'll review it shortly."); } },
          ]}
        />
      )}
      {showShareSheet && <SharePostSheet snapshot={shareSnapshot} onClose={() => setShowShareSheet(false)} />}
    </article>
  );
}
