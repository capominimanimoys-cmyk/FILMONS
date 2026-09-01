// FILMONS Admin — single transaction (order) detail. The status
// timeline only shows steps with a real backing column/timestamp --
// confirmed before building this that "Payment initiated" has no data
// anywhere (orders rows are only ever created after payment already
// succeeded) and "Payout completed" has no reliable per-transaction
// link to a specific payout_requests row, so neither is faked here.
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, CheckCircle, Clock, PackageCheck, RotateCcw, AlertTriangle, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Order {
  id: string; type: string; listing_title: string | null;
  total_amount: number; subtotal: number; buyer_fee_amount: number; seller_fee_amount: number;
  host_id: string | null; host_name: string | null; renter_id: string | null; renter_name: string | null;
  payment_method: string | null; currency: string | null;
  paid_at: string; refund_status: string; refunded_at: string | null;
  dispute_status: string; disputed_at: string | null;
  stripe_payment_intent_id: string | null; stripe_charge_id: string | null; stripe_balance_transaction_id: string | null;
}
interface WalletTx { id: string; status: string; balance_type: string; available_at: string | null; completed_at: string | null; amount: number; }

const TYPE_LABEL: Record<string, string> = { rental: 'Rental', service: 'Service', sale: 'Sale', opportunity: 'Opportunity', hire: 'Hire' };
const money = (n: number, c = 'CAD') => `$${Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
const maskRef = (id: string | null) => id ? `${id.slice(0, 3)}_••••••${id.slice(-4)}` : '—';

export function AdminTransactionDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [walletTxs, setWalletTxs] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    supabase.from('orders').select('*').eq('id', orderId).maybeSingle()
      .then(async ({ data }) => {
        setOrder(data);
        if (data) {
          // wallet_transactions.order_id doesn't reliably match orders.id
          // for the rental/service/sale Stripe path (that webhook writes
          // the Stripe Checkout session id there instead) -- matching on
          // either order_id OR the real Stripe payment_intent id covers
          // both that case and opportunity/hire (where order_id IS
          // reliable).
          const orConditions = [`order_id.eq.${orderId}`];
          if (data.stripe_payment_intent_id) orConditions.push(`stripe_payment_intent_id.eq.${data.stripe_payment_intent_id}`);
          const { data: txs } = await supabase.from('wallet_transactions')
            .select('id, status, balance_type, available_at, completed_at, amount')
            .or(orConditions.join(','));
          setWalletTxs(txs || []);
        }
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [orderId]);

  if (loading) return <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>;
  if (!order) return <div className="h-full flex items-center justify-center text-sm text-gray-400">Transaction not found.</div>;

  const creatorPayout = Number(order.subtotal || 0) - Number(order.seller_fee_amount || 0);
  const earningTx = walletTxs.find(t => t.balance_type === 'pending' || t.balance_type === 'available');
  const isAvailable = earningTx ? earningTx.status === 'available' || earningTx.status === 'collected' || earningTx.status === 'paid_out' : false;

  const timeline = [
    { label: 'Payment successful', at: order.paid_at, done: true },
    ...(earningTx ? [
      { label: 'Funds pending', at: earningTx.completed_at || null, done: true },
      { label: 'Funds available', at: isAvailable ? (earningTx.completed_at || earningTx.available_at) : earningTx.available_at, done: isAvailable, future: !isAvailable },
    ] : []),
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <button onClick={() => navigate('/transactions')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="w-4 h-4" /> Transactions
      </button>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="font-mono text-sm text-gray-400">{order.id}</p>
          {order.dispute_status === 'disputed' ? <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-600">Disputed</span>
            : order.refund_status === 'refunded' || order.refund_status === 'partially_refunded' ? <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600">Refunded</span>
            : <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-700">Paid</span>}
        </div>
        <p className="text-2xl font-black text-gray-900">{money(order.total_amount, order.currency || 'CAD')}</p>
        <p className="text-sm text-gray-500">{order.listing_title || 'Untitled'} · {TYPE_LABEL[order.type] || order.type}</p>
        <p className="text-xs text-gray-400 mt-1">{fmtDateTime(order.paid_at)}</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-2.5">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Payment</p>
        {[
          ['Customer paid', money(order.total_amount, order.currency || 'CAD')],
          ['FILMONS fee', money(Number(order.buyer_fee_amount || 0) + Number(order.seller_fee_amount || 0), order.currency || 'CAD')],
          ['Creator earnings', money(creatorPayout, order.currency || 'CAD')],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between text-sm"><span className="text-gray-400">{label}</span><span className="font-semibold text-gray-800">{value}</span></div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-2.5">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Parties</p>
        <div className="flex justify-between text-sm"><span className="text-gray-400">Customer</span><span className="font-semibold text-gray-800">{order.renter_name || '—'}</span></div>
        <div className="flex justify-between text-sm"><span className="text-gray-400">Recipient</span><span className="font-semibold text-gray-800">{order.host_name || '—'}</span></div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Status Timeline</p>
        <div className="space-y-3">
          {timeline.map((t, i) => (
            <div key={i} className="flex items-start gap-2.5">
              {t.done ? <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" /> : <Clock className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />}
              <div>
                <p className={`text-sm font-semibold ${t.done ? 'text-gray-800' : 'text-gray-400'}`}>{t.label}</p>
                {t.at && <p className="text-xs text-gray-400">{(t as any).future ? `Available ${fmtDateTime(t.at)}` : fmtDateTime(t.at)}</p>}
              </div>
            </div>
          ))}
          {order.refunded_at && (
            <div className="flex items-start gap-2.5"><RotateCcw className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" /><div><p className="text-sm font-semibold text-gray-800">Refunded</p><p className="text-xs text-gray-400">{fmtDateTime(order.refunded_at)}</p></div></div>
          )}
          {order.disputed_at && (
            <div className="flex items-start gap-2.5"><AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" /><div><p className="text-sm font-semibold text-gray-800">Disputed</p><p className="text-xs text-gray-400">{fmtDateTime(order.disputed_at)}</p></div></div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-2.5">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1.5"><PackageCheck className="w-3.5 h-3.5" /> Stripe</p>
        {[
          ['Payment Intent', maskRef(order.stripe_payment_intent_id)],
          ['Charge', maskRef(order.stripe_charge_id)],
          ['Balance Transaction', maskRef(order.stripe_balance_transaction_id)],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between text-sm font-mono"><span className="text-gray-400 font-sans">{label}</span><span className="text-gray-600">{value}</span></div>
        ))}
      </div>

      <div className="flex gap-2">
        {order.host_id && (
          <button onClick={() => navigate(`/users/${order.host_id}`)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5">
            View User <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
