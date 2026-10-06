// FILMONS Learning -- /learning/my-learning. The learner's own courses:
// In progress / Completed / Saved. Instructor-side course management
// lives on the Instructor dashboard (see InstructorDashboard.tsx), which
// reuses MyCourseRow from here.
import { CourseCover } from '../components/courses/CourseCover';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Bookmark, ExternalLink, GraduationCap, Radio, Share2, Video, Pencil, Settings2, Star, Users, MoreHorizontal, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getMyEnrollments,
  type EnrolledCourse, type Course,
} from '../lib/coursesApi';
import { getSavedCourses } from '../lib/topicsApi';
import { getTrustLevelsBatch, type TrustLevel } from '../lib/trustApi';
import { CourseCard } from '../components/courses/CourseCard';
import { EmptyState, LearningPage, ListSkeleton, PageTitle, SignInPrompt } from '../components/learning/LearningPageParts';
import { PostMoreMenu } from '../components/connect/PostMoreMenu';
import { startLearningCheckout, waitForPayment } from '../lib/learningCheckout';
import { PLATFORM_LABEL, formatFee, getMyBookings, joinLabel, type LiveApplication } from '../lib/liveSessionsApi';
import { DeleteCourseSheet } from '../components/learning/DeleteCourseSheet';

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-500' },
  published: { label: 'Published', className: 'bg-emerald-50 text-emerald-600' },
  unpublished: { label: 'Unpublished', className: 'bg-amber-50 text-amber-600' },
  archived: { label: 'Unpublished', className: 'bg-amber-50 text-amber-600' },
};

function EnrolledRow({ course }: { course: EnrolledCourse }) {
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  return (
    <div data-pop className="w-full flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-3">
      <button onClick={() => navigate(`/course/${course.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
          <CourseCover imageUrl={course.coverUrl} videoUrl={course.coverVideoUrl} play={false} fallback={<div className="w-full h-full flex items-center justify-center text-xl">🎬</div>} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{course.title}</p>
          <p className="text-xs text-gray-400 truncate">{course.instructor?.name}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full" style={{ width: `${course.progressPercent}%` }} />
            </div>
            <span className="text-[10px] font-bold text-gray-400 shrink-0">{course.progressPercent}%</span>
          </div>
        </div>
      </button>
      <button onClick={() => setMenu(true)} aria-label="Course options" className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"><MoreHorizontal className="w-4 h-4" /></button>
      {menu && (
        <PostMoreMenu onClose={() => setMenu(false)} actions={[
          { icon: ExternalLink, label: 'Open course', onClick: () => { setMenu(false); navigate(`/course/${course.id}`); } },
          { icon: Share2, label: 'Share course', onClick: () => { setMenu(false); navigate(`/course/${course.id}/share-card`); } },
        ]} />
      )}
    </div>
  );
}

export function MyCourseRow({ course, onChanged }: { course: Course; onChanged: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const status = STATUS_LABEL[course.status] ?? STATUS_LABEL.draft;

  return (
    <div data-pop className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-3">
      <button onClick={() => navigate(`/instructor/course/${course.id}`)} className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
        <CourseCover imageUrl={course.coverUrl} videoUrl={course.coverVideoUrl} play={false} fallback={<div className="w-full h-full flex items-center justify-center text-xl">🎬</div>} />
      </button>
      <div className="flex-1 min-w-0">
        <button onClick={() => navigate(`/instructor/course/${course.id}`)} className="block max-w-full text-left text-sm font-bold text-gray-900 truncate hover:underline">{course.title}</button>
        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${status.className}`}>{status.label}</span>
        <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-1.5">
          {course.studentCount > 0 && <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {course.studentCount} students</span>}
          {course.ratingCount > 0 && <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-400 fill-amber-400" /> {course.ratingAvg.toFixed(1)}</span>}
        </div>
      </div>
      <button onClick={() => navigate(`/instructor/course/${course.id}/edit?step=1`)} className="shrink-0 px-3 py-1.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold">Edit</button>
      <button onClick={() => setMenuOpen(true)} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {menuOpen && (
        <PostMoreMenu
          onClose={() => setMenuOpen(false)}
          actions={[
            { icon: Settings2, label: 'Manage course', onClick: () => { setMenuOpen(false); navigate(`/instructor/course/${course.id}`); } },
            { icon: Pencil, label: 'Edit course', onClick: () => { setMenuOpen(false); navigate(`/instructor/course/${course.id}/edit?step=1`); } },
            { icon: Share2, label: 'Share course', onClick: () => { setMenuOpen(false); navigate(`/course/${course.id}/share-card`); } },
          ]}
          destructiveActions={[{ icon: Trash2, label: 'Delete course', onClick: () => { setMenuOpen(false); setConfirmDelete(true); } }]}
        />
      )}
      {confirmDelete && user && (
        <DeleteCourseSheet course={course} instructorId={user.id} onClose={() => setConfirmDelete(false)} onChanged={onChanged} />
      )}
    </div>
  );
}

type Tab = 'progress' | 'completed' | 'saved' | 'live';
const TABS: { id: Tab; label: string }[] = [
  { id: 'progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'saved', label: 'Saved' },
  { id: 'live', label: 'Live sessions' },
];

const BOOKING_STATUS: Record<string, { label: string; cls: string }> = {
  applied: { label: 'Waiting for instructor', cls: 'bg-blue-50 text-blue-700' },
  accepted: { label: 'Accepted', cls: 'bg-blue-50 text-blue-700' },
  awaiting_payment: { label: 'Pay to confirm', cls: 'bg-amber-50 text-amber-700' },
  confirmed: { label: 'Confirmed', cls: 'bg-emerald-50 text-emerald-700' },
  declined: { label: 'Declined', cls: 'bg-gray-100 text-gray-500' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500' },
};

function LiveBookingRow({ b, userId }: { b: LiveApplication; userId: string }) {
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [menu, setMenu] = useState(false);
  const s = b.session;
  if (!s) return null;
  const st = BOOKING_STATUS[b.status] ?? BOOKING_STATUS.applied;
  return (
    <div data-pop className="rounded-2xl border border-gray-100 bg-white p-3.5">
      <div className="flex items-center gap-1">
      <button onClick={() => navigate(`/live/${s.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100">
          {s.coverUrl ? <img src={s.coverUrl} alt="" className="h-full w-full object-cover" /> : <Radio className="h-5 w-5 text-gray-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-gray-900">{s.title}</p>
          <p className="truncate text-xs text-gray-400">{s.instructor?.name} · {PLATFORM_LABEL[s.platform]}</p>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
        </div>
      </button>
      <button onClick={() => setMenu(true)} aria-label="Live session options" className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"><MoreHorizontal className="w-4 h-4" /></button>
      </div>
      {menu && (
        <PostMoreMenu onClose={() => setMenu(false)} actions={[
          { icon: ExternalLink, label: 'View session', onClick: () => { setMenu(false); navigate(`/live/${s.id}`); } },
          { icon: Share2, label: 'Share live session', onClick: () => { setMenu(false); navigate(`/live/${s.id}/share-card`); } },
        ]} />
      )}
      {b.scheduledAt && <p className="mt-2 text-xs font-semibold text-gray-700">{new Date(b.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short', timeZone: s.timezone || undefined })} ({s.timezone}) · {formatFee(b.fee, b.currency)}</p>}
      {b.status === 'awaiting_payment' && (
        <button disabled={paying} onClick={async () => {
          setPaying(true);
          const err = await startLearningCheckout(userId, { kind: 'live_session', applicationId: b.id }, `${window.location.origin}${window.location.pathname}?tab=live`);
          if (err) { toast.error(err); setPaying(false); }
        }} className="mt-2 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-60">{paying ? 'Opening checkout…' : `Pay ${formatFee(b.fee, b.currency)} to confirm`}</button>
      )}
      {b.status === 'confirmed' && (b.meetingLink ? (
        <a href={b.meetingLink} target="_blank" rel="noopener noreferrer" className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white"><Video className="h-4 w-4" /> {joinLabel(s.platform)}</a>
      ) : <p className="mt-2 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">Your instructor will add the {PLATFORM_LABEL[s.platform]} link here soon.</p>)}
    </div>
  );
}

export function MyLearning() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [qs] = useSearchParams();
  const [tab, setTab] = useState<Tab>(qs.get('tab') === 'live' ? 'live' : 'progress');
  const [bookings, setBookings] = useState<LiveApplication[] | null>(null);
  useEffect(() => { if (user) getMyBookings(user.id).then(setBookings).catch(() => setBookings([])); }, [user?.id]);
  // Back from Stripe: the webhook confirms the booking a moment later.
  useEffect(() => {
    if (!user || qs.get('paid') !== '1') return;
    toast.success('Payment received — confirming your booking…');
    waitForPayment(async () => {
      const list = await getMyBookings(user.id);
      setBookings(list);
      return !list.some(x => x.status === 'awaiting_payment');
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [enrolled, setEnrolled] = useState<EnrolledCourse[] | null>(null);
  const [saved, setSaved] = useState<Course[] | null>(null);
  const [trust, setTrust] = useState<Map<string, TrustLevel>>(new Map());

  useEffect(() => { if (user) getMyEnrollments(user.id).then(setEnrolled).catch(() => setEnrolled([])); }, [user?.id]);
  useEffect(() => {
    if (!user || tab !== 'saved' || saved !== null) return;
    getSavedCourses(user.id).then(async list => {
      setSaved(list);
      const ids = [...new Set(list.map(c => c.instructorId))];
      if (ids.length) setTrust(await getTrustLevelsBatch(ids));
    }).catch(() => setSaved([]));
  }, [tab, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return (
    <LearningPage>
      <PageTitle title="My learning" />
      <SignInPrompt message="Log in to see your courses, progress and saved courses." />
    </LearningPage>
  );

  const inProgress = enrolled?.filter(c => c.progressPercent < 100) ?? null;
  const completed = enrolled?.filter(c => c.progressPercent >= 100) ?? null;
  const list = tab === 'progress' ? inProgress : tab === 'completed' ? completed : null;

  return (
    <LearningPage>
      <PageTitle title="My learning" subtitle="Your courses and progress, on your FILMONS account." />

      <div data-pop className="mb-5 flex gap-2 overflow-x-auto no-scrollbar">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${tab === t.id ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'live' ? (
        bookings === null ? <ListSkeleton rows={3} /> : bookings.length === 0 ? (
          <EmptyState icon={<Radio className="h-9 w-9" />} title="No live sessions yet" body="Apply for a live session and your bookings will appear here." />
        ) : <div className="max-w-2xl space-y-3">{bookings.map(b => <LiveBookingRow key={b.id} b={b} userId={user.id} />)}</div>
      ) : tab === 'saved' ? (
        saved === null ? <ListSkeleton rows={4} /> : saved.length === 0 ? (
          <EmptyState icon={<Bookmark className="h-9 w-9" />} title="No saved courses"
            body="Tap the bookmark on any course to save it for later." />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {saved.map(c => <div key={c.id} data-pop><CourseCard course={c} trustLevel={trust.get(c.instructorId)} /></div>)}
          </div>
        )
      ) : list === null ? <ListSkeleton rows={4} /> : list.length === 0 ? (
        <div className="space-y-3">
          <EmptyState icon={<GraduationCap className="h-9 w-9" />}
            title={tab === 'progress' ? 'No courses in progress' : 'No completed courses yet'} />
          <div className="text-center">
            <button onClick={() => navigate('/explore')} className="text-sm font-bold text-blue-600 hover:underline">Explore courses</button>
          </div>
        </div>
      ) : (
        <div className="max-w-2xl space-y-3">{list.map(c => <EnrolledRow key={c.id} course={c} />)}</div>
      )}
    </LearningPage>
  );
}
