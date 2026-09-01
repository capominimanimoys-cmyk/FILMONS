// FILMONS Admin — Transactions ledger. Built on `orders` (one row per
// paid order, denormalized host/renter names, real Stripe refs) rather
// than `wallet_transactions` -- confirmed before building this that
// wallet_transactions has no user reference of its own and its
// order_id doesn't reliably match orders.id for the plain rental/
// service/sale Stripe path (that webhook path posts the Stripe
// Checkout session id there, not the real order id). `orders` is the
// one reliable per-transaction record.
//
// No "Pending"/"Failed" status exists anywhere in this schema --
// confirmed before building: an `orders` row is only ever inserted
// AFTER a payment succeeds (status is always 'paid'), and no failed-
// payment event is handled anywhere. So the stat tiles/filters here
// are Total Volume / Completed / Refunded / Disputed -- real,
// queryable states -- not the originally-imagined Pending/Failed.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, TrendingUp, CheckCircle, RotateCcw, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface OrderRow {
  id: string; type: string; listing_title: string | null;
  total_amount: number; buyer_fee_amount: number; seller_fee_amount: number;
  host_name: string | null; renter_name: string | null;
  paid_at: string; refund_status: string; dispute_status: string;
  currency: string | null;
}

const TYPE_LABEL: Record<string, string> = { rental: 'Rental', service: 'Service', sale: 'Sale', opportunity: 'Opportunity', hire: 'Hire' };
const money = (n: number, c = 'CAD') => `$${Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
const PAGE_SIZE = 50;

export function AdminTransactions() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'refunded' | 'disputed'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | keyof typeof TYPE_LABEL>('all');

  const COLUMNS = 'id, type, listing_title, total_amount, buyer_fee_amount, seller_fee_amount, host_name, renter_name, paid_at, refund_status, dispute_status, currency';

  const load = (offset: number) => {
    const setBusy = offset === 0 ? setLoading : setLoadingMore;
    setBusy(true);
    supabase.from('orders').select(COLUMNS).order('paid_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1)
      .then(({ data }) => {
        const rows = (data || []) as OrderRow[];
        setOrders(prev => offset === 0 ? rows : [...prev, ...rows]);
        setHasMore(rows.length === PAGE_SIZE);
        setBusy(false);
      }).catch(() => setBusy(false));
  };

  useEffect(() => { load(0); }, []);

  const totalVolume = useMemo(() => orders.reduce((s, o) => s + Number(o.total_amount || 0), 0), [orders]);
  const completedCount = orders.length;
  const refundedCount = useMemo(() => orders.filter(o => o.refund_status === 'refunded' || o.refund_status === 'partially_refunded').length, [orders]);
  const disputedCount = useMemo(() => orders.filter(o => o.dispute_status === 'disputed').length, [orders]);

  const filtered = useMemo(() => {
    let list = orders;
    if (statusFilter === 'refunded') list = list.filter(o => o.refund_status === 'refunded' || o.refund_status === 'partially_refunded');
    if (statusFilter === 'disputed') list = list.filter(o => o.dispute_status === 'disputed');
    if (typeFilter !== 'all') list = list.filter(o => o.type === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(o =>
      o.id.toLowerCase().includes(q) || o.listing_title?.toLowerCase().includes(q) ||
      o.host_name?.toLowerCase().includes(q) || o.renter_name?.toLowerCase().includes(q)
    );
    return list;
  }, [orders, statusFilter, typeFilter, search]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-black text-gray-900">Transactions</h1>
        <p className="text-sm text-gray-400">Track all payments and money movements</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Volume', value: money(totalVolume), icon: TrendingUp, bg: 'bg-blue-50', color: 'text-blue-500' },
          { label: 'Completed', value: String(completedCount), icon: CheckCircle, bg: 'bg-green-50', color: 'text-green-500' },
          { label: 'Refunded', value: String(refundedCount), icon: RotateCcw, bg: 'bg-amber-50', color: 'text-amber-500' },
          { label: 'Disputed', value: String(disputedCount), icon: AlertTriangle, bg: 'bg-red-50', color: 'text-red-500' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center shrink-0`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div className="min-w-0">
              <p className="text-xs text-gray-400 font-medium truncate">{s.label}</p>
              <p className="text-lg font-black text-gray-900 truncate">{s.value}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 -mt-2">Stats reflect the {orders.length} transactions loaded below, not necessarily the platform's full lifetime total.</p>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order ID, listing, host, renter..."
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-blue-300" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} className="text-sm font-semibold border border-gray-200 rounded-xl px-3 py-2.5">
          <option value="all">All types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="flex gap-1.5">
        {(['all', 'refunded', 'disputed'] as const).map(f => (
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
          <p className="p-10 text-center text-sm text-gray-400">No transactions match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100 text-xs">
                  <th className="px-4 py-2.5 font-bold">Order</th>
                  <th className="px-4 py-2.5 font-bold">Type</th>
                  <th className="px-4 py-2.5 font-bold">Renter → Host</th>
                  <th className="px-4 py-2.5 font-bold">Amount</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5 font-bold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(o => (
                  <tr key={o.id} onClick={() => navigate(`/transactions/${o.id}`)} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{o.id}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{TYPE_LABEL[o.type] || o.type}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[220px] truncate">{o.renter_name || '—'} → {o.host_name || '—'}</td>
                    <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">{money(o.total_amount, o.currency || 'CAD')}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {o.dispute_status === 'disputed' && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 mr-1">Disputed</span>}
                      {(o.refund_status === 'refunded' || o.refund_status === 'partially_refunded') && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Refunded</span>}
                      {o.dispute_status !== 'disputed' && o.refund_status === 'none' && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700">Paid</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{new Date(o.paid_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && !loading && (
          <button onClick={() => load(orders.length)} disabled={loadingMore}
            className="w-full py-3 text-sm font-bold text-blue-600 hover:bg-blue-50 border-t border-gray-50 disabled:opacity-50">
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}
