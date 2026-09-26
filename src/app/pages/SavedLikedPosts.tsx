// Dedicated full list for Profile Activity's "Saved Posts" / "Liked Posts"
// preview sections (which only ever show the first 3 + a "See all" link) --
// same idea as LikedItems.tsx for listings/creators, but posts render as
// real PostCards (richer than a compact row) since that's the established
// FILMONS post-rendering component everywhere else.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Bookmark, Heart, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { savedPostsApi, postsApi } from '../lib/api';
import { PostCard } from '../components/PostCard';
import type { Post } from '../types';

export function SavedLikedPosts({ type }: { type: 'saved' | 'liked' }) {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login', { replace: true }); return; }
    if (!user?.id) return;
    setLoading(true);
    const fetcher = type === 'saved' ? savedPostsApi.getSaved(user.id) : postsApi.getLikedPosts(user.id);
    fetcher.then(rows => setPosts(rows), () => setPosts([])).finally(() => setLoading(false));
  }, [user?.id, isAuthenticated, type]); // eslint-disable-line

  if (!isAuthenticated || !user) return null;
  const isSaved = type === 'saved';

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 -ml-2 mb-2">
        <ArrowLeft className="w-4 h-4 text-gray-500" />
      </button>
      <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
        {isSaved ? <Bookmark className="w-5 h-5" /> : <Heart className="w-5 h-5" />}
        {isSaved ? 'Saved Posts' : 'Liked Posts'}
      </h1>
      <p className="text-sm text-gray-400 mt-1">{posts.length} {posts.length === 1 ? 'post' : 'posts'}</p>

      <div className="mt-5">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-blue-400 animate-spin" /></div>
        ) : posts.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-12 text-center text-sm text-gray-400">
            {isSaved
              ? <><Bookmark className="w-8 h-8 mx-auto mb-2 text-gray-300" />Save posts to find them here later.</>
              : <><Heart className="w-8 h-8 mx-auto mb-2 text-gray-300" />Posts you like will show up here.</>}
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map(p => (
              <PostCard
                key={p.id}
                post={p}
                onDeleted={(id) => setPosts(prev => prev.filter(x => x.id !== id))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
