// Desktop Connect feed card for a Portfolio ALBUM entry (PortfolioFeedEntry,
// type: 'album'). Cover + item count instead of a single item's media/
// description -- an album has no single description/likes count of its own.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { Bookmark, BadgeCheck, Layers, MoreHorizontal, Heart, MessageCircle, Send, Link2, EyeOff, Flag, ExternalLink, Repeat2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { UserAvatar } from '../AccountTypeBadge';
import { PortfolioCommentSheet, timeAgo } from '../PortfolioCommentSheet';
import { TrustBadge } from '../trust/TrustBadge';
import { TrustDetailsSheet } from '../trust/TrustDetailsSheet';
import { TrustProfileOverlay } from '../trust/TrustProfileOverlay';
import { togglePortfolioSave, isPortfolioSaved, toggleAlbumLike, isAlbumLiked, togglePortfolioRepost, isPortfolioReposted, type PortfolioFeedEntry } from '../../lib/portfolioApi';
import { logPortfolioInteraction } from '../../lib/personalization';
import { ViewPortfolioLink } from './ViewPortfolioLink';
import { usePortfolioPreview } from '../../context/PortfolioPreviewContext';
import { PostMoreMenu } from './PostMoreMenu';
import { SharePostSheet } from './SharePostSheet';
import { getSharedContentDeepLink } from '../../lib/shareApi';
import type { TrustLevel } from '../../lib/trustApi';
import { PortfolioRepostsSheet } from './PortfolioRepostsSheet';
import { RepostMenuSheet } from '../RepostMenuSheet';
import { usePostRepostCompose } from '../../context/PostRepostComposeContext';
import type { RepostContextEntry } from '../../lib/api';

// "You reposted this" / "{name} +N more reposted this" -- same shape as
// PortfolioProjectCard.tsx's own helper.
function repostContextLabel(entries: RepostContextEntry[], viewerId?: string): string {
  const first = entries[0];
  const name = first.id === viewerId ? 'You' : first.name;
  const extra = entries.length - 1;
  return extra > 0 ? `${name} +${extra} more reposted this` : `${name} reposted this`;
}

export function PortfolioAlbumCard({ entry, trustLevel, hideRepostContext }: {
  entry: Extract<PortfolioFeedEntry, { type: 'album' }>;
  trustLevel?: TrustLevel;
  /** Suppresses this card's own repost-context row when a wrapper
   * (RepostedActivityCard/RepostGroupCard) already shows its own
   * "{name} reposted this" attribution line above it. */
  hideRepostContext?: boolean;
}) {
  const { user, showGuestPrompt } = useAuth();
  const navigate = useNavigate();
  const { album, creator, coverUrl, coverAspectRatio, itemCount } = entry;
  const isOwn = !!user && user.id === creator.id;

  const { openPortfolioPreview } = usePortfolioPreview();
  const { requestAlbumRepostCompose } = usePostRepostCompose();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [saved, setSaved] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(album.likes_count ?? 0);
  const [reposted, setReposted] = useState(false);
  const [repostsCount, setRepostsCount] = useState(album.reposts_count ?? 0);
  // Local override of entry.repostContext (same pattern as reposted/
  // repostsCount above) -- entry itself is an immutable prop, so without
  // this, reposting wouldn't show "You reposted this" until the next full
  // feed refetch.
  const [repostContext, setRepostContext] = useState<RepostContextEntry[]>(entry.repostContext ?? []);
  const [showRepostsSheet, setShowRepostsSheet] = useState(false);
  const [showRepostMenu, setShowRepostMenu] = useState(false);
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
  useEffect(() => { if (user) isPortfolioReposted(user.id, album.id, 'portfolio_album').then(setReposted); }, [album.id, user?.id]);

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

  const handleToggleRepost = async () => {
    if (!user) { toast.error('Sign in to repost'); return; }
    const next = !reposted;
    const prevContext = repostContext;
    setReposted(next);
    setRepostsCount(c => c + (next ? 1 : -1));
    setRepostContext(next
      ? [{ id: user.id, name: user.name || 'You', avatarUrl: user.avatar || null, relation: 'self' }, ...prevContext.filter(e => e.id !== user.id)]
      : prevContext.filter(e => e.id !== user.id));
    setShowRepostMenu(false);
    const ok = await togglePortfolioRepost(user.id, album.id, 'portfolio_album', !next, repostsCount, album.title);
    if (!ok) {
      setReposted(!next); setRepostsCount(c => c + (next ? -1 : 1)); setRepostContext(prevContext);
      toast.error('Could not update repost'); return;
    }
    toast.success(next ? 'Reposted to your followers' : 'Repost removed');
  };

  const handleRepostWithThoughts = () => {
    if (!user) { toast.error('Sign in to repost'); return; }
    setShowRepostMenu(false);
    requestAlbumRepostCompose({
      albumId: album.id,
      userId: creator.id,
      userName: creator.name,
      userAvatar: creator.avatar_url ?? undefined,
      title: album.title,
      coverUrl: coverUrl ?? undefined,
      itemCount,
    }, () => {
      // The composer registers the repost server-side on publish
      // (registerPortfolioRepost in CreatePostSheet), but that happens in
      // a totally separate global mount with no way back into THIS card's
      // own state -- without this, the album's own card (repost count,
      // "You reposted this" row) stayed stale until a full reload even
      // though the repost itself registered correctly.
      const alreadyReflected = repostContext.some(e => e.id === user.id);
      setReposted(true);
      if (!alreadyReflected) {
        setRepostContext(prev => [{ id: user.id, name: user.name || 'You', avatarUrl: user.avatar || null, relation: 'self' }, ...prev]);
        setRepostsCount(c => c + 1);
      }
    });
  };

  // Opens the draggable Portfolio overlay straight into THIS album (spec
  // §1/§11) rather than navigating away to /portfolio -- keeps /connect's
  // scroll position intact underneath.
  const openAlbum = () => openPortfolioPreview(creator.id, album.id);

  const shareSnapshot = {
    contentType: 'portfolio_album' as const,
    contentId: album.id,
    creatorId: creator.id,
    creatorName: creator.name,
    creatorAvatar: creator.avatar_url ?? undefined,
    creatorVerified: creator.is_verified,
    title: album.title,
    thumbnailUrl: coverUrl ?? undefined,
    meta: [`${itemCount} item${itemCount === 1 ? '' : 's'}`],
  };

  if (hidden) return null;

  return (
    <article className="bg-white rounded-2xl border border-gray-100 p-5">
      {/* Repost social-context row -- "You"/{name} reposted, relevant to
          the viewer only (their own repost, connections, or people they
          follow). Same placement/behavior as PostCard.tsx's own row. */}
      {!hideRepostContext && repostContext.length > 0 && (
        <button onClick={() => setShowRepostsSheet(true)}
          className="w-full flex items-center gap-2 pb-2.5 text-left hover:opacity-80 transition-opacity">
          <Repeat2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
          <UserAvatar user={{ id: repostContext[0].id, name: repostContext[0].name, avatar: repostContext[0].avatarUrl }} size={18}/>
          <p className="text-xs text-gray-500 truncate">
            <span className="font-bold text-gray-700">{repostContextLabel(repostContext, user?.id)}</span>
          </p>
        </button>
      )}
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
          rule -- replaces the old "New Portfolio Album" eyebrow label. */}
      <div className="mt-3">
        <p className="text-base font-black text-gray-900 leading-snug">{album.title}</p>
        {album.description && <p className="text-sm text-gray-600 mt-1 leading-relaxed line-clamp-3">{album.description}</p>}
      </div>

      <button onClick={openAlbum} className="relative block w-full mt-3 rounded-2xl overflow-hidden bg-gray-100" style={{ aspectRatio: coverAspectRatio || 4 / 5 }}>
        {coverUrl ? <img src={coverUrl} alt="" className="w-full h-full object-contain" /> : (
          <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">🎬</div>
        )}
        <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 text-xs font-bold text-white bg-black/60 px-2.5 py-1 rounded-full">
          <Layers className="w-3 h-3" /> {itemCount}
        </span>
      </button>

      {/* No separate "View album" button -- the cover image itself already
          opens the album (see the button wrapping it above). This link is
          the wider action -> the creator's whole Portfolio. */}
      <ViewPortfolioLink creatorId={creator.id} creatorFirstName={creator.name.split(' ')[0]} isOwn={isOwn} className="mt-3" />

      <div className="flex items-center gap-5 mt-3 pt-3 border-t border-gray-50">
        <button onClick={handleToggleLike} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <Heart className={`w-5 h-5 ${liked ? 'text-red-500 fill-red-500' : 'text-gray-400'}`} /> {likesCount > 0 ? likesCount : ''}
        </button>
        <button onClick={() => setShowComments(true)} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <MessageCircle className="w-5 h-5 text-gray-400" /> {(album.comments_count ?? 0) > 0 ? album.comments_count : ''}
        </button>
        <button onClick={() => { if (!user) { toast.error('Sign in to repost'); return; } setShowRepostMenu(true); }}
          className={`flex items-center gap-1.5 text-sm transition-colors ${reposted ? 'text-green-500' : 'text-gray-600 hover:text-green-500'}`}>
          <Repeat2 className="w-5 h-5" />
          {repostsCount > 0 && (
            <span onClick={e => { e.stopPropagation(); setShowRepostsSheet(true); }} className="hover:underline">{repostsCount}</span>
          )}
        </button>
        <button onClick={() => setShowShareSheet(true)} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <Send className="w-5 h-5 text-gray-400" />
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
      {showMoreMenu && (
        <PostMoreMenu
          onClose={() => setShowMoreMenu(false)}
          actions={[
            { icon: ExternalLink, label: 'View portfolio', onClick: () => { setShowMoreMenu(false); openAlbum(); } },
            { icon: Bookmark, label: saved ? 'Unsave' : 'Save', onClick: () => { setShowMoreMenu(false); handleToggleSave(); } },
            { icon: Link2, label: 'Copy link', onClick: async () => { setShowMoreMenu(false); try { await navigator.clipboard.writeText(getSharedContentDeepLink(shareSnapshot)); toast.success('Link copied'); } catch { toast.error('Could not copy link'); } } },
            { icon: EyeOff, label: 'Hide this post', onClick: () => { setShowMoreMenu(false); setHidden(true); toast('Post hidden', { description: "You won't see this again" }); } },
            { icon: Flag, label: 'Report', onClick: () => { setShowMoreMenu(false); toast.warning("Reported. We'll review it shortly."); } },
          ]}
        />
      )}
      {showShareSheet && <SharePostSheet snapshot={shareSnapshot} onClose={() => setShowShareSheet(false)} />}
      <RepostMenuSheet
        open={showRepostMenu}
        onClose={() => setShowRepostMenu(false)}
        hasReposted={reposted}
        busy={false}
        onRepost={handleToggleRepost}
        onUndoRepost={handleToggleRepost}
        onRepostWithThoughts={handleRepostWithThoughts}
      />
      {showRepostsSheet && (
        <PortfolioRepostsSheet targetId={album.id} targetType="portfolio_album" onClose={() => setShowRepostsSheet(false)} />
      )}
    </article>
  );
}
