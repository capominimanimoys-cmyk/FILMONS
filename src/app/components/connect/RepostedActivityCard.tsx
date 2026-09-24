// Connect feed's card for a content_reposted event -- a plain Repost (no
// commentary) of a Post or Portfolio item/album. Never a copy: renders the
// REAL, live original (via the exact same PostCard/PortfolioProjectCard/
// PortfolioAlbumCard every other surface uses) under a small "reposted
// this" attribution line, so the original's own likes/comments/repost
// count stay the single source of truth -- reposting never creates a
// second copy of the engagement. A "Repost with your thoughts" instead
// creates its own real post (see PostCard.tsx's handleQuoteRepost) and
// therefore already renders via the ordinary post_published path, not
// this card.
//
// filterVisible() (activityApi.ts) already re-checks the original's live
// visibility on every read, so an entry only ever reaches this component
// when the original still exists and is still public -- if it's later
// deleted or made private, this entry stops arriving here at all, with no
// extra code needed in this file.
import { useNavigate } from 'react-router';
import { Repeat2, BadgeCheck } from 'lucide-react';
import { UserAvatar } from '../AccountTypeBadge';
import { PostCard } from '../PostCard';
import { PortfolioProjectCard } from './PortfolioProjectCard';
import { PortfolioAlbumCard } from './PortfolioAlbumCard';
import type { ActivityEntry } from '../../lib/activityApi';
import type { TrustLevel } from '../../lib/trustApi';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

export function RepostedActivityCard({ entry, trustLevel, onDeleted }: { entry: ActivityEntry; trustLevel?: TrustLevel; onDeleted?: (postId: string) => void }) {
  const navigate = useNavigate();
  const { actor } = entry;

  const Attribution = (
    <button onClick={() => navigate(`/host/${actor.id}`)} className="flex items-center gap-2 px-1 pb-2 text-left w-full">
      <Repeat2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
      <UserAvatar user={{ id: actor.id, name: actor.name, avatar: actor.avatar_url }} size={20} />
      <p className="text-xs text-gray-500 truncate">
        <span className="font-bold text-gray-700">{actor.name}</span>
        {actor.is_verified && <BadgeCheck className="inline w-3 h-3 text-blue-600 fill-blue-100 mx-0.5 -mt-0.5" />}
        {' '}reposted this · {timeAgo(entry.createdAt)}
      </p>
    </button>
  );

  if (entry.targetType === 'post' && entry.post) {
    return (
      <div>
        {Attribution}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <PostCard post={entry.post} onDeleted={onDeleted} hideRepostContext />
        </div>
      </div>
    );
  }

  if (entry.targetType === 'portfolio_item' && entry.portfolioEntry?.type === 'item') {
    return (
      <div>
        {Attribution}
        <PortfolioProjectCard entry={entry.portfolioEntry as Extract<typeof entry.portfolioEntry, { type: 'item' }>} trustLevel={trustLevel} hideRepostContext />
      </div>
    );
  }

  if (entry.targetType === 'portfolio_album' && entry.portfolioEntry?.type === 'album') {
    return (
      <div>
        {Attribution}
        <PortfolioAlbumCard entry={entry.portfolioEntry as Extract<typeof entry.portfolioEntry, { type: 'album' }>} trustLevel={trustLevel} hideRepostContext />
      </div>
    );
  }

  // Batch fetch still in flight, or failed for this one entry -- same
  // "briefly undefined" case PostActivityCard's own fallback exists for.
  return null;
}
