import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { StripeCardForm } from '../components/StripeCardForm';
import { PaymentLogo } from '../components/PaymentLogos';
import {
  Wallet, Zap, TrendingUp, ArrowUpRight, ArrowDownLeft,
  ShoppingBag, Eye, Clock, CheckCircle, ChevronRight,
  Info, Shield, Rocket, Crown, DollarSign, BarChart3,
  Gift, Lock, RefreshCw, X, Package, Loader2,
  Send, Search, ArrowLeftRight, CreditCard, Building2,
  User, AlertCircle, Phone, Edit2,
} from 'lucide-react';
import {
  fpApi, FP_PACKS, BOOST_OPTIONS, FP,
  BUY_PAYMENT_METHODS, PAYOUT_METHODS, PAYMENT_METHODS,
  type FPTransaction, type FPAccount,
  cadWalletApi, type CadTransaction,
} from '../lib/fpSystem';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { supabase } from '../../lib/supabase';
import * as notifStore from '../lib/notifications';

// ─────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────
const TABS = ['overview', 'buy', 'send', 'boost', 'withdraw', 'history'] as const;
type Tab = typeof TABS[number];
const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview', buy: 'Buy FP', send: 'Send',
  boost: 'Boost', withdraw: 'Withdraw', history: 'History',
};

const TX_ICONS: Record<string, React.ReactNode> = {
  purchase:          <ShoppingBag className="w-4 h-4 text-blue-500" />,
  earn_sale:         <DollarSign className="w-4 h-4 text-green-500" />,
  earn_views:        <Eye className="w-4 h-4 text-purple-500" />,
  boost_post:        <Rocket className="w-4 h-4 text-orange-500" />,
  boost_listing:     <Rocket className="w-4 h-4 text-orange-500" />,
  marketplace_earn:  <DollarSign className="w-4 h-4 text-green-500" />,
  marketplace_spend: <ShoppingBag className="w-4 h-4 text-red-400" />,
  withdrawal:        <ArrowUpRight className="w-4 h-4 text-red-400" />,
  send_fp:           <Send className="w-4 h-4 text-purple-400" />,
  receive_fp:        <Gift className="w-4 h-4 text-green-400" />,
  admin_credit:      <Gift className="w-4 h-4 text-yellow-500" />,
};

const fmt  = (fp: number)  => fp.toLocaleString('en-CA');
const fmtC = (cad: number) => `$${cad.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─────────────────────────────────────────────────────────────────
// FP ↔ CAD Converter Widget
// ─────────────────────────────────────────────────────────────────
function FPConverter({ onBuyWithAmount }: { onBuyWithAmount?: (cad: number) => void }) {
  const [cadInput, setCadInput] = useState('');
  const [fpInput,  setFpInput]  = useState('');
  const [direction, setDirection] = useState<'cad→fp' | 'fp→cad'>('cad→fp');

  const handleCad = (v: string) => {
    setCadInput(v);
    const n = parseFloat(v);
    if (!isNaN(n) && n > 0) setFpInput(fpApi.cadToFp(n).toString());
    else setFpInput('');
  };

  const handleFp = (v: string) => {
    setFpInput(v);
    const n = parseInt(v, 10);
    if (!isNaN(n) && n > 0) setCadInput((n * FP.BUY_RATE).toFixed(2));
    else setCadInput('');
  };

  const swap = () => {
    setDirection(d => d === 'cad→fp' ? 'fp→cad' : 'cad→fp');
    const tmp = cadInput; setCadInput(fpInput.length ? (parseInt(fpInput) * FP.BUY_RATE).toFixed(2) : ''); setFpInput(tmp.length ? fpApi.cadToFp(parseFloat(tmp)).toString() : '');
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-4">
      <p className="text-xs font-black text-blue-700 uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <ArrowLeftRight className="w-3.5 h-3.5" /> FP ↔ CAD Converter
      </p>
      <div className="flex items-center gap-2">
        {/* CAD field */}
        <div className="flex-1">
          <p className="text-[10px] font-bold text-gray-500 mb-1">CAD ($)</p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
            <input
              type="number" min="0" step="0.01"
              value={cadInput}
              onChange={e => handleCad(e.target.value)}
              placeholder="0.00"
              className="w-full pl-7 pr-3 py-2.5 border border-blue-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            />
          </div>
        </div>

        {/* Swap button */}
        <button onClick={swap} className="mt-5 w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors shrink-0">
          <ArrowLeftRight className="w-4 h-4" />
        </button>

        {/* FP field */}
        <div className="flex-1">
          <p className="text-[10px] font-bold text-gray-500 mb-1">FP ⚡</p>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-yellow-500 font-black text-sm">⚡</span>
            <input
              type="number" min="0" step="1"
              value={fpInput}
              onChange={e => handleFp(e.target.value)}
              placeholder="0"
              className="w-full pl-8 pr-3 py-2.5 border border-blue-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            />
          </div>
        </div>
      </div>

      {/* Live display */}
      {(cadInput || fpInput) && (
        <div className="mt-3 bg-white rounded-xl px-4 py-2.5 flex items-center justify-between text-sm border border-blue-100">
          <span className="text-gray-500">
            {fpInput ? `⚡ ${parseInt(fpInput || '0').toLocaleString()} FP` : '—'}
          </span>
          <span className="text-blue-400 font-black">=</span>
          <span className="font-black text-blue-700">
            {cadInput ? fmtC(parseFloat(cadInput || '0')) + ' CAD' : '—'}
          </span>
        </div>
      )}

      {onBuyWithAmount && cadInput && parseFloat(cadInput) >= FP.MIN_CUSTOM_BUY_CAD && (
        <button
          onClick={() => onBuyWithAmount(parseFloat(cadInput))}
          className="mt-3 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl py-2.5 text-sm transition-colors"
        >
          Buy ⚡{fpApi.cadToFp(parseFloat(cadInput)).toLocaleString()} FP for {fmtC(parseFloat(cadInput))} →
        </button>
      )}

      <p className="text-[10px] text-blue-500/60 text-center mt-2">Buy rate: ${FP.BUY_RATE}/FP · Payout: ${FP.PAYOUT_RATE}/FP</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Payment Method Picker
// ─────────────────────────────────────────────────────────────────
function PayMethodPicker({ methods, selected, onSelect }: {
  methods: readonly { id: string; label: string; icon: string }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {methods.map(m => (
        <button key={m.id} onClick={() => onSelect(m.id)}
          className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all ${
            selected === m.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
          }`}>
          <span className="text-xl">{m.icon}</span>
          <span className={`text-sm font-bold ${selected === m.id ? 'text-blue-700' : 'text-gray-700'}`}>{m.label}</span>
          {selected === m.id && <CheckCircle className="w-4 h-4 text-blue-500 ml-auto shrink-0" />}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Phone Verification Modal (withdrawal & payout change)
// ─────────────────────────────────────────────────────────────────
function PhoneVerifyModal({ phone, userId, action, initialToken, onNewToken, onVerified, onClose }: {
  phone: string;
  userId: string;
  action: 'change' | 'withdraw';
  initialToken: string;
  onNewToken: (t: string) => void;
  onVerified: () => void;
  onClose: () => void;
}) {
  const [digits, setDigits] = useState(['','','','','','']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(59);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  // Always use the latest token (parent keeps it fresh after resend)
  const tokenRef = useRef(initialToken);
  useEffect(() => { tokenRef.current = initialToken; }, [initialToken]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const maskedPhone = phone.length > 4
    ? `••••••${phone.slice(-4)}`
    : phone;

  const handleDigit = (i: number, val: string) => {
    const ch = val.replace(/\D/g, '').slice(-1);
    const next = [...digits]; next[i] = ch; setDigits(next);
    if (ch && i < 5) inputRefs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(''));
      inputRefs.current[5]?.focus();
    }
    e.preventDefault();
  };

  const doVerify = async () => {
    const code = digits.join('');
    if (code.length < 6) { toast.error('Enter all 6 digits'); return; }
    if (!tokenRef.current) { toast.error('Verification session lost — please request a new code'); return; }
    setLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879/verify-withdrawal-otp`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` },
          // Send the signed token back so the server can verify without any stored state
          body: JSON.stringify({ userId, code, token: tokenRef.current }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      toast.success('✅ Identity verified');
      onVerified();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Invalid code');
    }
    setLoading(false);
  };

  const doResend = async () => {
    setResending(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879/send-withdrawal-otp`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` },
          body: JSON.stringify({ userId, phone }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend');
      onNewToken(data.token);   // ← bubble new signed token up to parent
      setDigits(['','','','','','']);
      setCountdown(59);
      toast.success('New code sent!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to resend code');
    }
    setResending(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Phone className="w-5 h-5 text-white" />
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30">
              <X className="w-4 h-4" />
            </button>
          </div>
          <h2 className="text-xl font-black">Verify your identity</h2>
          <p className="text-blue-200 text-sm mt-1 leading-relaxed">
            {action === 'withdraw'
              ? 'Before withdrawing, we sent a 6-digit code to'
              : 'Before changing your payout account, we sent a code to'}
            {' '}
            <span className="font-bold text-white">{maskedPhone}</span>
          </p>
        </div>

        <div className="p-6 space-y-5">
          {/* 6-digit input */}
          <div className="flex gap-2 justify-center" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                type="text" inputMode="numeric" maxLength={1}
                value={d}
                onChange={e => handleDigit(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                className={`w-11 h-14 text-center text-2xl font-black border-2 rounded-xl focus:outline-none transition-colors ${
                  d ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-900'
                } focus:border-blue-500`}
              />
            ))}
          </div>

          {/* Resend */}
          <div className="text-center">
            {countdown > 0 ? (
              <p className="text-sm text-gray-400">Resend code in <span className="font-bold text-gray-600">{countdown}s</span></p>
            ) : (
              <button
                onClick={doResend} disabled={resending}
                className="text-sm font-bold text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                {resending ? 'Sending…' : 'Resend code →'}
              </button>
            )}
          </div>

          <button
            onClick={doVerify}
            disabled={loading || digits.join('').length < 6}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-black rounded-2xl py-4 transition-colors"
          >
            {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Verifying…</> : 'Confirm →'}
          </button>

          <p className="text-[11px] text-center text-gray-400">
            This code expires in 10 minutes. Never share it with anyone.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Card payout form
// ─────────────────────────────────────────────────────────────────
function CardPayoutForm({ onChange }: {
  onChange: (details: { cardNum: string; cardName: string; expiry: string; cvc: string; street: string; city: string; province: string; postal: string }) => void;
}) {
  const [cardNum, setCardNum]   = useState('');
  const [cardName, setCardName] = useState('');
  const [expiry, setExpiry]     = useState('');
  const [cvc, setCvc]           = useState('');
  const [street, setStreet]     = useState('');
  const [city, setCity]         = useState('');
  const [province, setProvince] = useState('');
  const [postal, setPostal]     = useState('');

  useEffect(() => {
    onChange({ cardNum, cardName, expiry, cvc, street, city, province, postal });
  }, [cardNum, cardName, expiry, cvc, street, city, province, postal]);

  const fmtCard = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(.{4})/g, '$1 ').trim();
  };

  const fmtExpiry = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0,2)}/${digits.slice(2)}`;
    return digits;
  };

  const inp = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white';

  return (
    <div className="space-y-3">
      {/* Card number */}
      <div>
        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Card Number</label>
        <input
          type="text" inputMode="numeric" placeholder="1234 5678 9012 3456"
          value={cardNum}
          onChange={e => setCardNum(fmtCard(e.target.value))}
          className={`${inp} font-mono tracking-widest`}
        />
      </div>

      {/* Name */}
      <div>
        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Name on Card</label>
        <input
          type="text" placeholder="JOHN SMITH"
          value={cardName}
          onChange={e => setCardName(e.target.value.toUpperCase())}
          className={`${inp} uppercase tracking-wide`}
        />
      </div>

      {/* Expiry + CVC */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Expiry</label>
          <input
            type="text" inputMode="numeric" placeholder="MM/YY"
            value={expiry}
            onChange={e => setExpiry(fmtExpiry(e.target.value))}
            className={inp}
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">CVC / CVV</label>
          <input
            type="text" inputMode="numeric" placeholder="123" maxLength={4}
            value={cvc}
            onChange={e => setCvc(e.target.value.replace(/\D/g,'').slice(0,4))}
            className={inp}
          />
        </div>
      </div>

      {/* Billing address */}
      <div className="pt-1">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <Building2 className="w-3 h-3" /> Billing Address
        </p>
        <div className="space-y-2">
          <input type="text" placeholder="Street address" value={street} onChange={e => setStreet(e.target.value)} className={inp} />
          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="City" value={city} onChange={e => setCity(e.target.value)} className={inp} />
            <input type="text" placeholder="Province (e.g. ON)" maxLength={2} value={province} onChange={e => setProvince(e.target.value.toUpperCase())} className={inp} />
          </div>
          <input type="text" placeholder="Postal code (e.g. M5V 1A1)" value={postal} onChange={e => setPostal(e.target.value.toUpperCase())} className={inp} />
        </div>
      </div>

      <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
        <Shield className="w-3.5 h-3.5 text-green-500 shrink-0" /> Demo mode — card details stored locally only, never charged
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Buy FP Modal (pack or custom)
// ─────────────────────────────────────────────────────────────────
function BuyModal({ pack, customCad, onClose, onConfirm, userEmail, userId }: {
  pack?: typeof FP_PACKS[number] | null;
  customCad?: number;
  onClose: () => void;
  onConfirm: (payMethod: string) => void;
  userEmail?: string;
  userId?: string;
}) {
  const [processing, setProcessing] = useState(false);

  const fpAmt  = pack ? pack.fp  : (customCad ? fpApi.cadToFp(customCad) : 0);
  const cadAmt = pack ? pack.cad : (customCad ?? 0);

  const doConfirm = async () => {
    setProcessing(true);
    try {
      const baseUrl = window.location.origin + window.location.pathname;
      const payload = {
        amount_cad:     cadAmt,
        fp_amount:      fpAmt,
        user_id:        userId || '',
        description:    `Filmons FP Purchase — ⚡${fpAmt} FP`,
        customer_email: userEmail || '',
        success_url:    baseUrl + '?payment=success&session_id={CHECKOUT_SESSION_ID}',
        cancel_url:     baseUrl + '?payment=cancel',
      };

      const { data, error } = await supabase.functions.invoke('stripe-charge', { body: payload });

      if (error) { toast.error(`Error: ${error.message}`); setProcessing(false); return; }
      if (!data?.url) { toast.error(data?.error || 'Could not create payment session'); setProcessing(false); return; }

      window.location.href = data.url;
    } catch (e: any) {
      toast.error(`Error: ${e?.message || String(e)}`);
    }
    setProcessing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`p-5 text-white ${pack ? `bg-gradient-to-br ${pack.color}` : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-widest opacity-80">
              {pack ? `${pack.label} Pack` : 'Custom Amount'}
            </span>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white text-xs">✕</button>
          </div>
          <div className="flex items-end gap-3">
            <span className="text-5xl font-black leading-none">⚡{fpAmt.toLocaleString()}</span>
          </div>
          <p className="text-white/70 text-sm mt-1">Filmons Points</p>
          <p className="text-3xl font-black mt-1">{fmtC(cadAmt)} <span className="text-white/60 text-base font-semibold">CAD</span></p>
        </div>

        <div className="p-5 space-y-4">
          {/* Summary */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">You get</span>
              <span className="font-bold">⚡{fpAmt.toLocaleString()} FP</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total</span>
              <span className="font-bold">{fmtC(cadAmt)} CAD</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>Payment</span>
              <span>Secured payment</span>
            </div>
          </div>

          <button
            onClick={doConfirm}
            disabled={processing}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-black rounded-2xl py-4 transition-colors text-base"
          >
            {processing
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing payment…</>
              : <>Pay {fmtC(cadAmt)} securely →</>
            }
          </button>

          <div className="flex items-center justify-center gap-2 text-[11px] text-gray-400">
            <svg width="12" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
            Secured payment · Card info never touches our servers
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Boost target picker
// ─────────────────────────────────────────────────────────────────
function BoostPickerModal({ userId, boostId, onClose }: { userId: string; boostId: string; onClose: () => void }) {
  const opt = BOOST_OPTIONS.find(b => b.id === boostId)!;
  const [tab, setTab]       = useState<'listing' | 'post'>('listing');
  const [selected, setSelected] = useState<any>(null);

  const [listings, setListings] = useState<any[]>([]);
  const [posts, setPosts]       = useState<any[]>([]);
  useEffect(() => {
    const base = `https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879`;
    const auth = `Bearer ${publicAnonKey}`;
    Promise.all([
      fetch(`${base}/listings/user/${userId}`, { headers: { Authorization: auth } }).then(r => r.json()).then(d => setListings(d.listings || [])),
      fetch(`${base}/posts/user/${userId}`, { headers: { Authorization: auth } }).then(r => r.json()).then(d => setPosts(d.posts || [])),
    ]).catch(() => {
      setListings(JSON.parse(localStorage.getItem('filmons_listings') || '[]').filter((l: any) => l.userId === userId));
      setPosts(JSON.parse(localStorage.getItem('filmons_posts') || '[]').filter((p: any) => p.userId === userId));
    });
  }, [userId]);

  const handleBoost = () => {
    if (!selected) { toast.error('Select something to boost'); return; }
    const result = fpApi.boostContent(userId, boostId, selected.id, tab, selected.title || selected.content?.slice(0, 50) || 'Content');
    if (!result.success) { toast.error(result.error); return; }
    toast.success(`🚀 ${opt.label} active for ${opt.days} days!`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div><h3 className="font-black text-gray-900">Choose what to boost</h3><p className="text-xs text-gray-400 mt-0.5">{opt.label} · {opt.fp} FP · {opt.days} days</p></div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex border-b border-gray-100">
          {(['listing','post'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setSelected(null); }}
              className={`flex-1 py-2.5 text-sm font-bold transition-colors ${tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400'}`}>
              {t === 'listing' ? `Listings (${listings.length})` : `Posts (${posts.length})`}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {(tab === 'listing' ? listings : posts).map((item: any) => (
            <button key={item.id} onClick={() => setSelected(item)}
              className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-all ${selected?.id === item.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}>
              {(item.image || item.images?.[0]) && <img src={item.image || item.images?.[0]} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{item.title || item.content?.slice(0,60) || 'Post'}</p>
                {item.price && <p className="text-xs text-blue-600 font-semibold">${item.price} CAD · ⚡{fpApi.cadToFp(item.price)} FP</p>}
              </div>
              {selected?.id === item.id && <CheckCircle className="w-5 h-5 text-blue-500 shrink-0" />}
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-gray-100">
          <button onClick={handleBoost} disabled={!selected} className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-black rounded-2xl py-3.5 transition-colors">
            <Rocket className="w-5 h-5" /> Apply {opt.label} · {opt.fp} FP
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Transaction row
// ─────────────────────────────────────────────────────────────────
function TxRow({ tx }: { tx: FPTransaction }) {
  const isCredit = tx.fpAmount > 0;
  return (
    <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isCredit ? 'bg-green-50' : 'bg-red-50'}`}>
        {TX_ICONS[tx.type] || <Zap className="w-4 h-4 text-blue-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{tx.description}</p>
        <p className="text-xs text-gray-400">
          {new Date(tx.createdAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {' · '}
          <span className={`font-semibold ${tx.status === 'completed' ? 'text-green-500' : tx.status === 'processing' ? 'text-amber-500' : 'text-gray-400'}`}>
            {tx.status}
          </span>
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-black ${isCredit ? 'text-green-600' : 'text-red-500'}`}>
          {isCredit ? '+' : ''}⚡{fmt(Math.abs(tx.fpAmount))}
        </p>
        <p className="text-[11px] text-gray-400">{fmtC(Math.abs(tx.cadEquiv))}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main wallet page
// ─────────────────────────────────────────────────────────────────
export function FPWallet() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [tab, setTab]             = useState<Tab>((searchParams.get('tab') as Tab) || 'overview');
  const [account, setAccount]     = useState<FPAccount | null>(null);
  const [txs, setTxs]             = useState<FPTransaction[]>([]);

  // Buy state
  const [buyPack, setBuyPack]         = useState<typeof FP_PACKS[number] | null>(null);
  const [customBuyCad, setCustomBuyCad] = useState<number | null>(null);

  // Send state
  const [sendQuery, setSendQuery]     = useState('');
  const [sendResults, setSendResults] = useState<any[]>([]);
  const [sendTarget, setSendTarget]   = useState<any>(null);
  const [sendFpAmt, setSendFpAmt]     = useState('');
  const [sendCadAmt, setSendCadAmt]   = useState('');
  const [sendNote, setSendNote]       = useState('');
  const [sendLoading, setSendLoading] = useState(false);

  // Boost state
  const [boostOpt, setBoostOpt] = useState<string | null>(null);

  // Withdraw state
  const [withdrawFpInput, setWithdrawFpInput]   = useState('');
  const [withdrawCadInput, setWithdrawCadInput] = useState('');
  const [withdrawing, setWithdrawing]           = useState(false);
  // Saved payout (persisted)
  const [savedPayoutMethod, setSavedPayoutMethod]   = useState('');
  const [savedPayoutDetails, setSavedPayoutDetails] = useState('');
  // Edit payout form
  const [editingPayout, setEditingPayout]   = useState(false);
  const [draftMethod, setDraftMethod]       = useState('paypal');
  const [draftDetails, setDraftDetails]     = useState('');
  // Card form fields (for credit/debit payout)
  const [cardFormData, setCardFormData] = useState<{
    cardNum: string; cardName: string; expiry: string; cvc: string;
    street: string; city: string; province: string; postal: string;
  } | null>(null);
  // Phone verification modal
  const [verifyOpen, setVerifyOpen]         = useState(false);
  const [verifyAction, setVerifyAction]     = useState<'change' | 'withdraw'>('change');
  const [verifyCallback, setVerifyCallback] = useState<(() => void) | null>(null);
  const [sendingOTP, setSendingOTP]         = useState(false);
  const [otpToken, setOtpToken]             = useState('');

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!user) return;
    refresh();
  }, [user]);

  // Handle return from payment — verify via edge function
  useEffect(() => {
    if (!user) return;
    const payment   = searchParams.get('payment');
    const sessionId = searchParams.get('session_id');
    if (payment !== 'success' || !sessionId) {
      if (payment === 'cancel') {
        toast.error('Payment cancelled.');
        window.history.replaceState({}, '', window.location.pathname);
      }
      return;
    }

    // Verify payment server-side and credit FP
    (async () => {
      try {
        toast.loading('Verifying payment…', { id: 'verify' });
        const { data, error } = await supabase.functions.invoke('stripe-charge/verify', {
          method: 'GET',
        });
        // supabase.functions.invoke doesn't support GET params, use fetch directly
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/stripe-charge/verify?session_id=${sessionId}`,
          { headers: { Authorization: `Bearer ${publicAnonKey}` } }
        );
        const result = await res.json();
        toast.dismiss('verify');

        if (!res.ok || result.error) {
          toast.error(result.error || 'Could not verify payment');
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }

        const fpAmt  = result.fp_amount;
        const cadAmt = result.cad_amount;

        // Sync localStorage from DB (edge function already wrote to DB — don't double-insert)
        const { data: wallet } = await supabase.from('fp_wallets').select('*').eq('user_id', user.id).single();
        if (wallet) {
          // Update localStorage to match DB (source of truth)
          const accounts = { [user.id]: {
            userId: user.id,
            balance:            wallet.balance || 0,
            lifetimeEarned:     wallet.lifetime_earned || 0,
            lifetimeSpent:      wallet.lifetime_spent || 0,
            lifetimePurchased:  wallet.lifetime_purchased || 0,
            lifetimeWithdrawn:  wallet.lifetime_withdrawn || 0,
            pendingViewsFP: 0, dailyViewsFP: 0, dailyViewsDate: '',
            withdrawalPending: wallet.withdrawal_pending || false,
          }};
          localStorage.setItem('filmons_fp_accounts', JSON.stringify(accounts));

          // Also sync transactions from DB to localStorage (for FPWallet tx history)
          const { data: dbTxs } = await supabase.from('transactions')
            .select('*').eq('user_id', user.id)
            .order('created_at', { ascending: false }).limit(100);
          if (dbTxs) {
            const mapped = dbTxs.map((t: any) => ({
              id: t.id, userId: t.user_id, type: t.type,
              fpAmount: t.fp_amount || 0, cadEquiv: t.cad_amount || 0,
              description: t.description || '', status: t.status || 'completed',
              createdAt: t.created_at, metadata: t.metadata || {},
            }));
            localStorage.setItem('filmons_fp_transactions', JSON.stringify(mapped));
          }
        } else if (!result.already_credited) {
          // No wallet in DB yet — write to localStorage only (edge fn will have written to DB)
          const acc = fpApi.getAccount(user.id);
          acc.balance += fpAmt;
          acc.lifetimeEarned += fpAmt;
          acc.lifetimePurchased += fpAmt;
          localStorage.setItem('filmons_fp_accounts', JSON.stringify({ [user.id]: acc }));
        }

        // Refresh UI from localStorage
        const freshAccount = fpApi.getAccount(user.id);
        const freshTxs     = fpApi.getTransactions(user.id);
        setAccount(freshAccount);
        setTxs(freshTxs);

        // Push notification
        notifStore.push(user.id, {
          type:          'fp_purchase' as any,
          fromUserId:    user.id,
          fromUserName:  'Filmons',
          fpAmount:      fpAmt,
          postContent:   `You purchased ⚡${fpAmt} FP`,
        } as any);

        toast.success(`✅ ⚡${fpAmt} FP added to your wallet!`);
        window.dispatchEvent(new CustomEvent('filmons:wallet:updated', { detail: { userId: user.id } }));
        window.history.replaceState({}, '', window.location.pathname);
      } catch (e: any) {
        toast.dismiss('verify');
        toast.error(`Verification error: ${e?.message || String(e)}`);
        window.history.replaceState({}, '', window.location.pathname);
      }
    })();
  }, [user, searchParams]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.userId === user?.id) refresh();
    };
    window.addEventListener('filmons:wallet:updated', handler);
    return () => window.removeEventListener('filmons:wallet:updated', handler);
  }, [user]);

  const refresh = async () => {
    if (!user) return;

    // Show localStorage immediately
    const localAcct = fpApi.getAccount(user.id);
    setAccount(localAcct);
    setTxs(fpApi.getTransactions(user.id));
    setCadBalance(cadWalletApi.getBalance(user.id));
    setCadTxs(cadWalletApi.getTransactions(user.id));

    // Sync from DB (source of truth)
    try {
      const [{ data: wallet }, { data: dbTxs }] = await Promise.all([
        supabase.from('fp_wallets').select('*').eq('user_id', user.id).single(),
        supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
      ]);

      if (wallet) {
        const acc: any = {
          userId: user.id,
          balance:           wallet.balance || 0,
          lifetimeEarned:    wallet.lifetime_earned || 0,
          lifetimeSpent:     wallet.lifetime_spent || 0,
          lifetimePurchased: wallet.lifetime_purchased || 0,
          lifetimeWithdrawn: wallet.lifetime_withdrawn || 0,
          pendingViewsFP: 0, dailyViewsFP: 0, dailyViewsDate: '',
          withdrawalPending: wallet.withdrawal_pending || false,
          payoutMethod:    wallet.payout_method || '',
          payoutDetails:   wallet.payout_details || '',
        };
        if (acc.balance >= localAcct.balance) {
          localStorage.setItem('filmons_fp_accounts', JSON.stringify({ [user.id]: acc }));
          setAccount(acc);
          if (acc.payoutMethod) { setSavedPayoutMethod(acc.payoutMethod); setSavedPayoutDetails(acc.payoutDetails); }
        }
      }

      if (dbTxs && dbTxs.length > 0) {
        const mapped = dbTxs.map((t: any) => ({
          id: t.id, userId: t.user_id, type: t.type,
          fpAmount: t.fp_amount || 0, cadEquiv: t.cad_amount || 0,
          description: t.description || '', status: t.status || 'completed',
          createdAt: t.created_at, metadata: t.metadata || {},
        }));
        setTxs(mapped);
        localStorage.setItem('filmons_fp_transactions', JSON.stringify(mapped));
      }
    } catch (e) { console.warn('[refresh] DB sync failed:', e); }

    window.dispatchEvent(new CustomEvent('filmons:wallet:updated', { detail: { userId: user.id } }));
  };

  const isCreatorPlus = ['creator_plus', 'professional', 'business'].includes(user?.accountType || '') ||
                        ['creator_plus', 'professional', 'business'].includes(user?.accountMode  || '');
  const balance    = account?.balance ?? 0;
  const [cadBalance, setCadBalance] = useState(() => user?.id ? cadWalletApi.getBalance(user.id) : 0);
  const [cadTxs,     setCadTxs]     = useState<CadTransaction[]>(() => user?.id ? cadWalletApi.getTransactions(user.id) : []);

  // Refresh CAD wallet when FP wallet refreshes
  useEffect(() => {
    if (user?.id) {
      setCadBalance(cadWalletApi.getBalance(user.id));
      setCadTxs(cadWalletApi.getTransactions(user.id));
    }
  }, [account, user?.id]);

  // ── Search users for send (server-backed) ───────────────────────
  useEffect(() => {
    if (!sendQuery.trim() || !user) { setSendResults([]); return; }
    const q = sendQuery.toLowerCase();
    // Try server first
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879/users`, { headers: { Authorization: `Bearer ${publicAnonKey}` } })
      .then(r => r.json())
      .then(data => {
        const all: any[] = data.users || [];
        setSendResults(all.filter(u => u.id !== user.id && (u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q))).slice(0, 6));
      })
      .catch(() => {
        // Fallback to local cache
        const cached = JSON.parse(localStorage.getItem('filmons_users_cache') || '{}');
        const all = Object.values(cached) as any[];
        setSendResults(all.filter((u: any) => u.id !== user.id && (u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q))).slice(0, 6));
      });
  }, [sendQuery, user]);

  // ── Withdraw field sync ─────────────────────────────────────────
  const handleWithdrawFp = (v: string) => {
    setWithdrawFpInput(v);
    const n = parseInt(v, 10);
    if (!isNaN(n) && n > 0) setWithdrawCadInput((n * FP.PAYOUT_RATE * (1 - FP.WITHDRAWAL_FEE)).toFixed(2));
    else setWithdrawCadInput('');
  };
  const handleWithdrawCad = (v: string) => {
    setWithdrawCadInput(v);
    const n = parseFloat(v);
    if (!isNaN(n) && n > 0) setWithdrawFpInput(Math.ceil(n / (FP.PAYOUT_RATE * (1 - FP.WITHDRAWAL_FEE))).toString());
    else setWithdrawFpInput('');
  };

  // ── Send withdrawal OTP via server ─────────────────────────────
  const requireOTP = async (action: 'change' | 'withdraw', onVerified: () => void) => {
    const phone = user?.phone;
    if (!phone) {
      // No phone on file — skip OTP for now (failsafe)
      toast.error('No phone number on your account. Please add one in your profile.');
      return;
    }
    setSendingOTP(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879/send-withdrawal-otp`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` },
          body: JSON.stringify({ userId: user!.id, phone }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send code');
      setOtpToken(data.token);          // ← store signed token
      setVerifyAction(action);
      setVerifyCallback(() => onVerified);
      setVerifyOpen(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send verification code');
    }
    setSendingOTP(false);
  };

  const actualWithdraw = async () => {
    const amt = parseInt(withdrawFpInput, 10);
    if (isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount'); return; }
    setWithdrawing(true);
    await new Promise(r => setTimeout(r, 900));
    const result = fpApi.requestWithdrawal(user!.id, amt);
    setWithdrawing(false);
    if (!result.success) { toast.error(result.error); return; }
    toast.success(`✅ Withdrawal of ${fmtC(result.payoutCad!)} CAD requested! Arriving via ${PAYOUT_METHODS.find(p => p.id === savedPayoutMethod)?.label} in 3–5 business days.`);
    setWithdrawFpInput(''); setWithdrawCadInput('');
    refresh();
  };

  const doWithdraw = async () => {
    if (!savedPayoutDetails.trim()) { toast.error('Add your payout account first'); return; }
    const amt = parseInt(withdrawFpInput, 10);
    if (isNaN(amt) || amt <= 0) { toast.error('Enter a valid FP amount'); return; }
    await requireOTP('withdraw', actualWithdraw);
  };

  const doSend = async () => {
    if (!sendTarget) { toast.error('Select a recipient'); return; }
    const amt = parseInt(sendFpAmt, 10);
    if (isNaN(amt) || amt < 1) { toast.error('Enter a valid FP amount'); return; }
    setSendLoading(true);
    await new Promise(r => setTimeout(r, 800));
    const result = fpApi.sendFP(user!.id, sendTarget.id, amt, sendNote || undefined);
    setSendLoading(false);
    if (!result.success) { toast.error(result.error); return; }
    toast.success(`⚡ ${amt} FP sent to ${sendTarget.name}!`);
    setSendTarget(null); setSendQuery(''); setSendFpAmt(''); setSendCadAmt(''); setSendNote('');
    refresh();
  };

  if (!user) return null;

  // ── Creator+ gate ───────────────────────────────────────────────
  if (!isCreatorPlus) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center space-y-5">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center mx-auto">
            <Lock className="w-10 h-10 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-900">Creator+ Required</h2>
            <p className="text-gray-500 text-sm mt-2 leading-relaxed">FP (Filmons Points) are only available to <strong>Creator+</strong> accounts. Complete identity verification to unlock.</p>
          </div>
          <div className="bg-blue-50 rounded-2xl p-4 space-y-2 text-sm text-left">
            {['Buy & earn FP', 'Send FP to others', 'Boost listings & posts', 'Withdraw earnings to your account'].map(f => (
              <div key={f} className="flex items-center gap-2 text-blue-800"><CheckCircle className="w-4 h-4 text-blue-500 shrink-0" />{f}</div>
            ))}
          </div>
          <button onClick={() => navigate('/verification')} className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-black rounded-2xl py-4 hover:opacity-90 transition-opacity">
            Unlock with Creator+ →
          </button>
          <button onClick={() => navigate(-1)} className="text-gray-400 text-sm hover:text-gray-600">Go back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white">
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-lg font-black">FP Wallet</h1>
            </div>
            <button onClick={refresh} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
              <RefreshCw className="w-4 h-4 text-white/80" />
            </button>
          </div>

          {/* Balance */}
          <div className="bg-white/10 backdrop-blur rounded-3xl p-6 mb-4">
            <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1">FP Balance</p>
            <div className="flex items-end gap-3">
              <span className="text-5xl font-black leading-none">⚡{fmt(balance)}</span>
              <span className="text-blue-300 text-base font-bold mb-1">FP</span>
            </div>
            <p className="text-blue-300 text-sm mt-1">≈ {fmtC(fpApi.fpToCad(balance))} CAD</p>
          </div>

          {/* CAD Wallet */}
          <div className="bg-white/10 backdrop-blur rounded-3xl p-6 mb-4 border border-white/20">
            <div className="flex items-center justify-between mb-1">
              <p className="text-blue-200 text-xs font-bold uppercase tracking-widest">CAD Wallet</p>
              <span className="text-[10px] text-blue-300 bg-white/10 px-2 py-0.5 rounded-full font-semibold">From payments</span>
            </div>
            <div className="flex items-end gap-3">
              <span className="text-4xl font-black leading-none text-white">{fmtC(cadBalance)}</span>
              <span className="text-blue-300 text-base font-bold mb-1">CAD</span>
            </div>
            {cadTxs.length > 0 && (
              <div className="mt-3 space-y-1.5 max-h-32 overflow-y-auto">
                {cadTxs.slice(0, 5).map(tx => (
                  <div key={tx.id} className="flex justify-between items-center text-xs">
                    <span className="text-blue-200 truncate max-w-[180px]">{tx.description}</span>
                    <span className="text-green-300 font-bold ml-2 shrink-0">+{fmtC(tx.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            {cadTxs.length === 0 && (
              <p className="text-blue-300/60 text-xs mt-1">Payments you receive will appear here</p>
            )}
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Purchased', value: `⚡${fmt(account?.lifetimePurchased ?? 0)}`, icon: <ShoppingBag className="w-4 h-4" /> },
              { label: 'Earned',    value: `⚡${fmt(account?.lifetimeEarned ?? 0)}`,    icon: <TrendingUp className="w-4 h-4" /> },
              { label: 'Withdrawn', value: fmtC(fpApi.fpToCad(account?.lifetimeWithdrawn ?? 0, 'payout')), icon: <ArrowUpRight className="w-4 h-4" /> },
            ].map(s => (
              <div key={s.label} className="bg-white/10 rounded-2xl p-3 text-center">
                <div className="text-blue-300 flex justify-center mb-1">{s.icon}</div>
                <p className="text-white font-black text-xs leading-tight">{s.value}</p>
                <p className="text-blue-300 text-[10px] font-semibold mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-2xl mx-auto px-2 flex gap-0.5 overflow-x-auto pb-0 scrollbar-hide">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-shrink-0 px-3 py-2.5 text-sm font-bold rounded-t-xl transition-colors ${tab === t ? 'bg-gray-50 text-blue-600' : 'text-white/70 hover:text-white hover:bg-white/10'}`}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* ══ OVERVIEW ══════════════════════════════════════════════ */}
        {tab === 'overview' && (
          <>
            {/* FP Converter featured on overview */}
            <FPConverter onBuyWithAmount={cad => { setCustomBuyCad(cad); }} />

            {/* Quick actions */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[
                { label: 'Buy FP',   icon: <ShoppingBag className="w-5 h-5 text-blue-600" />,   bg: 'bg-blue-50',   t: 'buy' as Tab },
                { label: 'Send FP',  icon: <Send className="w-5 h-5 text-purple-600" />,         bg: 'bg-purple-50', t: 'send' as Tab },
                { label: 'Boost',    icon: <Rocket className="w-5 h-5 text-orange-500" />,       bg: 'bg-orange-50', t: 'boost' as Tab },
                { label: 'Withdraw', icon: <ArrowUpRight className="w-5 h-5 text-green-600" />,  bg: 'bg-green-50',  t: 'withdraw' as Tab },
                { label: 'Earn',     icon: <TrendingUp className="w-5 h-5 text-indigo-600" />,   bg: 'bg-indigo-50', t: 'history' as Tab },
                { label: 'History',  icon: <BarChart3 className="w-5 h-5 text-gray-500" />,      bg: 'bg-gray-50',   t: 'history' as Tab },
              ].map(a => (
                <button key={a.label} onClick={() => setTab(a.t)}
                  className="flex flex-col items-center gap-2 bg-white border border-gray-100 rounded-2xl p-3 hover:shadow-md transition-shadow">
                  <div className={`w-10 h-10 ${a.bg} rounded-xl flex items-center justify-center`}>{a.icon}</div>
                  <span className="text-[11px] font-bold text-gray-600 text-center leading-tight">{a.label}</span>
                </button>
              ))}
            </div>

            {/* Rate info */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-black text-gray-900 mb-3 flex items-center gap-2"><Info className="w-4 h-4 text-blue-500" /> FP Rates</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Buy rate',     value: `$${FP.BUY_RATE} CAD / FP`,  badge: 'buy',      color: 'text-blue-700 bg-blue-50' },
                  { label: 'Payout rate',  value: `$${FP.PAYOUT_RATE} CAD / FP`, badge: 'payout', color: 'text-green-700 bg-green-50' },
                  { label: 'Platform fee', value: `${FP.PLATFORM_FEE * 100}% marketplace`, badge: null, color: 'text-orange-700 bg-orange-50' },
                  { label: 'Min. withdraw', value: `$${FP.MIN_WITHDRAWAL_CAD} CAD (${FP.MIN_WITHDRAWAL} FP)`, badge: null, color: 'text-purple-700 bg-purple-50' },
                ].map(r => (
                  <div key={r.label} className={`${r.color} rounded-xl p-3`}>
                    <p className="text-xs font-bold opacity-70">{r.label}</p>
                    <p className="text-sm font-black mt-0.5">{r.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent activity */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-black text-gray-900">Recent Activity</h3>
                <button onClick={() => setTab('history')} className="text-xs text-blue-600 font-semibold">See all</button>
              </div>
              {txs.length === 0 ? (
                <div className="p-8 text-center"><BarChart3 className="w-10 h-10 text-gray-200 mx-auto mb-2" /><p className="text-sm text-gray-400">No activity yet</p></div>
              ) : txs.slice(0, 5).map(tx => <TxRow key={tx.id} tx={tx} />)}
            </div>
          </>
        )}

        {/* ══ BUY FP ════════════════════════════════════════════════ */}
        {tab === 'buy' && (
          <>
            {/* Converter */}
            <FPConverter onBuyWithAmount={cad => setCustomBuyCad(cad)} />

            {/* Packs */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-black text-gray-900 mb-1">Or choose a pack</h3>
              <p className="text-sm text-gray-400 mb-4">Fixed packs offer bonus FP vs. custom amounts</p>
              <div className="space-y-3">
                {FP_PACKS.map(pack => (
                  <button key={pack.id} onClick={() => setBuyPack(pack)}
                    className={`relative w-full flex items-center gap-4 p-4 rounded-2xl border-2 hover:shadow-md transition-all text-left ${pack.popular ? 'border-blue-400 bg-blue-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
                    {pack.popular && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-black px-3 py-0.5 rounded-full whitespace-nowrap">✦ Most Popular</span>}
                    <div className={`w-14 h-14 bg-gradient-to-br ${pack.color} rounded-2xl flex flex-col items-center justify-center shrink-0`}>
                      <span className="text-white font-black text-sm">⚡{pack.fp >= 1000 ? '1K' : pack.fp}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-gray-900">{pack.label} Pack</p>
                      <p className="text-sm text-gray-400">⚡{pack.fp.toLocaleString()} FP</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-black text-gray-900">${pack.cad}</p>
                      <p className="text-xs text-gray-400">CAD</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
              <Shield className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700">FP are non-refundable. All earnings deposited in-app. Withdraw anytime from the Withdraw tab (min. $5 CAD).</p>
            </div>
          </>
        )}

        {/* ══ SEND FP ═══════════════════════════════════════════════ */}
        {tab === 'send' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h3 className="font-black text-gray-900 flex items-center gap-2"><Send className="w-5 h-5 text-purple-500" /> Send FP to a User</h3>

              {/* Recipient search */}
              {!sendTarget ? (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text" value={sendQuery} onChange={e => setSendQuery(e.target.value)}
                    placeholder="Search by name or @username…"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                  {sendResults.length > 0 && (
                    <div className="mt-1 bg-white border border-gray-100 rounded-2xl shadow-lg overflow-hidden">
                      {sendResults.map(u => (
                        <button key={u.id} onClick={() => { setSendTarget(u); setSendQuery(''); }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-black shrink-0">
                            {u.avatar ? <img src={u.avatar} alt="" className="w-full h-full rounded-xl object-cover" /> : u.name?.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">{u.name}</p>
                            {u.username && <p className="text-xs text-gray-400">@{u.username}</p>}
                          </div>
                          <div className="ml-auto">
                            <span className="text-xs bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full">⚡{fpApi.fmt(fpApi.getBalance(u.id))}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-2xl p-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center text-white font-black shrink-0">
                    {sendTarget.avatar ? <img src={sendTarget.avatar} alt="" className="w-full h-full rounded-xl object-cover" /> : sendTarget.name?.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-black text-gray-900">{sendTarget.name}</p>
                    {sendTarget.username && <p className="text-xs text-gray-400">@{sendTarget.username}</p>}
                  </div>
                  <button onClick={() => setSendTarget(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                </div>
              )}

              {/* Amount - FP and CAD linked */}
              <div>
                <label className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2 block">Amount</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-yellow-500 font-black">⚡</span>
                    <input type="number" min="1" value={sendFpAmt}
                      onChange={e => { setSendFpAmt(e.target.value); const n = parseInt(e.target.value); setSendCadAmt(n > 0 ? (n * FP.BUY_RATE).toFixed(2) : ''); }}
                      placeholder="FP amount"
                      className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-purple-400" />
                  </div>
                  <span className="text-gray-400 font-bold text-sm">=</span>
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                    <input type="number" min="0" step="0.01" value={sendCadAmt}
                      onChange={e => { setSendCadAmt(e.target.value); const n = parseFloat(e.target.value); setSendFpAmt(n > 0 ? fpApi.cadToFp(n).toString() : ''); }}
                      placeholder="CAD equiv."
                      className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-purple-400" />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">Your balance: ⚡{fmt(balance)} FP</p>
              </div>

              {/* Note */}
              <div>
                <label className="text-xs font-black text-gray-500 uppercase tracking-wide mb-1 block">Note (optional)</label>
                <input type="text" value={sendNote} onChange={e => setSendNote(e.target.value)} placeholder="Add a message…" maxLength={100}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>

              <button onClick={doSend} disabled={sendLoading || !sendTarget || !sendFpAmt}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-black rounded-2xl py-4 transition-colors">
                {sendLoading ? <><Loader2 className="w-5 h-5 animate-spin" />Sending…</> : <><Send className="w-5 h-5" /> Send ⚡{sendFpAmt || '0'} FP</>}
              </button>
            </div>

            <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 flex items-start gap-3">
              <Info className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
              <p className="text-sm text-purple-700">FP transfers are instant and irreversible. The recipient can withdraw their FP to CAD at any time.</p>
            </div>
          </div>
        )}

        {/* ══ BOOST ═════════════════════════════════════════════════ */}
        {tab === 'boost' && (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-black text-gray-900 mb-1 flex items-center gap-2"><Rocket className="w-5 h-5 text-orange-500" /> Boost Content</h3>
              <p className="text-sm text-gray-500 mb-4">Spend FP to amplify your listings and posts in the marketplace feed.</p>
              <div className="space-y-3">
                {BOOST_OPTIONS.map(opt => {
                  const canAfford = balance >= opt.fp;
                  return (
                    <div key={opt.id} className={`p-5 rounded-2xl border-2 ${canAfford ? 'border-gray-200 hover:border-orange-300' : 'border-gray-100 opacity-60'} bg-white transition-all`}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-black text-gray-900 flex items-center gap-2">
                            {opt.label}{opt.id === 'b_featured' && <Crown className="w-4 h-4 text-yellow-500" />}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{opt.days} days · {opt.reach}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-black text-orange-500">⚡{opt.fp}</p>
                          <p className="text-[10px] text-gray-400">≈ {fmtC(fpApi.fpToCad(opt.fp))}</p>
                        </div>
                      </div>
                      <button onClick={() => canAfford ? setBoostOpt(opt.id) : toast.error('Insufficient FP')}
                        className={`w-full flex items-center justify-center gap-1.5 text-sm font-bold px-4 py-2.5 rounded-xl transition-colors ${canAfford ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                        <Rocket className="w-4 h-4" /> Boost
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ══ WITHDRAW ══════════════════════════════════════════════ */}
        {tab === 'withdraw' && (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
              <div>
                <h3 className="font-black text-gray-900 mb-1">Withdraw Earnings</h3>
                <p className="text-sm text-gray-500">Min. $5 CAD · Payout rate: ${FP.PAYOUT_RATE}/FP · 5% fee</p>
              </div>

              {/* Pending banner */}
              {account?.withdrawalPending && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-amber-500 animate-spin shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-amber-800">Withdrawal in Progress</p>
                    <p className="text-xs text-amber-600">
                      3–5 business days to your {PAYOUT_METHODS.find(p => p.id === savedPayoutMethod)?.label || 'account'}
                      {savedPayoutDetails ? ` (${savedPayoutDetails})` : ''}
                    </p>
                  </div>
                </div>
              )}

              {/* ── Payout Account (single saved slot) ───────────── */}
              <div>
                <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">1. Payout Account</p>

                {savedPayoutDetails && !editingPayout ? (
                  /* Saved card display */
                  <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl p-4">
                    <div className="w-11 h-11 bg-white border border-green-200 rounded-xl flex items-center justify-center text-2xl shrink-0">
                      {PAYOUT_METHODS.find(p => p.id === savedPayoutMethod)?.icon || '💳'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-gray-900">
                        {PAYOUT_METHODS.find(p => p.id === savedPayoutMethod)?.label || 'Payout method'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {(() => {
                          try {
                            const parsed = JSON.parse(savedPayoutDetails);
                            if (parsed.last4) return `•••• •••• •••• ${parsed.last4} · ${parsed.cardName}`;
                            return savedPayoutDetails;
                          } catch { return savedPayoutDetails; }
                        })()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <button
                        disabled={sendingOTP}
                        onClick={() => requireOTP('change', () => {
                          setDraftMethod(savedPayoutMethod || 'paypal');
                          setDraftDetails('');
                          setCardFormData(null);
                          setEditingPayout(true);
                        })}
                        className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 border border-blue-200 bg-white px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {sendingOTP ? <Loader2 className="w-3 h-3 animate-spin" /> : <Edit2 className="w-3 h-3" />}
                        Change
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Add / Edit form */
                  <div className="space-y-3 border-2 border-blue-100 rounded-2xl p-4 bg-blue-50/30">
                    {editingPayout && (
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-blue-700">Edit payout account</p>
                        <button onClick={() => setEditingPayout(false)} className="text-xs text-gray-400 hover:text-gray-600 font-semibold">Cancel</button>
                      </div>
                    )}

                    {/* Method icons */}
                    <div className="grid grid-cols-3 gap-2">
                      {PAYOUT_METHODS.map(m => (
                        <button key={m.id} onClick={() => setDraftMethod(m.id)}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                            draftMethod === m.id
                              ? 'border-blue-500 bg-white shadow-sm'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}>
                          <span className="text-2xl leading-none">{m.icon}</span>
                          <span className={`text-[11px] font-bold text-center leading-tight ${draftMethod === m.id ? 'text-blue-700' : 'text-gray-600'}`}>
                            {m.label}
                          </span>
                          {draftMethod === m.id && <CheckCircle className="w-3 h-3 text-blue-500" />}
                        </button>
                      ))}
                    </div>

                    {/* Details field — card or simple text */}
                    {(draftMethod === 'credit' || draftMethod === 'debit') ? (
                      <CardPayoutForm onChange={setCardFormData} />
                    ) : (
                      <input
                        type={draftMethod === 'paypal' || draftMethod === 'etransfer' ? 'email' : 'text'}
                        value={draftDetails}
                        onChange={e => setDraftDetails(e.target.value)}
                        placeholder={PAYOUT_METHODS.find(p => p.id === draftMethod)?.placeholder || 'Account details'}
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                      />
                    )}

                    {/* Save */}
                    <button
                      onClick={() => {
                        let details = draftDetails;

                        if (draftMethod === 'credit' || draftMethod === 'debit') {
                          if (!cardFormData?.cardNum || !cardFormData?.cardName || !cardFormData?.expiry || !cardFormData?.cvc) {
                            toast.error('Fill in all card fields'); return;
                          }
                          if (!cardFormData.street || !cardFormData.city || !cardFormData.province || !cardFormData.postal) {
                            toast.error('Fill in your billing address'); return;
                          }
                          const last4 = cardFormData.cardNum.replace(/\s/g, '').slice(-4);
                          details = JSON.stringify({
                            last4,
                            cardName: cardFormData.cardName,
                            expiry: cardFormData.expiry,
                            billingCity: cardFormData.city,
                            billingPostal: cardFormData.postal,
                          });
                        } else {
                          if (!details.trim()) { toast.error('Enter your payout details'); return; }
                        }

                        fpApi.savePayoutInfo(user!.id, draftMethod, details);
                        setSavedPayoutMethod(draftMethod);
                        setSavedPayoutDetails(details);
                        setEditingPayout(false);
                        setCardFormData(null);
                        toast.success('✅ Payout account saved');
                        refresh();
                      }}
                      disabled={
                        (draftMethod === 'credit' || draftMethod === 'debit')
                          ? !cardFormData?.cardNum
                          : !draftDetails.trim()
                      }
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-black rounded-xl py-3 text-sm transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" /> Save Payout Account
                    </button>
                  </div>
                )}
              </div>

              {/* ── Amount ──────────────────────────────────────────── */}
              <div>
                <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">2. Amount</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-yellow-500 font-black text-sm">⚡</span>
                    <input
                      type="number" min={FP.MIN_WITHDRAWAL} max={balance}
                      value={withdrawFpInput}
                      onChange={e => handleWithdrawFp(e.target.value)}
                      placeholder={`Min. ${FP.MIN_WITHDRAWAL} FP`}
                      className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                  <span className="text-gray-400 font-bold shrink-0">→</span>
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={withdrawCadInput}
                      onChange={e => handleWithdrawCad(e.target.value)}
                      placeholder="CAD payout"
                      className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Balance: ⚡{fmt(balance)} FP · Min. ⚡{FP.MIN_WITHDRAWAL} (≈ $5 CAD)</p>

                {withdrawFpInput && parseInt(withdrawFpInput) >= FP.MIN_WITHDRAWAL && (
                  <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-4 text-sm space-y-1.5">
                    <div className="flex justify-between text-gray-600"><span>⚡ FP redeemed</span><span className="font-bold text-gray-900">{parseInt(withdrawFpInput).toLocaleString()} FP</span></div>
                    <div className="flex justify-between text-gray-600"><span>Gross (${FP.PAYOUT_RATE}/FP)</span><span className="font-bold text-gray-900">{fmtC(parseInt(withdrawFpInput) * FP.PAYOUT_RATE)}</span></div>
                    <div className="flex justify-between text-gray-600"><span>Fee (5%)</span><span className="font-bold text-red-500">-{fmtC(parseInt(withdrawFpInput) * FP.PAYOUT_RATE * FP.WITHDRAWAL_FEE)}</span></div>
                    <div className="flex justify-between border-t border-green-200 pt-2">
                      <span className="font-black text-green-800">You receive</span>
                      <span className="font-black text-green-700 text-base">{fmtC(parseInt(withdrawFpInput) * FP.PAYOUT_RATE * (1 - FP.WITHDRAWAL_FEE))} CAD</span>
                    </div>
                    {savedPayoutDetails && (
                      <div className="flex justify-between text-xs text-gray-400 pt-0.5">
                        <span>Sent via</span>
                        <span className="font-semibold">
                          {PAYOUT_METHODS.find(p => p.id === savedPayoutMethod)?.icon} {PAYOUT_METHODS.find(p => p.id === savedPayoutMethod)?.label} · {savedPayoutDetails}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Submit */}
              <button
                onClick={doWithdraw}
                disabled={withdrawing || !!account?.withdrawalPending || balance < FP.MIN_WITHDRAWAL || !savedPayoutDetails || editingPayout}
                className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-black rounded-2xl py-4 transition-colors"
              >
                {withdrawing
                  ? <><Loader2 className="w-5 h-5 animate-spin" />Processing…</>
                  : <><ArrowUpRight className="w-5 h-5" /> Request Withdrawal</>}
              </button>

              {balance < FP.MIN_WITHDRAWAL && (
                <p className="text-xs text-center text-gray-400">
                  Need ⚡{FP.MIN_WITHDRAWAL - balance} more FP to reach minimum.{' '}
                  <button onClick={() => setTab('buy')} className="text-blue-500 underline">Buy FP →</button>
                </p>
              )}
            </div>

            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-xs text-gray-500 space-y-1.5">
              <p className="font-bold text-gray-700">Withdrawal Policy</p>
              <p>• Minimum: $5 CAD ({FP.MIN_WITHDRAWAL} FP) · 5% processing fee applied</p>
              <p>• Payout rate: ${FP.PAYOUT_RATE}/FP · Buy rate: ${FP.BUY_RATE}/FP</p>
              <p>• One withdrawal at a time · 3–5 business days to process</p>
              <p>• You can change your payout account at any time before requesting</p>
            </div>
          </>
        )}

        {/* ══ HISTORY ═══════════════════════════════════════════════ */}
        {tab === 'history' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-50">
              <h3 className="text-sm font-black text-gray-900">Transaction History</h3>
              <p className="text-xs text-gray-400 mt-0.5">{txs.length} total</p>
            </div>
            {txs.length === 0 ? (
              <div className="p-10 text-center"><BarChart3 className="w-10 h-10 text-gray-200 mx-auto mb-2" /><p className="text-sm text-gray-400">No transactions yet</p></div>
            ) : txs.map(tx => <TxRow key={tx.id} tx={tx} />)}
          </div>
        )}
      </div>

      {/* Modals */}
      {(buyPack || customBuyCad !== null) && (
        <BuyModal
          pack={buyPack}
          customCad={customBuyCad ?? undefined}
          userEmail={user?.email || ''}
          userId={user?.id || ''}
          onClose={() => { setBuyPack(null); setCustomBuyCad(null); }}
          onConfirm={() => {
            // FP is credited in the payment success handler after redirect back
            setBuyPack(null); setCustomBuyCad(null);
          }}
        />
      )}
      {boostOpt && user && (
        <BoostPickerModal userId={user.id} boostId={boostOpt} onClose={() => { setBoostOpt(null); refresh(); }} />
      )}

      {/* Phone OTP verification modal */}
      {verifyOpen && user?.phone && (
        <PhoneVerifyModal
          phone={user.phone}
          userId={user.id}
          action={verifyAction}
          initialToken={otpToken}
          onNewToken={setOtpToken}
          onVerified={() => { verifyCallback?.(); }}
          onClose={() => { setVerifyOpen(false); setVerifyCallback(null); setOtpToken(''); }}
        />
      )}
    </div>
  );
}