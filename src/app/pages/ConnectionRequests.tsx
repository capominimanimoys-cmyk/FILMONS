// /connections/requests -- dedicated full-screen subpage (see
// ConnectionsPageHeader/ConnectionsSlideIn), split out of what used to be
// MyConnections.tsx's "requests" tab. Received/Sent, same actions as before
// (accept/decline/withdraw), just its own real route instead of client-only
// tab state.
import { useEffect, useState, type ReactNode } from 'react';
import { Check, X as XIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  listPendingReceived, listSentRequests, respondToConnectionRequest, withdrawConnectionRequest,
  type ConnectionSummary,
} from '../lib/connectionsApi';
import { ConnectionsPageHeader } from '../components/connect/ConnectionsPageHeader';
import { ConnectionsSlideIn } from '../components/connect/ConnectionsSlideIn';

function RequestRow({ item, action }: { item: ConnectionSummary; action: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 shrink-0">
        {item.otherUser.avatar_url
          ? <img src={item.otherUser.avatar_url} alt={item.otherUser.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-400">{item.otherUser.name?.[0]?.toUpperCase() || '?'}</div>}
      </div>
      <p className="text-sm font-bold text-gray-900 flex-1 min-w-0 truncate">{item.otherUser.name}</p>
      {action}
    </div>
  );
}

export function ConnectionRequests() {
  const { user: me } = useAuth();
  const [subTab, setSubTab] = useState<'received' | 'sent'>('received');
  const [received, setReceived] = useState<ConnectionSummary[]>([]);
  const [sent, setSent] = useState<ConnectionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!me?.id) return;
    setLoading(true);
    Promise.all([listPendingReceived(me.id).then(setReceived), listSentRequests(me.id).then(setSent)])
      .then(() => setLoading(false)).catch(() => setLoading(false));
  }, [me?.id]);

  const respond = async (otherId: string, accept: boolean) => {
    if (!me?.id) return;
    await respondToConnectionRequest(me.id, otherId, accept);
    setReceived(p => p.filter(r => r.otherUser.id !== otherId));
  };

  const withdraw = async (otherId: string) => {
    if (!me?.id) return;
    await withdrawConnectionRequest(me.id, otherId);
    setSent(p => p.filter(r => r.otherUser.id !== otherId));
  };

  return (
    <ConnectionsSlideIn>
      <ConnectionsPageHeader title="Requests" />
      <div className="max-w-lg mx-auto py-4">
        <div className="px-4 mb-3 flex gap-2">
          <button onClick={() => setSubTab('received')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${subTab === 'received' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
            Received{received.length > 0 ? ` (${received.length})` : ''}
          </button>
          <button onClick={() => setSubTab('sent')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${subTab === 'sent' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
            Sent{sent.length > 0 ? ` (${sent.length})` : ''}
          </button>
        </div>
        <div className="bg-white divide-y divide-gray-50 border-y border-gray-100">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-10">Loading…</p>
          ) : subTab === 'received' ? (
            received.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No pending requests.</p>
            ) : received.map(p => (
              <RequestRow key={p.id} item={p} action={
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => respond(p.otherUser.id, true)} className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => respond(p.otherUser.id, false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500">
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              } />
            ))
          ) : (
            sent.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No sent requests.</p>
            ) : sent.map(p => (
              <RequestRow key={p.id} item={p} action={
                <button onClick={() => withdraw(p.otherUser.id)} className="shrink-0 px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
                  Withdraw
                </button>
              } />
            ))
          )}
        </div>
      </div>
    </ConnectionsSlideIn>
  );
}
