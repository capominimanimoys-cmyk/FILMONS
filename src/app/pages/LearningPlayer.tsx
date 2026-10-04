// FILMONS Learning -- /learning/course/:courseId/lesson/:lessonId. Full
// lesson viewing experience: video, lesson position ("Lesson 4 of 18"),
// Previous/Next, Mark complete, and the course-wide progress bar --
// completing a lesson here immediately recomputes overall progress (no
// separate "sync" step). Focus mode: LearningLayout hides the header,
// drawer and sidebar here, leaving a back button and a Lessons button that
// opens the course's lesson list in a bottom sheet.
import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2, Circle, FileText, Link as LinkIcon, Download, ListVideo, PlayCircle } from 'lucide-react';
import {
  getCourse, getCourseCurriculum, isEnrolled, getLessonProgressMap, setLessonComplete,
  type Course, type CourseSection,
} from '../lib/coursesApi';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import { BottomSheet } from '../components/BottomSheet';

function formatDuration(totalSeconds: number | null): string {
  if (!totalSeconds) return '';
  const m = Math.floor(totalSeconds / 60);
  return `${m}:${String(totalSeconds % 60).padStart(2, '0')}`;
}
import { useAuth } from '../context/AuthContext';

export function LearningPlayer() {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [course, setCourse] = useState<Course | null | undefined>(undefined);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [showLessons, setShowLessons] = useState(false);
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
      setSections(sections);
      if (user) setProgress(await getLessonProgressMap(user.id, courseId));
    })();
    return () => { cancelled = true; };
  }, [courseId, user?.id]);

  const lessons = sections.flatMap(sec => sec.lessons);
  const idx = lessons.findIndex(l => l.id === lessonId);
  const lesson = idx >= 0 ? lessons[idx] : undefined;
  const total = lessons.length;
  const completedCount = lessons.filter(l => progress[l.id]).length;
  const percent = total ? Math.round((completedCount / total) * 100) : 0;

  const goToLesson = useCallback((i: number) => {
    const target = lessons[i];
    if (target) navigate(`/course/${courseId}/lesson/${target.id}`, { replace: true });
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
        <button onClick={() => navigate(`/course/${courseId}`)} className="text-sm font-bold text-blue-400">Back to course</button>
      </div>
    );
  }
  if (!lesson) return <div className="min-h-screen bg-black flex items-center justify-center text-sm text-white/60">Lesson not found</div>;

  const completed = !!progress[lesson.id];
  const isText = lesson.type === 'text';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Slim bar: back + Lessons -- nothing else competes with the lesson */}
      <div className="sticky top-0 z-20 bg-black flex items-center gap-2 px-3 py-2.5" style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
        <button onClick={() => navigate(`/course/${courseId}`)} aria-label="Back to course"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 shrink-0">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-white/90">{course.title}</p>
        <button onClick={() => setShowLessons(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/20">
          <ListVideo className="w-4 h-4" /> Lessons
          <span className="text-white/50">{idx + 1}/{total}</span>
        </button>
      </div>

      {/* Media */}
      {!isText && (
        <div className="w-full bg-black">
          <div className="mx-auto w-full max-w-5xl flex items-center justify-center" style={{ aspectRatio: '16/9', maxHeight: '75vh' }}>
            {lesson.type === 'video' && lesson.videoUrl ? (
              <video key={lesson.id} src={lesson.videoUrl} poster={lesson.videoPosterUrl ?? undefined} controls autoPlay playsInline className="w-full h-full object-contain" />
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
              <p className="text-white/40 text-sm">This lesson has no media.</p>
            )}
          </div>
        </div>
      )}

      {/* Lesson content + controls */}
      <div className="flex-1 mx-auto w-full max-w-3xl px-5 pt-5 pb-8">
        <p className="text-xs font-bold text-gray-400">Lesson {idx + 1} of {total}</p>
        <h1 className="text-xl font-black text-gray-900 mt-0.5 leading-snug">{lesson.title}</h1>

        {isText && lesson.content && (
          <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-5 text-[15px] leading-relaxed text-gray-800 whitespace-pre-line">{lesson.content}</div>
        )}

        <button onClick={handleMarkComplete} disabled={marking}
          className={`mt-5 w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 ${completed ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-blue-600 text-white'}`}>
          <CheckCircle2 className="w-4 h-4" /> {completed ? 'Completed' : 'Mark complete'}
        </button>

        <div className="flex items-center gap-3 mt-3">
          <button onClick={() => goToLesson(idx - 1)} disabled={idx <= 0}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-bold disabled:opacity-40">
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <button onClick={() => goToLesson(idx + 1)} disabled={idx >= total - 1}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-bold disabled:opacity-40">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-bold text-gray-500">Course progress</p>
            <p className="text-xs font-bold text-gray-900">{percent}%</p>
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      {showLessons && (
        <BottomSheet title={`Lessons · ${completedCount}/${total} complete`} onClose={() => setShowLessons(false)} maxHeightVh={80}>
          <div className="px-4 pb-6 space-y-5">
            {sections.map(sec => (
              <div key={sec.id}>
                <p className="px-1 pb-2 text-xs font-black uppercase tracking-wide text-gray-400">{sec.title}</p>
                <div className="space-y-1">
                  {sec.lessons.map(l => {
                    const n = lessons.findIndex(x => x.id === l.id);
                    const current = l.id === lesson.id;
                    const done = !!progress[l.id];
                    return (
                      <button key={l.id} onClick={() => { setShowLessons(false); if (!current) goToLesson(n); }}
                        aria-current={current ? 'true' : undefined}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${current ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                        {done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                          : current ? <PlayCircle className="h-5 w-5 shrink-0 text-blue-600" />
                          : <Circle className="h-5 w-5 shrink-0 text-gray-300" />}
                        <span className={`min-w-0 flex-1 truncate text-sm ${current ? 'font-black text-blue-600' : 'font-semibold text-gray-800'}`}>
                          {n + 1}. {l.title}
                        </span>
                        {formatDuration(l.durationSeconds) && <span className="shrink-0 text-xs text-gray-400">{formatDuration(l.durationSeconds)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
