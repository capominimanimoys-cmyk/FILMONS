import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckRounded, CloseRounded } from '../components/Icons';
import { useSearchParams, useNavigate, Link } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { chatApi, listingsApi, authApi } from '../lib/api';
import { ChatMessage, Listing } from '../types';
import { UserAvatar } from '../components/AccountTypeBadge';
import { toast } from 'sonner';
import { fpApi, cadWalletApi } from '../lib/fpSystem';
import {
  ArrowLeft, CreditCard, MapPin, Truck, CheckCircle,
  CalendarDays, Clock, ShieldCheck, ChevronRight, Loader2,
  Package, Search, X,
} from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { supabase } from '../../lib/supabase';

import { RentalAgreementModal, SignedAgreementData } from '../components/RentalAgreementModal';
import emailjs from '@emailjs/browser';
import { EMAILJS_CONFIG } from '../lib/emailjs-config';

// ── helpers ────────────────────────────────────────────────────────
function getConversations() {
  try { return JSON.parse(localStorage.getItem('filmons_conversations') || '[]'); } catch { return []; }
}
function saveConversations(convs: any[]) {
  localStorage.setItem('filmons_conversations', JSON.stringify(convs));
}
function getListings(): Listing[] {
  try { return JSON.parse(localStorage.getItem('filmons_listings') || '[]'); } catch { return []; }
}

import { PaymentLogo } from '../components/PaymentLogos';
import { StripeCardForm } from '../components/StripeCardForm';

const CARD_METHODS = ['Credit/Debit Card'];

// ── Steps ─────────────────────────────────────────────────────────
type Step = 'review' | 'payment' | 'confirm' | 'done';

// ── Full address formatter ──────────────────────────────────────────
function formatAddress(listing: Listing | null): string | null {
  if (!listing?.city) return null;
  return [listing.streetAddress, listing.city, listing.province, listing.postalCode].filter(Boolean).join(', ') || null;
}

// ── Delivery address geocoder ──────────────────────────────────────
interface PlaceSuggestion { place_id: string; description: string; }
interface AddressFields { street: string; city: string; province: string; postal: string; }

function DeliveryAddressInput({ value, onChange }: { value: AddressFields; onChange: (a: AddressFields) => void }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query || query.length < 3) { setSuggestions([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879/geocode/autocomplete?input=${encodeURIComponent(query)}&country=ca`,
          { headers: { Authorization: `Bearer ${publicAnonKey}` } }
        );
        const data = await res.json();
        setSuggestions(data.predictions || []);
        setOpen(true);
      } catch { setSuggestions([]); }
      finally { setLoading(false); }
    }, 350);
  }, [query]);

  const selectSuggestion = async (s: PlaceSuggestion) => {
    setOpen(false);
    setQuery(s.description);
    setSuggestions([]);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879/geocode/details?place_id=${s.place_id}`,
        { headers: { Authorization: `Bearer ${publicAnonKey}` } }
      );
      const data = await res.json();
      const comps: any[] = data.result?.address_components || [];
      let streetNum = '', route = '', city = '', province = '', postal = '';
      comps.forEach((c: any) => {
        if (c.types.includes('street_number')) streetNum = c.long_name;
        if (c.types.includes('route')) route = c.long_name;
        if (c.types.includes('locality') || c.types.includes('sublocality_level_1')) city = c.long_name;
        if (c.types.includes('administrative_area_level_1')) province = c.short_name;
        if (c.types.includes('postal_code')) postal = c.long_name;
      });
      const street = [streetNum, route].filter(Boolean).join(' ');
      onChange({ street, city, province, postal });
      setQuery([street, city, province, postal].filter(Boolean).join(', '));
    } catch { toast.error('Could not fetch address details'); }
  };

  const hasValue = value.city || value.street;

  if (hasValue && !manualMode) {
    return (
      <div className="space-y-2">
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
          <MapPin className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            {value.street && <p className="text-sm font-semibold text-blue-800">{value.street}</p>}
            <p className="text-sm text-blue-700">{[value.city, value.province, value.postal].filter(Boolean).join(', ')}</p>
          </div>
          <button onClick={() => { onChange({ street: '', city: '', province: '', postal: '' }); setQuery(''); setManualMode(false); }}
            className="text-blue-400 hover:text-blue-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Autocomplete search */}
      {!manualMode && (
        <div className="relative">
          <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              autoComplete="off"
              placeholder="Search your delivery address…"
              value={query}
              onChange={e => { setQuery(e.target.value); if (!e.target.value) setSuggestions([]); }}
              onFocus={() => suggestions.length > 0 && setOpen(true)}
              className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
            />
            {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />}
            {query && !loading && <button onClick={() => { setQuery(''); setSuggestions([]); setOpen(false); }} className="text-gray-400"><X className="w-4 h-4" /></button>}
          </div>
          {open && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden">
              {suggestions.map(s => (
                <button key={s.place_id} type="button"
                  onMouseDown={e => { e.preventDefault(); selectSuggestion(s); }}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left">
                  <MapPin className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-700 leading-snug">{s.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual fill toggle */}
      {!manualMode ? (
        <button type="button" onClick={() => setManualMode(true)}
          className="text-xs text-blue-600 hover:text-blue-700 font-semibold underline underline-offset-2">
          Enter address manually instead
        </button>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-2">
            {([
              { key: 'street',   label: 'Street Address',   placeholder: '123 King St' },
              { key: 'city',     label: 'City',             placeholder: 'Toronto'     },
              { key: 'province', label: 'Province',         placeholder: 'ON'          },
              { key: 'postal',   label: 'Postal Code',      placeholder: 'M5V 2T6'    },
            ] as { key: keyof AddressFields; label: string; placeholder: string }[]).map(f => (
              <div key={f.key}>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{f.label}</label>
                <input
                  value={value[f.key]}
                  onChange={e => onChange({ ...value, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setManualMode(false)}
            className="text-xs text-blue-600 hover:text-blue-700 font-semibold underline underline-offset-2">
            ← Search instead
          </button>
        </div>
      )}
    </div>
  );
}

export function Checkout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const convId = params.get('conv') || '';
  const msgId  = params.get('msg')  || '';

  const [step, setStep] = useState<Step>('review');
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [showAgreementModal, setShowAgreementModal] = useState(false);
  const [signedAgreement, setSignedAgreement] = useState<SignedAgreementData | null>(null);
  const [cardData, setCardData] = useState<any>(null);
  const [msg, setMsg]   = useState<ChatMessage | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [hostUser, setHostUser] = useState<any>(null);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [stripeRedirecting, setStripeRedirecting] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState('');

  // Handle return from secure checkout after card payment
  useEffect(() => {
    const checkoutSuccess = params.get('checkout_success');
    const sessionId       = params.get('session_id');
    if (checkoutSuccess !== '1' || !sessionId || !user) return;

    (async () => {
      toast.loading('Verifying payment…', { id: 'checkout-verify' });
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/stripe-charge/verify?session_id=${sessionId}`,
          { headers: { Authorization: `Bearer ${publicAnonKey}` } }
        );
        const result = await res.json();
        toast.dismiss('checkout-verify');
        if (!res.ok || result.error) { toast.error(result.error || 'Payment verification failed'); return; }

        // Credit host's CAD wallet
        if (hostUser?.id && result.cad_amount > 0) {
          cadWalletApi.onPaymentReceived(
            hostUser.id, result.cad_amount,
            `Card payment for "${msg?.paymentRequest?.listingTitle || 'listing'}"`,
            { method: 'Credit/Debit Card', stripe_session: sessionId }
          );
          supabase.from('transactions').insert([
            { user_id: user.id, type: 'order_payment', fp_amount: 0, cad_amount: -(result.cad_amount), description: `Card payment for "${msg?.paymentRequest?.listingTitle}"`, status: 'completed', payment_method: 'stripe', stripe_session_id: sessionId, counterpart_id: hostUser.id },
            { user_id: hostUser.id, type: 'order_earning', fp_amount: 0, cad_amount: result.cad_amount, description: `Payment for "${msg?.paymentRequest?.listingTitle}"`, status: 'completed', payment_method: 'stripe', stripe_session_id: sessionId, counterpart_id: user.id },
          ]).catch(() => {});
          window.dispatchEvent(new CustomEvent('filmons:wallet:updated', { detail: { userId: hostUser.id } }));
        }
        setStep('done');
        window.history.replaceState({}, '', `${window.location.pathname}?conv=${convId}&msg=${msgId}`);
        toast.success('✅ Payment confirmed!');
      } catch (e: any) {
        toast.dismiss('checkout-verify');
        toast.error(`Verification failed: ${e?.message}`);
      }
    })();
  }, [params.get('checkout_success'), user?.id, hostUser?.id]);
  const [deliveryAddress, setDeliveryAddress] = useState<AddressFields>({ street: '', city: '', province: '', postal: '' });
  const [submitting, setSubmitting] = useState(false);
  // ── Load payment request ───────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      // 1. Try localStorage first
      const convs = getConversations();
      const conv = convs.find((c: any) => c.id === convId);
      let found = conv?.messages?.find((m: any) => m.id === msgId && m.type === 'payment_request');

      // 2. If not in localStorage, fetch directly from Supabase
      if (!found) {
        try {
          const { data } = await supabase
            .from('messages')
            .select('*')
            .eq('id', msgId)
            .eq('type', 'payment_request')
            .single();
          if (data) {
            const meta = typeof data.metadata === 'string'
              ? (() => { try { return JSON.parse(data.metadata); } catch { return {}; } })()
              : (data.metadata || {});
            found = {
              id:             data.id,
              senderId:       data.sender_id,
              senderName:     data.sender_name   || '',
              senderAvatar:   data.sender_avatar || undefined,
              type:           'payment_request',
              content:        data.content       || '',
              paymentRequest: meta.paymentRequest || undefined,
              createdAt:      data.created_at,
            };
          }
        } catch (e) {
          console.warn('Checkout: Supabase fetch failed:', e);
        }
      }

      if (!found) { toast.error('Payment request not found'); navigate('/inbox'); return; }
      setMsg(found);

      if (found.paymentRequest?.listingId) {
        const all = getListings();
        const l = all.find((x: Listing) => x.id === found.paymentRequest!.listingId) || null;
        setListing(l);
        if (l?.paymentMethods?.length) setSelectedMethod(l.paymentMethods[0]);
        if (l?.deliveryOptions?.length) setSelectedDelivery(l.deliveryOptions[0]);
      }

      if (found.senderId) {
        authApi.getUserById(found.senderId).then(u => {
          if (u) setHostUser(u);
        }).catch(() => {});
      }
    };
    load();
  }, [convId, msgId]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Please <Link to="/login" className="text-blue-600 underline">sign in</Link> to continue.</p>
      </div>
    );
  }

  if (!msg) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  const pay = msg.paymentRequest!;
  const isPaid = pay.status === 'paid';
  const isFPPayment  = selectedMethod === 'FP';
  const isCardMethod = selectedMethod === 'Credit/Debit Card';
  const availableMethods = (listing?.paymentMethods?.length
    ? listing.paymentMethods
    : ['Credit/Debit Card', 'FP']
  ).filter((m: string) => m !== 'Cash');
  const availableDelivery = listing?.deliveryOptions?.length
    ? listing.deliveryOptions
    : ['pickup'];

  const kind = pay.listingType === 'service' ? 'service' : pay.listingMode === 'sale' ? 'sale' : 'rental';
  const kindColors: Record<string, string> = {
    rental: 'bg-blue-100 text-blue-700',
    service: 'bg-purple-100 text-purple-700',
    sale: 'bg-orange-100 text-orange-700',
  };

  const gearAddress = formatAddress(listing);
  const effectiveDelivery = selectedDelivery || availableDelivery[0];

  const deliveryFee = effectiveDelivery === 'delivery' && listing?.deliveryPrice && listing.deliveryPrice > 0
    ? listing.deliveryPrice
    : 0;
  const totalAmount = (Number(pay?.amount) || 0) + deliveryFee;
  const fpEquivalent = isFPPayment ? totalAmount : fpApi.cadToFp(totalAmount);

  const deliveryAddrStr = [deliveryAddress.street, deliveryAddress.city, deliveryAddress.province, deliveryAddress.postal].filter(Boolean).join(', ');

  // ── Complete payment ───────────────────────────────────────────
  const handlePay = async () => {
    if (!selectedMethod) { toast.error('Please select a payment method'); return; }
    if (availableDelivery.length > 1 && !selectedDelivery) { toast.error('Please select a delivery option'); return; }
    if (effectiveDelivery === 'delivery' && !deliveryAddress.city) {
      toast.error('Please enter your delivery address'); return;
    }

    // ── Card payment → Stripe Checkout ──────────────────────────
    if (isCardMethod) {
      setStripeRedirecting(true);
      try {
        const successUrl = window.location.href + (window.location.href.includes('?') ? '&' : '?')
          + `checkout_success=1&method=card&session_id={CHECKOUT_SESSION_ID}`;
        const { data, error } = await supabase.functions.invoke('stripe-charge', {
          body: {
            amount_cad:     totalAmount,
            user_id:        user?.id,
            fp_amount:      0,
            description:    `Payment for "${pay.listingTitle}" via Filmons`,
            customer_email: user?.email || '',
            success_url:    successUrl,
            cancel_url:     window.location.href,
            metadata_type:  'order_payment',
            host_id:        hostUser?.id,
            listing_title:  pay.listingTitle,
          },
        });
        if (error || !data?.url) { toast.error(data?.error || 'Could not start payment'); setStripeRedirecting(false); return; }
        window.location.href = data.url;
      } catch (e: any) {
        toast.error(`Payment error: ${e?.message}`);
        setStripeRedirecting(false);
      }
      return;
    }

    // ── FP payment — check balance ───────────────────────────────
    if (isFPPayment) {
      const fpBalance = fpApi.getBalance(user!.id);
      if (fpBalance < totalAmount) {
        toast.error(`Insufficient FP balance. You have ⚡${fpBalance} but need ⚡${totalAmount}. Buy more FP first.`);
        return;
      }
    }

    setSubmitting(true);

    const updatedPayment = {
      ...pay,
      status: 'paid',
      paymentMethod: selectedMethod,
      deliveryOption: effectiveDelivery,
      deliveryAddress: effectiveDelivery === 'delivery' ? deliveryAddrStr : undefined,
      deliveryFee: deliveryFee > 0 ? deliveryFee : undefined,
      totalPaid: totalAmount,
    };

    // 1. Update localStorage
    const convs = getConversations();
    const cIdx = convs.findIndex((c: any) => c.id === convId);
    if (cIdx > -1) {
      convs[cIdx].messages = convs[cIdx].messages.map((m: any) =>
        m.id === msgId && m.type === 'payment_request'
          ? { ...m, paymentRequest: updatedPayment }
          : m
      );
      saveConversations(convs);
    }

    // 2. Update Supabase — merge paid status into message metadata
    try {
      const { data: existing } = await supabase
        .from('messages').select('metadata').eq('id', msgId).single();
      const currentMeta = (typeof existing?.metadata === 'string'
        ? (() => { try { return JSON.parse(existing.metadata); } catch { return {}; } })()
        : existing?.metadata) || {};
      await supabase.from('messages').update({
        metadata: { ...currentMeta, paymentRequest: updatedPayment },
      }).eq('id', msgId);
    } catch (e) {
      console.warn('Supabase payment update failed:', e);
    }

    // 3. Mark listing as sold if it's a sale item
    if (pay.listingId && (pay.listingMode === 'sale' || pay.listingType !== 'service')) {
      listingsApi.markListingSold(pay.listingId).catch(() => {});
    }

    // 4. Credit the correct wallet based on payment method + notify host
    if (hostUser?.id && totalAmount > 0) {
      const isPayingWithFP = selectedMethod === 'FP' || selectedMethod?.toLowerCase().includes('fp');
      if (isPayingWithFP) {
        // Debit buyer's FP, credit host's FP wallet
        fpApi.debit(user!.id, totalAmount, 'fp_spend' as any, `Payment for "${pay.listingTitle || 'listing'}"`, { listingId: pay.listingId });
        fpApi.credit(hostUser.id, totalAmount, 'marketplace_earn' as any, `Sale: "${pay.listingTitle || 'listing'}"`, { listingId: pay.listingId, buyerId: user?.id });
        // Save transaction to DB
        supabase.from('transactions').insert([
          { user_id: user!.id, type: 'fp_spend', fp_amount: -totalAmount, description: `Payment for "${pay.listingTitle}"`, status: 'completed', listing_title: pay.listingTitle, counterpart_id: hostUser.id, counterpart_name: hostUser.name },
          { user_id: hostUser.id, type: 'fp_receive', fp_amount: totalAmount, description: `Received payment for "${pay.listingTitle}"`, status: 'completed', listing_title: pay.listingTitle, counterpart_id: user!.id, counterpart_name: user?.name },
        ]).catch(() => {});
      } else {
        // Card (handled by redirect — shouldn't reach here)
        cadWalletApi.onPaymentReceived(
          hostUser.id, totalAmount,
          `Payment for "${pay.listingTitle || 'listing'}" via ${selectedMethod}`,
          { listingId: pay.listingId, buyerId: user?.id, msgId, convId, method: selectedMethod }
        );
      }
      // Dispatch event so open wallet pages refresh live
      window.dispatchEvent(new CustomEvent('filmons:wallet:updated', {
        detail: { userId: hostUser.id, type: isPayingWithFP ? 'fp' : 'cad', amount: totalAmount }
      }));
    }

    setSubmitting(false);
    setStep('done');

    // ── After payment: send emails + save to orders table ──────────
    if (signedAgreement) {
      const sa = signedAgreement;
      const today = new Date().toISOString().split('T')[0];
      const signedAt = new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' }) + ' EST';
      const sharedParams = {
        ref_no: sa.refNo, today, signed_at: signedAt,
        renter_name: sa.renterName, renter_email: sa.renterEmail, renter_phone: sa.renterPhone,
        host_name: hostUser?.name || '—', listing_title: pay.listingTitle,
        listing_type: pay.listingType || 'Rental', start_date: pay.startDate || '—',
        duration: `${pay.duration||1} ${pay.durationType||'day(s)'}`,
        payment_method: selectedMethod, total_amount: `$${totalAmount.toFixed(2)}`,
        year: String(new Date().getFullYear()),
      };
      // Email to renter — with their own document links
      emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templates.rentalAgreement, {
        ...sharedParams,
        to_email: sa.renterEmail, to_name: sa.renterName,
        agreement_url: sa.agreementUrl, receipt_url: sa.receiptUrl,
        greeting_message: 'Your payment is confirmed. Your rental agreement and receipt are ready.',
        id_photo_url: sa.idUrl,    // renter can access their own ID
        proof_url: sa.proofUrl,    // renter can access their own proof
        reply_to: EMAILJS_CONFIG.filmons.email,
      }, EMAILJS_CONFIG.publicKey).catch(e => console.warn('Renter email failed:', e));

      // Email to host
      emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templates.rentalAgreement, {
        ...sharedParams,
        to_email: hostUser?.email || EMAILJS_CONFIG.filmons.email, to_name: hostUser?.name || 'Host',
        agreement_url: sa.hostAgreementUrl, receipt_url: sa.receiptUrl,
        greeting_message: `${sa.renterName} has paid. Rental agreement and receipt are attached.`,
        id_photo_url: sa.idUrl, proof_url: sa.proofUrl, reply_to: sa.renterEmail,
      }, EMAILJS_CONFIG.publicKey).catch(e => console.warn('Host email failed:', e));

      // Save transaction first, then order with transaction_id
      const orderId = `ORD-${sa.refNo}`;
      const txId    = `tx_${sa.refNo}_${Date.now()}`;

      supabase.from('transactions').insert({
        id:            txId,
        user_id:       user?.id,
        type:          'order_payment',
        fp_amount:     0,
        cad_amount:    -totalAmount,
        description:   `Payment for ${pay.listingTitle}`,
        status:        'completed',
        payment_method: selectedMethod,
        order_id:      orderId,
        listing_title: pay.listingTitle,
        counterpart_id:   hostUser?.id,
        counterpart_name: hostUser?.name || null,
        metadata: {
          listing_type: pay.listingType,
          start_date:   pay.startDate,
          duration:     pay.duration,
          duration_type: pay.durationType,
          ref_no:       sa.refNo,
          receipt_no:   sa.receiptNo,
        },
      }).then(() => {
        // Save order with transaction reference
        return supabase.from('orders').insert({
          id:                orderId,
          type:              (pay.listingType === 'Service' ? 'service' : pay.listingMode === 'sale' ? 'sale' : 'rental'),
          status:            'paid',
          renter_id:         user?.id,
          host_id:           hostUser?.id,
          renter_name:       sa.renterName,
          renter_email:      sa.renterEmail,
          host_name:         hostUser?.name || null,
          listing_title:     pay.listingTitle,
          listing_type:      pay.listingType || 'Rental',
          start_date:        pay.startDate || null,
          duration:          pay.duration || 1,
          duration_type:     pay.durationType || 'day',
          total_amount:      totalAmount,
          payment_method:    selectedMethod,
          currency:          'CAD',
          transaction_id:    txId,
          agreement_id:      sa.refNo,
          receipt_id:        sa.receiptNo,
          conversation_id:   convId,
          message_id:        msgId,
          agreement_url:     sa.agreementUrl,
          host_agreement_url: sa.hostAgreementUrl,
          receipt_url:       sa.receiptUrl,
          paid_at:           new Date().toISOString(),
        });
      }).catch(e => console.warn('Order/transaction save failed:', e));

      // Also save earning transaction for host
      if (hostUser?.id) {
        supabase.from('transactions').insert({
          user_id:       hostUser.id,
          type:          'order_earning',
          fp_amount:     0,
          cad_amount:    totalAmount * 0.9, // 10% platform fee
          description:   `Earning from ${pay.listingTitle}`,
          status:        'completed',
          order_id:      orderId,
          listing_title: pay.listingTitle,
          counterpart_id:   user?.id,
          counterpart_name: sa.renterName,
          metadata: { ref_no: sa.refNo },
        }).catch(() => {});
      }
    }
  };

  // ── Already paid ───────────────────────────────────────────────
  if (isPaid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Already Paid</h2>
          <p className="text-gray-500 text-sm">This payment has already been completed.</p>
          <button onClick={() => navigate('/inbox')} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 transition-colors">
            Back to Inbox
          </button>
        </div>
      </div>
    );
  }

  // ── Done ──────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center space-y-5">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto animate-bounce">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Payment Complete!</h2>
          <p className="text-gray-500 text-sm">
            {isFPPayment
              ? <>Your payment of <strong className="text-purple-700">⚡{totalAmount.toLocaleString('en-CA')} FP</strong> (≈ ${fpApi.fpToCad(totalAmount).toFixed(2)} CAD) has been confirmed.</>
              : <>Your payment of <strong className="text-gray-800">${(Number(totalAmount) || 0).toLocaleString('en-CA', { minimumFractionDigits: 2 })} CAD</strong> has been confirmed.</>
            }
            {effectiveDelivery === 'delivery'
              ? ' The host will arrange delivery with you.'
              : ' Please coordinate pickup details with the host.'}
          </p>
          <div className="bg-gray-50 rounded-2xl p-4 text-left space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Method</span>
              <span className="font-semibold">{selectedMethod}</span>
            </div>
            {isFPPayment && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">FP Used</span>
                <span className="font-bold text-purple-700">⚡{(Number(totalAmount)||0).toLocaleString('en-CA')} FP ≈ ${fpApi.fpToCad(Number(totalAmount)||0).toFixed(2)} CAD</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Fulfilment</span>
              <span className="font-semibold capitalize">{effectiveDelivery}</span>
            </div>
            {effectiveDelivery === 'pickup' && gearAddress && (
              <div className="flex justify-between items-start text-sm gap-3">
                <span className="text-gray-500 shrink-0">Pickup at</span>
                <span className="font-semibold text-gray-800 text-right">{gearAddress}</span>
              </div>
            )}
            {effectiveDelivery === 'delivery' && deliveryAddrStr && (
              <div className="flex justify-between items-start text-sm gap-3">
                <span className="text-gray-500 shrink-0">Deliver to</span>
                <span className="font-semibold text-gray-800 text-right">{deliveryAddrStr}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => navigate('/inbox')} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 transition-colors">
              Back to Inbox
            </button>
            <button onClick={() => navigate('/')} className="w-full text-gray-600 hover:text-blue-600 font-medium py-2 transition-colors text-sm">
              Browse more listings
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/inbox')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-gray-900">Checkout</h1>
            <p className="text-xs text-gray-400">Secure payment via Filmons</p>
          </div>
          <ShieldCheck className="w-5 h-5 text-green-500" />
        </div>

        {/* Step indicators */}
        <div className="max-w-lg mx-auto px-4 pb-3">
          <div className="flex items-center gap-1">
            {(['review', 'payment', 'confirm'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-1 flex-1">
                <div className={`h-1.5 rounded-full flex-1 transition-all ${
                  step === s ? 'bg-blue-600' :
                  ['review', 'payment', 'confirm'].indexOf(step) > i ? 'bg-blue-300' : 'bg-gray-200'
                }`} />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            {['Review', 'Payment', 'Confirm'].map((label, i) => (
              <span key={label} className={`text-[10px] font-semibold ${i === ['review','payment','confirm'].indexOf(step) ? 'text-blue-600' : 'text-gray-400'}`}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* ── Step 1: Review ── */}
        {step === 'review' && (
          <>
            {hostUser && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                <UserAvatar user={hostUser} size={48} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 mb-0.5">Payment to</p>
                  <p className="font-bold text-gray-900">{hostUser.name}</p>
                  {hostUser.isVerified && (
                    <span className="text-[11px] text-blue-600 font-semibold flex items-center gap-0.5">✓ Verified seller</span>
                  )}
                </div>
              </div>
            )}

            {/* Order Summary */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                <h2 className="font-bold text-gray-900 text-sm">Order Summary</h2>
              </div>
              <div className="p-4 space-y-3">
                {pay.listingTitle && (
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${kindColors[kind]}`}>
                      {kind.charAt(0).toUpperCase() + kind.slice(1)}
                    </span>
                    <span className="text-sm font-semibold text-gray-800 truncate">{pay.listingTitle}</span>
                  </div>
                )}
                {listing?.image && (
                  <img src={listing.image} alt={listing.title} className="w-full h-36 object-cover rounded-xl" />
                )}
                {pay.description && (
                  <p className="text-sm text-gray-600 leading-relaxed">{pay.description}</p>
                )}
                {(pay.startDate || pay.duration) && (
                  <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                    {pay.startDate && (
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <CalendarDays className="w-4 h-4 text-blue-500 shrink-0" />
                        <span>{new Date(pay.startDate).toLocaleDateString('en-CA', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                    )}
                    {pay.duration && pay.durationType && (
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Clock className="w-4 h-4 text-blue-500 shrink-0" />
                        <span>{pay.duration} {pay.duration === 1 ? pay.durationType.replace('s','') : pay.durationType}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Gear / service location */}
                {gearAddress && (
                  <div className="flex items-start gap-2.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                    <MapPin className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">
                        {pay.listingType === 'service' ? 'Service location' : 'Item location'}
                      </p>
                      <p className="text-sm text-gray-700 leading-snug">{gearAddress}</p>
                    </div>
                  </div>
                )}

                {/* Price breakdown */}
                <div className="border-t border-gray-100 pt-3 space-y-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-semibold text-gray-700">${(Number(pay?.amount) || 0).toLocaleString('en-CA', { minimumFractionDigits: 2 })} CAD</span>
                  </div>
                  {listing?.deliveryPrice && listing.deliveryPrice > 0 && availableDelivery.includes('delivery') && (
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-gray-400 flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5 inline-block" /> Delivery fee
                      </span>
                      <span className="text-gray-500">
                        {effectiveDelivery === 'delivery'
                          ? `+$${(Number(listing?.deliveryPrice) || 0).toLocaleString('en-CA', { minimumFractionDigits: 2 })} CAD`
                          : 'if delivery selected'}
                      </span>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between border-t border-gray-100 pt-2 mt-1">
                    <span className="text-sm text-gray-600 font-semibold">Total</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-gray-900">
                        ${(effectiveDelivery === 'delivery' ? totalAmount : pay.amount).toLocaleString('en-CA', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-xs text-gray-400">CAD</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button onClick={() => setStep('payment')}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl py-4 transition-colors shadow-sm">
              Continue to Payment <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* ── Step 2: Payment & Delivery ── */}
        {step === 'payment' && (
          <>
            {/* Payment method */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-600" />
                <h2 className="font-bold text-gray-900 text-sm">Payment Method</h2>
              </div>
              <div className="p-4 space-y-2">
                {availableMethods.map(method => {
                  const isFP   = method === 'FP';
                  const fpBal  = fpApi.getBalance(user?.id || '');
                  const enough = fpBal >= totalAmount;
                  return (
                    <button key={method} onClick={() => setSelectedMethod(method)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                        selectedMethod === method
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <div className="shrink-0">
                        <PaymentLogo method={method} size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`font-semibold text-sm ${selectedMethod === method ? 'text-blue-700' : 'text-gray-700'}`}>
                          {method}
                        </span>
                        {isFP && (
                          <p className={`text-xs mt-0.5 ${enough ? 'text-purple-600' : 'text-red-500'}`}>
                            Balance: ⚡{fpBal.toLocaleString()} {!enough && `— need ⚡${(totalAmount - fpBal).toLocaleString()} more`}
                          </p>
                        )}
                        {method === 'Credit/Debit Card' && (
                          <p className="text-xs text-gray-400 mt-0.5">Secured payment</p>
                        )}
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        selectedMethod === method ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                      }`}>
                        {selectedMethod === method && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                    </button>
                  );
                })}

                {/* FP top-up link when balance insufficient */}
                {isFPPayment && fpApi.getBalance(user?.id || '') < totalAmount && (
                  <div className="mt-2 p-3 bg-purple-50 rounded-xl border border-purple-200">
                    <p className="text-xs text-purple-700 font-semibold mb-2">
                      You need ⚡{(totalAmount - fpApi.getBalance(user?.id || '')).toLocaleString()} more FP to complete this payment.
                    </p>
                    <Link to="/wallet" className="inline-flex items-center gap-1.5 text-xs bg-purple-600 text-white font-bold px-3 py-2 rounded-lg hover:bg-purple-700 transition-colors">
                      ⚡ Buy FP →
                    </Link>
                  </div>
                )}

                {/* Stripe redirect note for card */}
                {isCardMethod && (
                  <div className="mt-2 flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2 text-xs text-blue-700">
                    <span>🔒</span>
                    <span>You'll be redirected to a secure checkout page to enter your card details.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Delivery / Pickup */}
            {availableDelivery.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-blue-600" />
                  <h2 className="font-bold text-gray-900 text-sm">Fulfilment</h2>
                </div>
                <div className="p-4 space-y-2">
                  {availableDelivery.map(opt => (
                    <button key={opt} onClick={() => setSelectedDelivery(opt)}
                      className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                        selectedDelivery === opt
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 mt-0.5 ${selectedDelivery === opt ? 'bg-blue-100' : 'bg-gray-50'}`}>
                        {opt === 'delivery' ? <Truck className="w-5 h-5"/> : <MapPin className="w-5 h-5"/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-semibold text-sm capitalize ${selectedDelivery === opt ? 'text-blue-700' : 'text-gray-700'}`}>{opt}</p>
                          {opt === 'delivery' && listing?.deliveryPrice && listing.deliveryPrice > 0 && (
                            <span className="text-[11px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">
                              +${(Number(listing?.deliveryPrice) || 0).toLocaleString('en-CA', { minimumFractionDigits: 2 })} CAD
                            </span>
                          )}
                          {opt === 'delivery' && (!listing?.deliveryPrice || listing.deliveryPrice === 0) && (
                            <span className="text-[11px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">Free</span>
                          )}
                        </div>
                        {opt === 'delivery' ? (
                          <p className="text-xs text-gray-400 mt-0.5">Host will deliver to your address</p>
                        ) : gearAddress ? (
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{gearAddress}</p>
                        ) : (
                          <p className="text-xs text-gray-400 mt-0.5">Collect from the host's location</p>
                        )}
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                        selectedDelivery === opt ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                      }`}>
                        {selectedDelivery === opt && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                    </button>
                  ))}

                  {/* Delivery address geocoder */}
                  {selectedDelivery === 'delivery' && (
                    <div className="mt-1 pt-3 border-t border-gray-100">
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                        Your delivery address <span className="text-red-400">*</span>
                      </label>
                      <DeliveryAddressInput value={deliveryAddress} onChange={setDeliveryAddress} />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep('review')}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm rounded-2xl py-3.5 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button onClick={() => setStep('confirm')}
                disabled={!selectedMethod}
                className="flex-[2] flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-2xl py-3.5 transition-colors">
                Review Order <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Confirm ── */}
        {step === 'confirm' && (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50">
                <h2 className="font-bold text-gray-900 text-sm">Order Confirmation</h2>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Listing</span>
                    <span className="font-semibold text-gray-800 max-w-[55%] text-right truncate">{pay.listingTitle || '—'}</span>
                  </div>
                  {pay.startDate && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Date</span>
                      <span className="font-semibold text-gray-800">{new Date(pay.startDate).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  )}
                  {pay.duration && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Duration</span>
                      <span className="font-semibold text-gray-800">{pay.duration} {pay.durationType}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Payment</span>
                    <span className="font-semibold text-gray-800 flex items-center gap-1">
                      <span className="flex items-center gap-2"><PaymentLogo method={selectedMethod} size={18} /> {selectedMethod}</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Fulfilment</span>
                    <span className="font-semibold text-gray-800 capitalize flex items-center gap-1">
                      {effectiveDelivery === 'delivery' ? <Truck className="w-4 h-4"/> : <MapPin className="w-4 h-4"/>} {effectiveDelivery}
                    </span>
                  </div>

                  {/* Gear / service location */}
                  {gearAddress && (
                    <div className="flex items-start gap-3 bg-gray-50 rounded-xl px-3 py-2.5 text-sm">
                      <MapPin className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                          {pay.listingType === 'service' ? 'Service Address' : 'Pickup Address'}
                        </p>
                        <p className="text-sm text-gray-700 leading-snug">{gearAddress}</p>
                      </div>
                    </div>
                  )}

                  {/* Delivery address */}
                  {effectiveDelivery === 'delivery' && deliveryAddrStr && (
                    <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-sm">
                      <Truck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[11px] font-semibold text-blue-400 uppercase tracking-wide mb-0.5">Deliver to</p>
                        <p className="text-sm text-blue-800 font-medium">{deliveryAddrStr}</p>
                      </div>
                    </div>
                  )}

                  {/* Buyer's location — shown only in confirm */}
                  {user.location && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Your location</span>
                      <span className="font-semibold text-gray-700 max-w-[55%] text-right truncate">{user.location}</span>
                    </div>
                  )}
                </div>

                {/* Price breakdown */}
                <div className="border-t border-gray-100 pt-3 space-y-1.5">
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-semibold">${(Number(pay?.amount) || 0).toLocaleString('en-CA', { minimumFractionDigits: 2 })} CAD</span>
                  </div>
                  {deliveryFee > 0 && (
                    <div className="flex justify-between items-baseline text-sm">
                      <span className="text-gray-500 flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5 inline-block" /> Delivery fee
                      </span>
                      <span className="font-semibold text-gray-700">+${deliveryFee.toLocaleString('en-CA', { minimumFractionDigits: 2 })} CAD</span>
                    </div>
                  )}
                  {effectiveDelivery === 'delivery' && (!listing?.deliveryPrice || listing.deliveryPrice === 0) && (
                    <div className="flex justify-between items-baseline text-sm">
                      <span className="text-gray-500 flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5 inline-block" /> Delivery fee
                      </span>
                      <span className="font-semibold text-green-600">Free</span>
                    </div>
                  )}
                  <div className="flex justify-between items-baseline border-t border-gray-100 pt-2 mt-1">
                    <span className="text-sm font-bold text-gray-700">Total to Pay</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black text-gray-900">${(Number(totalAmount) || 0).toLocaleString('en-CA', { minimumFractionDigits: 2 })}</span>
                      <span className="text-sm text-gray-400">CAD</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Trust badge */}
            <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm text-green-700">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Your payment is protected by Filmons. Contact support if you have issues.</span>
            </div>

            {/* ── Rental Agreement ── */}
            <div className={`rounded-2xl border-2 p-4 transition-colors ${agreementAccepted ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 ${agreementAccepted ? 'bg-green-600 border-green-600' : 'border-gray-300 bg-white'}`}>
                  {agreementAccepted && <CheckRounded sx={{fontSize:14,color:'white'}} />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">
                    {agreementAccepted
                      ? '✅ Rental agreement signed'
                      : <><button type="button" onClick={() => setShowAgreementModal(true)} className="text-blue-600 underline underline-offset-2 font-semibold hover:text-blue-700">Sign the Rental Agreement</button> to continue</>
                    }
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {agreementAccepted
                      ? 'Your signed agreement and receipt will be emailed after payment.'
                      : 'Required before payment — includes your ID info and digital signature.'}
                  </p>
                </div>
                {!agreementAccepted && (
                  <button onClick={() => setShowAgreementModal(true)}
                    className="shrink-0 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-xl transition-colors">
                    Open →
                  </button>
                )}
              </div>
            </div>

            {/* Rental Agreement Modal */}
            {showAgreementModal && pay && (
              <RentalAgreementModal
                pay={pay}
                user={user}
                hostUser={hostUser}
                convId={convId || ''}
                msgId={msgId || ''}
                totalAmount={totalAmount}
                selectedMethod={selectedMethod}
                onAccepted={(data) => { setSignedAgreement(data); setAgreementAccepted(true); setShowAgreementModal(false); }}
                onClose={() => setShowAgreementModal(false)}
              />
            )}

                        <div className="flex gap-3">
              <button onClick={() => setStep('payment')}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm rounded-2xl py-3.5 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button onClick={handlePay} disabled={submitting || stripeRedirecting || !agreementAccepted || (isFPPayment && fpApi.getBalance(user?.id || '') < totalAmount)}
                className="flex-[2] flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm rounded-2xl py-3.5 transition-colors shadow-md">
                {stripeRedirecting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing payment…</>
                  : submitting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                    : !agreementAccepted
                      ? <>✍️ Sign agreement to pay</>
                      : isFPPayment
                        ? <>⚡ Pay {totalAmount.toLocaleString()} FP</>
                        : isCardMethod
                          ? <>🔒 Pay securely →</>
                          : <><CreditCard className="w-4 h-4" /> Pay ${(Number(totalAmount) || 0).toLocaleString('en-CA', { minimumFractionDigits: 2 })} CAD</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}