import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import {
  walletApi, type WalletBalance, type WalletTransaction, type PayoutMethodType,
  type PayoutDestination, type PayoutMethod, type PayoutRequest,
} from '../lib/walletApi';
import {
  Wallet as WalletIcon, ArrowUpRight, RefreshCw, DollarSign, Clock, Loader2,
  X, ChevronRight, ChevronLeft, Check, Landmark, Send, Pencil,
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

const PAYOUT_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  requested:    { label: 'Requested',    className: 'bg-blue-100 text-blue-600' },
  under_review: { label: 'Under review', className: 'bg-blue-100 text-blue-600' },
  approved:     { label: 'Approved',     className: 'bg-indigo-100 text-indigo-600' },
  processing:   { label: 'Processing',   className: 'bg-amber-100 text-amber-600' },
  paid:         { label: 'Paid',         className: 'bg-green-100 text-green-600' },
  rejected:     { label: 'Rejected',     className: 'bg-red-100 text-red-600' },
  cancelled:    { label: 'Cancelled',    className: 'bg-gray-100 text-gray-500' },
};

const METHOD_LABEL: Record<PayoutMethodType, string> = {
  interac: 'Interac e-Transfer',
  bank_transfer: 'Bank Transfer',
};

type Step = 'amount' | 'method' | 'destination' | 'review';

function RequestPayoutModal({
  available, currency, defaultMethod, onClose, onDone,
}: {
  available: number;
  currency: string;
  defaultMethod: PayoutMethod | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>('amount');
  const [amount, setAmount] = useState(String(available.toFixed(2)));
  const [method, setMethod] = useState<PayoutMethodType | null>(defaultMethod?.method || null);
  const [useSaved, setUseSaved] = useState(!!defaultMethod);
  const [interac, setInterac] = useState({ email: '', name: '' });
  const [bank, setBank] = useState({ accountHolder: '', institutionNumber: '', transitNumber: '', accountNumber: '' });
  const [saveMethod, setSaveMethod] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const amountNum = Number(amount);
  const amountValid = !isNaN(amountNum) && amountNum > 0 && amountNum <= available;

  const destination: PayoutDestination | null = !method ? null
    : method === 'interac'
      ? (useSaved && defaultMethod?.method === 'interac' ? (defaultMethod.details as any) : interac)
      : (useSaved && defaultMethod?.method === 'bank_transfer' ? (defaultMethod.details as any) : bank);

  const destinationValid = method === 'interac'
    ? !!(destination as any)?.email
    : method === 'bank_transfer'
      ? !!(destination as any)?.accountHolder && !!(destination as any)?.institutionNumber && !!(destination as any)?.transitNumber && !!(destination as any)?.accountNumber
      : false;

  const handleConfirm = async (hostId: string) => {
    if (!method || !destination) return;
    setSubmitting(true);
    const { success, error } = await walletApi.requestPayout(hostId, amountNum, method, destination);
    if (success) {
      if (saveMethod && !(useSaved && defaultMethod)) {
        await walletApi.savePayoutMethod(hostId, method, destination);
      }
      toast.success(`Payout of ${fmtCad(amountNum)} requested — an admin will review it shortly.`);
      onDone();
    } else {
      toast.error(error || 'Could not request payout.');
    }
    setSubmitting(false);
  };

  return (
    <PayoutModalInner
      step={step} setStep={setStep}
      amount={amount} setAmount={setAmount} amountValid={amountValid} available={available} currency={currency}
      method={method} setMethod={setMethod}
      defaultMethod={defaultMethod} useSaved={useSaved} setUseSaved={setUseSaved}
      interac={interac} setInterac={setInterac} bank={bank} setBank={setBank}
      destination={destination} destinationValid={destinationValid}
      saveMethod={saveMethod} setSaveMethod={setSaveMethod}
      submitting={submitting} onConfirm={handleConfirm} onClose={onClose}
    />
  );
}

// Split out so the parent can own the async submit (needs user.id) while
// this piece stays purely presentational/step-navigation.
function PayoutModalInner(props: {
  step: Step; setStep: (s: Step) => void;
  amount: string; setAmount: (v: string) => void; amountValid: boolean; available: number; currency: string;
  method: PayoutMethodType | null; setMethod: (m: PayoutMethodType) => void;
  defaultMethod: PayoutMethod | null; useSaved: boolean; setUseSaved: (v: boolean) => void;
  interac: { email: string; name: string }; setInterac: (v: any) => void;
  bank: { accountHolder: string; institutionNumber: string; transitNumber: string; accountNumber: string }; setBank: (v: any) => void;
  destination: PayoutDestination | null; destinationValid: boolean;
  saveMethod: boolean; setSaveMethod: (v: boolean) => void;
  submitting: boolean; onConfirm: (hostId: string) => void; onClose: () => void;
}) {
  const { user } = useAuth();
  const {
    step, setStep, amount, setAmount, amountValid, available, currency,
    method, setMethod, defaultMethod, useSaved, setUseSaved,
    interac, setInterac, bank, setBank, destination, destinationValid,
    saveMethod, setSaveMethod, submitting, onConfirm, onClose,
  } = props;

  const steps: Step[] = ['amount', 'method', 'destination', 'review'];
  const stepIdx = steps.indexOf(step);
  const goNext = () => {
    if (step === 'destination' && useSaved && defaultMethod) { setStep('review'); return; }
    const next = steps[stepIdx + 1];
    if (next) setStep(next);
  };
  const goBack = () => { const prev = steps[stepIdx - 1]; if (prev) setStep(prev); else onClose(); };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <button onClick={goBack} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </button>
          <p className="text-sm font-black text-gray-900">Request Payout</p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {step === 'amount' && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Amount to withdraw</p>
              <div className="flex items-center gap-2 border-2 border-gray-100 rounded-2xl px-4 py-3 focus-within:border-blue-400">
                <span className="text-lg font-black text-gray-400">$</span>
                <input
                  type="number" value={amount} onChange={e => setAmount(e.target.value)}
                  className="flex-1 text-lg font-black text-gray-900 outline-none" placeholder="0.00"
                />
                <span className="text-xs font-bold text-gray-400">{currency}</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-gray-400">Available: {fmtCad(available)}</p>
                <button onClick={() => setAmount(available.toFixed(2))} className="text-xs font-bold text-blue-600">Max</button>
              </div>
              {!amountValid && amount !== '' && (
                <p className="text-xs text-red-500 mt-2">Enter an amount between $0.01 and {fmtCad(available)}.</p>
              )}
            </div>
          )}

          {step === 'method' && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Payout method</p>
              {(['interac', 'bank_transfer'] as PayoutMethodType[]).map(m => (
                <button
                  key={m} onClick={() => setMethod(m)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-colors ${method === m ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}
                >
                  {m === 'interac' ? <Send className="w-4 h-4 text-blue-500" /> : <Landmark className="w-4 h-4 text-blue-500" />}
                  <span className="text-sm font-bold text-gray-900 flex-1 text-left">{METHOD_LABEL[m]}</span>
                  {method === m && <Check className="w-4 h-4 text-blue-500" />}
                </button>
              ))}
              {defaultMethod && (
                <label className="flex items-center gap-2 mt-3 px-1">
                  <input type="checkbox" checked={useSaved} onChange={e => setUseSaved(e.target.checked)} className="w-4 h-4" />
                  <span className="text-xs text-gray-500">Use my saved {METHOD_LABEL[defaultMethod.method]} details</span>
                </label>
              )}
            </div>
          )}

          {step === 'destination' && method && !(useSaved && defaultMethod) && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Send to</p>
              {method === 'interac' ? (
                <>
                  <input
                    type="email" placeholder="Interac email address" value={interac.email}
                    onChange={e => setInterac({ ...interac, email: e.target.value })}
                    className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400"
                  />
                  <input
                    type="text" placeholder="Recipient name (optional)" value={interac.name}
                    onChange={e => setInterac({ ...interac, name: e.target.value })}
                    className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400"
                  />
                </>
              ) : (
                <>
                  <input
                    type="text" placeholder="Account holder name" value={bank.accountHolder}
                    onChange={e => setBank({ ...bank, accountHolder: e.target.value })}
                    className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400"
                  />
                  <input
                    type="text" placeholder="Institution number" value={bank.institutionNumber}
                    onChange={e => setBank({ ...bank, institutionNumber: e.target.value })}
                    className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400"
                  />
                  <input
                    type="text" placeholder="Transit number" value={bank.transitNumber}
                    onChange={e => setBank({ ...bank, transitNumber: e.target.value })}
                    className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400"
                  />
                  <input
                    type="text" placeholder="Account number" value={bank.accountNumber}
                    onChange={e => setBank({ ...bank, accountNumber: e.target.value })}
                    className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400"
                  />
                </>
              )}
              <label className="flex items-center gap-2 px-1">
                <input type="checkbox" checked={saveMethod} onChange={e => setSaveMethod(e.target.checked)} className="w-4 h-4" />
                <span className="text-xs text-gray-500">Save these details for next time</span>
              </label>
            </div>
          )}

          {step === 'review' && method && destination && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Review request</p>
              <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Amount</span>
                  <span className="text-sm font-black text-gray-900">{fmtCad(Number(amount))}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Method</span>
                  <span className="text-sm font-bold text-gray-900">{METHOD_LABEL[method]}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Sending to</span>
                  <span className="text-sm font-bold text-gray-900">{walletApi.maskDestination(method, destination)}</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                This reserves the funds immediately. An admin manually reviews and sends every payout — this is not an automated transfer, so it may take a few business days.
              </p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100">
          {step !== 'review' ? (
            <button
              onClick={goNext}
              disabled={
                (step === 'amount' && !amountValid) ||
                (step === 'method' && !method) ||
                (step === 'destination' && !(useSaved && defaultMethod) && !destinationValid)
              }
              className="w-full py-3.5 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => user?.id && onConfirm(user.id)}
              disabled={submitting}
              className="w-full py-3.5 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Request'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Payments & Earnings — real Host Wallet backed by wallets/wallet_transactions
 * (see supabase/migrations/20240216000000_wallet_ledger.sql and
 * 20240218000000_refunds_disputes.sql). Pending earnings from a rental
 * release to Available ~48h after the rental end date; only Available
 * funds can be requested for payout, and every payout is manually
 * reviewed and sent by an admin — there's no automated payout provider.
 */
export function Wallet() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [balance, setBalance] = useState<WalletBalance>({ pending: 0, available: 0, currency: 'CAD' });
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [defaultMethod, setDefaultMethod] = useState<PayoutMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const refresh = async () => {
    if (!user?.id) return;
    setLoading(true);
    const [b, t, p, m] = await Promise.all([
      walletApi.getBalance(user.id),
      walletApi.getTransactions(user.id),
      walletApi.getPayoutRequests(user.id),
      walletApi.getDefaultPayoutMethod(user.id),
    ]);
    setBalance(b);
    setTxs(t);
    setPayouts(p);
    setDefaultMethod(m);
    setLoading(false);
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
              onClick={() => setShowModal(true)}
              disabled={balance.available <= 0}
              className="w-full mt-4 py-3 bg-white text-blue-700 font-black text-sm rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              Request Payout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Preferred payout method */}
        {defaultMethod && (
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Preferred payout method</p>
            <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                {defaultMethod.method === 'interac' ? <Send className="w-4 h-4 text-blue-500" /> : <Landmark className="w-4 h-4 text-blue-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">{METHOD_LABEL[defaultMethod.method]}</p>
                <p className="text-xs text-gray-400">{walletApi.maskDestination(defaultMethod.method, defaultMethod.details)}</p>
              </div>
              <button onClick={() => setShowModal(true)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
                <Pencil className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          </div>
        )}

        {/* Payout requests */}
        {payouts.length > 0 && (
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Payout requests</p>
            <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
              {payouts.map(p => {
                const s = PAYOUT_STATUS_LABEL[p.status] || PAYOUT_STATUS_LABEL.requested;
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{fmtCad(Number(p.amount))}</p>
                      <p className="text-xs text-gray-400">{new Date(p.requested_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      {p.status === 'rejected' && p.rejection_reason && (
                        <p className="text-xs text-red-500 mt-0.5">{p.rejection_reason}</p>
                      )}
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full shrink-0 ${s.className}`}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Transaction history */}
        <div>
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

      {showModal && (
        <RequestPayoutModal
          available={balance.available}
          currency={balance.currency}
          defaultMethod={defaultMethod}
          onClose={() => setShowModal(false)}
          onDone={() => { setShowModal(false); refresh(); }}
        />
      )}
    </div>
  );
}
