// Connections hub -- Connections / Requests (Received + Sent) / Suggested,
// reached via /connections, /connections/requests, /connections/suggested
// (tabs, not separate pages -- one component reading the active tab off
// the URL path so back/forward and deep links both work). Also doubles as
// a read-only view of ANOTHER user's connections (via ?user=<id>, e.g.
// from HostProfile's "View all connections") -- no Requests/Suggested for
// someone else's list (that's private), but shows how many are mutual.
//
// Suggested reuses getSuggestedCreators (portfolioApi.ts) -- the exact
// same scorer Home's "People you may like to connect with" row uses, per
// spec ("do not maintain separate Home and Connections recommendation
// algorithms").
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router';
import { ArrowLeft, Check, X as XIcon, Search, Clock, BadgeCheck, MapPin, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../lib/api';
import { captureSnapshot } from '../lib/smartAnimate';
import {
  listConnections, listPendingReceived, listSentRequests, respondToConnectionRequest,
  withdrawConnectionRequest, getMutualConnectionCount, dismissSuggestion,
  type ConnectionSummary,
} from '../lib/connectionsApi';
import { getSuggestedCreators, type SuggestedCreator } from '../lib/portfolioApi';
import { sendConnectionRequest } from '../lib/connectionsApi';
import { ConnectFlowSheet } from '../components/ConnectFlowSheet';
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

type Tab = 'connections' | 'requests' | 'suggested';

function SuggestedRow({ creator, onConnected, onDismiss }: { creator: SuggestedCreator; onConnected: () => void; onDismiss: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [requested, setRequested] = useState(false);
  const [showFlow, setShowFlow] = useState(false);

  const send = async (note?: string) => {
    setShowFlow(false);
    if (!user) return;
    setRequested(true);
    const ok = await sendConnectionRequest(user.id, creator.id, note);
    if (!ok) setRequested(false); else onConnected();
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
      <button onClick={() => navigate(`/host/${creator.id}`)} className="w-11 h-11 rounded-full overflow-hidden bg-gray-200 shrink-0">
        {creator.avatar_url
          ? <img src={creator.avatar_url} alt={creator.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-400">{creator.name?.[0]?.toUpperCase() || '?'}</div>}
      </button>
      <button onClick={() => navigate(`/host/${creator.id}`)} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1">
          <p className="text-sm font-bold text-gray-900 truncate">{creator.name}</p>
          {creator.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 fill-blue-100 shrink-0" />}
        </div>
        <p className="text-xs text-gray-400 truncate">
          {[creator.primary_role, creator.city].filter(Boolean).join(' · ')}
          {creator.mutualCount > 0 ? ` · ${creator.mutualCount} mutual` : ''}
        </p>
      </button>
      <button
        onClick={requested ? undefined : () => { if (!user) return; setShowFlow(true); }}
        disabled={requested}
        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-black flex items-center gap-1 ${requested ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 text-white'}`}
      >
        {requested ? <><Clock className="w-3.5 h-3.5" /> Pending</> : <><UserCheck className="w-3.5 h-3.5" /> Connect</>}
      </button>
      <button onClick={onDismiss} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:bg-gray-100 hover:text-gray-500">
        <XIcon className="w-4 h-4" />
      </button>
      {showFlow && <ConnectFlowSheet name={creator.name} avatar={creator.avatar_url} onSend={send} onClose={() => setShowFlow(false)} />}
    </div>
  );
}

export function MyConnections() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: me } = useAuth();
  const [searchParams] = useSearchParams();
  const viewingUserId = searchParams.get('user') || me?.id || '';
  const isOwnList = !!me?.id && viewingUserId === me.id;

  const tab: Tab = location.pathname.endsWith('/requests') ? 'requests'
    : location.pathname.endsWith('/suggested') ? 'suggested' : 'connections';
  const setTab = (t: Tab) => navigate(t === 'connections' ? '/connections' : `/connections/${t}`);

  const [viewingName, setViewingName] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [received, setReceived] = useState<ConnectionSummary[]>([]);
  const [sent, setSent] = useState<ConnectionSummary[]>([]);
  const [requestsSubTab, setRequestsSubTab] = useState<'received' | 'sent'>('received');
  const [suggested, setSuggested] = useState<SuggestedCreator[]>([]);
  const [trustLevels, setTrustLevels] = useState<Map<string, TrustLevel>>(new Map());
  const [mutualCount, setMutualCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!viewingUserId) return;
    setLoading(true);
    const loads: Promise<any>[] = [
      listConnections(viewingUserId).then(setConnections),
      isOwnList ? listPendingReceived(viewingUserId).then(setReceived) : Promise.resolve(),
      isOwnList ? listSentRequests(viewingUserId).then(setSent) : Promise.resolve(),
      isOwnList ? getSuggestedCreators(viewingUserId, { limit: 30 }).then(setSuggested) : Promise.resolve(),
      !isOwnList && me?.id ? getMutualConnectionCount(me.id, viewingUserId).then(setMutualCount) : Promise.resolve(),
      !isOwnList ? authApi.getUserById(viewingUserId).then(u => setViewingName(u?.name || null)) : Promise.resolve(),
    ];
    Promise.all(loads).then(() => setLoading(false)).catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingUserId, isOwnList]);

  useEffect(() => {
    const ids = [...connections, ...received, ...sent].map(c => c.otherUser.id);
    if (ids.length) getTrustLevelsBatch(ids).then(setTrustLevels);
  }, [connections, received, sent]);

  const respond = async (otherId: string, accept: boolean) => {
    if (!me?.id) return;
    await respondToConnectionRequest(me.id, otherId, accept);
    setReceived(p => p.filter(r => r.otherUser.id !== otherId));
    if (accept) listConnections(me.id).then(setConnections);
  };

  const withdraw = async (otherId: string) => {
    if (!me?.id) return;
    await withdrawConnectionRequest(me.id, otherId);
    setSent(p => p.filter(r => r.otherUser.id !== otherId));
  };

  const dismissSuggested = (id: string) => {
    setSuggested(p => p.filter(s => s.id !== id));
    if (me?.id) dismissSuggestion(me.id, id);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return connections;
    return connections.filter(c => c.otherUser.name?.toLowerCase().includes(q) || c.otherUser.username?.toLowerCase().includes(q));
  }, [connections, query]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-14 lg:top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => { captureSnapshot(); navigate(-1); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <h1 className="text-base font-black text-gray-900">{isOwnList ? 'Connections' : `${viewingName || 'Their'}'s Connections`}</h1>
      </div>

      {isOwnList && (
        <div className="sticky top-[104px] lg:top-[57px] z-10 bg-white border-b border-gray-100 px-4 flex gap-5 overflow-x-auto no-scrollbar">
          {([['connections', 'Connections'], ['requests', 'Requests'], ['suggested', 'Suggested']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${tab === t ? 'text-gray-900 border-gray-900' : 'text-gray-400 border-transparent'}`}>
              {label}{t === 'requests' && received.length > 0 ? ` (${received.length})` : ''}
            </button>
          ))}
        </div>
      )}

      <div className="max-w-lg mx-auto py-4">
        {(!isOwnList || tab === 'connections') && (
          <>
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
          </>
        )}

        {isOwnList && tab === 'requests' && (
          <>
            <div className="px-4 mb-3 flex gap-2">
              <button onClick={() => setRequestsSubTab('received')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${requestsSubTab === 'received' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
                Received{received.length > 0 ? ` (${received.length})` : ''}
              </button>
              <button onClick={() => setRequestsSubTab('sent')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${requestsSubTab === 'sent' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
                Sent{sent.length > 0 ? ` (${sent.length})` : ''}
              </button>
            </div>
            <div className="bg-white divide-y divide-gray-50 border-y border-gray-100">
              {requestsSubTab === 'received' ? (
                received.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-10">No pending requests.</p>
                ) : received.map(p => (
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
                ))
              ) : (
                sent.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-10">No sent requests.</p>
                ) : sent.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 shrink-0">
                      {p.otherUser.avatar_url
                        ? <img src={p.otherUser.avatar_url} alt={p.otherUser.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-400">{p.otherUser.name?.[0]?.toUpperCase() || '?'}</div>}
                    </div>
                    <p className="text-sm font-bold text-gray-900 flex-1 min-w-0 truncate">{p.otherUser.name}</p>
                    <button onClick={() => withdraw(p.otherUser.id)} className="shrink-0 px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
                      Withdraw
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {isOwnList && tab === 'suggested' && (
          <>
            <p className="px-4 mb-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">People you may like to connect with</p>
            <div className="bg-white divide-y divide-gray-50 border-y border-gray-100">
              {!loading && suggested.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-10">No suggestions right now.</p>
              )}
              {suggested.map(c => (
                <SuggestedRow key={c.id} creator={c}
                  onConnected={() => {}}
                  onDismiss={() => dismissSuggested(c.id)} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
