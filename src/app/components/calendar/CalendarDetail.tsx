// Activity details -- a bottom sheet on mobile, a side panel on desktop.
// Shows title / type / status, date + time + timezone, amount, location or
// meeting link, the related person, the link to the original booking /
// application / course / transaction, Message, and reminders for confirmed
// scheduled activities. Rescheduling and cancelling happen on the related
// management page, never here.
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { X, ExternalLink, MessageCircle, MapPin, Video, User, Bell, Receipt, CalendarClock, Settings2 } from 'lucide-react';
import {
  KIND_LABEL, canRemind, offsetsFor, OFFSET_LABEL, type CalendarEvent, type ReminderOffset, type ReminderRow,
} from '../../lib/calendarApi';
import { AmountText, KIND_STYLE, fmtDay, fmtTime, tzLabel } from './calendarUi';
import { useLearningTransition } from '../../context/LearningTransitionContext';

export function CalendarDetail({
  event, all, reminders, onToggleReminder, onClose,
}: {
  event: CalendarEvent;
  all: CalendarEvent[];
  reminders: ReminderRow[];
  onToggleReminder: (e: CalendarEvent, offset: ReminderOffset, on: boolean) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { enterLearning } = useLearningTransition();
  const e = event;
  const isRecord = e.nature === 'record';

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A rental is one booking with a pickup and a return -- show both clearly.
  const prefix = e.key.split(':').slice(0, 2).join(':');
  const pickup = e.kind === 'rental' ? all.find(x => x.key === `${prefix}:pickup`) : undefined;
  const ret = e.kind === 'rental' ? all.find(x => x.key === `${prefix}:return`) : undefined;

  const go = (link: { to?: string; learningPath?: string }) => {
    onClose();
    if (link.learningPath) enterLearning(link.learningPath, { route: window.location.pathname + window.location.search });
    else if (link.to) navigate(link.to);
  };
  const message = () => {
    onClose();
    if (e.conversationId) navigate(`/inbox?conv=${e.conversationId}${e.counterpart?.id ? `&with=${e.counterpart.id}` : ''}`);
    else if (e.counterpart?.id) navigate(`/inbox?with=${e.counterpart.id}`);
  };
  const canMessage = e.kind !== 'wallet' && !!(e.conversationId || e.counterpart?.id);

  const remindable = canRemind(e);
  const on = (o: ReminderOffset) => reminders.some(r => r.event_key === e.key && r.remind_before === o && r.enabled);

  const row = (icon: React.ReactNode, label: string, value: React.ReactNode) => (
    <div className="flex gap-3 py-2.5">
      <div className="w-5 shrink-0 text-gray-400 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
        <div className="text-sm text-gray-900 break-words">{value}</div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={`${e.title} details`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="absolute bg-white shadow-2xl overflow-y-auto
                   inset-x-0 bottom-0 max-h-[85vh] rounded-t-3xl
                   md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:max-h-none md:w-[420px] md:rounded-none md:rounded-l-3xl"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))', animation: 'cal-slide 220ms ease-out' }}
      >
        <style>{`
          @keyframes cal-slide { from { transform: translateY(24px); opacity: .6 } to { transform: none; opacity: 1 } }
        `}</style>
        <div className="sticky top-0 bg-white/95 backdrop-blur px-5 pt-4 pb-3 border-b border-gray-100 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <span className={`text-[10px] font-black uppercase tracking-wide ${KIND_STYLE[e.kind].text}`}>{KIND_LABEL[e.kind]} · {e.partLabel}</span>
            <h2 className={`text-lg font-black leading-tight mt-1 ${e.status === 'cancelled' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{e.title}</h2>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                e.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700'
                : e.status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-gray-100 text-gray-600'}`}>{e.statusLabel}</span>
              <span className="text-[11px] font-semibold text-gray-500 inline-flex items-center gap-1">
                {isRecord ? <><Receipt className="w-3 h-3" /> Transaction record</> : <><CalendarClock className="w-3 h-3" /> Scheduled activity</>}
              </span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-2 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 divide-y divide-gray-50">
          {e.kind === 'rental' && pickup && ret ? (
            <>
              {row(<CalendarClock className="w-4 h-4" />, 'Pickup', <>{fmtDay(pickup.start, { weekday: 'long', month: 'long', day: 'numeric' })}{!pickup.allDay && <> · {fmtTime(pickup)}</>}</>)}
              {row(<CalendarClock className="w-4 h-4" />, 'Return', <>{fmtDay(ret.start, { weekday: 'long', month: 'long', day: 'numeric' })}{!ret.allDay && <> · {fmtTime(ret)}</>}</>)}
            </>
          ) : row(<CalendarClock className="w-4 h-4" />, isRecord ? 'Date' : 'When', <>
            {fmtDay(e.start, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            {e.end && <> – {fmtDay(e.end, { month: 'long', day: 'numeric' })}</>}
          </>)}
          {row(<CalendarClock className="w-4 h-4 opacity-0" />, 'Time & timezone', <>{fmtTime(e)} · {tzLabel(e.timezone)}</>)}
          {e.amount && row(<Receipt className="w-4 h-4" />, e.amount.direction === 'in' ? 'Amount received' : 'Amount', <AmountText e={e} className="text-sm" />)}
          {e.location && row(<MapPin className="w-4 h-4" />, 'Location', e.location)}
          {e.meetingLink && row(<Video className="w-4 h-4" />, 'Meeting link', <a href={e.meetingLink} target="_blank" rel="noreferrer" className="text-blue-600 font-semibold underline break-all">Join meeting</a>)}
          {e.counterpart && row(<User className="w-4 h-4" />, e.counterpart.role, e.counterpart.name)}
        </div>

        {remindable && (
          <div className="mx-5 mt-3 rounded-2xl border border-gray-100 p-3">
            <p className="text-xs font-black text-gray-900 flex items-center gap-1.5 mb-2"><Bell className="w-3.5 h-3.5 text-blue-600" /> Remind me</p>
            <div className="flex gap-2 flex-wrap">
              {offsetsFor(e).map(o => (
                <button key={o} onClick={() => onToggleReminder(e, o, !on(o))} aria-pressed={on(o)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${on(o) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {OFFSET_LABEL[o]}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">Sent as a FILMONS notification with a link back here. Manage in Notification settings.</p>
          </div>
        )}

        <div className="px-5 pt-4 space-y-2">
          <button onClick={() => go(e.view)} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-3 rounded-2xl transition-colors">
            <ExternalLink className="w-4 h-4" /> {e.view.label}
          </button>
          {e.manage && (
            <button onClick={() => go(e.manage!)} className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-bold py-3 rounded-2xl transition-colors">
              <Settings2 className="w-4 h-4" /> {e.manage.label}
            </button>
          )}
          {canMessage && (
            <button onClick={message} className="w-full flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-800 text-sm font-bold py-3 rounded-2xl transition-colors">
              <MessageCircle className="w-4 h-4" /> Message
            </button>
          )}
          {!isRecord && <p className="text-[11px] text-gray-400 text-center pt-1">To reschedule or cancel, use the booking’s management page.</p>}
        </div>
      </div>
    </div>
  );
}
