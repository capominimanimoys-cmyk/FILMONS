/**
 * NotificationsContext
 *
 * Single source of truth for notifications across the whole app.
 * One Supabase Realtime channel per session (not per component).
 *
 * Key invariant: notifications are NEVER removed from state by a server fetch.
 * Server data is merged in — server wins for read-status updates, but locally
 * added notifications that haven't reached the server yet are preserved.
 */
import {
  createContext, useContext, useEffect, useState,
  useCallback, useRef, ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import * as notifStore from '../lib/notifications';
import { Notification } from '../types';
import { toast } from 'sonner';

interface NotificationsState {
  notifications: Notification[];
  unreadCount:   number;
  loading:       boolean;
  refresh:       () => Promise<void>;
  markRead:      (id: string) => void;
  markAllRead:   () => void;
  remove:        (id: string) => void;
  clearAll:      () => void;
}

const NotificationsContext = createContext<NotificationsState>({
  notifications: [],
  unreadCount:   0,
  loading:       false,
  refresh:       async () => {},
  markRead:      () => {},
  markAllRead:   () => {},
  remove:        () => {},
  clearAll:      () => {},
});

export function useNotifications() { return useContext(NotificationsContext); }

// ── Sort newest-first ─────────────────────────────────────────────────────────
function byDate(a: Notification, b: Notification) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

// ── Merge server list with current local list ─────────────────────────────────
// Server wins for read-status of shared IDs.
// Local-only notifications (optimistically added, not yet committed) are kept.
// Never replaces a non-empty list with an empty server response.
function merge(serverList: Notification[], localList: Notification[]): Notification[] {
  if (!serverList.length && localList.length) return localList; // server empty → keep local
  const serverIds = new Set(serverList.map(n => n.id));
  const inFlight  = localList.filter(n => !serverIds.has(n.id)); // local-only, not yet on server
  return [...serverList, ...inFlight].sort(byDate);
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading,       setLoading]       = useState(false);
  const seenIds = useRef<Set<string>>(new Set());

  // Derive unread count from notifications — single source of truth
  const unreadCount = notifications.filter(n => !n.read).length;

  // ── Add a single new notification (Realtime / push event) ────────────────────
  const addOne = useCallback((notif: Notification) => {
    setNotifications(prev => {
      if (prev.some(n => n.id === notif.id)) return prev;
      return [notif, ...prev];
    });
  }, []);

  // ── Fetch from server and MERGE into local state ──────────────────────────────
  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const fresh = await notifStore.getAll(user.id);
      fresh.forEach(n => seenIds.current.add(n.id));
      setNotifications(prev => merge(fresh, prev));
    } catch {}
    finally { setLoading(false); }
  }, [user?.id]); // eslint-disable-line

  // ── Seed from localStorage on login, then refresh from server ────────────────
  useEffect(() => {
    if (!user) { setNotifications([]); return; }
    const local = notifStore.getLocal(user.id);
    local.forEach(n => seenIds.current.add(n.id));
    setNotifications(local);
    refresh();
  }, [user?.id]); // eslint-disable-line

  // ── Toast helper — shown for push/realtime arrivals ──────────────────────────
  const showToast = useCallback((notif: Notification) => {
    const actor = notif.fromUserName || 'Someone';
    if (notif.type === 'new_follower') {
      toast(`${actor} started following you`, { duration: 4000 });
    } else if (notif.type === 'message_received' || notif.type === 'new_message' || notif.type === 'message') {
      toast(`New message from ${actor}`, { duration: 3500 });
    }
  }, []);

  // ── Realtime + same-device event + polling fallback ───────────────────────────
  useEffect(() => {
    if (!user) return;

    // Single Supabase Realtime channel for the session
    const unsub = notifStore.subscribe(user.id, (notif) => {
      if (seenIds.current.has(notif.id)) return;
      seenIds.current.add(notif.id);
      addOne(notif);
      showToast(notif);
    });

    // Same-device push() events (e.g., follow from same browser tab)
    const onPush = (e: Event) => {
      const notif = (e as CustomEvent<Notification>).detail;
      if (notif.toUserId !== user.id) return;
      if (seenIds.current.has(notif.id)) return;
      seenIds.current.add(notif.id);
      addOne(notif);
      showToast(notif);
    };
    window.addEventListener('filmons:notif', onPush);

    // Polling fallback: merge new arrivals, never replace
    const poll = setInterval(async () => {
      try {
        const fresh = await notifStore.getAll(user.id);
        const hasNew = fresh.some(n => !seenIds.current.has(n.id));
        if (hasNew) {
          fresh.forEach(n => seenIds.current.add(n.id));
          setNotifications(prev => merge(fresh, prev));
        }
      } catch {}
    }, 30_000);

    return () => {
      unsub();
      window.removeEventListener('filmons:notif', onPush);
      clearInterval(poll);
    };
  }, [user?.id, addOne]); // eslint-disable-line

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const markRead = useCallback((id: string) => {
    if (!user) return;
    notifStore.markRead(user.id, id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, [user?.id]); // eslint-disable-line

  const markAllRead = useCallback(() => {
    if (!user) return;
    notifStore.markAllRead(user.id);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, [user?.id]); // eslint-disable-line

  const remove = useCallback((id: string) => {
    if (!user) return;
    notifStore.remove(user.id, id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, [user?.id]); // eslint-disable-line

  const clearAll = useCallback(() => {
    if (!user) return;
    notifStore.clearAll(user.id);
    setNotifications([]);
  }, [user?.id]); // eslint-disable-line

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, loading, refresh, markRead, markAllRead, remove, clearAll }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
