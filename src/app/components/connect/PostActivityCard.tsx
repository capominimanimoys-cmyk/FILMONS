// Desktop Connect feed's compact card for a post_published event. Not
// part of the original spec's activity-type list (which covers Portfolio/
// Service/Opportunity/Connection/Recommendation), but posts.create() logs
// a real event (see activityApi.ts's header comment) -- kept consistent in
// style with the other compact cards rather than left using the older
// mobile ActivityFeedCard look.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { BadgeCheck, MoreHorizontal, FileText } from 'lucide-react';
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

export function PostActivityCard({ entry, trustLevel }: { entry: ActivityEntry; trustLevel?: TrustLevel }) {
  const navigate = useNavigate();
  const { actor } = entry;

  const [showTrustDetails, setShowTrustDetails] = useState(false);
  const [trustProfileOpen, setTrustProfileOpen] = useState(false);
  const [trustProfileClosing, setTrustProfileClosing] = useState(false);
  const closeTrustProfile = () => {
    setTrustProfileClosing(true);
    setTimeout(() => { setTrustProfileOpen(false); setTrustProfileClosing(false); }, 260);
  };

  const openPost = () => entry.targetId && navigate(`/post/${entry.targetId}`);

  return (
    <article className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-start gap-3">
        <button onClick={() => navigate(`/host/${actor.id}`)} className="shrink-0">
          <UserAvatar user={{ id: actor.id, name: actor.name, avatar: actor.avatar_url }} size={40} />
        </button>
        <div className="min-w-0 flex-1 text-left">
          <button onClick={() => navigate(`/host/${actor.id}`)} className="flex items-center gap-1 text-left w-full">
            <p className="text-sm font-bold text-gray-900 text-left">{actor.name}</p>
            {actor.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 fill-blue-100 shrink-0" />}
            {trustLevel && <span className="ml-1"><TrustBadge level={trustLevel} size="sm" onClick={() => setShowTrustDetails(true)} /></span>}
          </button>
          <p className="text-xs text-gray-400 mt-0.5 text-left">{getActivitySentence(entry)} · {timeAgo(entry.createdAt)}</p>
        </div>
        <button className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {entry.title && (
        <button onClick={openPost} className="w-full flex items-center gap-2.5 mt-3 p-2.5 bg-gray-50 rounded-xl text-left hover:bg-gray-100 transition-colors">
          <div className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
            <FileText className="w-3.5 h-3.5 text-gray-400" />
          </div>
          <p className="text-xs text-gray-700 truncate">{entry.title}</p>
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
