// Shared "Connect discovery" data source -- Trending Posts, Featured
// Portfolio, Profiles You May Like. Extracted from SearchOverlay.tsx's own
// Connect-landing effect (which had this logic inline) so
// /search/category/connect (CategoryResults.tsx) can show the exact same
// landing instead of a separate, weaker implementation -- "one shared
// search engine," same principle the Marketplace intent system and
// recognizeQuery already established this session. Real signals only,
// never a fabricated/newest-only substitute: getSuggestedCreators (same
// signal set as the Connections hub), postsApi.getTrendingPosts (real
// engagement, time-decayed), getPortfolioFeed (already public-only). Hashtags are
// deliberately NOT part of Connect discovery -- they're a global,
// cross-product entity (see /search/hashtags/:slug), never Connect content.
import { postsApi } from './api';
import { getSuggestedCreators, getPortfolioFeed, type SuggestedCreator, type PortfolioFeedEntry } from './portfolioApi';
import type { Post } from '../types';

export interface ConnectDiscovery {
  trendingPosts: Post[];
  featuredPortfolio: PortfolioFeedEntry[];
  profilesYouMayLike: SuggestedCreator[];
}

/** getSuggestedCreators requires a real userId (not guest-safe -- see its
 *  own comments), so Profiles You May Like is simply empty for a guest
 *  rather than falling back to a weaker/fabricated list. */
export async function fetchConnectDiscovery(userId?: string, limit = 10): Promise<ConnectDiscovery> {
  const [profilesYouMayLike, trendingPosts, featuredPortfolio] = await Promise.all([
    userId ? getSuggestedCreators(userId, { limit }).catch(() => []) : Promise.resolve([]),
    postsApi.getTrendingPosts(limit).catch(() => []),
    getPortfolioFeed({ limit, viewerId: userId }).catch(() => []),
  ]);
  return { trendingPosts, featuredPortfolio, profilesYouMayLike };
}

// Last result per viewer, kept in memory so reopening the Connect page paints
// instantly (stale-while-revalidate) while the fresh data loads behind it.
const cache = new Map<string, { at: number; data: Partial<ConnectDiscovery> }>();
const CACHE_TTL_MS = 10 * 60_000;
export function getCachedConnectDiscovery(userId?: string): Partial<ConnectDiscovery> | null {
  const e = cache.get(userId ?? '');
  return e && Object.keys(e.data).length && Date.now() - e.at < CACHE_TTL_MS ? e.data : null;
}

/** Same three sources as fetchConnectDiscovery, but each one is reported the
 *  moment IT finishes instead of all three waiting on the slowest (usually the
 *  trending-posts hydration or the suggested-creators lookup). A section can
 *  therefore appear as soon as its own data is ready. Resolves when all are done. */
export async function streamConnectDiscovery(
  userId: string | undefined,
  limit: number,
  onPart: (part: Partial<ConnectDiscovery>) => void,
): Promise<void> {
  const entry = cache.get(userId ?? '') ?? { at: 0, data: {} as Partial<ConnectDiscovery> };
  cache.set(userId ?? '', entry);
  const report = (part: Partial<ConnectDiscovery>) => { entry.data = { ...entry.data, ...part }; entry.at = Date.now(); onPart(part); };
  await Promise.all([
    (userId ? getSuggestedCreators(userId, { limit }).catch(() => [] as SuggestedCreator[]) : Promise.resolve([] as SuggestedCreator[]))
      .then(profilesYouMayLike => report({ profilesYouMayLike })),
    postsApi.getTrendingPosts(limit).catch(() => [] as Post[]).then(trendingPosts => report({ trendingPosts })),
    getPortfolioFeed({ limit, viewerId: userId }).catch(() => [] as PortfolioFeedEntry[]).then(featuredPortfolio => report({ featuredPortfolio })),
  ]);
}
