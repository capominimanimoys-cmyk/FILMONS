// FILMONS Admin — Listings (marketplace inventory: rentals, sales,
// services). Opportunities are listing_type='opportunity' and live in
// their own AdminOpportunities page instead, per the FILMONS
// distinction between marketplace inventory and work/project requests.
//
// No "Reported" stat/filter/column -- confirmed before building this
// that no reporting/flagging system exists anywhere in FILMONS today
// (no table, no submit-a-report UI, nothing). Faking that column would
// misrepresent real moderation queue depth. "Pending" is dropped too --
// there's no approval gate before a listing goes live, so nothing is
// ever actually pending.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, Package, CheckCircle, PauseCircle, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ListingRow {
  id: string; title: string; user_id: string; listing_type: string | null; listing_mode: string | null;
  price: number | null; city: string | null; is_active: boolean; moderation_status: string; created_at: string;
  hostName?: string;
}

const STATUS_LABEL: Record<string, string> = { active: 'Active', paused: 'Paused', removed: 'Removed' };
const STATUS_BADGE: Record<string, string> = { active: 'bg-green-50 text-green-700', paused: 'bg-amber-50 text-amber-700', removed: 'bg-red-50 text-red-600' };
const TYPE_LABEL: Record<string, string> = { rent: 'Rental', sale: 'Sale', service: 'Service' };
const PAGE_SIZE = 50;

export function AdminListings() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'removed'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'rent' | 'sale' | 'service'>('all');

  const load = (offset: number) => {
    const setBusy = offset === 0 ? setLoading : setLoadingMore;
    setBusy(true);
    supabase.from('listings')
      .select('id, title, user_id, listing_type, listing_mode, price, city, is_active, moderation_status, created_at')
      .neq('listing_type', 'opportunity')
      .order('created_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1)
      .then(async ({ data }) => {
        const rows = (data || []) as ListingRow[];
        const userIds = [...new Set(rows.map(r => r.user_id))];
        const { data: hosts } = userIds.length ? await supabase.from('profiles').select('id, name').in('id', userIds) : { data: [] as any[] };
        const nameMap = Object.fromEntries((hosts || []).map((h: any) => [h.id, h.name]));
        const withNames = rows.map(r => ({ ...r, hostName: nameMap[r.user_id] }));
        setListings(prev => offset === 0 ? withNames : [...prev, ...withNames]);
        setHasMore(rows.length === PAGE_SIZE);
        setBusy(false);
      }).catch(() => setBusy(false));
  };

  useEffect(() => { load(0); }, []);

  const stats = useMemo(() => ({
    total: listings.length,
    active: listings.filter(l => l.moderation_status === 'active').length,
    paused: listings.filter(l => l.moderation_status === 'paused').length,
    removed: listings.filter(l => l.moderation_status === 'removed').length,
  }), [listings]);

  const filtered = useMemo(() => {
    let list = listings;
    if (statusFilter !== 'all') list = list.filter(l => l.moderation_status === statusFilter);
    if (typeFilter !== 'all') list = list.filter(l => l.listing_mode === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(l => l.title?.toLowerCase().includes(q) || l.hostName?.toLowerCase().includes(q) || l.id.toLowerCase().includes(q));
    return list;
  }, [listings, statusFilter, typeFilter, search]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-black text-gray-900">Listings</h1>
        <p className="text-sm text-gray-400">Review and manage marketplace listings</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Listings', value: stats.total, icon: Package, bg: 'bg-blue-50', color: 'text-blue-500' },
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
      <p className="text-[11px] text-gray-400 -mt-2">Stats reflect the {listings.length} listings loaded below.</p>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search listing title, host, listing ID..."
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-blue-300" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} className="text-sm font-semibold border border-gray-200 rounded-xl px-3 py-2.5">
          <option value="all">All types</option>
          <option value="rent">Rental</option>
          <option value="sale">Sale</option>
          <option value="service">Service</option>
        </select>
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
          <p className="p-10 text-center text-sm text-gray-400">No listings match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100 text-xs">
                  <th className="px-4 py-2.5 font-bold">Listing</th>
                  <th className="px-4 py-2.5 font-bold">Host</th>
                  <th className="px-4 py-2.5 font-bold">Type</th>
                  <th className="px-4 py-2.5 font-bold">Price</th>
                  <th className="px-4 py-2.5 font-bold">Location</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5 font-bold">Posted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(l => (
                  <tr key={l.id} onClick={() => navigate(`/listings/${l.id}`)} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-4 py-3 font-semibold text-gray-900 max-w-[220px] truncate">{l.title || 'Untitled'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{l.hostName || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{TYPE_LABEL[l.listing_mode || ''] || l.listing_type || '—'}</td>
                    <td className="px-4 py-3 text-gray-900 font-bold whitespace-nowrap">{l.price != null ? `$${l.price}` : '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{l.city || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[l.moderation_status] || 'bg-gray-100 text-gray-500'}`}>{STATUS_LABEL[l.moderation_status] || l.moderation_status}</span></td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && !loading && (
          <button onClick={() => load(listings.length)} disabled={loadingMore}
            className="w-full py-3 text-sm font-bold text-blue-600 hover:bg-blue-50 border-t border-gray-50 disabled:opacity-50">
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}
