import { useState, useEffect, ElementType, MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  Bell, Heart, MessageCircle, UserPlus,
  Check, Trash2, X, BellOff, UserCheck, Inbox, ArrowRight, Repeat2,
  ShoppingBag, Zap, Trophy, AtSign, Image, Shield, Star,
  Rocket, Wrench, PartyPopper, Eye, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import { Notification, User } from '../types';
import { authApi, socialApi } from '../lib/api';
import { UserAvatar } from '../components/AccountTypeBadge';

// ── Time helpers ──────────────────────────────────────────────────────────────
function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60)     return 'just now';
  if (s < 3600)   return `${Math.floor(s / 60)}m`;
  if (s < 86400)  return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

// ── Priority sort (messages first, then marketplace, network, activity, system)
function priorityOf(type: string): number {
  if (['new_message','message_received','message_reply','message_reaction'].includes(type)) return 0;
  if (['marketplace_order','marketplace_booking','marketplace_reply','service_booked','booking_accepted','booking_rejected','payment_received','payment_released'].includes(type)) return 1;
  if (['connection_request','follow_request','connection_accepted','follow_accepted','new_follower'].includes(type)) return 2;
  if (['comment_received','comment_reply','comment_like','comment_mention','application_received','application_accepted','application_rejected'].includes(type)) return 3;
  if (['content_like','content_repost','new_post'].includes(type)) return 4;
  return 5;
}

function groupByDate(notifs: Notification[]): { label: string; items: Notification[] }[] {
  const now  = new Date();
  const tod  = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const week = tod - 6 * 86_400_000;
  const today: Notification[] = [], thisWeek: Notification[] = [], earlier: Notification[] = [];
  for (const n of notifs) {
    const t = new Date(n.createdAt).getTime();
    if (t >= tod) today.push(n);
    else if (t >= week) thisWeek.push(n);
    else earlier.push(n);
  }
  // Within each group: unread first, then by priority, then newest
  const sort = (arr: Notification[]) =>
    arr.slice().sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      const pd = priorityOf(a.type) - priorityOf(b.type);
      if (pd !== 0) return pd;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  const groups: { label: string; items: Notification[] }[] = [];
  if (today.length)    groups.push({ label: 'Today',     items: sort(today) });
  if (thisWeek.length) groups.push({ label: 'This week', items: sort(thisWeek) });
  if (earlier.length)  groups.push({ label: 'Earlier',   items: sort(earlier) });
  return groups;
}

// ── Config per notification type ─────────────────────────────────────────────
type NotifCfg = {
  icon: ElementType;
  gradient: string;
  iconColor: string;
  ringColor: string;
  label: (n: Notification) => string;
};

function typeCfg(n: Notification): NotifCfg {
  switch (n.type) {
    // Comments
    case 'comment_received':
      return { icon: MessageCircle, gradient: 'from-emerald-400 to-green-500',   iconColor: 'text-white', ringColor: 'ring-green-100',
               label: () => 'commented on your post' };
    case 'comment_reply':
      return { icon: MessageCircle, gradient: 'from-teal-400 to-cyan-500',       iconColor: 'text-white', ringColor: 'ring-teal-100',
               label: () => 'replied to your comment' };
    case 'comment_like':
      return { icon: Heart,         gradient: 'from-pink-400 to-fuchsia-500',    iconColor: 'text-white', ringColor: 'ring-pink-100',
               label: () => 'liked your comment' };
    case 'comment_mention':
      return { icon: AtSign,        gradient: 'from-violet-400 to-purple-500',   iconColor: 'text-white', ringColor: 'ring-violet-100',
               label: () => 'mentioned you in a comment' };
    case 'comment_pinned':
      return { icon: Bell,          gradient: 'from-amber-400 to-yellow-500',    iconColor: 'text-white', ringColor: 'ring-amber-100',
               label: () => 'pinned your comment' };
    case 'comment_deleted':
      return { icon: Bell,          gradient: 'from-gray-400 to-gray-500',       iconColor: 'text-white', ringColor: 'ring-gray-100',
               label: () => 'removed your comment' };
    // Posts
    case 'new_post':
      return { icon: Image,         gradient: 'from-blue-400 to-violet-500',     iconColor: 'text-white', ringColor: 'ring-blue-100',
               label: () => 'shared a new post' };
    // Likes & Reposts
    case 'content_like':
      return { icon: Heart,         gradient: 'from-rose-400 to-pink-500',       iconColor: 'text-white', ringColor: 'ring-rose-100',
               label: () => 'liked your post' };
    case 'content_repost':
      return { icon: Repeat2,       gradient: 'from-green-400 to-emerald-500',   iconColor: 'text-white', ringColor: 'ring-green-100',
               label: () => 'reposted your content' };
    // Network
    case 'new_follower':
      return { icon: UserPlus,      gradient: 'from-blue-500 to-blue-600',       iconColor: 'text-white', ringColor: 'ring-blue-100',
               label: () => 'started following you' };
    case 'follow_request':
      return { icon: UserPlus,      gradient: 'from-indigo-400 to-blue-500',     iconColor: 'text-white', ringColor: 'ring-indigo-100',
               label: () => 'wants to follow you' };
    case 'follow_accepted':
      return { icon: UserCheck,     gradient: 'from-blue-400 to-cyan-500',       iconColor: 'text-white', ringColor: 'ring-blue-100',
               label: () => 'accepted your follow request' };
    case 'connection_request':
      return { icon: UserPlus,      gradient: 'from-indigo-500 to-purple-500',   iconColor: 'text-white', ringColor: 'ring-indigo-100',
               label: () => 'sent you a connection request' };
    case 'connection_accepted':
      return { icon: UserCheck,     gradient: 'from-blue-500 to-indigo-500',     iconColor: 'text-white', ringColor: 'ring-blue-100',
               label: () => 'accepted your connection request' };
    // Applications
    case 'application_received':
      return { icon: Bell,          gradient: 'from-purple-400 to-violet-500',   iconColor: 'text-white', ringColor: 'ring-purple-100',
               label: () => 'applied to your listing' };
    case 'application_accepted':
      return { icon: Check,         gradient: 'from-green-400 to-emerald-500',   iconColor: 'text-white', ringColor: 'ring-green-100',
               label: () => 'Your application was accepted' };
    case 'application_rejected':
      return { icon: Bell,          gradient: 'from-red-400 to-rose-500',        iconColor: 'text-white', ringColor: 'ring-red-100',
               label: () => 'Application update received' };
    // Messages
    case 'new_message':
    case 'message_received':
      return { icon: Inbox,         gradient: 'from-sky-400 to-cyan-500',        iconColor: 'text-white', ringColor: 'ring-sky-100',
               label: () => 'sent you a message' };
    case 'message_reply':
      return { icon: MessageCircle, gradient: 'from-cyan-400 to-blue-500',       iconColor: 'text-white', ringColor: 'ring-cyan-100',
               label: () => 'replied to your message' };
    case 'message_reaction':
      return { icon: Heart,         gradient: 'from-sky-300 to-blue-400',        iconColor: 'text-white', ringColor: 'ring-sky-100',
               label: () => 'reacted to your message' };
    // Marketplace
    case 'service_booked':
    case 'marketplace_booking':
      return { icon: ShoppingBag,   gradient: 'from-orange-400 to-amber-500',    iconColor: 'text-white', ringColor: 'ring-orange-100',
               label: () => n.type === 'marketplace_booking' ? 'requested a booking' : 'booked your service' };
    case 'marketplace_order':
      return { icon: ShoppingBag,   gradient: 'from-amber-500 to-orange-600',    iconColor: 'text-white', ringColor: 'ring-amber-100',
               label: () => 'placed a new order' };
    case 'marketplace_reply':
      return { icon: MessageCircle, gradient: 'from-orange-300 to-amber-400',    iconColor: 'text-white', ringColor: 'ring-orange-100',
               label: () => 'replied to your inquiry' };
    case 'booking_accepted':
      return { icon: Check,         gradient: 'from-green-400 to-emerald-500',   iconColor: 'text-white', ringColor: 'ring-green-100',
               label: () => 'Your booking was accepted' };
    case 'booking_rejected':
      return { icon: X,             gradient: 'from-red-400 to-rose-500',        iconColor: 'text-white', ringColor: 'ring-red-100',
               label: () => 'Your booking was declined' };
    case 'payment_received':
      return { icon: Zap,           gradient: 'from-emerald-500 to-green-600',   iconColor: 'text-white', ringColor: 'ring-emerald-100',
               label: () => 'Payment received' };
    case 'payment_released':
      return { icon: Zap,           gradient: 'from-green-500 to-teal-500',      iconColor: 'text-white', ringColor: 'ring-green-100',
               label: () => 'Your payment has been released' };
    // Profile & Trust
    case 'profile_completion':
      return { icon: Star,          gradient: 'from-yellow-400 to-amber-500',    iconColor: 'text-white', ringColor: 'ring-yellow-100',
               label: () => 'Your profile is now 80% complete' };
    case 'trust_level_update':
      return { icon: Shield,        gradient: 'from-blue-600 to-indigo-700',     iconColor: 'text-white', ringColor: 'ring-blue-100',
               label: () => 'Trust level increased to Pro' };
    // System
    case 'account_verified':
      return { icon: Trophy,        gradient: 'from-blue-500 to-indigo-600',     iconColor: 'text-white', ringColor: 'ring-blue-100',
               label: () => 'Your account has been verified' };
    case 'account_warning':
      return { icon: Bell,          gradient: 'from-red-500 to-rose-600',        iconColor: 'text-white', ringColor: 'ring-red-100',
               label: () => 'Important notice about your account' };
    case 'system_announcement':
    case 'system_notification':
      return { icon: Rocket,        gradient: 'from-gray-600 to-gray-700',       iconColor: 'text-white', ringColor: 'ring-gray-100',
               label: () => 'New announcement from Filmons' };
    default:
      return { icon: Bell,          gradient: 'from-gray-400 to-gray-500',       iconColor: 'text-white', ringColor: 'ring-gray-100',
               label: () => '' };
  }
}

// ── System notification: no avatar, use a styled icon circle ─────────────────
const SYSTEM_TYPES: string[] = [
  'account_verified','account_warning','system_announcement','system_notification',
  'profile_completion','trust_level_update','booking_accepted','booking_rejected',
  'payment_released','application_accepted','application_rejected',
];

function isSystemType(type: string) { return SYSTEM_TYPES.includes(type); }

function systemIcon(type: string): ElementType {
  switch (type) {
    case 'profile_completion': return Star;
    case 'trust_level_update': return Shield;
    case 'account_verified':   return Trophy;
    case 'account_warning':    return Bell;
    case 'system_announcement':
    case 'system_notification':return Rocket;
    case 'booking_accepted':   return Check;
    case 'booking_rejected':   return X;
    case 'payment_released':   return Zap;
    case 'application_accepted': return PartyPopper;
    case 'application_rejected': return Bell;
    default:                   return Wrench;
  }
}

// ── Follow-back inline button ─────────────────────────────────────────────────
function FollowBackBtn({ targetUserId, already }: { targetUserId: string; already: boolean }) {
  const [done,    setDone]    = useState(already);
  const [loading, setLoading] = useState(false);

  const handle = async (e: MouseEvent) => {
    e.stopPropagation();
    if (done || loading) return;
    setLoading(true);
    try { await socialApi.follow(targetUserId); setDone(true); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
        <UserCheck className="w-2.5 h-2.5" /> Following
      </span>
    );
  }
  return (
    <button
      onClick={handle}
      disabled={loading}
      className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full px-2.5 py-0.5 transition-colors"
    >
      {loading
        ? <span className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin" />
        : <><UserPlus className="w-2.5 h-2.5" /> Follow back</>
      }
    </button>
  );
}

// ── Single notification row ───────────────────────────────────────────────────
function NotifRow({ notif, currentUser, onRead, onRemove, onNavigate }: {
  notif: Notification;
  currentUser: User;
  onRead:     (id: string) => void;
  onRemove:   (id: string) => void;
  onNavigate: (notif: Notification) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const cfg      = typeCfg(notif);
  const Icon     = cfg.icon;
  const fromUser = authApi.getUserByIdSync(notif.fromUserId);
  const alreadyFollowing = (currentUser.following || []).includes(notif.fromUserId);
  const isSystem = isSystemType(notif.type);
  const SysIcon  = systemIcon(notif.type);

  const preview = notif.messageContent || notif.commentContent;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(notif)}
      onKeyDown={e => e.key === 'Enter' && onNavigate(notif)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative flex items-start gap-3.5 px-4 py-3.5 cursor-pointer transition-all border-b border-gray-50 last:border-0 ${
        notif.read ? 'hover:bg-gray-50/80' : 'bg-gradient-to-r from-blue-50/70 to-transparent hover:from-blue-50'
      }`}
    >
      {/* Unread bar */}
      {!notif.read && (
        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-blue-500" />
      )}

      {/* Avatar or system icon */}
      <div className="relative shrink-0 mt-0.5">
        {isSystem ? (
          <div className={`w-[42px] h-[42px] bg-gradient-to-br ${cfg.gradient} rounded-full flex items-center justify-center ring-2 ${cfg.ringColor}`}>
            <SysIcon className="w-5 h-5 text-white" />
          </div>
        ) : (
          <>
            <div className={`ring-2 ${cfg.ringColor} rounded-full`}>
              <UserAvatar
                user={fromUser || { name: notif.fromUserName, avatar: notif.fromUserAvatar, id: notif.fromUserId } as User}
                size={42}
              />
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] bg-gradient-to-br ${cfg.gradient} rounded-full flex items-center justify-center shadow-sm border-2 border-white`}>
              <Icon className={`w-2 h-2 ${cfg.iconColor}`} />
            </div>
          </>
        )}
      </div>

      {/* Text body */}
      <div className="flex-1 min-w-0 pr-6">
        <p className="text-[13px] leading-snug text-gray-800">
          {!isSystem && (
            <span className="font-bold text-gray-900">{notif.fromUserName} </span>
          )}
          <span className={isSystem ? 'font-semibold text-gray-800' : 'text-gray-500'}>
            {cfg.label(notif)}
          </span>
        </p>

        {/* Preview text (message / comment) */}
        {preview && (
          <div className="mt-1 px-2 py-1 bg-gray-100 rounded-lg text-[11px] text-gray-500 line-clamp-1 italic border-l-2 border-gray-300">
            {preview}
          </div>
        )}

        {/* Post snippet */}
        {notif.postContent && !preview && (
          <p className="mt-0.5 text-[11px] text-gray-400 line-clamp-1">{notif.postContent}</p>
        )}

        {/* Listing title for marketplace */}
        {notif.listingTitle && (
          <p className="mt-0.5 text-[11px] text-orange-500 font-medium truncate">{notif.listingTitle}</p>
        )}

        {/* Footer: time + actions */}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-gray-400 font-medium">{timeAgo(notif.createdAt)}</span>
          {!notif.read && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
          )}
          {(notif.type === 'new_follower' || notif.type === 'connection_accepted') && notif.fromUserId !== currentUser.id && (
            <FollowBackBtn targetUserId={notif.fromUserId} already={alreadyFollowing} />
          )}
          {(notif.type === 'connection_request' || notif.type === 'follow_request') && (
            <button
              onClick={e => { e.stopPropagation(); onNavigate(notif); }}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full px-2.5 py-0.5 transition-colors"
            >
              <ChevronRight className="w-2.5 h-2.5" /> View
            </button>
          )}
        </div>
      </div>

      {/* Post thumbnail */}
      {notif.postImage && (
        <img src={notif.postImage} alt="" className="w-11 h-11 object-cover rounded-xl shrink-0 border border-gray-100 shadow-sm" />
      )}
      {notif.listingImage && !notif.postImage && (
        <img src={notif.listingImage} alt="" className="w-11 h-11 object-cover rounded-xl shrink-0 border border-gray-100 shadow-sm" />
      )}

      {/* Hover quick actions */}
      <div className={`absolute top-2.5 right-2.5 flex items-center gap-1 transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'}`}>
        {!notif.read && (
          <button
            title="Mark as read"
            onClick={e => { e.stopPropagation(); onRead(notif.id); }}
            className="w-6 h-6 flex items-center justify-center rounded-full text-blue-500 hover:bg-blue-50 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          title="View"
          onClick={e => { e.stopPropagation(); onRead(notif.id); onNavigate(notif); }}
          className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
        <button
          title="Delete"
          onClick={e => { e.stopPropagation(); onRemove(notif.id); }}
          className="w-6 h-6 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Suggested follow-back card ────────────────────────────────────────────────
function SuggestedCard({ user, following }: { user: User; following: string[] }) {
  const navigate = useNavigate();
  const [followed, setFollowed] = useState(following.includes(user.id));
  const [loading,  setLoading]  = useState(false);

  const handleFollow = async (e: MouseEvent) => {
    e.stopPropagation();
    if (followed || loading) return;
    setLoading(true);
    try { await socialApi.follow(user.id); setFollowed(true); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  return (
    <div
      className="flex items-center gap-3 py-3 px-4 border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors cursor-pointer"
      onClick={() => navigate(`/host/${user.id}`)}
    >
      <UserAvatar user={user} size={40} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{user.name}</p>
        <p className="text-[11px] text-gray-400 truncate">
          {user.username ? `@${user.username}` : (user as any).accountCategory || 'Filmons creator'}
        </p>
      </div>
      <button
        onClick={handleFollow}
        disabled={followed || loading}
        className={`shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-all ${
          followed
            ? 'bg-gray-100 text-gray-400 cursor-default'
            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
        }`}
      >
        {followed
          ? <><UserCheck className="w-3 h-3" /> Following</>
          : <><UserPlus className="w-3 h-3" /> Follow</>
        }
      </button>
    </div>
  );
}

// ── Tab filter ────────────────────────────────────────────────────────────────
type Tab = 'all' | 'unread' | 'messages' | 'marketplace' | 'network';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all',         label: 'All'         },
  { key: 'unread',      label: 'Unread'      },
  { key: 'messages',    label: 'Messages'    },
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'network',     label: 'Network'     },
];

const MESSAGE_TYPES   = ['new_message','message_received','message_reply','message_reaction'];
const MARKETPLACE_TYPES = ['service_booked','booking_accepted','booking_rejected','payment_received','payment_released','marketplace_order','marketplace_booking','marketplace_reply','application_received','application_accepted','application_rejected'];
const NETWORK_TYPES   = ['new_follower','follow_request','follow_accepted','connection_request','connection_accepted'];

function filterByTab(notifs: Notification[], tab: Tab): Notification[] {
  switch (tab) {
    case 'unread':      return notifs.filter(n => !n.read);
    case 'messages':    return notifs.filter(n => MESSAGE_TYPES.includes(n.type));
    case 'marketplace': return notifs.filter(n => MARKETPLACE_TYPES.includes(n.type));
    case 'network':     return notifs.filter(n => NETWORK_TYPES.includes(n.type));
    default:            return notifs;
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    notifications: notifs,
    loading: refreshing,
    refresh: load,
    markRead,
    remove,
    markAllRead: ctxMarkAllRead,
    clearAll: ctxClearAll,
  } = useNotifications();

  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [activeTab,   setActiveTab]   = useState<Tab>('all');

  useEffect(() => {
    if (!user) return;
    authApi.getAllUsers().then(allUsers => {
      const myFollowers    = user.followers || [];
      const myFollowingSet = new Set(user.following || []);
      const followBack = allUsers.filter(u =>
        u.id !== user.id && myFollowers.includes(u.id) && !myFollowingSet.has(u.id)
      );
      const mayKnow = allUsers.filter(u =>
        u.id !== user.id && !myFollowingSet.has(u.id) && !myFollowers.includes(u.id)
      ).slice(0, 3);
      setSuggestions([...followBack, ...mayKnow].slice(0, 8));
    }).catch(() => {});
  }, [user?.id]); // eslint-disable-line

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user?.id]); // eslint-disable-line

  const handleNavigate = (n: Notification) => {
    markRead(n.id);
    if (MESSAGE_TYPES.includes(n.type)) {
      navigate(n.conversationId
        ? `/inbox?conv=${n.conversationId}&with=${n.fromUserId}`
        : `/inbox?with=${n.fromUserId}`);
    } else if (n.type === 'payment_received' || n.type === 'payment_released') {
      navigate('/wallet');
    } else if (MARKETPLACE_TYPES.includes(n.type)) {
      navigate(n.listingId ? `/listing/${n.listingId}` : '/marketplace');
    } else if (n.postId) {
      navigate(`/post/${n.postId}`);
    } else if (n.fromUserId) {
      navigate(`/host/${n.fromUserId}`);
    }
  };

  const handleMarkAllRead = () => ctxMarkAllRead();
  const handleClearAll = () => {
    if (!window.confirm('Clear all notifications?')) return;
    ctxClearAll();
  };

  const unread   = notifs.filter(n => !n.read).length;
  const visible  = filterByTab(notifs, activeTab);
  const groups   = groupByDate(visible);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <div className="max-w-lg mx-auto pb-10">

        {/* ── Header ── */}
        <div className="bg-white border-b border-gray-100 sticky top-0 z-20 px-5 pt-5 pb-0">
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-md shadow-blue-200">
                <Bell className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900 leading-none tracking-tight">Notifications</h1>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {unread > 0 ? `${unread} unread` : refreshing ? 'Refreshing…' : "You're all caught up"}
                </p>
              </div>
              {unread > 0 && (
                <span className="bg-blue-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                  {unread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              {unread > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-xs text-blue-600 font-semibold hover:text-blue-800 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" /> Read all
                </button>
              )}
              {notifs.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 font-medium px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex -mx-5 px-4 overflow-x-auto scrollbar-hide border-t border-gray-100">
            {TABS.map(t => {
              const isActive = activeTab === t.key;
              const cnt = t.key === 'unread'
                ? notifs.filter(n => !n.read).length
                : t.key === 'all' ? 0
                : filterByTab(notifs, t.key).filter(n => !n.read).length;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`relative shrink-0 flex items-center gap-1.5 px-3 py-3 text-[12px] font-semibold transition-all border-b-2 ${
                    isActive
                      ? 'text-blue-600 border-blue-600'
                      : 'text-gray-500 border-transparent hover:text-gray-800'
                  }`}
                >
                  {t.label}
                  {cnt > 0 && (
                    <span className={`text-[9px] font-black min-w-[15px] h-[15px] flex items-center justify-center px-0.5 rounded-full leading-none ${
                      isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                    }`}>{cnt}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── People you may know ── */}
        {suggestions.length > 0 && activeTab === 'all' && (
          <div className="mt-3 mx-3 bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100/80">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <p className="text-[11px] font-bold uppercase tracking-widest text-blue-600">
                  People you may know
                </p>
              </div>
              <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 font-semibold">
                {suggestions.length}
              </span>
            </div>
            {suggestions.map(s => (
              <SuggestedCard key={s.id} user={s} following={user.following || []} />
            ))}
          </div>
        )}

        {/* ── Notifications list ── */}
        <div className="mt-3 mx-3 bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100/80">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-gray-50 to-gray-100 rounded-full flex items-center justify-center mb-4 shadow-inner">
                <BellOff className="w-9 h-9 text-gray-300" />
              </div>
              <p className="text-sm font-bold text-gray-600 mb-1.5">
                {activeTab === 'unread' ? 'All caught up' : 'No notifications yet'}
              </p>
              <p className="text-xs text-gray-400 max-w-[240px] leading-relaxed">
                {activeTab === 'unread'
                  ? 'You have no unread notifications.'
                  : 'When people interact with your profile, posts, marketplace listings, or messages, you\'ll see them here.'}
              </p>
              {activeTab === 'all' && (
                <button
                  onClick={() => navigate('/feed')}
                  className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Explore the feed <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : (
            groups.map((group, gi) => (
              <div key={group.label}>
                <div className={`px-4 py-2 ${gi === 0 ? '' : 'border-t border-gray-50'}`}>
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-400">
                    {group.label}
                  </p>
                </div>
                {group.items.map(n => (
                  <NotifRow
                    key={n.id}
                    notif={n}
                    currentUser={user}
                    onRead={markRead}
                    onRemove={remove}
                    onNavigate={handleNavigate}
                  />
                ))}
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
