// Connect feed's card for several people's plain Reposts of the SAME
// original, combined into one item (see connectFeed.ts's groupReposts) --
// "avoid showing User B's identical post repeatedly... combine the social
// context... then show one instance of User B's postcard." Never used for
// "repost with thoughts" -- that's a real new post (post_published), always
// its own distinct item, since each person's commentary is different
// content (per spec).
//
// Same real-original rendering as RepostedActivityCard (PostCard/
// PortfolioProjectCard/PortfolioAlbumCard, never a copy) -- this only
// differs in the attribution line above it: overlapping avatars + "A, B
// and N others reposted" instead of a single name.
import { useNavigate } from 'react-router';
import { Repeat2 } from 'lucide-react';
import { UserAvatar } from '../AccountTypeBadge';
import { PostCard } from '../PostCard';
import { PortfolioProjectCard } from './PortfolioProjectCard';
import { PortfolioAlbumCard } from './PortfolioAlbumCard';
import { formatReposterNames, type ConnectFeedItem } from '../../lib/connectFeed';
import type { TrustLevel } from '../../lib/trustApi';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

export function RepostGroupCard({ item, trustLevel, onDeleted }: {
  item: Extract<ConnectFeedItem, { kind: 'repost-group' }>;
  trustLevel?: TrustLevel;
  onDeleted?: (postId: string) => void;
}) {
  const navigate = useNavigate();
  const { actors, targetType, post, portfolioEntry, createdAt } = item;
  const shown = actors.slice(0, 3);

  const Attribution = (
    <div className="flex items-center gap-2 px-1 pb-2 w-full">
      <Repeat2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
      <div className="flex -space-x-2 shrink-0">
        {shown.map(a => (
          <button key={a.id} onClick={() => navigate(`/host/${a.id}`)} className="rounded-full ring-2 ring-white">
            <UserAvatar user={{ id: a.id, name: a.name, avatar: a.avatar_url }} size={20} />
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 truncate">
        <span className="font-bold text-gray-700">{formatReposterNames(actors.map(a => a.name))}</span>
        {' '}reposted · {timeAgo(createdAt)}
      </p>
    </div>
  );

  if (targetType === 'post' && post) {
    return (
      <div>
        {Attribution}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <PostCard post={post} onDeleted={onDeleted} />
        </div>
      </div>
    );
  }

  if (targetType === 'portfolio_item' && portfolioEntry?.type === 'item') {
    return (
      <div>
        {Attribution}
        <PortfolioProjectCard entry={portfolioEntry as Extract<typeof portfolioEntry, { type: 'item' }>} trustLevel={trustLevel} />
      </div>
    );
  }

  if (targetType === 'portfolio_album' && portfolioEntry?.type === 'album') {
    return (
      <div>
        {Attribution}
        <PortfolioAlbumCard entry={portfolioEntry as Extract<typeof portfolioEntry, { type: 'album' }>} trustLevel={trustLevel} />
      </div>
    );
  }

  // Batch fetch still in flight, or failed for this one -- same "briefly
  // undefined" case RepostedActivityCard's own fallback exists for.
  return null;
}
