import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase';
import { ChevronLeft, Heart } from 'lucide-react';
import { Post, Comment } from '../types';
import { PostCard } from '../components/PostCard';
import { commentsApi, postsApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { UserAvatar } from '../components/AccountTypeBadge';

export function PostDetail() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const inputRef  = useRef<HTMLInputElement>(null);

  const [post,         setPost]         = useState<any | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [comments,     setComments]     = useState<Comment[]>([]);
  const [loadingCmts,  setLoadingCmts]  = useState(false);
  const [newComment,   setNewComment]   = useState('');
  const [submitting,   setSubmitting]   = useState(false);

  // Fetch post directly with all fields
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('posts')
          .select('*, profiles!author_id(id,name,username,avatar_url,account_type)')
          .eq('id', id)
          .single();
        if (error || !data) throw error;
        const prof = (data.profiles as any) || {};
        const mu   = Array.isArray(data.media_urls) ? data.media_urls : [];
        setPost({
          ...data,
          userId:          data.author_id,
          userName:        prof.name || prof.username || '',
          userAvatar:      prof.avatar_url,
          userAccountType: prof.account_type,
          images:          data.post_type === 'video' ? [] : mu,
          videos:          data.post_type === 'video' ? mu : mu.filter((u: string) => /\.(mp4|mov|webm)/i.test(u)),
          audioTitle:      data.audio_title,
          audioArtist:     data.audio_artist,
          audioId:         data.audio_id,
          audio_url:       data.audio_url,
          listingId:       data.listing_id,
          listingTitle:    data.listing_title,
          listingPrice:    data.listing_price,
          listingMode:     data.listing_mode,
          listingCity:     data.listing_city,
          listingImage:    data.listing_image,
          listingPins:     data.listing_pins,
          tagPins:         data.tag_pins,
          likes:           Array.isArray(data.likes) ? data.likes : [],
          likesCount:      data.likes_count ?? 0,
          content:         data.content || data.caption || '',
        });
      } catch {
        postsApi.getAll().then(posts => setPost(posts.find(p => p.id === id) || null)).catch(() => {});
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Fetch comments
  useEffect(() => {
    if (!id) return;
    setLoadingCmts(true);
    commentsApi.getPostComments(id).then(setComments).catch(() => {}).finally(() => setLoadingCmts(false));
  }, [id]);

  const handleComment = async () => {
    if (!user || !newComment.trim() || !post) return;
    setSubmitting(true);
    try {
      const c = await commentsApi.add(post.id, newComment.trim());
      setComments(prev => [c, ...prev]);
      setNewComment('');
    } catch { /* silent */ }
    finally { setSubmitting(false); }
  };

  const handleCommentLike = async (commentId: string) => {
    if (!user) return;
    setComments(prev => prev.map(c =>
      c.id === commentId
        ? { ...c, likes: (c.likes || []).includes(user.id)
            ? (c.likes || []).filter(id => id !== user.id)
            : [...(c.likes || []), user.id] }
        : c
    ));
    try {
      const updated = await commentsApi.toggleCommentLike(commentId);
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, likes: updated } : c));
    } catch {
      // rollback on failure
      setComments(prev => prev.map(c =>
        c.id === commentId
          ? { ...c, likes: (c.likes || []).includes(user.id)
              ? (c.likes || []).filter(id => id !== user.id)
              : [...(c.likes || []), user.id] }
          : c
      ));
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!post) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
      <p className="text-gray-400">Post not found</p>
      <button onClick={() => navigate(-1)} className="text-blue-500 text-sm">Go back</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-white" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 pt-12 pb-3"
        style={{ background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #f3f4f6' }}>
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <p className="text-sm font-black text-gray-900">Post</p>
      </div>

      {/* Post card — identical to feed */}
      <PostCard post={post} />

      {/* Comments */}
      <div className="px-4 py-4 border-t border-gray-100">
        <p className="text-sm font-black text-gray-900 mb-4">
          Comments {comments.length > 0 && <span className="text-gray-400 font-normal ml-1">({comments.length})</span>}
        </p>

        {loadingCmts ? (
          <div className="flex justify-center py-6">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No comments yet. Be the first!</p>
        ) : (
          <div className="space-y-3">
            {comments.map(c => {
              const isLiked = user ? (c.likes || []).includes(user.id) : false;
              const likeCount = (c.likes || []).length;
              return (
                <div key={c.id} className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden shrink-0">
                    {(c as any).userAvatar
                      ? <img src={(c as any).userAvatar} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-xs font-black text-gray-400">
                          {((c as any).userName || '?')[0].toUpperCase()}
                        </div>}
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-2xl px-3 py-2.5">
                    <p className="text-xs font-black text-gray-900">{(c as any).userName}</p>
                    <p className="text-sm text-gray-700 mt-0.5 leading-relaxed">{c.content}</p>
                  </div>
                  {/* Like button */}
                  <button
                    onClick={() => handleCommentLike(c.id)}
                    className="flex flex-col items-center gap-0.5 pt-1 shrink-0"
                  >
                    <Heart
                      className="w-4 h-4 transition-all"
                      fill={isLiked ? '#ef4444' : 'none'}
                      stroke={isLiked ? '#ef4444' : '#9ca3af'}
                    />
                    {likeCount > 0 && (
                      <span className="text-[10px] text-gray-400 leading-none">{likeCount}</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Comment input */}
        {user && (
          <div className="flex items-center gap-2.5 mt-4">
            <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden shrink-0">
              {user.avatar
                ? <img src={user.avatar} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-xs font-black text-gray-400">
                    {(user.name || '?')[0].toUpperCase()}
                  </div>}
            </div>
            <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-2xl px-3 py-2.5">
              <input
                ref={inputRef}
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleComment()}
                placeholder="Add a comment…"
                className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
              />
              {newComment.trim() && (
                <button onClick={handleComment} disabled={submitting}
                  className="text-xs font-black text-blue-500 disabled:opacity-50 shrink-0">
                  {submitting ? '…' : 'Post'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="h-20" />
    </div>
  );
}