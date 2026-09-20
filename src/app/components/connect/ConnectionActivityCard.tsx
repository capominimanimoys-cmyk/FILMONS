// Connect feed's card for a connection_created event -- announces that two
// FILMONS users connected, distinct from the User Connection Card (used
// for discovering ONE person, see PeopleYouMayKnowRow). Doubles as organic
// network discovery: each displayed person gets a Connect/Pending/View
// Profile button based on the VIEWER's own relationship to them, not a
// fixed label, so seeing "Aaliyah and Jordan connected" can turn into the
// viewer connecting with whichever of the two they don't already know.
//
// Known limitation: a connection logs ONE activity_events row per
// direction (actor=A/other=B and actor=B/other=A), so a viewer whose "For
// You" window happens to include activity from BOTH parties could see the
// same connection rendered twice, once from each side's phrasing. Not
// deduplicated in this pass -- flagged rather than silently treated as
// solved.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Users, MoreHorizontal, Heart, MessageCircle, Send, BadgeCheck, MapPin, ChevronRight, Loader2, Clock, EyeOff, Flag } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { UserAvatar, AccountTypeBadge } from '../AccountTypeBadge';
import { ConnectFlowSheet } from '../ConnectFlowSheet';
import { getConnectionStatus, sendConnectionRequest, type ConnectionStatus } from '../../lib/connectionsApi';
import { isActivityEventLiked, toggleActivityEventLike, type ActivityEntry, type ActivityActor } from '../../lib/activityApi';
import { PostMoreMenu } from './PostMoreMenu';
import { SharePostSheet } from './SharePostSheet';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

// One of the two columns under the headline -- name/badge/role/location +
// a relationship-aware action, per spec ("the same activity card can
// become a network-discovery mechanism").
function PersonColumn({ person }: { person: ActivityActor }) {
  const navigate = useNavigate();
  const { user: viewer, showGuestPrompt } = useAuth();
  const isViewer = viewer?.id === person.id;

  const [status, setStatus] = useState<ConnectionStatus | 'self' | 'loading'>(isViewer ? 'self' : 'loading');
  const [showConnectFlow, setShowConnectFlow] = useState(false);

  useEffect(() => {
    if (isViewer || !viewer) return;
    getConnectionStatus(viewer.id, person.id).then(setStatus);
  }, [viewer?.id, person.id, isViewer]);

  const openProfile = () => navigate(`/host/${person.id}`);

  const handleConnect = () => {
    if (!viewer) { showGuestPrompt('Create your Filmons account to connect with creators.', 'Sign up to connect'); return; }
    setShowConnectFlow(true);
  };
  const sendConnect = async (note?: string) => {
    setShowConnectFlow(false);
    if (!viewer) return;
    setStatus('pending_sent'); // optimistic
    const ok = await sendConnectionRequest(viewer.id, person.id, note);
    if (!ok) setStatus('none');
  };

  return (
    <div className="flex-1 min-w-0 text-center md:text-left">
      <button onClick={openProfile} className="inline-flex items-center gap-1 justify-center md:justify-start w-full">
        <p className="text-sm font-black text-gray-900 truncate">{person.name}</p>
        {person.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 fill-blue-100 shrink-0" />}
      </button>

      {person.account_type && (
        <div className="flex justify-center md:justify-start mt-1">
          <AccountTypeBadge type={person.account_type} size="sm" />
        </div>
      )}

      {person.primary_role && <p className="text-xs text-gray-500 font-semibold mt-1 truncate">{person.primary_role}</p>}
      {person.city && (
        <p className="text-[11px] text-gray-400 flex items-center gap-0.5 justify-center md:justify-start mt-0.5 truncate">
          <MapPin className="w-3 h-3 shrink-0" /> {person.city}
        </p>
      )}

      <div className="mt-2.5">
        {status === 'self' ? null : status === 'loading' ? (
          <div className="h-8" />
        ) : status === 'connected' ? (
          <button onClick={openProfile} className="w-full md:w-auto px-4 py-1.5 rounded-full text-xs font-bold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
            View {person.name.split(' ')[0]}
          </button>
        ) : status === 'pending_sent' ? (
          <button disabled className="w-full md:w-auto px-4 py-1.5 rounded-full text-xs font-bold bg-gray-100 text-gray-400 flex items-center justify-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Pending
          </button>
        ) : status === 'pending_received' ? (
          <button onClick={openProfile} className="w-full md:w-auto px-4 py-1.5 rounded-full text-xs font-bold bg-blue-50 text-blue-600 border border-blue-100">
            Respond
          </button>
        ) : (
          <button onClick={handleConnect} className="w-full md:w-auto px-4 py-1.5 rounded-full text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
            Connect with {person.name.split(' ')[0]}
          </button>
        )}
      </div>

      {showConnectFlow && (
        <ConnectFlowSheet name={person.name} avatar={person.avatar_url} onSend={sendConnect} onClose={() => setShowConnectFlow(false)} />
      )}
    </div>
  );
}

export function ConnectionActivityCard({ entry }: { entry: ActivityEntry }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { actor, otherUser } = entry;

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(entry.likeCount);
  const [entered, setEntered] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => { requestAnimationFrame(() => setEntered(true)); }, []);
  useEffect(() => { if (user) isActivityEventLiked(entry.id, user.id).then(setLiked); }, [entry.id, user?.id]);

  if (!otherUser || hidden) return null;

  const toggleLike = async () => {
    if (!user) return;
    const next = !liked;
    setLiked(next);
    setLikeCount(c => c + (next ? 1 : -1));
    const ok = await toggleActivityEventLike(entry.id, user.id, next);
    if (!ok) { setLiked(!next); setLikeCount(c => c + (next ? -1 : 1)); }
  };

  const firstNameOf = (n: string) => n.split(' ')[0];

  // Same <SharePostSheet/> every other FILMONS post type uses -- per the
  // Share Card unification rule, only the content reference changes.
  const shareSnapshot = {
    contentType: 'connection' as const,
    contentId: entry.id,
    creatorId: actor.id,
    creatorName: actor.name,
    creatorAvatar: actor.avatar_url ?? undefined,
    creatorVerified: actor.is_verified,
    title: `${firstNameOf(actor.name)} and ${firstNameOf(otherUser.name)} connected`,
  };

  return (
    <article
      className="bg-white rounded-2xl border border-gray-100 p-4 transition-all duration-300"
      style={{ opacity: entered ? 1 : 0, transform: entered ? 'translateY(0)' : 'translateY(6px)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
          <Users className="w-4 h-4 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-gray-900">New Connection</p>
          <p className="text-xs text-gray-400">{timeAgo(entry.createdAt)}</p>
        </div>
        <button onClick={() => setShowMoreMenu(true)} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Two overlapping avatars + handshake */}
      <div className="flex items-center justify-center mt-4">
        <button onClick={() => navigate(`/host/${actor.id}`)} className="relative z-10 rounded-full ring-4 ring-white">
          <UserAvatar user={{ id: actor.id, name: actor.name, avatar: actor.avatar_url }} size={80} />
        </button>
        <div className="relative -mx-3 z-20 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center">
          <span className="text-base leading-none">🤝</span>
        </div>
        <button onClick={() => navigate(`/host/${otherUser.id}`)} className="relative z-10 rounded-full ring-4 ring-white">
          <UserAvatar user={{ id: otherUser.id, name: otherUser.name, avatar: otherUser.avatar_url }} size={80} />
        </button>
      </div>

      <p className="text-center text-lg font-black text-gray-900 mt-3">
        {firstNameOf(actor.name)} and {firstNameOf(otherUser.name)} connected
      </p>
      <p className="text-center text-sm text-gray-400 mt-0.5">Two creators. More possibilities.</p>

      {/* Two-column user info */}
      <div className="flex flex-col md:flex-row gap-4 md:gap-6 mt-4 pt-4 border-t border-gray-50 md:divide-x md:divide-gray-100">
        <PersonColumn person={actor} />
        <div className="md:pl-6"><PersonColumn person={otherUser} /></div>
      </div>

      {/* Build your network */}
      <button
        onClick={() => navigate('/search/category/creators')}
        className="w-full flex items-center gap-3 mt-4 p-3 rounded-2xl bg-blue-50/60 hover:bg-blue-50 transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          <Users className="w-4 h-4 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-gray-900">Build your network</p>
          <p className="text-[11px] text-gray-500 leading-snug mt-0.5">Connect with more creators, collaborate and find new opportunities on Filmons.</p>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
      </button>

      {/* Interactions -- same icon set/behavior as every other Connect card */}
      <div className="flex items-center gap-5 mt-4 pt-3 border-t border-gray-50">
        <button onClick={toggleLike} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <Heart className={`w-5 h-5 ${liked ? 'text-red-500 fill-red-500' : 'text-gray-400'}`} /> Like{likeCount > 0 ? ` · ${likeCount}` : ''}
        </button>
        <button
          onClick={() => toast('Comments on connection activity are coming soon.')}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <MessageCircle className="w-5 h-5 text-gray-400" /> Comment
        </button>
        <button onClick={() => setShowShareSheet(true)} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <Send className="w-5 h-5 text-gray-400" /> Share
        </button>
      </div>

      {showMoreMenu && (
        <PostMoreMenu
          onClose={() => setShowMoreMenu(false)}
          actions={[
            { icon: EyeOff, label: 'Hide this update', onClick: () => { setShowMoreMenu(false); setHidden(true); toast('Hidden', { description: "You won't see this again" }); } },
            { icon: Flag, label: 'Report', onClick: () => { setShowMoreMenu(false); toast.warning("Reported. We'll review it shortly."); } },
          ]}
        />
      )}
      {showShareSheet && <SharePostSheet snapshot={shareSnapshot} onClose={() => setShowShareSheet(false)} />}
    </article>
  );
}
