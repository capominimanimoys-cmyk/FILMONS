import { useState, useEffect, ElementType, MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  Bell, Heart, MessageCircle, UserPlus,
  Check, Trash2, X, BellOff, UserCheck, Inbox, ArrowRight, Repeat2,
  ShoppingBag, Zap, Trophy, AtSign, Image,
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
  const groups: { label: string; items: Notification[] }[] = [];
  if (today.length)    groups.push({ label: 'Today',     items: today });
  if (thisWeek.length) groups.push({ label: 'This week', items: thisWeek });
  if (earlier.length)  groups.push({ label: 'Earlier',   items: earlier });
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
    // ── Comments ─────────────────────────────────────────────────────────────
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
    // ── New post from someone you follow ─────────────────────────────────────
    case 'new_post':
      return { icon: Image, gradient: 'from-blue-400 to-violet-500', iconColor: 'text-white', ringColor: 'ring-blue-100',
               label: () => 'shared a new post' };
    // ── Likes & Reposts ───────────────────────────────────────────────────────
    case 'content_like':
      return { icon: Heart,         gradient: 'from-rose-400 to-pink-500',       iconColor: 'text-white', ringColor: 'ring-rose-100',
               label: () => 'liked your post' };
    case 'content_repost':
      return { icon: Repeat2,       gradient: 'from-green-400 to-emerald-500',   iconColor: 'text-white', ringColor: 'ring-green-100',
               label: () => 'reposted your content' };
    // ── Followers ─────────────────────────────────────────────────────────────
    case 'new_follower':
      return { icon: UserPlus,      gradient: 'from-blue-500 to-blue-600',       iconColor: 'text-white', ringColor: 'ring-blue-100',
               label: () => 'started following you' };
    case 'follow_request':
      return { icon: UserPlus,      gradient: 'from-indigo-400 to-blue-500',     iconColor: 'text-white', ringColor: 'ring-indigo-100',
               label: () => 'wants to follow you' };
    case 'follow_accepted':
      return { icon: UserPlus,      gradient: 'from-blue-400 to-cyan-500',       iconColor: 'text-white', ringColor: 'ring-blue-100',
               label: () => 'accepted your follow request' };
    // ── Applications ──────────────────────────────────────────────────────────
    case 'application_received':
      return { icon: Bell,          gradient: 'from-purple-400 to-violet-500',   iconColor: 'text-white', ringColor: 'ring-purple-100',
               label: () => 'applied to your listing' };
    case 'application_accepted':
      return { icon: Bell,          gradient: 'from-green-400 to-emerald-500',   iconColor: 'text-white', ringColor: 'ring-green-100',
               label: () => 'Your application was accepted' };
    case 'application_rejected':
      return { icon: Bell,          gradient: 'from-red-400 to-rose-500',        iconColor: 'text-white', ringColor: 'ring-red-100',
               label: () => 'Application update received' };
    // ── Messages ──────────────────────────────────────────────────────────────
    case 'new_message':
      return { icon: Inbox,         gradient: 'from-sky-400 to-cyan-500',        iconColor: 'text-white', ringColor: 'ring-sky-100',
               label: () => 'sent you a message' };
    case 'message_reaction':
      return { icon: Heart,         gradient: 'from-sky-300 to-blue-400',        iconColor: 'text-white', ringColor: 'ring-sky-100',
               label: () => 'reacted to your message' };
    // ── Marketplace ───────────────────────────────────────────────────────────
    case 'service_booked':
      return { icon: ShoppingBag,   gradient: 'from-orange-400 to-amber-500',    iconColor: 'text-white', ringColor: 'ring-orange-100',
               label: () => 'booked your service' };
    case 'booking_accepted':
      return { icon: ShoppingBag,   gradient: 'from-green-400 to-emerald-500',   iconColor: 'text-white', ringColor: 'ring-green-100',
               label: () => 'Your booking was accepted' };
    case 'booking_rejected':
      return { icon: ShoppingBag,   gradient: 'from-red-400 to-rose-500',        iconColor: 'text-white', ringColor: 'ring-red-100',
               label: () => 'Your booking was declined' };
    case 'payment_received':
      return { icon: Zap,           gradient: 'from-emerald-500 to-green-600',   iconColor: 'text-white', ringColor: 'ring-emerald-100',
               label: () => 'Payment received' };
    case 'payment_released':
      return { icon: Zap,           gradient: 'from-green-500 to-teal-500',      iconColor: 'text-white', ringColor: 'ring-green-100',
               label: () => 'Your payment has been released' };
    // ── System ────────────────────────────────────────────────────────────────
    case 'account_verified':
      return { icon: Trophy,        gradient: 'from-blue-500 to-indigo-600',     iconColor: 'text-white', ringColor: 'ring-blue-100',
               label: () => 'Your account has been verified' };
    case 'account_warning':
      return { icon: Bell,          gradient: 'from-red-500 to-rose-600',        iconColor: 'text-white', ringColor: 'ring-red-100',
               label: () => 'Important notice about your account' };
    case 'system_announcement':
      return { icon: Bell,          gradient: 'from-gray-600 to-gray-700',       iconColor: 'text-white', ringColor: 'ring-gray-100',
               label: () => 'New announcement from Filmons' };
    default:
      return { icon: Bell,          gradient: 'from-gray-400 to-gray-500',       iconColor: 'text-white', ringColor: 'ring-gray-100',
               label: () => '' };
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
function NotifRow({ notif, currentUser, onRead, onRemove }: {
  notif: Notification;
  currentUser: User;
  onRead:   (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const navigate = useNavigate();
  const cfg      = typeCfg(notif);
  const Icon     = cfg.icon;
  const fromUser = authApi.getUserByIdSync(notif.fromUserId);
  const alreadyFollowing = (currentUser.following || []).includes(notif.fromUserId);

  const handleClick = () => {
    onRead(notif.id);
    if (notif.type === 'new_message' || notif.type === 'message_reaction') {
      if (notif.conversationId) {
        navigate(`/inbox?conv=${notif.conversationId}&with=${notif.fromUserId}`);
      } else {
        navigate(`/inbox?with=${notif.fromUserId}`);
      }
    } else if (notif.type === 'payment_received' || notif.type === 'payment_released') {
      navigate('/wallet');
    } else if (notif.postId) {
      // All post-related notifications → PostDetail page
      navigate(`/post/${notif.postId}`);
    } else {
      navigate(`/host/${notif.fromUserId}`);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={e => e.key === 'Enter' && handleClick()}
      className={`group relative flex items-start gap-3.5 px-4 py-3.5 cursor-pointer transition-all border-b border-gray-50 last:border-0 ${
        notif.read ? 'hover:bg-gray-50/80' : 'bg-gradient-to-r from-blue-50/70 to-transparent hover:from-blue-50'
      }`}
    >
      {/* Unread indicator bar */}
      {!notif.read && (
        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-blue-500" />
      )}

      {/* Avatar + gradient icon badge */}
      <div className="relative shrink-0 mt-0.5">
        <div className={`ring-2 ${cfg.ringColor} rounded-full`}>
          <UserAvatar
            user={fromUser || { name: notif.fromUserName, avatar: notif.fromUserAvatar, id: notif.fromUserId } as User}
            size={42}
          />
        </div>
        <div className={`absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] bg-gradient-to-br ${cfg.gradient} rounded-full flex items-center justify-center shadow-sm border-2 border-white`}>
          <Icon className={`w-2 h-2 ${cfg.iconColor}`} />
        </div>
      </div>

      {/* Text body */}
      <div className="flex-1 min-w-0 pr-8">
        {/* Main line */}
        <p className="text-[13px] leading-snug text-gray-800">
          <span className="font-bold text-gray-900">{notif.fromUserName}</span>
          {' '}
          <span className="text-gray-500">{cfg.label(notif)}</span>
        </p>

        {/* Comment preview */}
        {notif.commentContent && (
          <div className="mt-1 px-2 py-1 bg-gray-100 rounded-lg text-[11px] text-gray-500 line-clamp-1 italic border-l-2 border-gray-300">
            {notif.commentContent}
          </div>
        )}

        {/* Post snippet (no comment) */}
        {notif.postContent && !notif.commentContent && (
          <p className="mt-0.5 text-[11px] text-gray-400 line-clamp-1">{notif.postContent}</p>
        )}

        {/* Footer row: time + follow-back */}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-gray-400 font-medium">{timeAgo(notif.createdAt)}</span>
          {notif.type === 'new_follower' && notif.fromUserId !== currentUser.id && (
            <FollowBackBtn targetUserId={notif.fromUserId} already={alreadyFollowing} />
          )}
        </div>
      </div>

      {/* Post thumbnail */}
      {notif.postImage && (
        <img
          src={notif.postImage}
          alt=""
          className="w-11 h-11 object-cover rounded-xl shrink-0 border border-gray-100 shadow-sm"
        />
      )}

      {/* Dismiss X */}
      <button
        onClick={e => { e.stopPropagation(); onRemove(notif.id); }}
        className="absolute top-3 right-3 w-5 h-5 flex items-center justify-center rounded-full text-gray-300 hover:text-gray-500 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-all"
      >
        <X className="w-3 h-3" />
      </button>
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
          {user.username ? `@${user.username}` : user.accountCategory || 'Filmons creator'}
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
type Tab = 'all' | 'messages' | 'marketplace' | 'activity' | 'system';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'all',         label: 'All',          icon: '🔔' },
  { key: 'messages',    label: 'Messages',     icon: '💬' },
  { key: 'marketplace', label: 'Marketplace',  icon: '🛍️' },
  { key: 'activity',    label: 'Activity',     icon: '❤️' },
  { key: 'system',      label: 'System',       icon: '⚙️' },
];

function filterByTab(notifs: Notification[], tab: Tab): Notification[] {
  switch (tab) {
    case 'messages':
      return notifs.filter(n => n.type === 'new_message' || n.type === 'message_reaction');
    case 'marketplace':
      return notifs.filter(n => ['service_booked','booking_accepted','booking_rejected','payment_received','payment_released','application_received','application_accepted','application_rejected'].includes(n.type));
    case 'activity':
      return notifs.filter(n => ['content_like','content_repost','new_follower','follow_request','follow_accepted','comment_received','comment_reply','comment_like','comment_mention'].includes(n.type));
    case 'system':
      return notifs.filter(n => ['account_verified','account_warning','system_announcement','comment_pinned','comment_deleted'].includes(n.type));
    default:
      return notifs;
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

  // Load follow suggestions lazily
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

  const handleRead   = (id: string) => markRead(id);
  const handleRemove = (id: string) => remove(id);
  const handleMarkAllRead = () => ctxMarkAllRead();
  const handleClearAll = () => {
    if (!window.confirm('Clear all notifications?')) return;
    ctxClearAll();
  };

  const unread = notifs.filter(n => !n.read).length;
  const visible = filterByTab(notifs, activeTab);
  const groups = groupByDate(visible);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <div className="max-w-lg mx-auto pb-10">

        {/* ── Header ── */}
        <div className="bg-white border-b border-gray-100 sticky top-0 z-20 px-5 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-md shadow-blue-200">
                <Bell className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900 leading-none tracking-tight">Activity</h1>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {unread > 0 ? `${unread} new notification${unread !== 1 ? 's' : ''}` : refreshing ? 'Refreshing…' : "You're all caught up ✓"}
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
          <div className="flex gap-1 mt-3 -mb-px overflow-x-auto scrollbar-hide pb-0.5">
            {TABS.map(t => {
              const isActive = activeTab === t.key;
              const unread = (t.key === 'all' ? notifs : filterByTab(notifs, t.key)).filter(n => !n.read).length;
              return (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`relative shrink-0 flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-full transition-all ${
                    isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
                  }`}>
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                  {unread > 0 && (
                    <span className={`text-[9px] font-black min-w-[14px] text-center px-1 py-0.5 rounded-full leading-none ${
                      isActive ? 'bg-white/30 text-white' : 'bg-blue-600 text-white'
                    }`}>{unread}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Follow-back suggestions strip ── */}
        {suggestions.length > 0 && (
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

        {/* ── Notifications card ── */}
        <div className="mt-3 mx-3 bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100/80">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-gray-50 to-gray-100 rounded-full flex items-center justify-center mb-4 shadow-inner">
                <BellOff className="w-9 h-9 text-gray-300" />
              </div>
              <p className="text-sm font-bold text-gray-600 mb-1.5">No activity yet</p>
              <p className="text-xs text-gray-400 max-w-[220px] leading-relaxed">
                Likes, comments, follows and messages will show up here.
              </p>
              <button
                onClick={() => navigate('/feed')}
                className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                Explore the feed <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <>
              {groups.map((group, gi) => (
                <div key={group.label}>
                  {/* Group label */}
                  <div className={`px-4 py-2 ${gi === 0 ? '' : 'border-t border-gray-50'}`}>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-400">
                      {group.label}
                    </p>
                  </div>
                  {/* Rows */}
                  {group.items.map(n => (
                    <NotifRow
                      key={n.id}
                      notif={n}
                      currentUser={user}
                      onRead={handleRead}
                      onRemove={handleRemove}
                    />
                  ))}
                </div>
              ))}
            </>
          )}
        </div>

      </div>
    </div>
  );
}