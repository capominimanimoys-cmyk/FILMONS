// Connections -- reached via /connections. A focused, full-screen workspace
// per spec (no global header/mobile bottom nav -- see Root.tsx's hideTopBar/
// hideBottomNav), not another primary navigation feed. This file is just a
// thin dispatcher: viewing someone ELSE's connections (?user=<id>, e.g. from
// HostProfile's "View all connections") is a read-only list with none of the
// below (Requests/Suggested/Activity are private), so that case delegates
// straight to AllConnections.tsx, which already handles it. Everything below
// is the viewer's OWN hub.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowRight, Search, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listConnections, listPendingReceived, type ConnectionSummary } from '../lib/connectionsApi';
import { getSuggestedCreators, type SuggestedCreator } from '../lib/portfolioApi';
import { searchMatchingCreators, type SearchProfileRow } from '../lib/filmSearch';
import { getConnectFeed, type ConnectFeedItem } from '../lib/connectFeed';
import { getActivitySentence } from '../lib/activityApi';
import { usePortfolioPreview } from '../context/PortfolioPreviewContext';
import { SuggestedConnectionCard } from '../components/connect/SuggestedConnectionCard';
import { ConnectionsPageHeader } from '../components/connect/ConnectionsPageHeader';
import { AllConnections } from './AllConnections';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

function ConnectionMiniCard({ item }: { item: ConnectionSummary }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(item.otherUser.username ? `/${item.otherUser.username}` : `/host/${item.otherUser.id}`)}
      className="w-28 shrink-0 flex flex-col items-center gap-1.5 text-center"
    >
      <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200">
        {item.otherUser.avatar_url
          ? <img src={item.otherUser.avatar_url} alt={item.otherUser.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-lg font-bold text-gray-400">{item.otherUser.name?.[0]?.toUpperCase() || '?'}</div>}
      </div>
      <p className="text-xs font-bold text-gray-900 truncate w-full">{item.otherUser.name}</p>
    </button>
  );
}

function SearchResultRow({ u }: { u: SearchProfileRow }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(u.username ? `/${u.username}` : `/host/${u.id}`)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
    >
      <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 shrink-0">
        {u.avatar_url
          ? <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-400">{u.name?.[0]?.toUpperCase() || '?'}</div>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 truncate">{u.name}</p>
        <p className="text-xs text-gray-400 truncate">{[u.primary_role, u.city].filter(Boolean).join(' · ')}</p>
      </div>
    </button>
  );
}

function ActivityPreviewRow({ item }: { item: ConnectFeedItem }) {
  const navigate = useNavigate();
  const { openPortfolioPreview } = usePortfolioPreview();

  if (item.kind === 'portfolio') {
    const { entry } = item;
    const title = entry.type === 'item' ? entry.item.title : entry.album.title;
    return (
      <button
        onClick={() => openPortfolioPreview(entry.creator.id, entry.type === 'album' ? entry.id : undefined)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 shrink-0">
          {entry.creator.avatar_url
            ? <img src={entry.creator.avatar_url} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-400">{entry.creator.name?.[0]?.toUpperCase() || '?'}</div>}
        </div>
        <p className="text-xs text-gray-600 flex-1 min-w-0 truncate">
          <span className="font-bold text-gray-900">{entry.creator.name}</span> added {title} · {timeAgo(entry.created_at)}
        </p>
      </button>
    );
  }

  const { entry } = item;
  return (
    <button
      onClick={() => navigate(entry.targetType === 'post' && entry.targetId ? `/post/${entry.targetId}` : `/host/${entry.actor.id}`)}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
    >
      <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 shrink-0">
        {entry.actor.avatar_url
          ? <img src={entry.actor.avatar_url} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-400">{entry.actor.name?.[0]?.toUpperCase() || '?'}</div>}
      </div>
      <p className="text-xs text-gray-600 flex-1 min-w-0 truncate">
        <span className="font-bold text-gray-900">{entry.actor.name}</span> {getActivitySentence(entry)} · {timeAgo(entry.createdAt)}
      </p>
    </button>
  );
}

function ConnectionsHub() {
  const navigate = useNavigate();
  const { user: me } = useAuth();

  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [received, setReceived] = useState<ConnectionSummary[]>([]);
  const [suggested, setSuggested] = useState<SuggestedCreator[]>([]);
  const [activity, setActivity] = useState<ConnectFeedItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchProfileRow[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => { const t = setTimeout(() => setDebouncedQuery(query), 300); return () => clearTimeout(t); }, [query]);
  useEffect(() => {
    if (!debouncedQuery.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    let cancelled = false;
    searchMatchingCreators(debouncedQuery).then(r => { if (!cancelled) { setSearchResults(r); setSearching(false); } });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  useEffect(() => {
    if (!me?.id) return;
    setLoading(true);
    setActivity(null);
    Promise.all([
      listConnections(me.id),
      listPendingReceived(me.id).then(setReceived),
      getSuggestedCreators(me.id, { limit: 10 }).then(setSuggested),
    ]).then(([conns]) => {
      setConnections(conns);
      setLoading(false);
      // Chained off the SAME connections fetch (not a second effect keyed
      // on connections.length) -- a separate effect never re-ran once
      // `loading` alone changed for a viewer with zero connections, which
      // left the activity section stuck on "Loading..." forever instead of
      // ever reaching the empty state.
      const connectionIds = conns.map(c => c.otherUser.id);
      if (!connectionIds.length) { setActivity([]); return; }
      getConnectFeed({ tab: 'following', viewerId: me.id, followingIds: connectionIds, sort: 'recent', limit: 6 })
        .then(page => setActivity(page.items));
    }).catch(() => setLoading(false));
  }, [me?.id]);

  const showingSearch = debouncedQuery.trim().length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <ConnectionsPageHeader title="Connections" />

      <div className="max-w-2xl mx-auto py-4">
        {/* ── Requests ─────────────────────────────────────────────────── */}
        <button
          onClick={() => navigate('/connections/requests')}
          className="w-full flex items-center gap-3 px-4 py-3.5 mb-4 bg-white border-y border-gray-100 hover:bg-gray-50 transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-gray-900">Requests{received.length > 0 ? ` ${received.length}` : ''}</p>
            <p className="text-xs text-gray-400">View and manage all your connection requests</p>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
        </button>

        {/* ── Search ───────────────────────────────────────────────────── */}
        <div className="px-4 mb-5">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search people, roles, locations, tools..."
              className="w-full bg-white border border-gray-200 rounded-2xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-blue-400 transition-colors"
            />
          </div>
        </div>

        {showingSearch ? (
          <div className="bg-white divide-y divide-gray-50 border-y border-gray-100">
            {searching ? (
              <p className="text-sm text-gray-400 text-center py-10">Searching…</p>
            ) : searchResults.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No people found.</p>
            ) : (
              searchResults.map(u => <SearchResultRow key={u.id} u={u} />)
            )}
          </div>
        ) : (
          <>
            {/* ── Your connections ─────────────────────────────────────── */}
            <section className="mb-6">
              <div className="flex items-center justify-between px-4 mb-1">
                <p className="text-sm font-black text-gray-900">Your connections ({connections.length})</p>
                {connections.length > 0 && (
                  <button onClick={() => navigate('/connections/all')} className="flex items-center gap-0.5 text-xs font-bold text-blue-600 hover:text-blue-700 shrink-0">
                    See all <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="px-4 mb-2.5 text-xs text-gray-400">People you're connected with</p>
              {!loading && connections.length === 0 ? (
                <p className="px-4 text-sm text-gray-400">No connections yet.</p>
              ) : (
                <div className="flex gap-3 overflow-x-auto no-scrollbar px-4">
                  {connections.slice(0, 10).map(c => <ConnectionMiniCard key={c.id} item={c} />)}
                </div>
              )}
            </section>

            {/* ── Suggested ─────────────────────────────────────────────── */}
            <section className="mb-6">
              <div className="flex items-center justify-between px-4 mb-1">
                <p className="text-sm font-black text-gray-900">People you may like to connect with</p>
                {suggested.length > 0 && (
                  <button onClick={() => navigate('/connections/suggested')} className="flex items-center gap-0.5 text-xs font-bold text-blue-600 hover:text-blue-700 shrink-0">
                    See all <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="px-4 mb-2.5 text-xs text-gray-400">Suggestions based on your role, tools, location and activity.</p>
              {!loading && suggested.length === 0 ? (
                <p className="px-4 text-sm text-gray-400">No suggestions right now.</p>
              ) : (
                <div className="flex gap-3 overflow-x-auto no-scrollbar px-4">
                  {suggested.map(c => (
                    <SuggestedConnectionCard key={c.id} creator={c}
                      onConnected={() => {}}
                      onDismiss={() => setSuggested(p => p.filter(s => s.id !== c.id))} />
                  ))}
                </div>
              )}
            </section>

            {/* ── Recent activity ──────────────────────────────────────── */}
            <section>
              <div className="flex items-center justify-between px-4 mb-1">
                <p className="text-sm font-black text-gray-900">Recent activity from your connections</p>
                {!!activity?.length && (
                  <button onClick={() => navigate('/connections/activity')} className="flex items-center gap-0.5 text-xs font-bold text-blue-600 hover:text-blue-700 shrink-0">
                    See all <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="bg-white divide-y divide-gray-50 border-y border-gray-100 mt-2">
                {activity === null ? (
                  <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
                ) : activity.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No recent activity from your connections yet.</p>
                ) : (
                  activity.map(item => <ActivityPreviewRow key={`${item.kind}-${item.entry.id}`} item={item} />)
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export function MyConnections() {
  const { user: me } = useAuth();
  const [searchParams] = useSearchParams();
  const viewingUserId = searchParams.get('user');
  const isOwnList = !viewingUserId || viewingUserId === me?.id;

  if (!isOwnList) return <AllConnections />;
  return <ConnectionsHub />;
}
