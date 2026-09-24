// Connect's unified feed -- the single shared data/merge layer for BOTH
// mobile and desktop Connect (Home.tsx uses this directly for both
// breakpoints; there is exactly one feed model, one cache, one pagination
// implementation, per spec: "Portfolio content and professional Activity
// should appear together naturally inside one Connect feed," and mobile
// must no longer have its own separate Portfolio/Activity tab split).
// portfolio_published/portfolio_album_published Activity events are
// excluded from the activity-events half of the merge (filtered out below)
// since the same content already arrives, richer and live, via
// getPortfolioFeed -- including them from both sources would double-count
// every portfolio publish.
import { getPortfolioFeed, getPortfolioEntriesByIds, type PortfolioFeedEntry } from './portfolioApi';
import { getActivityFeed, type ActivityEntry, type ActivityActor } from './activityApi';
import { getTrustLevelsBatch, type TrustLevel } from './trustApi';
import { postsApi } from './api';
import type { Post } from '../types';

export type ConnectSort = 'relevant' | 'recent';

export type ConnectFeedItem =
  | { kind: 'portfolio'; entry: PortfolioFeedEntry }
  | { kind: 'activity'; entry: ActivityEntry }
  // Multiple people reposting the SAME original, combined into one item --
  // see groupReposts below. Never used for "repost with thoughts" (that's
  // a real new post_published entry, its own distinct 'activity' item,
  // per spec: each person's commentary is different content).
  | {
      kind: 'repost-group';
      targetType: 'post' | 'portfolio_item' | 'portfolio_album';
      targetId: string;
      /** Most-recent-first, de-duplicated by actor id. */
      actors: ActivityActor[];
      totalActorCount: number;
      createdAt: string;
      post?: Post;
      portfolioEntry?: PortfolioFeedEntry;
    };

function itemTimestamp(item: ConnectFeedItem): number {
  if (item.kind === 'portfolio') return new Date(item.entry.created_at).getTime();
  if (item.kind === 'activity')  return new Date(item.entry.createdAt).getTime();
  return new Date(item.createdAt).getTime();
}

function itemActorId(item: ConnectFeedItem): string {
  if (item.kind === 'portfolio') return item.entry.creator.id;
  if (item.kind === 'activity')  return item.entry.actor.id;
  return item.actors[0]?.id ?? '';
}

// React key for one feed item -- centralized here (rather than a ternary
// re-typed at each .map() call site) now that there are three kinds, not
// two, to keep straight.
export function connectFeedItemKey(item: ConnectFeedItem): string {
  if (item.kind === 'portfolio')     return `portfolio-${item.entry.type}-${item.entry.id}`;
  if (item.kind === 'repost-group')  return `repost-group-${item.targetType}-${item.targetId}`;
  return `activity-${item.entry.id}`;
}

// "A and B reposted" / "A, B and C reposted" / "A, B and N others reposted"
// -- up to 2 named, matching the spec's own example ("User A, User C and 3
// others reposted"). Shared by every surface that renders a repost-group
// item (Connect feed's RepostGroupCard, Connections Activity's compact
// row) so the phrasing never drifts between them.
export function formatReposterNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

// Multiple people reposting the SAME original within one feed page reads as
// noisy near-duplicates (spec: "avoid showing User B's identical post
// repeatedly") -- grouped into one "User A, User C and N others reposted"
// item with a single instance of the original underneath, instead of N
// separate RepostedActivityCards. Scoped to entries already fetched for
// this page (not a standing server-side aggregate) -- reposts of the same
// content spread far apart in time can still land as separate groups on
// different pages. A real, working first pass, not the final word on
// aggregation (same spirit as relevanceScore's own comment above).
function groupReposts(entries: ActivityEntry[]): ConnectFeedItem[] {
  const groups = new Map<string, ActivityEntry[]>();
  const items: ConnectFeedItem[] = [];
  for (const e of entries) {
    if (e.activityType !== 'content_reposted' || !e.targetId || !e.targetType) {
      items.push({ kind: 'activity', entry: e });
      continue;
    }
    const key = `${e.targetType}:${e.targetId}`;
    const list = groups.get(key);
    if (list) list.push(e); else groups.set(key, [e]);
  }
  for (const list of groups.values()) {
    if (list.length === 1) { items.push({ kind: 'activity', entry: list[0] }); continue; }
    const sorted = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const seen = new Set<string>();
    const actors: ActivityActor[] = [];
    for (const e of sorted) {
      if (seen.has(e.actor.id)) continue;
      seen.add(e.actor.id);
      actors.push(e.actor);
    }
    const mostRecent = sorted[0];
    items.push({
      kind: 'repost-group',
      targetType: mostRecent.targetType as 'post' | 'portfolio_item' | 'portfolio_album',
      targetId: mostRecent.targetId!,
      actors,
      totalActorCount: actors.length,
      createdAt: mostRecent.createdAt,
      post: sorted.find(e => e.post)?.post,
      portfolioEntry: sorted.find(e => e.portfolioEntry)?.portfolioEntry,
    });
  }
  return items;
}

// A transparent, explainable first pass at "Most relevant" -- not a black
// box. Combines: recency (exponential decay, ~48h half-life), a small
// bonus for creators the viewer follows, and a small bonus scaled by the
// actor's own Trust Level. This is a client-side re-sort of the already-
// fetched page (same scope as the existing chronological merge), not a
// server-side ranking model -- a reasonable first pass, not the final word
// on relevance; revisit once real engagement-signal infra exists.
const TRUST_WEIGHT: Record<TrustLevel, number> = { new: 0, building_trust: 0.5, reliable: 1, trusted: 1.5, elite: 2 };

function relevanceScore(item: ConnectFeedItem, opts: { followingIds: Set<string>; trustLevels: Map<string, TrustLevel> }): number {
  const ageHours = (Date.now() - itemTimestamp(item)) / 3_600_000;
  const recencyScore = Math.exp(-ageHours / 48) * 10;
  const followBonus = opts.followingIds.has(itemActorId(item)) ? 3 : 0;
  const trustBonus = TRUST_WEIGHT[opts.trustLevels.get(itemActorId(item)) ?? 'new'] ?? 0;
  return recencyScore + followBonus + trustBonus;
}

function mergeAndSort(
  portfolioEntries: PortfolioFeedEntry[], activityEntries: ActivityEntry[],
  sort: ConnectSort, followingIds: Set<string>, trustLevels: Map<string, TrustLevel>,
): ConnectFeedItem[] {
  const items: ConnectFeedItem[] = [
    ...portfolioEntries.map(entry => ({ kind: 'portfolio' as const, entry })),
    // portfolio_published/portfolio_album_published excluded -- see file
    // header. content_reposted entries are grouped by target (see
    // groupReposts above) before everything else passes through as-is.
    ...groupReposts(activityEntries.filter(e => e.activityType !== 'portfolio_published' && e.activityType !== 'portfolio_album_published')),
  ];
  if (sort === 'relevant') {
    return items.sort((a, b) => relevanceScore(b, { followingIds, trustLevels }) - relevanceScore(a, { followingIds, trustLevels }));
  }
  return items.sort((a, b) => itemTimestamp(b) - itemTimestamp(a));
}

export interface ConnectFeedCursor { portfolioCursor?: string; activityCursor?: string; }

export interface ConnectFeedPage {
  items: ConnectFeedItem[];
  cursor: ConnectFeedCursor;
  portfolioHasMore: boolean;
  activityHasMore: boolean;
}

// "Portfolio You May Like" -- a lightweight discovery module inserted a
// few entries into the same unified feed (see Home.tsx), not a full
// ranking engine. Pulls from the same public-portfolio pool "For You"
// already uses, filtered to whatever the viewer isn't already seeing in
// their main feed (excludeIds) and never the viewer's own work. Reuses
// getPortfolioFeed's own ordering (recency-merged) rather than a second
// scoring model -- a real, working first pass, not the final word on
// personalized ranking.
export async function getRecommendedPortfolio(opts: {
  viewerId: string;
  category?: string;
  excludeIds?: Set<string>;
  limit?: number;
}): Promise<PortfolioFeedEntry[]> {
  const limit = opts.limit ?? 8;
  const entries = await getPortfolioFeed({ limit: limit * 3, category: opts.category, viewerId: opts.viewerId });
  const exclude = opts.excludeIds ?? new Set<string>();
  return entries
    .filter(e => e.creator.id !== opts.viewerId && !exclude.has(e.id))
    .slice(0, limit);
}

export async function getConnectFeed(opts: {
  tab: 'foryou' | 'following';
  viewerId?: string;
  followingIds?: string[];
  category?: string;
  subcategory?: string;
  sort?: ConnectSort;
  before?: ConnectFeedCursor;
  limit?: number;
  /** Needed for the 'relevant' sort's trust bonus -- pass an already-warm
   * cache when the caller has one (e.g. across pagination) to avoid
   * redundant lookups; unresolved ids are fetched and merged in. */
  trustLevels?: Map<string, TrustLevel>;
}): Promise<ConnectFeedPage & { trustLevels: Map<string, TrustLevel> }> {
  const limit = opts.limit ?? 20;
  const sort = opts.sort ?? 'relevant';
  const followingIdsArr = opts.followingIds ?? [];

  if (opts.tab === 'following' && !followingIdsArr.length) {
    return { items: [], cursor: {}, portfolioHasMore: false, activityHasMore: false, trustLevels: opts.trustLevels ?? new Map() };
  }

  const [portfolioEntries, activityResult] = await Promise.all([
    getPortfolioFeed({
      limit, before: opts.before?.portfolioCursor,
      authorIds: opts.tab === 'following' ? followingIdsArr : undefined,
      category: opts.category, subcategory: opts.subcategory,
      viewerId: opts.viewerId,
    }),
    getActivityFeed({
      tab: opts.tab, viewerId: opts.viewerId, followingIds: followingIdsArr,
      before: opts.before?.activityCursor, category: opts.category, subcategory: opts.subcategory, limit,
    }),
  ]);

  // Attach the REAL Post (media, likes, portfolio attachment) to every
  // post_published entry so Connect can render the actual PostCard instead
  // of a title-only summary -- one batched fetch per page, not one per
  // card. A post that failed to fetch (e.g. deleted between logging and
  // now) just keeps `post` undefined; the card falls back to its own
  // title-only rendering rather than the whole page failing.
  const postTargetIds = activityResult.entries
    .filter(e => e.targetId && (e.activityType === 'post_published' || (e.activityType === 'content_reposted' && e.targetType === 'post')))
    .map(e => e.targetId as string);

  // Same batching for a content_reposted entry whose original is a
  // Portfolio item/album -- attaches the REAL live PortfolioFeedEntry so
  // Connect can render it via PortfolioProjectCard/PortfolioAlbumCard.
  const repostItemIds = activityResult.entries
    .filter(e => e.activityType === 'content_reposted' && e.targetType === 'portfolio_item' && e.targetId)
    .map(e => e.targetId as string);
  const repostAlbumIds = activityResult.entries
    .filter(e => e.activityType === 'content_reposted' && e.targetType === 'portfolio_album' && e.targetId)
    .map(e => e.targetId as string);

  // actorIds only reads portfolioEntries/activityResult.entries, both
  // already resolved above -- none of these 3 lookups depend on each
  // other's result, so they were needlessly run as 3 sequential round
  // trips before; now one Promise.all.
  const actorIds = [
    ...portfolioEntries.map(e => e.creator.id),
    ...activityResult.entries.flatMap(e => [e.actor.id, e.otherUser?.id].filter((x): x is string => !!x)),
  ];
  const unresolved = [...new Set(actorIds)].filter(id => !opts.trustLevels?.has(id));

  const [realPosts, repostEntryMap, freshLevels] = await Promise.all([
    postTargetIds.length ? postsApi.getByIds([...new Set(postTargetIds)]) : Promise.resolve([]),
    (repostItemIds.length || repostAlbumIds.length)
      ? getPortfolioEntriesByIds([...new Set(repostItemIds)], [...new Set(repostAlbumIds)], opts.viewerId)
      : Promise.resolve(new Map<string, PortfolioFeedEntry>()),
    unresolved.length ? getTrustLevelsBatch(unresolved) : Promise.resolve(new Map<string, TrustLevel>()),
  ]);

  if (postTargetIds.length) {
    const postMap = new Map(realPosts.map(p => [p.id, p]));
    activityResult.entries = activityResult.entries.map(e =>
      e.targetId && postMap.has(e.targetId) && (e.activityType === 'post_published' || (e.activityType === 'content_reposted' && e.targetType === 'post'))
        ? { ...e, post: postMap.get(e.targetId) }
        : e,
    );
  }
  if (repostItemIds.length || repostAlbumIds.length) {
    activityResult.entries = activityResult.entries.map(e =>
      e.activityType === 'content_reposted' && e.targetId
        && (e.targetType === 'portfolio_item' || e.targetType === 'portfolio_album') && repostEntryMap.has(e.targetId)
        ? { ...e, portfolioEntry: repostEntryMap.get(e.targetId) }
        : e,
    );
  }
  const trustLevels = new Map([...(opts.trustLevels ?? new Map()), ...freshLevels]);

  const followingSet = new Set(followingIdsArr);
  const items = mergeAndSort(portfolioEntries, activityResult.entries, sort, followingSet, trustLevels);

  return {
    items,
    cursor: {
      portfolioCursor: portfolioEntries.length ? portfolioEntries[portfolioEntries.length - 1].created_at : opts.before?.portfolioCursor,
      activityCursor: activityResult.cursor ?? opts.before?.activityCursor,
    },
    portfolioHasMore: portfolioEntries.length === limit,
    activityHasMore: activityResult.entries.length === limit,
    trustLevels,
  };
}
