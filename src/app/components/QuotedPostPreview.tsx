// The embedded "original post" shown inside RepostComposer.tsx -- a
// read-only preview (avatar, creator, role/time, caption, media), never
// the full interactive PostCard. No Like/Comment/Repost/Share/Save/
// three-dot menu here on purpose: this is a quote, not a second live post
// card nested inside the composer.
import { UserAvatar } from './AccountTypeBadge';
import type { Post } from '../types';

function timeAgo(dateString?: string | null): string {
  if (!dateString) return '';
  const s = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(dateString).toLocaleDateString();
}

export function QuotedPostPreview({ post }: {
  post: Pick<Post, 'userName' | 'userAvatar' | 'userId' | 'userRole' | 'createdAt' | 'content' | 'images' | 'videos'>;
}) {
  const media = post.images?.[0] || post.videos?.[0];
  const isVideo = !post.images?.[0] && !!post.videos?.[0];
  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
      <div className="flex items-center gap-2.5 p-3 pb-2">
        <UserAvatar user={{ name: post.userName, avatar: post.userAvatar, id: post.userId }} size={32} />
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{post.userName}</p>
          <p className="text-xs text-gray-400 truncate">
            {post.userRole && <span className="capitalize">{post.userRole} · </span>}
            {timeAgo(post.createdAt)}
          </p>
        </div>
      </div>
      {post.content && (
        <p className="px-3 pb-2.5 text-sm text-gray-700 line-clamp-4 whitespace-pre-wrap">{post.content}</p>
      )}
      {media && (
        <div className="w-full max-h-64 bg-gray-100 overflow-hidden">
          {isVideo
            ? <video src={media} className="w-full h-full object-cover" muted playsInline />
            : <img src={media} alt="" className="w-full h-full object-cover" />}
        </div>
      )}
    </div>
  );
}
