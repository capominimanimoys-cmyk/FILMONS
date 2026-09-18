// Mutual FILMONS Connections -- distinct from Followers/Following (see
// connectionsApi.ts's own header comment). Positioned directly below My
// Gear/Tools in the All tab, per spec. Owner mode also surfaces a small
// pending-Invitations preview here (same respondToConnectionRequest()
// action as Notifications/Home, so accepting here updates every other
// surface reading the same professional_connections table).
import { useState } from 'react';
import { Loader2, Check, Users } from 'lucide-react';
import { UserAvatar } from '../AccountTypeBadge';
import type { ConnectionSummary } from '../../lib/connectionsApi';

function InvitationRow({ invite, onAccept, onIgnore }: {
  invite: ConnectionSummary;
  onAccept: (otherId: string) => Promise<boolean>;
  onIgnore: (otherId: string) => void;
}) {
  const [state, setState] = useState<'idle' | 'accepting' | 'accepted'>('idle');
  if (state === 'accepted') {
    return (
      <div className="flex items-center gap-3 py-2.5">
        <UserAvatar user={{ id: invite.otherUser.id, name: invite.otherUser.name, avatar: invite.otherUser.avatar_url ?? undefined }} size={36} />
        <p className="flex-1 text-sm font-bold text-gray-900 truncate">{invite.otherUser.name}</p>
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-2.5 py-1 shrink-0">
          <Check className="w-3 h-3" /> Connected
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 py-2.5">
      <UserAvatar user={{ id: invite.otherUser.id, name: invite.otherUser.name, avatar: invite.otherUser.avatar_url ?? undefined }} size={36} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 truncate">{invite.otherUser.name}</p>
        {invite.note && <p className="text-xs text-gray-400 truncate">"{invite.note}"</p>}
      </div>
      <button
        onClick={() => onIgnore(invite.otherUser.id)}
        disabled={state === 'accepting'}
        className="text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-full px-3 py-1.5 shrink-0 disabled:opacity-50"
      >
        Ignore
      </button>
      <button
        onClick={async () => {
          setState('accepting');
          const ok = await onAccept(invite.otherUser.id);
          if (!ok) { setState('idle'); return; }
          setState('accepted');
        }}
        disabled={state === 'accepting'}
        className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full px-3 py-1.5 shrink-0 disabled:opacity-80"
      >
        {state === 'accepting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Accept'}
      </button>
    </div>
  );
}

export function ConnectionsSection({
  connections, count, isOwner, onViewAll,
  pendingRequests, onAcceptRequest, onIgnoreRequest, onViewAllRequests,
  mutualCount,
}: {
  /** A small preview -- caller should already cap this (e.g. 8). */
  connections: ConnectionSummary[];
  count: number;
  isOwner: boolean;
  onViewAll: () => void;
  /** Owner-only: received invitations, already capped (e.g. 2). */
  pendingRequests?: ConnectionSummary[];
  onAcceptRequest?: (otherId: string) => Promise<boolean>;
  onIgnoreRequest?: (otherId: string) => void;
  onViewAllRequests?: () => void;
  /** Viewer-only, when available. */
  mutualCount?: number;
}) {
  if (!count && !isOwner) return null;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-black text-gray-900 flex items-center gap-1.5">
          <Users className="w-4 h-4 text-gray-400" /> Connections
        </p>
      </div>

      {isOwner && pendingRequests && pendingRequests.length > 0 && (
        <div className="mb-3 pb-3 border-b border-gray-50">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-black text-gray-500">Invitations ({pendingRequests.length})</p>
            {onViewAllRequests && (
              <button onClick={onViewAllRequests} className="text-[11px] font-bold text-blue-600 hover:underline">See all →</button>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {pendingRequests.map(p => (
              <InvitationRow
                key={p.id}
                invite={p}
                onAccept={otherId => onAcceptRequest!(otherId)}
                onIgnore={otherId => onIgnoreRequest?.(otherId)}
              />
            ))}
          </div>
        </div>
      )}

      {!count ? (
        <p className="text-xs text-gray-400">
          {isOwner ? 'No connections yet. Connect with people you work with on FILMONS.' : 'No connections yet.'}
        </p>
      ) : (
        <>
          <div className="flex -space-x-2 mb-2">
            {connections.slice(0, 8).map(c => (
              <div key={c.id} className="w-9 h-9 rounded-full ring-2 ring-white overflow-hidden shrink-0">
                <UserAvatar user={{ id: c.otherUser.id, name: c.otherUser.name, avatar: c.otherUser.avatar_url ?? undefined }} size={36} />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mb-3">
            {count} connection{count !== 1 ? 's' : ''}
            {!isOwner && mutualCount ? ` · ${mutualCount} mutual` : ''}
          </p>
          <button onClick={onViewAll} className="w-full py-2.5 rounded-xl bg-gray-50 text-gray-700 text-xs font-bold hover:bg-gray-100 transition-colors">
            View all connections
          </button>
        </>
      )}
    </section>
  );
}
