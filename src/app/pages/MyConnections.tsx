// Owner-only list of the logged-in user's accepted Professional Connections
// (plus pending requests they've received) -- reached from Settings ->
// Trust & Verification -> Connections -> "View My Connections".
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Check, X as XIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { captureSnapshot } from '../lib/smartAnimate';
import {
  listConnections, listPendingReceived, respondToConnectionRequest,
  type ConnectionSummary,
} from '../lib/connectionsApi';
import { TrustBadge } from '../components/trust/TrustBadge';
import { getTrustLevelsBatch, type TrustLevel } from '../lib/trustApi';

function Row({ item, trustLevel, onClick }: { item: ConnectionSummary; trustLevel?: TrustLevel; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
      <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 shrink-0">
        {item.otherUser.avatar_url
          ? <img src={item.otherUser.avatar_url} alt={item.otherUser.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-400">{item.otherUser.name?.[0]?.toUpperCase() || '?'}</div>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 truncate">{item.otherUser.name}</p>
        {trustLevel && <div className="mt-1"><TrustBadge level={trustLevel} size="sm" /></div>}
      </div>
    </button>
  );
}

export function MyConnections() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [pending, setPending] = useState<ConnectionSummary[]>([]);
  const [trustLevels, setTrustLevels] = useState<Map<string, TrustLevel>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([listConnections(user.id), listPendingReceived(user.id)]).then(async ([conns, pend]) => {
      setConnections(conns);
      setPending(pend);
      const ids = [...conns, ...pend].map(c => c.otherUser.id);
      setTrustLevels(await getTrustLevelsBatch(ids));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user?.id]);

  const respond = async (otherId: string, accept: boolean) => {
    if (!user?.id) return;
    await respondToConnectionRequest(user.id, otherId, accept);
    setPending(p => p.filter(r => r.otherUser.id !== otherId));
    if (accept) listConnections(user.id).then(setConnections);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-14 lg:top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => { captureSnapshot(); navigate(-1); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <h1 className="text-base font-black text-gray-900">My Connections</h1>
      </div>

      <div className="max-w-lg mx-auto py-4">
        {pending.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-4">Pending Requests</p>
            <div className="bg-white divide-y divide-gray-50 border-y border-gray-100">
              {pending.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 shrink-0">
                    {p.otherUser.avatar_url
                      ? <img src={p.otherUser.avatar_url} alt={p.otherUser.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-400">{p.otherUser.name?.[0]?.toUpperCase() || '?'}</div>}
                  </div>
                  <p className="text-sm font-bold text-gray-900 flex-1 min-w-0 truncate">{p.otherUser.name}</p>
                  <button onClick={() => respond(p.otherUser.id, true)} className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white shrink-0">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => respond(p.otherUser.id, false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 shrink-0">
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-4">
          {connections.length} Connection{connections.length !== 1 ? 's' : ''}
        </p>
        <div className="bg-white divide-y divide-gray-50 border-y border-gray-100">
          {!loading && connections.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">No connections yet.</p>
          )}
          {connections.map(c => (
            <Row key={c.id} item={c} trustLevel={trustLevels.get(c.otherUser.id)}
              onClick={() => navigate(c.otherUser.username ? `/${c.otherUser.username}` : `/host/${c.otherUser.id}`)} />
          ))}
        </div>
      </div>
    </div>
  );
}
