/**
 * The one card/banner every surface uses for a paid Opportunity work
 * record — Home, own Profile, Inbox banner, Dashboard, Opportunity
 * management, My Applications and the /work/:applicationId record page.
 * Always shows the opportunity title, the other user's name, the agreed
 * amount and the shared status; actions depend only on role + stage, so
 * every location offers exactly the same controls for the same state.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { toast } from 'sonner';
import { Briefcase, MessageCircle, ExternalLink, AlertTriangle, CheckCircle2, Clock, Loader2, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  WorkRecord, WorkRole, getWorkRole, getWorkStage, workStatusLabel, WORK_STAGE_TONE, formatMoney,
  submitWork, approveWork, reportWorkProblem,
} from '../../lib/workApi';

type Variant = 'card' | 'banner' | 'compact' | 'full';

export function WorkStatusCard({ record, variant = 'card', hideActions = false, linkToRecord = true }: {
  record: WorkRecord;
  variant?: Variant;
  /** Status only, no buttons (e.g. a historical chat bubble that sits next to the live banner). */
  hideActions?: boolean;
  /** Title row opens /work/:applicationId. Off on the record page itself. */
  linkToRecord?: boolean;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = getWorkRole(record, user?.id);
  const [dialog, setDialog] = useState<null | 'submit' | 'approve' | 'report'>(null);
  const [busy, setBusy] = useState(false);
  if (!role || !user) return null;

  const stage = getWorkStage(record);
  const otherName = role === 'client' ? record.applicantName : record.clientName;
  const otherAvatar = role === 'client' ? record.applicantAvatar : record.clientAvatar;
  const otherId = role === 'client' ? record.applicantId : record.clientId;
  const status = workStatusLabel(stage, role);

  const openMessages = () => navigate(record.conversationId
    ? `/inbox?conv=${record.conversationId}&with=${otherId}`
    : `/inbox?with=${otherId}`);
  const openOpportunity = () => navigate(`/listing/${record.listingId}`);
  const openRecord = () => navigate(`/work/${record.applicationId}`);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); setDialog(null); }
    catch (e: any) { toast.error(e?.message || 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  };

  const doSubmit = () => run(async () => {
    const { duplicate } = await submitWork(user.id, record.applicationId);
    toast.success(duplicate ? 'Already marked as submitted' : 'Marked as submitted — the client has been notified');
  });
  const doApprove = () => run(async () => {
    const { duplicate, releaseStatus } = await approveWork(user.id, record.applicationId);
    toast.success(duplicate ? 'This work is already approved'
      : releaseStatus === 'available' ? 'Work approved — payment released' : 'Work approved — payment processing');
  });
  const doReport = () => run(async () => {
    await reportWorkProblem(user.id, record.applicationId);
    toast.success('Problem reported — payment is paused while FILMONS reviews it');
  });

  const showActions = !hideActions;
  const compact = variant === 'compact';

  const actions = showActions ? (
    <WorkActions
      role={role} stage={stage} compact={compact} busy={busy}
      problemReported={record.problemReported}
      onSubmit={() => setDialog('submit')}
      onApprove={() => setDialog('approve')}
      onReport={() => setDialog('report')}
      onMessage={openMessages}
      onOpportunity={openOpportunity}
      showReportForEitherParty={variant === 'full'}
    />
  ) : null;

  const shell =
    variant === 'banner' ? 'bg-indigo-50/70 border-b border-indigo-100 px-4 py-3'
    : compact ? 'rounded-xl border border-gray-100 bg-gray-50 p-3'
    : 'rounded-2xl border border-gray-100 bg-white shadow-sm p-4';

  return (
    <div className={`${shell} space-y-2.5`}>
      <div className="flex items-start gap-3">
        {!compact && (
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-indigo-50 shrink-0 flex items-center justify-center">
            {record.opportunityImage
              ? <img src={record.opportunityImage} alt="" className="w-full h-full object-cover" />
              : <Briefcase className="w-5 h-5 text-indigo-400" />}
          </div>
        )}
        <div className="min-w-0 flex-1">
          {variant === 'banner' && (
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-0.5">Paid opportunity</p>
          )}
          <button
            type="button"
            disabled={!linkToRecord}
            onClick={openRecord}
            className="w-full text-left flex items-center gap-1 disabled:cursor-default group"
          >
            <span className="text-sm font-bold text-gray-900 truncate group-enabled:group-hover:text-indigo-700">{record.opportunityTitle}</span>
            {linkToRecord && <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
          </button>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            {otherAvatar && <img src={otherAvatar} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />}
            <p className="text-xs text-gray-500 truncate">
              {role === 'client' ? 'Applicant' : 'Client'}: <span className="font-semibold text-gray-700">{otherName}</span>
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-black text-gray-900">{formatMoney(record.agreedAmount, record.currency)}</p>
          <p className="text-[10px] text-gray-400">Agreed amount</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full ${WORK_STAGE_TONE[stage]}`}>
          {stage === 'available' ? <CheckCircle2 className="w-3 h-3" /> : stage === 'approved_processing' ? <Loader2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
          {status}
        </span>
        {record.problemReported && stage !== 'available' && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-red-50 text-red-600">
            <AlertTriangle className="w-3 h-3" /> Problem reported
          </span>
        )}
      </div>

      {variant === 'full' && <WorkDetails record={record} role={role} />}

      {actions}

      <ConfirmDialog
        open={dialog === 'submit'}
        title="Have you delivered the agreed work?"
        body="This notifies the client that your work is ready for approval. You do not need to upload files to FILMONS."
        confirmLabel="Mark as submitted"
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={doSubmit}
      />
      <ConfirmDialog
        open={dialog === 'approve'}
        title="Approve this work?"
        body={`Confirm that ${record.applicantName} has completed the agreed work. Approval releases their payment.`}
        confirmLabel="Approve and release payment"
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={doApprove}
      />
      <ConfirmDialog
        open={dialog === 'report'}
        title="Report a problem?"
        body="FILMONS will review this hire. Payment stays on hold while the problem is open. You can still message the other person."
        confirmLabel="Report a problem"
        destructive
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={doReport}
      />
    </div>
  );
}

function WorkActions({ role, stage, compact, busy, problemReported, onSubmit, onApprove, onReport, onMessage, onOpportunity, showReportForEitherParty }: {
  role: WorkRole; stage: ReturnType<typeof getWorkStage>; compact: boolean; busy: boolean; problemReported: boolean;
  onSubmit: () => void; onApprove: () => void; onReport: () => void; onMessage: () => void; onOpportunity: () => void;
  showReportForEitherParty: boolean;
}) {
  const btn = compact ? 'text-xs py-2 rounded-lg' : 'text-xs py-2.5 rounded-xl';
  const primary = `${btn} flex-1 font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1`;
  const approve = `${btn} flex-1 font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-1`;
  const secondary = `${btn} flex-1 font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-1`;
  const danger = `${btn} flex-1 font-bold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 flex items-center justify-center gap-1`;

  if (role === 'applicant' && stage === 'in_progress') {
    return (
      <div className="space-y-1.5">
        <button type="button" disabled={busy} onClick={onSubmit} className={`${primary} w-full`}>Mark work as submitted</button>
        {showReportForEitherParty && !problemReported && (
          <button type="button" disabled={busy} onClick={onReport} className="w-full text-[11px] font-semibold text-gray-400 hover:text-red-600">Report a problem</button>
        )}
      </div>
    );
  }
  if (role === 'client' && stage === 'in_progress') {
    return (
      <div className="space-y-1.5">
        <div className="flex gap-2">
          <button type="button" onClick={onMessage} className={secondary}><MessageCircle className="w-3.5 h-3.5" /> Message applicant</button>
          <button type="button" onClick={onOpportunity} className={secondary}><ExternalLink className="w-3.5 h-3.5" /> View opportunity</button>
        </div>
        {showReportForEitherParty && !problemReported && (
          <button type="button" disabled={busy} onClick={onReport} className="w-full text-[11px] font-semibold text-gray-400 hover:text-red-600">Report a problem</button>
        )}
      </div>
    );
  }
  if (role === 'client' && stage === 'awaiting_approval') {
    return (
      <div className="space-y-2">
        <button type="button" disabled={busy} onClick={onApprove} className={`${approve} w-full`}><CheckCircle2 className="w-3.5 h-3.5" /> Approve work</button>
        <div className="flex gap-2">
          <button type="button" onClick={onMessage} className={secondary}><MessageCircle className="w-3.5 h-3.5" /> Message applicant</button>
          {!problemReported && (
            <button type="button" disabled={busy} onClick={onReport} className={danger}><AlertTriangle className="w-3.5 h-3.5" /> Report a problem</button>
          )}
        </div>
      </div>
    );
  }
  // Awaiting approval (applicant) and everything after approval: status
  // only — no reminders, no action buttons.
  return null;
}

function WorkDetails({ record, role }: { record: WorkRecord; role: WorkRole }) {
  const fmt = (d: string | null) => d
    ? new Date(d).toLocaleString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;
  const stage = getWorkStage(record);
  const paymentLine =
    stage === 'available' ? (role === 'applicant' ? 'Available in your FILMONS wallet' : 'Released to the applicant')
    : stage === 'approved_processing' ? 'Processing — not yet withdrawable'
    : 'Pending until the work is approved';
  const rows: [string, string | null][] = [
    ['Agreed amount', formatMoney(record.agreedAmount, record.currency)],
    role === 'applicant' ? ['Your earnings (after FILMONS fee)', formatMoney(record.applicantEarnings, record.currency)] : ['Applicant receives', formatMoney(record.applicantEarnings, record.currency)],
    ['Payment confirmed', fmt(record.fundedAt)],
    ['Work submitted', fmt(record.submittedAt)],
    ['Work approved', record.approvedAt ? `${fmt(record.approvedAt)}${record.approvalMethod === 'auto' ? ' (automatic)' : ''}` : null],
    ['Payment', paymentLine],
  ];
  return (
    <dl className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-1.5 text-xs">
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <dt className="text-gray-400">{k}</dt>
          <dd className="font-semibold text-gray-800 text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ConfirmDialog({ open, title, body, confirmLabel, destructive, busy, onCancel, onConfirm }: {
  open: boolean; title: string; body: string; confirmLabel: string; destructive?: boolean; busy: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={o => { if (!o && !busy) onCancel(); }}>
      <AlertDialog.Portal>
        {/* z-[100]: these can open from inside a BottomSheet (z-70). */}
        <AlertDialog.Overlay className="fixed inset-0 z-[100] bg-black/50" />
        <AlertDialog.Content className="fixed z-[101] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm bg-white rounded-2xl shadow-xl p-5 space-y-3">
          <AlertDialog.Title className="text-base font-black text-gray-900">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-gray-600">{body}</AlertDialog.Description>
          <div className="flex gap-2 pt-1">
            <AlertDialog.Cancel asChild>
              <button type="button" disabled={busy} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold disabled:opacity-50">Cancel</button>
            </AlertDialog.Cancel>
            <button
              type="button" disabled={busy} onClick={onConfirm}
              className={`flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-1.5 ${destructive ? 'bg-red-600' : 'bg-indigo-600'}`}
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
