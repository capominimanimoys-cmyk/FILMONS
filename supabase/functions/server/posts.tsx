/**
 * posts.tsx — Direct Postgres CRUD on the `posts` table.
 *
 * Reads likes from `post_likes` table (with metadata.likes as fallback).
 * Joins `profiles` so author name/avatar are always available.
 */
import { sql } from "./db.tsx";
const genId = () => crypto.randomUUID();
const JSONB_COLS = new Set(["media", "metadata"]);

// ── helpers ───────────────────────────────────────────────────────────────────
function safeJson(val: any, fallback: any): any {
  if (val == null) return fallback;
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return fallback; } }
  return val;
}

// ── Format converters ─────────────────────────────────────────────────────────

/** DB row → app Post shape.
 *  _pname / _pavatar / _paccount / _likes come from JOIN columns. */
function rowToPost(row: any): any {
  const meta     = safeJson(row.metadata, {});
  const mediaArr = safeJson(row.media, []);
  const media    = Array.isArray(mediaArr) ? mediaArr : [];

  // Author: profile join (live name from DB) takes priority; metadata is fallback for old/legacy users
  const pname        = row._pname && row._pname !== '' ? row._pname : null;
  const pusername    = row._pusername && row._pusername !== '' ? row._pusername : null;
  const userName     = pname || pusername || meta.userName || "";
  const userAvatar   = (row._pavatar && row._pavatar !== '') ? row._pavatar : (meta.userAvatar || undefined);
  const userAccountType = row._paccount ?? meta.userAccountType ?? undefined;

  // Likes: ONLY from post_likes aggregate
  // postgres.js returns text[] subquery results as a JS array OR as the string "{uuid1,uuid2}"
  // depending on driver version — handle both formats.
  const likesRaw = row._likes;
  const likes: string[] = (() => {
    if (Array.isArray(likesRaw)) return likesRaw.filter(Boolean);
    if (typeof likesRaw === "string") {
      const s = likesRaw.trim();
      if (s === "{}" || s === "") return [];
      // postgres array format: {uuid1,uuid2,...}
      if (s.startsWith("{") && s.endsWith("}")) {
        return s.slice(1, -1).split(",").map(v => v.trim().replace(/^"|"$/g, "")).filter(Boolean);
      }
      // fallback: try JSON parse
      try { const p = JSON.parse(s); return Array.isArray(p) ? p.filter(Boolean) : []; } catch {}
    }
    return [];
  })();

  const images     = media.filter((m: any) => m.type === "image").map((m: any) => m.url);
  const videos     = media.filter((m: any) => m.type === "video").map((m: any) => m.url);
  const gifs       = media.filter((m: any) => m.type === "gif").map((m: any) => m.url);
  const audios     = media.filter((m: any) => m.type === "audio").map((m: any) => m.url);
  const audioNames = media.filter((m: any) => m.type === "audio").map((m: any) => m.name ?? "");

  return {
    id:              row.id,
    userId:          row.author_id,
    userName,
    userAccountType,
    userAvatar,
    content:         row.content ?? "",
    images,
    videos,
    gifs,
    audios,
    audioNames,
    taggedUserIds:   meta.taggedUserIds  ?? [],
    allowComments:   meta.allowComments  !== false,
    allowDownload:   meta.allowDownload  !== false,
    link:            meta.link           ?? undefined,
    likes,
    // posts.likes_count is authoritative — kept in sync by the like route
    likesCount: typeof row.likes_count === "number" ? row.likes_count : 0,
    repostOf:        meta.repostOf       ?? undefined,
    repostCount:     typeof row._repost_count === "number" ? row._repost_count : 0,
    createdAt:       row.created_at,
  };
}

function postToDbFields(data: any): Record<string, any> {
  const media: any[] = [
    ...(data.images  ?? []).map((url: string)            => ({ type: "image", url })),
    ...(data.videos  ?? []).map((url: string, i: number) => ({ type: "video", url, name: (data.videoNames ?? [])[i] ?? "" })),
    ...(data.gifs    ?? []).map((url: string)            => ({ type: "gif",   url })),
    ...(data.audios  ?? []).map((url: string, i: number) => ({ type: "audio", url, name: (data.audioNames ?? [])[i] ?? "" })),
  ];
  const metadata = {
    userName:        data.userName,
    userAccountType: data.userAccountType,
    userAvatar:      data.userAvatar,
    taggedUserIds:   data.taggedUserIds ?? [],
    allowComments:   data.allowComments !== false,
    allowDownload:   data.allowDownload !== false,
    link:            data.link ?? null,
    likes:           [],   // likes now live in post_likes table
    repostOf:        data.repostOf ?? null,
  };
  const postType = data.videos?.length ? "video" : data.images?.length ? "image" : data.gifs?.length ? "gif" : "text";
  return {
    author_id:   data.userId,
    content:     data.content ?? "",
    media:       JSON.stringify(media),
    metadata:    JSON.stringify(metadata),
    post_type:   postType,
    visibility:  "public",
    is_archived: false,
    is_pinned:   false,
    likes_count: 0,
  };
}

// ── Optional-column resilience ────────────────────────────────────────────────
const OPTIONAL_DB_COLS = new Set([
  "media", "metadata", "post_type", "visibility",
  "is_archived", "is_pinned",
]);
const _excluded = new Set<string>();

function extractMissingCol(err: any): string | null {
  const m = String(err?.message ?? "").match(/column "([^"]+)" of relation "posts" does not exist/);
  return m?.[1] ?? null;
}

async function insertPost(id: string, fields: Record<string, any>): Promise<any> {
  const filtered: Record<string, any> = { id, created_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(fields)) {
    if (!_excluded.has(k)) filtered[k] = v;
  }

  while (true) {
    try {
      const cols = Object.keys(filtered);
      const vals = Object.values(filtered);
      const ph   = cols.map((c, i) => JSONB_COLS.has(c) ? `$${i + 1}::jsonb` : `$${i + 1}`).join(", ");
      const cl   = cols.map(c => `"${c}"`).join(", ");
      const rows = await sql().unsafe(
        `INSERT INTO posts (${cl}) VALUES (${ph}) RETURNING *`, vals,
      );
      return rows[0];
    } catch (err: any) {
      const col = extractMissingCol(err);
      if (col && OPTIONAL_DB_COLS.has(col)) {
        console.warn(`[posts] optional column "${col}" missing — skipping`);
        _excluded.add(col);
        delete filtered[col];
        continue;
      }
      throw err;
    }
  }
}

// ── Read helpers with profile + post_likes join ───────────────────────────────

async function fetchPosts(where: string, args: any[] = [], limit = 30, offset = 0): Promise<any[]> {
  const pagination = `LIMIT ${limit} OFFSET ${offset}`;

  // Hard 8s timeout so slow queries fail fast rather than holding DB connections
  await sql().unsafe("SET LOCAL statement_timeout = '8000'").catch(() => {});

  // Single query — LEFT JOINs for profiles + post_likes aggregated together
  // Avoids N correlated subqueries; uses likes_count from posts for the count
  try {
    const rows = await sql().unsafe(`
      SELECT p.*,
        COALESCE(NULLIF(pr.name,''), pr.username, split_part(pr.email,'@',1), '') AS _pname,
        COALESCE(pr.username, '')          AS _pusername,
        COALESCE(pr.avatar_url, pr.avatar, '') AS _pavatar,
        pr.account_type                    AS _paccount,
        COALESCE(
          ARRAY(SELECT pl.user_id FROM post_likes pl WHERE pl.post_id = p.id),
          '{}'::text[]
        )                                  AS _likes,
        0                                  AS _repost_count
      FROM posts p
      LEFT JOIN profiles pr ON pr.id = p.author_id
      ${where}
      ORDER BY p.created_at DESC
      ${pagination}
    `, args);
    return rows.map(rowToPost);
  } catch (e1) {
    console.warn('[posts] Level 1 fetch failed, trying without profiles:', String(e1).slice(0, 120));
    // Level 2: post_likes only (no profiles join — handles missing profile columns)
    try {
      const rows = await sql().unsafe(`
        SELECT p.*,
          COALESCE(
            ARRAY(SELECT pl.user_id FROM post_likes pl WHERE pl.post_id = p.id),
            '{}'::text[]
          ) AS _likes
        FROM posts p
        ${where}
        ORDER BY p.created_at DESC
        ${pagination}
      `, args);
      return rows.map(rowToPost);
    } catch (e2) {
      console.warn('[posts] Level 2 fetch failed, using bare posts:', String(e2).slice(0, 120));
      // Level 3: bare posts — metadata.likes as fallback
      const rows = await sql().unsafe(
        `SELECT * FROM posts AS p ${where} ORDER BY p.created_at DESC ${pagination}`,
        args,
      );
      return rows.map(rowToPost);
    }
  }
}

// ── post_likes table helpers ──────────────────────────────────────────────────
// The table must exist in Supabase before using this.
// Run migrate_post_likes.sql in Supabase SQL Editor if not already done.
async function ensurePostLikes() {
  // No-op — table is managed via SQL migration. Kept for call-site compatibility.
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function create(data: any): Promise<any> {
  const id  = data.id || genId();
  const row = await insertPost(id, postToDbFields(data));
  // Enrich the freshly created post with author info from data (no join needed yet)
  const base = rowToPost(row);
  return {
    ...base,
    userName:        data.userName        ?? base.userName,
    userAccountType: data.userAccountType ?? base.userAccountType,
    userAvatar:      data.userAvatar      ?? base.userAvatar,
  };
}

export async function getAll(limit = 30, offset = 0): Promise<any[]> {
  return fetchPosts("WHERE (p.is_archived = false OR p.is_archived IS NULL)", [], limit, offset);
}

export async function getById(id: string): Promise<any | null> {
  const posts = await fetchPosts("WHERE p.id = $1", [id]);
  return posts[0] ?? null;
}

export async function getByUserId(userId: string): Promise<any[]> {
  return fetchPosts(
    "WHERE p.author_id = $1 AND (p.is_archived = false OR p.is_archived IS NULL)",
    [userId],
  );
}

export async function getFeedPosts(followingIds: any): Promise<any[]> {
  // Sanitize: accept array, comma-string, or JSON-encoded array
  let ids: string[] = [];
  if (Array.isArray(followingIds)) {
    ids = followingIds.filter(Boolean).map(String);
  } else if (typeof followingIds === "string" && followingIds.trim()) {
    try { const p = JSON.parse(followingIds); ids = Array.isArray(p) ? p.filter(Boolean).map(String) : []; }
    catch { ids = followingIds.split(",").map(s => s.trim()).filter(Boolean); }
  }
  if (!ids.length) return [];
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  return fetchPosts(
    `WHERE p.author_id IN (${placeholders})
       AND (p.is_archived = false OR p.is_archived IS NULL)
       AND (p.visibility = 'public' OR p.visibility IS NULL)`,
    ids,
  );
}

export async function getLikedByUser(userId: string): Promise<any[]> {
  await ensurePostLikes();
  return fetchPosts(
    `JOIN post_likes pl_filter ON pl_filter.post_id = p.id AND pl_filter.user_id = $1
     WHERE (p.is_archived = false OR p.is_archived IS NULL)`,
    [userId],
    100, 0,
  );
}

export async function toggleLike(postId: string, userId: string): Promise<{ liked: boolean; likesCount: number; postId: string; userId: string }> {
  // Ensure the table exists — self-heals if the migration was never run
  await sql().unsafe(`
    CREATE TABLE IF NOT EXISTS post_likes (
      post_id    TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (post_id, user_id)
    )
  `).catch(() => {});

  // Verify the post exists before touching post_likes
  const postCheck = await sql().unsafe(
    `SELECT id FROM posts WHERE id = $1 LIMIT 1`,
    [postId],
  );
  if ((postCheck as any[]).length === 0) {
    console.warn(`[like] post ${postId} not found in posts table — skipping`);
    return { liked: false, likesCount: 0, postId, userId };
  }

  // Check if already liked
  let existingRows: any[] = [];
  try {
    existingRows = await sql().unsafe(
      `SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2 LIMIT 1`,
      [postId, userId],
    ) as any[];
  } catch (e) { console.warn("[like] check:", String(e).slice(0, 100)); }

  let liked: boolean;

  if (existingRows.length > 0) {
    try {
      await sql().unsafe(
        `DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2`,
        [postId, userId],
      );
    } catch (e) { console.warn("[like] delete:", String(e).slice(0, 100)); }
    liked = false;
  } else {
    try {
      await sql().unsafe(
        `INSERT INTO post_likes (post_id, user_id, created_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
        [postId, userId],
      );
    } catch (e) { console.warn("[like] insert:", String(e).slice(0, 100)); }
    liked = true;
  }

  // Count directly from post_likes
  let likesCount = 0;
  try {
    const countRows = await sql().unsafe(
      `SELECT COUNT(*)::int AS cnt FROM post_likes WHERE post_id = $1`,
      [postId],
    ) as any[];
    likesCount = countRows[0]?.cnt ?? 0;
  } catch (e) { console.warn("[like] count:", String(e).slice(0, 100)); }

  // Sync posts.likes_count so reads stay consistent
  await sql().unsafe(
    `UPDATE posts SET likes_count = $1 WHERE id = $2`,
    [likesCount, postId],
  ).catch(() => {});

  console.log(`[like] post=${postId} liked=${liked} count=${likesCount}`);
  return { liked, likesCount, postId, userId };
}

export async function remove(postId: string): Promise<void> {
  await sql()`DELETE FROM posts WHERE id = ${postId}`;
}

// ── Get all user IDs who have reposted a given post ───────────────────────────
export async function getRepostersOfPost(postId: string): Promise<string[]> {
  try {
    const rows = await sql().unsafe(
      `SELECT author_id FROM posts
       WHERE (metadata->'repostOf'->>'postId') = $1
         AND (is_archived = false OR is_archived IS NULL)`,
      [postId],
    );
    return (rows as any[]).map((r: any) => r.author_id).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Get a user's repost of a specific original post ──────────────────────────
export async function getRepostByUser(originalPostId: string, userId: string): Promise<any | null> {
  try {
    const rows = await sql().unsafe(
      `SELECT id FROM posts
       WHERE author_id = $1
         AND (metadata->'repostOf'->>'postId') = $2
         AND (is_archived = false OR is_archived IS NULL)
       LIMIT 1`,
      [userId, originalPostId],
    );
    return (rows as any[])[0] ?? null;
  } catch {
    return null;
  }
}