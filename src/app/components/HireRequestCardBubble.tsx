import { useEffect, useState } from 'react';
import { Briefcase, MapPin, Calendar, DollarSign, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ChatMessage, User } from '../types';
import { authApi } from '../lib/api';
import { hireApi, hirePaymentApi, HireRequestRow, HireTransactionRow } from '../lib/hireApi';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { BottomSheet } from './BottomSheet';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  sent:            { label: 'Hire Request Sent',   color: 'bg-indigo-100 text-indigo-700' },
  countered:       { label: 'Counter Offer',        color: 'bg-amber-100 text-amber-700' },
  accepted:        { label: 'Terms Agreed ✓',       color: 'bg-green-100 text-green-700' },
  payment_pending: { label: 'Funding…',              color: 'bg-amber-100 text-amber-700' },
  hired:           { label: 'Hired · Funded ✓',      color: 'bg-green-100 text-green-700' },
  completed:       { label: 'Completed ✓',           color: 'bg-gray-100 text-gray-600' },
  declined:        { label: 'Declined',              color: 'bg-red-50 text-red-500' },
  cancelled:       { label: 'Cancelled',             color: 'bg-gray-100 text-gray-500' },
  expired:         { label: 'Expired',               color: 'bg-gray-100 text-gray-500' },
};
const OPEN = new Set(['sent', 'countered']);
const TERMINAL = new Set(['declined', 'cancelled', 'expired']);
const PAYMENT_FLOW = new Set(['accepted', 'payment_pending', 'hired', 'completed']);

const WORK_TYPE_LABEL: Record<string, string> = { on_site: 'On-site', remote: 'Remote', hybrid: 'Hybrid' };

function formatDates(hr: HireRequestRow): string {
  if (hr.date_type === 'flexible') return 'Flexible dates';
  if (!hr.start_date) return '—';
  const fmt = (d: string) => new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
  if (hr.date_type === 'range' && hr.end_date) return `${fmt(hr.start_date)} – ${fmt(hr.end_date)}`;
  return fmt(hr.start_date);
}

export function HireRequestCardBubble({ msg }: { msg: ChatMessage }) {
  const { user } = useAuth();
  const card = msg.hireCard!;
  const isRequester = user?.id === card.requesterId;
  const isHost = user?.id === card.hostId;

  const [hr, setHr] = useState<HireRequestRow | null>(null);
  const [txn, setTxn] = useState<HireTransactionRow | null>(null);
  const [otherParty, setOtherParty] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterAmount, setCounterAmount] = useState('');
  const [decliningOpen, setDecliningOpen] = useState(false);

  const reloadTxn = () => {
    supabase.from('hire_transactions').select('*').eq('hire_request_id', card.hireRequestId).maybeSingle()
      .then(({ data }) => setTxn(data as HireTransactionRow | null));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: hrRow }, otherProfile] = await Promise.all([
        supabase.from('hire_requests').select('*').eq('id', card.hireRequestId).single(),
        authApi.getUserById(isHost ? card.requesterId : card.hostId).catch(() => null),
      ]);
      if (cancelled) return;
      if (hrRow) setHr(hrRow as HireRequestRow);
      setOtherParty(otherProfile);
      setLoading(false);
      reloadTxn();
    })();

    const channel = supabase
      .channel(`hire-card:${card.hireRequestId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hire_requests', filter: `id=eq.${card.hireRequestId}` },
        (payload) => setHr(payload.new as HireRequestRow))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hire_transactions', filter: `hire_request_id=eq.${card.hireRequestId}` },
        () => reloadTxn())
      .subscribe();

    // Host viewing their own hire request marks it seen.
    if (isHost && user?.id) hireApi.markViewed(card.hireRequestId, user.id).catch(() => {});

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [card.hireRequestId]); // eslint-disable-line

  if (loading || !hr) {
    return <div className="max-w-[300px] rounded-2xl border border-gray-100 bg-white p-4 animate-pulse h-24" />;
  }

  const statusInfo = STATUS_LABEL[hr.status] || STATUS_LABEL.sent;
  const isMyTurn = OPEN.has(hr.status) && hr.last_offer_by !== user?.id;
  const budgetLabel = hr.budget_amount != null ? `$${Number(hr.budget_amount).toFixed(2)} ${hr.currency}${hr.pricing_type !== 'fixed' ? `/${hr.pricing_type === 'hourly' ? 'hr' : 'day'}` : ''}` : 'No budget set';

  const run = async (fn: () => Promise<any>) => {
    if (!user) return;
    setBusy(true);
    try { await fn(); }
    catch (e: any) { toast.error(e?.message || 'Something went wrong'); }
    finally { setBusy(false); }
  };

  const doAccept = () => run(async () => { await hireApi.acceptCurrentTerms(hr.id, user!.id); toast.success('Terms accepted'); });
  const doDecline = () => run(async () => { await hireApi.declineCurrentTerms(hr.id, user!.id); setDecliningOpen(false); toast.success('Hire request declined'); });
  const doCancel = () => run(async () => { await hireApi.cancelHireRequest(hr.id, user!.id); toast.success('Hire request cancelled'); });
  const doCounter = () => run(async () => {
    const amount = Number(counterAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    await hireApi.counterOffer(hr.id, user!.id, amount);
    setCounterOpen(false); setCounterAmount('');
    toast.success('Counter offer sent');
  });
  const doMarkComplete = () => run(async () => { await hireApi.markWorkCompleted(hr.id, user!.id); toast.success('Marked as completed — awaiting confirmation'); });
  const doConfirmCompletion = () => run(async () => { await hireApi.confirmCompletion(hr.id, user!.id); toast.success('Completion confirmed — remaining funds released'); });
  const doReportProblem = () => run(async () => { await hireApi.reportProblem(hr.id, user!.id); toast.success('Problem reported — held funds are frozen'); });
  const doFund = () => run(async () => {
    const origin = window.location.origin;
    const { url } = await hirePaymentApi.startFunding(
      user!.id, hr.id, `${origin}${window.location.pathname}?hire_fund=1&hire_request_id=${hr.id}`, `${origin}${window.location.pathname}`,
    );
    window.location.href = url;
  });

  return (
    <div className="max-w-[320px] w-full rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="px-3.5 pt-3 pb-1 flex items-center gap-1.5">
        <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Hire Request</span>
      </div>

      <button onClick={() => setSheetOpen(true)} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left">
        <div className="w-11 h-11 rounded-xl overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
          {otherParty?.avatar ? <img src={otherParty.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-lg">🎬</span>}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{hr.project_title}</p>
          <p className="text-xs text-gray-400 truncate">{hr.service_label}</p>
        </div>
      </button>

      <div className="px-3.5 pb-2 space-y-1">
        {hr.work_type === 'on_site' && hr.city && (
          <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin className="w-3 h-3" />{[hr.city, hr.province].filter(Boolean).join(', ')}</p>
        )}
        {hr.work_type !== 'on_site' && <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin className="w-3 h-3" />{WORK_TYPE_LABEL[hr.work_type]}</p>}
        <p className="text-xs text-gray-400 flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDates(hr)}</p>
      </div>

      <div className="mx-3.5 mb-2 bg-gray-50 rounded-xl px-3 py-2 flex items-center justify-between">
        <span className="text-xs text-gray-400">Budget</span>
        <span className="text-sm font-black text-gray-900">{budgetLabel}</span>
      </div>

      {hr.message && <p className="mx-3.5 mb-2 text-xs text-gray-600 bg-gray-50 rounded-xl px-2.5 py-2 line-clamp-2">"{hr.message}"</p>}

      <div className="px-3.5 pb-2">
        <span className={`text-[10px] font-black px-2 py-1 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
      </div>

      {txn && PAYMENT_FLOW.has(hr.status) && (
        <div className="mx-3.5 mb-2 bg-gray-50 rounded-xl px-3 py-2.5 space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-gray-400">Pay</span><span className="font-bold text-gray-900">${txn.gross_amount.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Filmons Fee ({(txn.fee_rate * 100).toFixed(0)}%)</span><span className="text-gray-500">-${txn.fee_amount.toFixed(2)}</span></div>
          <div className="flex justify-between border-t border-gray-200 pt-1"><span className="text-gray-400">{isHost ? 'Your Earnings' : 'Host Earnings'}</span><span className="font-black text-gray-900">${txn.net_amount.toFixed(2)}</span></div>
          {txn.payment_status === 'funded' && (
            <div className="flex justify-between border-t border-gray-200 pt-1">
              <span className="text-gray-400">Status</span>
              {txn.work_status === 'completed'
                ? <span className="font-bold text-green-600">${txn.net_amount.toFixed(2)} Available</span>
                : <span className="font-bold text-amber-600">{isHost ? 'On Hold' : 'Held for Host'}</span>}
            </div>
          )}
        </div>
      )}

      <div className="px-3.5 pb-3.5 flex gap-2 flex-wrap">
        <button onClick={() => setSheetOpen(true)} className="flex-1 text-xs font-bold text-gray-700 bg-gray-100 rounded-xl py-2">View Request</button>

        {isMyTurn && (
          <>
            <button disabled={busy} onClick={doAccept} className="flex-1 text-xs font-bold text-white bg-green-600 rounded-xl py-2 disabled:opacity-50">Accept</button>
            <button disabled={busy} onClick={() => setCounterOpen(true)} className="flex-1 text-xs font-bold text-indigo-700 bg-indigo-50 rounded-xl py-2 disabled:opacity-50">Counter</button>
            <button disabled={busy} onClick={() => setDecliningOpen(true)} className="flex-1 text-xs font-bold text-red-600 bg-red-50 rounded-xl py-2 disabled:opacity-50">Decline</button>
          </>
        )}
        {OPEN.has(hr.status) && !isMyTurn && isRequester && (
          <button disabled={busy} onClick={doCancel} className="flex-1 text-xs font-bold text-gray-500 bg-gray-100 rounded-xl py-2 disabled:opacity-50">Cancel Request</button>
        )}

        {hr.status === 'accepted' && isRequester && (
          <button disabled={busy} onClick={doFund} className="flex-1 flex items-center justify-center gap-1 text-xs font-bold text-white bg-indigo-600 rounded-xl py-2 disabled:opacity-50"><DollarSign className="w-3 h-3" /> Pay for Hire</button>
        )}
        {hr.status === 'payment_pending' && isRequester && txn?.payment_status === 'pending' && (
          <button disabled={busy} onClick={doFund} className="flex-1 flex items-center justify-center gap-1 text-xs font-bold text-white bg-indigo-600 rounded-xl py-2 disabled:opacity-50"><DollarSign className="w-3 h-3" /> Retry Payment</button>
        )}
        {hr.status === 'hired' && txn?.work_status === 'in_progress' && isHost && (
          <button disabled={busy} onClick={doMarkComplete} className="flex-1 text-xs font-bold text-white bg-indigo-600 rounded-xl py-2 disabled:opacity-50">Mark Work Completed</button>
        )}
        {hr.status === 'hired' && txn?.work_status === 'marked_complete_by_worker' && isRequester && (
          <button disabled={busy} onClick={doConfirmCompletion} className="flex-1 text-xs font-bold text-white bg-green-600 rounded-xl py-2 disabled:opacity-50">Confirm Completion</button>
        )}
        {hr.status === 'hired' && (
          <button disabled={busy} onClick={doReportProblem} className="flex-1 flex items-center justify-center gap-1 text-xs font-bold text-red-600 bg-red-50 rounded-xl py-2 disabled:opacity-50"><AlertTriangle className="w-3 h-3" /> Report a Problem</button>
        )}
      </div>

      {counterOpen && (
        <div className="px-3.5 pb-3.5 -mt-1">
          <div className="bg-indigo-50 rounded-xl p-3 space-y-2">
            <p className="text-xs font-bold text-indigo-700">Counter offer amount</p>
            <input
              type="number" value={counterAmount} onChange={e => setCounterAmount(e.target.value)}
              placeholder="0.00" autoFocus
              className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-indigo-400"
            />
            <div className="flex gap-2">
              <button onClick={() => { setCounterOpen(false); setCounterAmount(''); }} className="flex-1 py-2 rounded-lg bg-white text-gray-600 text-xs font-bold border border-gray-200">Cancel</button>
              <button disabled={busy} onClick={doCounter} className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-50">Send Counter</button>
            </div>
          </div>
        </div>
      )}

      {decliningOpen && (
        <div className="px-3.5 pb-3.5 -mt-1">
          <div className="bg-red-50 rounded-xl p-3 space-y-2">
            <p className="text-xs text-gray-600">Decline this hire request?</p>
            <div className="flex gap-2">
              <button onClick={() => setDecliningOpen(false)} className="flex-1 py-2 rounded-lg bg-white text-gray-600 text-xs font-bold border border-gray-200">Cancel</button>
              <button disabled={busy} onClick={doDecline} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-50">Decline</button>
            </div>
          </div>
        </div>
      )}

      {sheetOpen && (
        <BottomSheet title="Hire Request" onClose={() => setSheetOpen(false)} footer={
          TERMINAL.has(hr.status) ? (
            <span className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-500 text-sm font-bold text-center flex items-center justify-center gap-1"><XCircle className="w-4 h-4" /> {statusInfo.label}</span>
          ) : hr.status === 'completed' ? (
            <span className="flex-1 py-2.5 rounded-xl bg-green-50 text-green-700 text-sm font-bold text-center flex items-center justify-center gap-1"><CheckCircle2 className="w-4 h-4" /> Completed</span>
          ) : null
        }>
          <div className="px-5 py-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 shrink-0">
                {otherParty?.avatar && <img src={otherParty.avatar} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">{otherParty?.name || (isHost ? 'Requester' : 'Creator')}</p>
                <p className="text-xs text-gray-400">{isHost ? 'Requester' : 'Creator'}</p>
              </div>
            </div>
            <Section label="Service"><p className="text-sm text-gray-700">{hr.service_label}</p></Section>
            <Section label="Description"><p className="text-sm text-gray-700 whitespace-pre-wrap">{hr.description}</p></Section>
            <Section label="Location"><p className="text-sm text-gray-700">{hr.work_type === 'on_site' ? [hr.street_address, hr.city, hr.province, hr.country].filter(Boolean).join(', ') : WORK_TYPE_LABEL[hr.work_type]}</p></Section>
            <Section label="Dates"><p className="text-sm text-gray-700">{formatDates(hr)}{hr.start_time ? ` · ${hr.start_time}${hr.end_time ? `–${hr.end_time}` : ''}` : ''}</p></Section>
            <Section label="Budget"><p className="text-sm text-gray-700">{budgetLabel}</p></Section>
            {hr.reference_links && hr.reference_links.length > 0 && (
              <Section label="Reference Links">
                <div className="space-y-1">
                  {hr.reference_links.map((l, i) => <a key={i} href={l} target="_blank" rel="noreferrer" className="block text-sm text-indigo-600 truncate">{l}</a>)}
                </div>
              </Section>
            )}
            <p className="text-[11px] text-gray-300">Sent {new Date(hr.created_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
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
