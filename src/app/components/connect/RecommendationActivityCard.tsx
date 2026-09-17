// Desktop Connect feed's card for a recommendation_received event -- shows
// the actual quote (cached on the event, see
// supabase/migrations/20240505000000_recommendation_activity_richer.sql)
// and the recommender's role at time of writing. Only ever generated for
// recommendations that are already public on a profile (the same table
// Profile/HostProfile's RecommendationsSection reads) -- there is no
// private-recommendation concept to gate against.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { BadgeCheck, MoreHorizontal, ChevronRight } from 'lucide-react';
import { UserAvatar } from '../AccountTypeBadge';
import { TrustBadge } from '../trust/TrustBadge';
import { TrustDetailsSheet } from '../trust/TrustDetailsSheet';
import { TrustProfileOverlay } from '../trust/TrustProfileOverlay';
import type { ActivityEntry } from '../../lib/activityApi';
import type { TrustLevel } from '../../lib/trustApi';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

export function RecommendationActivityCard({ entry, trustLevel }: { entry: ActivityEntry; trustLevel?: TrustLevel }) {
  const navigate = useNavigate();
  const { actor, otherUser, metadata } = entry;

  const [showTrustDetails, setShowTrustDetails] = useState(false);
  const [trustProfileOpen, setTrustProfileOpen] = useState(false);
  const [trustProfileClosing, setTrustProfileClosing] = useState(false);
  const closeTrustProfile = () => {
    setTrustProfileClosing(true);
    setTimeout(() => { setTrustProfileOpen(false); setTrustProfileClosing(false); }, 260);
  };

  return (
    <article className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-start gap-3">
        <button onClick={() => navigate(`/host/${actor.id}`)} className="shrink-0">
          <UserAvatar user={{ id: actor.id, name: actor.name, avatar: actor.avatar_url }} size={40} />
        </button>
        <div className="min-w-0 flex-1">
          <button onClick={() => navigate(`/host/${actor.id}`)} className="flex items-center gap-1">
            <p className="text-sm font-bold text-gray-900">{actor.name}</p>
            {actor.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 fill-blue-100 shrink-0" />}
            {trustLevel && <span className="ml-1"><TrustBadge level={trustLevel} size="sm" onClick={() => setShowTrustDetails(true)} /></span>}
          </button>
          <p className="text-xs text-gray-400 mt-0.5">received a professional recommendation · {timeAgo(entry.createdAt)}</p>
        </div>
        <button className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {entry.title && (
        <button onClick={() => navigate(`/host/${actor.id}`)} className="w-full text-left mt-3 border-l-2 border-gray-200 pl-3.5">
          <p className="text-sm text-gray-700 italic leading-relaxed">"{entry.title}"</p>
          {otherUser && (
            <p className="text-xs text-gray-400 mt-1.5">
              — {otherUser.name}{metadata?.roleSnapshot ? ` · ${metadata.roleSnapshot}` : ''}
            </p>
          )}
          <p className="flex items-center gap-1 text-xs font-bold text-blue-600 mt-2">
            View recommendation <ChevronRight className="w-3 h-3" />
          </p>
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
    </article>
  );
}
