/**
 * conversations.tsx — Clean messaging backend.
 * DB schema (your actual tables):
 *   conversations: id (uuid/text), type, participants (text[]), created_by,
 *                  is_request, requested_by, deleted_for_everyone, metadata, updated_at
 *   messages: id (text pk), conversation_id, sender_id, sender_name, sender_avatar,
 *             content, type, metadata (jsonb), reply_to, forwarded_from,
 *             is_deleted, is_pinned, deleted_for (jsonb), created_at, updated_at
 *   profiles: id, name, username, avatar_url, account_type
 */
import { sql, safeJson } from "./db.tsx";

// ── Row mappers ───────────────────────────────────────────────────────────────
function rowToMessage(row: any): any {
  const meta = safeJson(row.metadata, {});
  return {
    id:             String(row.id),
    conversationId: String(row.conversation_id),
    senderId:       String(row.sender_id),
    senderName:     row.sender_name  || meta.senderName  || undefined,
    senderAvatar:   row.sender_avatar|| meta.senderAvatar|| undefined,
    type:           row.type         || "text",
    content:        row.content      || undefined,
    sharedPost:     meta.sharedPost  || undefined,
    mediaUrl:       meta.mediaUrl    || undefined,
    mediaType:      meta.mediaType   || undefined,
    rentalRequest:  meta.rentalRequest || undefined,
    paymentRequest: meta.paymentRequest || undefined,
    replyTo:        row.reply_to     || undefined,
    forwardedFrom:  row.forwarded_from || undefined,
    isDeleted:      row.is_deleted   || false,
    isPinned:       row.is_pinned    || false,
    deletedFor:     safeJson(row.deleted_for, {}),
    createdAt:      row.created_at instanceof Date
                      ? row.created_at.toISOString()
                      : String(row.created_at || new Date().toISOString()),
    read:           meta.read        ?? false,
  };
}

function rowToConversation(row: any, userId: string): any {
  const participants: string[] = Array.isArray(row.participants)
    ? row.participants.filter(Boolean)
    : [];

  const participantProfiles: any[] = Array.isArray(row.participant_profiles)
    ? row.participant_profiles.filter(Boolean)
    : [];

  const lastMessage = row.last_message
    ? rowToMessage(safeJson(row.last_message, row.last_message))
    : undefined;

  let lastMessagePreview = "";
  if (lastMessage) {
    if (lastMessage.type === "post")   lastMessagePreview = "📎 Shared a post";
    else if (lastMessage.type === "media") lastMessagePreview = "📷 Photo";
    else lastMessagePreview = lastMessage.content || "";
  }

  return {
    id:                  String(row.id),
    participantIds:      participants,
    participantProfiles,
    isRequest:           row.is_request       ?? false,
    requestedBy:         row.requested_by      ?? null,
    updatedAt:           row.updated_at instanceof Date
                           ? row.updated_at.toISOString()
                           : String(row.updated_at || new Date().toISOString()),
    lastMessagePreview,
    lastMessageAt:       lastMessage?.createdAt ?? null,
    messages:            lastMessage ? [lastMessage] : [],
    unreadCount:         0,
  };
}

// ── Get conversations for a user ──────────────────────────────────────────────
export async function getUserConversations(userId: string): Promise<any[]> {
  try {
    // Set a 6s statement timeout so slow queries fail fast instead of holding connections
    await sql().unsafe("SET LOCAL statement_timeout = '6000'").catch(() => {});

    const rows = await sql().unsafe(`
      SELECT c.id, c.type, c.participants, c.is_request, c.requested_by,
             c.updated_at, c.created_at, c.deleted_for_everyone,
        (
          SELECT json_agg(json_build_object(
            'id',      pr.id,
            'name',    COALESCE(NULLIF(pr.name,''), pr.username),
            'username',pr.username,
            'avatar',  pr.avatar_url
          ))
          FROM public.profiles pr
          WHERE pr.id = ANY(c.participants::uuid[])
        ) AS participant_profiles,
        lm.last_message
      FROM public.conversations c
      LEFT JOIN LATERAL (
        SELECT json_build_object(
          'id', m.id, 'type', m.type, 'content', m.content,
          'sender_id', m.sender_id, 'sender_name', m.sender_name,
          'created_at', m.created_at, 'metadata', m.metadata
        ) AS last_message
        FROM   public.messages m
        WHERE  m.conversation_id = c.id
          AND  COALESCE(m.is_deleted, false) = false
        ORDER  BY m.created_at DESC
        LIMIT  1
      ) lm ON true
      WHERE $1::text = ANY(c.participants)
        AND COALESCE(c.deleted_for_everyone, false) = false
      ORDER BY c.updated_at DESC
      LIMIT 20
    `, [userId]);

    return rows.map((r: any) => rowToConversation(r, userId));
  } catch (e) {
    console.error("[conversations] getUserConversations:", String(e).slice(0, 300));
    return [];
  }
}

// ── Get messages for a conversation ──────────────────────────────────────────
export async function getMessages(convId: string, limit = 30): Promise<any[]> {
  try {
    const rows = await sql().unsafe(`
      SELECT id, conversation_id, sender_id, sender_name, sender_avatar,
             content, type, metadata, reply_to, is_deleted, is_pinned,
             deleted_for, created_at, updated_at
      FROM public.messages
      WHERE  conversation_id = $1
        AND  COALESCE(is_deleted, false) = false
      ORDER  BY created_at ASC
      LIMIT  $2
    `, [convId, limit]);
    return rows.map(rowToMessage);
  } catch (e) {
    console.error("[conversations] getMessages:", String(e).slice(0, 200));
    return [];
  }
}

// ── Save a message ─────────────────────────────────────────────────────────────
export async function saveMessage(convId: string, data: any): Promise<any> {
  const id  = String(data.id  || crypto.randomUUID());
  const now = data.createdAt  || new Date().toISOString();

  const metadata = JSON.stringify({
    senderName:     data.senderName     ?? null,
    senderAvatar:   data.senderAvatar   ?? null,
    sharedPost:     data.sharedPost     ?? null,
    mediaUrl:       data.mediaUrl       ?? null,
    mediaType:      data.mediaType      ?? null,
    rentalRequest:  data.rentalRequest  ?? null,
    paymentRequest: data.paymentRequest ?? null,
    read:           data.read           ?? false,
  });

  await sql().unsafe(`
    INSERT INTO public.messages
      (id, conversation_id, sender_id, sender_name, sender_avatar,
       content, type, metadata, reply_to, forwarded_from, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::timestamptz,NOW())
    ON CONFLICT (id) DO NOTHING
  `, [
    id,
    String(convId),
    String(data.senderId),
    data.senderName    ?? null,
    data.senderAvatar  ?? null,
    data.content       ?? null,
    data.type          ?? "text",
    metadata,
    data.replyTo       ?? null,
    data.forwardedFrom ?? null,
    now,
  ]);

  // Update conversation timestamp (non-blocking)
  sql().unsafe(
    `UPDATE public.conversations SET updated_at = NOW() WHERE id = $1`,
    [String(convId)]
  ).catch(() => {});

  return {
    id,
    conversationId: convId,
    senderId:       data.senderId,
    senderName:     data.senderName,
    senderAvatar:   data.senderAvatar,
    type:           data.type || "text",
    content:        data.content,
    sharedPost:     data.sharedPost,
    createdAt:      now,
  };
}

// ── Upsert conversation ────────────────────────────────────────────────────────
export async function upsertConversation(data: any): Promise<void> {
  try {
    await sql().unsafe(`
      INSERT INTO public.conversations
        (id, type, participants, created_by, is_request, requested_by,
         metadata, deleted_for_everyone, created_at, updated_at)
      VALUES ($1,'direct',$2::text[],$3,$4,$5,'{}',false,NOW())
      ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
    `, [
      String(data.id),
      data.participantIds ?? [],
      (data.participantIds ?? [])[0] ?? null,
      data.isRequest  ?? false,
      data.requestedBy ?? null,
    ]);
  } catch (e) {
    console.warn("[conversations] upsertConversation:", String(e).slice(0, 100));
  }
}

// ── Mark messages as read ──────────────────────────────────────────────────────
export async function markRead(convId: string, userId: string): Promise<void> {
  await sql().unsafe(`
    UPDATE public.messages
    SET metadata = metadata || '{"read":true}'::jsonb
    WHERE conversation_id = $1
      AND sender_id != $2
      AND COALESCE((metadata->>'read')::boolean, false) = false
  `, [convId, userId]).catch(() => {});
}

// ── Delete message ─────────────────────────────────────────────────────────────
export async function deleteMessage(msgId: string, userId: string, forEveryone: boolean): Promise<void> {
  if (forEveryone) {
    await sql().unsafe(
      `UPDATE public.messages SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND sender_id = $2`,
      [msgId, userId]
    );
  } else {
    await sql().unsafe(
      `UPDATE public.messages SET deleted_for = COALESCE(deleted_for,'{}') || $1::jsonb WHERE id = $2`,
      [JSON.stringify({ [userId]: true }), msgId]
    );
  }
}

// ── Delete conversation for a user ────────────────────────────────────────────
export async function deleteConversationForUser(convId: string, userId: string): Promise<void> {
  // Check if all participants want to delete
  const rows = await sql().unsafe(
    `SELECT participants FROM public.conversations WHERE id = $1`, [convId]
  ).catch(() => []);

  const participants: string[] = (rows as any[])[0]?.participants ?? [];
  if (participants.length <= 1 || participants.every((p: string) => p === userId)) {
    await sql().unsafe(
      `UPDATE public.conversations SET deleted_for_everyone = true, updated_at = NOW() WHERE id = $1`,
      [convId]
    ).catch(() => {});
  }
}

// ── Get conversation by ID ────────────────────────────────────────────────────
export async function getConversationById(convId: string): Promise<any | null> {
  try {
    const rows = await sql().unsafe(
      `SELECT * FROM public.conversations WHERE id = $1 LIMIT 1`, [convId]
    );
    return (rows as any[])[0] ?? null;
  } catch { return null; }
}