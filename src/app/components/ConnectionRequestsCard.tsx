// Home -> Connect's compact "Connection requests" module -- sits directly
// ABOVE the Share something... composer trigger, per spec. Deliberately
// small: shows exactly one request at a time (not a full feed post), with
// a "See all requests ->" link into /connections for the rest. Renders
// nothing at all when there are zero pending requests -- no title, no
// empty card, no reserved spacing (Share something... moves back into
// that position naturally).
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Loader2, Check } from 'lucide-react';
import { UserAvatar } from './AccountTypeBadge';
import type { ConnectionSummary } from '../lib/connectionsApi';

export function ConnectionRequestsCard({ requests, onAccept, onIgnore }: {
  requests: ConnectionSummary[];
  onAccept: (otherId: string) => Promise<boolean>;
  onIgnore: (otherId: string) => void;
}) {
  const navigate = useNavigate();
  const [state, setState] = useState<'idle' | 'accepting' | 'accepted'>('idle');
  if (!requests.length) return null;

  const top = requests[0];

  const accept = async () => {
    setState('accepting');
    const ok = await onAccept(top.otherUser.id);
    if (!ok) { setState('idle'); return; }
    setState('accepted');
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs font-black text-gray-900">Connection requests</p>
        <span className="text-xs font-bold text-gray-400">{requests.length}</span>
      </div>

      {state === 'accepted' ? (
        <div className="flex items-center gap-2.5 py-1">
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-600">
            <Check className="w-4 h-4" /> Connected with {top.otherUser.name}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          <UserAvatar user={{ id: top.otherUser.id, name: top.otherUser.name, avatar: top.otherUser.avatar_url ?? undefined }} size={40} />
          <button onClick={() => navigate(top.otherUser.username ? `/${top.otherUser.username}` : `/host/${top.otherUser.id}`)} className="flex-1 min-w-0 text-left">
            <p className="text-sm font-bold text-gray-900 truncate">{top.otherUser.name}</p>
            {top.note && <p className="text-xs text-gray-400 truncate">"{top.note}"</p>}
          </button>
          <button
            onClick={() => onIgnore(top.otherUser.id)}
            disabled={state === 'accepting'}
            className="text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-full px-3 py-1.5 shrink-0 disabled:opacity-50"
          >
            Ignore
          </button>
          <button
            onClick={accept}
            disabled={state === 'accepting'}
            className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full px-3 py-1.5 shrink-0 disabled:opacity-80"
          >
            {state === 'accepting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Accept'}
          </button>
        </div>
      )}

      {requests.length > 1 && (
        <button onClick={() => navigate('/connections')} className="mt-2.5 text-xs font-bold text-blue-600 hover:underline">
          See all requests →
        </button>
      )}
    </div>
  );
}
