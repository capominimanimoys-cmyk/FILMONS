// FILMONS Calendar -- one unified view of everything with a date:
//   SCHEDULED activities (appointments): rental pickup / period / return,
//     service dates, order pickup/delivery, opportunity work dates, live sessions.
//   TRANSACTION records (never appointments): purchases, sales, service
//     purchases without a schedule, opportunity applications, course
//     enrollments, wallet cash in / cash out.
//
// Entries are DERIVED from the source records on every load, never stored
// separately. That keeps them in sync (a date/status change on the original
// record shows up on the next load) and makes duplicates impossible: each
// source record maps to a fixed, stable `key` (e.g. 'order:<id>:pickup'), and
// a rental request that later becomes an order collapses into the order's
// entries via a shared dedupe ref. Rescheduling / cancelling happens on the
// related management page, never here.
//
// Wallet entries are read only for the signed-in user's own wallet / payout
// requests, so cash in / cash out can never reach another participant.
//
// Only the user's reminder choices are persisted (calendar_reminders).
import { supabase } from '../../lib/supabase';
import { withTimeout } from './withTimeout';

export type CalendarKind = 'rental' | 'service' | 'sale' | 'opportunity' | 'course' | 'wallet';
export type CalendarNature = 'scheduled' | 'record';
export type CalendarStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';
export type CalendarPart =
  | 'pickup' | 'return' | 'period' | 'work' | 'service' | 'session' | 'delivery'
  | 'purchase' | 'sale' | 'applied' | 'enrolled' | 'cash_in' | 'cash_out';

export interface CalendarLink {
  label: string;
  /** In-app route in the main FILMONS app. */
  to?: string;
  /** Route inside FILMONS Learning (opened with enterLearning). */
  learningPath?: string;
}

export interface CalendarAmount {
  value: number;
  currency: string;
  /** 'in' = money received, 'out' = money spent / withdrawn. */
  direction: 'in' | 'out';
}

export interface CalendarEvent {
  /** Stable across loads and across request -> confirmed transitions. */
  key: string;
  kind: CalendarKind;
  /** scheduled = an appointment; record = a transaction/enrollment/application on its date. */
  nature: CalendarNature;
  part: CalendarPart;
  title: string;
  /** Short qualifier beside the title: "Pickup", "Purchase", "Cash in"... */
  partLabel: string;
  start: Date;
  /** Inclusive end for multi-day entries (period / date ranges); else null. */
  end: Date | null;
  allDay: boolean;
  /** IANA timezone the time is meant in (viewer's own unless the source says otherwise). */
  timezone: string;
  status: CalendarStatus;
  /** Always-visible written status ("Pending", "Application pending", "Paid"...). */
  statusLabel: string;
  amount?: CalendarAmount;
  location?: string;
  meetingLink?: string;
  counterpart?: { id?: string; name: string; role: string };
  view: CalendarLink;
  /** Opportunity applicant/application management, when relevant. */
  manage?: CalendarLink;
  /** Conversation to open for "Message" (or fall back to counterpart id). */
  conversationId?: string;
  /** True when the signed-in user is the owner / provider / poster / instructor side. */
  iAmProvider?: boolean;
}

export type CalendarSource = 'bookings' | 'services' | 'opportunities' | 'courses' | 'wallet';

export interface CalendarLoadResult {
  events: CalendarEvent[];
  /** Sources that timed out or errored -- shown to the user with a retry, never swallowed. */
  failed: CalendarSource[];
}

export const FILTERS = ['all', 'rental', 'service', 'sale', 'opportunity', 'course', 'wallet'] as const;
export type CalendarFilter = typeof FILTERS[number];
export const FILTER_LABEL: Record<CalendarFilter, string> = {
  all: 'All', rental: 'Rentals', service: 'Services', sale: 'Sales',
  opportunity: 'Opportunities', course: 'Courses', wallet: 'Wallet',
};
export const KIND_LABEL: Record<CalendarKind, string> = {
  rental: 'Rental', service: 'Service', sale: 'Sale / purchase',
  opportunity: 'Opportunity', course: 'Course', wallet: 'Wallet transaction',
};

const SOURCE_DEADLINE_MS = 4200;
const LOOKBACK_DAYS = 90;
const ROW_CAP = 100;

export const viewerTimezone = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

// ── Date helpers ──────────────────────────────────────────────────────────────
/** 'YYYY-MM-DD' (or a full ISO string) -> local-midnight Date of that calendar day. */
function dayOf(v: string | null | undefined): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(v);
  return isNaN(+d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
/** A real timestamp (paid_at, created_at...) as-is -- records keep their time of day. */
function stampOf(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(+d) ? null : d;
}
function withTime(day: Date, hhmm?: string | null): { date: Date; allDay: boolean } {
  const m = hhmm ? /^(\d{1,2}):(\d{2})/.exec(hhmm) : null;
  if (!m) return { date: day, allDay: true };
  return { date: new Date(day.getFullYear(), day.getMonth(), day.getDate(), +m[1], +m[2]), allDay: false };
}
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Does this entry fall on the given calendar day (multi-day entries cover every day). */
export function coversDay(e: CalendarEvent, day: Date): boolean {
  const s = startOfDay(e.start).getTime();
  const en = startOfDay(e.end ?? e.start).getTime();
  const t = startOfDay(day).getTime();
  return t >= s && t <= en;
}

function lifecycle(status: CalendarStatus, lastMoment: Date): CalendarStatus {
  // Confirmed work that is over becomes Completed and stays on its past date.
  if (status === 'confirmed' && lastMoment.getTime() < Date.now()) return 'completed';
  return status;
}
const cutoffMs = () => Date.now() - LOOKBACK_DAYS * 864e5;
const inWindow = (last: Date) => last.getTime() >= cutoffMs();

const STATUS_LABEL: Record<CalendarStatus, string> = {
  pending: 'Pending', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled',
};

const money = (n: unknown) => { const v = Number(n); return Number.isFinite(v) ? v : 0; };

// ── Shared lookups ────────────────────────────────────────────────────────────
type Names = Map<string, string>;

async function fetchProfileNames(ids: string[]): Promise<Names> {
  const out: Names = new Map();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return out;
  const { data } = await supabase.from('profiles').select('id, name, username').in('id', uniq);
  (data || []).forEach((p: any) => out.set(p.id, p.name || p.username || 'FILMONS member'));
  return out;
}

// ── Source: orders + rental/service requests in chat ("bookings") ─────────────
interface RawBookings { me: string; orders: any[]; requests: { msg: any; conv: any }[] }

async function loadBookings(me: string): Promise<RawBookings> {
  const [ordersRes, convRes] = await Promise.all([
    supabase.from('orders')
      .select('id, type, status, refund_status, renter_id, host_id, renter_name, host_name, listing_title, start_date, duration, duration_type, conversation_id, total_amount, subtotal, seller_fee_amount, currency, paid_at')
      .or(`renter_id.eq.${me},host_id.eq.${me}`)
      .order('paid_at', { ascending: false }).limit(ROW_CAP),
    supabase.from('conversations').select('id, participants')
      .contains('participants', [me]).order('updated_at', { ascending: false }).limit(50),
  ]);
  if (ordersRes.error) throw ordersRes.error;
  const convs = convRes.data || [];
  let requests: RawBookings['requests'] = [];
  if (convs.length) {
    const byId = new Map(convs.map((c: any) => [String(c.id), c]));
    const { data: msgs, error } = await supabase.from('messages')
      .select('id, conversation_id, sender_id, metadata, created_at')
      .in('conversation_id', [...byId.keys()]).eq('type', 'rental_request')
      .order('created_at', { ascending: false }).limit(ROW_CAP);
    if (error) throw error;
    requests = (msgs || [])
      .filter((m: any) => m.metadata?.rentalRequest)
      .map((m: any) => ({ msg: m, conv: byId.get(String(m.conversation_id)) }));
  }
  return { me, orders: ordersRes.data || [], requests };
}

const isHours = (t?: string | null) => /hour/i.test(t || '');
const isRefunded = (o: any) => !!o.refund_status && o.refund_status !== 'none' && /refund/i.test(o.refund_status);

function bookingEvents(raw: RawBookings, names: Names, hireOrderIds: Set<string>): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const claimed = new Set<string>(); // dedupe refs already represented by an order
  const refOf = (conv: unknown, title: unknown, day: Date | null) =>
    `${conv ?? ''}|${String(title ?? '').trim().toLowerCase()}|${day ? day.getTime() : ''}`;

  // 1) Orders -- paid bookings and purchases.
  for (const o of raw.orders) {
    if (o.type !== 'rental' && o.type !== 'service' && o.type !== 'sale') continue; // 'hire' / 'opportunity' orders are shown via their own request/application
    if (hireOrderIds.has(String(o.id))) continue; // hire orders are represented by their hire request
    const paidAt = stampOf(o.paid_at);
    const day = dayOf(o.start_date);
    if (day) claimed.add(refOf(o.conversation_id, o.listing_title, day));
    const iAmHost = o.host_id === raw.me;
    const counterpart = iAmHost
      ? { id: o.renter_id, name: o.renter_name || names.get(o.renter_id) || 'Renter', role: o.type === 'sale' ? 'Buyer' : o.type === 'service' ? 'Client' : 'Renter' }
      : { id: o.host_id,  name: o.host_name   || names.get(o.host_id)   || 'Owner',  role: o.type === 'sale' ? 'Seller' : o.type === 'service' ? 'Provider' : 'Owner' };
    const refunded = isRefunded(o);
    const currency = o.currency || 'CAD';
    const total = money(o.total_amount);
    // Buyer sees what they paid; the seller side sees what they take in.
    const amount: CalendarAmount | undefined = total > 0
      ? (iAmHost
          ? { value: Math.max(0, money(o.subtotal || total) - money(o.seller_fee_amount)), currency, direction: 'in' }
          : { value: total, currency, direction: 'out' })
      : undefined;
    const common = {
      title: o.listing_title || 'Booking', counterpart, iAmProvider: iAmHost,
      conversationId: o.conversation_id || undefined, timezone: viewerTimezone(),
    };
    const n = Math.max(1, Number(o.duration) || 1);

    if (o.type === 'sale') {
      // Transaction record on the purchase date (+ scheduled pickup/delivery when set).
      if (paidAt && inWindow(paidAt)) {
        const st: CalendarStatus = refunded ? 'cancelled' : 'completed';
        out.push({
          ...common, key: `order:${o.id}:sale`, kind: 'sale', nature: 'record', part: iAmHost ? 'sale' : 'purchase',
          partLabel: iAmHost ? 'Sale' : 'Purchase', start: paidAt, end: null, allDay: false,
          status: st, statusLabel: refunded ? 'Refunded' : 'Paid', amount,
          view: { label: iAmHost ? 'View sale' : 'View purchase', to: '/my-orders' },
        });
      }
      if (day && inWindow(day)) {
        const st: CalendarStatus = refunded ? 'cancelled' : lifecycle('confirmed', addDays(day, 1));
        out.push({
          ...common, key: `order:${o.id}:delivery`, kind: 'sale', nature: 'scheduled', part: 'delivery',
          partLabel: 'Pickup / delivery', start: day, end: null, allDay: true,
          status: st, statusLabel: refunded ? 'Cancelled' : STATUS_LABEL[st],
          view: { label: iAmHost ? 'View sale' : 'View purchase', to: '/my-orders' },
        });
      }
      continue;
    }

    if (o.type === 'service' || isHours(o.duration_type)) {
      const isService = o.type === 'service';
      const kind: CalendarKind = isService ? 'service' : 'rental';
      const view = { label: isService ? 'View service' : 'View rental', to: '/my-orders' };
      if (day) {
        if (!inWindow(day)) continue;
        const st: CalendarStatus = refunded ? 'cancelled' : lifecycle('confirmed', addDays(day, 1));
        out.push({
          ...common, key: `order:${o.id}:service`, kind, nature: 'scheduled', part: 'service',
          partLabel: isService ? 'Service date' : 'Booking date', start: day, end: null, allDay: true,
          status: st, statusLabel: refunded ? 'Cancelled' : STATUS_LABEL[st], amount, view,
        });
      } else if (isService && paidAt && inWindow(paidAt)) {
        // No schedule yet: show the purchase date -- as a record, not an appointment.
        out.push({
          ...common, key: `order:${o.id}:purchase`, kind, nature: 'record', part: 'purchase',
          partLabel: 'Service purchased', start: paidAt, end: null, allDay: false,
          status: refunded ? 'cancelled' : 'completed', statusLabel: refunded ? 'Refunded' : 'Paid', amount, view,
        });
      }
      continue;
    }

    // Rental: pickup, rental period and return.
    if (!day) continue;
    const ret = addDays(day, n);
    if (!inWindow(ret)) continue;
    const st: CalendarStatus = refunded ? 'cancelled' : lifecycle('confirmed', addDays(ret, 1));
    const r = {
      ...common, kind: 'rental' as const, nature: 'scheduled' as const, allDay: true, status: st,
      statusLabel: refunded ? 'Cancelled' : STATUS_LABEL[st],
      view: { label: 'View rental', to: '/my-orders' },
    };
    out.push({ ...r, key: `order:${o.id}:pickup`, part: 'pickup', partLabel: 'Pickup', start: day, end: null, amount });
    out.push({ ...r, key: `order:${o.id}:period`, part: 'period', partLabel: 'Rental period', start: day, end: ret });
    out.push({ ...r, key: `order:${o.id}:return`, part: 'return', partLabel: 'Return', start: ret, end: null });
  }

  // 2) Rental / service requests still in the chat (Pending until an order exists).
  for (const { msg, conv } of raw.requests) {
    const rr = msg.metadata.rentalRequest;
    if (!rr || rr.durationType === 'purchase' || rr.listingMode === 'sale') continue;
    const day = dayOf(rr.startDate);
    if (!day || !inWindow(day)) continue;
    if (claimed.has(refOf(msg.conversation_id, rr.listingTitle, day))) continue; // already an order
    const iAmRequester = msg.sender_id === raw.me;
    const otherId = (conv?.participants || []).find((p: string) => p !== raw.me);
    const isService = rr.listingType === 'service';
    const counterpart = {
      id: otherId, name: (otherId && names.get(otherId)) || (iAmRequester ? 'Owner' : 'Renter'),
      role: isService ? (iAmRequester ? 'Provider' : 'Client') : (iAmRequester ? 'Owner' : 'Renter'),
    };
    const declined = rr.status === 'declined';
    const st: CalendarStatus = declined ? 'cancelled' : 'pending';
    const label = declined ? 'Declined' : rr.status === 'accepted' ? 'Pending · awaiting payment' : 'Pending';
    const n = Math.max(1, Number(rr.duration) || 1);
    const base = {
      title: rr.listingTitle || 'Request', counterpart, iAmProvider: !iAmRequester,
      conversationId: String(msg.conversation_id), timezone: viewerTimezone(), allDay: true,
      nature: 'scheduled' as const, status: st, statusLabel: label,
      view: { label: isService ? 'View service' : 'View rental', to: rr.listingId ? `/listing/${rr.listingId}` : `/inbox?conv=${msg.conversation_id}` },
    };
    const k = `req:${msg.id}`;
    if (isService || rr.durationType === 'hours') {
      out.push({ ...base, key: `${k}:service`, kind: isService ? 'service' : 'rental', part: 'service',
        partLabel: isService ? 'Service date' : 'Booking date', start: day, end: null });
      continue;
    }
    const ret = addDays(day, n);
    out.push({ ...base, kind: 'rental', key: `${k}:pickup`, part: 'pickup', partLabel: 'Pickup', start: day, end: null });
    out.push({ ...base, kind: 'rental', key: `${k}:period`, part: 'period', partLabel: 'Rental period', start: day, end: ret });
    out.push({ ...base, kind: 'rental', key: `${k}:return`, part: 'return', partLabel: 'Return', start: ret, end: null });
  }
  return out;
}

// ── Source: service bookings through hire requests ("services") ───────────────
const HIRE_PENDING = new Set(['sent', 'countered', 'accepted', 'payment_pending']);

async function loadHire(me: string) {
  const { data, error } = await supabase.from('hire_requests')
    .select('id, conversation_id, requester_id, host_id, project_title, service_label, work_type, street_address, city, province, start_date, end_date, start_time, status, budget_amount, currency, created_at')
    .or(`requester_id.eq.${me},host_id.eq.${me}`)
    .order('created_at', { ascending: false }).limit(ROW_CAP);
  if (error) throw error;
  const rows = data || [];
  const orderByHire = new Map<string, string>();
  if (rows.length) {
    const { data: tx } = await supabase.from('hire_transactions').select('hire_request_id, order_id').in('hire_request_id', rows.map((r: any) => r.id));
    (tx || []).forEach((t: any) => { if (t.order_id) orderByHire.set(String(t.hire_request_id), String(t.order_id)); });
  }
  return { rows, orderByHire };
}

function hireEvents(me: string, rows: any[], orderByHire: Map<string, string>, ordersById: Map<string, any>, names: Names): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const r of rows) {
    const iAmHost = r.host_id === me;
    const otherId = iAmHost ? r.requester_id : r.host_id;
    const counterpart = { id: otherId, name: names.get(otherId) || (iAmHost ? 'Client' : 'Provider'), role: iAmHost ? 'Client' : 'Provider' };
    const title = r.project_title || r.service_label || 'Service booking';
    const view = { label: 'View service', to: r.conversation_id ? `/inbox?conv=${r.conversation_id}` : '/my-orders' };
    const status: CalendarStatus =
      r.status === 'hired' ? 'confirmed' : r.status === 'completed' ? 'completed'
      : HIRE_PENDING.has(r.status) ? 'pending' : 'cancelled';
    const cancelledLabel = r.status === 'declined' ? 'Declined' : r.status === 'expired' ? 'Expired' : STATUS_LABEL.cancelled;
    const day = dayOf(r.start_date);
    const order = ordersById.get(orderByHire.get(String(r.id)) || '');
    const orderAmount = order && money(order.total_amount) > 0
      ? { value: iAmHost ? Math.max(0, money(order.subtotal || order.total_amount) - money(order.seller_fee_amount)) : money(order.total_amount),
          currency: order.currency || r.currency || 'CAD', direction: (iAmHost ? 'in' : 'out') as 'in' | 'out' }
      : undefined;
    const common = {
      title, counterpart, iAmProvider: iAmHost, view, kind: 'service' as const,
      conversationId: r.conversation_id ? String(r.conversation_id) : undefined, timezone: viewerTimezone(),
      location: r.work_type === 'remote' ? 'Remote' : [r.street_address, r.city, r.province].filter(Boolean).join(', ') || undefined,
      amount: orderAmount,
    };
    if (day) {
      const endDay = dayOf(r.end_date);
      const t = withTime(day, r.start_time);
      const last = endDay ?? day;
      if (!inWindow(last)) continue;
      const st = lifecycle(status, addDays(last, 1));
      const label = st === 'pending'
        ? (r.status === 'payment_pending' || r.status === 'accepted' ? 'Pending · awaiting payment' : 'Pending')
        : st === 'cancelled' ? cancelledLabel : STATUS_LABEL[st];
      out.push({
        ...common, key: `hire:${r.id}:service`, nature: 'scheduled', part: 'service', partLabel: 'Service date',
        start: t.date, end: endDay && +endDay !== +day ? endDay : null, allDay: t.allDay, status: st, statusLabel: label,
      });
    } else if (order) {
      // No scheduled date: use the purchase date, shown as a transaction record.
      const paidAt = stampOf(order.paid_at);
      if (!paidAt || !inWindow(paidAt)) continue;
      out.push({
        ...common, key: `hire:${r.id}:purchase`, nature: 'record', part: 'purchase', partLabel: 'Service purchased',
        start: paidAt, end: null, allDay: false, status: isRefunded(order) ? 'cancelled' : 'completed',
        statusLabel: isRefunded(order) ? 'Refunded' : 'Paid',
      });
    }
  }
  return out;
}

// ── Source: opportunities ─────────────────────────────────────────────────────
async function loadOpportunities(me: string) {
  const [mine, owned, myListings] = await Promise.all([
    supabase.from('opportunity_applications').select('*').eq('applicant_id', me).order('created_at', { ascending: false }).limit(ROW_CAP),
    supabase.from('opportunity_applications').select('*').eq('owner_id', me).order('created_at', { ascending: false }).limit(ROW_CAP),
    supabase.from('listings').select('id').eq('user_id', me).limit(ROW_CAP),
  ]);
  if (mine.error) throw mine.error;
  const listingIds = (myListings.data || []).map((l: any) => String(l.id));
  const viaListings = listingIds.length
    ? (await supabase.from('opportunity_applications').select('*').in('listing_id', listingIds).order('created_at', { ascending: false }).limit(ROW_CAP)).data || []
    : [];
  const byId = new Map<string, any>();
  [...(mine.data || []), ...(owned.data || []), ...viaListings].forEach(a => byId.set(String(a.id), a));
  const apps = [...byId.values()];
  const lids = [...new Set(apps.map(a => String(a.listing_id)))];
  const listings = lids.length
    ? (await supabase.from('listings').select('id, title, user_id, metadata, city, province').in('id', lids)).data || []
    : [];
  return { apps, listings: new Map(listings.map((l: any) => [String(l.id), l])) };
}

function opportunityEvents(me: string, apps: any[], listings: Map<string, any>, names: Names): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const a of apps) {
    const listing = listings.get(String(a.listing_id));
    if (!listing) continue;
    const opp = listing.metadata?.opportunity;
    let base: CalendarStatus;
    let label: string;
    switch (a.status) {
      case 'accepted': case 'offer_accepted': case 'payment_pending': case 'hired':
        base = 'confirmed'; label = 'Accepted'; break;
      case 'completed': base = 'completed'; label = 'Completed'; break;
      case 'rejected': base = 'cancelled'; label = 'Declined'; break;
      case 'withdrawn': base = 'cancelled'; label = 'Withdrawn'; break;
      case 'selected': case 'offer_sent': base = 'pending'; label = 'Offer pending'; break;
      default: base = 'pending'; label = 'Application pending';
    }
    const iAmApplicant = a.applicant_id === me;
    const ownerId = a.owner_id || listing.user_id;
    const otherId = iAmApplicant ? ownerId : a.applicant_id;
    const common = {
      kind: 'opportunity' as const, title: listing.title || 'Opportunity', iAmProvider: !iAmApplicant,
      timezone: viewerTimezone(), conversationId: a.conversation_id || undefined,
      counterpart: {
        id: otherId, name: names.get(otherId) || (iAmApplicant ? 'Poster' : 'Applicant'),
        role: iAmApplicant ? 'Opportunity poster' : 'Applicant',
      },
      view: { label: 'View opportunity', to: `/listing/${a.listing_id}` },
      manage: iAmApplicant
        ? { label: 'View my application', to: a.conversation_id ? `/inbox?conv=${a.conversation_id}` : '/dashboard?tab=applications' }
        : { label: 'Manage applicants', to: `/listing/${a.listing_id}/applicants` },
    };

    // Work date (scheduled). The agreed start date set on acceptance wins over the posted one.
    const startStr = a.accepted_details?.startDate || opp?.startDate;
    const day = opp && opp.timingType !== 'flexible' ? dayOf(startStr) : null;
    let workLast: Date | null = null;
    if (day) {
      const endDay = dayOf(opp.endDate);
      const t = withTime(day, opp.startTime);
      workLast = endDay && endDay >= day ? endDay : day;
      if (inWindow(workLast)) {
        const st = lifecycle(base, addDays(workLast, 1));
        out.push({
          ...common, key: `opp:${a.id}:work`, nature: 'scheduled', part: 'work', partLabel: 'Work date',
          start: t.date, end: endDay && +endDay > +day ? endDay : null, allDay: t.allDay,
          status: st, statusLabel: st === base ? label : STATUS_LABEL[st],
          location: opp.workArrangement === 'remote' ? 'Remote' : [listing.city, listing.province].filter(Boolean).join(', ') || undefined,
        });
      }
    }
    // Application date (record) with the acceptance status.
    const applied = stampOf(a.created_at);
    if (applied && inWindow(applied)) {
      out.push({
        ...common, key: `opp:${a.id}:applied`, nature: 'record', part: 'applied',
        partLabel: iAmApplicant ? 'Application' : 'Application received', start: applied, end: null, allDay: false,
        status: base, statusLabel: label,
      });
    }
  }
  return out;
}

// ── Source: courses (enrollments + live sessions) ─────────────────────────────
async function loadCourses(me: string) {
  const [enr, txs, mineLive, taught] = await Promise.all([
    supabase.from('course_enrollments').select('id, course_id, status, enrolled_at, payment_id')
      .eq('user_id', me).order('enrolled_at', { ascending: false }).limit(ROW_CAP),
    supabase.from('course_transactions').select('id, course_id, gross_amount, currency, status')
      .eq('buyer_id', me).limit(ROW_CAP),
    supabase.from('live_session_applications').select('*').eq('student_id', me)
      .not('scheduled_at', 'is', null).order('scheduled_at', { ascending: false }).limit(ROW_CAP),
    supabase.from('live_sessions').select('id').eq('instructor_id', me).limit(ROW_CAP),
  ]);
  if (enr.error) throw enr.error;
  if (mineLive.error) throw mineLive.error;
  const sids = (taught.data || []).map((s: any) => s.id);
  const taughtApps = sids.length
    ? (await supabase.from('live_session_applications').select('*').in('session_id', sids)
        .not('scheduled_at', 'is', null).order('scheduled_at', { ascending: false }).limit(ROW_CAP)).data || []
    : [];
  const byId = new Map<string, any>();
  [...(mineLive.data || []), ...taughtApps].forEach(a => byId.set(String(a.id), a));
  const liveApps = [...byId.values()];
  const sessionIds = [...new Set(liveApps.map(a => a.session_id))];
  const courseIds = [...new Set((enr.data || []).map((e: any) => e.course_id))];
  const [sess, courses] = await Promise.all([
    sessionIds.length ? supabase.from('live_sessions').select('id, title, instructor_id, timezone, duration_minutes, platform').in('id', sessionIds) : Promise.resolve({ data: [] as any[] }),
    courseIds.length ? supabase.from('courses').select('id, title').in('id', courseIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  return {
    enrollments: enr.data || [],
    txById: new Map((txs.data || []).map((t: any) => [String(t.id), t])),
    txByCourse: new Map((txs.data || []).filter((t: any) => t.status === 'paid').map((t: any) => [String(t.course_id), t])),
    liveApps,
    sessions: new Map((sess.data || []).map((s: any) => [String(s.id), s])),
    courses: new Map((courses.data || []).map((c: any) => [String(c.id), c])),
  };
}

type CoursesRaw = Awaited<ReturnType<typeof loadCourses>>;

function courseEvents(me: string, raw: CoursesRaw, names: Names): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const e of raw.enrollments) {
    const at = stampOf(e.enrolled_at);
    if (!at || !inWindow(at)) continue;
    const course = raw.courses.get(String(e.course_id));
    const tx = raw.txById.get(String(e.payment_id)) || raw.txByCourse.get(String(e.course_id));
    const refunded = e.status === 'refunded';
    out.push({
      key: `course:${e.id}:enrolled`, kind: 'course', nature: 'record', part: 'enrolled', partLabel: 'Enrollment',
      title: course?.title || 'Course', start: at, end: null, allDay: false, timezone: viewerTimezone(),
      status: refunded ? 'cancelled' : 'completed', statusLabel: refunded ? 'Refunded' : 'Enrolled',
      amount: tx && money(tx.gross_amount) > 0 ? { value: money(tx.gross_amount), currency: tx.currency || 'CAD', direction: 'out' } : undefined,
      view: { label: 'View course', learningPath: `/course/${e.course_id}` },
    });
  }
  for (const a of raw.liveApps) {
    const s = raw.sessions.get(String(a.session_id));
    if (!s || !a.scheduled_at) continue;
    const start = new Date(a.scheduled_at);
    if (isNaN(+start)) continue;
    const end = new Date(+start + (s.duration_minutes || 60) * 60_000);
    if (!inWindow(end)) continue;
    let base: CalendarStatus;
    let label: string;
    switch (a.status) {
      case 'confirmed': base = 'confirmed'; label = 'Confirmed'; break;
      case 'accepted': case 'awaiting_payment': base = 'pending'; label = 'Pending · awaiting payment'; break;
      case 'declined': base = 'cancelled'; label = 'Declined'; break;
      case 'cancelled': base = 'cancelled'; label = 'Cancelled'; break;
      case 'completed': base = 'completed'; label = 'Completed'; break;
      default: continue; // 'applied' has no date yet -> stays in management
    }
    const iAmStudent = a.student_id === me;
    const otherId = iAmStudent ? s.instructor_id : a.student_id;
    const st = lifecycle(base, end);
    out.push({
      key: `live:${a.id}:session`, kind: 'course', nature: 'scheduled', part: 'session', partLabel: 'Live session',
      title: s.title || 'Live session', start, end: null, allDay: false, iAmProvider: !iAmStudent,
      timezone: s.timezone || viewerTimezone(), status: st, statusLabel: st === base ? label : STATUS_LABEL[st],
      location: s.platform ? (s.platform === 'teams' ? 'Microsoft Teams' : 'Zoom') : undefined,
      meetingLink: st === 'confirmed' ? a.meeting_link || undefined : undefined,
      amount: a.fee && money(a.fee) > 0 ? { value: money(a.fee), currency: a.currency || 'CAD', direction: iAmStudent ? 'out' : 'in' } : undefined,
      counterpart: { id: otherId, name: names.get(otherId) || (iAmStudent ? 'Instructor' : 'Learner'), role: iAmStudent ? 'Instructor' : 'Learner' },
      view: { label: 'View session', learningPath: iAmStudent ? `/live/${a.session_id}` : `/instructor/live/${a.session_id}` },
    });
  }
  return out;
}

// ── Source: wallet (PRIVATE -- own wallet and own payout requests only) ───────
const CASH_IN_TYPES = new Set(['rental_earning', 'service_earning', 'sale_earning', 'opportunity_earning', 'hire_earning', 'adjustment']);

async function loadWallet(me: string) {
  const [wallets, payouts] = await Promise.all([
    supabase.from('wallets').select('id').eq('owner_type', 'host').eq('owner_id', me),
    supabase.from('payout_requests').select('id, amount, currency, status, requested_at').eq('host_id', me)
      .order('requested_at', { ascending: false }).limit(ROW_CAP),
  ]);
  if (wallets.error) throw wallets.error;
  const ids = (wallets.data || []).map((w: any) => w.id);
  const txs = ids.length
    ? (await supabase.from('wallet_transactions').select('id, transaction_type, amount, currency, balance_type, status, description, created_at')
        .in('wallet_id', ids).gt('amount', 0).order('created_at', { ascending: false }).limit(ROW_CAP)).data || []
    : [];
  return { txs, payouts: payouts.data || [] };
}

function walletEvents(raw: Awaited<ReturnType<typeof loadWallet>>): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const base = { kind: 'wallet' as const, nature: 'record' as const, allDay: false, timezone: viewerTimezone(), view: { label: 'View transaction', to: '/wallet' } };
  for (const t of raw.txs) {
    if (!CASH_IN_TYPES.has(t.transaction_type)) continue;
    const at = stampOf(t.created_at);
    if (!at || !inWindow(at)) continue;
    const st: CalendarStatus =
      t.status === 'reversed' ? 'cancelled' : t.status === 'paid_out' ? 'completed'
      : t.status === 'available' || t.balance_type === 'available' ? 'confirmed' : 'pending';
    out.push({
      ...base, key: `wallet:in:${t.id}`, part: 'cash_in', partLabel: 'Cash in',
      title: t.description || 'Funds added to wallet', start: at, end: null,
      status: st, statusLabel: t.status === 'reversed' ? 'Reversed' : t.status === 'paid_out' ? 'Paid out' : st === 'confirmed' ? 'Available' : 'Pending',
      amount: { value: money(t.amount), currency: t.currency || 'CAD', direction: 'in' },
    });
  }
  for (const p of raw.payouts) {
    const at = stampOf(p.requested_at);
    if (!at || !inWindow(at)) continue;
    const st: CalendarStatus = p.status === 'paid' ? 'completed' : p.status === 'rejected' ? 'cancelled' : 'pending';
    out.push({
      ...base, key: `wallet:out:${p.id}`, part: 'cash_out', partLabel: 'Cash out',
      title: 'Withdrawal requested', start: at, end: null, status: st,
      statusLabel: p.status === 'paid' ? 'Completed' : p.status === 'rejected' ? 'Failed' : p.status === 'processing' ? 'Processing' : 'Requested',
      amount: { value: money(p.amount), currency: p.currency || 'CAD', direction: 'out' },
    });
  }
  return out;
}

// ── Public: load everything ───────────────────────────────────────────────────
export async function loadCalendarEvents(me: string): Promise<CalendarLoadResult> {
  const FAIL = Symbol('fail');
  const guard = <T,>(p: Promise<T>) => withTimeout<T | typeof FAIL>(p, SOURCE_DEADLINE_MS, FAIL);

  // All sources load in parallel; each has its own deadline.
  const [bookings, hire, opp, courses, wallet] = await Promise.all([
    guard(loadBookings(me)), guard(loadHire(me)), guard(loadOpportunities(me)),
    guard(loadCourses(me)), guard(loadWallet(me)),
  ]);
  const failed: CalendarSource[] = [];
  if (bookings === FAIL) failed.push('bookings');
  if (hire === FAIL) failed.push('services');
  if (opp === FAIL) failed.push('opportunities');
  if (courses === FAIL) failed.push('courses');
  if (wallet === FAIL) failed.push('wallet');

  // One profile lookup for every counterpart across sources.
  const ids: string[] = [];
  if (bookings !== FAIL) {
    bookings.orders.forEach(o => ids.push(o.renter_id, o.host_id));
    bookings.requests.forEach(r => ids.push(...(r.conv?.participants || [])));
  }
  if (hire !== FAIL) hire.rows.forEach((r: any) => ids.push(r.requester_id, r.host_id));
  if (opp !== FAIL) {
    opp.apps.forEach(a => ids.push(a.applicant_id, a.owner_id));
    opp.listings.forEach(l => ids.push(l.user_id));
  }
  if (courses !== FAIL) {
    courses.liveApps.forEach(a => ids.push(a.student_id));
    courses.sessions.forEach(s => ids.push(s.instructor_id));
  }
  const names = await withTimeout(fetchProfileNames(ids.filter(id => id && id !== me)), 2500, new Map<string, string>());

  const events: CalendarEvent[] = [];
  const ordersById = new Map<string, any>(bookings !== FAIL ? bookings.orders.map(o => [String(o.id), o]) : []);
  if (bookings !== FAIL) events.push(...bookingEvents(bookings, names, hire !== FAIL ? new Set(hire.orderByHire.values()) : new Set()));
  if (hire !== FAIL) events.push(...hireEvents(me, hire.rows, hire.orderByHire, ordersById, names));
  if (opp !== FAIL) events.push(...opportunityEvents(me, opp.apps, opp.listings, names));
  if (courses !== FAIL) events.push(...courseEvents(me, courses, names));
  if (wallet !== FAIL) events.push(...walletEvents(wallet));

  // Defensive dedupe on the stable key (a record reached via two queries).
  const uniq = new Map<string, CalendarEvent>();
  events.forEach(e => uniq.set(e.key, e));
  return { events: [...uniq.values()].sort((a, b) => +a.start - +b.start), failed };
}

// ── Cache (stale-while-revalidate) ────────────────────────────────────────────
const cacheKey = (uid: string) => `filmons:calendar:v2:${uid}`;
export function readCachedEvents(uid: string): CalendarEvent[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    if (!raw) return null;
    return (JSON.parse(raw) as any[]).map(e => ({ ...e, start: new Date(e.start), end: e.end ? new Date(e.end) : null }));
  } catch { return null; }
}
export function writeCachedEvents(uid: string, events: CalendarEvent[]) {
  try { localStorage.setItem(cacheKey(uid), JSON.stringify(events)); } catch { /* ignore */ }
}

// ── Selectors ─────────────────────────────────────────────────────────────────
export const isActive = (e: CalendarEvent) => e.status === 'pending' || e.status === 'confirmed';
export const isScheduled = (e: CalendarEvent) => e.nature === 'scheduled';

export function matchesFilter(e: CalendarEvent, f: CalendarFilter): boolean {
  return f === 'all' || e.kind === f;
}

/** Next activities for the dashboard preview: SCHEDULED, upcoming, not
 *  cancelled/declined, without the multi-day "period" band (pickup + return
 *  already say it). Transaction records are never appointments, so they never
 *  appear here. */
export function upcomingPreview(events: CalendarEvent[], limit = 3): CalendarEvent[] {
  const today = startOfDay(new Date()).getTime();
  return events
    .filter(e => isScheduled(e) && isActive(e) && e.part !== 'period' && startOfDay(e.end ?? e.start).getTime() >= today)
    .sort((a, b) => +a.start - +b.start)
    .slice(0, limit);
}

export function formatAmount(a: CalendarAmount): string {
  const sign = a.direction === 'in' ? '+' : '−';
  try {
    return `${sign}${new Intl.NumberFormat(undefined, { style: 'currency', currency: a.currency }).format(a.value)}`;
  } catch { return `${sign}${a.value.toFixed(2)} ${a.currency}`; }
}

// ── Reminders (scheduled + confirmed activities only) ─────────────────────────
export type ReminderOffset = '24h' | '1h' | 'day';
export interface ReminderRow { event_key: string; remind_before: ReminderOffset; enabled: boolean; sent_at: string | null; remind_at: string }

/** Reminders only make sense for confirmed, upcoming, scheduled entries. */
export function canRemind(e: CalendarEvent): boolean {
  return e.nature === 'scheduled' && e.status === 'confirmed' && e.part !== 'period' && e.start.getTime() > Date.now();
}
/** Offsets offered for an entry (1h needs a time of day). */
export function offsetsFor(e: CalendarEvent): ReminderOffset[] {
  if (e.part === 'return') return ['day'];
  return e.allDay ? ['24h'] : ['24h', '1h'];
}
/** What gets switched on automatically when the user's calendar reminders setting is on. */
export function defaultOffset(e: CalendarEvent): ReminderOffset {
  if (e.part === 'return') return 'day';
  if (e.part === 'service' || e.part === 'session') return e.allDay ? '24h' : '1h';
  return '24h';
}
export const OFFSET_LABEL: Record<ReminderOffset, string> = { '24h': '24 hours before', '1h': '1 hour before', day: 'Morning of the day' };

/** When the reminder fires. All-day entries have no clock time: "24 hours
 *  before" goes out at 9:00 the day before, "morning of" at 8:00. */
export function remindAt(e: CalendarEvent, offset: ReminderOffset): Date {
  const d = e.start;
  if (offset === 'day') return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 0);
  if (offset === '1h') return new Date(+d - 3600_000);
  if (e.allDay) return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 9, 0);
  return new Date(+d - 24 * 3600_000);
}

const fmtTime = (e: CalendarEvent) =>
  e.allDay ? '' : e.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: e.timezone });

/** Notification copy for a reminder, adapted for owners / providers / posters. */
export function reminderCopy(e: CalendarEvent, offset: ReminderOffset): { title: string; message: string } {
  const who = e.counterpart?.name || 'Someone';
  const time = fmtTime(e);
  const at = time ? ` at ${time}` : '';
  const prov = !!e.iAmProvider;
  switch (e.part) {
    case 'pickup':
      return offset === '1h'
        ? { title: 'Rental pickup soon', message: prov ? `${who} picks up ${e.title} in one hour.` : `Pick up ${e.title} in one hour${e.location ? ` in ${e.location}` : ''}.` }
        : { title: 'Rental pickup tomorrow', message: prov ? `${who} picks up ${e.title} tomorrow${at}.` : `Pick up ${e.title} tomorrow${at}${e.location ? ` in ${e.location}` : ''}.` };
    case 'return':
      return { title: 'Rental return due today', message: prov ? `${who} returns ${e.title} today${time ? ` by ${time}` : ''}.` : `Return ${e.title} today${time ? ` by ${time}` : ''}.` };
    case 'service':
      return offset === '24h'
        ? { title: 'Your service is tomorrow', message: prov ? `${e.title} with ${who} is tomorrow${at}.` : `${e.title} with ${who} is tomorrow${at}.` }
        : { title: 'Your service starts soon', message: `${e.title} with ${who} starts in one hour.` };
    case 'work':
      return { title: 'Your opportunity starts tomorrow', message: `${e.title} starts tomorrow${at}. Check the details before you begin.` };
    case 'delivery':
      return { title: 'Your order date is tomorrow', message: `${e.title} is scheduled for pickup / delivery tomorrow${at}.` };
    case 'session':
      return offset === '24h'
        ? { title: 'Your live session is tomorrow', message: `${e.title} is tomorrow${at}.` }
        : { title: 'Your live session starts soon', message: `${e.title} starts in one hour. Tap to view the meeting link.` };
    default:
      return { title: 'Calendar reminder', message: `${e.title} is coming up.` };
  }
}

export async function getReminders(uid: string): Promise<ReminderRow[]> {
  const { data } = await supabase.from('calendar_reminders').select('event_key, remind_before, enabled, sent_at, remind_at').eq('user_id', uid);
  return (data || []) as ReminderRow[];
}

function reminderRow(uid: string, e: CalendarEvent, offset: ReminderOffset, enabled: boolean) {
  const copy = reminderCopy(e, offset);
  return {
    user_id: uid, event_key: e.key, remind_before: offset, enabled,
    remind_at: remindAt(e, offset).toISOString(), start_at: e.start.toISOString(),
    title: copy.title, message: copy.message, link: `/calendar?event=${encodeURIComponent(e.key)}`, sent_at: null,
  };
}

/** The user's explicit choice -- switching off keeps a disabled row so automatic
 *  reminders never switch it back on. */
export async function setReminder(uid: string, e: CalendarEvent, offset: ReminderOffset, on: boolean): Promise<boolean> {
  const { error } = await supabase.from('calendar_reminders')
    .upsert(reminderRow(uid, e, offset, on), { onConflict: 'user_id,event_key,remind_before' });
  return !error;
}

/** Keeps stored reminders in step with their source and (when the user's
 *  "Calendar reminders" notification setting is on) registers the default
 *  reminder for newly confirmed scheduled entries. Existing rows are updated in
 *  place, never duplicated; rows the user switched off stay off. */
export async function syncReminders(uid: string, events: CalendarEvent[], existing: ReminderRow[], autoOn: boolean) {
  const byKey = new Map(events.map(e => [e.key, e]));
  const have = new Set(existing.map(r => `${r.event_key}|${r.remind_before}`));
  const rows: Record<string, unknown>[] = [];
  for (const r of existing) {
    const e = byKey.get(r.event_key);
    if (!e) continue; // source not loaded this time -> leave it alone
    if (!canRemind(e)) {
      // Cancelled / completed / no longer confirmed: drop the reminder.
      await supabase.from('calendar_reminders').delete()
        .eq('user_id', uid).eq('event_key', r.event_key).eq('remind_before', r.remind_before);
      continue;
    }
    // Rescheduled? Refresh the time + copy and re-arm -- only when the time
    // actually moved, so an already-sent reminder is never re-armed.
    if (+new Date(r.remind_at) !== +remindAt(e, r.remind_before)) rows.push(reminderRow(uid, e, r.remind_before, r.enabled));
  }
  if (autoOn) {
    for (const e of events) {
      if (!canRemind(e)) continue;
      const off = defaultOffset(e);
      if (have.has(`${e.key}|${off}`)) continue;
      if (remindAt(e, off).getTime() <= Date.now()) continue;
      rows.push(reminderRow(uid, e, off, true));
    }
  }
  if (rows.length) await supabase.from('calendar_reminders').upsert(rows, { onConflict: 'user_id,event_key,remind_before' });
}
