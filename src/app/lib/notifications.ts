/**
 * notifications.ts
 * Hybrid: fire-and-forget writes to Supabase DB, localStorage for fast reads.
 *
 * push()           – sync call; persists to server in the background
 * getAll()         – async; fetches from server, updates local cache
 * getUnreadCount() – sync; reads from local cache (for Header polling)
 * markRead/markAllRead/remove/clearAll – optimistic local + server fire-and-forget
 */
import { Notification } from '../types';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { supabase } from '../../lib/supabase';

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879`;
const H = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` });

const LS_KEY   = (uid: string) => `filmons_notifs_${uid}`;

// ── DB insert (with FK-safe retry) ────────────────────────────────────────────
function _notifTitle(type: string, actorName: string): string {
  switch (type) {
    // Comments
    case 'comment_received':   return `${actorName} commented on your post`;
    case 'comment_reply':      return `${actorName} replied to your comment`;
    case 'comment_like':       return `${actorName} liked your comment`;
    case 'comment_mention':    return `${actorName} mentioned you in a comment`;
    case 'comment_pinned':     return 'Your comment was pinned';
    case 'comment_deleted':    return 'Your comment was removed';
    // Likes & Reposts
    case 'new_post':            return `${actorName} shared a new post`;
    case 'content_like':       return `${actorName} liked your post`;
    case 'content_repost':     return `${actorName} reposted your content`;
    // Followers
    case 'new_follower':       return `${actorName} started following you`;
    case 'follow_request':     return `${actorName} wants to follow you`;
    case 'follow_accepted':    return `${actorName} accepted your follow request`;
    // Applications
    case 'application_received': return `${actorName} applied to your listing`;
    case 'application_accepted': return 'Your application was accepted';
    case 'application_rejected': return 'Your application was not accepted';
    // Messages
    case 'new_message':        return `${actorName} sent you a message`;
    case 'message_received':   return `${actorName} sent you a message`;
    case 'message_reply':      return `${actorName} replied to your message`;
    case 'message_reaction':   return `${actorName} reacted to your message`;
    // Network
    case 'connection_request': return `${actorName} sent you a connection request`;
    case 'connection_accepted':return `${actorName} accepted your connection request`;
    // Marketplace
    case 'service_booked':     return `${actorName} booked your service`;
    case 'booking_accepted':   return 'Your booking was accepted';
    case 'booking_rejected':   return 'Your booking was declined';
    case 'payment_received':   return `Payment received from ${actorName}`;
    case 'payment_released':   return 'Your payment has been released';
    case 'marketplace_order':  return `${actorName} placed a new order`;
    case 'marketplace_booking':return `${actorName} requested a booking`;
    case 'marketplace_reply':  return `${actorName} replied to your inquiry`;
    // Profile & Trust
    case 'profile_completion': return 'Your profile is now 80% complete';
    case 'trust_level_update': return 'Your trust level has increased';
    // System
    case 'account_verified':   return 'Your account has been verified';
    case 'account_warning':    return 'Important notice about your account';
    case 'system_announcement':return 'New announcement from Filmons';
    case 'system_notification':return 'You have a new notification from Filmons';
    default:                   return `New notification from ${actorName}`;
  }
}

async function _insertNotification(row: Record<string, any>) {
  const title = row.title || _notifTitle(row.type || '', row.actor_name || row.from_user_name || 'Someone');
  const payload = { ...row, title };

  const { error } = await supabase.from('notifications').insert(payload);
  if (!error) {
    console.log('[notifications] ✓ saved type:', row.type, '→', row.user_id ?? row.to_user_id);
    return;
  }
  console.error('[notifications] insert error:', error.code, '-', error.message);

  // FK violation on post_id → retry without post fields
  if (error.code === '23503' && row.post_id) {
    const { error: e2 } = await supabase.from('notifications').insert({
      ...payload, post_id: null, post_content: null, post_image: null,
    });
    if (!e2) return;
    console.error('[notifications] retry error:', e2.message);
  }
}

// ── Test helper — call from browser console: filmons.testNotif("user-id") ────
export async function testNotif(toUserId: string) {
  console.log('[notifications] running test insert →', toUserId);
  await _insertNotification({
    user_id: toUserId, actor_id: null, actor_name: 'Test', actor_avatar: null,
    type: 'test', is_read: false,
  });
}
// Expose on window for easy console testing
if (typeof window !== 'undefined') {
  (window as any).filmons = { ...((window as any).filmons || {}), testNotif };
}
const CNT_KEY  = (uid: string) => `filmons_notifs_cnt_${uid}`;
const MAX      = 200;
const DEDUP_MS = 24 * 60 * 60 * 1000;

function genId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function loadLocal(uid: string): Notification[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY(uid)) || '[]'); } catch { return []; }
}
function saveLocal(uid: string, notifs: Notification[]) {
  const sliced = notifs.slice(0, MAX);
  localStorage.setItem(LS_KEY(uid), JSON.stringify(sliced));
  localStorage.setItem(CNT_KEY(uid), String(sliced.filter(n => !n.read).length));
}

// ── Push (fire-and-forget to server + optimistic localStorage write) ──────────
export function push(
  toUserId: string,
  notif: Omit<Notification, 'id' | 'toUserId' | 'read' | 'createdAt'>,
): void {
  // Allow self-notifications for system events like fp_purchase
  if (!toUserId) return;
  if (toUserId === notif.fromUserId && notif.type !== ('fp_purchase' as any)) return;

  // Optimistic local write (so the recipient sees it immediately when on same device)
  const all    = loadLocal(toUserId);
  const isDupe = all.some(n =>
    n.type       === notif.type &&
    n.fromUserId === notif.fromUserId &&
    n.postId     === notif.postId &&
    Date.now() - new Date(n.createdAt).getTime() < DEDUP_MS,
  );
  if (!isDupe) {
    const full: Notification = {
      id: genId(), toUserId, read: false,
      createdAt: new Date().toISOString(), ...notif,
    };
    saveLocal(toUserId, [full, ...all]);
    // Dispatch event so the real-time banner picks it up on the same device
    try { window.dispatchEvent(new CustomEvent('filmons:notif', { detail: full })); } catch {}
  }

  // Write to Supabase — use the actual table column names (user_id convention)
  _insertNotification({
    user_id:      toUserId,
    actor_id:     notif.fromUserId        || null,
    actor_name:   notif.fromUserName      || '',
    actor_avatar: notif.fromUserAvatar    || null,
    type:            notif.type,
    post_id:         (notif as any).postId    || null,
    post_content:    (notif as any).postContent || null,
    post_image:      (notif as any).postImage   || null,
    comment_content: (notif as any).commentContent || null,
    conversation_id: (notif as any).conversationId || null,
    is_read:         false,
  });
}

// ── Instant read from local cache (no network) ───────────────────────────────
export function getLocal(userId: string): Notification[] {
  return loadLocal(userId);
}

// ── Map a notifications table row → client Notification shape ─────────────────
// Handles both column-name conventions:
//   server-created table: to_user_id, from_user_id, from_user_name, read
//   client-created table: user_id,    actor_id,     actor_name,     is_read
function rowToNotif(r: any): Notification {
  return {
    id:             r.id,
    toUserId:       r.to_user_id    ?? r.user_id    ?? '',
    fromUserId:     r.from_user_id  ?? r.actor_id   ?? '',
    fromUserName:   r.from_user_name ?? r.actor_name ?? '',
    fromUserAvatar: r.from_user_avatar ?? r.actor_avatar ?? undefined,
    type:           r.type,
    postId:         r.post_id         ?? undefined,
    postContent:    r.post_content     ?? undefined,
    postImage:      r.post_image       ?? undefined,
    commentContent: r.comment_content  ?? undefined,
    conversationId: r.conversation_id  ?? undefined,
    fpAmount:       r.fp_amount        ?? undefined,
    read:           r.read ?? r.is_read ?? false,
    createdAt:      r.created_at       ?? new Date().toISOString(),
  };
}

// ── Read from notifications table (primary) ───────────────────────────────────
export async function getAll(userId: string): Promise<Notification[]> {
  // Use the edge function — it handles dynamic column names (to_user_id vs user_id)
  try {
    const resp = await fetch(`${BASE}/notifications/${userId}`, { headers: H() });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const json = await resp.json();
    // Server already returns camelCase Notification objects
    const mapped = (json.notifications || []) as Notification[];
    saveLocal(userId, mapped);
    return mapped;
  } catch (e) {
    console.warn('[notifications] getAll from server failed:', (e as any)?.message);
  }
  // Fallback to localStorage cache
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
  fetch(`${BASE}/notifications/${notifId}/read`, { method: 'PUT', headers: H() })
    .catch(() => {});
}

export function markAllRead(userId: string): void {
  saveLocal(userId, loadLocal(userId).map(n => ({ ...n, read: true })));
  localStorage.setItem(CNT_KEY(userId), '0');
  fetch(`${BASE}/notifications/${userId}/read-all`, { method: 'PUT', headers: H() })
    .catch(() => {});
}

export function remove(userId: string, notifId: string): void {
  const updated = loadLocal(userId).filter(n => n.id !== notifId);
  saveLocal(userId, updated);
  fetch(`${BASE}/notifications/${notifId}`, { method: 'DELETE', headers: H() })
    .then(r => { if (!r.ok) throw new Error(`${r.status}`); })
    .catch(() => {
      // Edge function SQL failing — delete directly via Supabase REST
      supabase.from('notifications').delete().eq('id', notifId).then(({ error }) => {
        if (error) console.warn('[notifications] remove REST fallback failed:', error.message);
      });
    });
}

export function clearAll(userId: string): void {
  saveLocal(userId, []);
  localStorage.setItem(CNT_KEY(userId), '0');
  fetch(`${BASE}/notifications/${userId}/all`, { method: 'DELETE', headers: H() })
    .then(r => { if (!r.ok) throw new Error(`${r.status}`); })
    .catch(() => {
      // Edge function SQL failing — delete directly via Supabase REST
      supabase.from('notifications').delete().eq('user_id', userId).then(({ error }) => {
        if (error) console.warn('[notifications] clearAll REST fallback failed:', error.message);
      });
    });
}

// ── Realtime subscription ─────────────────────────────────────────────────────
// Subscribes to INSERT events on the notifications table for this user.
// Returns an unsubscribe function — call it on component unmount.
//
// Falls back gracefully: if the table doesn't exist or realtime is disabled,
// the channel status will be 'CHANNEL_ERROR' and no events will fire (polling
// in the UI layer is the safety net).
export function subscribe(
  userId: string,
  onNew: (notif: Notification) => void,
): () => void {
  // Unique name per call — avoids the "cannot add callbacks after subscribe()" error
  // that happens when a component re-mounts before the cleanup runs.
  const name = `notifs:${userId}:${Date.now()}`;

  const channel = supabase
    .channel(name)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `to_user_id=eq.${userId}`,
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