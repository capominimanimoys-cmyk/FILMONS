// FILMONS Learning account pages, reached from the navigation drawer /
// sidebar (see LearningNav.tsx):
//   /notifications  -- the FILMONS notifications feed, Learning first
//   /profile        -- the learner's Learning profile + progress
//   /instructor     -- Instructor dashboard (Professional/Business only)
import { CourseCover } from '../components/courses/CourseCover';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  Bell, BookOpen, Bookmark, CheckCircle2, ExternalLink, GraduationCap, LayoutDashboard, LogOut, Plus, Radio, Star, Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import { useLearningSession } from '../context/LearningSessionContext';
import { useLearningTransition } from '../context/LearningTransitionContext';
import { notificationTitle } from '../lib/notifications';
import { canCreateCourses, getCoursesByInstructor, getMyEnrollments, getReviewsForInstructor, type Course, type EnrolledCourse, type InstructorReview } from '../lib/coursesApi';
import { getSavedCourses } from '../lib/topicsApi';
import { getDisplayIdentity } from '../lib/displayIdentity';
import { UserAvatar } from '../components/AccountTypeBadge';
import { CreateTypeChooser, type CreateType } from '../components/learning/CreateTypeChooser';
import { getLiveSessionsByInstructor, type LiveSession } from '../lib/liveSessionsApi';
import { MyCourseRow } from './MyLearning';
import type { Notification } from '../types';
import {
  EmptyState, LearningPage, ListSkeleton, PageTitle, SectionTitle, SignInPrompt, plural, timeAgo,
} from '../components/learning/LearningPageParts';

// ── Notifications ───────────────────────────────────────────────────────
const LEARNING_TYPES = new Set(['course_published']);

export function LearningNotifications() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { leaveLearning } = useLearningTransition();
  const { notifications, loading, markRead, markAllRead, unreadCount } = useNotifications();
  const [filter, setFilter] = useState<'learning' | 'all'>('learning');

  const list = useMemo(
    () => filter === 'learning' ? notifications.filter(n => LEARNING_TYPES.has(n.type)) : notifications,
    [notifications, filter],
  );

  if (!user) return (
    <LearningPage>
      <PageTitle title="Notifications" />
      <SignInPrompt message="Log in to see notifications about courses and instructors you follow." />
    </LearningPage>
  );

  const open = (n: Notification) => {
    if (!n.read) markRead(n.id);
    // course_published carries the course id in the generic postId field
    // (see Notifications.tsx); everything else lives on FILMONS itself.
    if (n.type === 'course_published' && n.postId) navigate(`/course/${n.postId}`);
    else leaveLearning('/notifications');
  };

  return (
    <LearningPage>
      <PageTitle title="Notifications"
        action={unreadCount > 0 ? (
          <button onClick={markAllRead} className="shrink-0 pt-1.5 text-xs font-bold text-blue-600 hover:underline">Mark all read</button>
        ) : undefined} />

      <div data-pop className="mb-5 flex gap-2">
        {([['learning', 'Learning'], ['all', 'All FILMONS']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`rounded-full px-4 py-2 text-xs font-bold ${filter === id ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-600'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading && !notifications.length ? <ListSkeleton rows={5} /> : list.length === 0 ? (
        <EmptyState icon={<Bell className="h-9 w-9" />} title="You're all caught up"
          body={filter === 'learning' ? 'New courses from instructors you follow will show up here.' : undefined} />
      ) : (
        <div className="max-w-2xl space-y-2">
          {list.map(n => {
            const isCourse = n.type === 'course_published';
            const title = isCourse
              ? `${n.fromUserName || 'An instructor'} published a new course${n.postContent ? `: "${n.postContent}"` : ''}`
              : notificationTitle(n.type, n.fromUserName || 'Someone', { listingTitle: n.listingTitle });
            return (
              <button key={n.id} data-pop onClick={() => open(n)}
                className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${n.read ? 'border-gray-100 bg-white hover:bg-gray-50' : 'border-blue-100 bg-blue-50/50 hover:bg-blue-50'}`}>
                {n.fromUserAvatar || n.fromUserName
                  ? <UserAvatar user={{ id: n.fromUserId, name: n.fromUserName || '', avatar: n.fromUserAvatar }} size={36} />
                  : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600"><Bell className="h-4 w-4 text-white" /></span>}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug text-gray-900">{title}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
                    {isCourse && <GraduationCap className="h-3.5 w-3.5 text-blue-600" />}
                    {timeAgo(n.createdAt)}
                    {!isCourse && <><span>·</span><ExternalLink className="h-3 w-3" /> FILMONS</>}
                  </span>
                </span>
                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />}
              </button>
            );
          })}
        </div>
      )}
    </LearningPage>
  );
}

// ── Profile ─────────────────────────────────────────────────────────────
export function LearningProfile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { endLearningSession } = useLearningSession();
  const { leaveLearning } = useLearningTransition();
  const [enrolled, setEnrolled] = useState<EnrolledCourse[] | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    getMyEnrollments(user.id).then(setEnrolled).catch(() => setEnrolled([]));
    getSavedCourses(user.id).then(s => setSavedCount(s.length)).catch(() => setSavedCount(0));
  }, [user?.id]);

  if (!user) return (
    <LearningPage>
      <PageTitle title="Profile" />
      <SignInPrompt message="Log in to see your Learning profile and progress." />
    </LearningPage>
  );

  const identity = getDisplayIdentity({ accountType: user.accountType, primaryRole: user.primaryRole, businessIndustry: (user as any).businessIndustry });
  const completed = enrolled?.filter(c => c.progressPercent >= 100).length;
  const inProgress = enrolled?.filter(c => c.progressPercent > 0 && c.progressPercent < 100) ?? [];
  const stats = [
    { label: 'Enrolled', value: enrolled?.length, icon: BookOpen, to: '/my-learning' },
    { label: 'Completed', value: completed, icon: CheckCircle2, to: '/my-learning' },
    { label: 'Saved', value: savedCount, icon: Bookmark, to: '/my-learning' },
  ];

  return (
    <LearningPage>
      <div data-pop className="mb-6 flex items-center gap-4 rounded-3xl border border-gray-100 bg-white p-5">
        <UserAvatar user={{ id: user.id, name: user.name, avatar: user.avatar }} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-black text-gray-900">{user.name}</h1>
          {identity && <p className="truncate text-sm text-gray-500">{identity}</p>}
          {user.username && <p className="truncate text-xs text-gray-400">@{user.username}</p>}
        </div>
      </div>

      <div className="mb-8 grid grid-cols-3 gap-3">
        {stats.map(s => (
          <button key={s.label} data-pop onClick={() => navigate(s.to)} className="rounded-2xl border border-gray-100 bg-white p-4 text-left hover:bg-gray-50">
            <s.icon className="h-4 w-4 text-blue-600" />
            <p className="mt-2 text-xl font-black text-gray-900">{s.value ?? '–'}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </button>
        ))}
      </div>

      {inProgress.length > 0 && (
        <section className="mb-8">
          <SectionTitle title="Continue learning" onViewAll={() => navigate('/my-learning')} />
          <div className="space-y-2">
            {inProgress.slice(0, 3).map(c => (
              <button key={c.id} data-pop onClick={() => navigate(`/course/${c.id}`)} className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 text-left">
                <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                  <CourseCover imageUrl={c.coverUrl} videoUrl={c.coverVideoUrl} play={false} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-gray-900">{c.title}</span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-blue-600" style={{ width: `${c.progressPercent}%` }} /></span>
                    <span className="text-[10px] font-bold text-gray-400">{c.progressPercent}%</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-2">
        {canCreateCourses(user.accountType) && (
          <button data-pop onClick={() => navigate('/instructor')} className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm font-bold text-gray-800 hover:bg-gray-50">
            <LayoutDashboard className="h-5 w-5 text-gray-500" /> Instructor dashboard
          </button>
        )}
        <button data-pop onClick={() => leaveLearning('/profile')} className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm font-bold text-gray-800 hover:bg-gray-50">
          <ExternalLink className="h-5 w-5 text-gray-500" /> View FILMONS profile
        </button>
        <button data-pop onClick={() => { endLearningSession(); navigate('/', { replace: true }); }}
          className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50">
          <LogOut className="h-5 w-5" /> Log out of Learning
        </button>
      </div>
    </LearningPage>
  );
}

// ── Instructor dashboard ────────────────────────────────────────────────
export function InstructorDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [reviews, setReviews] = useState<InstructorReview[] | null>(null);
  const [chooser, setChooser] = useState(false);
  const [live, setLive] = useState<LiveSession[]>([]);
  useEffect(() => { if (user) getLiveSessionsByInstructor(user.id).then(setLive).catch(() => {}); }, [user?.id]);
  const onCreateType = (t: CreateType) => {
    setChooser(false);
    navigate(t === 'live' ? '/create/live' : '/create');
  };
  const load = () => { if (user) getCoursesByInstructor(user.id).then(setCourses).catch(() => setCourses([])); };
  useEffect(load, [user?.id]);
  useEffect(() => { if (user) getReviewsForInstructor(user.id).then(setReviews).catch(() => setReviews([])); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return (
    <LearningPage>
      <PageTitle title="Instructor dashboard" />
      <SignInPrompt message="Log in to manage your courses." />
    </LearningPage>
  );
  if (!canCreateCourses(user.accountType)) return (
    <LearningPage>
      <PageTitle title="Instructor dashboard" />
      <EmptyState icon={<LayoutDashboard className="h-9 w-9" />} title="For Professional and Business accounts"
        body="Upgrade your FILMONS account to Professional or Business to create and sell courses." />
    </LearningPage>
  );

  const published = courses?.filter(c => c.status === 'published') ?? [];
  const students = published.reduce((n, c) => n + c.studentCount, 0);
  const rated = published.filter(c => c.ratingCount > 0);
  const avgRating = rated.length ? rated.reduce((n, c) => n + c.ratingAvg * c.ratingCount, 0) / rated.reduce((n, c) => n + c.ratingCount, 0) : null;

  return (
    <LearningPage>
      <PageTitle title="Instructor dashboard" subtitle="Create courses and track how they're doing."
        action={(
          <button onClick={() => setChooser(true)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Create course</span><span className="sm:hidden">New</span>
          </button>
        )} />

      <div className="mb-8 grid grid-cols-3 gap-3">
        {[
          { label: 'Published', value: courses ? published.length : null, icon: BookOpen },
          { label: 'Students', value: courses ? students.toLocaleString() : null, icon: Users },
          { label: 'Avg rating', value: courses ? (avgRating ? avgRating.toFixed(1) : '–') : null, icon: Star },
        ].map(s => (
          <div key={s.label} data-pop className="rounded-2xl border border-gray-100 bg-white p-4">
            <s.icon className="h-4 w-4 text-blue-600" />
            <p className="mt-2 text-xl font-black text-gray-900">{s.value ?? '–'}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      <SectionTitle title="Your courses" subtitle={courses ? plural(courses.length, 'course') : undefined} />
      {courses === null ? <ListSkeleton rows={3} /> : courses.length === 0 ? (
        <EmptyState icon={<GraduationCap className="h-9 w-9" />} title="No courses yet"
          body="Turn your experience into a course creators can learn from." />
      ) : (
        <div className="max-w-2xl space-y-3">{courses.map(c => <MyCourseRow key={c.id} course={c} onChanged={load} />)}</div>
      )}

      {live.length > 0 && (
        <div className="mt-10">
          <SectionTitle title="Live sessions" subtitle={plural(live.length, 'session')} />
          <div className="max-w-2xl space-y-2">
            {live.map(l => (
              <button key={l.id} data-pop onClick={() => navigate(`/instructor/live/${l.id}`)} className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 text-left hover:bg-gray-50">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100">{l.coverUrl ? <img src={l.coverUrl} alt="" className="h-full w-full object-cover" /> : <Radio className="h-5 w-5 text-gray-400" />}</div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-gray-900">{l.title}</p><p className="text-xs text-gray-400">{l.status === 'published' ? 'Published' : 'Unpublished'} · {l.isFree ? 'Free' : `${l.currency} ${l.price.toFixed(2)}`}</p></div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10">
        <SectionTitle title="Recent reviews" subtitle="What students are saying about your courses" />
        {reviews === null ? <ListSkeleton rows={2} /> : reviews.length === 0 ? (
          <EmptyState icon={<Star className="h-9 w-9" />} title="No reviews yet" body="Reviews from your students will show up here." />
        ) : (
          <ul className="max-w-2xl space-y-2">
            {reviews.map(r => (
              <li key={r.id} data-pop>
                <button onClick={() => navigate(`/instructor/course/${r.courseId}`)} className="w-full rounded-2xl border border-gray-100 bg-white p-3.5 text-left hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <UserAvatar user={{ id: r.userId, name: r.author?.name || '', avatar: r.author?.avatarUrl ?? undefined }} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-gray-900">{r.author?.name ?? 'Filmons student'}</p>
                      <p className="truncate text-xs text-gray-400">{r.courseTitle} · {timeAgo(r.createdAt)}</p>
                    </div>
                    <span className="flex items-center gap-0.5">{Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />)}</span>
                  </div>
                  {r.body && <p className="mt-2 text-sm leading-relaxed text-gray-600">{r.body}</p>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {chooser && <CreateTypeChooser onClose={() => setChooser(false)} onSelect={onCreateType} />}
    </LearningPage>
  );
}
