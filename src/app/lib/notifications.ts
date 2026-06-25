/**
 * notifications.ts
 * Hybrid: fire-and-forget writes directly to Supabase DB, localStorage for fast reads.
 *
 * push()           – sync call; persists to server in the background
 * getAll()         – async; fetches from server, updates local cache
 * getUnreadCount() – sync; reads from local cache (for Header polling)
 * markRead/markAllRead/remove/clearAll – optimistic local + server fire-and-forget
 */
import { Notification } from '../types';
import { supabase } from '../../lib/supabase';

const LS_KEY  = (uid: string) => `filmons_notifs_${uid}`;
const CNT_KEY = (uid: string) => `filmons_notifs_cnt_${uid}`;
const MAX      = 200;
const DEDUP_MS = 24 * 60 * 60 * 1000;

// ── Title builder ─────────────────────────────────────────────────────────────
function _notifTitle(type: string, actorName: string): string {
  switch (type) {
    case 'comment_received':    return `${actorName} commented on your post`;
    case 'comment_reply':       return `${actorName} replied to your comment`;
    case 'comment_like':        return `${actorName} liked your comment`;
    case 'comment_mention':     return `${actorName} mentioned you in a comment`;
    case 'comment_pinned':      return 'Your comment was pinned';
    case 'comment_deleted':     return 'Your comment was removed';
    case 'new_post':            return `${actorName} shared a new post`;
    case 'content_like':        return `${actorName} liked your post`;
    case 'like':                return `${actorName} liked your post`;
    case 'content_repost':      return `${actorName} reposted your content`;
    case 'repost':              return `${actorName} reposted your post`;
    case 'new_follower':        return `${actorName} started following you`;
    case 'follow':              return `${actorName} started following you`;
    case 'follow_request':      return `${actorName} wants to follow you`;
    case 'follow_accepted':     return `${actorName} accepted your follow request`;
    case 'application_received': return `${actorName} applied to your listing`;
    case 'application_accepted': return 'Your application was accepted';
    case 'application_rejected': return 'Your application was not accepted';
    case 'message':             return `${actorName} sent you a message`;
    case 'new_message':         return `${actorName} sent you a message`;
    case 'message_received':    return `${actorName} sent you a message`;
    case 'message_reply':       return `${actorName} replied to your message`;
    case 'message_reaction':    return `${actorName} reacted to your message`;
    case 'connection_request':  return `${actorName} sent you a connection request`;
    case 'connection_accepted': return `${actorName} accepted your connection request`;
    case 'service_booked':      return `${actorName} booked your service`;
    case 'booking_accepted':    return 'Your booking was accepted';
    case 'booking_rejected':    return 'Your booking was declined';
    case 'payment_received':    return `Payment received from ${actorName}`;
    case 'payment_released':    return 'Your payment has been released';
    case 'marketplace_order':   return `${actorName} placed a new order`;
    case 'marketplace_booking': return `${actorName} requested a booking`;
    case 'marketplace_reply':   return `${actorName} replied to your inquiry`;
    case 'profile_completion':  return 'Your profile is now 80% complete';
    case 'trust_level_update':  return 'Your trust level has increased';
    case 'account_verified':    return 'Your account has been verified';
    case 'account_warning':     return 'Important notice about your account';
    case 'system_announcement': return 'New announcement from Filmons';
    case 'system_notification': return 'You have a new notification from Filmons';
    default:                    return `New notification from ${actorName}`;
  }
}

function genId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function loadLocal(uid: string): Notification[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY(uid)) || '[]'); } catch { return []; }
}
function saveLocal(uid: string, notifs: Notification[]) {
  const sliced = notifs.slice(0, MAX);
  localStorage.setItem(LS_KEY(uid), JSON.stringify(sliced));
  localStorage.setItem(CNT_KEY(uid), String(sliced.filter(n => !n.read).length));
}

// ── DB insert — direct Supabase REST (RLS policy: WITH CHECK (true)) ──────────
async function _dbInsert(row: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('notifications').insert(row);
  if (!error) {
    console.log('[notifications] ✓ saved type:', row.type, '→', row.user_id);
    return;
  }
  console.error('[notifications] insert error:', error.code, '-', error.message);

  // FK violation on post_id → retry without post fields
  if (error.code === '23503' && row.post_id) {
    const { error: e2 } = await supabase.from('notifications').insert({
      ...row, post_id: null, post_content: null, post_image: null,
    });
    if (!e2) return;
    console.error('[notifications] retry error:', e2.message);
  }
}

// ── Map a notifications table row → client Notification shape ─────────────────
function rowToNotif(r: any): Notification {
  return {
    id:             r.id,
    toUserId:       r.user_id           ?? '',
    fromUserId:     r.actor_id          ?? '',
    fromUserName:   r.actor_name        ?? r.from_user_name ?? '',
    fromUserAvatar: r.actor_avatar      ?? r.from_user_avatar ?? undefined,
    type:           r.type,
    postId:         r.post_id           ?? undefined,
    postContent:    r.post_content      ?? undefined,
    postImage:      r.post_image        ?? undefined,
    commentContent: r.comment_content   ?? r.body ?? undefined,
    conversationId: r.conversation_id   ?? undefined,
    fpAmount:       r.fp_amount         ?? undefined,
    read:           r.is_read           ?? r.read ?? false,
    createdAt:      r.created_at        ?? new Date().toISOString(),
  };
}

// ── Test helper — call from browser console: filmons.testNotif("user-id") ─────
export async function testNotif(toUserId: string) {
  console.log('[notifications] running test insert →', toUserId);
  await _dbInsert({
    user_id:    toUserId,
    actor_id:   null,
    actor_name: 'Test',
    type:       'test',
    title:      'Test notification',
    is_read:    false,
  });
}
if (typeof window !== 'undefined') {
  (window as any).filmons = { ...((window as any).filmons || {}), testNotif };
}

// ── Push (fire-and-forget to server + optimistic localStorage write) ──────────
export function push(
  toUserId: string,
  notif: Omit<Notification, 'id' | 'toUserId' | 'read' | 'createdAt'>,
): void {
  if (!toUserId) return;
  // Don't notify yourself (except system events)
  if (toUserId === notif.fromUserId && notif.type !== ('fp_purchase' as any)) return;

  const title = _notifTitle(notif.type, notif.fromUserName || 'Someone');

  // Optimistic local write so the recipient sees it immediately on the same device
  const all    = loadLocal(toUserId);
  const isMsg  = ['message', 'new_message', 'message_received'].includes(notif.type);
  const isDupe = !isMsg && all.some(n =>
    n.type       === notif.type &&
    n.fromUserId === notif.fromUserId &&
    n.postId     === (notif as any).postId &&
    Date.now() - new Date(n.createdAt).getTime() < DEDUP_MS,
  );
  if (!isDupe) {
    const full: Notification = {
      id: genId(), toUserId, read: false,
      createdAt: new Date().toISOString(),
      ...notif,
    };
    saveLocal(toUserId, [full, ...all]);
    try { window.dispatchEvent(new CustomEvent('filmons:notif', { detail: full })); } catch {}
  }

  // Fire-and-forget DB insert via direct Supabase client (bypasses edge function)
  _dbInsert({
    user_id:         toUserId,
    actor_id:        notif.fromUserId     || null,
    actor_name:      notif.fromUserName   || '',
    actor_avatar:    notif.fromUserAvatar || null,
    type:            notif.type,
    title,
    post_id:         (notif as any).postId         || null,
    post_content:    (notif as any).postContent    || null,
    post_image:      (notif as any).postImage      || null,
    comment_content: (notif as any).commentContent || null,
    conversation_id: (notif as any).conversationId || null,
    is_read:         false,
  }).catch(e => console.warn('[notifications] push failed:', e));
}

// ── Instant read from local cache (no network) ───────────────────────────────
export function getLocal(userId: string): Notification[] {
  return loadLocal(userId);
}

// ── Read from notifications table ────────────────────────────────────────────
export async function getAll(userId: string): Promise<Notification[]> {
  console.log('[notifications] getAll called for', userId);
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    console.log('[notifications] getAll result — rows:', data?.length, 'error:', error?.message ?? null);
    if (error) throw error;
    const mapped = (data || []).map(rowToNotif);
    saveLocal(userId, mapped);
    return mapped;
  } catch (e) {
    console.error('[notifications] getAll FAILED:', (e as any)?.message, (e as any)?.code);
  }
  return loadLocal(userId);
}

// ── Sync unread count from local cache (for Header polling) ──────────────────
export function getUnreadCount(userId: string): number {
  try {
    const cached = localStorage.getItem(CNT_KEY(userId));
    if (cached !== null) return Number(cached);
    const c = loadLocal(userId).filter(n => !n.read).length;
    localStorage.setItem(CNT_KEY(userId), String(c));
    return c;
  } catch { return 0; }
}

// ── Mutations (optimistic local + server) ────────────────────────────────────
export function markRead(userId: string, notifId: string): void {
  const updated = loadLocal(userId).map(n => n.id === notifId ? { ...n, read: true } : n);
  saveLocal(userId, updated);
  void supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
}

export function markAllRead(userId: string): void {
  saveLocal(userId, loadLocal(userId).map(n => ({ ...n, read: true })));
  localStorage.setItem(CNT_KEY(userId), '0');
  void supabase.from('notifications').update({ is_read: true }).eq('user_id', userId);
}

export function remove(userId: string, notifId: string): void {
  saveLocal(userId, loadLocal(userId).filter(n => n.id !== notifId));
  void supabase.from('notifications').delete().eq('id', notifId);
}

export function clearAll(userId: string): void {
  saveLocal(userId, []);
  localStorage.setItem(CNT_KEY(userId), '0');
  void supabase.from('notifications').delete().eq('user_id', userId);
}

// ── Realtime subscription ─────────────────────────────────────────────────────
export function subscribe(
  userId: string,
  onNew: (notif: Notification) => void,
): () => void {
  const name = `notifs:${userId}:${Date.now()}`;

  const channel = supabase
    .channel(name)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row   = payload.new as any;
        const notif = rowToNotif(row);
        const all   = loadLocal(userId);
        if (!all.some(n => n.id === notif.id)) {
          saveLocal(userId, [notif, ...all]);
          try { window.dispatchEvent(new CustomEvent('filmons:notif', { detail: notif })); } catch {}
        }
        onNew(notif);
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[notifications] realtime connected for', userId);
      } else if (status === 'CHANNEL_ERROR') {
        console.warn('[notifications] realtime failed — polling is the fallback');
      }
    });

  return () => { supabase.removeChannel(channel); };
}
