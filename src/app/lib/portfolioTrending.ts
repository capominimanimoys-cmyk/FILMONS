// Trending portfolio work: engagement weighted by freshness, so a well-liked
// piece from this week outranks an older one with the same likes. Shared by
// the Connect > Portfolio page and Browse search's "portfolio" intent.
import { getPortfolioFeed, type PortfolioFeedEntry } from './portfolioApi';

export function trendingScore(e: PortfolioFeedEntry, now = Date.now()): number {
  const m: any = e.type === 'item' ? e.item : e.album;
  const engagement = (m.likes_count ?? 0) * 3 + (m.comments_count ?? 0) * 4 + (m.reposts_count ?? 0) * 5
    + (m.saves_count ?? 0) * 4 + (m.views_count ?? 0) * 0.2 + 1;
  const ageHours = Math.max(0, (now - new Date(e.created_at).getTime()) / 3_600_000);
  return engagement / Math.pow(ageHours + 2, 1.3);
}

export function rankTrending(entries: PortfolioFeedEntry[]): PortfolioFeedEntry[] {
  const now = Date.now();
  return [...entries].sort((a, b) => trendingScore(b, now) - trendingScore(a, now));
}

/** "portfolio" / "portfolios" typed on its own means "show me portfolios". */
export function isPortfolioIntent(query: string): boolean {
  return /^portfolios?$/i.test(query.trim());
}

export async function getTrendingPortfolio(limit: number, viewerId?: string): Promise<PortfolioFeedEntry[]> {
  const pool = await getPortfolioFeed({ limit: Math.max(30, limit), viewerId });
  return rankTrending(pool).slice(0, limit);
}
