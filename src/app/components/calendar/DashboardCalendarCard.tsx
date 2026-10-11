// "Your calendar" -- dashboard preview of the next three SCHEDULED activities
// (title, date, time, status). Transaction records are never appointments, so
// they don't appear here; the full calendar shows them.
// Loading rule: cached entries show instantly (stale-while-revalidate), else a
// skeleton shaped like the rows; the load has a deadline and a visible Retry.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { CalendarDays, ChevronRight, RotateCcw } from 'lucide-react';
import {
  loadCalendarEvents, readCachedEvents, writeCachedEvents, upcomingPreview, type CalendarEvent,
} from '../../lib/calendarApi';
import { EntryRow } from './calendarUi';

export function DashboardCalendarCard({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [events, setEvents] = useState<CalendarEvent[] | null>(() => readCachedEvents(userId));
  const [failed, setFailed] = useState(false);
  const [partial, setPartial] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    loadCalendarEvents(userId).then(r => {
      if (!alive) return;
      // Every source timed out/failed and nothing is cached -> visible error, not a fake empty state.
      if (r.failed.length >= 5) { setFailed(true); return; }
      setPartial(r.failed.length > 0);
      setEvents(r.events);
      writeCachedEvents(userId, r.events);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [userId, attempt]);

  const retry = useCallback(() => setAttempt(a => a + 1), []);
  const open = (e: CalendarEvent) => navigate(`/calendar?event=${encodeURIComponent(e.key)}`);
  const next = events ? upcomingPreview(events, 3) : [];

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4" aria-label="Your calendar">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-blue-600" /> Your calendar
        </h3>
        <button onClick={() => navigate('/calendar')} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-0.5">
          View calendar <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {!events && failed ? (
        <button onClick={retry} className="w-full flex items-center justify-center gap-1.5 py-4 text-xs text-gray-500">
          Couldn’t load your calendar. <span className="font-bold text-blue-600 inline-flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Retry</span>
        </button>
      ) : !events ? (
        <div className="space-y-2 animate-pulse" aria-hidden>
          {[0, 1, 2].map(i => <div key={i} className="h-[68px] rounded-2xl bg-gray-100" />)}
        </div>
      ) : next.length === 0 ? (
        <p className="text-xs text-gray-500 py-3 text-center">Your upcoming bookings and work dates will appear here.</p>
      ) : (
        <div className="space-y-2">
          {next.map(e => <EntryRow key={e.key} e={e} onOpen={open} showDate />)}
        </div>
      )}
      {events && partial && (
        <button onClick={retry} className="mt-2 w-full text-[11px] text-amber-700 text-center">
          Some entries couldn’t load. <span className="font-bold underline">Retry</span>
        </button>
      )}
    </section>
  );
}
