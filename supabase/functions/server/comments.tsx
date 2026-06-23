/**
 * comments.tsx — Postgres CRUD matching actual DB schema.
 *
 * comments table columns:
 *   id, post_id, author_id, content, media (jsonb),
 *   parent_comment_id, thread_level, likes_count, replies_count,
 *   is_edited, is_pinned, created_at, updated_at, edited_at
 *
 * profiles table columns (relevant):
 *   id, name, username, avatar_url, account_type
 */
import { sql } from "./db.tsx";

const genId = () => crypto.randomUUID();

// ── Row → Comment object ──────────────────────────────────────────────────────
function rowToComment(row: any): any {
  // Name from live profile join — username fallback, then email prefix
  const userName = row._pname && row._pname !== ''
    ? row._pname
    : (row._pusername && row._pusername !== '' ? row._pusername : '');

  // Avatar from live profile join
  const userAvatar = row._pavatar && row._pavatar !== '' ? row._pavatar : undefined;

  // Account type
  const userAccountType = row._paccount || undefined;

  // Likes — from comment_likes aggregate if available, else likes_count column
  const likesRaw = row._likes;
  const likes: string[] = Array.isArray(likesRaw)
    ? likesRaw
    : typeof likesRaw === 'string'
      ? (() => {
          const s = likesRaw.trim();
          if (s === '{}' || s === '') return [];
          if (s.startsWith('{') && s.endsWith('}'))
            return s.slice(1, -1).split(',').map((v: string) => v.trim().replace(/^"|"$/g, '')).filter(Boolean);
          try { return JSON.parse(s); } catch { return []; }
        })()
      : [];

  return {
    id:              row.id,
    postId:          row.post_id,
    userId:          row.author_id,
    userName,
    userAccountType,
    userAvatar,
    content:         row.content ?? '',
    likes,
    likesCount:      typeof row.likes_count === 'number' ? row.likes_count : likes.length,
    replyCount:      typeof row.replies_count === 'number' ? row.replies_count : 0,
    parentId:        row.parent_comment_id ?? null,
    threadLevel:     row.thread_level ?? 0,
    createdAt:       row.created_at,
  };
}

// ── Shared SELECT fragment ────────────────────────────────────────────────────
// ── Ensure comment_likes table exists ────────────────────────────────────────
let _commentLikesReady = false;
// deno-lint-ignore no-explicit-any
declare const Deno: any;

async function ensureCommentLikes() {
  if (_commentLikesReady) return;

  const DDL = `
    CREATE TABLE IF NOT EXISTS comment_likes (
      comment_id uuid        NOT NULL,
      user_id    uuid        NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (comment_id, user_id)
    )`;
  const GRANT = `GRANT SELECT, INSERT, DELETE ON comment_likes TO anon, authenticated`;

  // Path 1: raw SQL (postgres superuser — fastest)
  try {
    await sql().unsafe(DDL);
    await sql().unsafe(GRANT).catch(() => {});
    _commentLikesReady = true;
    return;
  } catch (e) {
    console.warn("[comment_likes] raw SQL create failed:", String(e).slice(0, 120));
  }

  // Path 2: service-role Supabase client (works even without superuser)
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    // @ts-ignore — npm: import works at runtime
    const { createClient } = await import("npm:@supabase/supabase-js");
    const admin = createClient(url, key, { auth: { persistSession: false } });
    // Try a lightweight operation to verify the table exists (or create via rpc)
    const { error } = await admin.from("comment_likes").select("comment_id").limit(1);
    if (!error) { _commentLikesReady = true; return; }
    // Table doesn't exist — can't create via REST; log and give up
    console.warn("[comment_likes] table missing and SQL create failed. Run the migration SQL.");
  } catch (e2) {
    console.warn("[comment_likes] admin client check failed:", String(e2).slice(0, 120));
  }
}

function commentSelect(where: string, orderBy: string, limit: number, offset: number) {
  return `
    SELECT c.*,
      COALESCE(NULLIF(pr.name, ''), pr.username, split_part(pr.email, '@', 1), '') AS _pname,
      COALESCE(pr.username, '')   AS _pusername,
      COALESCE(pr.avatar_url, '') AS _pavatar,
      pr.account_type             AS _paccount,
      '{}'::text[]                AS _likes
    FROM comments c
    LEFT JOIN profiles pr ON pr.id = c.author_id
    ${where}
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `;
}

// ── Get top-level comments for a post (paginated) ─────────────────────────────
export async function getByPostId(
  postId: string,
  limit = 5,
  offset = 0,
  sort: 'newest' | 'top' = 'newest',
): Promise<any[]> {
  await ensureCommentLikes();
  const orderBy = sort === 'top'
    ? 'c.likes_count DESC, c.created_at DESC'
    : 'c.created_at DESC';

  try {
    const rows = await sql().unsafe(
      commentSelect(
        `WHERE c.post_id = $1 AND (c.parent_comment_id IS NULL)`,
        orderBy,
        limit,
        offset,
      ),
      [postId],
    );
    if (rows.length > 0) {
      console.log('[comments] first row keys:', Object.keys(rows[0] as any).join(', '));
      console.log('[comments] _pname:', (rows[0] as any)._pname, '| name:', (rows[0] as any).name);
    }
    return rows.map(rowToComment);
  } catch (e) {
    console.error('[comments] getByPostId error:', String(e).slice(0, 200));
    // Fallback: no join
    try {
      const rows = await sql().unsafe(
        `SELECT * FROM comments
         WHERE post_id = $1 AND parent_comment_id IS NULL
         ORDER BY ${sort === 'top' ? 'likes_count DESC,' : ''} created_at DESC
         LIMIT $2 OFFSET $3`,
        [postId, limit, offset],
      );
      return rows.map(rowToComment);
    } catch (e2) {
      console.error('[comments] fallback error:', String(e2).slice(0, 100));
      return [];
    }
  }
}

// ── Get replies for a parent comment ─────────────────────────────────────────
export async function getReplies(parentId: string): Promise<any[]> {
  await ensureCommentLikes();
  try {
    const rows = await sql().unsafe(
      commentSelect(
        `WHERE c.parent_comment_id = $1`,
        'c.created_at ASC',
        100,
        0,
      ),
      [parentId],
    );
    return rows.map(rowToComment);
  } catch (e) {
    console.error('[comments] getReplies error:', String(e).slice(0, 200));
    return [];
  }
}

// ── Get single comment by id ──────────────────────────────────────────────────
export async function getById(id: string): Promise<any | null> {
  try {
    const rows = await sql().unsafe(
      commentSelect(`WHERE c.id = $1`, 'c.created_at DESC', 1, 0),
      [id],
    );
    return rows[0] ? rowToComment(rows[0]) : null;
  } catch {
    return null;
  }
}

// ── Create a comment ──────────────────────────────────────────────────────────
export async function create(data: {
  postId: string;
  userId: string;
  content: string;
  parentId?: string;
  userName?: string;
  userAvatar?: string;
  userAccountType?: string;
}): Promise<any> {
  const id = genId();

  // Single query: INSERT + profile JOIN in one CTE — no second round trip
  const rows = await sql().unsafe(
    `WITH inserted AS (
       INSERT INTO comments (id, post_id, author_id, content, parent_comment_id, thread_level, likes_count, replies_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 0, NOW(), NOW())
       RETURNING *
     )
     SELECT c.*,
       COALESCE(NULLIF(pr.name, ''), pr.username, split_part(pr.email, '@', 1), '') AS _pname,
       COALESCE(pr.username, '')    AS _pusername,
       COALESCE(pr.avatar_url, '')  AS _pavatar,
       pr.account_type              AS _paccount,
       '{}'::text[]                 AS _likes
     FROM inserted c
     LEFT JOIN profiles pr ON pr.id = c.author_id`,
    [
      id,
      data.postId,
      data.userId,
      data.content,
      data.parentId || null,
      data.parentId ? 1 : 0,
    ],
  );

  // Increment parent replies_count async (fire and forget)
  if (data.parentId) {
    sql().unsafe(
      `UPDATE comments SET replies_count = replies_count + 1 WHERE id = $1`,
      [data.parentId],
    ).catch(() => {});
  }

  if (rows[0]) {
    const comment = rowToComment(rows[0] as any);
    // Fallback to passed-in data if profile join returned empty (shouldn't happen)
    if (!comment.userName) comment.userName = data.userName || 'User';
    if (!comment.userAvatar) comment.userAvatar = data.userAvatar;
    return comment;
  }

  // Ultimate fallback: return from raw insert + passed-in user data
  return rowToComment({ ...(rows[0] ?? {}), _pname: data.userName || '', _pavatar: data.userAvatar || '', _likes: [] });
}

// ── Delete a comment ──────────────────────────────────────────────────────────
export async function remove(id: string): Promise<void> {
  // Decrement parent replies_count
  await sql().unsafe(
    `UPDATE comments SET replies_count = GREATEST(replies_count - 1, 0)
     WHERE id = (SELECT parent_comment_id FROM comments WHERE id = $1)`,
    [id],
  ).catch(() => {});

  await sql().unsafe(`DELETE FROM comments WHERE id = $1`, [id]);
}

// ── Get count for a post ──────────────────────────────────────────────────────
export async function getCount(postId: string): Promise<number> {
  try {
    const rows = await sql().unsafe(
      `SELECT COUNT(*)::int AS cnt FROM comments WHERE post_id = $1 AND parent_comment_id IS NULL`,
      [postId],
    );
    return (rows[0] as any)?.cnt ?? 0;
  } catch { return 0; }
}

// ── comment_likes ─────────────────────────────────────────────────────────────

export async function toggleLike(
  commentId: string,
  userId: string,
  _adminClient?: any,
): Promise<string[]> {
  await ensureCommentLikes();

  // Single atomic DELETE RETURNING — if it returns a row the user was already liked (unlike).
  // Avoids the SELECT + DELETE two-round-trip race on a pooled connection.
  const deleted = await sql().unsafe(
    `DELETE FROM comment_likes
     WHERE comment_id = $1 AND user_id = $2
     RETURNING user_id`,
    [commentId, userId],
  );

  if ((deleted as any[]).length > 0) {
    // Unlike succeeded — decrement counter
    await sql().unsafe(
      `UPDATE comments SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1`,
      [commentId],
    ).catch(() => {});
  } else {
    // Row didn't exist — this is a new like
    await sql().unsafe(
      `INSERT INTO comment_likes (comment_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [commentId, userId],
    );
    await sql().unsafe(
      `UPDATE comments SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = $1::uuid`,
      [commentId],
    ).catch(() => {});
  }

  // Return the current likers list
  const rows = await sql().unsafe(
    `SELECT user_id::text FROM comment_likes WHERE comment_id = $1::uuid`,
    [commentId],
  );
  return (rows as any[]).map((r: any) => r.user_id);
}