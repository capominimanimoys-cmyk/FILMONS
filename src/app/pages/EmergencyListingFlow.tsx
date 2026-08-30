// Emergency Listing purchase/renewal flow — /listing/:listingId/emergency.
// Deliberately much simpler than BoostListingFlow (no goal/audience/budget
// steps): Emergency is two fixed tiers, not a configurable campaign, so
// this is just "pick a plan -> pay -> confirm", reused both right after
// Create Listing (CreateListing.tsx's finishPublish redirects here on
// success) and as the "Boost Again" renewal entry point once a listing's
// Emergency period has expired.
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Zap, Check, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listingsApi } from '../lib/api';
import { emergencyApi, EMERGENCY_PLANS, type EmergencyPlan } from '../lib/emergencyApi';
import { Listing } from '../types';

const PLAN_BULLETS = (plan: EmergencyPlan) => [
  `Emergency status for ${EMERGENCY_PLANS.find(p => p.plan === plan)?.durationLabel}`,
  'Emergency badge',
  'Increased feed visibility',
  'Listing can reappear after users swipe it',
  "Listing can return when users refresh or finish their available listings",
  ...(plan === '7_day' ? ['Longer Emergency exposure than the 72-hour option'] : []),
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

  const purchase = async (plan: EmergencyPlan) => {
    if (!user || !listingId) return;
    setSubmitting(true);
    try {
      const origin = window.location.origin;
      const { url } = await emergencyApi.charge({
        listingId, ownerId: user.id, plan,
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
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400"/></div>;
  }
  if (!listing) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Listing not found</div>;
  }
  if (!user || listing.userId !== user.id) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">You don't own this listing</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(`/listing/${listingId}`)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-4 h-4 text-gray-500"/>
        </button>
        <p className="text-sm font-black text-gray-900">Emergency Listing</p>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        {confirmedExpiresAt ? (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center mx-auto">
              <Check className="w-7 h-7 text-green-600"/>
            </div>
            <h2 className="text-lg font-black text-gray-900">Emergency status active</h2>
            <p className="text-sm text-gray-500">Your listing now has increased visibility and can reappear in the Filmons feed until it expires.</p>
            <p className="text-xs font-bold text-red-600">
              Expires {new Date(confirmedExpiresAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
            <button onClick={() => navigate(`/listing/${listingId}`)} className="w-full py-3 bg-blue-600 text-white font-bold text-sm rounded-2xl mt-2">
              View Listing
            </button>
          </div>
        ) : isActive ? (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
              <Zap className="w-7 h-7 text-red-600"/>
            </div>
            <h2 className="text-lg font-black text-gray-900">Emergency status is active</h2>
            <p className="text-sm text-gray-500">
              {EMERGENCY_PLANS.find(p => p.plan === listing.emergencyPlan)?.label}
              {listing.emergencyExpiresAt && <> — expires {new Date(listing.emergencyExpiresAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}</>}
            </p>
            <button onClick={() => navigate(`/listing/${listingId}`)} className="w-full py-3 border-2 border-gray-200 text-gray-700 font-bold text-sm rounded-2xl mt-2">
              View Listing
            </button>
          </div>
        ) : (
          <>
            <div className="text-center mb-2">
              <h2 className="text-xl font-black text-gray-900">{listing.emergencyPlan ? 'Boost Again' : 'Make this an Emergency Listing'}</h2>
              <p className="text-sm text-gray-500 mt-1">Need someone fast? Boost your listing and get repeated exposure across the Filmons feed.</p>
            </div>
            <div className="space-y-2.5">
              {EMERGENCY_PLANS.map(p => (
                <button key={p.plan} disabled={submitting} onClick={() => purchase(p.plan)}
                  className="w-full px-4 py-3.5 rounded-2xl border-2 border-gray-200 hover:border-red-300 bg-white text-left transition-all disabled:opacity-50">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-900">{p.label}</p>
                    <span className="text-sm font-black text-red-600">${p.amountCad.toFixed(2)} CAD</span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {PLAN_BULLETS(p.plan).map(line => (
                      <li key={line} className="flex items-start gap-1.5 text-[11px] text-gray-500">
                        <Check className="w-3 h-3 text-red-400 shrink-0 mt-0.5"/> {line}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
            {submitting && (
              <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin"/> Starting checkout…</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
