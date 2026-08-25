import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Briefcase, MapPin, ShieldCheck, ExternalLink, CheckCircle2, XCircle, Star, DollarSign, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { ChatMessage, Listing, User } from '../types';
import { listingsApi, authApi } from '../lib/api';
import { applicationApi, opportunityPaymentApi, OpportunityApplicationRow, OpportunityTransactionRow } from '../lib/applicationApi';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { BottomSheet } from './BottomSheet';

const OWNER_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:     { label: 'NEW APPLICATION', color: 'bg-indigo-100 text-indigo-700' },
  viewed:      { label: 'VIEWED',          color: 'bg-gray-100 text-gray-600' },
  shortlisted: { label: 'SHORTLISTED ✓',   color: 'bg-purple-100 text-purple-700' },
  contacted:   { label: 'CONTACTED',       color: 'bg-blue-100 text-blue-700' },
  accepted:    { label: 'ACCEPTED ✓',      color: 'bg-green-100 text-green-700' },
  offer_sent:      { label: 'OFFER SENT',        color: 'bg-amber-100 text-amber-700' },
  offer_accepted:  { label: 'OFFER ACCEPTED',    color: 'bg-green-100 text-green-700' },
  payment_pending: { label: 'FUNDING…',          color: 'bg-amber-100 text-amber-700' },
  hired:           { label: 'HIRED · FUNDED ✓',  color: 'bg-green-100 text-green-700' },
  completed:       { label: 'COMPLETED ✓',       color: 'bg-gray-100 text-gray-600' },
  rejected:    { label: 'DECLINED',        color: 'bg-red-50 text-red-500' },
  withdrawn:   { label: 'WITHDRAWN',       color: 'bg-gray-100 text-gray-500' },
};
const APPLICANT_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:     { label: 'Application Sent ✓', color: 'bg-indigo-100 text-indigo-700' },
  viewed:      { label: 'Under Review',       color: 'bg-gray-100 text-gray-600' },
  shortlisted: { label: 'Shortlisted ✓',      color: 'bg-purple-100 text-purple-700' },
  contacted:   { label: 'Under Review',       color: 'bg-blue-100 text-blue-700' },
  accepted:    { label: 'Application Accepted ✓', color: 'bg-green-100 text-green-700' },
  offer_sent:      { label: "You've Been Selected", color: 'bg-amber-100 text-amber-700' },
  offer_accepted:  { label: 'Offer Accepted ✓',      color: 'bg-green-100 text-green-700' },
  payment_pending: { label: 'Payment Processing…',   color: 'bg-amber-100 text-amber-700' },
  hired:           { label: 'Payment Secured ✓',     color: 'bg-green-100 text-green-700' },
  completed:       { label: 'Opportunity Completed ✓', color: 'bg-gray-100 text-gray-600' },
  rejected:    { label: 'Application Closed', color: 'bg-gray-100 text-gray-500' },
  withdrawn:   { label: 'Application Withdrawn', color: 'bg-gray-100 text-gray-500' },
};
const TERMINAL = new Set(['accepted', 'rejected', 'withdrawn']);
const PAYMENT_FLOW = new Set(['offer_sent', 'offer_accepted', 'payment_pending', 'hired', 'completed']);

export function ApplicationCardBubble({ msg }: { msg: ChatMessage }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const card = msg.applicationCard!;
  const isOwnerView = user?.id === card.ownerId;

  const [app, setApp] = useState<OpportunityApplicationRow | null>(null);
  const [txn, setTxn] = useState<OpportunityTransactionRow | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [applicant, setApplicant] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingAccept, setConfirmingAccept] = useState(false);
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const [confirmingFund, setConfirmingFund] = useState(false);

  const reloadTxn = () => {
    supabase.from('opportunity_transactions').select('*').eq('application_id', card.applicationId).maybeSingle()
      .then(({ data }) => setTxn(data as OpportunityTransactionRow | null));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: appRow }, l, applicantProfile] = await Promise.all([
        supabase.from('opportunity_applications').select('*').eq('id', card.applicationId).single(),
        listingsApi.getOne(card.opportunityId).catch(() => null),
        authApi.getUserById(card.applicantId).catch(() => null),
      ]);
      if (cancelled) return;
      if (appRow) setApp(appRow as OpportunityApplicationRow);
      setListing(l);
      setApplicant(applicantProfile);
      setLoading(false);
      reloadTxn();
    })();

    const channel = supabase
      .channel(`app-card:${card.applicationId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'opportunity_applications', filter: `id=eq.${card.applicationId}` },
        (payload) => setApp(payload.new as OpportunityApplicationRow))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunity_transactions', filter: `application_id=eq.${card.applicationId}` },
        () => reloadTxn())
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [card.applicationId]);

  if (loading || !app || !listing) {
    return <div className="max-w-[300px] rounded-2xl border border-gray-100 bg-white p-4 animate-pulse h-24" />;
  }

  const cfg = listing.opportunity?.applicationConfig;
  const cover = listing.image || listing.images?.[0];
  const comp = listing.opportunity?.paid
    ? `$${listing.opportunity.compensationAmount ?? listing.opportunity.compensationMin ?? listing.price}/${listing.opportunity.compensationType === 'daily' ? 'day' : listing.opportunity.compensationType === 'hourly' ? 'hr' : ''}`.trim()
    : 'Unpaid / Collaboration';
  const statusInfo = (isOwnerView ? OWNER_STATUS_LABEL : APPLICANT_STATUS_LABEL)[app.status] || OWNER_STATUS_LABEL.pending;
  const nonTerminal = !TERMINAL.has(app.status);

  const run = async (fn: () => Promise<any>) => {
    if (!user) return;
    setBusy(true);
    try { await fn(); }
    catch (e: any) { toast.error(e?.message || 'Something went wrong'); }
    finally { setBusy(false); }
  };

  const doShortlist = () => run(() => applicationApi.shortlist(app.id, user!.id));
  const doAccept = () => run(async () => { await applicationApi.accept(app.id, user!.id); setConfirmingAccept(false); toast.success('Applicant accepted'); });
  const doDecline = (reason?: string) => run(async () => { await applicationApi.decline(app.id, user!.id, reason); setConfirmingDecline(false); toast.success('Application declined'); });
  const doWithdraw = () => run(async () => { await applicationApi.withdraw(app.id, user!.id); setConfirmingWithdraw(false); toast.success('Application withdrawn'); });
  const doSendOffer = () => run(async () => { await applicationApi.sendOffer(app.id, user!.id); toast.success('Offer sent'); });
  const doRespondOffer = (decision: 'accept' | 'decline') => run(async () => {
    await applicationApi.respondOffer(app.id, user!.id, decision);
    toast.success(decision === 'accept' ? 'Offer accepted' : 'Offer declined');
  });
  const doMarkComplete = () => run(async () => { await applicationApi.markWorkCompleted(app.id, user!.id); toast.success('Marked as completed — awaiting owner confirmation'); });
  const doConfirmCompletion = () => run(async () => { await applicationApi.confirmCompletion(app.id, user!.id); toast.success('Completion confirmed — remaining funds released'); });
  const doReportProblem = () => run(async () => { await applicationApi.reportProblem(app.id, user!.id); toast.success('Problem reported — held funds are frozen'); });
  const doFund = () => run(async () => {
    const origin = window.location.origin;
    const { url } = await opportunityPaymentApi.startFunding(
      user!.id, app.id, `${origin}${window.location.pathname}?opp_fund=1&application_id=${app.id}`, `${origin}${window.location.pathname}`,
    );
    window.location.href = url;
  });

  return (
    <div className="max-w-[320px] w-full rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="px-3.5 pt-3 pb-1 flex items-center gap-1.5">
        <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Application</span>
      </div>

      <button onClick={() => navigate(`/listing/${card.opportunityId}`)} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left">
        <div className="w-11 h-11 rounded-xl overflow-hidden bg-gray-100 shrink-0">
          {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-lg">🎬</div>}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{listing.title}</p>
          <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin className="w-3 h-3" />{listing.city} · {comp}</p>
        </div>
      </button>

      {isOwnerView && (
        <div className="px-3.5 py-2 flex items-center gap-2 border-t border-gray-50">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 shrink-0">
            {applicant?.avatar && <img src={applicant.avatar} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-gray-900 truncate flex items-center gap-1">
              {applicant?.name || 'Applicant'} {applicant?.isVerified && <ShieldCheck className="w-3 h-3 text-blue-500 shrink-0" />}
            </p>
            <p className="text-[11px] text-gray-400 truncate">{[applicant?.primaryRole, applicant?.city].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
      )}

      {app.message && <p className="mx-3.5 mb-2 text-xs text-gray-600 bg-gray-50 rounded-xl px-2.5 py-2 line-clamp-2">"{app.message}"</p>}

      <div className="px-3.5 flex flex-wrap gap-1.5 pb-2">
        {app.portfolio_url && <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Portfolio ✓</span>}
        {app.resume_url && <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Resume ✓</span>}
        {app.availability && <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Availability ✓</span>}
      </div>

      <div className="px-3.5 pb-2">
        <span className={`text-[10px] font-black px-2 py-1 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
      </div>

      {txn && PAYMENT_FLOW.has(app.status) && (
        <div className="mx-3.5 mb-2 bg-gray-50 rounded-xl px-3 py-2.5 space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-gray-400">Pay</span><span className="font-bold text-gray-900">${txn.gross_amount.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Filmons Fee ({(txn.fee_rate * 100).toFixed(0)}%)</span><span className="text-gray-500">-${txn.fee_amount.toFixed(2)}</span></div>
          <div className="flex justify-between border-t border-gray-200 pt-1"><span className="text-gray-400">{isOwnerView ? 'Worker Earnings' : "You'll Earn"}</span><span className="font-black text-gray-900">${txn.net_amount.toFixed(2)}</span></div>
          {txn.payment_status === 'funded' && (
            <div className="flex justify-between border-t border-gray-200 pt-1">
              <span className="text-gray-400">Status</span>
              {txn.work_status === 'completed'
                ? <span className="font-bold text-green-600">${txn.net_amount.toFixed(2)} Available</span>
                : <span className="font-bold text-amber-600">{isOwnerView ? 'Held for Creator' : 'On Hold'}</span>}
            </div>
          )}
        </div>
      )}

      <div className="px-3.5 pb-3.5 flex gap-2">
        <button onClick={() => setSheetOpen(true)} className="flex-1 text-xs font-bold text-gray-700 bg-gray-100 rounded-xl py-2">View Application</button>
        {isOwnerView && nonTerminal && app.status !== 'shortlisted' && (
          <>
            <button disabled={busy} onClick={doShortlist} className="flex-1 text-xs font-bold text-purple-700 bg-purple-50 rounded-xl py-2 disabled:opacity-50">Shortlist</button>
            <button disabled={busy} onClick={() => { setSheetOpen(true); setConfirmingDecline(true); }} className="flex-1 text-xs font-bold text-red-600 bg-red-50 rounded-xl py-2 disabled:opacity-50">Decline</button>
          </>
        )}
        {isOwnerView && app.status === 'shortlisted' && (
          <>
            <button disabled={busy} onClick={() => { setSheetOpen(true); setConfirmingAccept(true); }} className="flex-1 text-xs font-bold text-green-700 bg-green-50 rounded-xl py-2 disabled:opacity-50">Accept</button>
            <button disabled={busy} onClick={() => { setSheetOpen(true); setConfirmingDecline(true); }} className="flex-1 text-xs font-bold text-red-600 bg-red-50 rounded-xl py-2 disabled:opacity-50">Decline</button>
          </>
        )}
        {isOwnerView && app.status === 'accepted' && listing.opportunity?.paid && (
          <button disabled={busy} onClick={doSendOffer} className="flex-1 flex items-center justify-center gap-1 text-xs font-bold text-white bg-indigo-600 rounded-xl py-2 disabled:opacity-50"><DollarSign className="w-3 h-3" /> Choose Applicant</button>
        )}
        {!isOwnerView && app.status === 'offer_sent' && (
          <>
            <button disabled={busy} onClick={() => doRespondOffer('accept')} className="flex-1 text-xs font-bold text-white bg-green-600 rounded-xl py-2 disabled:opacity-50">Accept Offer</button>
            <button disabled={busy} onClick={() => doRespondOffer('decline')} className="flex-1 text-xs font-bold text-red-600 bg-red-50 rounded-xl py-2 disabled:opacity-50">Decline</button>
          </>
        )}
        {isOwnerView && app.status === 'offer_accepted' && (
          <button disabled={busy} onClick={doFund} className="flex-1 flex items-center justify-center gap-1 text-xs font-bold text-white bg-indigo-600 rounded-xl py-2 disabled:opacity-50"><DollarSign className="w-3 h-3" /> Pay for Opportunity</button>
        )}
        {isOwnerView && app.status === 'payment_pending' && txn?.payment_status === 'pending' && (
          <button disabled={busy} onClick={doFund} className="flex-1 flex items-center justify-center gap-1 text-xs font-bold text-white bg-indigo-600 rounded-xl py-2 disabled:opacity-50"><DollarSign className="w-3 h-3" /> Retry Payment</button>
        )}
        {!isOwnerView && app.status === 'hired' && txn?.work_status === 'in_progress' && (
          <button disabled={busy} onClick={doMarkComplete} className="flex-1 text-xs font-bold text-white bg-indigo-600 rounded-xl py-2 disabled:opacity-50">Mark Work Completed</button>
        )}
        {isOwnerView && app.status === 'hired' && txn?.work_status === 'marked_complete_by_worker' && (
          <button disabled={busy} onClick={doConfirmCompletion} className="flex-1 text-xs font-bold text-white bg-green-600 rounded-xl py-2 disabled:opacity-50">Confirm Completion</button>
        )}
        {app.status === 'hired' && (
          <button disabled={busy} onClick={doReportProblem} className="flex-1 flex items-center justify-center gap-1 text-xs font-bold text-red-600 bg-red-50 rounded-xl py-2 disabled:opacity-50"><AlertTriangle className="w-3 h-3" /> Report a Problem</button>
        )}
        {!isOwnerView && nonTerminal && !PAYMENT_FLOW.has(app.status) && (
          <button disabled={busy} onClick={() => { setSheetOpen(true); setConfirmingWithdraw(true); }} className="flex-1 text-xs font-bold text-gray-500 bg-gray-100 rounded-xl py-2 disabled:opacity-50">Withdraw</button>
        )}
      </div>

      {sheetOpen && (
        <BottomSheet title="Application" onClose={() => setSheetOpen(false)} footer={
          isOwnerView ? (
            confirmingAccept ? (
              <div className="space-y-2 pb-1">
                <p className="text-xs text-gray-500">Accept {applicant?.name || 'this applicant'} for {listing.title}?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmingAccept(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">Cancel</button>
                  <button disabled={busy} onClick={doAccept} className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold disabled:opacity-50">Accept Applicant</button>
                </div>
              </div>
            ) : confirmingDecline ? (
              <div className="space-y-2 pb-1">
                <p className="text-xs text-gray-500">Decline this application? This can't be undone, but history is kept.</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmingDecline(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">Cancel</button>
                  <button disabled={busy} onClick={() => doDecline()} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-50">Decline Application</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 pb-1">
                {nonTerminal && app.status !== 'shortlisted' && (
                  <>
                    <button disabled={busy} onClick={() => setConfirmingDecline(true)} className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-bold disabled:opacity-50">Decline</button>
                    <button disabled={busy} onClick={() => setSheetOpen(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">Message</button>
                    <button disabled={busy} onClick={doShortlist} className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-bold disabled:opacity-50">Shortlist</button>
                  </>
                )}
                {app.status === 'shortlisted' && (
                  <>
                    <button disabled={busy} onClick={() => setConfirmingDecline(true)} className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-bold disabled:opacity-50">Decline</button>
                    <button disabled={busy} onClick={() => setSheetOpen(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">Message</button>
                    <button disabled={busy} onClick={() => setConfirmingAccept(true)} className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold disabled:opacity-50">Accept</button>
                  </>
                )}
                {app.status === 'accepted' && (
                  <>
                    <span className="flex-1 py-2.5 rounded-xl bg-green-50 text-green-700 text-sm font-bold text-center flex items-center justify-center gap-1"><CheckCircle2 className="w-4 h-4" /> Accepted</span>
                    <button onClick={() => setSheetOpen(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">Message</button>
                  </>
                )}
                {TERMINAL.has(app.status) && app.status !== 'accepted' && (
                  <span className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-500 text-sm font-bold text-center flex items-center justify-center gap-1"><XCircle className="w-4 h-4" /> {statusInfo.label}</span>
                )}
              </div>
            )
          ) : nonTerminal ? (
            confirmingWithdraw ? (
              <div className="space-y-2 pb-1">
                <p className="text-xs text-gray-500">Withdraw your application?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmingWithdraw(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">Cancel</button>
                  <button disabled={busy} onClick={doWithdraw} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-50">Withdraw</button>
                </div>
              </div>
            ) : (
              <button disabled={busy} onClick={() => setConfirmingWithdraw(true)} className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-bold disabled:opacity-50">Withdraw Application</button>
            )
          ) : null
        }>
          <div className="px-5 py-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 shrink-0">
                {applicant?.avatar && <img src={applicant.avatar} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 flex items-center gap-1">{applicant?.name || 'Applicant'} {applicant?.isVerified && <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />}</p>
                <p className="text-xs text-gray-400">{[applicant?.primaryRole, applicant?.city].filter(Boolean).join(' · ')}</p>
              </div>
            </div>

            {app.message && (
              <Section label="Message"><p className="text-sm text-gray-700 whitespace-pre-wrap">{app.message}</p></Section>
            )}
            {app.portfolio_url && (
              <Section label="Portfolio"><a href={app.portfolio_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600"><ExternalLink className="w-3.5 h-3.5" /> View Portfolio</a></Section>
            )}
            {app.resume_url && (
              <Section label="Resume"><a href={app.resume_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600"><ExternalLink className="w-3.5 h-3.5" /> View Resume</a></Section>
            )}
            {app.demo_reel_url && (
              <Section label="Work Samples"><a href={app.demo_reel_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600"><ExternalLink className="w-3.5 h-3.5" /> View Demo Reel</a></Section>
            )}
            {app.availability && <Section label="Availability"><p className="text-sm text-gray-700">{app.availability}</p></Section>}
            {app.expected_rate && <Section label="Expected Rate"><p className="text-sm text-gray-700">{app.expected_rate}</p></Section>}
            {app.custom_answers && Object.keys(app.custom_answers).length > 0 && (
              <Section label="Screening Questions">
                <div className="space-y-2">
                  {Object.entries(app.custom_answers).map(([q, a]) => (
                    <div key={q}><p className="text-xs font-semibold text-gray-500">{q}</p><p className="text-sm text-gray-700">{a}</p></div>
                  ))}
                </div>
              </Section>
            )}
            <p className="text-[11px] text-gray-300">Submitted {new Date(app.created_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      {children}
    </div>
  );
}

export function SystemMessageDivider({ text, createdAt }: { text: string; createdAt: string }) {
  return (
    <div className="flex items-center gap-3 my-3 px-4">
      <div className="flex-1 h-px bg-gray-100" />
      <div className="text-center">
        <p className="text-[11px] text-gray-400">{text}</p>
        <p className="text-[10px] text-gray-300">{new Date(createdAt).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
      </div>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}
