// Shared "Connect discovery" data source -- Trending Posts, Featured
// Portfolio, Popular Hashtags, Profiles You May Like. Extracted from
// SearchOverlay.tsx's own Connect-landing effect (which had this logic
// inline) so /search/category/connect (CategoryResults.tsx) can show the
// exact same landing instead of a separate, weaker implementation --
// "one shared search engine," same principle the Marketplace intent
// system and recognizeQuery already established this session. Real
// signals only, never a fabricated/newest-only substitute: getSuggestedCreators
// (same signal set as the Connections hub), postsApi.getTopPosts (real
// likes_count), getPortfolioFeed (already public-only), getTopHashtags
// (real post_count).
import { postsApi } from './api';
import { getSuggestedCreators, getPortfolioFeed, type SuggestedCreator, type PortfolioFeedEntry } from './portfolioApi';
import { getTopHashtags, type Hashtag } from './hashtagsApi';
import type { Post } from '../types';

export interface ConnectDiscovery {
  trendingPosts: Post[];
  featuredPortfolio: PortfolioFeedEntry[];
  popularHashtags: Hashtag[];
  profilesYouMayLike: SuggestedCreator[];
}

/** getSuggestedCreators requires a real userId (not guest-safe -- see its
 *  own comments), so Profiles You May Like is simply empty for a guest
 *  rather than falling back to a weaker/fabricated list. */
export async function fetchConnectDiscovery(userId?: string, limit = 10): Promise<ConnectDiscovery> {
  const [profilesYouMayLike, trendingPosts, featuredPortfolio, popularHashtags] = await Promise.all([
    userId ? getSuggestedCreators(userId, { limit }).catch(() => []) : Promise.resolve([]),
    postsApi.getTopPosts(limit).catch(() => []),
    getPortfolioFeed({ limit, viewerId: userId }).catch(() => []),
    getTopHashtags(12).catch(() => []),
  ]);
  return { trendingPosts, featuredPortfolio, popularHashtags, profilesYouMayLike };
}
