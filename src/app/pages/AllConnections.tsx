// /connections/all -- dedicated full-screen subpage, split out of what used
// to be MyConnections.tsx's default "connections" tab. Also doubles as a
// read-only view of ANOTHER user's connections via ?user=<id> (e.g. from
// HostProfile's "View all connections") -- same as the old combined page did.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../lib/api';
import { listConnections, getMutualConnectionCount, type ConnectionSummary } from '../lib/connectionsApi';
import { getTrustLevelsBatch, type TrustLevel } from '../lib/trustApi';
import { TrustBadge } from '../components/trust/TrustBadge';
import { ConnectionsPageHeader } from '../components/connect/ConnectionsPageHeader';
import { ConnectionsSlideIn } from '../components/connect/ConnectionsSlideIn';

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

export function AllConnections() {
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const [searchParams] = useSearchParams();
  const viewingUserId = searchParams.get('user') || me?.id || '';
  const isOwnList = !!me?.id && viewingUserId === me.id;

  const [viewingName, setViewingName] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [trustLevels, setTrustLevels] = useState<Map<string, TrustLevel>>(new Map());
  const [mutualCount, setMutualCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!viewingUserId) return;
    setLoading(true);
    Promise.all([
      listConnections(viewingUserId).then(setConnections),
      !isOwnList && me?.id ? getMutualConnectionCount(me.id, viewingUserId).then(setMutualCount) : Promise.resolve(),
      !isOwnList ? authApi.getUserById(viewingUserId).then(u => setViewingName(u?.name || null)) : Promise.resolve(),
    ]).then(() => setLoading(false)).catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingUserId, isOwnList]);

  useEffect(() => {
    const ids = connections.map(c => c.otherUser.id);
    if (ids.length) getTrustLevelsBatch(ids).then(setTrustLevels);
  }, [connections]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return connections;
    return connections.filter(c => c.otherUser.name?.toLowerCase().includes(q) || c.otherUser.username?.toLowerCase().includes(q));
  }, [connections, query]);

  return (
    <ConnectionsSlideIn>
      <ConnectionsPageHeader title={isOwnList ? 'Your Connections' : `${viewingName || 'Their'}'s Connections`} />
      <div className="max-w-lg mx-auto py-4">
        <div className="px-4 mb-3">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
            {connections.length} Connection{connections.length !== 1 ? 's' : ''}
            {!isOwnList && mutualCount != null && mutualCount > 0 ? ` · ${mutualCount} mutual` : ''}
          </p>
          {connections.length > 3 && (
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search connections…"
                className="w-full bg-white border border-gray-100 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none"
              />
            </div>
          )}
        </div>
        <div className="bg-white divide-y divide-gray-50 border-y border-gray-100">
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">
              {connections.length === 0 ? 'No connections yet.' : 'No connections match your search.'}
            </p>
          )}
          {filtered.map(c => (
            <Row key={c.id} item={c} trustLevel={trustLevels.get(c.otherUser.id)}
              onClick={() => navigate(c.otherUser.username ? `/${c.otherUser.username}` : `/host/${c.otherUser.id}`)} />
          ))}
        </div>
      </div>
    </ConnectionsSlideIn>
  );
}
