// FILMONS Admin — Opportunities (work/project requests: jobs, gigs,
// calls for talent). Same underlying `listings` table as AdminListings
// (listing_type='opportunity'), same moderation mechanism, but a
// distinct admin surface since Opportunities are work requests, not
// marketplace inventory. No Reports column/filter -- same reason as
// AdminListings, no reporting system exists anywhere in FILMONS today.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, Briefcase, CheckCircle, PauseCircle, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface OppRow {
  id: string; title: string; user_id: string; city: string | null; price: number | null;
  is_active: boolean; moderation_status: string; created_at: string;
  hostName?: string; applicationCount?: number;
}

const STATUS_LABEL: Record<string, string> = { active: 'Active', paused: 'Paused', removed: 'Removed' };
const STATUS_BADGE: Record<string, string> = { active: 'bg-green-50 text-green-700', paused: 'bg-amber-50 text-amber-700', removed: 'bg-red-50 text-red-600' };
const PAGE_SIZE = 50;

export function AdminOpportunities() {
  const navigate = useNavigate();
  const [opps, setOpps] = useState<OppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'removed'>('all');

  const load = (offset: number) => {
    const setBusy = offset === 0 ? setLoading : setLoadingMore;
    setBusy(true);
    supabase.from('listings')
      .select('id, title, user_id, city, price, is_active, moderation_status, created_at')
      .eq('listing_type', 'opportunity')
      .order('created_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1)
      .then(async ({ data }) => {
        const rows = (data || []) as OppRow[];
        const userIds = [...new Set(rows.map(r => r.user_id))];
        const listingIds = rows.map(r => r.id);
        const [{ data: hosts }, { data: apps }] = await Promise.all([
          userIds.length ? supabase.from('profiles').select('id, name').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
          listingIds.length ? supabase.from('opportunity_applications').select('listing_id').in('listing_id', listingIds) : Promise.resolve({ data: [] as any[] }),
        ]);
        const nameMap = Object.fromEntries((hosts || []).map((h: any) => [h.id, h.name]));
        const appCounts: Record<string, number> = {};
        (apps || []).forEach((a: any) => { appCounts[a.listing_id] = (appCounts[a.listing_id] || 0) + 1; });
        const withExtra = rows.map(r => ({ ...r, hostName: nameMap[r.user_id], applicationCount: appCounts[r.id] || 0 }));
        setOpps(prev => offset === 0 ? withExtra : [...prev, ...withExtra]);
        setHasMore(rows.length === PAGE_SIZE);
        setBusy(false);
      }).catch(() => setBusy(false));
  };

  useEffect(() => { load(0); }, []);

  const stats = useMemo(() => ({
    total: opps.length,
    active: opps.filter(o => o.moderation_status === 'active').length,
    paused: opps.filter(o => o.moderation_status === 'paused').length,
    removed: opps.filter(o => o.moderation_status === 'removed').length,
  }), [opps]);

  const filtered = useMemo(() => {
    let list = opps;
    if (statusFilter !== 'all') list = list.filter(o => o.moderation_status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(o => o.title?.toLowerCase().includes(q) || o.hostName?.toLowerCase().includes(q) || o.id.toLowerCase().includes(q));
    return list;
  }, [opps, statusFilter, search]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-black text-gray-900">Opportunities</h1>
        <p className="text-sm text-gray-400">Review and manage FILMONS Opportunity posts</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Opportunities', value: stats.total, icon: Briefcase, bg: 'bg-indigo-50', color: 'text-indigo-500' },
          { label: 'Active', value: stats.active, icon: CheckCircle, bg: 'bg-green-50', color: 'text-green-500' },
          { label: 'Paused', value: stats.paused, icon: PauseCircle, bg: 'bg-amber-50', color: 'text-amber-500' },
          { label: 'Removed', value: stats.removed, icon: XCircle, bg: 'bg-red-50', color: 'text-red-500' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center shrink-0`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div className="min-w-0"><p className="text-xs text-gray-400 font-medium truncate">{s.label}</p><p className="text-lg font-black text-gray-900">{s.value}</p></div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 -mt-2">Stats reflect the {opps.length} opportunities loaded below.</p>

      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search opportunity title, poster, opportunity ID..."
          className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-blue-300" />
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {(['all', 'active', 'paused', 'removed'] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            className={`px-3 py-2 rounded-xl text-xs font-bold capitalize whitespace-nowrap transition-colors ${statusFilter === f ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-500'}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center"><div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-400">No opportunities match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100 text-xs">
                  <th className="px-4 py-2.5 font-bold">Opportunity</th>
                  <th className="px-4 py-2.5 font-bold">Posted By</th>
                  <th className="px-4 py-2.5 font-bold">Location</th>
                  <th className="px-4 py-2.5 font-bold">Compensation</th>
                  <th className="px-4 py-2.5 font-bold">Applications</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5 font-bold">Posted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(o => (
                  <tr key={o.id} onClick={() => navigate(`/opportunities/${o.id}`)} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-4 py-3 font-semibold text-gray-900 max-w-[220px] truncate">{o.title || 'Untitled'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{o.hostName || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{o.city || '—'}</td>
                    <td className="px-4 py-3 text-gray-900 font-bold whitespace-nowrap">{o.price != null && o.price > 0 ? `$${o.price}` : '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{o.applicationCount}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[o.moderation_status] || 'bg-gray-100 text-gray-500'}`}>{STATUS_LABEL[o.moderation_status] || o.moderation_status}</span></td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{new Date(o.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && !loading && (
          <button onClick={() => load(opps.length)} disabled={loadingMore}
            className="w-full py-3 text-sm font-bold text-blue-600 hover:bg-blue-50 border-t border-gray-50 disabled:opacity-50">
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}
