import React, { useState } from 'react';

export interface CardData {
  paymentMethodId: string;
  last4: string;
  brand: string;
  name: string;
  // raw fields sent to edge function for server-side tokenization
  _raw?: { number: string; exp_month: string; exp_year: string; cvc: string };
}
export interface BillingData {
  address: string; city: string; province: string; postal: string; country: string;
}
interface Props {
  onComplete: (card: CardData, billing: BillingData) => void;
  prefillName?: string;
  buttonLabel?: string;
  amountLabel?: string;
}

function fmt(v: string) { return v.replace(/\D/g,'').slice(0,16).replace(/(\d{4})(?=\d)/g,'$1 '); }
function fmtExp(v: string) { const d=v.replace(/\D/g,'').slice(0,4); return d.length>2?d.slice(0,2)+'/'+d.slice(2):d; }
function brand(n: string) {
  const d=n.replace(/\D/g,'');
  if(/^4/.test(d)) return 'Visa';
  if(/^5[1-5]|^2[2-7]/.test(d)) return 'Mastercard';
  if(/^3[47]/.test(d)) return 'Amex';
  return 'Card';
}

export function StripeCardForm({ onComplete, prefillName='', buttonLabel='Pay', amountLabel }: Props) {
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc,    setCvc]    = useState('');
  const [name,   setName]   = useState(prefillName);
  const [errors, setErrors] = useState<Record<string,string>>({});

  const validate = () => {
    const e: Record<string,string> = {};
    const raw = number.replace(/\s/g,'');
    if (raw.length < 13) e.number = 'Enter a valid card number';
    if (expiry.length < 5) e.expiry = 'Enter expiry (MM/YY)';
    else {
      const [mm,yy] = expiry.split('/');
      const now = new Date();
      const yr = 2000+parseInt(yy), mo = parseInt(mm);
      if (mo<1||mo>12) e.expiry='Invalid month';
      else if (yr<now.getFullYear()||(yr===now.getFullYear()&&mo<now.getMonth()+1)) e.expiry='Card expired';
    }
    if (cvc.length < 3) e.cvc = 'Enter CVC';
    if (!name.trim()) e.name = 'Enter cardholder name';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const raw = number.replace(/\s/g,'');
    const [mm,yy] = expiry.split('/');
    onComplete({
      paymentMethodId: 'pending', // edge function creates the real pm_xxx
      last4: raw.slice(-4),
      brand: brand(number),
      name,
      _raw: { number: raw, exp_month: mm, exp_year: '20'+yy, cvc },
    }, { address:'', city:'', province:'', postal:'', country:'Canada' });
  };

  const inp = (k: string) => `w-full border-2 rounded-xl px-4 py-3 text-sm outline-none transition-colors ${errors[k]?'border-red-400 bg-red-50':'border-gray-200 focus:border-blue-500'}`;

  return (
    <div className="space-y-3">

      {/* Card number */}
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Card Number</label>
        <div className="relative">
          <input type="text" inputMode="numeric" value={number}
            onChange={e => { setNumber(fmt(e.target.value)); setErrors(p=>({...p,number:''})); }}
            placeholder="1234 5678 9012 3456" maxLength={19}
            className={inp('number')+' pr-16'} />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
            {brand(number)}
          </div>
        </div>
        {errors.number && <p className="text-xs text-red-500 mt-1">⚠ {errors.number}</p>}
      </div>

      {/* Expiry + CVC */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Expiry</label>
          <input type="text" inputMode="numeric" value={expiry}
            onChange={e => { setExpiry(fmtExp(e.target.value)); setErrors(p=>({...p,expiry:''})); }}
            placeholder="MM / YY" maxLength={5}
            className={inp('expiry')} />
          {errors.expiry && <p className="text-xs text-red-500 mt-1">⚠ {errors.expiry}</p>}
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">CVC</label>
          <input type="text" inputMode="numeric" value={cvc}
            onChange={e => { setCvc(e.target.value.replace(/\D/g,'').slice(0,4)); setErrors(p=>({...p,cvc:''})); }}
            placeholder="123" maxLength={4}
            className={inp('cvc')} />
          {errors.cvc && <p className="text-xs text-red-500 mt-1">⚠ {errors.cvc}</p>}
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Cardholder Name</label>
        <input type="text" value={name}
          onChange={e => { setName(e.target.value); setErrors(p=>({...p,name:''})); }}
          placeholder="John Doe"
          className={inp('name')} />
        {errors.name && <p className="text-xs text-red-500 mt-1">⚠ {errors.name}</p>}
      </div>

      {/* Security note */}
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
        <svg width="11" height="13" viewBox="0 0 24 24" fill="#9ca3af"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
        <span className="text-[11px] text-gray-400">Processed securely</span>
      </div>

      <button type="button" onClick={handleSubmit}
        className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold rounded-2xl py-3.5 transition-all text-sm">
        {buttonLabel}{amountLabel ? ` — ${amountLabel}` : ''}
      </button>
    </div>
  );
}