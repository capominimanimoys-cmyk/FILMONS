// Connect -> Activity's card -- significantly more compact than a Portfolio
// feed card, per spec. Avatar + creator + Trust Badge + activity sentence +
// timestamp is the consistent header; a small preview follows only when the
// event references a specific resource. Tapping the preview opens that
// resource; tapping the avatar/name opens the creator's profile. No Like/
// Comment persistence is built for activity entries themselves in this
// pass -- that would need a whole new engagement table for a heterogeneous
// event feed, and wasn't load-bearing for the core "see real network
// activity" requirement, so the card stays a clean read+navigate surface.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { BadgeCheck, Image as ImageIcon, Briefcase, Users, Star } from 'lucide-react';
import { TrustBadge } from './trust/TrustBadge';
import { TrustDetailsSheet } from './trust/TrustDetailsSheet';
import { TrustProfileOverlay } from './trust/TrustProfileOverlay';
import { UserAvatar } from './AccountTypeBadge';
import type { ActivityEntry } from '../lib/activityApi';
import { getActivitySentence } from '../lib/activityApi';
import type { TrustLevel } from '../lib/trustApi';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const PREVIEW_ICON: Record<string, typeof ImageIcon> = {
  portfolio_item: ImageIcon, portfolio_album: ImageIcon,
  listing: Briefcase, connection: Users, recommendation: Star,
};

export function ActivityFeedCard({ entry, trustLevel }: { entry: ActivityEntry; trustLevel?: TrustLevel }) {
  const navigate = useNavigate();
  const { actor } = entry;
  const [showTrustDetails, setShowTrustDetails] = useState(false);
  const [trustProfileOpen, setTrustProfileOpen] = useState(false);
  const [trustProfileClosing, setTrustProfileClosing] = useState(false);
  const closeTrustProfile = () => {
    setTrustProfileClosing(true);
    setTimeout(() => { setTrustProfileOpen(false); setTrustProfileClosing(false); }, 260);
  };

  const openResource = () => {
    switch (entry.targetType) {
      case 'portfolio_item':
      case 'portfolio_album':
        navigate(`/portfolio/${actor.id}`); // opens the creator's full public Portfolio, same convention as "View Portfolio →" elsewhere
        return;
      case 'listing':
        navigate(`/listing/${entry.targetId}`);
        return;
      case 'connection':
        if (entry.otherUser) navigate(`/host/${entry.otherUser.id}`);
        return;
      default:
        navigate(`/host/${actor.id}`);
    }
  };

  const Icon = entry.targetType ? PREVIEW_ICON[entry.targetType] : null;
  const showPreview = entry.activityType !== 'recommendation_received';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3.5">
      <div className="flex items-start gap-2.5">
        <button onClick={() => navigate(`/host/${actor.id}`)} className="shrink-0">
          <UserAvatar user={{ id: actor.id, name: actor.name, avatar: actor.avatar_url }} size={36} />
        </button>
        <div className="min-w-0 flex-1">
          <button onClick={() => navigate(`/host/${actor.id}`)} className="flex items-center gap-1 text-left">
            <p className="text-sm font-bold text-gray-900 truncate">{actor.name}</p>
            {actor.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 fill-blue-100 shrink-0" />}
          </button>
          <p className="text-xs text-gray-500 mt-0.5">{getActivitySentence(entry)} <span className="text-gray-300">· {timeAgo(entry.createdAt)}</span></p>

          {trustLevel && (
            <div className="mt-1.5">
              <TrustBadge level={trustLevel} size="sm" onClick={() => setShowTrustDetails(true)} />
            </div>
          )}
        </div>
      </div>

      {showPreview && (entry.title || entry.category || entry.otherUser) && (
        <button onClick={openResource} className="w-full flex items-center gap-2.5 mt-3 p-2.5 bg-gray-50 rounded-xl text-left hover:bg-gray-100 transition-colors">
          {entry.otherUser ? (
            <UserAvatar user={{ id: entry.otherUser.id, name: entry.otherUser.name, avatar: entry.otherUser.avatar_url }} size={28} />
          ) : Icon ? (
            <div className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
              <Icon className="w-3.5 h-3.5 text-gray-400" />
            </div>
          ) : null}
          <div className="min-w-0">
            {entry.title && <p className="text-xs font-bold text-gray-800 truncate">{entry.title}</p>}
            {entry.category && <p className="text-[11px] text-gray-400 truncate">{entry.category}</p>}
          </div>
        </button>
      )}

      {showTrustDetails && createPortal(
        <TrustDetailsSheet
          userId={actor.id}
          onClose={() => setShowTrustDetails(false)}
          onViewFullProfile={() => { setShowTrustDetails(false); setTrustProfileOpen(true); }}
        />,
        document.body,
      )}
      {(trustProfileOpen || trustProfileClosing) && createPortal(
        <TrustProfileOverlay userId={actor.id} closing={trustProfileClosing} onClose={closeTrustProfile} />,
        document.body,
      )}
    </div>
  );
}
