// FILMONS Learning -- /learning/course/:courseId/content. A flat lesson
// checklist (not the accordion-by-section view CourseDetail itself uses)
// -- ✓ completed / ▶ current / ○ not started, per spec.
import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { ArrowLeft, CheckCircle2, PlayCircle, Circle } from 'lucide-react';
import { getCourse, getCourseCurriculum, isEnrolled, getLessonProgressMap, type Course, type CourseSection } from '../lib/coursesApi';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import { useAuth } from '../context/AuthContext';

function formatDuration(totalSeconds: number | null): string {
  if (!totalSeconds) return '';
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function CourseContent() {
  const { courseId } = useParams();
  const { lessonId: currentLessonId } = (useLocation().state as { lessonId?: string }) ?? {};
  const navigate = useNavigate();
  const { user } = useAuth();
  const [course, setCourse] = useState<Course | null | undefined>(undefined);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    getCourse(courseId).then(async c => {
      setCourse(c ?? null);
      if (!c) return;
      const isInstructor = user?.id === c.instructorId;
      const enrolled = user ? await isEnrolled(user.id, courseId) : false;
      setAllowed(enrolled || isInstructor);
      setSections(await getCourseCurriculum(courseId, { viewerIsEnrolled: enrolled, viewerIsInstructor: isInstructor }));
      if (enrolled && user) setProgress(await getLessonProgressMap(user.id, courseId));
    });
  }, [courseId, user?.id]);

  if (course === undefined) return <div className="min-h-screen flex items-center justify-center"><FilmonsBrandLoader size="lg" label="Loading" /></div>;
  if (course === null) return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Course not found</div>;

  const allLessons = sections.flatMap(s => s.lessons);
  const firstIncomplete = allLessons.find(l => !progress[l.id]);

  return (
    <div className="min-h-screen bg-white pb-24">
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <p className="text-sm font-bold text-gray-900 truncate">Course Content</p>
      </div>

      <div className="lg:max-w-2xl lg:mx-auto">
        {!allowed ? (
          <p className="text-center text-sm text-gray-400 py-16 px-6">Enroll in this course to unlock the full lesson list.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {sections.map(s => (
              <div key={s.id}>
                <p className="text-xs font-black text-gray-400 uppercase tracking-wide px-4 pt-4 pb-1">{s.title}</p>
                {s.lessons.map((l, i) => {
                  const completed = !!progress[l.id];
                  const isCurrent = currentLessonId ? l.id === currentLessonId : (!completed && l.id === firstIncomplete?.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() => navigate(`/course/${courseId}/lesson/${l.id}`)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                    >
                      {completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      ) : isCurrent ? (
                        <PlayCircle className="w-5 h-5 text-blue-600 shrink-0" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-300 shrink-0" />
                      )}
                      <p className={`flex-1 min-w-0 text-sm truncate ${isCurrent ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                        {i + 1}. {l.title}
                      </p>
                      {l.durationSeconds ? <span className="text-xs text-gray-400 shrink-0">{formatDuration(l.durationSeconds)}</span> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
