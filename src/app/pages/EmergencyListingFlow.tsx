// Emergency Listing purchase/renewal flow — /listing/:listingId/emergency.
// Deliberately much simpler than BoostListingFlow (no goal/audience/budget
// steps): Emergency is two fixed tiers, not a configurable campaign, so
// this is just "pick a plan -> pay -> confirm", reused both right after
// Create Listing (CreateListing.tsx's finishPublish redirects here on
// success) and as the "Boost Again" renewal entry point once a listing's
// Emergency period has expired. Presentation-only redesign — pricing
// ($4.99/72h, $9.99/7d), Stripe checkout, activation, and expiration logic
// are untouched; only how this page looks and the extra "select a plan,
// then confirm" step (previously a card click charged immediately) changed.
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Zap, Check, Loader2, ShieldCheck, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listingsApi } from '../lib/api';
import { emergencyApi, EMERGENCY_PLANS, type EmergencyPlan } from '../lib/emergencyApi';
import { Listing } from '../types';

const PLAN_BULLETS: Record<EmergencyPlan, string[]> = {
  '72_hour': ['Emergency status for 72 hours', 'Increased feed exposure', 'Reappears during the active period'],
  '7_day':   ['Emergency status for 7 days', 'Increased feed exposure', 'Reappears during the active period'],
};

const BENEFITS = [
  'Emergency badge on your listing',
  'Increased visibility in the swipe feed',
  'Listing can reappear after being swiped',
  'More chances to reach available creators',
  'Automatically returns to normal after the Emergency period',
];

export function EmergencyListingFlow() {
  const { id: listingId } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedExpiresAt, setConfirmedExpiresAt] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<EmergencyPlan | null>(null);

  useEffect(() => {
    if (!listingId) return;
    listingsApi.getOne(listingId).then(l => { setListing(l); setLoading(false); }).catch(() => setLoading(false));
  }, [listingId]);

  // ── Return from Stripe ──────────────────────────────────────────────
  useEffect(() => {
    const success = params.get('emergency_success');
    const sessionId = params.get('session_id');
    if (success !== '1' || !sessionId || !listingId) return;
    (async () => {
      toast.loading('Confirming payment…', { id: 'emergency-verify' });
      try {
        const { emergency } = await emergencyApi.verify(sessionId);
        toast.dismiss('emergency-verify');
        if (!emergency) { toast.error('Could not confirm Emergency Listing payment'); return; }
        // The webhook activates Emergency status asynchronously -- give it
        // a brief moment, then re-check once before showing success, same
        // pattern BoostListingFlow already uses.
        let final = emergency;
        if (final.status !== 'active') {
          await new Promise(r => setTimeout(r, 1500));
          const refetched = await emergencyApi.getActiveEmergency(listingId);
          if (refetched) final = refetched;
        }
        setConfirmedExpiresAt(final.expiresAt || null);
        window.history.replaceState({}, '', `/listing/${listingId}/emergency`);
        listingsApi.getOne(listingId).then(setListing).catch(() => {});
      } catch (e: any) {
        toast.dismiss('emergency-verify');
        toast.error(e?.message || 'Payment verification failed');
      }
    })();
  }, [params.get('emergency_success')]); // eslint-disable-line

  const isActive = !confirmedExpiresAt && !!listing?.isEmergency && !!listing?.emergencyExpiresAt && new Date(listing.emergencyExpiresAt) > new Date();

  const purchase = async () => {
    if (!user || !listingId || !selectedPlan) return;
    setSubmitting(true);
    try {
      const origin = window.location.origin;
      const { url } = await emergencyApi.charge({
        listingId, ownerId: user.id, plan: selectedPlan,
        successUrl: `${origin}/listing/${listingId}/emergency?emergency_success=1&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/listing/${listingId}/emergency`,
      });
      window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message || 'Could not start checkout');
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-6 h-6 animate-spin text-gray-400"/></div>;
  }
  if (!listing) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400 text-sm">Listing not found</div>;
  }
  if (!user || listing.userId !== user.id) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400 text-sm">You don't own this listing</div>;
  }

  // Same category/type-badge convention as ListingCard.tsx, for the
  // listing-preview strip below.
  const isOpportunity = listing.listingType === 'opportunity' || listing.listingKind === 'talent';
  const categoryLabel = isOpportunity ? 'Opportunity'
    : listing.listingType === 'service' ? 'Service'
    : listing.listingMode === 'sale' ? 'For Sale' : 'Rental';
  const cover = listing.image || (Array.isArray(listing.images) ? listing.images.find(i => typeof i === 'string' && i.length > 10) : undefined);
  const selectedPlanInfo = EMERGENCY_PLANS.find(p => p.plan === selectedPlan);

  const header = (
    <div className="bg-white border-b border-gray-100 sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
      <button onClick={() => navigate(`/listing/${listingId}`)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
        <ArrowLeft className="w-4 h-4 text-gray-500"/>
      </button>
      <p className="text-sm font-black text-gray-900">Emergency Listing</p>
    </div>
  );

  if (confirmedExpiresAt) {
    return (
      <div className="min-h-screen bg-gray-50 pb-10">
        {header}
        <div className="max-w-lg mx-auto px-4 pt-8">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-green-600"/>
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900">Emergency status active</h2>
              <p className="text-sm text-gray-500 mt-1.5">Your listing now has increased visibility and can reappear in the Filmons feed until it expires.</p>
            </div>
            <p className="text-xs font-bold text-red-600 bg-red-50 rounded-xl py-2 px-3 inline-block">
              Expires {new Date(confirmedExpiresAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
            <button onClick={() => navigate(`/listing/${listingId}`)} className="w-full py-3.5 bg-gray-900 text-white font-bold text-sm rounded-2xl mt-2">
              View Listing
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isActive) {
    return (
      <div className="min-h-screen bg-gray-50 pb-10">
        {header}
        <div className="max-w-lg mx-auto px-4 pt-8">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
              <Zap className="w-8 h-8 text-red-600"/>
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900">Emergency status is active</h2>
              <p className="text-sm text-gray-500 mt-1.5">{EMERGENCY_PLANS.find(p => p.plan === listing.emergencyPlan)?.label}</p>
              {listing.emergencyExpiresAt && (
                <p className="text-xs font-bold text-red-600 bg-red-50 rounded-xl py-2 px-3 inline-block mt-2">
                  Expires {new Date(listing.emergencyExpiresAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              )}
            </div>
            <button onClick={() => navigate(`/listing/${listingId}`)} className="w-full py-3.5 border-2 border-gray-200 text-gray-700 font-bold text-sm rounded-2xl mt-2">
              View Listing
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {header}

      <div className="max-w-lg mx-auto px-4 pt-8 space-y-6">

        {/* ── Header ── */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
            <Zap className="w-7 h-7 text-red-500"/>
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Need someone fast?</h1>
            <p className="text-sm text-gray-500 mt-1.5 max-w-sm mx-auto">Make your listing an Emergency Listing and get more visibility when timing matters.</p>
          </div>
        </div>

        {/* ── Listing preview ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3.5 flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
            {cover ? <img src={cover} alt="" className="w-full h-full object-cover"/> : <span className="text-xl">🎬</span>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{listing.title}</p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{categoryLabel}</span>
              {listing.city && <span className="text-[11px] text-gray-400">{listing.city}</span>}
            </div>
          </div>
          <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full shrink-0 ${listing.isSold ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-600'}`}>
            {listing.isSold ? 'Sold' : 'Active'}
          </span>
        </div>

        {/* ── What you get ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm font-black text-gray-900 mb-3.5">What you get</p>
          <ul className="space-y-2.5">
            {BENEFITS.map(line => (
              <li key={line} className="flex items-start gap-2.5">
                <div className="w-4 h-4 rounded-full bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-2.5 h-2.5 text-red-500"/>
                </div>
                <span className="text-[13px] text-gray-600 leading-snug">{line}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Pricing cards ── */}
        <div>
          <p className="text-sm font-black text-gray-900 mb-3">Choose a plan</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {EMERGENCY_PLANS.map(p => {
              const selected = selectedPlan === p.plan;
              const isSeven = p.plan === '7_day';
              return (
                <button key={p.plan} type="button" onClick={() => setSelectedPlan(p.plan)}
                  className={`relative text-left rounded-2xl p-4 border-2 transition-all ${
                    selected ? 'border-red-500 bg-red-50/60 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}>
                  {isSeven && (
                    <span className="absolute -top-2.5 right-3 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-400 text-white shadow-sm">
                      Best Value
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-gray-500">{isSeven ? '7 Days' : '72 Hours'}</p>
                      <p className="text-xl font-black text-gray-900 mt-0.5">${p.amountCad.toFixed(2)} <span className="text-xs font-bold text-gray-400">CAD</span></p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${selected ? 'bg-red-500 border-red-500' : 'border-gray-300'}`}>
                      {selected && <Check className="w-3 h-3 text-white"/>}
                    </div>
                  </div>
                  <p className="text-sm font-bold text-gray-900 mt-2">{p.label}</p>
                  <p className="text-[11px] text-gray-400">{isSeven ? 'Best value for longer searches' : 'Best for immediate needs'}</p>
                  <ul className="mt-3 space-y-1.5">
                    {PLAN_BULLETS[p.plan].map(line => (
                      <li key={line} className="flex items-start gap-1.5 text-[11px] text-gray-500">
                        <Check className="w-3 h-3 text-red-400 shrink-0 mt-0.5"/> {line}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Order summary ── */}
        {selectedPlanInfo && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm font-black text-gray-900 mb-3">Emergency Listing</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Selected plan</span>
              <span className="font-bold text-gray-900">{selectedPlan === '7_day' ? '7 Days' : '72 Hours'}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1.5">
              <span className="text-gray-500">Price</span>
              <span className="font-bold text-gray-900">${selectedPlanInfo.amountCad.toFixed(2)} CAD</span>
            </div>
            <div className="border-t border-gray-100 mt-3 pt-3 flex items-center justify-between">
              <span className="text-sm font-black text-gray-900">Total today</span>
              <span className="text-lg font-black text-gray-900">${selectedPlanInfo.amountCad.toFixed(2)} CAD</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">One-time payment. No subscription.</p>
          </div>
        )}

        {/* ── Expiration explainer ── */}
        <div className="bg-gray-100/70 rounded-2xl p-4 flex items-start gap-2.5">
          <Clock className="w-4 h-4 text-gray-400 shrink-0 mt-0.5"/>
          <div>
            <p className="text-xs font-bold text-gray-700">What happens when it ends?</p>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">Your listing stays active. The Emergency badge and priority exposure are removed automatically when the selected period ends.</p>
          </div>
        </div>
      </div>

      {/* ── Sticky CTA ── */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className="max-w-lg mx-auto">
          <button
            disabled={!selectedPlan || submitting}
            onClick={purchase}
            className="w-full py-3.5 rounded-2xl bg-gray-900 text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin"/> : selectedPlan ? <Zap className="w-4 h-4"/> : null}
            {submitting ? 'Starting checkout…' : selectedPlan ? 'Activate Emergency Listing' : 'Select a plan to continue'}
          </button>
          <p className="text-center text-[11px] text-gray-400 mt-2 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3 h-3"/> Secure payment powered by Stripe
          </p>
          <p className="text-center text-[10px] text-gray-300 mt-0.5">Emergency status activates after successful payment.</p>
        </div>
      </div>
    </div>
  );
}
