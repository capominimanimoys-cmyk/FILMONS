// Paid Opportunity work records — the one client-side read model every
// surface (Home, own Profile, Inbox banner, Notifications → work record,
// Dashboard, Opportunity management / My Applications) renders from.
//
// A work record is an opportunity_transactions row whose payment has been
// confirmed (payment_status 'funded'/'completed'); one per hired applicant,
// so multiple hires on one Opportunity are tracked separately. Status is
// derived from two separate server columns that are never conflated:
//   work_status    in_progress | marked_complete_by_worker | completed
//   release_status held | processing | available
// "Available" is only ever shown when release_status = 'available', which
// the server sets only once the wallet row is actually withdrawable.
//
// All surfaces share ONE store per signed-in user (one fetch, one realtime
// channel), so a change made anywhere — or by the other party — shows up
// everywhere at once.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { supabase } from '../../lib/supabase';
import { applicationApi } from './applicationApi';

export type WorkStage = 'in_progress' | 'awaiting_approval' | 'approved_processing' | 'available';
export type WorkRole = 'client' | 'applicant';

export interface WorkRecord {
  id: string;
  applicationId: string;
  listingId: string;
  orderId: string | null;
  conversationId: string | null;
  clientId: string;
  applicantId: string;
  clientName: string;
  clientAvatar: string | null;
  applicantName: string;
  applicantAvatar: string | null;
  opportunityTitle: string;
  opportunityImage: string | null;
  agreedAmount: number;
  applicantEarnings: number;
  currency: string;
  workStatus: 'in_progress' | 'marked_complete_by_worker' | 'completed';
  releaseStatus: 'held' | 'processing' | 'available';
  fundedAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  approvalMethod: 'client' | 'auto' | null;
  problemReported: boolean;
}

export function getWorkStage(r: Pick<WorkRecord, 'workStatus' | 'releaseStatus'>): WorkStage {
  if (r.workStatus === 'in_progress') return 'in_progress';
  if (r.workStatus === 'marked_complete_by_worker') return 'awaiting_approval';
  return r.releaseStatus === 'available' ? 'available' : 'approved_processing';
}

export function getWorkRole(r: Pick<WorkRecord, 'clientId' | 'applicantId'>, userId: string | null | undefined): WorkRole | null {
  if (!userId) return null;
  if (r.applicantId === userId) return 'applicant';
  if (r.clientId === userId) return 'client';
  return null;
}

// The shared status table — every card, banner and row uses these labels.
const STAGE_LABEL: Record<WorkStage, Record<WorkRole, string>> = {
  in_progress:         { applicant: 'Work in progress',                     client: 'Work in progress' },
  awaiting_approval:   { applicant: 'Awaiting client approval',             client: 'Awaiting your approval' },
  approved_processing: { applicant: 'Work approved · Payment processing',   client: 'Work approved · Payment processing' },
  available:           { applicant: 'Available in your FILMONS wallet',     client: 'Payment released' },
};
export function workStatusLabel(stage: WorkStage, role: WorkRole): string {
  return STAGE_LABEL[stage][role];
}

export const WORK_STAGE_TONE: Record<WorkStage, string> = {
  in_progress: 'bg-blue-50 text-blue-700',
  awaiting_approval: 'bg-amber-50 text-amber-700',
  approved_processing: 'bg-indigo-50 text-indigo-700',
  available: 'bg-green-50 text-green-700',
};

export function formatMoney(amount: number, currency = 'CAD'): string {
  try {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

/** Whether this record still needs something from `role` (drives reminders). */
export function needsAction(r: WorkRecord, role: WorkRole): boolean {
  const stage = getWorkStage(r);
  return (role === 'applicant' && stage === 'in_progress') || (role === 'client' && stage === 'awaiting_approval');
}

// ── Fetch ────────────────────────────────────────────────────────────────

async function fetchWorkRecords(userId: string): Promise<WorkRecord[]> {
  const { data: txns, error } = await supabase
    .from('opportunity_transactions')
    .select('*')
    .or(`owner_id.eq.${userId},worker_id.eq.${userId}`)
    .in('payment_status', ['funded', 'completed'])
    .order('funded_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = txns || [];
  if (!rows.length) return [];

  const listingIds = [...new Set(rows.map((t: any) => t.listing_id).filter(Boolean))];
  const profileIds = [...new Set(rows.flatMap((t: any) => [t.owner_id, t.worker_id]).filter(Boolean))];
  const appIds = [...new Set(rows.map((t: any) => t.application_id).filter(Boolean))];
  const orderIds = [...new Set(rows.map((t: any) => t.order_id).filter(Boolean))];

  const [listingsRes, profilesRes, appsRes, ordersRes] = await Promise.all([
    supabase.from('listings').select('id, title, images').in('id', listingIds),
    supabase.from('profiles').select('id, name, avatar_url').in('id', profileIds),
    supabase.from('opportunity_applications').select('id, conversation_id').in('id', appIds),
    // Best-effort: only used to show "Problem reported". Never gates actions.
    orderIds.length
      ? supabase.from('orders').select('id, dispute_status').in('id', orderIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const listingById = new Map((listingsRes.data || []).map((l: any) => [l.id, l]));
  const profileById = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));
  const convByApp = new Map((appsRes.data || []).map((a: any) => [a.id, a.conversation_id]));
  const disputeByOrder = new Map(((ordersRes as any).data || []).map((o: any) => [o.id, o.dispute_status]));

  return rows.map((t: any): WorkRecord => {
    const listing = listingById.get(t.listing_id);
    const client = profileById.get(t.owner_id);
    const applicant = profileById.get(t.worker_id);
    return {
      id: t.id,
      applicationId: t.application_id,
      listingId: t.listing_id,
      orderId: t.order_id ?? null,
      conversationId: convByApp.get(t.application_id) ?? null,
      clientId: t.owner_id,
      applicantId: t.worker_id,
      clientName: client?.name || 'Client',
      clientAvatar: client?.avatar_url || null,
      applicantName: applicant?.name || 'Applicant',
      applicantAvatar: applicant?.avatar_url || null,
      opportunityTitle: listing?.title || 'Opportunity',
      opportunityImage: listing?.images?.[0] || null,
      agreedAmount: Number(t.gross_amount) || 0,
      applicantEarnings: Number(t.net_amount) || 0,
      currency: t.currency || 'CAD',
      workStatus: t.work_status,
      releaseStatus: t.release_status || (t.work_status === 'completed' ? 'processing' : 'held'),
      fundedAt: t.funded_at ?? null,
      submittedAt: t.marked_complete_at ?? null,
      approvedAt: t.approved_at ?? t.completed_at ?? null,
      approvalMethod: t.approval_method ?? null,
      problemReported: disputeByOrder.get(t.order_id) === 'disputed',
    };
  });
}

// ── Shared store ─────────────────────────────────────────────────────────

interface StoreState { records: WorkRecord[]; loading: boolean; loaded: boolean; error: boolean }
const EMPTY: StoreState = { records: [], loading: false, loaded: false, error: false };

interface UserStore {
  state: StoreState;
  listeners: Set<() => void>;
  channel: ReturnType<typeof supabase.channel> | null;
  inflight: Promise<void> | null;
  refetchTimer: ReturnType<typeof setTimeout> | null;
}
const stores = new Map<string, UserStore>();

function getStore(userId: string): UserStore {
  let s = stores.get(userId);
  if (!s) {
    s = { state: EMPTY, listeners: new Set(), channel: null, inflight: null, refetchTimer: null };
    stores.set(userId, s);
  }
  return s;
}

function setState(userId: string, patch: Partial<StoreState>) {
  const s = getStore(userId);
  s.state = { ...s.state, ...patch };
  s.listeners.forEach(l => l());
}

export function refreshWorkRecords(userId: string): Promise<void> {
  const s = getStore(userId);
  if (s.inflight) return s.inflight;
  setState(userId, { loading: true });
  s.inflight = fetchWorkRecords(userId)
    .then(records => setState(userId, { records, loading: false, loaded: true, error: false }))
    .catch(e => {
      console.warn('[workApi] fetch failed:', e);
      setState(userId, { loading: false, loaded: true, error: true });
    })
    .finally(() => { s.inflight = null; });
  return s.inflight;
}

function scheduleRefetch(userId: string) {
  const s = getStore(userId);
  if (s.refetchTimer) clearTimeout(s.refetchTimer);
  s.refetchTimer = setTimeout(() => { s.refetchTimer = null; refreshWorkRecords(userId); }, 250);
}

function subscribe(userId: string, listener: () => void): () => void {
  const s = getStore(userId);
  s.listeners.add(listener);
  if (!s.channel) {
    // Two filtered listeners (a realtime filter takes one column): every
    // change to a record where this user is the client or the applicant.
    s.channel = supabase
      .channel(`work-records:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunity_transactions', filter: `owner_id=eq.${userId}` },
        () => scheduleRefetch(userId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunity_transactions', filter: `worker_id=eq.${userId}` },
        () => scheduleRefetch(userId))
      .subscribe();
    if (!s.state.loaded && !s.inflight) refreshWorkRecords(userId);
  }
  return () => {
    s.listeners.delete(listener);
    if (s.listeners.size === 0 && s.channel) {
      supabase.removeChannel(s.channel);
      s.channel = null;
    }
  };
}

const noopSubscribe = () => () => {};
const getEmpty = () => EMPTY;

/** All work records for the signed-in user, kept live across the app. */
export function useWorkRecords(userId: string | null | undefined): StoreState {
  const sub = useMemo(() => (userId ? (l: () => void) => subscribe(userId, l) : noopSubscribe), [userId]);
  const get = useMemo(() => (userId ? () => getStore(userId).state : getEmpty), [userId]);
  const state = useSyncExternalStore(sub, get, get);
  // Re-sync on mount when data is stale from an earlier session of the page.
  useEffect(() => { if (userId && getStore(userId).state.loaded) scheduleRefetch(userId); }, [userId]);
  return state;
}

/** One work record by application id (for the work record page / bubbles). */
export function useWorkRecord(userId: string | null | undefined, applicationId: string | null | undefined) {
  const state = useWorkRecords(userId);
  const record = applicationId ? state.records.find(r => r.applicationId === applicationId) || null : null;
  return { record, loading: state.loading && !state.loaded, loaded: state.loaded };
}

// ── Actions ──────────────────────────────────────────────────────────────
// Server-verified through manage-application; the SQL behind each one is a
// single conditional UPDATE, so repeated taps are harmless no-ops. Local
// state is patched immediately from the server's answer, then re-synced.

function patchRecord(userId: string, applicationId: string, patch: Partial<WorkRecord>) {
  const s = getStore(userId);
  setState(userId, { records: s.state.records.map(r => r.applicationId === applicationId ? { ...r, ...patch } : r) });
}

export async function submitWork(userId: string, applicationId: string): Promise<{ duplicate: boolean }> {
  const res: any = await applicationApi.submitWork(applicationId, userId);
  const t = res?.transaction;
  if (t) patchRecord(userId, applicationId, { workStatus: t.work_status, releaseStatus: t.release_status, submittedAt: t.marked_complete_at ?? null });
  scheduleRefetch(userId);
  return { duplicate: !!res?.duplicate };
}

export async function approveWork(userId: string, applicationId: string): Promise<{ duplicate: boolean; releaseStatus: WorkRecord['releaseStatus'] | null }> {
  const res: any = await applicationApi.approveWork(applicationId, userId);
  const t = res?.transaction;
  if (t) patchRecord(userId, applicationId, { workStatus: t.work_status, releaseStatus: t.release_status, approvedAt: t.approved_at ?? t.completed_at ?? null });
  scheduleRefetch(userId);
  return { duplicate: !!res?.duplicate, releaseStatus: t?.release_status ?? null };
}

export async function reportWorkProblem(userId: string, applicationId: string): Promise<void> {
  await applicationApi.reportProblem(applicationId, userId);
  patchRecord(userId, applicationId, { problemReported: true });
  scheduleRefetch(userId);
}
