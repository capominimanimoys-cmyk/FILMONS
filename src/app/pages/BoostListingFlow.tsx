import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, X, Check, Loader2, Zap, Eye, MessageCircle, CalendarCheck, MapPin, Sparkles, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listingsApi } from '../lib/api';
import { boostApi, BoostGoal, BoostAudienceType, BoostConfig, AudienceConfig } from '../lib/boostApi';
import { Listing } from '../types';
import { ListingCard } from '../components/ListingCard';

const STEP_LABELS = ['Goal', 'Audience', 'Budget', 'Review', 'Payment'];
type Step = 'goal' | 'audience' | 'budget' | 'review' | 'payment' | 'success';

function draftKey(listingId: string) {
  return `filmons_boost_draft_${listingId}`;
}

function Stepper({ stepIdx }: { stepIdx: number }) {
  return (
    <div className="flex items-center px-5 pt-3 pb-1">
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all duration-300 ${
              i < stepIdx ? 'bg-green-500 text-white' : i === stepIdx ? 'bg-amber-500 text-white scale-110' : 'bg-gray-100 text-gray-400'
            }`}>
              {i < stepIdx ? <Check className="w-3 h-3" /> : i + 1}
            </div>
            <span className={`text-[9px] font-bold whitespace-nowrap ${i === stepIdx ? 'text-amber-700' : i < stepIdx ? 'text-green-600' : 'text-gray-300'}`}>{label}</span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div className="flex-1 h-0.5 mx-1 mb-3.5 rounded-full overflow-hidden bg-gray-100">
              <div className={`h-full bg-green-500 transition-all duration-500 ${i < stepIdx ? 'w-full' : 'w-0'}`} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const GOAL_OPTIONS: { value: BoostGoal; label: string; sub: string; icon: any; forService?: boolean; forNonService?: boolean }[] = [
  { value: 'more_views', label: 'More Listing Views', sub: 'Get seen by more people browsing Marketplace', icon: Eye },
  { value: 'more_messages', label: 'More Messages', sub: 'Get more people reaching out about this listing', icon: MessageCircle },
  { value: 'more_rental_requests', label: 'More Rental Requests', sub: 'Get more renters requesting this item', icon: CalendarCheck, forNonService: true },
  { value: 'more_booking_requests', label: 'More Booking Requests', sub: 'Get more clients booking this service', icon: CalendarCheck, forService: true },
];

export function BoostListingFlow() {
  const { listingId } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>('goal');
  const [listing, setListing] = useState<Listing | null>(null);
  const [config, setConfig] = useState<BoostConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [goal, setGoal] = useState<BoostGoal | ''>('');
  const [audienceType, setAudienceType] = useState<BoostAudienceType>('automatic');
  const [radiusKm, setRadiusKm] = useState(25);
  const [categories, setCategories] = useState<string[]>([]);
  const [dailyBudget, setDailyBudget] = useState(10);
  const [durationDays, setDurationDays] = useState(7);

  const stepIdx = Math.max(0, STEP_LABELS.findIndex(l => l.toLowerCase() === step));

  // ── Load listing + config, restore any silently-saved draft ──────────
  useEffect(() => {
    if (!listingId) return;
    (async () => {
      try {
        const [l, c] = await Promise.all([listingsApi.getOne(listingId), boostApi.getConfig()]);
        setListing(l);
        setConfig(c);
        setDailyBudget(Math.round((c.minDailyBudget + c.maxDailyBudget) / 4));
        setDurationDays(Math.min(7, c.maxDurationDays));

        // Already boosted — go straight to the manage/insights view instead
        // of starting a second boost on top of an active one.
        const existing = await boostApi.getActiveBoost(listingId);
        if (existing && (existing.status === 'active' || existing.status === 'paused')) {
          navigate(`/boost/${listingId}/insights`, { replace: true });
          return;
        }

        const raw = sessionStorage.getItem(draftKey(listingId));
        if (raw) {
          try {
            const d = JSON.parse(raw);
            if (d.goal) setGoal(d.goal);
            if (d.audienceType) setAudienceType(d.audienceType);
            if (d.radiusKm) setRadiusKm(d.radiusKm);
            if (d.categories) setCategories(d.categories);
            if (d.dailyBudget) setDailyBudget(d.dailyBudget);
            if (d.durationDays) setDurationDays(d.durationDays);
          } catch {}
        }
      } catch (e: any) {
        toast.error(e?.message || 'Could not load listing');
      } finally {
        setLoading(false);
      }
    })();
  }, [listingId]);

  // Silent autosave — no repeated toasts, just persists across an
  // accidental reload or a detour to Stripe and back.
  useEffect(() => {
    if (!listingId || loading) return;
    sessionStorage.setItem(draftKey(listingId), JSON.stringify({ goal, audienceType, radiusKm, categories, dailyBudget, durationDays }));
  }, [listingId, loading, goal, audienceType, radiusKm, categories, dailyBudget, durationDays]);

  // ── Return from Stripe ────────────────────────────────────────────
  useEffect(() => {
    const success = params.get('boost_success');
    const sessionId = params.get('session_id');
    if (success !== '1' || !sessionId || !listingId) return;
    (async () => {
      toast.loading('Confirming payment…', { id: 'boost-verify' });
      try {
        const { boost } = await boostApi.verify(sessionId);
        toast.dismiss('boost-verify');
        if (!boost) { toast.error('Could not confirm boost payment'); return; }
        // The webhook activates the boost asynchronously — give it a brief
        // moment, then re-check once before showing the success screen.
        let final = boost;
        if (final.status !== 'active') {
          await new Promise(r => setTimeout(r, 1500));
          const refetched = await boostApi.getBoost(boost.id);
          if (refetched) final = refetched;
        }
        sessionStorage.removeItem(draftKey(listingId));
        setStep('success');
        window.history.replaceState({}, '', `/boost/${listingId}`);
      } catch (e: any) {
        toast.dismiss('boost-verify');
        toast.error(e?.message || 'Payment verification failed');
      }
    })();
  }, [params.get('boost_success')]);

  const totalBudget = useMemo(() => Math.round(dailyBudget * durationDays * 100) / 100, [dailyBudget, durationDays]);

  const canContinue =
    (step === 'goal' && !!goal) ||
    (step === 'audience' && !!audienceType) ||
    (step === 'budget' && !!config && dailyBudget >= config.minDailyBudget && dailyBudget <= config.maxDailyBudget && durationDays >= config.minDurationDays && durationDays <= config.maxDurationDays) ||
    step === 'review';

  const goNext = () => {
    if (step === 'goal') setStep('audience');
    else if (step === 'audience') setStep('budget');
    else if (step === 'budget') setStep('review');
    else if (step === 'review') handlePay();
  };
  const goBack = () => {
    if (step === 'audience') setStep('goal');
    else if (step === 'budget') setStep('audience');
    else if (step === 'review') setStep('budget');
  };

  const handlePay = async () => {
    if (!user || !listing || !listingId || !goal) return;
    setSubmitting(true);
    try {
      const audienceConfig: AudienceConfig = audienceType === 'automatic' ? {}
        : audienceType === 'local' ? { radiusKm, cities: listing.city ? [listing.city] : [] }
        : { radiusKm, cities: listing.city ? [listing.city] : [], categories };

      const origin = window.location.origin;
      const successUrl = `${origin}/boost/${listingId}?boost_success=1&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${origin}/boost/${listingId}`;

      const { url } = await boostApi.charge({
        listingId, ownerId: user.id, goal, audienceType, audienceConfig,
        dailyBudget, durationDays, successUrl, cancelUrl,
      });
      window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message || 'Could not start boost checkout');
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;
  }
  if (!listing) return null;

  const availableGoals = GOAL_OPTIONS.filter(g => {
    if (g.forService) return listing.listingType === 'service';
    if (g.forNonService) return listing.listingType !== 'service';
    return true;
  });

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-gray-100">
        <div className="flex items-center gap-3 px-5 pt-4 pb-1">
          {step !== 'goal' && step !== 'success' && (
            <button onClick={goBack} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 shrink-0">
              <ArrowLeft className="w-4 h-4 text-gray-600" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1"><Zap className="w-3 h-3 fill-amber-500 text-amber-500" /> FILMONS · Boost Listing</p>
            <p className="text-sm font-bold text-gray-900 truncate">{step === 'success' ? 'Boost Active' : listing.title}</p>
          </div>
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 shrink-0">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>
        {step !== 'success' && <Stepper stepIdx={stepIdx} />}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {step === 'goal' && (
          <div className="px-5 py-5 space-y-3">
            <h2 className="text-lg font-black text-gray-900">What's your goal?</h2>
            <p className="text-sm text-gray-500 -mt-2 mb-1">Filmons will optimize delivery of your boost toward this goal.</p>
            {availableGoals.map(g => {
              const Icon = g.icon;
              const active = goal === g.value;
              return (
                <button key={g.value} onClick={() => setGoal(g.value)}
                  className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-colors ${active ? 'border-amber-500 bg-amber-50' : 'border-gray-100 hover:border-gray-200'}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${active ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">{g.label}</p>
                    <p className="text-xs text-gray-400">{g.sub}</p>
                  </div>
                  {active && <Check className="w-5 h-5 text-amber-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}

        {step === 'audience' && (
          <div className="px-5 py-5 space-y-3">
            <h2 className="text-lg font-black text-gray-900">Who should see it?</h2>
            {([
              { value: 'automatic', label: 'Automatic', sub: 'Filmons finds the people most likely to be interested' },
              { value: 'local', label: 'Local', sub: `People near ${listing.city || 'your listing’s location'}` },
              { value: 'custom', label: 'Custom', sub: 'Set a radius and interest categories yourself' },
            ] as { value: BoostAudienceType; label: string; sub: string }[]).map(a => {
              const active = audienceType === a.value;
              return (
                <button key={a.value} onClick={() => setAudienceType(a.value)}
                  className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-colors ${active ? 'border-amber-500 bg-amber-50' : 'border-gray-100 hover:border-gray-200'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">{a.label}</p>
                    <p className="text-xs text-gray-400">{a.sub}</p>
                  </div>
                  {active && <Check className="w-5 h-5 text-amber-600 shrink-0" />}
                </button>
              );
            })}

            {(audienceType === 'local' || audienceType === 'custom') && (
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-700 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Radius</p>
                  <p className="text-xs font-black text-amber-600">{radiusKm} km</p>
                </div>
                <input type="range" min={5} max={100} step={5} value={radiusKm} onChange={e => setRadiusKm(Number(e.target.value))} className="w-full accent-amber-500" />
              </div>
            )}

            {audienceType === 'custom' && (
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-bold text-gray-700">Interest categories</p>
                <div className="flex flex-wrap gap-2">
                  {['Photography', 'Videography', 'Audio', 'Lighting', 'Drones', 'Editing'].map(c => {
                    const active = categories.includes(c);
                    return (
                      <button key={c} onClick={() => setCategories(prev => active ? prev.filter(x => x !== c) : [...prev, c])}
                        className={`text-xs font-bold px-3 py-1.5 rounded-full border ${active ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'}`}>
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'budget' && config && (
          <div className="px-5 py-5 space-y-5">
            <h2 className="text-lg font-black text-gray-900">Budget &amp; Duration</h2>
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-700">Daily budget</p>
                <p className="text-sm font-black text-amber-600">${dailyBudget} {config.currency}/day</p>
              </div>
              <input type="range" min={config.minDailyBudget} max={config.maxDailyBudget} step={1} value={dailyBudget}
                onChange={e => setDailyBudget(Number(e.target.value))} className="w-full accent-amber-500" />
              <div className="flex justify-between text-[10px] text-gray-400"><span>${config.minDailyBudget}</span><span>${config.maxDailyBudget}</span></div>
            </div>
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-700">Duration</p>
                <p className="text-sm font-black text-amber-600">{durationDays} day{durationDays === 1 ? '' : 's'}</p>
              </div>
              <input type="range" min={config.minDurationDays} max={config.maxDurationDays} step={1} value={durationDays}
                onChange={e => setDurationDays(Number(e.target.value))} className="w-full accent-amber-500" />
              <div className="flex justify-between text-[10px] text-gray-400"><span>{config.minDurationDays} day</span><span>{config.maxDurationDays} days</span></div>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 pt-4">
              <p className="text-sm font-bold text-gray-900">Total budget</p>
              <p className="text-lg font-black text-gray-900">${totalBudget.toFixed(2)} {config.currency}</p>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="px-5 py-5 space-y-4">
            <h2 className="text-lg font-black text-gray-900">Review your boost</h2>
            <div className="pointer-events-none">
              <ListingCard listing={listing} className="max-w-xs" />
            </div>
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Goal</span><span className="font-bold text-gray-900">{GOAL_OPTIONS.find(g => g.value === goal)?.label}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Audience</span><span className="font-bold text-gray-900 capitalize">{audienceType}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Daily budget</span><span className="font-bold text-gray-900">${dailyBudget} {config?.currency}/day</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Duration</span><span className="font-bold text-gray-900">{durationDays} day{durationDays === 1 ? '' : 's'}</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-2 mt-1"><span className="font-bold text-gray-900">Total</span><span className="font-black text-gray-900">${totalBudget.toFixed(2)} {config?.currency}</span></div>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3.5 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800">Filmons doesn't have enough boost history yet to estimate results for this campaign. Once your Boost Insights data builds up, estimates will appear here for future boosts.</p>
            </div>
            <p className="text-[11px] text-gray-400">Boost payment is charged separately from any rental transaction and is not subject to the Filmons rental fee. You'll be redirected to secure Stripe Checkout to complete payment.</p>
          </div>
        )}

        {step === 'success' && (
          <div className="px-5 py-10 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900">Your boost is live!</h2>
              <p className="text-sm text-gray-500 mt-1">{listing.title} is now being promoted in Marketplace search.</p>
            </div>
            <div className="w-full flex flex-col gap-2 mt-2">
              <button onClick={() => navigate(`/boost/${listingId}/insights`)} className="w-full py-3.5 rounded-2xl bg-amber-500 text-white font-bold text-sm">View Boost Insights</button>
              <button onClick={() => navigate(`/listing/${listingId}`)} className="w-full py-3.5 rounded-2xl border border-gray-200 text-gray-700 font-bold text-sm">Back to Listing</button>
            </div>
          </div>
        )}
      </div>

      {/* Sticky footer */}
      {step !== 'success' && (
        <div className="shrink-0 border-t border-gray-100 px-5 py-3.5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom)+14px)' }}>
          <button onClick={goNext} disabled={!canContinue || submitting}
            className="w-full py-3.5 rounded-2xl bg-amber-500 text-white font-bold text-sm disabled:opacity-40 transition-all active:scale-[0.98] flex items-center justify-center gap-2">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting to payment…</> : step === 'review' ? 'Continue to Payment' : 'Continue'}
          </button>
        </div>
      )}
    </div>
  );
}
