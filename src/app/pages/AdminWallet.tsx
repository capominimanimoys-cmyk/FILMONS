// FILMONS Admin — Wallet. The platform's financial position and money
// operations: available/pending balances, FILMONS's own revenue (never
// conflated with money that belongs to creators), pending funds with
// Stripe's real availability dates, payout requests, a wallet activity
// feed, a revenue breakdown, and Stripe reconciliation.
//
// Split out of AdminVerifications.tsx, which used to bundle all of this
// under a second "Wallet" tab -- moved here as its own admin section so
// Verifications only ever deals with identity review, never financial
// administration. The payout/refund/dispute/opportunity-payments/hire-
// payments logic below is carried over unchanged from that page; only
// the Overview cards, Pending Funds, Wallet Activity, Revenue, and
// Stripe Reconciliation sections are new.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Wallet as WalletIcon, DollarSign, TrendingUp, ArrowDownLeft, Clock,
  CheckCircle, RefreshCw, AlertTriangle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminFn } from '../lib/adminAuth';
import { toast } from 'sonner';

interface WalletTx {
  id: string;
  amount: number;
  subtotal: number;
  buyerFee: number;
  sellerFee: number;
  platformFee: number;
  creatorPayout: number;
  feeConfigVersion?: string;
  title: string;
  status: 'paid' | 'pending';
  date: string;
  hostName?: string;
  renterName?: string;
  method?: string;
  refundStatus: string;
  disputeStatus: string;
}

interface RefundRequest {
  id: string;
  order_id: string;
  requester_id: string;
  reason: string | null;
  amount: number;
  status: 'requested' | 'approved' | 'denied' | 'processed';
  requested_at: string;
  processed_at: string | null;
  processed_by: string | null;
}

interface PendingFundRow {
  id: string; amount: number; description: string | null;
  available_at: string | null; order_id: string | null;
  userName: string;
}

interface ActivityRow {
  id: string; transaction_type: string; amount: number; description: string | null;
  status: string; balance_type: string; created_at: string; order_id: string | null;
}

const fmt = (n: number) => Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

// Every `orders` row is only ever created after payment succeeds (see
// Checkout.tsx's finalizeOrder) -- there's no "pending" order concept
// here, so this is always effectively "paid orders."
async function loadWalletTxs(): Promise<WalletTx[]> {
  try {
    const { data, error } = await supabase.from('orders').select('*').order('paid_at', { ascending: false }).limit(200);
    if (error || !data) return [];
    return data.map((r: any) => {
      const subtotal = Number(r.subtotal ?? r.total_amount ?? 0);
      const buyerFee = Number(r.buyer_fee_amount ?? 0);
      const sellerFee = Number(r.seller_fee_amount ?? 0);
      return {
        id: r.id, amount: Number(r.total_amount ?? 0), subtotal, buyerFee, sellerFee,
        platformFee: buyerFee + sellerFee, creatorPayout: subtotal - sellerFee,
        feeConfigVersion: r.fee_config_version || undefined,
        title: r.listing_title || 'Payment', status: 'paid',
        date: r.paid_at || new Date().toISOString(),
        hostName: r.host_name, renterName: r.renter_name, method: r.payment_method,
        refundStatus: r.refund_status || 'none', disputeStatus: r.dispute_status || 'none',
      };
    });
  } catch { return []; }
}

const ACTIVITY_FILTERS = ['all', 'incoming', 'pending', 'available', 'payouts', 'revenue', 'refunds'] as const;
type ActivityFilter = typeof ACTIVITY_FILTERS[number];
const INCOMING_TYPES = ['rental_earning', 'service_earning', 'sale_earning', 'opportunity_earning', 'hire_earning', 'boost_purchase', 'emergency_purchase'];

export function AdminWallet() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // Overview
  const [available, setAvailable] = useState(0);
  const [pending, setPending] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [revenueToday, setRevenueToday] = useState(0);
  const [revenueMonth, setRevenueMonth] = useState(0);
  const [revenueYear, setRevenueYear] = useState(0);

  // Pending funds + activity
  const [pendingFunds, setPendingFunds] = useState<PendingFundRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');

  // Stripe reconciliation
  const [stripeBalance, setStripeBalance] = useState<{ available: number; pending: number; fetchedAt: string } | null>(null);
  const [reconciling, setReconciling] = useState(false);

  // ── Moved from AdminVerifications' Wallet tab, unchanged ──────────
  const [walletTxs, setWalletTxs] = useState<WalletTx[]>([]);
  const [walletFilter, setWalletFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [payoutRequests, setPayoutRequests] = useState<any[]>([]);
  const [processingPayoutId, setProcessingPayoutId] = useState<string | null>(null);
  const [payoutAction, setPayoutAction] = useState<{ payout: any; action: 'reject' | 'paid' | 'mark_failed' } | null>(null);
  const [payoutActionInput, setPayoutActionInput] = useState('');
  const [payoutActionNotes, setPayoutActionNotes] = useState('');
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);
  const [processingRefundId, setProcessingRefundId] = useState<string | null>(null);
  const [disputeUpdatingOrderId, setDisputeUpdatingOrderId] = useState<string | null>(null);
  const [opportunityPayments, setOpportunityPayments] = useState<any[]>([]);
  const [hirePayments, setHirePayments] = useState<any[]>([]);

  const adminName = 'Admin'; // action attribution -- payout/refund endpoints log the acting admin server-side from the session cookie already; this is just the toast/UI label

  const loadAll = async () => {
    setLoading(true);

    // ── Overview: platform-wide pending/available (creator + platform
    // wallets combined -- money moving through the system, not FILMONS's
    // own earnings, see fn_admin_dashboard_totals for that split) ──
    const [walletsRes, totalsRes] = await Promise.all([
      supabase.from('wallets').select('pending_balance, available_balance').then(r => r.data || []).catch(() => [] as any[]),
      supabase.rpc('fn_admin_dashboard_totals').then(r => r.data?.[0] || null).catch(() => null),
    ]);
    setPending(walletsRes.reduce((s: number, w: any) => s + Number(w.pending_balance || 0), 0));
    setAvailable(walletsRes.reduce((s: number, w: any) => s + Number(w.available_balance || 0), 0));
    setRevenue(Number(totalsRes?.platform_revenue || 0));

    // ── Revenue by period -- filmons_fee rows only, never creator earnings ──
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString();
    const [todayRows, monthRows, yearRows] = await Promise.all([
      supabase.from('wallet_transactions').select('amount').eq('transaction_type', 'filmons_fee').gte('created_at', startOfToday).then(r => r.data || []).catch(() => []),
      supabase.from('wallet_transactions').select('amount').eq('transaction_type', 'filmons_fee').gte('created_at', startOfMonth).then(r => r.data || []).catch(() => []),
      supabase.from('wallet_transactions').select('amount').eq('transaction_type', 'filmons_fee').gte('created_at', startOfYear).then(r => r.data || []).catch(() => []),
    ]);
    setRevenueToday(todayRows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0));
    setRevenueMonth(monthRows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0));
    setRevenueYear(yearRows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0));

    // ── Pending funds -- Stripe's real available_at, never computed locally ──
    try {
      const { data: pendingTxRows } = await supabase
        .from('wallet_transactions')
        .select('id, amount, description, available_at, order_id, wallet_id')
        .eq('balance_type', 'pending').eq('status', 'pending')
        .order('created_at', { ascending: false }).limit(20);
      const rows = pendingTxRows || [];
      const walletIds = [...new Set(rows.map((r: any) => r.wallet_id))];
      const { data: walletOwners } = walletIds.length
        ? await supabase.from('wallets').select('id, owner_id').in('id', walletIds)
        : { data: [] as any[] };
      const ownerByWallet = Object.fromEntries((walletOwners || []).map((w: any) => [w.id, w.owner_id]));
      const ownerIds = [...new Set(Object.values(ownerByWallet))].filter(Boolean) as string[];
      const { data: owners } = ownerIds.length
        ? await supabase.from('profiles').select('id, name').in('id', ownerIds)
        : { data: [] as any[] };
      const nameByOwner = Object.fromEntries((owners || []).map((p: any) => [p.id, p.name]));
      setPendingFunds(rows.map((r: any) => ({
        id: r.id, amount: Number(r.amount || 0), description: r.description,
        available_at: r.available_at, order_id: r.order_id,
        userName: nameByOwner[ownerByWallet[r.wallet_id]] || 'Unknown',
      })));
    } catch (e) { console.warn('pending funds query failed:', e); }

    // ── Wallet activity feed ──
    try {
      const { data } = await supabase
        .from('wallet_transactions')
        .select('id, transaction_type, amount, description, status, balance_type, created_at, order_id')
        .order('created_at', { ascending: false }).limit(50);
      setActivity(data || []);
    } catch (e) { console.warn('wallet activity query failed:', e); }

    // ── Moved from AdminVerifications: orders / payouts / refunds / opportunity / hire ──
    loadWalletTxs().then(setWalletTxs);
    try {
      const { data } = await supabase.from('payout_requests').select('*, profiles(name, email)').order('requested_at', { ascending: false }).limit(100);
      const sorted = [...(data || [])].sort((a: any, b: any) => {
        const ai = a.payout_speed === 'instant' ? 1 : 0;
        const bi = b.payout_speed === 'instant' ? 1 : 0;
        return bi - ai;
      });
      setPayoutRequests(sorted);
    } catch (e) { console.warn('payout_requests query failed:', e); }
    try {
      const { data } = await supabase.from('refund_requests').select('*').order('requested_at', { ascending: false }).limit(100);
      setRefundRequests(data || []);
    } catch (e) { console.warn('refund_requests query failed:', e); }
    try {
      const { data: txns } = await supabase.from('opportunity_transactions').select('*').order('created_at', { ascending: false }).limit(100);
      const rows = txns || [];
      const listingIds = [...new Set(rows.map((r: any) => r.listing_id))];
      const userIds = [...new Set(rows.flatMap((r: any) => [r.owner_id, r.worker_id]))];
      const [{ data: listingRows }, { data: profileRows }] = await Promise.all([
        listingIds.length ? supabase.from('listings').select('id, title').in('id', listingIds) : Promise.resolve({ data: [] as any[] }),
        userIds.length ? supabase.from('profiles').select('id, name').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const listingMap = Object.fromEntries((listingRows || []).map((l: any) => [l.id, l.title]));
      const nameMap = Object.fromEntries((profileRows || []).map((p: any) => [p.id, p.name]));
      setOpportunityPayments(rows.map((r: any) => ({ ...r, listing_title: listingMap[r.listing_id], owner_name: nameMap[r.owner_id], worker_name: nameMap[r.worker_id] })));
    } catch (e) { console.warn('opportunity_transactions query failed:', e); }
    try {
      const { data: hireTxns } = await supabase.from('hire_transactions').select('*, hire_requests(project_title)').order('created_at', { ascending: false }).limit(100);
      const rows = hireTxns || [];
      const userIds = [...new Set(rows.flatMap((r: any) => [r.requester_id, r.host_id]))];
      const { data: profileRows } = userIds.length ? await supabase.from('profiles').select('id, name').in('id', userIds) : { data: [] as any[] };
      const nameMap = Object.fromEntries((profileRows || []).map((p: any) => [p.id, p.name]));
      setHirePayments(rows.map((r: any) => ({ ...r, project_title: r.hire_requests?.project_title, requester_name: nameMap[r.requester_id], host_name: nameMap[r.host_id] })));
    } catch (e) { console.warn('hire_transactions query failed:', e); }

    setLoading(false);
  };

  useEffect(() => { loadAll().catch(console.error); }, []);

  const reconcile = async () => {
    setReconciling(true);
    try {
      const res = await fetch(adminFn('admin-stripe-balance'), { credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Could not fetch Stripe balance');
      setStripeBalance({ available: data.available, pending: data.pending, fetchedAt: data.fetchedAt });
    } catch (e: any) {
      toast.error(e?.message || 'Could not reconcile with Stripe');
    } finally {
      setReconciling(false);
    }
  };

  const processPayoutSimple = async (payoutRequestId: string, action: 'approve' | 'mark_processing') => {
    setProcessingPayoutId(payoutRequestId);
    try {
      const res = await fetch(adminFn('admin-process-payout'), {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payoutRequestId, action, adminName }),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'Failed');
      toast.success(action === 'approve' ? 'Payout approved' : 'Payout marked as processing');
      loadAll().catch(console.error);
    } catch (e: any) {
      toast.error(e?.message || 'Could not update payout');
    } finally {
      setProcessingPayoutId(null);
    }
  };

  const submitPayoutAction = async () => {
    if (!payoutAction) return;
    const { payout, action } = payoutAction;
    if (action === 'reject' && !payoutActionInput.trim()) { toast.error('A rejection reason is required.'); return; }
    if (action === 'paid' && !payoutActionInput.trim()) { toast.error('A payment reference is required.'); return; }
    setProcessingPayoutId(payout.id);
    try {
      const body: Record<string, unknown> = { payoutRequestId: payout.id, adminName };
      if (action === 'reject') { body.action = 'reject'; body.reason = payoutActionInput.trim(); }
      else if (action === 'mark_failed') { body.action = 'mark_failed'; body.notes = payoutActionInput.trim() || undefined; }
      else { body.action = 'paid'; body.paymentReference = payoutActionInput.trim(); body.notes = payoutActionNotes.trim() || undefined; }

      const res = await fetch(adminFn('admin-process-payout'), {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'Failed');
      toast.success(action === 'reject' ? 'Payout rejected' : action === 'mark_failed' ? 'Payout marked as failed' : 'Payout marked as paid');
      setPayoutAction(null);
      setPayoutActionInput('');
      setPayoutActionNotes('');
      loadAll().catch(console.error);
    } catch (e: any) {
      toast.error(e?.message || 'Could not process payout');
    } finally {
      setProcessingPayoutId(null);
    }
  };

  const processRefund = async (refundRequestId: string, action: 'approve' | 'deny') => {
    setProcessingRefundId(refundRequestId);
    try {
      if (action === 'deny') {
        const { error } = await supabase.from('refund_requests').update({
          status: 'denied', processed_at: new Date().toISOString(), processed_by: adminName,
        }).eq('id', refundRequestId);
        if (error) throw new Error(error.message);
        toast.success('Refund request denied');
      } else {
        const res = await fetch(adminFn('process-refund'), {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refundRequestId, adminName }),
        });
        const result = await res.json();
        if (!res.ok || result.error) throw new Error(result.error || 'Failed');
        toast.success('Refund processed');
      }
      loadAll().catch(console.error);
    } catch (e: any) {
      toast.error(e?.message || 'Could not process refund');
    } finally {
      setProcessingRefundId(null);
    }
  };

  const toggleDispute = async (orderId: string, currentStatus: string) => {
    setDisputeUpdatingOrderId(orderId);
    try {
      const next = currentStatus === 'disputed' ? 'resolved' : 'disputed';
      const { error } = await supabase.from('orders').update({
        dispute_status: next, disputed_at: next === 'disputed' ? new Date().toISOString() : undefined,
      }).eq('id', orderId);
      if (error) throw new Error(error.message);
      toast.success(next === 'disputed' ? 'Order marked disputed — pending earnings held' : 'Dispute resolved');
      loadAll().catch(console.error);
    } catch (e: any) {
      toast.error(e?.message || 'Could not update dispute status');
    } finally {
      setDisputeUpdatingOrderId(null);
    }
  };

  const paidTxs = walletTxs.filter(t => t.status === 'paid');
  const pendingTxs = walletTxs.filter(t => t.status === 'pending');
  const totalVolume = paidTxs.reduce((s, t) => s + t.amount, 0);
  const filteredWallet = walletFilter === 'all' ? walletTxs : walletTxs.filter(t => t.status === walletFilter);

  const filteredActivity = activity.filter(a => {
    if (activityFilter === 'all') return true;
    if (activityFilter === 'incoming') return INCOMING_TYPES.includes(a.transaction_type);
    if (activityFilter === 'pending') return a.balance_type === 'pending';
    if (activityFilter === 'available') return a.balance_type === 'available' && a.transaction_type !== 'filmons_fee' && a.transaction_type !== 'payout';
    if (activityFilter === 'payouts') return a.transaction_type === 'payout';
    if (activityFilter === 'revenue') return a.transaction_type === 'filmons_fee';
    if (activityFilter === 'refunds') return a.transaction_type === 'refund';
    return true;
  });

  const discrepancy = stripeBalance
    ? Math.abs(stripeBalance.available - available) > 1 || Math.abs(stripeBalance.pending - pending) > 1
    : false;

  if (loading) return <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900">FILMONS Wallet</h1>
          <p className="text-sm text-gray-400">Monitor platform balances, pending funds, revenue and payouts.</p>
        </div>
        <button onClick={() => loadAll().catch(console.error)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Available Balance', value: `$${fmt(available)}`, sub: 'Available', icon: CheckCircle, bg: 'bg-green-50', color: 'text-green-500' },
          { label: 'Pending Balance', value: `$${fmt(pending)}`, sub: 'Pending settlement', icon: Clock, bg: 'bg-amber-50', color: 'text-amber-500' },
          { label: 'FILMONS Revenue', value: `$${fmt(revenue)}`, sub: 'Lifetime', icon: TrendingUp, bg: 'bg-blue-50', color: 'text-blue-500' },
          { label: 'Payout Requests', value: `$${fmt(payoutRequests.filter(p => ['requested', 'under_review', 'approved', 'processing'].includes(p.status)).reduce((s, p) => s + Number(p.amount || 0), 0))}`, sub: `${payoutRequests.filter(p => ['requested', 'under_review', 'approved', 'processing'].includes(p.status)).length} requests`, icon: WalletIcon, bg: 'bg-purple-50', color: 'text-purple-500' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 ${c.bg} rounded-lg flex items-center justify-center`}><c.icon className={`w-4 h-4 ${c.color}`} /></div>
              <p className="text-xs text-gray-400 font-medium">{c.label}</p>
            </div>
            <p className="text-xl font-black text-gray-900">{c.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 -mt-6">Available/Pending reflect all platform + creator wallet balances combined — not FILMONS's own earnings. FILMONS Revenue is platform fees only.</p>

      {/* Pending Funds */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h3 className="text-sm font-bold text-gray-900">Pending Funds</h3>
          <p className="text-xs text-gray-400 mt-0.5">Availability dates come from Stripe directly — never estimated locally.</p>
        </div>
        {pendingFunds.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No pending funds right now.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100 text-xs">
                  <th className="px-4 py-2.5 font-bold">User</th>
                  <th className="px-4 py-2.5 font-bold">Amount</th>
                  <th className="px-4 py-2.5 font-bold">Available</th>
                  <th className="px-4 py-2.5 font-bold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pendingFunds.map(f => (
                  <tr key={f.id} onClick={() => f.order_id && navigate(`/transactions/${f.order_id}`)} className={f.order_id ? 'hover:bg-gray-50 cursor-pointer' : ''}>
                    <td className="px-4 py-3 text-gray-800 font-semibold">{f.userName}</td>
                    <td className="px-4 py-3 text-gray-900 font-bold">${fmt(f.amount)}</td>
                    <td className="px-4 py-3 text-gray-500">{f.available_at ? fmtDate(f.available_at) : 'Pending Stripe confirmation'}</td>
                    <td className="px-4 py-3 text-gray-500">{f.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payout requests queue — moved from Verifications, unchanged */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h3 className="text-sm font-bold text-gray-900">Payout Requests</h3>
          <p className="text-xs text-gray-400 mt-0.5">No automated payout provider is configured yet — send funds manually (e-transfer, bank transfer) using the destination shown, then mark paid here.</p>
        </div>
        {payoutRequests.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No payout requests yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {payoutRequests.map((p) => {
              const dest = p.payout_destination || {};
              const destText = p.payout_method === 'interac'
                ? dest.email
                : p.payout_method === 'bank_transfer'
                  ? `${dest.accountHolder || ''} · inst ${dest.institutionNumber || '—'} · transit ${dest.transitNumber || '—'} · acct ${dest.accountNumber || '—'}`
                  : p.payout_method === 'card' || p.payout_method === 'bank'
                    ? `${dest.displayName || 'Stripe payout method'} •••• ${dest.last4 || '----'} (Stripe acct ${dest.stripeConnectAccountId || '—'})`
                    : null;
              const busy = processingPayoutId === p.id;
              return (
                <div key={p.id} className="px-5 py-3.5">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate flex items-center gap-1.5">
                        {p.profiles?.name || p.host_id}
                        <span className="text-[10px] font-mono text-gray-400">WD-{String(p.id).replace(/-/g, '').slice(0, 6).toUpperCase()}</span>
                        {p.payout_speed === 'instant' && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-0.5">⚡ Instant</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400">{fmtDate(p.requested_at)} · {p.profiles?.email || ''}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        FILMONS fee {fmt((Number(p.platform_fee_amount) || 0) + (p.payout_speed === 'instant' ? Number(p.fee_amount || 0) : 0))}
                        {' · '}Net payout ${fmt(Number(p.net_amount ?? p.amount))}
                      </p>
                      {p.payout_method && (
                        <p className="text-xs text-gray-500 mt-1 font-mono">
                          {p.payout_method === 'interac' ? 'Interac' : p.payout_method === 'card' ? 'Card (Stripe)' : p.payout_method === 'bank' ? 'Bank (Stripe)' : 'Bank Transfer'}: {destText || '—'}
                        </p>
                      )}
                      {p.status === 'rejected' && p.rejection_reason && (
                        <p className="text-xs text-red-500 mt-1">Rejected: {p.rejection_reason}</p>
                      )}
                      {p.status === 'paid' && p.payment_reference && (
                        <p className="text-xs text-green-600 mt-1">Ref: {p.payment_reference}</p>
                      )}
                    </div>
                    <span className="text-sm font-black text-gray-900 shrink-0">${fmt(Number(p.amount))}</span>
                    {['requested', 'under_review', 'approved', 'processing'].includes(p.status) ? (
                      <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                        {(p.status === 'requested' || p.status === 'under_review') && (
                          <button onClick={() => processPayoutSimple(p.id, 'approve')} disabled={busy}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50">
                            Approve
                          </button>
                        )}
                        {p.status === 'approved' && (
                          <button onClick={() => processPayoutSimple(p.id, 'mark_processing')} disabled={busy}
                            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold disabled:opacity-50">
                            Mark Processing
                          </button>
                        )}
                        {(p.status === 'approved' || p.status === 'processing') && (
                          <button onClick={() => setPayoutAction({ payout: p, action: 'paid' })} disabled={busy}
                            className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold disabled:opacity-50">
                            Mark as Completed
                          </button>
                        )}
                        {p.status === 'processing' && (
                          <button onClick={() => setPayoutAction({ payout: p, action: 'mark_failed' })} disabled={busy}
                            className="px-3 py-1.5 rounded-lg border border-red-200 text-red-500 text-xs font-bold disabled:opacity-50">
                            Mark Failed
                          </button>
                        )}
                        <button onClick={() => setPayoutAction({ payout: p, action: 'reject' })} disabled={busy}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-bold disabled:opacity-50">
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className={`text-xs font-bold uppercase shrink-0 ${p.status === 'paid' ? 'text-green-600' : 'text-red-500'}`}>
                        {p.status === 'paid' ? 'Completed' : p.status}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Refund requests queue — moved from Verifications, unchanged */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h3 className="text-sm font-bold text-gray-900">Refund Requests</h3>
          <p className="text-xs text-gray-400 mt-0.5">Approve calls Stripe's Refund API when the order has a captured payment (card), then reverses the ledger either way.</p>
        </div>
        {refundRequests.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No refund requests yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {refundRequests.map((r) => (
              <div key={r.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">Order {r.order_id}</p>
                  <p className="text-xs text-gray-400">{fmtDate(r.requested_at)}{r.reason ? ` · ${r.reason}` : ''}</p>
                </div>
                <span className="text-sm font-black text-gray-900 shrink-0">${fmt(Number(r.amount))}</span>
                {r.status === 'requested' || r.status === 'approved' ? (
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => processRefund(r.id, 'approve')} disabled={processingRefundId === r.id}
                      className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold disabled:opacity-50">
                      Approve &amp; Refund
                    </button>
                    <button onClick={() => processRefund(r.id, 'deny')} disabled={processingRefundId === r.id}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-bold disabled:opacity-50">
                      Deny
                    </button>
                  </div>
                ) : (
                  <span className={`text-xs font-bold uppercase shrink-0 ${r.status === 'processed' ? 'text-green-600' : 'text-red-500'}`}>{r.status}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Wallet Activity */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-gray-900">Wallet Activity</h3>
          <div className="flex gap-1 overflow-x-auto">
            {ACTIVITY_FILTERS.map(f => (
              <button key={f} onClick={() => setActivityFilter(f)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold capitalize whitespace-nowrap ${activityFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
        {filteredActivity.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No activity in this filter.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredActivity.map(a => {
              const isPayout = a.transaction_type === 'payout';
              const isRevenue = a.transaction_type === 'filmons_fee';
              const isRefund = a.transaction_type === 'refund';
              const isIncoming = INCOMING_TYPES.includes(a.transaction_type);
              return (
                <button key={a.id} onClick={() => a.order_id && navigate(`/transactions/${a.order_id}`)}
                  disabled={!a.order_id}
                  className={`w-full flex items-center gap-3 px-5 py-3 text-left ${a.order_id ? 'hover:bg-gray-50' : ''}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isIncoming ? 'bg-green-50' : isPayout ? 'bg-purple-50' : isRevenue ? 'bg-blue-50' : isRefund ? 'bg-red-50' : 'bg-gray-100'}`}>
                    {isIncoming ? <ArrowDownRight className="w-4 h-4 text-green-500" /> : isPayout ? <ArrowUpRight className="w-4 h-4 text-purple-500" /> : <DollarSign className={`w-4 h-4 ${isRevenue ? 'text-blue-500' : isRefund ? 'text-red-500' : 'text-gray-400'}`} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 capitalize truncate">{a.transaction_type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-gray-400">{a.description || fmtDate(a.created_at)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-black ${isPayout ? 'text-purple-600' : isIncoming ? 'text-green-600' : 'text-gray-900'}`}>
                      {isPayout ? '-' : '+'}${fmt(a.amount)}
                    </p>
                    <p className="text-[11px] text-gray-400 capitalize">{a.status}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* FILMONS Revenue */}
      <div>
        <h2 className="text-sm font-black text-gray-900 mb-3">FILMONS Revenue</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            ['Today', revenueToday], ['This Month', revenueMonth], ['This Year', revenueYear],
          ].map(([label, value]) => (
            <div key={label as string} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-400 font-medium">{label}</p>
              <p className="text-lg font-black text-gray-900 mt-0.5">${fmt(value as number)}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Platform fees only — creator earnings are never counted as FILMONS revenue.</p>
      </div>

      {/* Stripe reconciliation */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Payment Provider</h3>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Stripe · Connected</p>
          </div>
          <button onClick={reconcile} disabled={reconciling}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1.5">
            {reconciling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Reconcile
          </button>
        </div>
        {stripeBalance ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[11px] text-gray-400">Stripe Available</p>
                <p className="text-base font-black text-gray-900">${fmt(stripeBalance.available)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[11px] text-gray-400">Stripe Pending</p>
                <p className="text-base font-black text-gray-900">${fmt(stripeBalance.pending)}</p>
              </div>
            </div>
            <p className="text-[11px] text-gray-400">Last synchronized: {new Date(stripeBalance.fetchedAt).toLocaleTimeString('en-CA')}</p>
            {discrepancy && (
              <div className="mt-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-xs font-bold text-amber-700">Balance discrepancy detected — FILMONS's records don't match Stripe's live balance.</p>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-400">Tap Reconcile to fetch Stripe's live balance and compare against FILMONS's records.</p>
        )}
      </div>

      {/* Opportunity payments — read-only reporting; disputes/refunds
          reuse the Marketplace Transactions dispute toggle below since
          every Opportunity payment also creates a real orders row. */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h3 className="text-sm font-bold text-gray-900">Opportunity Payments</h3>
          <p className="text-xs text-gray-400 mt-0.5">50% releases immediately on funding, 50% holds until work is confirmed complete.</p>
        </div>
        {opportunityPayments.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No Opportunity payments yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-2.5 font-bold">Opportunity</th>
                  <th className="px-4 py-2.5 font-bold">Owner</th>
                  <th className="px-4 py-2.5 font-bold">Worker</th>
                  <th className="px-4 py-2.5 font-bold">Gross</th>
                  <th className="px-4 py-2.5 font-bold">Fee</th>
                  <th className="px-4 py-2.5 font-bold">Net</th>
                  <th className="px-4 py-2.5 font-bold">Available</th>
                  <th className="px-4 py-2.5 font-bold">Held</th>
                  <th className="px-4 py-2.5 font-bold">Payment</th>
                  <th className="px-4 py-2.5 font-bold">Work</th>
                  <th className="px-4 py-2.5 font-bold">Funded</th>
                </tr>
              </thead>
              <tbody>
                {opportunityPayments.map((p: any) => (
                  <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-semibold text-gray-900 whitespace-nowrap max-w-[160px] truncate">{p.listing_title || p.listing_id}</td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{p.owner_name || p.owner_id?.slice(0, 8)}</td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{p.worker_name || p.worker_id?.slice(0, 8)}</td>
                    <td className="px-4 py-2.5 text-gray-900 font-bold whitespace-nowrap">${fmt(Number(p.gross_amount))}</td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">${fmt(Number(p.fee_amount))}</td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">${fmt(Number(p.net_amount))}</td>
                    <td className="px-4 py-2.5 text-green-600 whitespace-nowrap">${fmt(Number(p.initial_release_amount || 0))}</td>
                    <td className="px-4 py-2.5 text-amber-600 whitespace-nowrap">${fmt(Number(p.held_amount || 0))}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 uppercase">{p.payment_status}</span></td>
                    <td className="px-4 py-2.5 whitespace-nowrap"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 uppercase">{p.work_status.replace(/_/g, ' ')}</span></td>
                    <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">{p.funded_at ? new Date(p.funded_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Hire From Portfolio payments — read-only reporting; same pattern as Opportunity Payments above. */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h3 className="text-sm font-bold text-gray-900">Hire Payments</h3>
          <p className="text-xs text-gray-400 mt-0.5">50% releases immediately on funding, 50% holds until work is confirmed complete.</p>
        </div>
        {hirePayments.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No Hire payments yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-2.5 font-bold">Project</th>
                  <th className="px-4 py-2.5 font-bold">Requester</th>
                  <th className="px-4 py-2.5 font-bold">Creator</th>
                  <th className="px-4 py-2.5 font-bold">Gross</th>
                  <th className="px-4 py-2.5 font-bold">Fee</th>
                  <th className="px-4 py-2.5 font-bold">Net</th>
                  <th className="px-4 py-2.5 font-bold">Available</th>
                  <th className="px-4 py-2.5 font-bold">Held</th>
                  <th className="px-4 py-2.5 font-bold">Payment</th>
                  <th className="px-4 py-2.5 font-bold">Work</th>
                  <th className="px-4 py-2.5 font-bold">Funded</th>
                </tr>
              </thead>
              <tbody>
                {hirePayments.map((p: any) => (
                  <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-semibold text-gray-900 whitespace-nowrap max-w-[160px] truncate">{p.project_title || p.hire_request_id}</td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{p.requester_name || p.requester_id?.slice(0, 8)}</td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{p.host_name || p.host_id?.slice(0, 8)}</td>
                    <td className="px-4 py-2.5 text-gray-900 font-bold whitespace-nowrap">${fmt(Number(p.gross_amount))}</td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">${fmt(Number(p.fee_amount))}</td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">${fmt(Number(p.net_amount))}</td>
                    <td className="px-4 py-2.5 text-green-600 whitespace-nowrap">${fmt(Number(p.initial_release_amount || 0))}</td>
                    <td className="px-4 py-2.5 text-amber-600 whitespace-nowrap">${fmt(Number(p.held_amount || 0))}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 uppercase">{p.payment_status}</span></td>
                    <td className="px-4 py-2.5 whitespace-nowrap"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 uppercase">{p.work_status.replace(/_/g, ' ')}</span></td>
                    <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">{p.funded_at ? new Date(p.funded_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Marketplace Transactions — moved from Verifications, unchanged */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Marketplace Transactions</h3>
          <div className="flex gap-1.5">
            {(['all', 'paid', 'pending'] as const).map(f => (
              <button key={f} onClick={() => setWalletFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${walletFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)} {f === 'all' ? `(${walletTxs.length})` : f === 'paid' ? `(${paidTxs.length})` : `(${pendingTxs.length})`}
              </button>
            ))}
          </div>
        </div>
        {filteredWallet.length === 0 ? (
          <div className="p-12 text-center">
            <DollarSign className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm font-medium">No transactions yet</p>
            <p className="text-gray-300 text-xs mt-1">Completed payments will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredWallet.map((tx) => (
              <div key={tx.id} onClick={() => navigate(`/transactions/${tx.id}`)} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 cursor-pointer">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tx.status === 'paid' ? 'bg-green-100' : 'bg-amber-100'}`}>
                  {tx.status === 'paid' ? <CheckCircle className="w-5 h-5 text-green-600" /> : <Clock className="w-5 h-5 text-amber-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{tx.title}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <p className="text-xs text-gray-400">{fmtDate(tx.date)}</p>
                    {tx.hostName && <p className="text-xs text-gray-400">from {tx.hostName}</p>}
                    {tx.renterName && <p className="text-xs text-gray-400">to {tx.renterName}</p>}
                    {tx.method && <p className="text-xs text-gray-400">· {tx.method}</p>}
                    {tx.disputeStatus === 'disputed' && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">Disputed</span>}
                    {tx.refundStatus !== 'none' && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600">{tx.refundStatus.replace('_', ' ')}</span>}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleDispute(tx.id, tx.disputeStatus); }}
                    disabled={disputeUpdatingOrderId === tx.id}
                    className="text-[10px] font-bold text-gray-400 hover:text-red-500 mt-1 disabled:opacity-50">
                    {tx.disputeStatus === 'disputed' ? 'Resolve dispute' : 'Mark disputed'}
                  </button>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-2 justify-end">
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 font-semibold">Total</p>
                      <p className="text-sm font-black text-gray-900">${fmt(tx.amount)}</p>
                    </div>
                    <div className="w-px h-8 bg-gray-100" />
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 font-semibold">FILMONS</p>
                      <p className={`text-sm font-black ${tx.status === 'paid' ? 'text-green-600' : 'text-amber-500'}`}>+${fmt(tx.platformFee)}</p>
                    </div>
                    <div className="w-px h-8 bg-gray-100" />
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 font-semibold">Creator</p>
                      <p className="text-sm font-black text-blue-600">${fmt(tx.creatorPayout)}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase mt-1 inline-block ${tx.status === 'paid' ? 'text-green-500' : 'text-amber-500'}`}>{tx.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payout action confirm modal — moved from Verifications, unchanged */}
      {payoutAction && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-1">
              {payoutAction.action === 'reject' ? 'Reject payout request'
                : payoutAction.action === 'mark_failed' ? 'Mark payout as failed'
                : 'Confirm payout'}
            </h3>
            <p className="text-xs text-gray-400 mb-4">${fmt(Number(payoutAction.payout.amount))} — {payoutAction.payout.profiles?.name || payoutAction.payout.host_id}</p>

            {payoutAction.action === 'paid' && (
              <div className="bg-green-50 border border-green-100 rounded-xl px-3 py-3 mb-3 space-y-1">
                <p className="text-xs text-green-800">
                  User will receive <span className="font-bold">${fmt(Number(payoutAction.payout.net_amount ?? payoutAction.payout.amount))} {payoutAction.payout.currency || 'CAD'}</span>
                </p>
                <p className="text-[11px] text-green-700">Estimated delivery: 1–2 business days</p>
              </div>
            )}

            <input
              type="text"
              value={payoutActionInput}
              onChange={(e) => setPayoutActionInput(e.target.value)}
              placeholder={
                payoutAction.action === 'reject' ? 'Rejection reason (required)'
                : payoutAction.action === 'mark_failed' ? 'Reason (optional)'
                : 'Payment reference (required)'
              }
              className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 mb-2"
            />
            {payoutAction.action === 'paid' && (
              <textarea
                value={payoutActionNotes}
                onChange={(e) => setPayoutActionNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={2}
                className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 mb-2"
              />
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setPayoutAction(null); setPayoutActionInput(''); setPayoutActionNotes(''); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={submitPayoutAction}
                disabled={processingPayoutId === payoutAction.payout.id}
                className={`flex-1 py-2.5 rounded-xl text-white text-xs font-bold disabled:opacity-50 ${payoutAction.action === 'reject' || payoutAction.action === 'mark_failed' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {payoutAction.action === 'reject' ? 'Reject' : payoutAction.action === 'mark_failed' ? 'Mark Failed' : 'Mark as Completed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
