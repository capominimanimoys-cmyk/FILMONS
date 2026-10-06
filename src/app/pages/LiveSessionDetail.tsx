// FILMONS Learning -- /live/:sessionId. Students can Contact instructor or
// Apply for a session; the instructor sees a Manage button instead.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Check, Clock, Globe, Copy, Loader2, MessageCircle, MoreHorizontal, Radio, Settings2, Share2, Users, Video } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLearningTransition } from '../context/LearningTransitionContext';
import { learningLoginPath } from '../lib/learningAuth';
import { useLearningBack } from '../lib/useLearningBack';
import { learningOrigin } from '../lib/learningOrigin';
import { DAY_LABEL, PLATFORM_LABEL, applyToSession, formatFee, getLiveSession, getMyApplicationFor, type LiveApplication, type LiveSession } from '../lib/liveSessionsApi';
import { UserAvatar } from '../components/AccountTypeBadge';
import { BottomSheet } from '../components/BottomSheet';
import { useIsMobile } from '../components/ui/use-mobile';
import { createPortal } from 'react-dom';
import { PostMoreMenu } from '../components/connect/PostMoreMenu';
import { Field, inputCls } from '../components/learning/builder/BuilderUI';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';

const APP_STATUS_LABEL: Record<string, string> = {
  applied: 'Application sent — waiting for the instructor',
  accepted: 'Accepted', awaiting_payment: 'Accepted — pay to confirm your booking', confirmed: 'Booking confirmed',
};

export function LiveSessionDetail() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useLearningBack('/');
  const { user } = useAuth();
  const { leaveLearning } = useLearningTransition();
  const [s, setS] = useState<LiveSession | null | undefined>(undefined);
  const [mine, setMine] = useState<LiveApplication | null>(null);
  const [applying, setApplying] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    getLiveSession(sessionId).then(x => setS(x ?? null));
  }, [sessionId]);
  useEffect(() => { if (s && user) getMyApplicationFor(s.id, user.id).then(setMine); }, [s?.id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (s === undefined) return <div className="flex min-h-screen items-center justify-center"><FilmonsBrandLoader size="lg" label="Loading session" /></div>;
  if (s === null) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-bold text-gray-700">Live session not found</p>
      <button onClick={() => navigate('/')} className="text-sm font-bold text-blue-600">Back to Learning</button>
    </div>
  );

  const isOwn = user?.id === s.instructorId;
  const open = s.status === 'published';
  const needLogin = () => { navigate(learningLoginPath(location.pathname + location.search)); };
  const contact = () => {
    if (!user) return needLogin();
    leaveLearning(s.instructor?.username ? `/${s.instructor.username}` : `/host/${s.instructorId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-gray-100 bg-white/90 px-4 py-3 backdrop-blur-sm">
        <button onClick={goBack} aria-label="Back" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100"><ArrowLeft className="h-4 w-4 text-gray-700" /></button>
        <p className="flex-1 truncate text-sm font-bold text-gray-900">Live session</p>
        <button onClick={() => setMenu(true)} aria-label="Live session options" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100"><MoreHorizontal className="h-4 w-4 text-gray-700" /></button>
      </div>
      {menu && (
        <PostMoreMenu onClose={() => setMenu(false)} actions={[
          { icon: Share2, label: 'Share live session', onClick: () => { setMenu(false); navigate(`/live/${s.id}/share-card`); } },
          { icon: Copy, label: 'Copy link', onClick: () => { setMenu(false); navigator.clipboard.writeText(`${learningOrigin()}/live/${s.id}`).then(() => toast.success('Link copied!'), () => toast.error('Could not copy the link')); } },
          ...(isOwn ? [{ icon: Settings2, label: 'Manage applications', onClick: () => { setMenu(false); navigate(`/instructor/live/${s.id}`); } }] : []),
        ]} />
      )}
      <div className="lg:mx-auto lg:max-w-3xl">
        <div className="aspect-video w-full bg-gray-900">
          {s.coverUrl ? <img src={s.coverUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-white/70"><Radio className="h-10 w-10" /></div>}
        </div>
        <div className="space-y-4 px-4 py-4">
          <div data-pop>
            <p className="text-lg font-black leading-snug text-gray-900">{s.title}</p>
            <p className="mt-1 text-xs text-gray-500">{s.topic}</p>
          </div>
          <div data-pop className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {s.format === 'one_to_one' ? 'One-to-one' : `Small group · up to ${s.maxParticipants}`}</span>
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {s.durationMinutes} min</span>
            <span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" /> {s.language}</span>
            <span className="flex items-center gap-1"><Video className="h-3.5 w-3.5" /> {PLATFORM_LABEL[s.platform]}</span>
          </div>

          <button data-pop onClick={() => leaveLearning(s.instructor?.username ? `/${s.instructor.username}` : `/host/${s.instructorId}`)} className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 text-left">
            <UserAvatar user={{ id: s.instructorId, name: s.instructor?.name || '', avatar: s.instructor?.avatarUrl ?? undefined }} size={44} />
            <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Taught by</p><p className="truncate text-sm font-black text-gray-900">{s.instructor?.name}</p></div>
          </button>

          <div data-pop className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4">
            <p className="text-xl font-black text-gray-900">{s.isFree ? 'Free' : formatFee(s.price, s.currency)}</p>
            {!s.isFree && <p className="-mt-2 text-xs text-gray-500">per person, per session</p>}
            {isOwn ? (
              <button onClick={() => navigate(`/instructor/live/${s.id}`)} className="w-full rounded-2xl bg-gray-900 py-3 text-sm font-bold text-white">Manage applications</button>
            ) : mine ? (
              <div className="rounded-xl bg-blue-50 px-3 py-2.5 text-sm font-bold text-blue-900">
                {APP_STATUS_LABEL[mine.status] ?? mine.status}
                <button onClick={() => navigate('/my-learning?tab=live')} className="ml-2 text-xs font-black text-blue-600 underline">View in My learning</button>
              </div>
            ) : !open ? (
              <p className="rounded-xl bg-gray-100 px-3 py-2.5 text-sm text-gray-600">This session isn’t taking applications right now.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={contact} className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-800"><MessageCircle className="h-4 w-4" /> Contact instructor</button>
                <button onClick={() => (user ? setApplying(true) : needLogin())} className="rounded-2xl bg-blue-600 py-3 text-sm font-bold text-white">Apply for a session</button>
              </div>
            )}
            {!isOwn && !mine && open && <p className="text-xs leading-relaxed text-gray-500">The instructor reviews your application and confirms the date, time and fee. {s.isFree ? 'Free sessions need no payment.' : 'You pay to confirm your booking.'}</p>}
            <button onClick={() => navigate(`/live/${s.id}/share-card`)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50">
              <Share2 className="h-4 w-4" /> Share live session
            </button>
          </div>

          {s.description && <div data-pop className="rounded-2xl border border-gray-100 bg-white p-4"><p className="mb-2 text-sm font-black text-gray-900">About this session</p><p className="whitespace-pre-line text-sm leading-relaxed text-gray-600">{s.description}</p></div>}
          {s.learningOutcomes.length > 0 && (
            <div data-pop className="rounded-2xl border border-gray-100 bg-white p-4">
              <p className="mb-3 text-sm font-black text-gray-900">What you’ll learn</p>
              <ul className="space-y-2">{s.learningOutcomes.map((o, i) => <li key={i} className="flex gap-2 text-sm text-gray-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{o}</li>)}</ul>
            </div>
          )}
          <div data-pop className="rounded-2xl border border-gray-100 bg-white p-4">
            <p className="mb-2 text-sm font-black text-gray-900">Availability</p>
            <p className="text-sm text-gray-600">{s.availableDays.map(d => DAY_LABEL[d]).join(', ')} · {s.timezone}</p>
          </div>
        </div>
      </div>

      {applying && user && (
        <ApplySheet session={s} onClose={() => setApplying(false)}
          onDone={async () => { setApplying(false); toast.success('Application sent'); setMine(await getMyApplicationFor(s.id, user.id)); }} studentId={user.id} />
      )}
    </div>
  );
}

function ApplySheet({ session, studentId, onClose, onDone }: { session: LiveSession; studentId: string; onClose: () => void; onDone: () => void }) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [goals, setGoals] = useState('');
  const [experience, setExperience] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const q = session.questions;
  const showDate = q.dates && session.allowPreferredDate;

  const submit = async () => {
    if (q.goals && !goals.trim()) { toast.error('Tell the instructor your learning goals'); return; }
    if (q.experience && !experience) { toast.error('Choose your experience level'); return; }
    setBusy(true);
    const err = await applyToSession(session, studentId, { goals, experience, preferredDate: date }, user?.name || 'A student');
    setBusy(false);
    if (err) { toast.error(err); return; }
    onDone();
  };

  const body = (
    <div className="space-y-4 px-4 pb-4">
      {q.goals && <Field label="What are your learning goals?" htmlFor="ap-goals"><textarea id="ap-goals" rows={3} value={goals} onChange={e => setGoals(e.target.value)} className={inputCls} /></Field>}
      {q.experience && (
        <Field label="Your experience level" htmlFor="ap-exp">
          <select id="ap-exp" value={experience} onChange={e => setExperience(e.target.value)} className={inputCls}>
            <option value="">Select…</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option>
          </select>
        </Field>
      )}
      {showDate && <Field label="Preferred date" optional htmlFor="ap-date" hint={`The instructor is usually available ${session.availableDays.map(d => DAY_LABEL[d]).join(', ')} (${session.timezone}).`}><input id="ap-date" type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)} className={inputCls} /></Field>}
      <button onClick={submit} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Send application</button>
    </div>
  );
  if (isMobile) return <BottomSheet title="Apply for a session" onClose={onClose}>{body}</BottomSheet>;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div data-pop role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} className="w-full max-w-md rounded-3xl bg-white pt-5 shadow-xl">
        <p className="mb-4 px-4 text-base font-black text-gray-900">Apply for a session</p>
        {body}
      </div>
    </div>, document.body);
}
