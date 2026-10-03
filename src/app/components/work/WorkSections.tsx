/**
 * Per-surface groupings of the shared work records. Every section reads
 * the same useWorkRecords() store and renders WorkStatusCard, so status
 * and controls are identical everywhere and update together.
 */
import { ReactNode } from 'react';
import { Briefcase, ClipboardCheck, Lock, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { WorkRecord, WorkStage, getWorkRole, getWorkStage, useWorkRecords, useWorkRecord, formatMoney } from '../../lib/workApi';
import { WorkStatusCard } from './WorkStatusCard';

function useMine() {
  const { user } = useAuth();
  const state = useWorkRecords(user?.id);
  const asClient = (stages: WorkStage[]) =>
    state.records.filter(r => getWorkRole(r, user?.id) === 'client' && stages.includes(getWorkStage(r)));
  const asApplicant = (stages: WorkStage[]) =>
    state.records.filter(r => getWorkRole(r, user?.id) === 'applicant' && stages.includes(getWorkStage(r)));
  return { user, state, asClient, asApplicant };
}

function Section({ icon, title, subtitle, children, count }: { icon: ReactNode; title: string; subtitle?: ReactNode; count?: number; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        {icon}
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        {count !== undefined && <span className="text-xs text-gray-400">({count})</span>}
        {subtitle && <span className="ml-auto text-[10px] text-gray-400 flex items-center gap-1">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

/** Homepage: applicant's active work + client's approval reminders (only after submission). */
export function HomeWorkCards() {
  const { user, asClient, asApplicant } = useMine();
  if (!user) return null;
  const approvals = asClient(['awaiting_approval']);
  const active = asApplicant(['in_progress', 'awaiting_approval']);
  if (!approvals.length && !active.length) return null;
  return (
    <div className="space-y-3">
      {approvals.length > 0 && (
        <Section icon={<ClipboardCheck className="w-4 h-4 text-amber-500" />} title="Work ready for your approval" count={approvals.length}>
          <div className="space-y-2">{approvals.map(r => <WorkStatusCard key={r.id} record={r} />)}</div>
        </Section>
      )}
      {active.length > 0 && (
        <Section icon={<Briefcase className="w-4 h-4 text-indigo-500" />} title="Your active work" count={active.length}>
          <div className="space-y-2">{active.map(r => <WorkStatusCard key={r.id} record={r} />)}</div>
        </Section>
      )}
    </div>
  );
}

/** Own profile only (Profile.tsx never renders for other viewers). */
export function ProfileWorkSections() {
  const { user, asClient, asApplicant } = useMine();
  if (!user) return null;
  const approvals = asClient(['awaiting_approval']);
  const active = asApplicant(['in_progress', 'awaiting_approval', 'approved_processing']);
  if (!approvals.length && !active.length) return null;
  const priv = <><Lock className="w-3 h-3" /> Only you can see this</>;
  return (
    <div className="max-w-4xl lg:max-w-5xl mx-auto px-3 pt-3 space-y-4">
      {approvals.length > 0 && (
        <Section icon={<ClipboardCheck className="w-4 h-4 text-amber-500" />} title="Pending approvals" count={approvals.length} subtitle={priv}>
          <div className="space-y-2">{approvals.map(r => <WorkStatusCard key={r.id} record={r} />)}</div>
        </Section>
      )}
      {active.length > 0 && (
        <Section icon={<Briefcase className="w-4 h-4 text-indigo-500" />} title="My active opportunities" count={active.length} subtitle={priv}>
          <div className="space-y-2">{active.map(r => <WorkStatusCard key={r.id} record={r} />)}</div>
        </Section>
      )}
    </div>
  );
}

const RECENT_MS = 14 * 86_400_000;

/** Inbox: banner(s) for paid hires between the two people in this conversation. */
export function ConversationWorkBanner({ conversationId, otherUserId }: { conversationId: string; otherUserId: string }) {
  const { user, state } = useMine();
  if (!user || !otherUserId) return null;
  const records = state.records
    .filter(r => r.conversationId === conversationId
      || (r.clientId === user.id && r.applicantId === otherUserId)
      || (r.applicantId === user.id && r.clientId === otherUserId))
    .filter(r => getWorkStage(r) !== 'available' || (r.approvedAt && Date.now() - new Date(r.approvedAt).getTime() < RECENT_MS))
    .sort((a, b) => actionRank(a, user.id) - actionRank(b, user.id));
  if (!records.length) return null;
  return (
    <div className="shrink-0 max-h-[45vh] overflow-y-auto">
      {records.map(r => <WorkStatusCard key={r.id} record={r} variant="banner" />)}
    </div>
  );
}

function actionRank(r: WorkRecord, userId: string): number {
  const role = getWorkRole(r, userId);
  const stage = getWorkStage(r);
  if ((role === 'client' && stage === 'awaiting_approval') || (role === 'applicant' && stage === 'in_progress')) return 0;
  return stage === 'available' ? 2 : 1;
}

/** Dashboard: client's active hires + pending approvals; applicant's active work, awaiting approval and earnings status. */
export function DashboardWorkOverview() {
  const { user, asClient, asApplicant } = useMine();
  if (!user) return null;
  const clientActive = asClient(['in_progress']);
  const clientApprovals = asClient(['awaiting_approval']);
  const workActive = asApplicant(['in_progress']);
  const workAwaiting = asApplicant(['awaiting_approval']);
  const earnings = asApplicant(['approved_processing', 'available']);
  if (!clientActive.length && !clientApprovals.length && !workActive.length && !workAwaiting.length && !earnings.length) return null;

  const processing = earnings.filter(r => getWorkStage(r) === 'approved_processing');
  const available = earnings.filter(r => getWorkStage(r) === 'available');
  const sum = (rs: WorkRecord[]) => rs.reduce((n, r) => n + r.applicantEarnings, 0);
  const currency = earnings[0]?.currency || 'CAD';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Briefcase className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-bold text-gray-900">Paid opportunity work</h3>
      </div>
      {clientApprovals.length > 0 && (
        <Section icon={<ClipboardCheck className="w-4 h-4 text-amber-500" />} title="Pending approvals" count={clientApprovals.length}>
          <div className="space-y-2">{clientApprovals.map(r => <WorkStatusCard key={r.id} record={r} variant="compact" />)}</div>
        </Section>
      )}
      {clientActive.length > 0 && (
        <Section icon={<Briefcase className="w-4 h-4 text-blue-500" />} title="Active hires" count={clientActive.length}>
          <div className="space-y-2">{clientActive.map(r => <WorkStatusCard key={r.id} record={r} variant="compact" />)}</div>
        </Section>
      )}
      {workActive.length > 0 && (
        <Section icon={<Briefcase className="w-4 h-4 text-indigo-500" />} title="Active work" count={workActive.length}>
          <div className="space-y-2">{workActive.map(r => <WorkStatusCard key={r.id} record={r} variant="compact" />)}</div>
        </Section>
      )}
      {workAwaiting.length > 0 && (
        <Section icon={<ClipboardCheck className="w-4 h-4 text-amber-500" />} title="Awaiting approval" count={workAwaiting.length}>
          <div className="space-y-2">{workAwaiting.map(r => <WorkStatusCard key={r.id} record={r} variant="compact" />)}</div>
        </Section>
      )}
      {earnings.length > 0 && (
        <Section icon={<Wallet className="w-4 h-4 text-green-600" />} title="Earnings status">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-indigo-50 px-3 py-2.5">
              <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">Payment processing</p>
              <p className="text-base font-black text-gray-900">{formatMoney(sum(processing), currency)}</p>
              <p className="text-[10px] text-gray-500">Not yet withdrawable</p>
            </div>
            <div className="rounded-xl bg-green-50 px-3 py-2.5">
              <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide">Available in wallet</p>
              <p className="text-base font-black text-gray-900">{formatMoney(sum(available), currency)}</p>
              <p className="text-[10px] text-gray-500">Ready to withdraw</p>
            </div>
          </div>
          <div className="space-y-2">{earnings.slice(0, 5).map(r => <WorkStatusCard key={r.id} record={r} variant="compact" />)}</div>
        </Section>
      )}
    </div>
  );
}

/** The work record for one application, if this user is a party to a confirmed paid hire. */
export function WorkRecordInline({ applicationId, variant = 'compact', hideActions }: {
  applicationId: string; variant?: 'compact' | 'card'; hideActions?: boolean;
}) {
  const { user } = useAuth();
  const { record } = useWorkRecord(user?.id, applicationId);
  if (!record) return null;
  return <WorkStatusCard record={record} variant={variant} hideActions={hideActions} />;
}
