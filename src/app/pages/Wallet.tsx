import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { cadWalletApi, type CadTransaction } from '../lib/fpSystem';
import {
  Wallet as WalletIcon, ArrowUpRight, RefreshCw, DollarSign,
} from 'lucide-react';

const fmtCad = (cad: number) =>
  `$${cad.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Payments & Earnings — real-money (CAD) balance from marketplace sales.
 * Replaces the old FP-based wallet; this page only ever deals in CAD.
 */
export function Wallet() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [balance, setBalance] = useState(0);
  const [txs, setTxs] = useState<CadTransaction[]>([]);

  const refresh = () => {
    if (!user?.id) return;
    setBalance(cadWalletApi.getBalance(user.id));
    setTxs(cadWalletApi.getTransactions(user.id));
  };

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login', { replace: true }); return; }
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener('filmons:wallet:updated', onUpdate);
    return () => window.removeEventListener('filmons:wallet:updated', onUpdate);
  }, [isAuthenticated, user?.id]); // eslint-disable-line

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
              <RefreshCw className="w-4 h-4 text-white/80" />
            </button>
          </div>

          {/* Balance */}
          <div className="bg-white/10 backdrop-blur rounded-3xl p-6">
            <div className="flex items-center justify-between mb-1">
              <p className="text-blue-200 text-xs font-bold uppercase tracking-widest">Balance</p>
              <span className="text-[10px] text-blue-300 bg-white/10 px-2 py-0.5 rounded-full font-semibold">From payments</span>
            </div>
            <div className="flex items-end gap-3">
              <span className="text-5xl font-black leading-none">{fmtCad(balance)}</span>
              <span className="text-blue-300 text-base font-bold mb-1">CAD</span>
            </div>
            <p className="text-blue-300 text-sm mt-2">Earnings from completed marketplace sales appear here automatically.</p>
          </div>
        </div>
      </div>

      {/* Transaction history */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Transaction history</p>
        {txs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-16 px-6 text-center">
            <DollarSign className="w-8 h-8 text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-bold text-gray-900 mb-1">No transactions yet</p>
            <p className="text-xs text-gray-400">Payments you receive from marketplace sales will show up here.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
            {txs.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                  <ArrowUpRight className="w-4 h-4 text-green-500 -rotate-45" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{tx.description}</p>
                  <p className="text-xs text-gray-400">{new Date(tx.createdAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                </div>
                <span className="text-sm font-black text-green-600 shrink-0">+{fmtCad(tx.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
