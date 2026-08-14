import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { walletApi, type WalletBalance, type WalletTransaction } from '../lib/walletApi';
import {
  Wallet as WalletIcon, ArrowUpRight, RefreshCw, DollarSign, Clock, Loader2,
} from 'lucide-react';

const fmtCad = (cad: number) =>
  `$${cad.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TX_LABELS: Record<string, string> = {
  rental_earning: 'Rental earning',
  service_earning: 'Service earning',
  sale_earning: 'Sale earning',
  filmons_fee: 'Filmons Fee',
  refund: 'Refund',
  payout: 'Payout',
  adjustment: 'Adjustment',
  reversal: 'Reversal',
};

/**
 * Payments & Earnings — real Host Wallet backed by wallets/wallet_transactions
 * (see supabase/migrations/20240216000000_wallet_ledger.sql). Pending
 * earnings from a rental release to Available ~48h after the rental end
 * date; only Available funds can be requested for payout.
 */
export function Wallet() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [balance, setBalance] = useState<WalletBalance>({ pending: 0, available: 0, currency: 'CAD' });
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  const refresh = async () => {
    if (!user?.id) return;
    setLoading(true);
    const [b, t] = await Promise.all([walletApi.getBalance(user.id), walletApi.getTransactions(user.id)]);
    setBalance(b);
    setTxs(t);
    setLoading(false);
  };

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login', { replace: true }); return; }
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener('filmons:wallet:updated', onUpdate);
    return () => window.removeEventListener('filmons:wallet:updated', onUpdate);
  }, [isAuthenticated, user?.id]); // eslint-disable-line

  const handlePayout = async () => {
    if (!user?.id || balance.available <= 0 || requesting) return;
    setRequesting(true);
    const { success, error } = await walletApi.requestPayout(user.id, balance.available);
    if (success) {
      toast.success(`Payout of ${fmtCad(balance.available)} requested — we'll process it shortly.`);
    } else {
      toast.error(error || 'Could not request payout.');
    }
    setRequesting(false);
  };

  if (!isAuthenticated || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white">
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                <WalletIcon className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-lg font-black">Payments &amp; Earnings</h1>
            </div>
            <button onClick={refresh} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
              <RefreshCw className={`w-4 h-4 text-white/80 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Balance */}
          <div className="bg-white/10 backdrop-blur rounded-3xl p-6">
            <div className="flex items-center justify-between mb-1">
              <p className="text-blue-200 text-xs font-bold uppercase tracking-widest">Available</p>
              <span className="text-[10px] text-blue-300 bg-white/10 px-2 py-0.5 rounded-full font-semibold">{balance.currency}</span>
            </div>
            <div className="flex items-end gap-3">
              <span className="text-5xl font-black leading-none">{fmtCad(balance.available)}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-3 text-blue-200 text-sm">
              <Clock className="w-3.5 h-3.5" />
              <span>{fmtCad(balance.pending)} pending — releases ~48h after each rental ends</span>
            </div>
            <button
              onClick={handlePayout}
              disabled={balance.available <= 0 || requesting}
              className="w-full mt-4 py-3 bg-white text-blue-700 font-black text-sm rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : `Payout ${fmtCad(balance.available)}`}
            </button>
          </div>
        </div>
      </div>

      {/* Transaction history */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Transaction history</p>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-blue-400 animate-spin" /></div>
        ) : txs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-16 px-6 text-center">
            <DollarSign className="w-8 h-8 text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-bold text-gray-900 mb-1">No transactions yet</p>
            <p className="text-xs text-gray-400">Earnings from completed marketplace sales will show up here.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
            {txs.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tx.status === 'pending' ? 'bg-amber-50' : 'bg-green-50'}`}>
                  <ArrowUpRight className={`w-4 h-4 -rotate-45 ${tx.status === 'pending' ? 'text-amber-500' : 'text-green-500'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{tx.description || TX_LABELS[tx.transaction_type] || tx.transaction_type}</p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-gray-400">{new Date(tx.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${tx.status === 'pending' ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
                      {tx.status === 'pending' ? 'Pending' : 'Available'}
                    </span>
                  </div>
                </div>
                <span className={`text-sm font-black shrink-0 ${tx.status === 'pending' ? 'text-amber-600' : 'text-green-600'}`}>+{fmtCad(tx.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
