// "Repost with your thoughts" composer -- lives at the page/overlay
// layer (portaled straight to document.body), never inside the PostCard
// that triggered it. Rendering this inline inside PostCard's own tree
// (the original implementation) meant its `fixed` positioning could get
// trapped by whatever CSS containing-block PostCard's ancestors happen to
// establish (a transform/filter/etc. somewhere up the feed's render
// tree) instead of the real viewport -- it showed up squeezed inside the
// post card instead of covering the screen. Same root cause, and same
// fix (createPortal to document.body), as RepostMenuSheet.tsx's own
// earlier bug.
//
// Mobile: a full-screen page sliding in from the right (standard FILMONS
// push-page transition). Desktop (md:): a centered overlay over a
// dimmed/blurred backdrop. Owns its own comment/posting state entirely --
// the caller only needs to mount/unmount it and get the finished post
// back.
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { postsApi } from '../lib/api';
import * as notifs from '../lib/notifications';
import { UserAvatar } from './AccountTypeBadge';
import { QuotedPostPreview } from './QuotedPostPreview';
import type { Post } from '../types';

export function RepostComposer({ post, onClose, onPosted }: {
  post: Post;
  onClose: () => void;
  onPosted: (newPost: Post) => void;
}) {
  const { user } = useAuth();
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let t: number;
    const outer = requestAnimationFrame(() => { t = requestAnimationFrame(() => setVisible(true)); });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(t); };
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 360);
  }, [onClose]);

  const submit = async () => {
    if (!user) { toast.error('Sign in to repost'); return; }
    if (!comment.trim()) { toast.error('Add a comment to quote repost'); return; }
    setPosting(true);
    try {
      const newPost = await postsApi.create(
        comment.trim(), undefined, undefined, undefined, undefined,
        true, undefined, undefined, true, undefined,
        {
          postId: post.id,
          userId: post.userId,
          userName: post.userName,
          userAvatar: post.userAvatar,
          content: post.content,
          images: post.images,
          createdAt: post.createdAt,
        },
      );
      onPosted(newPost);
      // postId points at the NEW wrapper post (not the original) -- unlike
      // a plain repost, this one has real content of its own to open.
      if (post.userId && post.userId !== user.id) {
        notifs.push(post.userId, {
          type: 'content_repost_thoughts',
          fromUserId:    user.id,
          fromUserName:  user.name,
          fromUserAvatar: user.avatar,
          postId:        newPost.id,
          postContent:   comment.trim().slice(0, 60),
          postImage:     post.images?.[0] || post.thumbnailUrl,
        });
      }
      toast.success('Quote reposted!');
      onClose();
    } catch { toast.error('Could not quote repost'); }
    finally { setPosting(false); }
  };

  return createPortal((
    <div className="fixed inset-0 z-[95]">
      {/* Desktop-only dimmed/blurred backdrop -- mobile's composer is an
          opaque full-screen page, nothing shows through it. */}
      <div
        className={`hidden md:block absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={close}
      />
      {/* Mobile: fixed full-screen page, slides in from the right
          (translateX). Desktop (md:): the SAME element becomes a
          centered card -- md:top-1/2/md:left-1/2 position it, and
          md:-translate-x-1/2/md:-translate-y-1/2 (always applied at that
          breakpoint) center it; those combine with the mobile translate-x
          utility below into one `transform` via Tailwind's shared
          transform variables, so toggling `visible` still animates the
          right axis on each breakpoint without any JS breakpoint check. */}
      <div
        className={`absolute inset-0 bg-white flex flex-col
          transition-[transform,opacity] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]
          md:inset-auto md:top-1/2 md:left-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg md:max-h-[85vh] md:rounded-3xl md:shadow-2xl md:overflow-hidden
          ${visible ? 'translate-x-0 md:-translate-x-1/2 md:scale-100 md:opacity-100' : 'translate-x-full md:-translate-x-1/2 md:scale-95 md:opacity-0'}`}
      >
        {/* ── Header ── */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 border-b border-gray-100"
          style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: '12px' }}>
          <button onClick={close} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 -ml-1 md:hidden">
            <ArrowLeft className="w-4 h-4 text-gray-700" />
          </button>
          <p className="text-base font-black text-gray-900">Repost</p>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={close} className="hidden md:flex w-8 h-8 items-center justify-center rounded-full hover:bg-gray-100">
              <X className="w-4 h-4 text-gray-500" />
            </button>
            <button onClick={submit} disabled={posting || !comment.trim()}
              className="px-4 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-black disabled:opacity-40 transition-colors flex items-center gap-1.5">
              {posting && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Post
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
          <div className="flex items-center gap-2.5">
            <UserAvatar user={{ name: user?.name || '', avatar: user?.avatar, id: user?.id }} size={36} />
            <p className="text-sm font-bold text-gray-900">{user?.name}</p>
          </div>
          <textarea
            value={comment} onChange={e => setComment(e.target.value)}
            placeholder="What do you think?" rows={4} autoFocus
            className="w-full text-base text-gray-800 placeholder-gray-400 outline-none resize-none"
          />
          <QuotedPostPreview post={post} />
        </div>
      </div>
    </div>
  ), document.body);
}
