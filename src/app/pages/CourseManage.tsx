// FILMONS Learning -- course management (/instructor/course/:courseId):
// View course, Edit course, Students, Earnings, plus publishing state.
// Statuses: Draft, Published, Unpublished (unpublished = gone from
// discovery and new purchases; existing students keep access).
import { CourseCover } from '../components/courses/CourseCover';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Award, CheckCircle2, ExternalLink, Eye, Loader2, MoreHorizontal, Pencil, RotateCcw, Share2, Sparkles, Star, Users, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getCourse, getCourseReviews, type Course, type CourseReview } from '../lib/coursesApi';
import { builderApi, type CourseEarnings, type CourseStudent } from '../lib/courseBuilder';
import { UserAvatar } from '../components/AccountTypeBadge';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import { PostMoreMenu } from '../components/connect/PostMoreMenu';
import { ConfirmDialog } from '../components/learning/builder/BuilderUI';
import { EmptyState, LearningPage, SignInPrompt, plural, timeAgo } from '../components/learning/LearningPageParts';

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-600' },
  published: { label: 'Published', cls: 'bg-emerald-50 text-emerald-700' },
  unpublished: { label: 'Unpublished', cls: 'bg-amber-50 text-amber-700' },
  archived: { label: 'Unpublished', cls: 'bg-amber-50 text-amber-700' },
};
type Tab = 'students' | 'reviews' | 'earnings';

export function CourseManage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const justPublished = params.get('published') === '1';
  const [course, setCourse] = useState<(Course & { hasDraftChanges?: boolean }) | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('students');
  const [confirm, setConfirm] = useState<'unpublish' | 'discard' | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    if (!courseId || !user) return;
    const c = await getCourse(courseId);
    if (!c || c.instructorId !== user.id) { setCourse(null); return; }
    const draft = await builderApi.load(courseId, user.id).catch(() => null);
    setCourse({ ...c, status: (draft?.course.status ?? c.status) as any, hasDraftChanges: !!draft?.course.hasDraftChanges });
  }, [courseId, user]);
  useEffect(() => { load(); }, [load]);

  if (!user) return <LearningPage><SignInPrompt message="Log in to manage your course." /></LearningPage>;
  if (course === undefined) return <FilmonsBrandLoader size="lg" label="Loading course" className="py-32" />;
  if (course === null) return <LearningPage><EmptyState icon={<Eye className="h-9 w-9" />} title="Course not found" body="It may have been deleted, or it belongs to another instructor." /></LearningPage>;

  const status = STATUS[course.status] ?? STATUS.draft;
  const setStatus = async (next: 'published' | 'unpublished') => {
    setBusy(true);
    try {
      await builderApi.setStatus(course.id, user.id, next);
      toast.success(next === 'published' ? 'Course published again' : 'Course unpublished');
      await load();
    } catch (e: any) { toast.error(e?.message || 'Could not update the course'); }
    setBusy(false);
    setConfirm(null);
  };
  const discard = async () => {
    setBusy(true);
    try { await builderApi.discard(course.id, user.id); toast.success('Draft changes discarded'); await load(); }
    catch (e: any) { toast.error(e?.message || 'Could not discard changes'); }
    setBusy(false);
    setConfirm(null);
  };

  return (
    <LearningPage>
      {justPublished && course.status === 'published' && (
        <div data-pop className="mb-4 flex items-center gap-3 rounded-2xl bg-emerald-50 p-4">
          <Sparkles className="h-5 w-5 shrink-0 text-emerald-600" />
          <p className="text-sm font-bold text-emerald-900">Your course is published. It can now appear in search, recommendations and topic pages.</p>
        </div>
      )}

      <div data-pop className="relative flex flex-col gap-4 rounded-3xl border border-gray-100 bg-white p-4 sm:static sm:flex-row sm:items-center sm:p-5">
        <div className="aspect-video w-full shrink-0 overflow-hidden rounded-2xl bg-gray-100 sm:w-44">
          <CourseCover imageUrl={course.coverUrl} videoUrl={course.coverVideoUrl} play={false} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${status.cls}`}>{status.label}</span>
            {course.hasDraftChanges && <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-black text-blue-700">Unpublished changes</span>}
          </div>
          <h1 className="mt-1.5 truncate text-xl font-black text-gray-900">{course.title}</h1>
          <p className="mt-0.5 text-xs text-gray-500">
            {plural(course.studentCount, 'student')} · {course.isFree ? 'Free' : `${course.currency} ${course.price.toFixed(2)}`}
            {course.publishedAt ? ` · published ${timeAgo(course.publishedAt)}` : ''}
          </p>
        </div>
        <button onClick={() => setMenuOpen(true)} aria-label="Course options" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 sm:static sm:shrink-0"><MoreHorizontal className="h-4 w-4" /></button>
        {menuOpen && (
          <PostMoreMenu onClose={() => setMenuOpen(false)} actions={[
            { icon: Eye, label: 'View course', onClick: () => { setMenuOpen(false); navigate(`/course/${course.id}`); } },
            { icon: Pencil, label: 'Edit course', onClick: () => { setMenuOpen(false); navigate(`/instructor/course/${course.id}/edit?step=1`); } },
            { icon: Share2, label: 'Share course', onClick: () => { setMenuOpen(false); navigate(`/course/${course.id}/share-card`); } },
          ]} />
        )}
      </div>

      <div data-pop className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <button onClick={() => navigate(`/course/${course.id}`)} className="flex items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white py-3 text-sm font-bold text-gray-800 hover:bg-gray-50"><Eye className="h-4 w-4" /> View course</button>
        <button onClick={() => navigate(`/instructor/course/${course.id}/edit?step=1`)} className="flex items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white py-3 text-sm font-bold text-gray-800 hover:bg-gray-50"><Pencil className="h-4 w-4" /> Edit course</button>
        <button onClick={() => setTab('students')} aria-pressed={tab === 'students'} className={`flex items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-bold ${tab === 'students' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-100 bg-white text-gray-800 hover:bg-gray-50'}`}><Users className="h-4 w-4" /> Students</button>
        <button onClick={() => setTab('reviews')} aria-pressed={tab === 'reviews'} className={`flex items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-bold ${tab === 'reviews' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-100 bg-white text-gray-800 hover:bg-gray-50'}`}><Star className="h-4 w-4" /> Reviews</button>
        <button onClick={() => setTab('earnings')} aria-pressed={tab === 'earnings'} className={`flex items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-bold ${tab === 'earnings' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-100 bg-white text-gray-800 hover:bg-gray-50'}`}><Wallet className="h-4 w-4" /> Earnings</button>
      </div>

      <div data-pop className="mt-3 flex flex-wrap gap-2 text-sm">
        {course.status === 'draft' && <button onClick={() => navigate(`/instructor/course/${course.id}/edit?step=8`)} className="rounded-xl bg-blue-600 px-4 py-2 font-black text-white hover:bg-blue-700">Continue to publish</button>}
        {course.hasDraftChanges && course.status !== 'draft' && (
          <>
            <button onClick={() => navigate(`/instructor/course/${course.id}/edit?step=8`)} className="rounded-xl bg-blue-600 px-4 py-2 font-black text-white hover:bg-blue-700">Publish changes</button>
            <button onClick={() => setConfirm('discard')} className="rounded-xl px-4 py-2 font-bold text-gray-600 hover:bg-gray-100">Discard draft changes</button>
          </>
        )}
        {course.status === 'published' && <button onClick={() => setConfirm('unpublish')} disabled={busy} className="rounded-xl px-4 py-2 font-bold text-amber-700 hover:bg-amber-50">Unpublish</button>}
        {((course.status as string) === 'unpublished' || (course.status as string) === 'archived') && <button onClick={() => setStatus('published')} disabled={busy} className="rounded-xl bg-blue-600 px-4 py-2 font-black text-white hover:bg-blue-700">Publish again</button>}
      </div>

      <div className="mt-6">
        {tab === 'students' ? <StudentsTab courseId={course.id} instructorId={user.id} /> : tab === 'reviews' ? <ReviewsTab course={course} /> : <EarningsTab courseId={course.id} instructorId={user.id} />}
      </div>

      {confirm === 'unpublish' && (
        <ConfirmDialog title="Unpublish this course?" confirmLabel="Unpublish" busy={busy}
          body="It will disappear from search, recommendations and topic pages, and nobody new can enroll or buy it. Students who already have it keep full access."
          onCancel={() => setConfirm(null)} onConfirm={() => setStatus('unpublished')} />
      )}
      {confirm === 'discard' && (
        <ConfirmDialog title="Discard draft changes?" confirmLabel="Discard" destructive busy={busy}
          body="Your unpublished edits will be deleted and the builder will show the published version again."
          onCancel={() => setConfirm(null)} onConfirm={discard} />
      )}
    </LearningPage>
  );
}

function StudentsTab({ courseId, instructorId }: { courseId: string; instructorId: string }) {
  const [students, setStudents] = useState<CourseStudent[] | null>(null);
  const [error, setError] = useState(false);
  const [granting, setGranting] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(false);
    builderApi.students(courseId, instructorId).then(r => setStudents(r.students)).catch(() => setError(true));
  }, [courseId, instructorId]);
  useEffect(load, [load]);

  const grant = async (s: CourseStudent, lessonId: string) => {
    setGranting(`${s.userId}:${lessonId}`);
    try { await builderApi.grantAttempt(courseId, instructorId, lessonId, s.userId); toast.success(`Extra attempt granted to ${s.name}`); load(); }
    catch (e: any) { toast.error(e?.message || 'Could not grant an attempt'); }
    setGranting(null);
  };

  if (error) return <Retry onRetry={load} message="Couldn't load students." />;
  if (!students) return <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-gray-100" />)}</div>;
  if (!students.length) return <EmptyState icon={<Users className="h-9 w-9" />} title="No students yet" body="Students appear here when they enroll." />;
  return (
    <ul className="space-y-2">
      {students.map(s => (
        <li key={s.userId} data-pop className="rounded-2xl border border-gray-100 bg-white p-3.5">
          <div className="flex items-center gap-3">
            <UserAvatar user={{ id: s.userId, name: s.name, avatar: s.avatar ?? undefined }} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-gray-900">{s.name}</p>
              <p className="text-xs text-gray-500">Enrolled {timeAgo(s.enrolledAt)}{s.status !== 'active' ? ` · ${s.status}` : ''}</p>
            </div>
            {s.complete ? (
              <span className="flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Completed</span>
            ) : (
              <span className="text-xs font-bold text-gray-500">{s.progressPercent}%</span>
            )}
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${s.progressPercent}%` }} /></div>
          {s.certificateCode && <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500"><Award className="h-3.5 w-3.5 text-blue-600" /> Certificate {s.certificateCode}</p>}
          {s.exhaustedQuizzes.map(q => (
            <div key={q.lessonId} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs">
              <span className="min-w-0 flex-1 text-amber-900">Used all attempts on the required quiz <b>{q.title}</b></span>
              <button onClick={() => grant(s, q.lessonId)} disabled={granting === `${s.userId}:${q.lessonId}`} className="rounded-lg bg-white px-2.5 py-1 font-bold text-amber-900 border border-amber-200 disabled:opacity-50">Grant another attempt</button>
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}

function ReviewsTab({ course }: { course: Course }) {
  const [reviews, setReviews] = useState<CourseReview[] | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => { setError(false); getCourseReviews(course.id, 100).then(setReviews).catch(() => setError(true)); }, [course.id]);
  useEffect(load, [load]);
  if (error) return <Retry onRetry={load} message="Couldn't load reviews." />;
  if (!reviews) return <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-gray-100" />)}</div>;
  if (!reviews.length) return <EmptyState icon={<Star className="h-9 w-9" />} title="No reviews yet" body="Reviews from enrolled students appear here." />;
  const counts = [5, 4, 3, 2, 1].map(n => reviews.filter(r => r.rating === n).length);
  return (
    <div className="space-y-3">
      <div data-pop className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4">
        <div className="text-center">
          <p className="text-3xl font-black text-gray-900">{course.ratingAvg.toFixed(1)}</p>
          <p className="text-xs text-gray-400">{plural(course.ratingCount, 'review')}</p>
        </div>
        <div className="flex-1 space-y-1">
          {[5, 4, 3, 2, 1].map((n, i) => (
            <div key={n} className="flex items-center gap-2 text-[11px] text-gray-500">
              <span className="w-3">{n}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-amber-400" style={{ width: `${(counts[i] / reviews.length) * 100}%` }} /></div>
              <span className="w-5 text-right">{counts[i]}</span>
            </div>
          ))}
        </div>
      </div>
      <ul className="space-y-2">
        {reviews.map(r => (
          <li key={r.id} data-pop className="rounded-2xl border border-gray-100 bg-white p-3.5">
            <div className="flex items-center gap-3">
              <UserAvatar user={{ id: r.userId, name: r.author?.name || '', avatar: r.author?.avatarUrl ?? undefined }} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-gray-900">{r.author?.name ?? 'Filmons student'}</p>
                <p className="text-xs text-gray-400">{timeAgo(r.createdAt)}</p>
              </div>
              <span className="flex items-center gap-0.5">{Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />)}</span>
            </div>
            {r.body && <p className="mt-2 text-sm leading-relaxed text-gray-600">{r.body}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EarningsTab({ courseId, instructorId }: { courseId: string; instructorId: string }) {
  const [data, setData] = useState<CourseEarnings | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => { setError(false); builderApi.earnings(courseId, instructorId).then(setData).catch(() => setError(true)); }, [courseId, instructorId]);
  useEffect(load, [load]);
  if (error) return <Retry onRetry={load} message="Couldn't load earnings." />;
  if (!data) return <div className="h-28 animate-pulse rounded-2xl bg-gray-100" />;
  const money = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: data.currency }).format(n);
  if (data.isFree && !data.sales) return <EmptyState icon={<Wallet className="h-9 w-9" />} title="This course is free" body="Earnings appear here for paid courses." />;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Sales', String(data.sales)], ['Gross', money(data.gross)], [`Fees (${data.platformFeeBps / 100}%)`, money(data.fees)], ['Your earnings', money(data.net)]].map(([k, v]) => (
          <div key={k} data-pop className="rounded-2xl border border-gray-100 bg-white p-4"><p className="text-xs text-gray-400">{k}</p><p className="mt-1 text-lg font-black text-gray-900">{v}</p></div>
        ))}
      </div>
      {data.refunds > 0 && <p className="text-xs text-gray-500">{plural(data.refunds, 'refund')}</p>}
      {!data.sales && <p className="rounded-2xl border border-dashed border-gray-200 p-5 text-center text-sm text-gray-500">No sales yet.</p>}
      <p className="flex items-center gap-1.5 text-xs text-gray-500"><ExternalLink className="h-3.5 w-3.5" /> Payouts are handled in your FILMONS wallet.</p>
    </div>
  );
}

function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-center text-sm">
      <p className="font-bold text-red-700">{message}</p>
      <button onClick={onRetry} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-gray-800 border border-gray-200"><RotateCcw className="h-3.5 w-3.5" /> Retry</button>
    </div>
  );
}
