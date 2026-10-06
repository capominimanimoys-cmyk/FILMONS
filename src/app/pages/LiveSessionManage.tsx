// FILMONS Learning -- /instructor/live/:sessionId. Applications for one live
// session: accept (set date, time, fee, link) or decline; add/change the
// meeting link on a booking later; publish/unpublish the session.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Loader2, Radio } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  PLATFORM_LABEL, acceptApplication, formatFee, getApplicationsForSession, getLiveSession, getSessionLinkForInstructor, setApplicationLink,
  setLiveSessionStatus, setSessionLink, updateApplicationStatus, type LiveApplication, type LiveSession,
} from '../lib/liveSessionsApi';
import { UserAvatar } from '../components/AccountTypeBadge';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import { Field, inputCls } from '../components/learning/builder/BuilderUI';
import { EmptyState, LearningPage, SignInPrompt, timeAgo } from '../components/learning/LearningPageParts';

const STATUS_CLS: Record<string, string> = {
  applied: 'bg-blue-50 text-blue-700', awaiting_payment: 'bg-amber-50 text-amber-700', confirmed: 'bg-emerald-50 text-emerald-700',
  declined: 'bg-gray-100 text-gray-500', cancelled: 'bg-gray-100 text-gray-500', accepted: 'bg-blue-50 text-blue-700',
};
const STATUS_LABEL: Record<string, string> = { applied: 'New application', awaiting_payment: 'Awaiting payment', confirmed: 'Confirmed', declined: 'Declined', cancelled: 'Cancelled', accepted: 'Accepted' };

export function LiveSessionManage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [s, setS] = useState<LiveSession | null | undefined>(undefined);
  const [apps, setApps] = useState<LiveApplication[] | null>(null);
  const [defaultLink, setDefaultLink] = useState('');

  const load = useCallback(async () => {
    if (!sessionId || !user) return;
    const x = await getLiveSession(sessionId);
    if (!x || x.instructorId !== user.id) { setS(null); return; }
    setS(x);
    getApplicationsForSession(sessionId).then(setApps).catch(() => setApps([]));
    getSessionLinkForInstructor(sessionId).then(setDefaultLink);
  }, [sessionId, user]);
  useEffect(() => { load(); }, [load]);

  if (!user) return <LearningPage><SignInPrompt message="Log in to manage your live session." /></LearningPage>;
  if (s === undefined) return <FilmonsBrandLoader size="lg" label="Loading session" className="py-32" />;
  if (s === null) return <LearningPage><EmptyState icon={<Radio className="h-9 w-9" />} title="Live session not found" body="It may belong to another instructor." /></LearningPage>;

  const toggle = async () => {
    const next = s.status === 'published' ? 'unpublished' : 'published';
    if (await setLiveSessionStatus(s.id, user.id, next)) { toast.success(next === 'published' ? 'Session published again' : 'Session unpublished'); load(); } else toast.error('Could not update the session');
  };
  const saveDefault = async () => { (await setSessionLink(s.id, defaultLink)) ? toast.success('Default link saved') : toast.error('Could not save the link'); };

  return (
    <LearningPage>
      <div data-pop className="rounded-3xl border border-gray-100 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${s.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{s.status === 'published' ? 'Published' : 'Unpublished'}</span>
          <span className="text-xs text-gray-500">{s.format === 'one_to_one' ? 'One-to-one' : `Small group · ${s.maxParticipants}`} · {s.durationMinutes} min · {PLATFORM_LABEL[s.platform]}</span>
        </div>
        <h1 className="mt-1.5 text-xl font-black text-gray-900">{s.title}</h1>
        <p className="mt-0.5 text-xs text-gray-500">{s.isFree ? 'Free' : `${formatFee(s.price, s.currency)} per person, per session`}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <button onClick={() => navigate(`/live/${s.id}`)} className="rounded-xl border border-gray-200 px-4 py-2 font-bold text-gray-800">View session</button>
          <button onClick={toggle} className="rounded-xl px-4 py-2 font-bold text-amber-700 hover:bg-amber-50">{s.status === 'published' ? 'Unpublish' : 'Publish again'}</button>
        </div>
        <div className="mt-4 max-w-md">
          <Field label={`Default ${PLATFORM_LABEL[s.platform]} link`} optional hint="Used for bookings you confirm without their own link. Only confirmed participants see it.">
            <div className="flex gap-2"><input value={defaultLink} onChange={e => setDefaultLink(e.target.value)} placeholder="https://" className={inputCls} /><button onClick={saveDefault} className="shrink-0 rounded-xl bg-gray-900 px-4 text-sm font-bold text-white">Save</button></div>
          </Field>
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-base font-black text-gray-900">Applications</h2>
      {apps === null ? <div className="h-24 animate-pulse rounded-2xl bg-gray-100" /> : apps.length === 0 ? (
        <EmptyState icon={<Radio className="h-9 w-9" />} title="No applications yet" body="Students who apply will appear here." />
      ) : (
        <ul className="space-y-3">{apps.map(a => <AppCard key={a.id} app={a} session={s} onChanged={load} />)}</ul>
      )}
    </LearningPage>
  );
}

function AppCard({ app, session, onChanged }: { app: LiveApplication; session: LiveSession; onChanged: () => void }) {
  const [accepting, setAccepting] = useState(false);
  const [when, setWhen] = useState('');
  const [fee, setFee] = useState(session.isFree ? 0 : session.price);
  const [link, setLink] = useState(app.meetingLink ?? '');
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    if (!when) { toast.error('Choose the date and time'); return; }
    setBusy(true);
    const err = await acceptApplication(app, session, { scheduledAt: when, fee, currency: session.currency, meetingLink: link });
    setBusy(false);
    if (err) { toast.error(err); return; }
    toast.success(fee > 0 ? 'Accepted — the student can now pay to confirm' : 'Booking confirmed');
    setAccepting(false); onChanged();
  };
  const decline = async () => { (await updateApplicationStatus(app.id, 'declined', { studentId: app.studentId, instructorId: session.instructorId, instructorName: session.instructor?.name || 'Your instructor', title: session.title })) ? onChanged() : toast.error('Could not decline'); };
  const saveLink = async () => { const e = await setApplicationLink(app.id, link); e ? toast.error(e) : (toast.success('Meeting link saved'), onChanged()); };

  return (
    <li data-pop className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="flex items-center gap-3">
        <UserAvatar user={{ id: app.studentId, name: app.student?.name || '', avatar: app.student?.avatarUrl ?? undefined }} size={40} />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-gray-900">{app.student?.name ?? 'Filmons student'}</p><p className="text-xs text-gray-400">Applied {timeAgo(app.createdAt)}</p></div>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${STATUS_CLS[app.status]}`}>{STATUS_LABEL[app.status]}</span>
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        {app.goals && <div><dt className="text-xs text-gray-400">Learning goals</dt><dd className="text-gray-700">{app.goals}</dd></div>}
        {app.experience && <div><dt className="text-xs text-gray-400">Experience</dt><dd className="text-gray-700">{app.experience}</dd></div>}
        {app.preferredDate && <div><dt className="text-xs text-gray-400">Preferred date</dt><dd className="text-gray-700">{app.preferredDate}</dd></div>}
        {app.scheduledAt && <div><dt className="text-xs text-gray-400">Scheduled</dt><dd className="font-bold text-gray-900">{new Date(app.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short', timeZone: session.timezone || undefined })} · {formatFee(app.fee, app.currency)}</dd></div>}
      </dl>

      {app.status === 'applied' && !accepting && (
        <div className="mt-3 flex gap-2">
          <button onClick={() => { setAccepting(true); if (app.preferredDate) setWhen(`${app.preferredDate}T10:00`); }} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white">Accept</button>
          <button onClick={decline} className="rounded-xl px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100">Decline</button>
        </div>
      )}
      {accepting && (
        <div data-pop className="mt-3 space-y-3 rounded-xl bg-gray-50 p-3">
          <Field label={`Date and time (${session.timezone})`} htmlFor={`w-${app.id}`}><input id={`w-${app.id}`} type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className={inputCls} /></Field>
          <Field label={`Fee (${session.currency}, per person)`} htmlFor={`f-${app.id}`} hint="Set 0 for no charge. A paid booking is confirmed once the student pays."><input id={`f-${app.id}`} type="number" min={0} step="0.01" value={fee} onChange={e => setFee(Number(e.target.value) || 0)} className={inputCls} /></Field>
          <Field label="Meeting link" optional htmlFor={`l-${app.id}`} hint="Leave empty to use the session’s default link, or add it later."><input id={`l-${app.id}`} value={link} onChange={e => setLink(e.target.value)} placeholder="https://" className={inputCls} /></Field>
          <div className="flex gap-2">
            <button onClick={accept} disabled={busy} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Accept and confirm</button>
            <button onClick={() => setAccepting(false)} className="rounded-xl px-4 py-2 text-sm font-bold text-gray-600">Cancel</button>
          </div>
        </div>
      )}
      {(app.status === 'confirmed' || app.status === 'awaiting_payment') && (
        <div className="mt-3 flex gap-2">
          <input value={link} onChange={e => setLink(e.target.value)} placeholder={`${PLATFORM_LABEL[session.platform]} link for this booking`} className={inputCls} />
          <button onClick={saveLink} className="shrink-0 rounded-xl bg-gray-900 px-4 text-sm font-bold text-white">Save link</button>
        </div>
      )}
    </li>
  );
}
