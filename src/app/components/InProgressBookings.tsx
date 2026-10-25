import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Loader2, MessageCircle, FileText, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { withTimeout } from '../lib/withTimeout';

type Status = 'upcoming' | 'in_progress' | 'overdue' | 'awaiting' | 'disputed';

interface Booking {
  id: string;
  type: string;
  listingId: string | null;
  title: string;
  image: string | null;
  hostId: string; renterId: string;
  hostName: string; renterName: string;
  conversationId: string | null;
  start: Date | null;
  deadline: Date | null;
  paid: boolean;
  dispute: boolean;
  returnedAt: string | null;
  workSubmittedAt: string | null;
  depositHeld: number;
  status: Status;
}

const BADGE: Record<Status, { label: string; cls: string }> = {
  upcoming:    { label: 'Upcoming',               cls: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In progress',            cls: 'bg-green-100 text-green-700' },
  overdue:     { label: 'Overdue',                cls: 'bg-red-100 text-red-700' },
  awaiting:    { label: 'Awaiting confirmation',  cls: 'bg-amber-100 text-amber-800' },
  disputed:    { label: 'Disputed',               cls: 'bg-red-100 text-red-700' },
};

/** The UTC instant at which wall-clock `ymd` + `hm` happens in time zone `tz` (falls back to the device zone). */
function zonedInstant(ymd: string, hm: string, tz?: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = hm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  if (!tz) return new Date(y, m - 1, d, hh, mm);
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(guess)).reduce<Record<string, number>>((a, p) => { if (p.type !== 'literal') a[p.type] = Number(p.value); return a; }, {});
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    return new Date(guess - (asUtc - guess));
  } catch { return new Date(y, m - 1, d, hh, mm); }
}

function deriveDeadline(o: any, terms: any): Date | null {
  if (!o.start_date) return null;
  const start = new Date(o.start_date);
  if (isNaN(+start)) return null;
  const n = Number(o.duration) || 1;
  const hourly = o.duration_type === 'hour';
  const end = new Date(+start + n * (hourly ? 3600000 : 86400000));
  if (!hourly && terms?.returnTime) {
    const ymd = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    return zonedInstant(ymd, terms.returnTime, terms.returnTimezone);
  }
  return end;
}

function fmt(d: Date | null) {
  return d ? d.toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
}

export function InProgressBookings({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<Booking[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const { data, error } = await withTimeout(
        supabase.from('orders').select('*')
          .or(`host_id.eq.${userId},renter_id.eq.${userId}`).is('completed_at', null)
          .neq('refund_status', 'refunded').order('paid_at', { ascending: false }).limit(20) as any,
        4000, { data: null, error: new Error('timeout') } as any,
      );
      if (error) throw error;
      const rows: any[] = data || [];
      const ids = [...new Set(rows.map(r => r.listing_id).filter(Boolean))];
      const images: Record<string, string> = {};
      if (ids.length) {
        const { data: ls } = await withTimeout(supabase.from('listings').select('id, image').in('id', ids) as any, 3000, { data: [] } as any);
        (ls || []).forEach((l: any) => { if (l.image) images[l.id] = l.image; });
      }
      const now = Date.now();
      setItems(rows.map((r): Booking => {
        const terms = r.listing_terms_snapshot || {};
        const start = r.start_date ? new Date(r.start_date) : null;
        const deadline = deriveDeadline(r, terms);
        const isService = r.type === 'service';
        const grace = (Number(terms.lateFeeGraceHours) || 0) * 3600000;
        let status: Status = 'in_progress';
        if (r.dispute_status === 'disputed') status = 'disputed';
        else if (isService ? r.work_submitted_at : r.returned_at) status = 'awaiting';
        else if (!isService && deadline && now > +deadline + grace) status = 'overdue';
        else if (start && now < +start) status = 'upcoming';
        return {
          id: r.id, type: r.type, listingId: r.listing_id || null, title: r.listing_title || 'Booking',
          image: r.listing_id ? images[r.listing_id] || null : null,
          hostId: r.host_id, renterId: r.renter_id, hostName: r.host_name || 'Host', renterName: r.renter_name || 'Customer',
          conversationId: r.conversation_id || null, start, deadline,
          paid: true, dispute: r.dispute_status === 'disputed',
          returnedAt: r.returned_at || null, workSubmittedAt: r.work_submitted_at || null,
          depositHeld: r.deposit_status === 'held' ? Number(r.deposit_amount) || 0 : 0, status,
        };
      }));
    } catch {
      setFailed(true);
      setItems(prev => prev ?? []);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const call = async (fn: 'complete-order' | 'booking-action', body: Record<string, unknown>, okMsg: string, b: Booking) => {
    setBusy(b.id);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body: { orderId: b.id, ...body } });
      let msg = data?.error;
      if (!msg && error && (error as any).context?.json) { try { msg = (await (error as any).context.json())?.error; } catch { /* keep generic */ } }
      if (error || data?.error) toast.error(msg || 'Something went wrong. Try again.');
      else { toast.success(okMsg); await load(); }
    } finally { setBusy(null); }
  };

  if (items === null) {
    return (
      <div className="px-4 sm:px-5 pt-4" aria-busy="true">
        <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-3" />
        <div className="h-28 bg-white rounded-2xl animate-pulse" />
      </div>
    );
  }
  if (!items.length && !failed) return null;

  return (
    <section className="px-4 sm:px-5 pt-4" aria-label="In progress">
      <h2 className="text-sm font-black text-gray-900 mb-2">In progress</h2>
      {failed && (
        <div className="bg-white rounded-2xl border border-red-100 p-3 text-xs text-red-600 flex items-center justify-between">
          Couldn’t load your bookings.
          <button onClick={load} className="font-bold underline">Retry</button>
        </div>
      )}
      <div className="space-y-3">
        {items.map(b => {
          const isService = b.type === 'service';
          const isHost = b.hostId === userId;
          const badge = BADGE[b.status];
          const working = busy === b.id;
          return (
            <div key={b.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
              <div className="flex gap-3">
                <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                  {b.image ? <img src={b.image} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><CalendarDays className="w-6 h-6" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-gray-900 truncate">{b.title}</p>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{isService ? 'Provider' : 'Host'}: {b.hostName} · Customer: {b.renterName}</p>
                  <p className="text-xs text-gray-500">{fmt(b.start)}{!isService && b.deadline ? ` → return by ${fmt(b.deadline)}` : ''}</p>
                  <p className="text-[11px] text-gray-400">Paid ✓{b.depositHeld > 0 ? ` · $${b.depositHeld.toFixed(2)} deposit held` : ''}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                {/* Completion — rentals: host; services: customer once the provider has submitted */}
                {!isService && isHost && !b.dispute && (
                  <button disabled={working}
                    onClick={() => {
                      const condition = window.prompt('Record the equipment’s condition on return (e.g. “Good, no damage”):', 'Good condition');
                      if (condition === null) return;
                      call('complete-order', { condition }, b.depositHeld ? 'Rental finished — deposit returned' : 'Rental finished', b);
                    }}
                    className="px-3 py-2 rounded-xl bg-green-600 text-white text-xs font-bold disabled:opacity-50">
                    {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Rental finished'}
                  </button>
                )}
                {!isService && !isHost && !b.returnedAt && !b.dispute && b.status !== 'upcoming' && (
                  <button disabled={working}
                    onClick={() => {
                      const note = window.prompt('Add a note about the return (optional):', '');
                      if (note === null) return;
                      call('booking-action', { action: 'returned', note }, 'Return recorded — the host has been notified', b);
                    }}
                    className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:opacity-50">
                    {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'I returned it'}
                  </button>
                )}
                {isService && isHost && !b.workSubmittedAt && !b.dispute && b.status !== 'upcoming' && (
                  <button disabled={working} onClick={() => call('booking-action', { action: 'work_submitted' }, 'Work submitted — the customer will confirm', b)}
                    className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:opacity-50">
                    {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Work submitted'}
                  </button>
                )}
                {isService && !isHost && b.workSubmittedAt && !b.dispute && (
                  <>
                    <button disabled={working} onClick={() => call('complete-order', {}, b.depositHeld ? 'Service finished — deposit returned' : 'Service finished', b)}
                      className="px-3 py-2 rounded-xl bg-green-600 text-white text-xs font-bold disabled:opacity-50">
                      {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Service finished'}
                    </button>
                    <button onClick={() => navigate('/my-orders')} className="px-3 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-bold">Report a problem</button>
                  </>
                )}
                {!isService && isHost && b.returnedAt && (
                  <p className="w-full text-[11px] text-amber-700">Renter marked it returned {fmt(new Date(b.returnedAt))}.</p>
                )}

                <button onClick={() => navigate('/my-orders')} className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" /> Details
                </button>
                <button onClick={() => navigate(b.conversationId ? `/inbox?conv=${b.conversationId}&with=${isHost ? b.renterId : b.hostId}` : `/inbox?userId=${isHost ? b.renterId : b.hostId}`)}
                  className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold flex items-center gap-1">
                  <MessageCircle className="w-3.5 h-3.5" /> Message
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
