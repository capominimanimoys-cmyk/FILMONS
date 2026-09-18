// Desktop Connect feed's card for a connection_created event -- two dual
// avatars with a connector, both Trust Badges. Followers are not
// Connections (a Follow never generates this event -- only an accepted
// row in professional_connections does, via the server-side trigger).
//
// Known limitation: a connection logs ONE row per direction (actor=A/
// other=B and actor=B/other=A), so a viewer whose "For You" window happens
// to include activity from BOTH parties could see the same connection
// rendered twice, once from each side's phrasing. Not deduplicated in this
// pass -- flagged rather than silently treated as solved.
import { useNavigate } from 'react-router';
import { UserAvatar } from '../AccountTypeBadge';
import { TrustBadge } from '../trust/TrustBadge';
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

export function ConnectionActivityCard({ entry, trustLevel, otherTrustLevel }: {
  entry: ActivityEntry; trustLevel?: TrustLevel; otherTrustLevel?: TrustLevel;
}) {
  const navigate = useNavigate();
  const { actor, otherUser } = entry;
  if (!otherUser) return null;

  return (
    <article className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <button onClick={() => navigate(`/host/${actor.id}`)} className="font-bold text-gray-900 hover:underline">{actor.name}</button>
        {trustLevel && <TrustBadge level={trustLevel} size="sm" />}
        <span className="text-gray-500">connected with</span>
        <button onClick={() => navigate(`/host/${otherUser.id}`)} className="font-bold text-gray-900 hover:underline">{otherUser.name}</button>
        {otherTrustLevel && <TrustBadge level={otherTrustLevel} size="sm" />}
      </div>

      <div className="flex items-center justify-center gap-4 mt-4 py-2">
        <button onClick={() => navigate(`/host/${actor.id}`)}>
          <UserAvatar user={{ id: actor.id, name: actor.name, avatar: actor.avatar_url }} size={48} />
        </button>
        <div className="w-10 h-px bg-gray-200" />
        <button onClick={() => navigate(`/host/${otherUser.id}`)}>
          <UserAvatar user={{ id: otherUser.id, name: otherUser.name, avatar: otherUser.avatar_url }} size={48} />
        </button>
      </div>

      <div className="flex items-center justify-center gap-3 mt-2">
        <p className="text-xs text-gray-400">{timeAgo(entry.createdAt)}</p>
        <span className="text-gray-200">·</span>
        <button onClick={() => navigate(`/host/${actor.id}`)} className="text-xs font-bold text-blue-600 hover:underline">
          View profiles
        </button>
      </div>
    </article>
  );
}
