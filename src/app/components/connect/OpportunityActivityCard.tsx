// Desktop Connect feed's compact card for a paid Opportunity listing
// activity event. Never bypasses Marketplace's own access/entitlement
// rules -- this only links to the real /listing/:id detail page, which is
// where locked/eligibility checks already live.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { BadgeCheck, MoreHorizontal, ChevronRight } from 'lucide-react';
import { UserAvatar } from '../AccountTypeBadge';
import { TrustBadge } from '../trust/TrustBadge';
import { TrustDetailsSheet } from '../trust/TrustDetailsSheet';
import { TrustProfileOverlay } from '../trust/TrustProfileOverlay';
import { getActivitySentence, type ActivityEntry } from '../../lib/activityApi';
import type { TrustLevel } from '../../lib/trustApi';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

export function OpportunityActivityCard({ entry, trustLevel }: { entry: ActivityEntry; trustLevel?: TrustLevel }) {
  const navigate = useNavigate();
  const { actor, metadata } = entry;

  const [showTrustDetails, setShowTrustDetails] = useState(false);
  const [trustProfileOpen, setTrustProfileOpen] = useState(false);
  const [trustProfileClosing, setTrustProfileClosing] = useState(false);
  const closeTrustProfile = () => {
    setTrustProfileClosing(true);
    setTimeout(() => { setTrustProfileOpen(false); setTrustProfileClosing(false); }, 260);
  };

  const openListing = () => entry.targetId && navigate(`/listing/${entry.targetId}`);
  const compLine = [
    metadata?.paid === false ? 'Unpaid / Collaboration' : 'Paid',
    entry.category,
  ].filter(Boolean).join(' · ');
  const locationLine = [metadata?.city, metadata?.workArrangement].filter(Boolean).join(' · ');

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
          <p className="text-xs text-gray-400 mt-0.5">{timeAgo(entry.createdAt)}</p>
        </div>
        <button className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      <p className="text-sm text-gray-800 mt-2.5">{getActivitySentence(entry)}</p>

      <button onClick={openListing} className="w-full text-left mt-3 border border-gray-100 rounded-xl p-3.5 hover:bg-gray-50 transition-colors">
        <p className="text-sm font-bold text-gray-900">{entry.title}</p>
        {compLine && <p className="text-xs text-gray-500 mt-1">{compLine}</p>}
        {locationLine && <p className="text-[11px] text-gray-400 mt-0.5">{locationLine}</p>}
        <p className="flex items-center gap-1 text-xs font-bold text-blue-600 mt-2">
          View Opportunity <ChevronRight className="w-3 h-3" />
        </p>
      </button>

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
