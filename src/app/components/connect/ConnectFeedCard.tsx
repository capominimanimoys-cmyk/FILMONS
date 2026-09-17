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

  const entry = item.entry;
  const trustLevel = trustLevels.get(entry.actor.id);
  switch (entry.activityType) {
    case 'service_published':
    case 'listing_published':
      return <ServiceActivityCard entry={entry} trustLevel={trustLevel} />;
    case 'opportunity_published':
      return <OpportunityActivityCard entry={entry} trustLevel={trustLevel} />;
    case 'connection_created':
      return <ConnectionActivityCard entry={entry} trustLevel={trustLevel} otherTrustLevel={entry.otherUser ? trustLevels.get(entry.otherUser.id) : undefined} />;
    case 'recommendation_received':
      return <RecommendationActivityCard entry={entry} trustLevel={trustLevel} />;
    case 'post_published':
      return <PostActivityCard entry={entry} trustLevel={trustLevel} />;
    default:
      return null; // portfolio_published/portfolio_album_published never reach here -- 'activity' kind excludes them (see connectFeed.ts)
  }
}
