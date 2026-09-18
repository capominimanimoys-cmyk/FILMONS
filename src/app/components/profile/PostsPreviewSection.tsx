// A small preview of the creator's latest Posts inside the All tab --
// distinct from the dedicated Activity tab (which lists every post).
// Reuses the real PostCard so like/comment/share/save behave identically
// wherever a post appears, per FILMONS's "the composer/card are the same
// everywhere" convention.
import { FileText } from 'lucide-react';
import { PostCard } from '../PostCard';
import type { Post } from '../../types';

const PREVIEW_COUNT = 2;

export function PostsPreviewSection({ posts, isOwner, onViewAll, onDeleted, onLikeToggled }: {
  posts: Post[];
  isOwner: boolean;
  onViewAll: () => void;
  onDeleted?: (id: string) => void;
  onLikeToggled?: (updated: Post) => void;
}) {
  if (!posts.length && !isOwner) return null;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-black text-gray-900 flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-gray-400" /> Posts
        </p>
        {posts.length > 0 && (
          <button onClick={onViewAll} className="text-xs font-bold text-blue-600 hover:underline">
            View all →
          </button>
        )}
      </div>

      {!posts.length ? (
        <p className="text-xs text-gray-400">
          {isOwner ? "You haven't posted anything yet." : 'No posts yet.'}
        </p>
      ) : (
        <div className="-mx-4 space-y-3 border-t border-gray-50 pt-3">
          {posts.slice(0, PREVIEW_COUNT).map(p => (
            <PostCard key={p.id} post={p} onDeleted={onDeleted} onLikeToggled={onLikeToggled} />
          ))}
        </div>
      )}
    </section>
  );
}
