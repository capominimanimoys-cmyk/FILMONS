// FILMONS Learning -- /learning/my-learning. The learner's own courses:
// In progress / Completed / Saved. Instructor-side course management
// lives on the Instructor dashboard (see InstructorDashboard.tsx), which
// reuses MyCourseRow from here.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Bookmark, GraduationCap, Star, Users, MoreHorizontal } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getMyEnrollments, setCourseStatus, publishCourse,
  type EnrolledCourse, type Course,
} from '../lib/coursesApi';
import { getSavedCourses } from '../lib/topicsApi';
import { getTrustLevelsBatch, type TrustLevel } from '../lib/trustApi';
import { CourseCard } from '../components/courses/CourseCard';
import { EmptyState, LearningPage, ListSkeleton, PageTitle, SignInPrompt } from '../components/learning/LearningPageParts';
import { PostMoreMenu } from '../components/connect/PostMoreMenu';

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-500' },
  published: { label: 'Published', className: 'bg-emerald-50 text-emerald-600' },
  archived: { label: 'Archived', className: 'bg-amber-50 text-amber-600' },
};

function EnrolledRow({ course }: { course: EnrolledCourse }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/course/${course.id}`)} className="w-full flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-3 text-left">
      <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
        {course.coverUrl ? <img src={course.coverUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl">🎬</div>}
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
  );
}

export function MyCourseRow({ course, onChanged }: { course: Course; onChanged: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const status = STATUS_LABEL[course.status] ?? STATUS_LABEL.draft;

  const handlePublish = async () => {
    if (!user) return;
    const ok = await publishCourse(course.id, user.id);
    if (ok) { toast.success('Published'); onChanged(); } else toast.error('Could not publish');
  };
  const handleUnpublish = async () => {
    if (!user) return;
    const ok = await setCourseStatus(course.id, user.id, 'draft');
    if (ok) { toast.success('Moved back to draft'); onChanged(); } else toast.error('Could not update');
  };

  return (
    <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-3">
      <button onClick={() => navigate(`/course/${course.id}`)} className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
        {course.coverUrl ? <img src={course.coverUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl">🎬</div>}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 truncate">{course.title}</p>
        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${status.className}`}>{status.label}</span>
        <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-1.5">
          {course.studentCount > 0 && <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {course.studentCount} students</span>}
          {course.ratingCount > 0 && <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-400 fill-amber-400" /> {course.ratingAvg.toFixed(1)}</span>}
        </div>
      </div>
      <button onClick={() => navigate(`/create?edit=${course.id}`)} className="shrink-0 px-3 py-1.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold">Edit</button>
      <button onClick={() => setMenuOpen(true)} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {menuOpen && (
        <PostMoreMenu
          onClose={() => setMenuOpen(false)}
          actions={course.status === 'published'
            ? [{ icon: Star, label: 'Move to draft', onClick: () => { setMenuOpen(false); handleUnpublish(); } }]
            : [{ icon: Star, label: 'Publish', onClick: () => { setMenuOpen(false); handlePublish(); } }]}
        />
      )}
    </div>
  );
}

type Tab = 'progress' | 'completed' | 'saved';
const TABS: { id: Tab; label: string }[] = [
  { id: 'progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'saved', label: 'Saved' },
];

export function MyLearning() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('progress');
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

      <div className="mb-5 flex gap-2 overflow-x-auto no-scrollbar">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${tab === t.id ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'saved' ? (
        saved === null ? <ListSkeleton rows={4} /> : saved.length === 0 ? (
          <EmptyState icon={<Bookmark className="h-9 w-9" />} title="No saved courses"
            body="Tap the bookmark on any course to save it for later." />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {saved.map(c => <CourseCard key={c.id} course={c} trustLevel={trust.get(c.instructorId)} />)}
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
