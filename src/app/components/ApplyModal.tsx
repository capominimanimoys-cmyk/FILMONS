import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { X, Send, CheckCircle, Briefcase, User as UserIcon } from 'lucide-react';
import { Listing, User } from '../types';
import { chatApi } from '../lib/api';
import * as notifs from '../lib/notifications';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { boostApi } from '../lib/boostApi';
import { entitlementsApi, getOpportunityUsage, getEntitlement, resetLabel, LimitReachedInfo } from '../lib/entitlements';
import { normalizeTier } from '../lib/reliabilityApi';
import { OpportunityLimitUpgrade } from './OpportunityLimitUpgrade';

interface ApplyModalProps {
  listing: Listing;
  host: User;
  onClose: () => void;
}

// Applying to an Opportunity listing is an intentional action, separate
// from swipe-right (which only saves) and from the rental-request flow
// (no payment, no rental agreement — this never touches Checkout). Which
// fields render here is entirely driven by the poster's own
// listing.opportunity.applicationConfig from the Create Opportunity wizard.
export function ApplyModal({ listing, host, onClose }: ApplyModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const cfg = listing.opportunity?.applicationConfig;
  const requireMessage = cfg?.requireMessage ?? true;
  const requirePortfolio = cfg?.requirePortfolio ?? false;
  const requireResume = cfg?.requireResume ?? false;
  const requireDemoReel = cfg?.requireDemoReel ?? false;
  const requireAvailability = cfg?.requireAvailability ?? false;
  const requireExpectedRate = cfg?.requireExpectedRate ?? false;
  const customQuestions = cfg?.customQuestions || [];

  const [message, setMessage] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [demoReelUrl, setDemoReelUrl] = useState('');
  const [availability, setAvailability] = useState('');
  const [expectedRate, setExpectedRate] = useState('');
  const [answers, setAnswers] = useState<string[]>(customQuestions.map(() => ''));

  // Structured proposed-rate -- separate from `expectedRate` above (a
  // poster-configured optional free-text field). This one is required
  // whenever the LISTING's own compensation is negotiable, so the host has
  // a concrete number to evaluate instead of just "negotiable".
  const isNegotiable = !!listing.opportunity?.paid && listing.opportunity?.compensationType === 'negotiable';
  const [proposedRateAmount, setProposedRateAmount] = useState('');
  const [proposedRateCurrency, setProposedRateCurrency] = useState(listing.opportunity?.currency || 'CAD');
  const [proposedRateType, setProposedRateType] = useState<'hourly' | 'daily' | 'flat' | 'per_project'>('daily');
  const [proposedRateNote, setProposedRateNote] = useState('');
  const proposedRateNum = parseFloat(proposedRateAmount);
  const RATE_TYPE_LABEL: Record<string, string> = { hourly: 'Per hour', daily: 'Per day', flat: 'Flat rate', per_project: 'Per project' };
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Slide-in/slide-out -- same deferred-unmount pattern ListingCard's
  // BottomMenuSheet uses: `show` drives the transform, and `close()` waits
  // for the slide-out transition to finish before actually telling the
  // parent to unmount this modal, instead of cutting it instantly.
  const [show, setShow] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
  }, []);
  const close = useCallback(() => {
    setShow(false);
    setTimeout(onClose, 280);
  }, [onClose]);
  const tier = normalizeTier(user?.accountType);
  // Creator can't apply at all (server-side applications entitlement is 0
  // for this tier -- see _shared/entitlements.ts) -- gated here on open,
  // synchronously, rather than letting them fill out the whole form and
  // only discovering this after a failed submit. The server still enforces
  // the same limit independently on submit either way; this is purely the
  // UX shortcut straight to the same upgrade view that path would show.
  const [limitReached, setLimitReached] = useState<LimitReachedInfo | null>(
    tier === 'creator' ? { plan: 'creator', limit: 0 } : null,
  );
  const [usage, setUsage] = useState<{ applications: number } | null>(null);

  useEffect(() => {
    if (!user || tier === 'business' || tier === 'creator') return;
    getOpportunityUsage(user.id, user.accountType).then(u => setUsage({ applications: u.applications })).catch(() => {});
  }, [user?.id]);

  const handleApply = async () => {
    if (!user) { navigate('/login'); return; }
    if (user.id === host.id) { toast.error("You can't apply to your own listing"); return; }
    if (requirePortfolio && !portfolioUrl.trim()) { toast.error('A portfolio link is required'); return; }
    if (requireMessage && !message.trim()) { toast.error('A short message is required'); return; }
    if (isNegotiable && (!proposedRateAmount.trim() || !(proposedRateNum > 0))) {
      toast.error('Enter your proposed rate'); return;
    }

    setSending(true);
    try {
      const customAnswers = Object.fromEntries(customQuestions.map((q, i) => [q, answers[i] || '']).filter(([, a]) => a));

      // Server-verified — enforces the application entitlement (weekly for
      // Creator/Professional, monthly for Creator+) atomically
      // (fn_submit_opportunity_application), never a client-side pre-check
      // followed by a direct insert.
      const result = await entitlementsApi.submitOpportunityApplication({
        userId: user.id, listingId: listing.id, ownerId: host.id,
        message: message.trim() || undefined, portfolioUrl: portfolioUrl.trim() || undefined,
        resumeUrl: resumeUrl.trim() || undefined, demoReelUrl: demoReelUrl.trim() || undefined,
        availability: availability.trim() || undefined, expectedRate: expectedRate.trim() || undefined,
        customAnswers,
        ...(isNegotiable ? {
          proposedRateAmount: proposedRateNum, proposedRateCurrency,
          proposedRateType, proposedRateNote: proposedRateNote.trim() || undefined,
        } : {}),
      });
      if ('limitReached' in result) { setLimitReached(result.limitReached); setSending(false); return; }
      const applicationId = result.applicationId;

      // The ONE real conversation with this host — never a new/duplicate
      // thread. If they already have a conversation, the Application Card
      // lands inside it; applying to a second opportunity from the same
      // host reuses the same conversation too (each card carries its own
      // applicationId/opportunityId, so contexts never get confused).
      const conv = await chatApi.getOrCreateDB(user.id, host.id);
      await supabase.from('opportunity_applications').update({ conversation_id: conv.id }).eq('id', applicationId);

      // A real Application Card, never a plain text message — everything the
      // card needs is re-fetched live from applicationId, so it always
      // reflects the current status regardless of which surface changed it.
      const cardMsg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        senderId: user.id, senderName: user.name, senderAvatar: user.avatar,
        type: 'application' as const,
        content: undefined,
        applicationCard: { applicationId, opportunityId: listing.id, applicantId: user.id, ownerId: host.id },
        createdAt: new Date().toISOString(),
      };
      await chatApi.sendMessageToDB(conv.id, cardMsg, conv.participantIds, false, null);

      notifs.push(host.id, {
        type: 'application_received',
        fromUserId: user.id, fromUserName: user.name, fromUserAvatar: user.avatar,
        conversationId: conv.id,
        listingTitle: listing.title,
      } as any);

      if (listing.boosted) {
        boostApi.logEvent(listing.id, 'application', 'boosted', undefined, user.id);
      }

      setSent(true);
    } catch (e: any) {
      toast.error(e?.message || 'Could not submit your application');
    } finally {
      setSending(false);
    }
  };

  const handleUpgrade = async (plan: 'professional' | 'business') => {
    if (!user) return;
    try {
      const origin = window.location.origin;
      const { url } = await entitlementsApi.startSubscriptionCheckout(
        user.id, plan, `${origin}${window.location.pathname}?sub_success=1&plan=${plan}&session_id={CHECKOUT_SESSION_ID}`, `${origin}${window.location.pathname}`,
      );
      window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message || 'Could not start checkout');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center"
      style={{ opacity: show ? 1 : 0, transition: 'opacity 240ms ease' }}
      onClick={close}
    >
      <div
        className="bg-white w-full md:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl md:rounded-[22px] shadow-2xl"
        style={{ transform: show ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 280ms cubic-bezier(0.32,0.72,0,1)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2 sticky top-0 bg-white">
          <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Briefcase className="w-4 h-4 text-indigo-600" /> Apply</p>
          <button onClick={close} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {limitReached ? (
          <OpportunityLimitUpgrade kind="applications" plan={limitReached.plan} limit={limitReached.limit}
            onUpgrade={handleUpgrade} onUpgradeToCreatorPlus={() => navigate('/verification')}
            onMaybeLater={() => setLimitReached(null)} />
        ) : listing.opportunity?.opportunityStatus === 'applications_closed' || listing.opportunity?.opportunityStatus === 'completed' ? (
          <div className="px-5 pb-8 pt-2 flex flex-col items-center text-center gap-2">
            <p className="text-base font-black text-gray-900">Applications closed</p>
            <p className="text-sm text-gray-500">{host.name} is no longer accepting applications for this opportunity.</p>
            <button onClick={close} className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm mt-2">Close</button>
          </div>
        ) : sent ? (
          <div className="px-5 pb-8 pt-4 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-7 h-7 text-green-600" />
            </div>
            <div>
              <p className="text-base font-black text-gray-900">Application sent</p>
              <p className="text-sm text-gray-500 mt-1">{host.name} will follow up with you directly in Inbox.</p>
            </div>
            <button onClick={close} className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm mt-2">Done</button>
          </div>
        ) : (
          <div className="px-5 pb-5 space-y-3">
            <p className="text-sm text-gray-500">Applying to <span className="font-bold text-gray-900">{listing.title}</span> — posted by {host.name}.</p>

            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 bg-gray-50 rounded-xl px-3 py-2.5">
              <UserIcon className="w-3.5 h-3.5" /> Your Filmons Profile will be shared with your application
            </div>

            {isNegotiable && (
              <div className="space-y-2 border border-indigo-100 bg-indigo-50/50 rounded-2xl p-3.5">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block">
                  Your proposed rate <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="number" min="0" inputMode="decimal" value={proposedRateAmount}
                    onChange={e => setProposedRateAmount(e.target.value)}
                    placeholder="250"
                    className="w-24 bg-white rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200 border border-gray-200"
                  />
                  <select value={proposedRateCurrency} onChange={e => setProposedRateCurrency(e.target.value)}
                    className="bg-white rounded-xl px-2.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200 border border-gray-200">
                    <option value="CAD">CAD</option>
                    <option value="USD">USD</option>
                  </select>
                  <select value={proposedRateType} onChange={e => setProposedRateType(e.target.value as typeof proposedRateType)}
                    className="flex-1 bg-white rounded-xl px-2.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200 border border-gray-200">
                    {Object.entries(RATE_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <p className="text-[11px] text-indigo-700">
                  The host listed this opportunity as negotiable. Enter the rate you would like to be paid.
                </p>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Rate note</label>
                  <textarea
                    value={proposedRateNote} onChange={e => setProposedRateNote(e.target.value)}
                    placeholder="Explain your rate or what it includes…" rows={2}
                    className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200 border border-gray-200 resize-none"
                  />
                </div>
                {proposedRateAmount.trim() && proposedRateNum > 0 && (
                  <p className="text-xs font-bold text-gray-900">
                    Your proposed rate: ${proposedRateAmount} {proposedRateCurrency} · {RATE_TYPE_LABEL[proposedRateType]}
                  </p>
                )}
              </div>
            )}

            {requirePortfolio && (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Portfolio {requirePortfolio && <span className="text-red-400">*</span>}</label>
                <input value={portfolioUrl} onChange={e => setPortfolioUrl(e.target.value)} placeholder="Link to your portfolio"
                  className="w-full bg-gray-50 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
            )}

            {(requireMessage || true) && (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Message {requireMessage && <span className="text-red-400">*</span>}</label>
                <textarea
                  value={message} onChange={e => setMessage(e.target.value)}
                  placeholder="Tell them about your experience or availability"
                  rows={4}
                  className="w-full bg-gray-50 rounded-2xl px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                />
              </div>
            )}

            {requireResume && (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Resume (link)</label>
                <input value={resumeUrl} onChange={e => setResumeUrl(e.target.value)} placeholder="Link to your resume"
                  className="w-full bg-gray-50 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
            )}
            {requireDemoReel && (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Demo Reel / Work Sample (link)</label>
                <input value={demoReelUrl} onChange={e => setDemoReelUrl(e.target.value)} placeholder="Link to a video or sample"
                  className="w-full bg-gray-50 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
            )}
            {requireAvailability && (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Availability</label>
                <input value={availability} onChange={e => setAvailability(e.target.value)} placeholder="e.g. Weekdays after 5pm"
                  className="w-full bg-gray-50 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
            )}
            {requireExpectedRate && (
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Expected Rate</label>
                <input value={expectedRate} onChange={e => setExpectedRate(e.target.value)} placeholder="e.g. $300/day"
                  className="w-full bg-gray-50 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
            )}

            {customQuestions.map((q, i) => (
              <div key={i}>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">{q}</label>
                <textarea rows={2} value={answers[i] || ''} onChange={e => setAnswers(a => a.map((x, j) => j === i ? e.target.value : x))}
                  className="w-full bg-gray-50 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
              </div>
            ))}

            {usage && tier !== 'business' && (
              <div className="text-center text-[11px] text-gray-400 space-y-0.5">
                <p className="font-semibold text-gray-500">Applications this week: {usage.applications} of {getEntitlement(user?.accountType).applications}</p>
                <p>{resetLabel(getEntitlement(user?.accountType).window)}</p>
              </div>
            )}

            <button
              onClick={handleApply} disabled={sending}
              className="w-full py-3.5 rounded-2xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {sending ? 'Sending…' : <><Send className="w-4 h-4" /> Send Application</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
