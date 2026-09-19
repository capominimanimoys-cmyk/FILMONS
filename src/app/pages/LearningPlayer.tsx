// FILMONS Learning -- /learning/course/:courseId/lesson/:lessonId. Full
// lesson viewing experience: video, lesson position ("Lesson 4 of 18"),
// Previous/Next, Mark complete, and the course-wide progress bar --
// completing a lesson here immediately recomputes overall progress (no
// separate "sync" step).
import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2, FileText, Image as ImageIcon, Link as LinkIcon, Download } from 'lucide-react';
import {
  getCourse, getCourseCurriculum, isEnrolled, getLessonProgressMap, setLessonComplete,
  type Course, type CourseLesson,
} from '../lib/coursesApi';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import { useAuth } from '../context/AuthContext';

export function LearningPlayer() {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [course, setCourse] = useState<Course | null | undefined>(undefined);
  const [lessons, setLessons] = useState<CourseLesson[]>([]);
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [allowed, setAllowed] = useState(false);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    (async () => {
      const c = await getCourse(courseId);
      if (cancelled) return;
      setCourse(c ?? null);
      if (!c) return;
      const isInstructor = user?.id === c.instructorId;
      const enrolled = user ? await isEnrolled(user.id, courseId) : false;
      if (cancelled) return;
      setAllowed(enrolled || isInstructor);
      if (!enrolled && !isInstructor) return;
      const sections = await getCourseCurriculum(courseId, { viewerIsEnrolled: enrolled, viewerIsInstructor: isInstructor });
      if (cancelled) return;
      setLessons(sections.flatMap(s => s.lessons));
      if (user) setProgress(await getLessonProgressMap(user.id, courseId));
    })();
    return () => { cancelled = true; };
  }, [courseId, user?.id]);

  const idx = lessons.findIndex(l => l.id === lessonId);
  const lesson = idx >= 0 ? lessons[idx] : undefined;
  const total = lessons.length;
  const completedCount = lessons.filter(l => progress[l.id]).length;
  const percent = total ? Math.round((completedCount / total) * 100) : 0;

  const goToLesson = useCallback((i: number) => {
    const target = lessons[i];
    if (target) navigate(`/learning/course/${courseId}/lesson/${target.id}`);
  }, [lessons, courseId, navigate]);

  const handleMarkComplete = async () => {
    if (!user || !lesson || !courseId) return;
    const next = !progress[lesson.id];
    setMarking(true);
    const ok = await setLessonComplete(user.id, courseId, lesson.id, next);
    setMarking(false);
    if (!ok) { toast.error('Could not update progress'); return; }
    setProgress(prev => ({ ...prev, [lesson.id]: next }));
    if (next && idx < total - 1) goToLesson(idx + 1);
  };

  if (course === undefined) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><FilmonsBrandLoader size="lg" label="Loading lesson" /></div>;
  }
  if (course === null) return <div className="min-h-screen bg-black flex items-center justify-center text-sm text-white/60">Course not found</div>;
  if (!allowed) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-bold text-white">Enroll to watch this lesson</p>
        <button onClick={() => navigate(`/learning/course/${courseId}`)} className="text-sm font-bold text-blue-400">Back to course</button>
      </div>
    );
  }
  if (!lesson) return <div className="min-h-screen bg-black flex items-center justify-center text-sm text-white/60">Lesson not found</div>;

  const completed = !!progress[lesson.id];

  return (
    <div className="min-h-screen bg-black flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <button onClick={() => navigate(`/learning/course/${courseId}`)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 shrink-0">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <p className="text-sm font-bold text-white truncate">{course?.title}</p>
      </div>

      {/* Media */}
      <div className="w-full bg-black flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
        {lesson.type === 'video' && lesson.videoUrl ? (
          <video key={lesson.id} src={lesson.videoUrl} poster={lesson.videoPosterUrl ?? undefined} controls autoPlay className="w-full h-full object-contain" />
        ) : lesson.type === 'image' && lesson.content ? (
          <img src={lesson.content} alt={lesson.title} className="max-w-full max-h-full object-contain" />
        ) : lesson.type === 'link' && lesson.content ? (
          <a href={lesson.content} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 text-white/70">
            <LinkIcon className="w-10 h-10" /> <span className="text-sm underline">Open link</span>
          </a>
        ) : lesson.type === 'pdf' || lesson.type === 'file' ? (
          <div className="flex flex-col items-center gap-2 text-white/70">
            {lesson.type === 'pdf' ? <FileText className="w-10 h-10" /> : <Download className="w-10 h-10" />}
            {lesson.content && <a href={lesson.content} target="_blank" rel="noreferrer" className="text-sm underline">Open file</a>}
          </div>
        ) : (
          <div className="text-white/40 text-sm px-6 text-center whitespace-pre-line">{lesson.content}</div>
        )}
      </div>

      {/* Info + controls */}
      <div className="flex-1 bg-white rounded-t-3xl -mt-4 px-5 pt-5 pb-6 flex flex-col">
        <p className="text-xs font-bold text-gray-400">Lesson {idx + 1} of {total}</p>
        <p className="text-lg font-black text-gray-900 mt-0.5">{lesson.title}</p>

        <div className="flex items-center gap-3 mt-4">
          <button onClick={() => goToLesson(idx - 1)} disabled={idx <= 0}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold disabled:opacity-40">
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <button onClick={() => goToLesson(idx + 1)} disabled={idx >= total - 1}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold disabled:opacity-40">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <button onClick={handleMarkComplete} disabled={marking}
          className={`mt-3 w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 ${completed ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-blue-600 text-white'}`}>
          <CheckCircle2 className="w-4 h-4" /> {completed ? 'Completed' : 'Mark complete'}
        </button>

        <div className="mt-5">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-bold text-gray-500">Course progress</p>
            <p className="text-xs font-bold text-gray-900">{percent}%</p>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
