import { useState, useEffect, ElementType, MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  Bell, Heart, MessageCircle, UserPlus, DollarSign,
  Check, Trash2, X, BellOff, UserCheck, Inbox, ArrowRight, Repeat2,
  ShoppingBag, Zap, Trophy, AtSign, Shield, Star,
  Rocket, Wrench, PartyPopper, Eye, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import { Notification, User } from '../types';
import { authApi, socialApi } from '../lib/api';
import { UserAvatar } from '../components/AccountTypeBadge';

// ── Time helper ───────────────────────────────────────────────────────────────
function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60)     return 'just now';
  if (s < 3600)   return `${Math.floor(s / 60)}m`;
  if (s < 86400)  return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

// ── Priority sort ─────────────────────────────────────────────────────────────
function priorityOf(type: string): number {
  if (['message','new_message','message_received','message_reply','message_reaction'].includes(type)) return 0;
  if (['payment_received','payment_released'].includes(type)) return 1;
  if (['service_booked','booking_accepted','booking_rejected','marketplace_order','marketplace_booking'].includes(type)) return 2;
  if (['application_received','application_accepted','application_rejected'].includes(type)) return 3;
  if (['connection_request','follow_request','connection_accepted','follow_accepted','new_follower'].includes(type)) return 4;
  if (['comment_received','comment_reply','comment_like','comment_mention','comment_pinned'].includes(type)) return 5;
  if (['content_like','content_repost','new_post'].includes(type)) return 6;
  return 7;
}

// ── Grouped notification type ─────────────────────────────────────────────────
interface GroupedNotif {
  key: string;
  items: Notification[];
  createdAt: string;
  read: boolean;
  postId?: string;
}

// Only group social interactions on the same post
const GROUPABLE = new Set(['content_like', 'new_follower', 'content_repost', 'comment_like']);

function groupSimilar(notifs: Notification[]): GroupedNotif[] {
  const map = new Map<string, GroupedNotif>();
  const ordered: string[] = [];

  for (const n of notifs) {
    if (!GROUPABLE.has(n.type)) {
      const key = `solo:${n.id}`;
      map.set(key, { key, items: [n], createdAt: n.createdAt, read: n.read, postId: n.postId });
      ordered.push(key);
      continue;
    }
    const groupKey = n.postId ? `${n.type}:${n.postId}` : `${n.type}:follow`;
    if (map.has(groupKey)) {
      const g = map.get(groupKey)!;
      g.items.push(n);
      if (!n.read) g.read = false;
    } else {
      map.set(groupKey, { key: groupKey, items: [n], createdAt: n.createdAt, read: n.read, postId: n.postId });
      ordered.push(groupKey);
    }
  }

  return ordered.map(k => map.get(k)!);
}

function groupByDate(notifs: Notification[]): { label: string; groups: GroupedNotif[] }[] {
  const grouped  = groupSimilar(notifs);
  const now      = new Date();
  const tod      = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const week     = tod - 6 * 86_400_000;
  const today: GroupedNotif[] = [], thisWeek: GroupedNotif[] = [], earlier: GroupedNotif[] = [];

  for (const g of grouped) {
    const t = new Date(g.createdAt).getTime();
    if (t >= tod)  today.push(g);
    else if (t >= week) thisWeek.push(g);
    else           earlier.push(g);
  }

  const sort = (arr: GroupedNotif[]) =>
    arr.slice().sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      const pd = priorityOf(a.items[0].type) - priorityOf(b.items[0].type);
      if (pd !== 0) return pd;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const sections: { label: string; groups: GroupedNotif[] }[] = [];
  if (today.length)    sections.push({ label: 'Today',     groups: sort(today) });
  if (thisWeek.length) sections.push({ label: 'This week', groups: sort(thisWeek) });
  if (earlier.length)  sections.push({ label: 'Earlier',   groups: sort(earlier) });
  return sections;
}

// ── Config per notification type ──────────────────────────────────────────────
type NotifCfg = {
  icon: ElementType;
  gradient: string;
  iconColor: string;
  ringColor: string;
  label: (n: Notification) => string;
};

function typeCfg(n: Notification): NotifCfg {
  switch (n.type) {
    case 'comment_received':
      return { icon: MessageCircle, gradient: 'from-emerald-400 to-green-500',   iconColor: 'text-white', ringColor: 'ring-green-100',   label: () => 'commented on your post' };
    case 'comment_reply':
      return { icon: MessageCircle, gradient: 'from-teal-400 to-cyan-500',       iconColor: 'text-white', ringColor: 'ring-teal-100',    label: () => 'replied to your comment' };
    case 'comment_like':
      return { icon: Heart,         gradient: 'from-pink-400 to-fuchsia-500',    iconColor: 'text-white', ringColor: 'ring-pink-100',    label: () => 'liked your comment' };
    case 'comment_mention':
      return { icon: AtSign,        gradient: 'from-violet-400 to-purple-500',   iconColor: 'text-white', ringColor: 'ring-violet-100',  label: () => 'mentioned you in a comment' };
    case 'comment_pinned':
      return { icon: Bell,          gradient: 'from-amber-400 to-yellow-500',    iconColor: 'text-white', ringColor: 'ring-amber-100',   label: () => 'pinned your comment' };
    case 'comment_deleted':
      return { icon: Bell,          gradient: 'from-gray-400 to-gray-500',       iconColor: 'text-white', ringColor: 'ring-gray-100',    label: () => 'removed your comment' };
    case 'new_post':
      return { icon: MessageCircle, gradient: 'from-blue-400 to-violet-500',     iconColor: 'text-white', ringColor: 'ring-blue-100',    label: () => 'shared a new post' };
    case 'content_like':
      return { icon: Heart,         gradient: 'from-rose-400 to-pink-500',       iconColor: 'text-white', ringColor: 'ring-rose-100',    label: () => 'liked your post' };
    case 'content_repost':
      return { icon: Repeat2,       gradient: 'from-green-400 to-emerald-500',   iconColor: 'text-white', ringColor: 'ring-green-100',   label: () => 'reposted your content' };
    case 'new_follower':
      return { icon: UserPlus,      gradient: 'from-blue-500 to-blue-600',       iconColor: 'text-white', ringColor: 'ring-blue-100',    label: () => 'started following you' };
    case 'follow_request':
      return { icon: UserPlus,      gradient: 'from-indigo-400 to-blue-500',     iconColor: 'text-white', ringColor: 'ring-indigo-100',  label: () => 'wants to follow you' };
    case 'follow_accepted':
      return { icon: UserCheck,     gradient: 'from-blue-400 to-cyan-500',       iconColor: 'text-white', ringColor: 'ring-blue-100',    label: () => 'accepted your follow request' };
    case 'connection_request':
      return { icon: UserPlus,      gradient: 'from-indigo-500 to-purple-500',   iconColor: 'text-white', ringColor: 'ring-indigo-100',  label: () => 'sent you a connection request' };
    case 'connection_accepted':
      return { icon: UserCheck,     gradient: 'from-blue-500 to-indigo-500',     iconColor: 'text-white', ringColor: 'ring-blue-100',    label: () => 'accepted your connection request' };
    case 'application_received':
      return { icon: Bell,          gradient: 'from-purple-400 to-violet-500',   iconColor: 'text-white', ringColor: 'ring-purple-100',  label: () => 'applied to your listing' };
    case 'application_accepted':
      return { icon: Check,         gradient: 'from-green-400 to-emerald-500',   iconColor: 'text-white', ringColor: 'ring-green-100',   label: () => 'Your application was accepted' };
    case 'application_rejected':
      return { icon: Bell,          gradient: 'from-red-400 to-rose-500',        iconColor: 'text-white', ringColor: 'ring-red-100',     label: () => 'Application update received' };
    case 'message':
    case 'new_message':
    case 'message_received':
      return { icon: Inbox,         gradient: 'from-sky-400 to-cyan-500',        iconColor: 'text-white', ringColor: 'ring-sky-100',     label: () => 'sent you a message' };
    case 'message_reply':
      return { icon: MessageCircle, gradient: 'from-cyan-400 to-blue-500',       iconColor: 'text-white', ringColor: 'ring-cyan-100',    label: () => 'replied to your message' };
    case 'message_reaction':
      return { icon: Heart,         gradient: 'from-sky-300 to-blue-400',        iconColor: 'text-white', ringColor: 'ring-sky-100',     label: () => 'reacted to your message' };
    case 'service_booked':
    case 'marketplace_booking':
      return { icon: ShoppingBag,   gradient: 'from-orange-400 to-amber-500',    iconColor: 'text-white', ringColor: 'ring-orange-100',  label: () => n.type === 'marketplace_booking' ? 'requested a booking' : 'booked your service' };
    case 'marketplace_order':
      return { icon: ShoppingBag,   gradient: 'from-amber-500 to-orange-600',    iconColor: 'text-white', ringColor: 'ring-amber-100',   label: () => 'placed a new order' };
    case 'marketplace_reply':
      return { icon: MessageCircle, gradient: 'from-orange-300 to-amber-400',    iconColor: 'text-white', ringColor: 'ring-orange-100',  label: () => 'replied to your inquiry' };
    case 'booking_accepted':
      return { icon: Check,         gradient: 'from-green-400 to-emerald-500',   iconColor: 'text-white', ringColor: 'ring-green-100',   label: () => 'Your booking was accepted' };
    case 'booking_rejected':
      return { icon: X,             gradient: 'from-red-400 to-rose-500',        iconColor: 'text-white', ringColor: 'ring-red-100',     label: () => 'Your booking was declined' };
    case 'payment_received':
      return { icon: Zap,           gradient: 'from-emerald-500 to-green-600',   iconColor: 'text-white', ringColor: 'ring-emerald-100', label: () => 'Payment received' };
    case 'payment_released':
      return { icon: Zap,           gradient: 'from-green-500 to-teal-500',      iconColor: 'text-white', ringColor: 'ring-green-100',   label: () => 'Your payment has been released' };
    case 'profile_completion':
      return { icon: Star,          gradient: 'from-yellow-400 to-amber-500',    iconColor: 'text-white', ringColor: 'ring-yellow-100',  label: () => 'Your profile is now 80% complete' };
    case 'trust_level_update':
      return { icon: Shield,        gradient: 'from-blue-600 to-indigo-700',     iconColor: 'text-white', ringColor: 'ring-blue-100',    label: () => 'Trust level increased to Pro' };
    case 'account_verified':
      return { icon: Trophy,        gradient: 'from-blue-500 to-indigo-600',     iconColor: 'text-white', ringColor: 'ring-blue-100',    label: () => 'Your account has been verified' };
    case 'account_warning':
      return { icon: Bell,          gradient: 'from-red-500 to-rose-600',        iconColor: 'text-white', ringColor: 'ring-red-100',     label: () => 'Important notice about your account' };
    case 'system_announcement':
    case 'system_notification':
      return { icon: Rocket,        gradient: 'from-gray-600 to-gray-700',       iconColor: 'text-white', ringColor: 'ring-gray-100',    label: () => 'New announcement from Filmons' };
    default:
      return { icon: Bell,          gradient: 'from-gray-400 to-gray-500',       iconColor: 'text-white', ringColor: 'ring-gray-100',    label: () => '' };
  }
}

// ── System notifications: use icon circle instead of user avatar ──────────────
const SYSTEM_TYPES: string[] = [
  'account_verified','account_warning','system_announcement','system_notification',
  'profile_completion','trust_level_update','booking_accepted','booking_rejected',
  'payment_released','application_accepted','application_rejected',
];
function isSystemType(type: string) { return SYSTEM_TYPES.includes(type); }
function systemIcon(type: string): ElementType {
  switch (type) {
    case 'profile_completion':   return Star;
    case 'trust_level_update':   return Shield;
    case 'account_verified':     return Trophy;
    case 'account_warning':      return Bell;
    case 'system_announcement':
    case 'system_notification':  return Rocket;
    case 'booking_accepted':     return Check;
    case 'booking_rejected':     return X;
    case 'payment_released':     return Zap;
    case 'application_accepted': return PartyPopper;
    case 'application_rejected': return Bell;
    default:                     return Wrench;
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
    catch {}
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
      onClick={handle} disabled={loading}
      className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full px-2.5 py-0.5 transition-colors disabled:opacity-60"
    >
      {loading
        ? <span className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin" />
        : <><UserPlus className="w-2.5 h-2.5" /> Follow back</>
      }
    </button>
  );
}

// ── Single grouped notification row ──────────────────────────────────────────
const MESSAGE_TYPES_ROW = ['message','new_message','message_received','message_reply','message_reaction'];

function GroupedNotifRow({ group, currentUser, onRead, onRemove, onNavigate }: {
  group: GroupedNotif;
  currentUser: User;
  onRead:     (id: string) => void;
  onRemove:   (id: string) => void;
  onNavigate: (n: Notification) => void;
}) {
  const primary  = group.items[0];
  const second   = group.items[1];
  const count    = group.items.length;
  const cfg      = typeCfg(primary);
  const Icon     = cfg.icon;
  const isSystem = isSystemType(primary.type);
  const SysIcon  = systemIcon(primary.type);
  const fromUser = authApi.getUserByIdSync(primary.fromUserId);
  const alreadyFollowing = (currentUser.following || []).includes(primary.fromUserId);
  const preview  = primary.messageContent || primary.commentContent;
  const isMsg    = MESSAGE_TYPES_ROW.includes(primary.type);

  const actorText = count === 1
    ? (primary.fromUserName || 'Someone')
    : count === 2
      ? `${primary.fromUserName} and ${second?.fromUserName || 'another'}`
      : `${primary.fromUserName}, ${second?.fromUserName || ''} and ${count - 2} ${count - 2 === 1 ? 'other' : 'others'}`;

  const handleClick = () => {
    group.items.forEach(n => onRead(n.id));
    onNavigate(primary);
  };
  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    group.items.forEach(n => onRemove(n.id));
  };
  const handleReadBtn = (e: MouseEvent) => {
    e.stopPropagation();
    group.items.forEach(n => onRead(n.id));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={e => e.key === 'Enter' && handleClick()}
      className={`group/row relative flex items-start gap-3.5 px-4 py-3.5 cursor-pointer transition-all duration-150 border-b border-gray-50 last:border-0 ${
        !group.read
          ? 'bg-gradient-to-r from-blue-50/60 to-transparent hover:from-blue-50/90'
          : 'hover:bg-gray-50/70'
      }`}
    >
      {/* Unread accent bar */}
      {!group.read && (
        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-blue-500" />
      )}

      {/* Avatar area */}
      <div className="relative shrink-0 mt-0.5">
        {isSystem ? (
          <div className={`w-[44px] h-[44px] bg-gradient-to-br ${cfg.gradient} rounded-2xl flex items-center justify-center shadow-sm`}>
            <SysIcon className="w-5 h-5 text-white" />
          </div>
        ) : count > 1 ? (
          /* Stacked avatars for grouped notifications */
          <div className="relative w-[44px] h-[44px]">
            <div className="absolute top-0 left-0 w-8 h-8 rounded-full overflow-hidden ring-2 ring-white shadow-sm z-10">
              {second?.fromUserAvatar
                ? <img src={second.fromUserAvatar} alt="" className="w-full h-full object-cover" />
                : <div className={`w-full h-full bg-gradient-to-br ${cfg.gradient} flex items-center justify-center`}>
                    <span className="text-white text-xs font-bold">{(second?.fromUserName || '?')[0]?.toUpperCase()}</span>
                  </div>
              }
            </div>
            <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full overflow-hidden ring-2 ring-white shadow-sm z-20">
              {primary.fromUserAvatar
                ? <img src={primary.fromUserAvatar} alt="" className="w-full h-full object-cover" />
                : <div className={`w-full h-full bg-gradient-to-br ${cfg.gradient} flex items-center justify-center`}>
                    <span className="text-white text-xs font-bold">{(primary.fromUserName || '?')[0]?.toUpperCase()}</span>
                  </div>
              }
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 w-[16px] h-[16px] bg-gradient-to-br ${cfg.gradient} rounded-full flex items-center justify-center border-2 border-white shadow z-30`}>
              <Icon className="w-2 h-2 text-white" />
            </div>
          </div>
        ) : (
          /* Single user avatar with type badge */
          <div className="relative">
            <div className={`ring-2 ${cfg.ringColor} rounded-full`}>
              <UserAvatar
                user={fromUser || { name: primary.fromUserName, avatar: primary.fromUserAvatar, id: primary.fromUserId } as User}
                size={44}
              />
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] bg-gradient-to-br ${cfg.gradient} rounded-full flex items-center justify-center shadow-sm border-2 border-white`}>
              <Icon className={`w-2.5 h-2.5 ${cfg.iconColor}`} />
            </div>
          </div>
        )}
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0 pr-14">
        <p className="text-[13px] leading-snug text-gray-800">
          {!isSystem && (
            <span className="font-bold text-gray-900">{actorText} </span>
          )}
          <span className={isSystem ? 'font-semibold text-gray-800' : 'text-gray-500'}>
            {cfg.label(primary)}
          </span>
        </p>

        {/* Message / comment preview */}
        {preview && (
          <div className="mt-1 px-2 py-1 bg-gray-100 rounded-lg text-[11px] text-gray-500 line-clamp-1 italic border-l-2 border-gray-300">
            {preview}
          </div>
        )}
        {/* Post snippet (no preview) */}
        {!preview && primary.postContent && (
          <p className="mt-0.5 text-[11px] text-gray-400 line-clamp-1">{primary.postContent}</p>
        )}

        {/* Footer row: time · unread dot · inline actions */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-[10px] text-gray-400 font-medium">{timeAgo(primary.createdAt)}</span>
          {!group.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}

          {isMsg && (
            <button
              onClick={e => { e.stopPropagation(); handleClick(); }}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-600 bg-sky-50 hover:bg-sky-100 rounded-full px-2.5 py-0.5 transition-colors"
            >
              Reply
            </button>
          )}
          {(primary.type === 'new_follower' || primary.type === 'connection_accepted') && primary.fromUserId !== currentUser.id && (
            <FollowBackBtn targetUserId={primary.fromUserId} already={alreadyFollowing} />
          )}
          {(primary.type === 'connection_request' || primary.type === 'follow_request') && (
            <button
              onClick={e => { e.stopPropagation(); handleClick(); }}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full px-2.5 py-0.5 transition-colors"
            >
              <ChevronRight className="w-2.5 h-2.5" /> View
            </button>
          )}
        </div>
      </div>

      {/* Post / listing thumbnail */}
      {(primary.postImage || (primary as any).listingImage) && (
        <img
          src={primary.postImage || (primary as any).listingImage}
          alt=""
          className="w-11 h-11 object-cover rounded-xl shrink-0 border border-gray-100 shadow-sm"
        />
      )}

      {/* Hover quick-actions */}
      <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity duration-150">
        {!group.read && (
          <button
            title="Mark as read"
            onClick={handleReadBtn}
            className="w-6 h-6 flex items-center justify-center rounded-full text-blue-500 hover:bg-blue-50 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          title="View"
          onClick={e => { e.stopPropagation(); handleClick(); }}
          className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
        <button
          title="Delete"
          onClick={handleDelete}
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
    catch {}
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
        onClick={handleFollow} disabled={followed || loading}
        className={`shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-all ${
          followed ? 'bg-gray-100 text-gray-400 cursor-default' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
        }`}
      >
        {followed ? <><UserCheck className="w-3 h-3" /> Following</> : <><UserPlus className="w-3 h-3" /> Follow</>}
      </button>
    </div>
  );
}

// ── Skeleton loader row ───────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="flex items-start gap-3.5 px-4 py-3.5 border-b border-gray-50 last:border-0 animate-pulse">
      <div className="w-11 h-11 bg-gray-200 rounded-full shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-3 bg-gray-200 rounded-full w-3/4" />
        <div className="h-2.5 bg-gray-100 rounded-full w-1/2" />
      </div>
    </div>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────
type Tab = 'all' | 'unread' | 'messages' | 'marketplace' | 'services' | 'payments' | 'social' | 'system';

const MESSAGE_TYPES        = ['message','new_message','message_received','message_reply','message_reaction'];
const MARKETPLACE_TYPES    = ['marketplace_order','marketplace_booking','marketplace_reply','booking_accepted','booking_rejected'];
const SERVICES_TYPES       = ['service_booked','application_received','application_accepted','application_rejected'];
const PAYMENTS_TYPES       = ['payment_received','payment_released'];
const SOCIAL_TYPES         = ['new_follower','follow_request','follow_accepted','connection_request','connection_accepted','content_like','content_repost','new_post','comment_received','comment_reply','comment_like','comment_mention','comment_pinned'];
const SYSTEM_TYPES_TAB     = ['account_verified','account_warning','system_announcement','system_notification','profile_completion','trust_level_update','comment_deleted'];

const TABS: { key: Tab; label: string; icon: ElementType; activeColor: string }[] = [
  { key: 'all',         label: 'All',         icon: Bell,        activeColor: 'text-blue-600 border-blue-600' },
  { key: 'unread',      label: 'Unread',      icon: Bell,        activeColor: 'text-blue-600 border-blue-600' },
  { key: 'messages',    label: 'Messages',    icon: Inbox,       activeColor: 'text-sky-600 border-sky-500' },
  { key: 'marketplace', label: 'Marketplace', icon: ShoppingBag, activeColor: 'text-orange-600 border-orange-500' },
  { key: 'services',    label: 'Services',    icon: Wrench,      activeColor: 'text-purple-600 border-purple-500' },
  { key: 'payments',    label: 'Payments',    icon: DollarSign,  activeColor: 'text-emerald-600 border-emerald-500' },
  { key: 'social',      label: 'Social',      icon: Heart,       activeColor: 'text-pink-600 border-pink-500' },
  { key: 'system',      label: 'System',      icon: Shield,      activeColor: 'text-gray-600 border-gray-500' },
];

const TAB_TYPES: Record<Tab, string[]> = {
  all:         [],
  unread:      [],
  messages:    MESSAGE_TYPES,
  marketplace: MARKETPLACE_TYPES,
  services:    SERVICES_TYPES,
  payments:    PAYMENTS_TYPES,
  social:      SOCIAL_TYPES,
  system:      SYSTEM_TYPES_TAB,
};

function filterByTab(notifs: Notification[], tab: Tab): Notification[] {
  if (tab === 'all')    return notifs;
  if (tab === 'unread') return notifs.filter(n => !n.read);
  return notifs.filter(n => TAB_TYPES[tab].includes(n.type));
}

// ── Empty-state copy per tab ──────────────────────────────────────────────────
const EMPTY_STATE: Record<Tab, { title: string; body: string }> = {
  all:         { title: "You're all caught up",   body: "When people interact with your profile, posts, or listings, you'll see it here." },
  unread:      { title: "No unread notifications", body: "You've read everything. Nice work!" },
  messages:    { title: "No messages yet",         body: "Start a conversation with someone on Filmons." },
  marketplace: { title: "No marketplace activity", body: "When someone books or orders, you'll hear about it here." },
  services:    { title: "No service activity",     body: "Applications and service bookings will show up here." },
  payments:    { title: "No payment history",      body: "Completed transactions and releases appear here." },
  social:      { title: "No social activity",      body: "Post something or follow creators to get started!" },
  system:      { title: "No system notifications", body: "Account updates and announcements appear here." },
};

// ── Main page ─────────────────────────────────────────────────────────────────
export function Notifications() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
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
    } else if ([...MARKETPLACE_TYPES, ...SERVICES_TYPES].includes(n.type)) {
      navigate((n as any).listingId ? `/listing/${(n as any).listingId}` : '/marketplace');
    } else if (n.postId) {
      navigate(`/post/${n.postId}`);
    } else if (n.fromUserId) {
      navigate(`/host/${n.fromUserId}`);
    }
  };

  const unread   = notifs.filter(n => !n.read).length;
  const visible  = filterByTab(notifs, activeTab);
  const sections = groupByDate(visible);
  const empty    = EMPTY_STATE[activeTab];

  // Tab unread counts
  const tabCount = (tab: Tab): number => {
    if (tab === 'all' || tab === 'unread') return 0;
    return notifs.filter(n => !n.read && TAB_TYPES[tab].includes(n.type)).length;
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <div className="max-w-lg mx-auto pb-10">

        {/* ── Sticky header ── */}
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
                <span className="bg-blue-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none animate-pulse">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              {unread > 0 && (
                <button
                  onClick={() => ctxMarkAllRead()}
                  className="flex items-center gap-1 text-xs text-blue-600 font-semibold hover:text-blue-800 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" /> Read all
                </button>
              )}
              {notifs.length > 0 && (
                <button
                  onClick={() => { if (window.confirm('Clear all notifications?')) ctxClearAll(); }}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 font-medium px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* ── Tab bar ── */}
          <div className="flex -mx-5 px-3 overflow-x-auto scrollbar-hide border-t border-gray-100 gap-0.5">
            {TABS.map(t => {
              const isActive = activeTab === t.key;
              const cnt = t.key === 'unread' ? unread : tabCount(t.key);
              const TabIcon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`relative shrink-0 flex items-center gap-1.5 px-3 py-3 text-[11.5px] font-semibold transition-all border-b-2 whitespace-nowrap ${
                    isActive
                      ? `${t.activeColor}`
                      : 'text-gray-500 border-transparent hover:text-gray-800 hover:border-gray-200'
                  }`}
                >
                  <TabIcon className={`w-3.5 h-3.5 shrink-0 ${isActive ? '' : 'opacity-60'}`} />
                  {t.label}
                  {cnt > 0 && (
                    <span className={`text-[9px] font-black min-w-[15px] h-[15px] flex items-center justify-center px-0.5 rounded-full leading-none ${
                      isActive ? 'bg-current/10 text-current' : 'bg-gray-100 text-gray-500'
                    }`}>{cnt > 99 ? '99+' : cnt}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── People you may know (All tab only) ── */}
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
          {refreshing && sections.length === 0 ? (
            /* Skeleton */
            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
          ) : sections.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-gray-50 to-gray-100 rounded-full flex items-center justify-center mb-4 shadow-inner">
                <BellOff className="w-9 h-9 text-gray-300" />
              </div>
              <p className="text-sm font-bold text-gray-600 mb-1.5">{empty.title}</p>
              <p className="text-xs text-gray-400 max-w-[240px] leading-relaxed">{empty.body}</p>
              {(activeTab === 'all' || activeTab === 'social') && (
                <button
                  onClick={() => navigate('/feed')}
                  className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Explore the feed <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : (
            /* Grouped date sections */
            sections.map((section, si) => (
              <div key={section.label}>
                <div className={`px-4 py-2 ${si === 0 ? '' : 'border-t border-gray-50'}`}>
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-400">
                    {section.label}
                  </p>
                </div>
                {section.groups.map(g => (
                  <GroupedNotifRow
                    key={g.key}
                    group={g}
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
