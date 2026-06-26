/**
 * NotificationBanner — Real-time in-app notification banners.
 *
 * Desktop: fixed top-right corner
 * Mobile:  bottom floating card
 *
 * Queue: notifications appear one at a time, 4.5 s auto-dismiss.
 * Recording mode: queue silently, flush when recording stops.
 */
import {
  createContext, useContext, useState, useEffect, useRef,
  useCallback, ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import {
  Heart, MessageCircle, UserPlus, Repeat2, Bell, Inbox, X,
  DollarSign, ShoppingBag, CheckCircle, AlertTriangle, Star, Megaphone,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import * as notifStore from '../lib/notifications';
import { useNotifications } from '../context/NotificationsContext';
import { socialApi } from '../lib/api';
import { Notification, User } from '../types';

// ── Priority map ──────────────────────────────────────────────────────────────
const PRIORITY: Record<string, 'high' | 'medium' | 'low'> = {
  // High — always banner
  message:               'high',
  new_message:           'high',
  message_received:      'high',
  message_reply:         'high',
  service_booked:        'high',
  booking_accepted:      'high',
  booking_rejected:      'high',
  payment_received:      'high',
  payment_released:      'high',
  application_received:  'high',
  application_accepted:  'high',
  application_rejected:  'high',
  account_verified:      'high',
  account_warning:       'high',
  system_announcement:   'high',
  marketplace_order:     'high',
  marketplace_booking:   'high',
  // Medium — banner shown
  comment_received:      'medium',
  comment_reply:         'medium',
  comment_like:          'medium',
  comment_mention:       'medium',
  comment_pinned:        'medium',
  content_like:          'medium',
  content_repost:        'medium',
  new_follower:          'medium',
  follow_request:        'medium',
  follow_accepted:       'medium',
  connection_request:    'medium',
  connection_accepted:   'medium',
  message_reaction:      'medium',
  // Low — notification center only
  comment_deleted:       'low',
  system_notification:   'low',
};

function shouldShow(n: Notification) {
  return PRIORITY[n.type] === 'high' || PRIORITY[n.type] === 'medium';
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface BannerItem { key: string; notifs: Notification[]; compact: boolean; }
interface BannerCtx  { isRecording: boolean; setRecording: (v: boolean) => void; }

const Ctx = createContext<BannerCtx>({ isRecording: false, setRecording: () => {} });
export function useNotificationBanner() { return useContext(Ctx); }

// ── Provider ──────────────────────────────────────────────────────────────────
export function NotificationBannerProvider({ children }: { children: ReactNode }) {
  const { user }                    = useAuth();
  const [queue,    setQueue]        = useState<BannerItem[]>([]);
  const [current,  setCurrent]      = useState<BannerItem | null>(null);
  const [isRecording, setRecording] = useState(false);
  const seenIds         = useRef<Set<string>>(new Set());
  const recordingQueue  = useRef<Notification[]>([]);
  const dismissTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupBuffer     = useRef<Notification[]>([]);
  const groupTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      setTyping(t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable);
    };
    const onBlur = () => setTyping(false);
    document.addEventListener('focusin',  onFocus);
    document.addEventListener('focusout', onBlur);
    return () => { document.removeEventListener('focusin', onFocus); document.removeEventListener('focusout', onBlur); };
  }, []);

  useEffect(() => {
    if (!isRecording && recordingQueue.current.length) {
      const queued = [...recordingQueue.current];
      recordingQueue.current = [];
      queued.forEach(n => enqueue(n, false));
    }
  }, [isRecording]); // eslint-disable-line

  const enqueue = useCallback((notif: Notification, compact: boolean) => {
    if (!shouldShow(notif))            return;
    if (seenIds.current.has(notif.id)) return;
    seenIds.current.add(notif.id);
    if (isRecording) { recordingQueue.current.push(notif); return; }
    groupBuffer.current.push(notif);
    if (groupTimer.current) clearTimeout(groupTimer.current);
    groupTimer.current = setTimeout(() => {
      const batch = [...groupBuffer.current];
      groupBuffer.current = [];
      if (!batch.length) return;
      setQueue(q => [...q, { key: batch.map(n => n.id).join(','), notifs: batch, compact }]);
    }, 600);
  }, [isRecording]);

  useEffect(() => {
    if (!user) return;
    notifStore.getLocal(user.id).forEach(n => seenIds.current.add(n.id));
  }, [user?.id]); // eslint-disable-line

  const { notifications: ctxNotifs } = useNotifications();
  useEffect(() => {
    if (!user) return;
    ctxNotifs
      .filter(n => !seenIds.current.has(n.id) && !n.read)
      .forEach(n => {
        seenIds.current.add(n.id);
        enqueue(n, typing);
      });
  }, [ctxNotifs]); // eslint-disable-line

  useEffect(() => {
    if (current || !queue.length) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setCurrent(null), 4500);
  }, [current, queue]);

  const dismiss = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setCurrent(null);
  }, []);

  return (
    <Ctx.Provider value={{ isRecording, setRecording }}>
      {children}
      {current && createPortal(
        <BannerRenderer item={current} compact={current.compact || typing} onDismiss={dismiss} />,
        document.body,
      )}
    </Ctx.Provider>
  );
}

// ── Animations ────────────────────────────────────────────────────────────────
const STYLES = `
  @keyframes bnrInTop {
    0%   { transform: translateY(-110%) scale(0.96); opacity: 0; }
    60%  { transform: translateY(4px)   scale(1.01); opacity: 1; }
    80%  { transform: translateY(-2px)  scale(0.995); }
    100% { transform: translateY(0)     scale(1);    opacity: 1; }
  }
  @keyframes bnrOutTop {
    from { transform: translateY(0) scale(1); opacity: 1; }
    to   { transform: translateY(-110%) scale(0.96); opacity: 0; }
  }
  @keyframes bnrInBottom {
    0%   { transform: translateY(110%) scale(0.96); opacity: 0; }
    60%  { transform: translateY(-4px) scale(1.01); opacity: 1; }
    80%  { transform: translateY(2px)  scale(0.995); }
    100% { transform: translateY(0)    scale(1);    opacity: 1; }
  }
  @keyframes bnrOutBottom {
    from { transform: translateY(0) scale(1); opacity: 1; }
    to   { transform: translateY(110%) scale(0.96); opacity: 0; }
  }
  @keyframes bnrTextIn {
    from { opacity: 0; transform: translateX(8px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes progressShrink {
    from { width: 100%; }
    to   { width: 0%; }
  }
`;

// ── Banner renderer ───────────────────────────────────────────────────────────
function BannerRenderer({ item, compact, onDismiss }: {
  item: BannerItem; compact: boolean; onDismiss: () => void;
}) {
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const primary    = item.notifs[0];
  const count      = item.notifs.length;
  const grouped    = count > 1;
  const [leaving, setLeaving] = useState(false);

  const dismiss = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onDismiss, 280);
  }, [leaving, onDismiss]);

  // Swipe up (mobile top) or down (mobile bottom) to dismiss
  const startY = useRef(0);
  const onTouchStart = (e: React.TouchEvent) => { startY.current = e.touches[0].clientY; };
  const onTouchEnd   = (e: React.TouchEvent) => {
    const delta = startY.current - e.changedTouches[0].clientY;
    if (Math.abs(delta) > 40) dismiss();
  };

  const handleTap = () => {
    dismiss();
    const isMsg = ['message', 'new_message', 'message_received', 'message_reply'].includes(primary.type);
    if (isMsg) {
      navigate(primary.conversationId
        ? `/inbox?conv=${primary.conversationId}&with=${primary.fromUserId}`
        : `/inbox?with=${primary.fromUserId}`);
    } else if (['new_follower', 'follow_request', 'follow_accepted', 'connection_request', 'connection_accepted'].includes(primary.type)) {
      navigate(`/host/${primary.fromUserId}`);
    } else if (['payment_received', 'payment_released'].includes(primary.type)) {
      navigate('/wallet');
    } else if (primary.postId) {
      navigate(`/post/${primary.postId}`);
    } else if (primary.conversationId) {
      navigate(`/inbox?conv=${primary.conversationId}&with=${primary.fromUserId}`);
    } else {
      navigate('/notifications');
    }
  };

  const cfg     = bannerCfg(primary);
  const isRich  = cfg.rich;
  const actorName  = grouped
    ? `${primary.fromUserName} and ${count - 1} other${count > 2 ? 's' : ''}`
    : (primary.fromUserName || 'Someone');
  const actionText = grouped ? pluralAction(primary.type, count) : cfg.action;

  // Desktop: top-right. Mobile: bottom. Use CSS media via inline logic.
  // We detect at render time (client-only component).
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;

  const posStyle: React.CSSProperties = isDesktop
    ? {
        top:    'max(env(safe-area-inset-top), 16px)',
        right:  '16px',
        left:   'auto',
        bottom: 'auto',
        width:  '360px',
      }
    : compact
      ? { top: 'max(env(safe-area-inset-top), 8px)', left: '12px', right: '12px', bottom: 'auto' }
      : { bottom: 'max(env(safe-area-inset-bottom), 16px)', left: '12px', right: '12px', top: 'auto' };

  const enterAnim = isDesktop
    ? 'bnrInTop 0.40s cubic-bezier(0.34,1.56,0.64,1) forwards'
    : compact
      ? 'bnrInTop 0.34s cubic-bezier(0.34,1.56,0.64,1) forwards'
      : 'bnrInBottom 0.40s cubic-bezier(0.34,1.56,0.64,1) forwards';

  const leaveAnim = isDesktop
    ? 'bnrOutTop 0.26s cubic-bezier(0.4,0,1,1) forwards'
    : compact
      ? 'bnrOutTop 0.26s cubic-bezier(0.4,0,1,1) forwards'
      : 'bnrOutBottom 0.26s cubic-bezier(0.4,0,1,1) forwards';

  const isMsg = ['message', 'new_message', 'message_received', 'message_reply'].includes(primary.type);
  const preview = primary.commentContent || (isMsg ? primary.messageContent : undefined);

  if (compact) {
    return (
      <div
        className="fixed z-[9999] mx-auto"
        style={{ ...posStyle, animation: leaving ? leaveAnim : enterAnim }}
        onClick={handleTap}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <style>{STYLES}</style>
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl shadow-lg"
          style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)', border: '1px solid rgba(0,0,0,0.08)' }}
        >
          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br ${cfg.gradient}`}>
            <cfg.Icon className="w-3.5 h-3.5 text-white" />
          </div>
          <p
            className="text-xs font-semibold text-gray-800 truncate flex-1"
            style={{ animation: 'bnrTextIn 0.22s ease forwards', animationDelay: '0.10s', opacity: 0 }}
          >
            <span className="font-bold">{isRich ? cfg.title : actorName}</span>
            {!isRich && <span className="text-gray-500 font-normal"> {actionText}</span>}
          </p>
          <button onClick={e => { e.stopPropagation(); dismiss(); }} className="shrink-0 p-0.5 rounded-full hover:bg-gray-100 transition-colors">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed z-[9999]"
      style={{ ...posStyle, animation: leaving ? leaveAnim : enterAnim }}
      onClick={handleTap}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <style>{STYLES}</style>
      <div
        className="relative rounded-2xl shadow-2xl overflow-hidden cursor-pointer"
        style={{ background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(28px)', border: '1px solid rgba(0,0,0,0.07)' }}
      >
        {/* Progress bar */}
        <div
          className="absolute top-0 left-0 h-[3px] rounded-full"
          style={{ animation: 'progressShrink 4.5s linear forwards', background: `linear-gradient(90deg,${cfg.barColor})` }}
        />

        <div className="px-4 py-3.5 flex items-start gap-3">
          {/* Avatar / Icon */}
          <div className="shrink-0 mt-0.5" style={{ animation: 'bnrInTop 0.40s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
            {isRich ? (
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl bg-gradient-to-br ${cfg.gradient} shadow-sm`}>
                {cfg.emoji}
              </div>
            ) : (
              <div className="relative">
                <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-white shadow-sm">
                  {primary.fromUserAvatar
                    ? <img src={primary.fromUserAvatar} alt="" className="w-full h-full object-cover" />
                    : <div className={`w-full h-full bg-gradient-to-br ${cfg.gradient} flex items-center justify-center`}>
                        <span className="text-white text-base font-bold">{(primary.fromUserName || '?')[0]?.toUpperCase()}</span>
                      </div>
                  }
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] bg-gradient-to-br ${cfg.gradient} rounded-full flex items-center justify-center border-2 border-white shadow`}>
                  <cfg.Icon className="w-2.5 h-2.5 text-white" />
                </div>
              </div>
            )}
          </div>

          {/* Text */}
          <div
            className="flex-1 min-w-0"
            style={{ animation: 'bnrTextIn 0.24s ease forwards', animationDelay: '0.14s', opacity: 0 }}
          >
            <p className="text-[13.5px] text-gray-900 leading-snug">
              <span className="font-bold">{isRich ? cfg.title : actorName}</span>
              {!isRich && <span className="text-gray-500 font-normal"> {actionText}</span>}
            </p>
            {preview && (
              <p className="text-[11.5px] text-gray-500 truncate mt-0.5 leading-tight italic">
                "{preview}"
              </p>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-gray-300 font-medium">just now</span>
              {isMsg && (
                <button
                  onClick={e => { e.stopPropagation(); dismiss(); navigate(primary.conversationId ? `/inbox?conv=${primary.conversationId}&with=${primary.fromUserId}` : `/inbox?with=${primary.fromUserId}`); }}
                  className="text-[10px] font-bold text-white bg-blue-500 hover:bg-blue-600 px-2.5 py-1 rounded-full transition-colors"
                >
                  Reply
                </button>
              )}
              {primary.type === 'new_follower' && user && (
                <FollowBackAction targetId={primary.fromUserId} currentUser={user} />
              )}
              {(primary.type === 'booking_accepted' || primary.type === 'service_booked') && (
                <button
                  onClick={e => { e.stopPropagation(); dismiss(); navigate('/notifications'); }}
                  className="text-[10px] font-bold text-white bg-green-500 hover:bg-green-600 px-2.5 py-1 rounded-full transition-colors"
                >
                  View
                </button>
              )}
              {(primary.type === 'payment_received' || primary.type === 'payment_released') && (
                <button
                  onClick={e => { e.stopPropagation(); dismiss(); navigate('/wallet'); }}
                  className="text-[10px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 px-2.5 py-1 rounded-full transition-colors"
                >
                  View Wallet
                </button>
              )}
            </div>
          </div>

          {/* Post thumbnail */}
          {primary.postImage && !isRich && (
            <img src={primary.postImage} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0 border border-gray-100 shadow-sm" />
          )}
        </div>

        {/* Dismiss button */}
        <button
          onClick={e => { e.stopPropagation(); dismiss(); }}
          className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full bg-black/[0.06] hover:bg-black/[0.12] transition-colors"
        >
          <X className="w-3 h-3 text-gray-500" />
        </button>
      </div>
    </div>
  );
}

// ── Follow-back inline action ─────────────────────────────────────────────────
function FollowBackAction({ targetId, currentUser }: { targetId: string; currentUser: User }) {
  const alreadyFollowing = (currentUser.following || []).includes(targetId);
  const [done, setDone]       = useState(alreadyFollowing);
  const [loading, setLoading] = useState(false);
  if (done) return <span className="text-[10px] text-gray-400 font-semibold">Following ✓</span>;
  return (
    <button
      onClick={async e => {
        e.stopPropagation();
        setLoading(true);
        try { await socialApi.follow(targetId); setDone(true); } catch {}
        finally { setLoading(false); }
      }}
      disabled={loading}
      className="text-[10px] font-bold text-white bg-blue-500 hover:bg-blue-600 px-2.5 py-1 rounded-full transition-colors disabled:opacity-60"
    >
      {loading ? '…' : 'Follow back'}
    </button>
  );
}

// ── Config per notification type ──────────────────────────────────────────────
function bannerCfg(n: Notification): {
  gradient: string; Icon: React.ElementType; action: string;
  title: string; emoji: string; rich: boolean; barColor: string;
} {
  switch (n.type) {
    // Messages
    case 'message':
    case 'new_message':
    case 'message_received':
    case 'message_reply':
      return { gradient: 'from-sky-400 to-blue-500',      Icon: Inbox,          action: 'sent you a message',          title: 'New Message',         emoji: '💬', rich: false, barColor: '#38bdf8,#3b82f6' };
    case 'message_reaction':
      return { gradient: 'from-sky-300 to-blue-400',      Icon: Heart,          action: 'reacted to your message',     title: 'Reaction',            emoji: '❤️', rich: false, barColor: '#7dd3fc,#60a5fa' };
    // Comments
    case 'comment_received':
      return { gradient: 'from-emerald-400 to-green-500', Icon: MessageCircle,  action: 'commented on your post',      title: 'New Comment',         emoji: '💬', rich: false, barColor: '#34d399,#22c55e' };
    case 'comment_reply':
      return { gradient: 'from-teal-400 to-cyan-500',     Icon: MessageCircle,  action: 'replied to your comment',     title: 'Reply',               emoji: '↩️', rich: false, barColor: '#2dd4bf,#06b6d4' };
    case 'comment_like':
      return { gradient: 'from-pink-400 to-rose-500',     Icon: Heart,          action: 'liked your comment',          title: 'Comment Liked',       emoji: '❤️', rich: false, barColor: '#f472b6,#f43f5e' };
    case 'comment_mention':
      return { gradient: 'from-violet-400 to-purple-500', Icon: MessageCircle,  action: 'mentioned you in a comment',  title: 'Mention',             emoji: '@',  rich: false, barColor: '#a78bfa,#a855f7' };
    case 'comment_pinned':
      return { gradient: 'from-amber-400 to-yellow-500',  Icon: Bell,           action: 'pinned your comment',         title: 'Comment Pinned',      emoji: '📌', rich: false, barColor: '#fbbf24,#eab308' };
    // Likes & Reposts
    case 'content_like':
      return { gradient: 'from-rose-400 to-pink-500',     Icon: Heart,          action: 'liked your post',             title: 'New Like',            emoji: '❤️', rich: false, barColor: '#fb7185,#ec4899' };
    case 'content_repost':
      return { gradient: 'from-green-400 to-emerald-500', Icon: Repeat2,        action: 'reposted your content',       title: 'Repost',              emoji: '🔁', rich: false, barColor: '#4ade80,#10b981' };
    // Network
    case 'new_follower':
      return { gradient: 'from-blue-500 to-blue-600',     Icon: UserPlus,       action: 'started following you',       title: 'New Follower',        emoji: '👤', rich: false, barColor: '#3b82f6,#2563eb' };
    case 'follow_request':
      return { gradient: 'from-indigo-400 to-blue-500',   Icon: UserPlus,       action: 'wants to follow you',         title: 'Follow Request',      emoji: '👤', rich: false, barColor: '#818cf8,#3b82f6' };
    case 'follow_accepted':
      return { gradient: 'from-blue-400 to-cyan-500',     Icon: UserPlus,       action: 'accepted your follow request',title: 'Follow Accepted',     emoji: '✅', rich: false, barColor: '#60a5fa,#06b6d4' };
    case 'connection_request':
      return { gradient: 'from-indigo-500 to-purple-500', Icon: UserPlus,       action: 'sent you a connection request',title: 'Connection Request', emoji: '🤝', rich: false, barColor: '#6366f1,#a855f7' };
    case 'connection_accepted':
      return { gradient: 'from-blue-500 to-indigo-500',   Icon: UserPlus,       action: 'accepted your connection',    title: 'Connected',           emoji: '✅', rich: false, barColor: '#3b82f6,#6366f1' };
    // Applications
    case 'application_received':
      return { gradient: 'from-purple-400 to-violet-500', Icon: Bell,           action: 'applied to your listing',     title: 'Application',         emoji: '📋', rich: false, barColor: '#c084fc,#8b5cf6' };
    case 'application_accepted':
      return { gradient: 'from-green-400 to-emerald-500', Icon: CheckCircle,    action: '',                            title: '✅ Application Accepted', emoji: '✅', rich: true,  barColor: '#4ade80,#10b981' };
    case 'application_rejected':
      return { gradient: 'from-red-400 to-rose-500',      Icon: Bell,           action: '',                            title: 'Application Update',  emoji: '📋', rich: true,  barColor: '#f87171,#f43f5e' };
    // Marketplace
    case 'service_booked':
    case 'marketplace_booking':
      return { gradient: 'from-orange-400 to-amber-500',  Icon: ShoppingBag,    action: 'booked your service',         title: '🛍️ New Booking',    emoji: '🛍️', rich: true,  barColor: '#fb923c,#f59e0b' };
    case 'marketplace_order':
      return { gradient: 'from-amber-500 to-orange-600',  Icon: ShoppingBag,    action: 'placed an order',             title: '📦 New Order',       emoji: '📦', rich: true,  barColor: '#f59e0b,#ea580c' };
    case 'marketplace_reply':
      return { gradient: 'from-orange-300 to-amber-400',  Icon: MessageCircle,  action: 'replied to your inquiry',     title: 'Marketplace Reply',   emoji: '💬', rich: false, barColor: '#fdba74,#fbbf24' };
    case 'booking_accepted':
      return { gradient: 'from-green-400 to-emerald-500', Icon: CheckCircle,    action: '',                            title: '✅ Booking Accepted',  emoji: '✅', rich: true,  barColor: '#4ade80,#10b981' };
    case 'booking_rejected':
      return { gradient: 'from-red-400 to-rose-500',      Icon: Bell,           action: '',                            title: 'Booking Declined',    emoji: '❌', rich: true,  barColor: '#f87171,#f43f5e' };
    // Payments
    case 'payment_received':
      return { gradient: 'from-emerald-500 to-green-600', Icon: DollarSign,     action: '',                            title: '💰 Payment Received', emoji: '💰', rich: true,  barColor: '#10b981,#16a34a' };
    case 'payment_released':
      return { gradient: 'from-green-500 to-teal-500',    Icon: DollarSign,     action: '',                            title: '💰 Payment Released', emoji: '💰', rich: true,  barColor: '#22c55e,#14b8a6' };
    // System
    case 'account_verified':
      return { gradient: 'from-blue-500 to-indigo-600',   Icon: CheckCircle,    action: '',                            title: '✅ Account Verified',  emoji: '✅', rich: true,  barColor: '#3b82f6,#4f46e5' };
    case 'account_warning':
      return { gradient: 'from-red-500 to-rose-600',      Icon: AlertTriangle,  action: '',                            title: '⚠️ Account Notice',   emoji: '⚠️', rich: true,  barColor: '#ef4444,#e11d48' };
    case 'system_announcement':
      return { gradient: 'from-gray-600 to-gray-700',     Icon: Megaphone,      action: '',                            title: '📢 Announcement',     emoji: '📢', rich: true,  barColor: '#4b5563,#374151' };
    case 'profile_completion':
      return { gradient: 'from-yellow-400 to-amber-500',  Icon: Star,           action: '',                            title: '⭐ Profile Progress',  emoji: '⭐', rich: true,  barColor: '#facc15,#f59e0b' };
    default:
      return { gradient: 'from-gray-400 to-gray-500',     Icon: Bell,           action: 'sent you a notification',     title: 'Notification',         emoji: '🔔', rich: false, barColor: '#9ca3af,#6b7280' };
  }
}

function pluralAction(type: string, count: number) {
  const others = count > 2 ? ` and ${count - 1} others` : ` and ${count - 1} other`;
  switch (type) {
    case 'content_like':     return `${others} liked your post`;
    case 'comment_received': return `${others} commented`;
    case 'new_follower':     return `${others} followed you`;
    default:                 return `${others} interacted`;
  }
}
