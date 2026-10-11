// FILMONS Calendar -- rentals, services, sales, opportunities, courses and
// wallet activity on one timeline (see lib/calendarApi.ts for how entries are
// derived and kept in sync). Month | Week | Agenda views (Agenda default on
// mobile, Month on desktop), type filters, Today / prev / next, and an activity
// detail sheet (bottom sheet on mobile, side panel on desktop).
//
// Loading rule: cached entries paint instantly (stale-while-revalidate), else a
// skeleton shaped like the agenda; each source has its own deadline and any
// source that fails is named with a Retry -- never silently shown as "nothing".
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, RotateCcw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import {
  FILTERS, FILTER_LABEL, addDays, coversDay, getReminders, loadCalendarEvents, matchesFilter, readCachedEvents,
  sameDay, setReminder, startOfDay, syncReminders, writeCachedEvents,
  type CalendarEvent, type CalendarFilter, type CalendarSource, type ReminderOffset, type ReminderRow,
} from '../lib/calendarApi';
import { notificationSettingsApi } from '../lib/settingsApi';
import { CalendarDetail } from '../components/calendar/CalendarDetail';
import { EntryRow, KIND_STYLE, entryChipClass, fmtDay } from '../components/calendar/calendarUi';

type View = 'month' | 'week' | 'agenda';
const VIEWS: { id: View; label: string }[] = [{ id: 'month', label: 'Month' }, { id: 'week', label: 'Week' }, { id: 'agenda', label: 'Agenda' }];
const AGENDA_DAYS = 30;
const SOURCE_LABEL: Record<CalendarSource, string> = {
  bookings: 'rentals & purchases', services: 'services', opportunities: 'opportunities', courses: 'courses & live sessions', wallet: 'wallet',
};

const startOfWeek = (d: Date) => addDays(startOfDay(d), -startOfDay(d).getDay());
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

function rangeFor(view: View, cursor: Date): { start: Date; end: Date; label: string } {
  if (view === 'month') {
    const start = startOfMonth(cursor);
    return { start, end: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
  }
  if (view === 'week') {
    const start = startOfWeek(cursor); const end = addDays(start, 6);
    return { start, end, label: `${fmtDay(start, { month: 'short', day: 'numeric' })} – ${fmtDay(end, { month: 'short', day: 'numeric', year: 'numeric' })}` };
  }
  const start = startOfDay(cursor); const end = addDays(start, AGENDA_DAYS - 1);
  return { start, end, label: `${fmtDay(start, { month: 'short', day: 'numeric' })} – ${fmtDay(end, { month: 'short', day: 'numeric', year: 'numeric' })}` };
}
function shift(view: View, cursor: Date, dir: 1 | -1): Date {
  if (view === 'month') return new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
  return addDays(cursor, (view === 'week' ? 7 : AGENDA_DAYS) * dir);
}

function AgendaSkeleton() {
  return (
    <div className="space-y-3 animate-pulse" aria-hidden>
      {[0, 1, 2, 3].map(i => (
        <div key={i}>
          <div className="h-3 w-28 bg-gray-200 rounded mb-2" />
          <div className="h-[68px] rounded-2xl bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

export function Calendar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [events, setEvents] = useState<CalendarEvent[] | null>(() => (user ? readCachedEvents(user.id) : null));
  const [failedSources, setFailedSources] = useState<CalendarSource[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);

  const [view, setView] = useState<View>(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches ? 'month' : 'agenda');
  const [filter, setFilter] = useState<CalendarFilter>('all');
  const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date>(() => startOfDay(new Date()));
  const [showCancelled, setShowCancelled] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(params.get('event'));

  useEffect(() => { if (!user) navigate('/login'); }, [user, navigate]);

  // Load (parallel sources, each with its own deadline) + keep reminders in sync.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    setLoadError(false);
    (async () => {
      try {
        const [res, rem, settings] = await Promise.all([
          loadCalendarEvents(user.id),
          getReminders(user.id).catch(() => [] as ReminderRow[]),
          notificationSettingsApi.load(user.id).catch(() => ({} as Record<string, any>)),
        ]);
        if (!alive) return;
        setFailedSources(res.failed);
        if (res.failed.length >= 5) { if (!events) setLoadError(true); return; }
        setEvents(res.events);
        writeCachedEvents(user.id, res.events);
        setReminders(rem);
        // Updates reminders whose date moved / status changed; registers the default
        // reminder for confirmed activities when "Calendar reminders" is on.
        syncReminders(user.id, res.events, rem, (settings as any).notif_calendar_reminders !== false)
          .then(() => getReminders(user.id)).then(r => { if (alive) setReminders(r); }).catch(() => {});
      } catch {
        if (alive && !events) setLoadError(true);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, attempt]);

  // Deep link: /calendar?event=<key> (notifications, dashboard preview) opens that entry.
  const openEvent = useMemo(() => (events && openKey ? events.find(e => e.key === openKey) ?? null : null), [events, openKey]);
  useEffect(() => {
    if (!openEvent) return;
    setCursor(startOfDay(openEvent.start));
    setSelectedDay(startOfDay(openEvent.start));
    if (openEvent.status === 'cancelled') setShowCancelled(true);
  }, [openEvent?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = useCallback((e: CalendarEvent) => setOpenKey(e.key), []);
  const close = useCallback(() => {
    setOpenKey(null);
    if (params.get('event')) { const p = new URLSearchParams(params); p.delete('event'); setParams(p, { replace: true }); }
  }, [params, setParams]);

  const toggleReminder = async (e: CalendarEvent, offset: ReminderOffset, on: boolean) => {
    if (!user) return;
    const ok = await setReminder(user.id, e, offset, on);
    if (!ok) { toast.error('Could not update reminder'); return; }
    setReminders(await getReminders(user.id).catch(() => reminders));
    toast.success(on ? 'Reminder set' : 'Reminder off');
  };

  const visible = useMemo(
    () => (events || []).filter(e => matchesFilter(e, filter) && (showCancelled || e.status !== 'cancelled')),
    [events, filter, showCancelled],
  );
  const range = rangeFor(view, cursor);
  const today = startOfDay(new Date());
  const hiddenCancelled = (events || []).filter(e => matchesFilter(e, filter) && e.status === 'cancelled').length;

  const dayEntries = (d: Date) => visible.filter(e => coversDay(e, d)).sort((a, b) => +a.start - +b.start || (a.nature === 'record' ? 1 : -1));

  const days = (from: Date, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 py-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} aria-label="Back" className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-black text-gray-900 flex items-center gap-2"><CalendarDays className="w-5 h-5 text-blue-600" /> Calendar</h1>
        </div>

        {/* View switch */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 mb-3" role="tablist" aria-label="Calendar view">
          {VIEWS.map(v => (
            <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${view === v.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              {v.label}
            </button>
          ))}
        </div>

        {/* Range controls */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <button onClick={() => setCursor(shift(view, cursor, -1))} aria-label="Previous" className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600"><ChevronLeft className="w-5 h-5" /></button>
            <button onClick={() => setCursor(shift(view, cursor, 1))} aria-label="Next" className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600"><ChevronRight className="w-5 h-5" /></button>
            <button onClick={() => { setCursor(today); setSelectedDay(today); }} className="ml-1 px-3 py-1.5 rounded-full border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50">Today</button>
          </div>
          <p className="text-sm font-black text-gray-900">{range.label}</p>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1 mb-2" role="tablist" aria-label="Filter by type">
          {FILTERS.map(f => (
            <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${filter === f ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>

        {/* Legend + cancelled toggle */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3 text-[11px] text-gray-500">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-blue-600 bg-white" /> Pending</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-600" /> Confirmed</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded border border-dashed border-gray-400 bg-gray-50" /> Transaction record</span>
          </div>
          <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
            <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} className="rounded border-gray-300" />
            Show cancelled/declined{!showCancelled && hiddenCancelled > 0 ? ` (${hiddenCancelled})` : ''}
          </label>
        </div>

        {/* Partial failure -- named, with Retry */}
        {failedSources.length > 0 && events && (
          <div role="alert" className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="flex-1">Couldn’t load {failedSources.map(s => SOURCE_LABEL[s]).join(', ')}. Entries from these may be missing.</p>
            <button onClick={() => setAttempt(a => a + 1)} className="font-bold underline shrink-0">Retry</button>
          </div>
        )}

        {/* Body */}
        {!events ? (
          loadError ? (
            <div role="alert" className="mx-auto my-12 max-w-sm rounded-2xl border border-gray-100 bg-white p-6 text-center">
              <p className="text-sm font-bold text-gray-900">We couldn’t load your calendar.</p>
              <p className="mt-1 text-xs text-gray-500">Check your connection and try again.</p>
              <button onClick={() => setAttempt(a => a + 1)} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
                <RotateCcw className="h-4 w-4" /> Retry
              </button>
            </div>
          ) : <AgendaSkeleton />
        ) : view === 'agenda' ? (
          <AgendaView days={days(range.start, AGENDA_DAYS)} entriesFor={dayEntries} today={today} open={open} />
        ) : view === 'week' ? (
          <div className="grid gap-3 md:grid-cols-7">
            {days(range.start, 7).map(d => (
              <div key={+d} className="md:min-w-0">
                <p className={`text-[11px] font-black uppercase tracking-wide mb-1.5 ${sameDay(d, today) ? 'text-blue-600' : 'text-gray-400'}`}>
                  {fmtDay(d, { weekday: 'short', month: 'short', day: 'numeric' })}{sameDay(d, today) ? ' · Today' : ''}
                </p>
                <div className="space-y-2">
                  {dayEntries(d).map(e => <EntryRow key={`${e.key}@${+d}`} e={e} onOpen={open} />)}
                  {dayEntries(d).length === 0 && <p className="text-[11px] text-gray-300 py-1">—</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <MonthView
            monthStart={range.start} today={today} selectedDay={selectedDay}
            onSelectDay={setSelectedDay} entriesFor={dayEntries} open={open}
          />
        )}

        {events && visible.length === 0 && (
          <p className="text-center text-sm text-gray-500 py-10">
            Your upcoming bookings and work dates will appear here.
          </p>
        )}
      </div>

      {openEvent && (
        <CalendarDetail event={openEvent} all={events || []} reminders={reminders} onToggleReminder={toggleReminder} onClose={close} />
      )}
    </div>
  );
}

function AgendaView({ days, entriesFor, today, open }: {
  days: Date[]; entriesFor: (d: Date) => CalendarEvent[]; today: Date; open: (e: CalendarEvent) => void;
}) {
  const groups = days.map(d => ({ d, items: entriesFor(d) })).filter(g => g.items.length > 0);
  if (groups.length === 0) return <p className="text-center text-sm text-gray-500 py-8">Nothing on the calendar in this range.</p>;
  return (
    <div className="space-y-4">
      {groups.map(({ d, items }) => (
        <section key={+d}>
          <h2 className={`text-[11px] font-black uppercase tracking-wide mb-1.5 ${sameDay(d, today) ? 'text-blue-600' : 'text-gray-400'}`}>
            {fmtDay(d, { weekday: 'long', month: 'short', day: 'numeric' })}{sameDay(d, today) ? ' · Today' : ''}
          </h2>
          <div className="space-y-2">{items.map(e => <EntryRow key={`${e.key}@${+d}`} e={e} onOpen={open} />)}</div>
        </section>
      ))}
    </div>
  );
}

function MonthView({ monthStart, today, selectedDay, onSelectDay, entriesFor, open }: {
  monthStart: Date; today: Date; selectedDay: Date; onSelectDay: (d: Date) => void;
  entriesFor: (d: Date) => CalendarEvent[]; open: (e: CalendarEvent) => void;
}) {
  const gridStart = startOfWeek(monthStart);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const selected = entriesFor(selectedDay);
  return (
    <div>
      <div className="grid grid-cols-7 text-center text-[10px] font-black uppercase tracking-wide text-gray-400 mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-2xl overflow-hidden border border-gray-200">
        {cells.map(d => {
          const inMonth = d.getMonth() === monthStart.getMonth();
          const list = entriesFor(d);
          const scheduled = list.filter(e => e.nature === 'scheduled');
          const records = list.length - scheduled.length;
          return (
            <button key={+d} onClick={() => onSelectDay(startOfDay(d))} aria-label={fmtDay(d, { weekday: 'long', month: 'long', day: 'numeric' }) + `, ${list.length} entries`}
              className={`min-h-[56px] md:min-h-[96px] p-1 text-left align-top flex flex-col gap-0.5 ${inMonth ? 'bg-white' : 'bg-gray-50'} ${sameDay(d, selectedDay) ? 'ring-2 ring-inset ring-blue-500' : ''}`}>
              <span className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${sameDay(d, today) ? 'bg-blue-600 text-white' : inMonth ? 'text-gray-800' : 'text-gray-300'}`}>{d.getDate()}</span>
              {/* Desktop: labelled chips (outlined = pending, solid = confirmed, dashed = record) */}
              <div className="hidden md:flex flex-col gap-0.5 min-w-0">
                {scheduled.slice(0, 2).map(e => (
                  <span key={e.key} className={`truncate rounded px-1 py-0.5 text-[10px] font-semibold ${entryChipClass(e)}`}>{e.title}</span>
                ))}
                {scheduled.length > 2 && <span className="text-[10px] text-gray-500 font-semibold">+{scheduled.length - 2} more</span>}
                {records > 0 && <span className="truncate rounded border border-dashed border-gray-300 bg-gray-50 px-1 py-0.5 text-[10px] text-gray-500">{records} record{records > 1 ? 's' : ''}</span>}
              </div>
              {/* Mobile: dots */}
              <div className="md:hidden flex flex-wrap gap-0.5 px-0.5">
                {scheduled.slice(0, 4).map(e => (
                  <span key={e.key} className={`w-1.5 h-1.5 rounded-full ${e.status === 'pending' ? `border ${KIND_STYLE[e.kind].outline.split(' ')[0]} bg-white` : KIND_STYLE[e.kind].dot}`} />
                ))}
                {records > 0 && <span className="w-1.5 h-1.5 rounded-sm border border-dashed border-gray-400" />}
              </div>
            </button>
          );
        })}
      </div>

      <h2 className="text-[11px] font-black uppercase tracking-wide text-gray-400 mt-4 mb-1.5">
        {fmtDay(selectedDay, { weekday: 'long', month: 'long', day: 'numeric' })}{sameDay(selectedDay, today) ? ' · Today' : ''}
      </h2>
      {selected.length === 0
        ? <p className="text-xs text-gray-400 py-2">Nothing on this day.</p>
        : <div className="space-y-2">{selected.map(e => <EntryRow key={`${e.key}@${+selectedDay}`} e={e} onOpen={open} />)}</div>}
    </div>
  );
}
