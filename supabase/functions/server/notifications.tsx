/**
 * notifications.tsx — Postgres CRUD on the `notifications` table.
 *
 * Strategy:
 *  1. CREATE TABLE IF NOT EXISTS (no-op when already exists)
 *  2. One information_schema query to discover actual column names
 *  3. Alias-map: logical name → actual DB column (handles tables created
 *     with user_id / is_read / etc. by older code)
 *  4. ALTER TABLE ADD COLUMN IF NOT EXISTS for any column that's missing
 *  5. Cache everything — _ready = true means steps 1-4 never re-run
 *
 * Rules:
 *  - NEVER use semicolons inside a single sql().unsafe() call
 *  - Every SQL call is one statement
 */
import { sql } from "./db.tsx";
// ── Column alias map ──────────────────────────────────────────────────────────
interface ColMap {
  toUserId:       string;
  fromUserId:     string;
  fromUserName:   string;
  fromUserAvatar: string;
  title:          string;
  type:           string;
  postId:         string;
  postContent:    string;
  postImage:      string;
  commentContent: string;
  conversationId: string;
  read:           string;
  createdAt:      string;
}

function defaultMap(): ColMap {
  return {
    toUserId:       "to_user_id",
    fromUserId:     "from_user_id",
    fromUserName:   "from_user_name",
    fromUserAvatar: "from_user_avatar",
    title:          "title",
    type:           "type",
    postId:         "post_id",
    postContent:    "post_content",
    postImage:      "post_image",
    commentContent: "comment_content",
    conversationId: "conversation_id",
    read:           "read",
    createdAt:      "created_at",
  };
}

let _ready = false;
let _map: ColMap = defaultMap();

async function ensureTable(): Promise<void> {
  if (_ready) return;

  // ── 1. Create table (single statement, no semicolons) ────────────────────
  try {
    await sql().unsafe(`
      CREATE TABLE IF NOT EXISTS notifications (
        id               text        PRIMARY KEY,
        to_user_id       text,
        from_user_id     text,
        from_user_name   text,
        from_user_avatar text,
        title            text        NOT NULL DEFAULT '',
        type             text,
        post_id          text,
        post_content     text,
        post_image       text,
        comment_content  text,
        conversation_id  text,
        read             boolean     NOT NULL DEFAULT false,
        created_at       timestamptz NOT NULL DEFAULT now()
      )
    `);
  } catch (e) {
    console.warn("[notifications] create table:", String(e).slice(0, 200));
  }

  // ── 2. Index (separate statement, best-effort) ───────────────────────────
  await sql()
    .unsafe(`CREATE INDEX IF NOT EXISTS notifs_user_idx ON notifications(to_user_id, created_at DESC)`)
    .catch(() => {/* ignore if index or column name differs */});

  // ── 3. Detect actual columns ─────────────────────────────────────────────
  let cols = new Set<string>();
  try {
    const rows = await sql().unsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE  table_schema = 'public' AND table_name = 'notifications'`,
    );
    cols = new Set((rows as any[]).map((r: any) => String(r.column_name)));
    console.log("[notifications] detected columns:", [...cols].sort().join(", "));
  } catch (e) {
    console.warn("[notifications] column detect failed:", String(e).slice(0, 200));
    // Can't detect — assume defaults and proceed
    _ready = true;
    return;
  }

  // ── 4. Build alias map ────────────────────────────────────────────────────
  const pick = (...names: string[]) => names.find(n => cols.has(n)) ?? names[0];
  _map = {
    toUserId:       pick("to_user_id",       "user_id",       "recipient_id",  "target_user_id", "notif_user_id"),
    fromUserId:     pick("from_user_id",      "actor_id",      "sender_id",     "source_user_id"),
    fromUserName:   pick("from_user_name",    "actor_name",    "sender_name",   "from_name",      "actor_username"),
    fromUserAvatar: pick("from_user_avatar",  "actor_avatar",  "sender_avatar", "from_avatar"),
    title:          pick("title",             "subject",       "heading",       "notification_title"),
    type:           pick("type",              "kind",          "event_type",    "notification_type"),
    postId:         pick("post_id",           "resource_id",   "ref_id",        "entity_id"),
    postContent:    pick("post_content",      "post_body",     "content",       "body"),
    postImage:      pick("post_image",        "image_url",     "thumbnail",     "photo_url"),
    commentContent: pick("comment_content",   "comment",       "comment_text",  "comment_body"),
    conversationId: pick("conversation_id",   "conv_id",       "thread_id"),
    read:           pick("read",              "is_read",       "seen",          "viewed",         "opened"),
    createdAt:      pick("created_at",        "inserted_at",   "timestamp",     "ts",             "created"),
  };
  console.log("[notifications] map:", JSON.stringify(_map));

  // ── 5. Add any missing columns one by one ────────────────────────────────
  const needed: Array<[string, string]> = [
    [_map.toUserId,       "text"],
    [_map.fromUserId,     "text"],
    [_map.fromUserName,   "text"],
    [_map.fromUserAvatar, "text"],
    [_map.title,          "text NOT NULL DEFAULT ''"],
    [_map.type,           "text"],
    [_map.postId,         "text"],
    [_map.postContent,    "text"],
    [_map.postImage,      "text"],
    [_map.commentContent, "text"],
    [_map.conversationId, "text"],
    [_map.read,           "boolean NOT NULL DEFAULT false"],
    [_map.createdAt,      "timestamptz NOT NULL DEFAULT now()"],
  ];
  for (const [col, def] of needed) {
    if (cols.has(col)) continue;
    await sql()
      .unsafe(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS "${col}" ${def}`)
      .catch((e: unknown) => console.warn(`[notifications] add column "${col}":`, String(e).slice(0, 100)));
  }

  _ready = true;
  console.log("[notifications] ready");
}

// ── Title generator ───────────────────────────────────────────────────────────
function buildTitle(type: string, fromUserName: string): string {
  switch (type) {
    case "follow":         return `${fromUserName} started following you`;
    case "like":           return `${fromUserName} liked your post`;
    case "friend_like":    return `${fromUserName} liked a post you follow`;
    case "comment":          return `${fromUserName} commented on your post`;
    case "friend_comment":   return `${fromUserName} also commented on a post`;
    case "comment_like":     return `${fromUserName} liked your comment`;
    case "comment_reply":    return `${fromUserName} replied to your comment`;
    case "creator_reply":    return `${fromUserName} (creator) replied to your comment`;
    case "comment_pinned":   return "Your comment was pinned";
    case "comment_deleted":  return "Your comment was removed by moderation";
    case "comment_mention":  return `${fromUserName} mentioned you in a comment`;
    case "message":           return `${fromUserName} sent you a message`;
    case "new_message":       return `${fromUserName} sent you a message`;
    case "message_received":  return `${fromUserName} sent you a message`;
    case "mention":           return `${fromUserName} mentioned you`;
    case "repost":         return `${fromUserName} reposted your post`;
    case "repost_chain":   return `${fromUserName} reposted a post`;
    case "rental_request": return `${fromUserName} sent a rental request`;
    case "review":         return `${fromUserName} left you a review`;
    case "verification":   return "Your verification was reviewed";
    default:               return `New notification from ${fromUserName}`;
  }
}

// ── Row → camelCase (uses _map for column names) ──────────────────────────────
function rowToNotif(row: any): object {
  const m = _map;
  const ts = row[m.createdAt];
  return {
    id:             row.id,
    toUserId:       row[m.toUserId],
    fromUserId:     row[m.fromUserId],
    fromUserName:   row[m.fromUserName]   ?? "",
    fromUserAvatar: row[m.fromUserAvatar] ?? undefined,
    title:          row[m.title]          ?? "",
    type:           row[m.type],
    postId:         row[m.postId]         ?? undefined,
    postContent:    row[m.postContent]    ?? undefined,
    postImage:      row[m.postImage]      ?? undefined,
    commentContent: row[m.commentContent] ?? undefined,
    conversationId: row[m.conversationId] ?? undefined,
    read:           row[m.read]           ?? false,
    createdAt: ts instanceof Date
      ? ts.toISOString()
      : String(ts ?? new Date().toISOString()),
  };
}

// ── Push ──────────────────────────────────────────────────────────────────────
export async function push(notif: {
  toUserId:        string;
  fromUserId:      string;
  fromUserName:    string;
  fromUserAvatar?: string;
  title?:          string;
  type:            string;
  postId?:         string;
  postContent?:    string;
  postImage?:      string;
  commentContent?: string;
  conversationId?: string;
}): Promise<void> {
  if (notif.toUserId === notif.fromUserId) return;
  await ensureTable();
  const m = _map;

  const title = notif.title?.trim() || buildTitle(notif.type, notif.fromUserName);

  // Message notifications are never deduped — every message is its own notification.
  // All other types use a 24-hour dedup keyed on (recipient, sender, type, post).
  const isMessage = notif.type === "message_received" || notif.type === "new_message" || notif.type === "message";
  if (!isMessage) {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    try {
      const existing = await sql().unsafe(
        `SELECT id FROM notifications
         WHERE  "${m.toUserId}"             = $1
           AND  "${m.fromUserId}"           = $2
           AND  "${m.type}"                 = $3
           AND  COALESCE("${m.postId}", '') = $4
           AND  "${m.createdAt}"            > $5
         LIMIT 1`,
        [notif.toUserId, notif.fromUserId, notif.type, notif.postId ?? "", cutoff],
      );
      if ((existing as any[]).length > 0) return;
    } catch (e) {
      console.warn("[notifications] dedup check failed:", String(e).slice(0, 200));
    }
  }

  try {
    await sql().unsafe(
      `INSERT INTO notifications
         (id,
          "${m.toUserId}",       "${m.fromUserId}",    "${m.fromUserName}",
          "${m.fromUserAvatar}", "${m.title}",         "${m.type}",
          "${m.postId}",         "${m.postContent}",   "${m.postImage}",
          "${m.commentContent}", "${m.conversationId}","${m.read}",
          "${m.createdAt}")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,now())`,
      [
        crypto.randomUUID(),
        notif.toUserId,
        notif.fromUserId,
        notif.fromUserName,
        notif.fromUserAvatar ?? null,
        title,
        notif.type,
        notif.postId         ?? null,
        notif.postContent    ?? null,
        notif.postImage      ?? null,
        notif.commentContent ?? null,
        notif.conversationId ?? null,
      ],
    );
  } catch (e) {
    console.error("[notifications] insert error:", String(e).slice(0, 400));
    throw e;
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────
export async function getByUser(userId: string, limit = 100): Promise<any[]> {
  await ensureTable();
  const m = _map;
  try {
    const rows = await sql().unsafe(
      `SELECT * FROM notifications
       WHERE  "${m.toUserId}" = $1
       ORDER  BY "${m.createdAt}" DESC
       LIMIT  $2`,
      [userId, limit],
    );
    return (rows as any[]).map(r => rowToNotif(r));
  } catch (e) {
    console.error("[notifications] getByUser error:", String(e).slice(0, 400));
    return [];
  }
}

export async function getUnreadCount(userId: string): Promise<number> {
  await ensureTable();
  const m = _map;
  try {
    const rows = await sql().unsafe(
      `SELECT COUNT(*) AS cnt FROM notifications
       WHERE  "${m.toUserId}" = $1 AND "${m.read}" = false`,
      [userId],
    );
    return Number((rows as any[])[0]?.cnt ?? 0);
  } catch { return 0; }
}

// ── Mutations ─────────────────────────────────────────────────────────────────
export async function markRead(id: string): Promise<void> {
  await ensureTable();
  const m = _map;
  try {
    await sql().unsafe(
      `UPDATE notifications SET "${m.read}" = true WHERE id = $1`, [id],
    );
  } catch (e) {
    console.error("[notifications] markRead error:", String(e).slice(0, 200));
  }
}

export async function markAllRead(userId: string): Promise<void> {
  await ensureTable();
  const m = _map;
  try {
    await sql().unsafe(
      `UPDATE notifications SET "${m.read}" = true WHERE "${m.toUserId}" = $1`,
      [userId],
    );
  } catch (e) {
    console.error("[notifications] markAllRead error:", String(e).slice(0, 200));
  }
}

export async function remove(id: string): Promise<void> {
  await ensureTable();
  try {
    await sql().unsafe(`DELETE FROM notifications WHERE id = $1`, [id]);
  } catch (e) {
    console.error("[notifications] remove error:", String(e).slice(0, 200));
  }
}

export async function clearAll(userId: string): Promise<void> {
  await ensureTable();
  const m = _map;
  try {
    await sql().unsafe(
      `DELETE FROM notifications WHERE "${m.toUserId}" = $1`, [userId],
    );
  } catch (e) {
    console.error("[notifications] clearAll error:", String(e).slice(0, 200));
  }
}