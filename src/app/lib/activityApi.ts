// Connect -> Activity: real network-activity events (see
// supabase/migrations/20240502000000_activity_events.sql,
// 20240503000000_activity_events_add_post.sql). Every entry is a typed,
// resource-linked event (never a raw dump of a source table), and every
// read re-verifies the underlying resource is STILL public right now, not
// just at the moment it was logged (a later hide/delete/privacy change on
// the resource makes its Activity entry disappear without touching this
// table). `posts` is one of several source tables an event can point at
// (alongside portfolio_items/portfolio_albums/listings/connections/
// recommendations) -- this is unrelated to, and doesn't change, Connect ->
// Portfolio, which still reads exclusively from portfolio_items/
// portfolio_albums per its own spec.
import { supabase } from '../../lib/supabase';

export type ActivityType =
  | 'portfolio_published' | 'portfolio_album_published' | 'service_published'
  | 'opportunity_published' | 'listing_published' | 'connection_created'
  | 'recommendation_received' | 'post_published';

export interface ActivityActor {
  id: string; name: string; username: string | null; avatar_url: string | null; is_verified: boolean;
}

// Extra cached display fields for card types richer than title/category
// alone can support (the Service/Opportunity cards' price/location/tags).
// Deliberately NOT used for portfolio_published/portfolio_album_published
// -- those cards fetch the live PortfolioItem/PortfolioAlbum instead, since
// likes/comments/description must stay live, not frozen at publish time.
export interface ActivityMetadata {
  price?: number;
  city?: string;
  listingMode?: string;
  serviceCategory?: string;
  workArrangement?: string;
  paid?: boolean;
  compensationType?: string;
  tags?: string[];
}

export interface ActivityEntry {
  id: string;
  activityType: ActivityType;
  actor: ActivityActor;
  otherUser: ActivityActor | null;
  targetType: string | null;
  targetId: string | null;
  category: string | null;
  title: string | null;
  metadata: ActivityMetadata | null;
  createdAt: string;
}

// Fire-and-forget -- called from the single convergence point each event
// type is actually created at (AddPortfolioItemSheet, CreateAlbumSheet,
// listingsApi.create). connection_created/recommendation_received are
// logged server-side (DB triggers) instead, since those can be created
// from either party's client.
export async function logActivityEvent(params: {
  actorId: string; activityType: ActivityType; targetType: string; targetId: string;
  category?: string | null; subcategory?: string | null; title?: string | null;
  metadata?: ActivityMetadata | null;
}): Promise<void> {
  try {
    const { error } = await supabase.from('activity_events').insert({
      actor_id: params.actorId,
      activity_type: params.activityType,
      target_type: params.targetType,
      target_id: params.targetId,
      category: params.category ?? null,
      subcategory: params.subcategory ?? null,
      title: params.title ?? null,
      metadata: params.metadata ?? null,
    });
    // Logged, not swallowed -- this insert failing (e.g. a CHECK constraint
    // rejecting an activity_type value the DB hasn't been migrated to allow
    // yet) previously left zero trace anywhere, which is exactly what made
    // "the event just never shows up" impossible to diagnose from the UI.
    if (error) console.warn(`[activityApi] logActivityEvent(${params.activityType}) failed:`, error.message);
  } catch (e) {
    console.warn(`[activityApi] logActivityEvent(${params.activityType}) threw:`, e);
  }
}

const PAGE_FETCH_MULTIPLIER = 2; // over-fetch to absorb rows filtered out by the visibility recheck

async function fetchProfilesAndTrust(ids: string[]): Promise<Map<string, ActivityActor>> {
  if (!ids.length) return new Map();
  const { data } = await supabase.from('profiles')
    .select('id, name, username, avatar_url, is_verified').in('id', ids);
  return new Map((data ?? []).map((p: any) => [p.id, p as ActivityActor]));
}

// Re-verifies every referenced resource is still public. Returns the
// subset of `rows` that pass, in the same order.
async function filterVisible(rows: any[]): Promise<any[]> {
  const portfolioItemIds = rows.filter(r => r.target_type === 'portfolio_item').map(r => r.target_id);
  const albumIds = rows.filter(r => r.target_type === 'portfolio_album').map(r => r.target_id);
  const listingIds = rows.filter(r => r.target_type === 'listing').map(r => r.target_id);
  const connectionIds = rows.filter(r => r.target_type === 'connection').map(r => r.target_id);
  const recommendationIds = rows.filter(r => r.target_type === 'recommendation').map(r => r.target_id);
  const postIds = rows.filter(r => r.target_type === 'post').map(r => r.target_id);

  // Every branch logs its own error instead of silently collapsing to []
  // via `?? []` -- a query failing (e.g. an unexpected/renamed column) used
  // to be indistinguishable from "the resource genuinely isn't public",
  // which made a real bug here look identical to correct privacy filtering.
  const checked = (label: string) => (r: { data: any[] | null; error: any }) => {
    if (r.error) console.warn(`[activityApi] filterVisible(${label}) query failed:`, r.error.message);
    return r.data ?? [];
  };

  const [itemRows, albumRows, albumItemCounts, listingRows, connectionRows, recommendationRows, postRows] = await Promise.all([
    portfolioItemIds.length
      ? supabase.from('portfolio_items').select('id, user_id, is_hidden').in('id', portfolioItemIds).then(checked('portfolio_items'))
      : Promise.resolve([]),
    albumIds.length
      ? supabase.from('portfolio_albums').select('id, user_id, visibility').in('id', albumIds).then(checked('portfolio_albums'))
      : Promise.resolve([]),
    albumIds.length
      ? supabase.from('portfolio_album_items').select('album_id').in('album_id', albumIds).then(checked('portfolio_album_items'))
      : Promise.resolve([]),
    listingIds.length
      ? supabase.from('listings').select('id, is_active, moderation_status').in('id', listingIds).then(checked('listings'))
      : Promise.resolve([]),
    connectionIds.length
      ? supabase.from('professional_connections').select('id, status').in('id', connectionIds).then(checked('professional_connections'))
      : Promise.resolve([]),
    recommendationIds.length
      ? supabase.from('recommendations').select('id').in('id', recommendationIds).then(checked('recommendations'))
      : Promise.resolve([]),
    // `id` only -- NOT `visibility`. `posts` is an untracked, live-only
    // table (no CREATE TABLE in this repo's migration history), so a
    // `visibility` column can't be confirmed to actually exist; selecting
    // an unknown column errors the whole query, which previously zeroed
    // out postMap and silently dropped every post_published event. An
    // existence check alone still satisfies "a deleted post's Activity
    // entry disappears" -- postsApi.create() has no private-post option
    // today (it unconditionally writes visibility:'public'), so there is
    // no real privacy gate being skipped by dropping this column.
    postIds.length
      ? supabase.from('posts').select('id').in('id', postIds).then(checked('posts'))
      : Promise.resolve([]),
  ]);

  // Portfolio items/albums also depend on the OWNER's creator-level
  // portfolio_settings.visibility -- same "missing row = public" default
  // getPortfolioFeed() already uses.
  const ownerIds = [...new Set([...itemRows.map((r: any) => r.user_id), ...albumRows.map((r: any) => r.user_id)])];
  const { data: settingsRows } = ownerIds.length
    ? await supabase.from('portfolio_settings').select('user_id, visibility').in('user_id', ownerIds)
    : { data: [] as any[] };
  const nonPublicOwners = new Set((settingsRows ?? []).filter((s: any) => s.visibility !== 'public').map((s: any) => s.user_id));

  const itemMap = new Map(itemRows.map((r: any) => [r.id, r]));
  const albumMap = new Map(albumRows.map((r: any) => [r.id, r]));
  const albumHasItems = new Set((albumItemCounts as any[]).map(r => r.album_id));
  const listingMap = new Map(listingRows.map((r: any) => [r.id, r]));
  const connectionMap = new Map(connectionRows.map((r: any) => [r.id, r]));
  const recommendationIdSet = new Set(recommendationRows.map((r: any) => r.id));
  const postMap = new Map((postRows as any[]).map(r => [r.id, r]));

  return rows.filter(r => {
    switch (r.target_type) {
      case 'post':
        return postMap.has(r.target_id); // existence check only -- see the query comment above
      case 'portfolio_item': {
        const item = itemMap.get(r.target_id);
        return !!item && !item.is_hidden && !nonPublicOwners.has(item.user_id);
      }
      case 'portfolio_album': {
        const album = albumMap.get(r.target_id);
        return !!album && album.visibility === 'public' && !nonPublicOwners.has(album.user_id) && albumHasItems.has(r.target_id);
      }
      case 'listing': {
        const listing = listingMap.get(r.target_id);
        return !!listing && listing.is_active !== false && listing.moderation_status !== 'removed' && listing.moderation_status !== 'paused';
      }
      case 'connection': {
        const conn = connectionMap.get(r.target_id);
        return !!conn && conn.status === 'accepted';
      }
      case 'recommendation':
        return recommendationIdSet.has(r.target_id);
      default:
        return false;
    }
  });
}

export async function getActivityFeed(params: {
  tab: 'foryou' | 'following';
  viewerId?: string;
  followingIds?: string[];
  before?: string;
  limit?: number;
  /** Filters by the creative CATEGORY of the underlying resource, never by
   * activity type (per spec: category chips are a creative-interest filter,
   * not a "show me connection_created events" filter). Same taxonomy/
   * resolution as Portfolio's category chips (resolveCategoryFilter). */
  category?: string;
  subcategory?: string;
}): Promise<{ entries: ActivityEntry[]; cursor?: string }> {
  const limit = params.limit ?? 20;
  let q = supabase.from('activity_events').select('*').order('created_at', { ascending: false }).limit(limit * PAGE_FETCH_MULTIPLIER);
  if (params.before) q = q.lt('created_at', params.before);
  if (params.category) q = q.eq('category', params.category);
  if (params.subcategory) q = q.eq('subcategory', params.subcategory);

  if (params.tab === 'following') {
    if (!params.followingIds?.length) return { entries: [] }; // no fallback to For You -- proper empty state instead, per spec
    q = q.in('actor_id', params.followingIds);
  } else if (params.viewerId) {
    q = q.neq('actor_id', params.viewerId); // "what your network is doing", not your own activity reflected back at you
  }

  const { data, error } = await q;
  if (error) console.warn('[activityApi] getActivityFeed query failed:', error.message);
  if (error || !data?.length) return { entries: [] };

  const visible = (await filterVisible(data)).slice(0, limit);
  if (!visible.length) return { entries: [], cursor: data[data.length - 1]?.created_at };

  const actorIds = [...new Set(visible.map(r => r.actor_id))];
  const otherIds = [...new Set(visible.map(r => r.other_user_id).filter(Boolean))];
  const [actorMap, otherMap] = await Promise.all([fetchProfilesAndTrust(actorIds), fetchProfilesAndTrust(otherIds)]);

  const entries: ActivityEntry[] = visible
    .map(r => {
      const actor = actorMap.get(r.actor_id);
      if (!actor) return null;
      return {
        id: r.id,
        activityType: r.activity_type,
        actor,
        otherUser: r.other_user_id ? (otherMap.get(r.other_user_id) ?? null) : null,
        targetType: r.target_type,
        targetId: r.target_id,
        category: r.category,
        title: r.title,
        metadata: r.metadata ?? null,
        createdAt: r.created_at,
      };
    })
    .filter((e): e is ActivityEntry => e !== null);

  return { entries, cursor: data[data.length - 1]?.created_at };
}

export function getActivitySentence(entry: Pick<ActivityEntry, 'activityType' | 'otherUser'>): string {
  switch (entry.activityType) {
    case 'portfolio_published': return 'added a new Portfolio project';
    case 'portfolio_album_published': return 'published a new Portfolio album';
    case 'service_published': return 'started offering a new service';
    case 'opportunity_published': return 'posted a new paid opportunity';
    case 'listing_published': return 'posted a new listing';
    case 'connection_created': return entry.otherUser ? `completed a professional connection with ${entry.otherUser.name}` : 'made a new professional connection';
    case 'recommendation_received': return 'received a new professional recommendation';
    case 'post_published': return 'shared a new post';
  }
}
