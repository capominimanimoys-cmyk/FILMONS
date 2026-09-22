// Picks the right card design for one merged Connect feed item. The merge
// itself (Portfolio items/albums + Activity events, chronologically
// interleaved) lives in lib/connectFeed.ts, reusing the exact same
// getPortfolioFeed/getActivityFeed sources Home's mobile "All" tab uses --
// one feed-fetching implementation, two different presentations.
import type { PortfolioFeedEntry } from '../../lib/portfolioApi';
import type { TrustLevel } from '../../lib/trustApi';
import type { ConnectFeedItem } from '../../lib/connectFeed';
import { PortfolioProjectCard } from './PortfolioProjectCard';
import { PortfolioAlbumCard } from './PortfolioAlbumCard';
import { ServiceActivityCard } from './ServiceActivityCard';
import { OpportunityActivityCard } from './OpportunityActivityCard';
import { ConnectionActivityCard } from './ConnectionActivityCard';
import { RecommendationActivityCard } from './RecommendationActivityCard';
import { PostActivityCard } from './PostActivityCard';
import { RepostedActivityCard } from './RepostedActivityCard';
import { RepostGroupCard } from './RepostGroupCard';

export type { ConnectFeedItem };

export function ConnectFeedCard({ item, trustLevels }: {
  item: ConnectFeedItem;
  /** Batched, keyed by user id -- see lib/connectFeed.ts's trust-level
   * batching. Connection cards need BOTH parties' levels. */
  trustLevels: Map<string, TrustLevel>;
}) {
  if (item.kind === 'portfolio') {
    const trustLevel = trustLevels.get(item.entry.creator.id);
    return item.entry.type === 'item'
      ? <PortfolioProjectCard entry={item.entry as Extract<PortfolioFeedEntry, { type: 'item' }>} trustLevel={trustLevel} />
      : <PortfolioAlbumCard entry={item.entry as Extract<PortfolioFeedEntry, { type: 'album' }>} trustLevel={trustLevel} />;
  }

  if (item.kind === 'repost-group') {
    const trustLevel = trustLevels.get(item.actors[0]?.id ?? '');
    return <RepostGroupCard item={item} trustLevel={trustLevel} />;
  }

  const entry = item.entry;
  const trustLevel = trustLevels.get(entry.actor.id);
  switch (entry.activityType) {
    case 'service_published':
    case 'listing_published':
      return <ServiceActivityCard entry={entry} trustLevel={trustLevel} />;
    case 'opportunity_published':
      return <OpportunityActivityCard entry={entry} trustLevel={trustLevel} />;
    case 'connection_created':
      // Connection Post Cards temporarily removed from every feed --
      // getActivityFeed already excludes activity_type='connection_created'
      // at the query level; this is just a second guard so a stray/cached
      // entry can never render one. ConnectionActivityCard itself is left
      // in place (unused for now), not deleted, so this is easy to revert.
      return null;
    case 'recommendation_received':
      return <RecommendationActivityCard entry={entry} trustLevel={trustLevel} />;
    case 'post_published':
      return <PostActivityCard entry={entry} trustLevel={trustLevel} />;
    case 'content_reposted':
      return <RepostedActivityCard entry={entry} trustLevel={trustLevel} />;
    default:
      return null; // portfolio_published/portfolio_album_published never reach here -- 'activity' kind excludes them (see connectFeed.ts)
  }
}
