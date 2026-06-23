/**
 * NotificationBanner — Real-time in-app notification banners.
 *
 * Priority:  message / fp_purchase → high (always show)
 *            comment / follow / repost / mention → medium (show)
 *            like / friend_like / friend_comment → low (silent, never show)
 *
 * Smart:
 *   - User typing (input focused) → compact style
 *   - Recording flag set          → queue silently, flush when done
 *   - Same notification within 2 s → group: "Sarah and 3 others …"
 */
import {
  createContext, useContext, useState, useEffect, useRef,
  useCallback, ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { Heart, MessageCircle, UserPlus, Repeat2, Bell, Inbox, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import * as notifStore from '../lib/notifications';
import { useNotifications } from '../context/NotificationsContext';
import { socialApi } from '../lib/api';
import { Notification, User } from '../types';

// ── Priority ──────────────────────────────────────────────────────────────────

const PRIORITY: Record<string, 'high' | 'medium' | 'low'> = {
  // High — banner + immediate attention
  new_message:           'high',
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
  message_reaction:      'medium',
  // Low — notification center only
  comment_deleted:       'low',
};

function shouldShow(n: Notification) {
  return PRIORITY[n.type] === 'high' || PRIORITY[n.type] === 'medium';
}

// ── Banner item (may represent multiple grouped notifs) ───────────────────────

interface BannerItem {
  key:     string;
  notifs:  Notification[];   // grouped
  compact: boolean;
}

// ── Context ───────────────────────────────────────────────────────────────────

interface BannerCtx { isRecording: boolean; setRecording: (v: boolean) => void; }
const Ctx = createContext<BannerCtx>({ isRecording: false, setRecording: () => {} });
export function useNotificationBanner() { return useContext(Ctx); }

// ── Provider ──────────────────────────────────────────────────────────────────

export function NotificationBannerProvider({ children }: { children: ReactNode }) {
  const { user }                  = useAuth();
  const [queue,    setQueue]      = useState<BannerItem[]>([]);
  const [current,  setCurrent]    = useState<BannerItem | null>(null);
  const [isRecording, setRecording] = useState(false);
  const seenIds                   = useRef<Set<string>>(new Set());
  const recordingQueue            = useRef<Notification[]>([]);
  const dismissTimer              = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupBuffer               = useRef<Notification[]>([]);
  const groupTimer                = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevNotifIds              = useRef<Set<string>>(new Set());

  // Detect typing (compact mode)
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

  // Flush recording queue when recording stops
  useEffect(() => {
    if (!isRecording && recordingQueue.current.length) {
      const queued = [...recordingQueue.current];
      recordingQueue.current = [];
      queued.forEach(n => enqueue(n, false));
    }
  }, [isRecording]); // eslint-disable-line

  // Enqueue a notification (with grouping)
  const enqueue = useCallback((notif: Notification, compact: boolean) => {
    if (!shouldShow(notif))             return;
    if (seenIds.current.has(notif.id))  return;
    seenIds.current.add(notif.id);

    if (isRecording) { recordingQueue.current.push(notif); return; }

    groupBuffer.current.push(notif);
    if (groupTimer.current) clearTimeout(groupTimer.current);
    groupTimer.current = setTimeout(() => {
      const batch = [...groupBuffer.current];
      groupBuffer.current = [];
      if (!batch.length) return;
      const item: BannerItem = {
        key:     batch.map(n => n.id).join(','),
        notifs:  batch,
        compact,
      };
      setQueue(q => [...q, item]);
    }, 800); // collect for 800 ms then flush as one grouped banner
  }, [isRecording]);

  // Seed seen IDs from localStorage on mount so old notifications don't re-banner
  useEffect(() => {
    if (!user) return;
    notifStore.getLocal(user.id).forEach(n => {
      prevNotifIds.current.add(n.id);
      seenIds.current.add(n.id);
    });
  }, [user?.id]); // eslint-disable-line

  // Drive banners from the shared NotificationsContext (single realtime channel)
  const { notifications: ctxNotifs } = useNotifications();
  useEffect(() => {
    if (!user) return;
    const newOnes = ctxNotifs.filter(n => !seenIds.current.has(n.id) && !n.read);
    newOnes.forEach(n => {
      seenIds.current.add(n.id);
      prevNotifIds.current.add(n.id);
      enqueue(n, typing);
    });
  }, [ctxNotifs]); // eslint-disable-line

  // Advance queue → current
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

// ── Banner renderer ───────────────────────────────────────────────────────────

const BANNER_STYLES = `
  @keyframes bnrIn {
    0%   { transform: translateY(-120%); opacity: 0; }
    55%  { transform: translateY(6px);   opacity: 1; }
    75%  { transform: translateY(-3px); }
    90%  { transform: translateY(2px); }
    100% { transform: translateY(0);     opacity: 1; }
  }
  @keyframes bnrOut {
    0%   { transform: translateY(0);     opacity: 1; }
    100% { transform: translateY(-120%); opacity: 0; }
  }
  @keyframes bnrTextIn {
    from { opacity: 0; transform: translateX(6px); }
    to   { opacity: 1; transform: translateX(0); }
  }
`;

function BannerRenderer({ item, compact, onDismiss }: {
  item: BannerItem; compact: boolean; onDismiss: () => void;
}) {
  const navigate       = useNavigate();
  const { user }       = useAuth();
  const primary        = item.notifs[0];
  const count          = item.notifs.length;
  const grouped        = count > 1;
  const [leaving, setLeaving] = useState(false);

  const dismiss = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onDismiss, 320);
  }, [leaving, onDismiss]);

  // Swipe-up to dismiss
  const startY = useRef(0);
  const onTouchStart = (e: React.TouchEvent) => { startY.current = e.touches[0].clientY; };
  const onTouchEnd   = (e: React.TouchEvent) => {
    if (startY.current - e.changedTouches[0].clientY > 30) dismiss();
  };

  const handleTap = () => {
    dismiss();
    if (primary.type === 'new_message') {
      navigate(primary.conversationId
        ? `/inbox?conv=${primary.conversationId}&with=${primary.fromUserId}`
        : `/inbox?with=${primary.fromUserId}`);
    } else if (primary.type === 'new_follower' || primary.type === 'follow_request') {
      navigate(`/host/${primary.fromUserId}`);
    } else if (primary.type === 'payment_received' || primary.type === 'payment_released') {
      navigate('/wallet');
    } else if (primary.postId) {
      navigate(`/post/${primary.postId}`);
    } else {
      navigate('/notifications');
    }
  };

  const cfg    = bannerCfg(primary);
  const isRich = primary.type === 'payment_received' || primary.type === 'payment_released'
    || primary.type === 'service_booked' || primary.type === 'account_verified'
    || primary.type === 'account_warning' || primary.type === 'system_announcement';

  const actorName  = grouped
    ? `${primary.fromUserName} and ${count - 1} other${count > 2 ? 's' : ''}`
    : primary.fromUserName;
  const actionText = grouped ? pluralAction(primary.type, count) : cfg.action;

  const animation = leaving
    ? 'bnrOut 0.30s cubic-bezier(0.4,0,0.6,1) forwards'
    : compact
      ? 'bnrIn 0.36s cubic-bezier(0.34,1.56,0.64,1) forwards'
      : 'bnrIn 0.42s cubic-bezier(0.34,1.56,0.64,1) forwards';

  // Progress bar
  const [progress, setProgress] = useState(100);
  useEffect(() => {
    const start = Date.now();
    const total = 4500;
    const tick = () => {
      const elapsed = Date.now() - start;
      setProgress(Math.max(0, 100 - (elapsed / total) * 100));
      if (elapsed < total) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, []);

  const wrapStyle: React.CSSProperties = {
    paddingTop: 'max(env(safe-area-inset-top), 10px)',
    animation,
  };

  if (compact) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[200] mx-auto max-w-sm px-3"
        style={wrapStyle} onClick={handleTap} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <style>{BANNER_STYLES}</style>
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-2xl shadow-lg"
          style={{ background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(20px)', border: '1px solid rgba(0,0,0,0.08)' }}>
          {/* Icon */}
          <div className={`w-7 h-7 rounded-full flex items-center justify-center bg-gradient-to-br ${cfg.gradient} shrink-0`}
            style={{ animation: 'bnrIn 0.36s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
            <cfg.Icon className="w-3.5 h-3.5 text-white"/>
          </div>
          {/* Text — staggered */}
          <p className="text-xs font-semibold text-gray-800 truncate flex-1"
            style={{ animation: 'bnrTextIn 0.28s ease forwards', animationDelay: '0.12s', opacity: 0 }}>
            <span className="font-bold">{actorName}</span> {actionText}
          </p>
          <button onClick={e => { e.stopPropagation(); dismiss(); }} className="shrink-0 p-0.5">
            <X className="w-3.5 h-3.5 text-gray-400"/>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] mx-auto max-w-sm px-3"
      style={wrapStyle} onClick={handleTap} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <style>{BANNER_STYLES}</style>

      <div className="relative rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(28px)', border: '1px solid rgba(0,0,0,0.06)' }}>

        {/* Progress bar */}
        <div className="absolute top-0 left-0 h-[2.5px] rounded-full"
          style={{ width: `${progress}%`, transition: 'width 0.1s linear',
            background: 'linear-gradient(90deg,#3b82f6,#8b5cf6)' }}/>

        <div className="px-4 py-3.5 flex items-center gap-3">

          {/* Avatar / icon — enters first */}
          <div style={{ animation: 'bnrIn 0.42s cubic-bezier(0.34,1.56,0.64,1) forwards' }} className="shrink-0">
            {isRich ? (
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl bg-gradient-to-br ${cfg.gradient}`}>
                {cfg.emoji}
              </div>
            ) : (
              <div className="relative">
                <div className="rounded-full overflow-hidden w-12 h-12">
                  {primary.fromUserAvatar
                    ? <img src={primary.fromUserAvatar} alt="" className="w-full h-full object-cover"/>
                    : <div className={`w-full h-full bg-gradient-to-br ${cfg.gradient} flex items-center justify-center`}>
                        <span className="text-white text-base font-bold">{primary.fromUserName?.[0]?.toUpperCase()}</span>
                      </div>
                  }
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-gradient-to-br ${cfg.gradient} rounded-full flex items-center justify-center border-2 border-white shadow-sm`}>
                  <cfg.Icon className="w-2.5 h-2.5 text-white"/>
                </div>
              </div>
            )}
          </div>

          {/* Text — staggered 120 ms after icon */}
          <div className="flex-1 min-w-0"
            style={{ animation: 'bnrTextIn 0.26s ease forwards', animationDelay: '0.12s', opacity: 0 }}>
            <p className="text-[13.5px] text-gray-900 leading-snug font-medium">
              <span className="font-bold">{isRich ? cfg.title : actorName}</span>
              {!isRich && <span className="text-gray-500 font-normal"> {actionText}</span>}
            </p>
            {primary.commentContent && (
              <p className="text-[11px] text-gray-400 truncate mt-0.5 leading-tight">
                "{primary.commentContent}"
              </p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] text-gray-300 font-medium">just now</span>
              {primary.type === 'new_follower' && user && (
                <FollowBackAction targetId={primary.fromUserId} currentUser={user}/>
              )}
              {primary.type === 'new_message' && (
                <button onClick={e => { e.stopPropagation(); dismiss(); navigate(primary.conversationId ? `/inbox?conv=${primary.conversationId}&with=${primary.fromUserId}` : `/inbox?with=${primary.fromUserId}`); }}
                  className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2.5 py-1 rounded-full">
                  Reply
                </button>
              )}
            </div>
          </div>

          {/* Post thumbnail */}
          {primary.postImage && !isRich && (
            <img src={primary.postImage} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0 border border-gray-100"/>
          )}
        </div>

        {/* Dismiss button */}
        <button onClick={e => { e.stopPropagation(); dismiss(); }}
          className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center rounded-full bg-black/[0.06] hover:bg-black/[0.10] transition-colors">
          <X className="w-3 h-3 text-gray-500"/>
        </button>
      </div>
    </div>
  );
}

// ── Follow-back inline action ─────────────────────────────────────────────────

function FollowBackAction({ targetId, currentUser }: { targetId: string; currentUser: User }) {
  const alreadyFollowing = (currentUser.following || []).includes(targetId);
  const [done, setDone] = useState(alreadyFollowing);
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
      className="text-[10px] font-bold text-white bg-blue-500 px-2 py-0.5 rounded-full disabled:opacity-60">
      {loading ? '…' : 'Follow back'}
    </button>
  );
}

// ── Config per notification type ─────────────────────────────────────────────

function bannerCfg(n: Notification) {
  switch (n.type) {
    // Comments
    case 'comment_received':     return { gradient: 'from-emerald-400 to-green-500',  Icon: MessageCircle, action: 'commented on your post',      title: 'New Comment',        emoji: '💬' };
    case 'comment_reply':        return { gradient: 'from-teal-400 to-cyan-500',      Icon: MessageCircle, action: 'replied to your comment',     title: 'Reply',              emoji: '↩️' };
    case 'comment_like':         return { gradient: 'from-pink-400 to-rose-500',      Icon: Heart,         action: 'liked your comment',          title: 'Comment Liked',      emoji: '❤️' };
    case 'comment_mention':      return { gradient: 'from-violet-400 to-purple-500',  Icon: MessageCircle, action: 'mentioned you in a comment',  title: 'Mention',            emoji: '@'  };
    case 'comment_pinned':       return { gradient: 'from-amber-400 to-yellow-500',   Icon: Bell,          action: 'pinned your comment',         title: 'Comment Pinned',     emoji: '📌' };
    case 'comment_deleted':      return { gradient: 'from-gray-400 to-gray-500',      Icon: Bell,          action: 'removed your comment',        title: 'Comment Removed',    emoji: '🗑️' };
    // Likes & Reposts
    case 'content_like':         return { gradient: 'from-rose-400 to-pink-500',      Icon: Heart,         action: 'liked your post',             title: 'New Like',           emoji: '❤️' };
    case 'content_repost':       return { gradient: 'from-green-400 to-emerald-500',  Icon: Repeat2,       action: 'reposted your content',       title: 'Repost',             emoji: '🔁' };
    // Followers
    case 'new_follower':         return { gradient: 'from-blue-500 to-blue-600',      Icon: UserPlus,      action: 'started following you',       title: 'New Follower',       emoji: '👤' };
    case 'follow_request':       return { gradient: 'from-indigo-400 to-blue-500',    Icon: UserPlus,      action: 'wants to follow you',         title: 'Follow Request',     emoji: '👤' };
    case 'follow_accepted':      return { gradient: 'from-blue-400 to-cyan-500',      Icon: UserPlus,      action: 'accepted your follow request',title: 'Follow Accepted',    emoji: '✅' };
    // Applications
    case 'application_received': return { gradient: 'from-purple-400 to-violet-500',  Icon: Bell,          action: 'applied to your listing',     title: 'Application',        emoji: '📋' };
    case 'application_accepted': return { gradient: 'from-green-400 to-emerald-500',  Icon: Bell,          action: '',                            title: '✅ Application Accepted', emoji: '✅' };
    case 'application_rejected': return { gradient: 'from-red-400 to-rose-500',       Icon: Bell,          action: '',                            title: 'Application Update', emoji: '📋' };
    // Messages
    case 'new_message':          return { gradient: 'from-sky-400 to-cyan-500',       Icon: Inbox,         action: 'sent you a message',          title: 'New Message',        emoji: '💬' };
    case 'message_reaction':     return { gradient: 'from-sky-300 to-blue-400',       Icon: Heart,         action: 'reacted to your message',     title: 'Message Reaction',   emoji: '❤️' };
    // Marketplace
    case 'service_booked':       return { gradient: 'from-orange-400 to-amber-500',   Icon: Bell,          action: 'booked your service',         title: '🛍️ Service Booked', emoji: '🛍️' };
    case 'booking_accepted':     return { gradient: 'from-green-400 to-emerald-500',  Icon: Bell,          action: '',                            title: '✅ Booking Accepted', emoji: '✅' };
    case 'booking_rejected':     return { gradient: 'from-red-400 to-rose-500',       Icon: Bell,          action: '',                            title: 'Booking Update',     emoji: '📋' };
    case 'payment_received':     return { gradient: 'from-emerald-500 to-green-600',  Icon: Bell,          action: '',                            title: '💰 Payment Received',emoji: '💰' };
    case 'payment_released':     return { gradient: 'from-green-500 to-teal-500',     Icon: Bell,          action: '',                            title: '💰 Payment Released',emoji: '💰' };
    // System
    case 'account_verified':     return { gradient: 'from-blue-500 to-indigo-600',    Icon: Bell,          action: '',                            title: '✅ Account Verified', emoji: '✅' };
    case 'account_warning':      return { gradient: 'from-red-500 to-rose-600',       Icon: Bell,          action: '',                            title: '⚠️ Account Notice',  emoji: '⚠️' };
    case 'system_announcement':  return { gradient: 'from-gray-600 to-gray-700',      Icon: Bell,          action: '',                            title: '📢 Announcement',    emoji: '📢' };
    default:                     return { gradient: 'from-gray-400 to-gray-500',      Icon: Bell,          action: 'sent you a notification',     title: 'Notification',       emoji: '🔔' };
  }
}

function pluralAction(type: string, count: number) {
  const others = `and ${count - 1} other${count > 2 ? 's' : ''}`;
  switch (type) {
    case 'content_like':     return `${others} liked your post`;
    case 'comment_received': return `${others} commented`;
    case 'new_follower':     return `${others} followed you`;
    default:                 return `${others} interacted`;
  }
}
