// Reels slides for pictures: portfolio pictures / albums, and picture posts. Engagement stays on the original.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { usePortfolioPreview } from '../context/PortfolioPreviewContext';
import { ImageReelCard, type ReelEngagement } from './ImageReelCard';
import { postsApi, savedPostsApi } from '../lib/api';
import {
  type ReelPortfolioImage, isItemLiked, toggleItemLike, isAlbumLiked, toggleAlbumLike, isPortfolioSaved, togglePortfolioSave,
  incrementItemView, logPortfolioEngagementEvent,
} from '../lib/portfolioApi';
import type { Post } from '../types';

async function share(url: string, title?: string) {
  try {
    if (navigator.share) await navigator.share({ title, url });
    else { await navigator.clipboard.writeText(url); toast.success('Link copied'); }
  } catch { /* cancelled */ }
}

export function PortfolioImageReel({ entry, active, near, muted, onToggleMuted, onBack, onComment, commentDelta }: {
  entry: ReelPortfolioImage; active: boolean; near: boolean; muted: boolean; onToggleMuted: () => void;
  onBack: () => void; onComment: () => void; commentDelta: number;
}) {
  const { user, showGuestPrompt } = useAuth();
  const navigate = useNavigate();
  const { openPortfolioItem } = usePortfolioPreview();
  const isAlbum = entry.kind === 'album';
  const ownerId = (isAlbum ? entry.album!.user_id : entry.item!.user_id);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState((isAlbum ? entry.album!.likes_count : entry.item!.likes_count) ?? 0);
  const [saved, setSaved] = useState(false);
  const saveType = isAlbum ? 'portfolio_album' : 'portfolio_item';

  useEffect(() => {
    if (!near || !user) return;
    let off = false;
    (isAlbum ? isAlbumLiked(entry.id, user.id) : isItemLiked(entry.id, user.id)).then(v => { if (!off) setLiked(v); }).catch(() => {});
    isPortfolioSaved(user.id, entry.id, saveType as any).then(v => { if (!off) setSaved(v); }).catch(() => {});
    return () => { off = true; };
  }, [near, entry.id, user?.id]);

  // One view once a single picture has been on screen for 2s (items only; albums have no view counter).
  useEffect(() => {
    if (!active || isAlbum) return;
    const t = setTimeout(() => {
      const key = `filmons:reelview:${entry.id}`;
      try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
      incrementItemView(entry.id, ownerId, user?.id).catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
  }, [active, entry.id]);

  const engagement: ReelEngagement = {
    liked, likes, saved,
    comments: Math.max(0, ((isAlbum ? entry.album!.comments_count : entry.item!.comments_count) ?? 0) + commentDelta),
    onLike: async () => {
      if (!user) { showGuestPrompt?.(); return; }
      const was = liked; setLiked(!was); setLikes(c => Math.max(0, c + (was ? -1 : 1)));
      const ok = await (isAlbum ? toggleAlbumLike(entry.id, user.id, was) : toggleItemLike(entry.id, user.id, was, ownerId)).catch(() => false);
      if (!ok) { setLiked(was); setLikes(c => Math.max(0, c + (was ? 1 : -1))); toast.error('Could not update like'); }
    },
    onComment,
    onShare: () => {
      if (!isAlbum) logPortfolioEngagementEvent(ownerId, entry.id, 'share', user?.id);
      share(`${window.location.origin}/reels/${isAlbum ? 'pfa_' : 'pfi_'}${entry.id}`, entry.title);
    },
    onSave: async () => {
      if (!user) { showGuestPrompt?.(); return; }
      const was = saved; setSaved(!was);
      const ok = await togglePortfolioSave(user.id, entry.id, saveType as any, was, ownerId).catch(() => false);
      if (!ok) setSaved(was); else toast.success(was ? 'Removed from saved' : 'Saved');
    },
  };

  return (
    <ImageReelCard images={entry.images} active={active} near={near} source="Portfolio" title={entry.title}
      creator={{ id: entry.creator.id, name: entry.creator.name, avatar: entry.creator.avatar_url, accountType: entry.creator.account_type }}
      engagement={engagement} viewLabel="View project"
      onView={() => openPortfolioItem(entry.id, [], isAlbum ? 'album' : 'item', { forceDetail: true })}
      onProfile={() => navigate(`/host/${entry.creator.id}`)} onBack={onBack} muted={muted} onToggleMuted={onToggleMuted} />
  );
}

export function PostImageReel({ post, active, near, muted, onToggleMuted, onBack, onComment }: {
  post: Post; active: boolean; near: boolean; muted: boolean; onToggleMuted: () => void; onBack: () => void; onComment: () => void;
}) {
  const { user, showGuestPrompt } = useAuth();
  const navigate = useNavigate();
  const [liked, setLiked] = useState(() => (post.likes ?? []).includes(user?.id ?? ''));
  const [likes, setLikes] = useState(post.likesCount ?? (post.likes?.length ?? 0));
  const [saved, setSaved] = useState(() => (user ? savedPostsApi.isSavedSync(user.id, post.id) : false));
  const audioUrl = (post as any).audio_url as string | undefined;

  const engagement: ReelEngagement = {
    liked, likes, saved, comments: post.totalCommentsCount ?? post.commentCount ?? 0,
    onLike: async () => {
      if (!user) { showGuestPrompt?.(); return; }
      const was = liked; setLiked(!was); setLikes(c => Math.max(0, c + (was ? -1 : 1)));
      try { const r = await postsApi.toggleLike(post.id); setLiked(r.liked); setLikes(r.likesCount); }
      catch { setLiked(was); setLikes(c => Math.max(0, c + (was ? 1 : -1))); toast.error('Could not update like'); }
    },
    onComment,
    onShare: () => share(`${window.location.origin}/reels/${post.id}`, post.content?.slice(0, 80)),
    onSave: async () => {
      if (!user) { showGuestPrompt?.(); return; }
      const was = saved; setSaved(!was);
      try { const now = await savedPostsApi.toggle(user.id, post.id); setSaved(now); toast.success(now ? 'Saved' : 'Removed from saved'); }
      catch { setSaved(was); toast.error('Could not save'); }
    },
  };

  return (
    <ImageReelCard images={post.images ?? []} active={active} near={near} source="Post" caption={post.content}
      creator={{ id: post.userId, name: post.userName, avatar: post.userAvatar, accountType: post.userAccountType }}
      engagement={engagement} viewLabel="View post" onView={() => navigate(`/post/${post.id}`)}
      onProfile={() => navigate(`/host/${post.userId}`)} onBack={onBack}
      audio={audioUrl ? { url: audioUrl } : undefined} muted={muted} onToggleMuted={onToggleMuted} />
  );
}
