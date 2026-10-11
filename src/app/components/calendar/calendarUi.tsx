// Shared presentation for the FILMONS calendar (dashboard preview, agenda,
// month/week cells, detail panel).
//
// Two visual languages, so a purchase or withdrawal never looks like an
// appointment:
//   * SCHEDULED activities -- coloured by kind. Pending = OUTLINED, confirmed =
//     SOLID, completed = muted, cancelled = struck through.
//   * TRANSACTION records -- neutral, dashed, with a receipt icon and a
//     "Record" tag; amounts are shown in green (in) / gray (out).
// A written status is always shown, never colour alone.
import { Receipt } from 'lucide-react';
import type { CalendarEvent, CalendarKind } from '../../lib/calendarApi';
import { formatAmount } from '../../lib/calendarApi';

export const KIND_STYLE: Record<CalendarKind, { solid: string; outline: string; text: string; dot: string }> = {
  rental:      { solid: 'bg-blue-600 text-white',    outline: 'border-blue-600 text-blue-700',       text: 'text-blue-700',    dot: 'bg-blue-600' },
  service:     { solid: 'bg-purple-600 text-white',  outline: 'border-purple-600 text-purple-700',   text: 'text-purple-700',  dot: 'bg-purple-600' },
  sale:        { solid: 'bg-amber-600 text-white',   outline: 'border-amber-600 text-amber-700',     text: 'text-amber-700',   dot: 'bg-amber-600' },
  opportunity: { solid: 'bg-emerald-600 text-white', outline: 'border-emerald-600 text-emerald-700', text: 'text-emerald-700', dot: 'bg-emerald-600' },
  course:      { solid: 'bg-indigo-600 text-white',  outline: 'border-indigo-600 text-indigo-700',   text: 'text-indigo-700',  dot: 'bg-indigo-600' },
  wallet:      { solid: 'bg-gray-700 text-white',    outline: 'border-gray-500 text-gray-700',       text: 'text-gray-700',    dot: 'bg-gray-500' },
};

export function entryChipClass(e: CalendarEvent): string {
  if (e.nature === 'record') return 'border border-dashed border-gray-300 bg-gray-50 text-gray-600';
  const k = KIND_STYLE[e.kind];
  if (e.status === 'cancelled') return 'border border-gray-200 bg-white text-gray-400 line-through';
  if (e.status === 'completed') return 'border border-gray-200 bg-gray-100 text-gray-500';
  if (e.status === 'pending') return `border-2 bg-white ${k.outline}`;
  return `border border-transparent ${k.solid}`;
}

export function fmtDay(d: Date, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return d.toLocaleDateString(undefined, opts);
}
export function fmtTime(e: CalendarEvent): string {
  return e.allDay ? 'All day' : e.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: e.timezone });
}
/** "Fri, Mar 7 · 3:00 PM" or "Mar 7 – Mar 10". */
export function fmtWhen(e: CalendarEvent): string {
  const day = fmtDay(e.start, { weekday: 'short', month: 'short', day: 'numeric', year: e.start.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  if (e.end) return `${fmtDay(e.start, { month: 'short', day: 'numeric' })} – ${fmtDay(e.end, { month: 'short', day: 'numeric' })}`;
  return e.allDay ? day : `${day} · ${fmtTime(e)}`;
}
export function tzLabel(tz: string): string {
  try {
    const part = new Intl.DateTimeFormat(undefined, { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName');
    return part ? `${tz.replace(/_/g, ' ')} (${part.value})` : tz;
  } catch { return tz; }
}

export function AmountText({ e, className = '' }: { e: CalendarEvent; className?: string }) {
  if (!e.amount) return null;
  return (
    <span className={`font-bold tabular-nums ${e.amount.direction === 'in' ? 'text-emerald-600' : 'text-gray-700'} ${className}`}>
      {formatAmount(e.amount)}
    </span>
  );
}

/** One agenda / list row -- used by the dashboard preview, Agenda, Week and the Month day list. */
export function EntryRow({ e, onOpen, showDate = false }: { e: CalendarEvent; onOpen: (e: CalendarEvent) => void; showDate?: boolean }) {
  const isRecord = e.nature === 'record';
  const k = KIND_STYLE[e.kind];
  return (
    <button
      onClick={() => onOpen(e)}
      className={`w-full text-left flex items-stretch gap-3 rounded-2xl px-3 py-2.5 transition-colors ${
        isRecord ? 'border border-dashed border-gray-200 bg-gray-50/60 hover:bg-gray-50' : 'bg-white border border-gray-100 hover:bg-gray-50'
      }`}
    >
      {isRecord ? (
        <div className="w-9 shrink-0 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500"><Receipt className="w-4 h-4" /></div>
      ) : (
        <div className={`w-1.5 shrink-0 rounded-full ${e.status === 'cancelled' || e.status === 'completed' ? 'bg-gray-300' : k.dot}`} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className={`text-sm font-semibold truncate ${e.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{e.title}</p>
        </div>
        <p className="text-[11px] text-gray-500 mt-0.5 truncate">
          <span className={`font-semibold ${isRecord ? 'text-gray-500' : k.text}`}>{e.partLabel}</span>
          {' · '}{showDate ? fmtWhen(e) : e.end ? fmtWhen(e) : fmtTime(e)}
        </p>
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            e.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700'
            : e.status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-200'
            : e.status === 'cancelled' ? 'bg-gray-100 text-gray-500'
            : 'bg-gray-100 text-gray-600'}`}>{e.statusLabel}</span>
          {isRecord && <span className="text-[10px] font-semibold text-gray-400">Transaction record</span>}
        </div>
      </div>
      <AmountText e={e} className="text-xs self-start shrink-0" />
    </button>
  );
}
