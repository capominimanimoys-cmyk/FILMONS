import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import {
  walletApi, type WalletBalance, type WalletTransaction, type PayoutMethodType,
  type PayoutDestination, type PayoutMethod, type PayoutRequest, type PayoutSpeed,
} from '../lib/walletApi';
import {
  Wallet as WalletIcon, ArrowUpRight, RefreshCw, DollarSign, Clock, Loader2,
  X, ChevronRight, ChevronLeft, Check, Landmark, Pencil, Zap, ShieldCheck,
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
  boost_purchase: 'Boost purchase',
  instant_payout_fee: 'Instant Payout fee',
  opportunity_earning: 'Opportunity earning',
  hire_earning: 'Hire earning',
};

const PAYOUT_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  requested:    { label: 'Pending',      className: 'bg-blue-100 text-blue-600' },
  under_review: { label: 'Under review', className: 'bg-blue-100 text-blue-600' },
  approved:     { label: 'Approved',     className: 'bg-indigo-100 text-indigo-600' },
  processing:   { label: 'Processing',   className: 'bg-amber-100 text-amber-600' },
  sent:         { label: 'Payout sent',  className: 'bg-blue-100 text-blue-600' },
  paid:         { label: 'Paid',         className: 'bg-green-100 text-green-600' },
  rejected:     { label: 'Rejected',     className: 'bg-red-100 text-red-600' },
  cancelled:    { label: 'Cancelled',    className: 'bg-gray-100 text-gray-500' },
  failed:       { label: 'Failed',       className: 'bg-red-100 text-red-600' },
};

const METHOD_LABEL: Record<PayoutMethodType, string> = {
  interac: 'Interac e-Transfer',
  bank_transfer: 'Bank Transfer',
  card: 'Debit Card',
  bank: 'Bank Transfer',
};

type Step = 'amount' | 'speed' | 'review' | 'success';

interface PayoutResult {
  amount: number; payoutSpeed: PayoutSpeed; feeAmount: number; netAmount: number;
  platformFeeAmount: number;
  estimatedArrivalAt: string; method: PayoutMethodType; destination: PayoutDestination;
  payoutCurrency?: string | null; payoutAmount?: number | null;
}

function estimatedArrivalLabel(speed: PayoutSpeed, iso: string): string {
  if (speed === 'instant') return 'Usually processed the same day';
  return new Date(iso).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
}

// Client-side preview only for the Review step, before the request is
// actually submitted — the server (request-payout) independently computes
// and stores the authoritative value; this is purely informational, same
// spirit as every other frontend-estimate in this app.
function previewArrivalIso(speed: PayoutSpeed): string {
  if (speed === 'instant') return new Date().toISOString();
  const d = new Date();
  let added = 0;
  while (added < 2) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toISOString();
}

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
  const [speed, setSpeed] = useState<PayoutSpeed>('standard');
  const [instantFeeRate, setInstantFeeRate] = useState(0.02);
  const [withdrawalFeeRate, setWithdrawalFeeRate] = useState(0.08);
  const [result, setResult] = useState<PayoutResult | null>(null);
  useEffect(() => {
    walletApi.getPayoutConfig().then(c => { setInstantFeeRate(c.instantFeeRate); setWithdrawalFeeRate(c.withdrawalFeeRate); });
  }, []);
  const [submitting, setSubmitting] = useState(false);

  const amountNum = Number(amount);
  const amountValid = !isNaN(amountNum) && amountNum > 0 && amountNum <= available;

  // The only source of a payout destination is now the saved default method
  // (set up via /wallet/payout-method) — no more typing raw bank/Interac
  // details inline here. Stripe-backed methods never have raw `details`;
  // pass through the same safe display fields already shown to the host.
  const method = defaultMethod?.method || null;
  const destination: PayoutDestination | null = !defaultMethod ? null
    : defaultMethod.provider === 'stripe'
      ? ({ displayName: defaultMethod.display_name, last4: defaultMethod.last4, stripeConnectAccountId: defaultMethod.stripe_connect_account_id } as any)
      : defaultMethod.details;

  const handleConfirm = async (hostId: string) => {
    if (!method || !destination) return;
    setSubmitting(true);
    const res = await walletApi.requestPayout(hostId, amountNum, method, destination, speed);
    if (res.success) {
      setResult({
        amount: amountNum, payoutSpeed: res.payoutSpeed || speed,
        feeAmount: res.feeAmount || 0, netAmount: res.netAmount ?? amountNum,
        platformFeeAmount: res.platformFeeAmount || 0,
        estimatedArrivalAt: res.estimatedArrivalAt || new Date().toISOString(),
        method, destination,
        payoutCurrency: res.payoutCurrency, payoutAmount: res.payoutAmount,
      });
      setStep('success');
    } else {
      toast.error(res.error || 'Could not request payout.');
    }
    setSubmitting(false);
  };

  return (
    <PayoutModalInner
      step={step} setStep={setStep}
      amount={amount} setAmount={setAmount} amountValid={amountValid} available={available} currency={currency}
      speed={speed} setSpeed={setSpeed} instantFeeRate={instantFeeRate} withdrawalFeeRate={withdrawalFeeRate}
      defaultMethod={defaultMethod} method={method} destination={destination}
      submitting={submitting} result={result} onConfirm={handleConfirm} onClose={onClose} onDone={onDone}
    />
  );
}

// Split out so the parent can own the async submit (needs user.id) while
// this piece stays purely presentational/step-navigation.
function PayoutModalInner(props: {
  step: Step; setStep: (s: Step) => void;
  amount: string; setAmount: (v: string) => void; amountValid: boolean; available: number; currency: string;
  speed: PayoutSpeed; setSpeed: (s: PayoutSpeed) => void; instantFeeRate: number; withdrawalFeeRate: number;
  defaultMethod: PayoutMethod | null; method: PayoutMethodType | null;
  destination: PayoutDestination | null;
  submitting: boolean; result: PayoutResult | null; onConfirm: (hostId: string) => void; onClose: () => void; onDone: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    step, setStep, amount, setAmount, amountValid, available, currency,
    speed, setSpeed, instantFeeRate, withdrawalFeeRate,
    defaultMethod, method, destination,
    submitting, result, onConfirm, onClose, onDone,
  } = props;

  const amountNum = Number(amount) || 0;
  const instantFee = Math.round((amountNum * instantFeeRate + Number.EPSILON) * 100) / 100;
  const platformFee = Math.round((amountNum * withdrawalFeeRate + Number.EPSILON) * 100) / 100;
  // FILMONS fee always applies; the instant-speed fee stacks on top only when selected.
  const totalFee = platformFee + (speed === 'instant' ? instantFee : 0);

  // Automated Stripe bank payouts have no "instant" tier (that requires a
  // debit-card destination, which this app's Stripe Custom-account setup
  // doesn't collect) and are always $0 fee -- skip the speed step entirely
  // for that provider rather than showing a choice that doesn't apply.
  const isStripe = defaultMethod?.provider === 'stripe';
  const destCurrency = defaultMethod?.currency && defaultMethod.currency !== 'CAD' ? defaultMethod.currency : null;

  // Display-only estimate for a cross-currency payout (e.g. a US bank
  // account) -- never the value actually used to move money. The edge
  // function fetches its own rate at execution time and applies a safety
  // margin, so the real converted amount (shown on the success screen) can
  // differ slightly from this preview.
  const [fxRate, setFxRate] = useState<number | null>(null);
  useEffect(() => {
    if (!destCurrency) { setFxRate(null); return; }
    walletApi.getIndicativeFxRate('CAD', destCurrency).then(setFxRate);
  }, [destCurrency]);

  const steps: Step[] = isStripe ? ['amount', 'review'] : ['amount', 'speed', 'review'];
  const stepIdx = steps.indexOf(step);
  const goNext = () => {
    const next = steps[stepIdx + 1];
    if (next) setStep(next);
  };
  const goBack = () => { const prev = steps[stepIdx - 1]; if (prev) setStep(prev); else onClose(); };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md lg:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          {step !== 'success' ? (
            <button onClick={goBack} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
              <ChevronLeft className="w-4 h-4 text-gray-500" />
            </button>
          ) : <div className="w-8 h-8" />}
          <p className="text-sm font-black text-gray-900">{step === 'success' ? 'Payout Initiated' : 'Request Payout'}</p>
          <button onClick={step === 'success' ? onDone : onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
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

          {step === 'speed' && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Choose payout speed</p>
              <button onClick={() => setSpeed('standard')}
                className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 transition-colors ${speed === 'standard' ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-gray-900 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-blue-500" /> Standard</span>
                  {speed === 'standard' && <Check className="w-4 h-4 text-blue-500" />}
                </div>
                <p className="text-xs text-gray-400 mt-1">Typically 1–2 business days after approval · FILMONS fee {(withdrawalFeeRate * 100).toFixed(0)}%</p>
                <p className="text-sm font-bold text-gray-900 mt-1.5">You'll receive {fmtCad(Math.max(amountNum - platformFee, 0))}</p>
              </button>
              <button onClick={() => setSpeed('instant')}
                className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 transition-colors ${speed === 'instant' ? 'border-amber-500 bg-amber-50' : 'border-gray-100'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-gray-900 flex items-center gap-1.5"><Zap className="w-4 h-4 text-amber-500 fill-amber-500" /> Instant</span>
                  {speed === 'instant' && <Check className="w-4 h-4 text-amber-500" />}
                </div>
                <p className="text-xs text-gray-400 mt-1">Usually processed the same day · FILMONS fee {(withdrawalFeeRate * 100).toFixed(0)}% + {(instantFeeRate * 100).toFixed(0)}% instant fee</p>
                <p className="text-sm font-bold text-gray-900 mt-1.5">You'll receive {fmtCad(Math.max(amountNum - platformFee - instantFee, 0))}</p>
              </button>
              <p className="text-[11px] text-gray-400 leading-relaxed px-1">
                Every payout is still reviewed and sent by a Filmons admin — Instant means priority processing, not an automated transfer.
              </p>
            </div>
          )}

          {step === 'review' && !defaultMethod && (
            <div className="flex flex-col items-center text-center gap-3 py-6">
              <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center"><Landmark className="w-6 h-6 text-blue-500" /></div>
              <div>
                <p className="text-sm font-black text-gray-900">Set up a payout method</p>
                <p className="text-xs text-gray-400 mt-1">You'll need a payout method on file before requesting a payout.</p>
              </div>
              <button
                onClick={() => { onClose(); navigate('/wallet/payout-method'); }}
                className="w-full py-3 bg-blue-600 text-white font-black text-sm rounded-2xl mt-2"
              >
                Set Up Payout Method
              </button>
            </div>
          )}

          {step === 'review' && isStripe && method && destination && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Review payout</p>
              <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Payout Amount</span>
                  <span className="text-sm font-black text-gray-900">{fmtCad(amountNum)} {currency}</span>
                </div>
                {destCurrency && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">You'll Receive (est.)</span>
                    <span className="text-sm font-bold text-gray-900">
                      {fxRate ? `≈ ${fmtCad(amountNum * fxRate)} ${destCurrency}` : <Loader2 className="w-3.5 h-3.5 animate-spin inline" />}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Estimated Arrival</span>
                  <span className="text-sm font-bold text-gray-900">1–6 business days</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Destination</span>
                  <span className="text-sm font-bold text-gray-900">{walletApi.maskDestination(method, destination, defaultMethod?.last4)}</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Your payout will be sent to your bank account and should arrive within 1–6 business days.
                {destCurrency && ' Since your bank account is in a different currency, the exact amount you receive is confirmed by Stripe at the time your payout is sent — the amount above is an estimate.'}
              </p>
            </div>
          )}

          {step === 'review' && !isStripe && method && destination && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Review payout</p>
              <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Payout Amount</span>
                  <span className="text-sm font-black text-gray-900">{fmtCad(amountNum)}</span>
                </div>
                {platformFee > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">FILMONS Fee ({(withdrawalFeeRate * 100).toFixed(0)}%)</span>
                    <span className="text-sm font-bold text-red-500">−{fmtCad(platformFee)}</span>
                  </div>
                )}
                {speed === 'instant' && instantFee > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Instant Payout Fee ({(instantFeeRate * 100).toFixed(0)}%)</span>
                    <span className="text-sm font-bold text-red-500">−{fmtCad(instantFee)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <span className="text-xs text-gray-400">Payout Amount</span>
                  <span className="text-sm font-black text-gray-900">{fmtCad(Math.max(amountNum - totalFee, 0))} {currency}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Payout Method</span>
                  <span className="text-sm font-bold text-gray-900 flex items-center gap-1">{speed === 'instant' && <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />} {speed === 'instant' ? 'Instant' : 'Standard'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Estimated Arrival</span>
                  <span className="text-sm font-bold text-gray-900">{estimatedArrivalLabel(speed, previewArrivalIso(speed))}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Destination</span>
                  <span className="text-sm font-bold text-gray-900">{METHOD_LABEL[method]} {walletApi.maskDestination(method, destination, defaultMethod?.last4)}</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                This reserves the funds immediately. Cash-outs are reviewed and processed manually by FILMONS — once approved and sent, payment typically arrives within 1–2 business days, depending on your payment method and financial institution.
              </p>
            </div>
          )}

          {step === 'success' && result && isStripe && (
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center"><Check className="w-8 h-8 text-green-600" /></div>
              <div>
                <p className="text-base font-black text-gray-900">Payout Sent ✓</p>
                <p className="text-sm text-gray-500 mt-1">
                  {result.payoutCurrency && result.payoutAmount != null
                    ? `${fmtCad(result.payoutAmount)} ${result.payoutCurrency}`
                    : fmtCad(result.amount)} is on the way to {walletApi.maskDestination(result.method, result.destination, (result.destination as any)?.last4)}.
                </p>
              </div>
              <div className="w-full bg-gray-50 rounded-2xl p-4 space-y-2.5 text-left">
                <div className="flex items-center justify-between"><span className="text-xs text-gray-400">Withdrawn</span><span className="text-sm font-black text-gray-900">{fmtCad(result.amount)} CAD</span></div>
                {result.payoutCurrency && result.payoutAmount != null && (
                  <div className="flex items-center justify-between"><span className="text-xs text-gray-400">Sent To Your Bank</span><span className="text-sm font-black text-gray-900">{fmtCad(result.payoutAmount)} {result.payoutCurrency}</span></div>
                )}
                <div className="flex items-center justify-between"><span className="text-xs text-gray-400">Expected arrival</span><span className="text-sm font-bold text-gray-900">1–6 business days</span></div>
                <div className="flex items-center justify-between"><span className="text-xs text-gray-400">Destination</span><span className="text-sm font-bold text-gray-900">{walletApi.maskDestination(result.method, result.destination, (result.destination as any)?.last4)}</span></div>
              </div>
              <button onClick={onDone} className="w-full py-3.5 bg-blue-600 text-white font-black text-sm rounded-2xl">Done</button>
            </div>
          )}

          {step === 'success' && result && !isStripe && (
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center"><Check className="w-8 h-8 text-green-600" /></div>
              <div>
                <p className="text-base font-black text-gray-900">Cash-Out Requested ✓</p>
                <p className="text-sm text-gray-500 mt-1">Status: Pending</p>
              </div>
              <div className="w-full bg-gray-50 rounded-2xl p-4 space-y-2.5 text-left">
                <div className="flex items-center justify-between"><span className="text-xs text-gray-400">Requested Amount</span><span className="text-sm font-bold text-gray-900">{fmtCad(result.amount)}</span></div>
                {(result.platformFeeAmount + (result.payoutSpeed === 'instant' ? result.feeAmount : 0)) > 0 && (
                  <div className="flex items-center justify-between"><span className="text-xs text-gray-400">FILMONS Fee</span><span className="text-sm font-bold text-gray-900">{fmtCad(result.platformFeeAmount + (result.payoutSpeed === 'instant' ? result.feeAmount : 0))}</span></div>
                )}
                <div className="flex items-center justify-between border-t border-gray-100 pt-2.5"><span className="text-xs text-gray-400">You'll Receive</span><span className="text-sm font-black text-gray-900">{fmtCad(result.netAmount)} CAD</span></div>
                <div className="flex items-center justify-between"><span className="text-xs text-gray-400">Estimated arrival</span><span className="text-sm font-bold text-gray-900">{estimatedArrivalLabel(result.payoutSpeed, result.estimatedArrivalAt)}</span></div>
                <div className="flex items-center justify-between"><span className="text-xs text-gray-400">Destination</span><span className="text-sm font-bold text-gray-900">{walletApi.maskDestination(result.method, result.destination, (result.destination as any)?.last4)}</span></div>
              </div>
              <button onClick={onDone} className="w-full py-3.5 bg-blue-600 text-white font-black text-sm rounded-2xl">Done</button>
            </div>
          )}
        </div>

        {step !== 'success' && !(step === 'review' && !defaultMethod) && (
        <div className="px-5 py-4 border-t border-gray-100">
          {step !== 'review' ? (
            <button
              onClick={goNext}
              disabled={step === 'amount' && !amountValid}
              className="w-full py-3.5 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => user?.id && onConfirm(user.id)}
              disabled={submitting}
              className={`w-full py-3.5 text-white font-black text-sm rounded-2xl disabled:opacity-60 flex items-center justify-center gap-2 ${speed === 'instant' ? 'bg-amber-500' : 'bg-blue-600'}`}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : speed === 'instant' ? 'Confirm Instant Payout' : 'Confirm Payout'}
            </button>
          )}
        </div>
        )}
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
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const cancelPayout = async (payoutRequestId: string) => {
    if (!user?.id || !window.confirm('Cancel this cash-out request? The reserved funds will be returned to your available balance.')) return;
    setCancellingId(payoutRequestId);
    const res = await walletApi.cancelPayoutRequest(user.id, payoutRequestId);
    setCancellingId(null);
    if (res.success) { toast.success('Cash-out request cancelled'); refresh(); }
    else toast.error(res.error || 'Could not cancel request');
  };

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

  // Live status/balance sync — an admin approving/processing/paying a
  // cash-out (or a wallet credit landing) should update this page without
  // the user having to refresh.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`wallet_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'payout_requests', filter: `host_id=eq.${user.id}` },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallets', filter: `owner_id=eq.${user.id}` },
        () => refresh(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]); // eslint-disable-line

  if (!isAuthenticated || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white">
        <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 pt-6 pb-8">
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

          {/* Balance — mobile/tablet: single Available-focused card */}
          <div className="bg-white/10 backdrop-blur rounded-3xl p-6 lg:hidden">
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

          {/* Balance — desktop: 3-tile row (Available / Pending / Total earned) */}
          <div className="hidden lg:grid grid-cols-3 gap-4">
            <div className="bg-white/10 backdrop-blur rounded-3xl p-6">
              <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-2">Available</p>
              <span className="text-4xl font-black leading-none">{fmtCad(balance.available)}</span>
              <button
                onClick={() => setShowModal(true)}
                disabled={balance.available <= 0}
                className="w-full mt-4 py-2.5 bg-white text-blue-700 font-black text-sm rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              >
                Request Payout
              </button>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-3xl p-6">
              <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-2">Pending</p>
              <span className="text-4xl font-black leading-none">{fmtCad(balance.pending)}</span>
              <p className="flex items-center gap-1.5 mt-4 text-blue-200 text-xs">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                Releases ~48h after each rental ends
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-3xl p-6">
              <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-2">Total Earned</p>
              <span className="text-4xl font-black leading-none">{fmtCad(balance.available + balance.pending)}</span>
              <p className="mt-4 text-blue-200 text-xs">{balance.currency} · available + pending</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* On Hold — Opportunity/Hire earnings held until work is confirmed complete */}
        {txs.some(t => (t.transaction_type === 'opportunity_earning' || t.transaction_type === 'hire_earning') && t.status === 'pending') && (
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">On Hold</p>
            <div className="bg-white rounded-2xl border border-amber-100 divide-y divide-gray-50 overflow-hidden">
              {txs.filter(t => (t.transaction_type === 'opportunity_earning' || t.transaction_type === 'hire_earning') && t.status === 'pending').map(tx => (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0"><Clock className="w-4 h-4 text-amber-500" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{fmtCad(tx.amount)}</p>
                    <p className="text-xs text-gray-400">Available once work is confirmed complete</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Preferred payout method */}
        <div>
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Payout method</p>
          {defaultMethod ? (
            <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                {defaultMethod.method === 'card' ? <Zap className="w-4 h-4 text-blue-500" /> : <Landmark className="w-4 h-4 text-blue-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">{defaultMethod.provider === 'stripe' ? defaultMethod.display_name : METHOD_LABEL[defaultMethod.method]}</p>
                <p className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                  {walletApi.maskDestination(defaultMethod.method, defaultMethod.details, defaultMethod.last4)}
                  {defaultMethod.provider === 'stripe' && defaultMethod.account_type && (
                    <span className="capitalize">· {defaultMethod.account_type}</span>
                  )}
                  {defaultMethod.provider === 'stripe' && (
                    defaultMethod.status === 'ready'
                      ? <span className="text-green-600 font-semibold">· Ready for payouts</span>
                      : defaultMethod.status === 'action_required'
                        ? <span className="text-amber-600 font-semibold">· Bank account requires attention</span>
                        : <span className="text-amber-600 font-semibold">· Setup incomplete</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => navigate('/wallet/payout-method')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
                  <Pencil className="w-3.5 h-3.5 text-gray-400" />
                </button>
                {defaultMethod.provider === 'stripe' && (
                  <button
                    onClick={() => { if (window.confirm('Remove this bank account? You will need to add a new one before your next payout.')) navigate('/wallet/payout-method?action=remove'); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50"
                    aria-label="Remove bank account"
                  >
                    <X className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={() => navigate('/wallet/payout-method')}
              className="w-full bg-white rounded-2xl border border-dashed border-gray-200 px-4 py-3.5 flex items-center gap-3 hover:border-blue-300 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0"><Landmark className="w-4 h-4 text-blue-500" /></div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-bold text-gray-900">Add a payout method</p>
                <p className="text-xs text-gray-400">Set up where you'd like to receive Filmons payouts.</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </button>
          )}
        </div>

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
                      <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                        {p.payout_speed === 'instant' ? fmtCad(p.net_amount ?? Number(p.amount)) : fmtCad(Number(p.amount))}
                        {p.payout_speed === 'instant' && <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(p.requested_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {((p.platform_fee_amount ?? 0) + (p.payout_speed === 'instant' ? p.fee_amount : 0)) > 0 &&
                          ` · FILMONS fee ${fmtCad((p.platform_fee_amount ?? 0) + (p.payout_speed === 'instant' ? p.fee_amount : 0))}`}
                      </p>
                      {p.estimated_arrival_at && ['requested', 'under_review', 'approved', 'processing'].includes(p.status) && (
                        <p className="text-xs text-gray-400">Estimated arrival: {estimatedArrivalLabel(p.payout_speed, p.estimated_arrival_at)}</p>
                      )}
                      {p.status === 'sent' && (
                        <p className="text-xs text-gray-400">
                          Expected arrival: 1–6 business days{p.arrival_date ? ` (around ${new Date(p.arrival_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })})` : ''}
                        </p>
                      )}
                      {p.payout_currency && p.payout_amount != null && (
                        <p className="text-xs text-gray-400">Sent as {fmtCad(p.payout_amount)} {p.payout_currency} to your bank</p>
                      )}
                      {p.status === 'rejected' && p.rejection_reason && (
                        <p className="text-xs text-red-500 mt-0.5">{p.rejection_reason}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${s.className}`}>{s.label}</span>
                      {['requested', 'under_review'].includes(p.status) ? (
                        <button
                          onClick={() => cancelPayout(p.id)}
                          disabled={cancellingId === p.id}
                          className="text-[10px] font-bold text-gray-400 hover:text-red-600 disabled:opacity-50"
                        >
                          {cancellingId === p.id ? 'Cancelling…' : 'Cancel request'}
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate('/support', { state: {
                            payoutRequestId: p.id, category: 'wallet_payouts',
                          } })}
                          className="text-[10px] font-bold text-gray-400 hover:text-blue-600"
                        >
                          Get Help
                        </button>
                      )}
                    </div>
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
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-sm font-black ${tx.status === 'pending' ? 'text-amber-600' : 'text-green-600'}`}>+{fmtCad(tx.amount)}</span>
                    <button
                      onClick={() => navigate('/support', { state: {
                        walletTransactionId: tx.id, orderId: tx.order_id || undefined, category: 'wallet_payouts',
                      } })}
                      className="text-[10px] font-bold text-gray-400 hover:text-blue-600"
                    >
                      Need Help?
                    </button>
                  </div>
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
