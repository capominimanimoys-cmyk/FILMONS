// FILMONS Learning -- /learning/my-learning. Two tabs: Enrolled (any
// account type) and My Courses (instructor-facing -- real data even for a
// Creator/Creator+ viewer with zero courses, since browsing this tab isn't
// gated, only actually publishing is).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Star, Users, MoreHorizontal } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getMyEnrollments, getCoursesByInstructor, setCourseStatus, publishCourse,
  type EnrolledCourse, type Course,
} from '../lib/coursesApi';
import { PostMoreMenu } from '../components/connect/PostMoreMenu';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';

type Tab = 'enrolled' | 'mine';

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-500' },
  published: { label: 'Published', className: 'bg-emerald-50 text-emerald-600' },
  archived: { label: 'Archived', className: 'bg-amber-50 text-amber-600' },
};

function EnrolledRow({ course }: { course: EnrolledCourse }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/learning/course/${course.id}`)} className="w-full flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-3 text-left">
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

function MyCourseRow({ course, onChanged }: { course: Course; onChanged: () => void }) {
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
      <button onClick={() => navigate(`/learning/course/${course.id}`)} className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
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
      <button onClick={() => navigate(`/learning/create?edit=${course.id}`)} className="shrink-0 px-3 py-1.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold">Edit</button>
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

export function MyLearning() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('enrolled');
  const [enrolled, setEnrolled] = useState<EnrolledCourse[] | null>(null);
  const [mine, setMine] = useState<Course[] | null>(null);

  const loadMine = () => { if (user) getCoursesByInstructor(user.id).then(setMine); };

  useEffect(() => { if (user) getMyEnrollments(user.id).then(setEnrolled); }, [user?.id]);
  useEffect(() => { if (tab === 'mine' && mine === null) loadMine(); }, [tab]); // eslint-disable-line

  if (!user) return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Sign in to see your Learning</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <p className="text-sm font-bold text-gray-900">My Learning</p>
      </div>

      <div className="flex px-4 pt-3 gap-2">
        {(['enrolled', 'mine'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full text-xs font-bold ${tab === t ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {t === 'enrolled' ? 'Enrolled' : 'My Courses'}
          </button>
        ))}
      </div>

      <div className="max-w-xl mx-auto px-4 py-4 space-y-3">
        {tab === 'mine' && (
          <button onClick={() => navigate('/learning/create')} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold">
            <Plus className="w-4 h-4" /> Create Course
          </button>
        )}

        {tab === 'enrolled' ? (
          enrolled === null ? (
            <div className="flex justify-center py-12"><FilmonsBrandLoader size="md" label="Loading" /></div>
          ) : enrolled.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm font-bold text-gray-600">No courses yet</p>
              <button onClick={() => navigate('/learning')} className="text-sm font-bold text-blue-600 mt-2">Browse Learning</button>
            </div>
          ) : enrolled.map(c => <EnrolledRow key={c.id} course={c} />)
        ) : mine === null ? (
          <div className="flex justify-center py-12"><FilmonsBrandLoader size="md" label="Loading" /></div>
        ) : mine.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-12">You haven't created any courses yet.</p>
        ) : mine.map(c => <MyCourseRow key={c.id} course={c} onChanged={loadMine} />)}
      </div>
    </div>
  );
}
