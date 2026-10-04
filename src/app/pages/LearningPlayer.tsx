// FILMONS Learning -- /learning/course/:courseId/lesson/:lessonId. Focus
// mode: LearningLayout hides the main navigation here, leaving a back
// button, the course title, progress and a Lessons button (bottom sheet
// with every section, video lesson and quiz, and completion marks).
//
// Video lessons complete when 90% has actually been played (the browser's
// `played` ranges -- skipping ahead doesn't count, and opening a lesson
// alone never marks it complete). Quizzes are graded on the server. When
// every requirement is met the completion screen appears, with the
// certificate actions if the course issues one.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import {
  ArrowLeft, Award, CheckCircle2, ChevronLeft, ChevronRight, Circle, ClipboardCheck, Download, FileText,
  Link as LinkIcon, ListVideo, Lock, PartyPopper, PlayCircle, RotateCcw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  flattenItems, isItemDone, learningServer, type Completion, type Curriculum, type ViewerItem,
} from '../lib/learningServer';
import { VIDEO_COMPLETE_PERCENT, formatDuration } from '../lib/courseBuilder';
import { learningLoginPath } from '../lib/learningAuth';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import { BottomSheet } from '../components/BottomSheet';
import { StudentQuiz } from '../components/learning/StudentQuiz';
import { CertificateActions } from '../components/learning/CertificateActions';

export function LearningPlayer() {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cur, setCur] = useState<Curriculum | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [showLessons, setShowLessons] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const load = useCallback(async () => {
    if (!courseId) return;
    setState('loading');
    try {
      setCur(await learningServer.curriculum(courseId, user?.id));
      setState('ready');
    } catch { setState('error'); }
  }, [courseId, user?.id]);
  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => (cur ? flattenItems(cur.sections) : []), [cur]);
  const idx = items.findIndex(i => i.id === lessonId);
  const item = idx >= 0 ? items[idx] : undefined;
  const next = idx >= 0 ? items[idx + 1] : undefined;
  const prev = idx > 0 ? items[idx - 1] : undefined;
  const learner = cur?.access === 'enrolled' || cur?.access === 'instructor';
  const canOpen = (i: ViewerItem) => learner || (i.isPreview && i.type !== 'quiz');
  const go = (i: ViewerItem | undefined, replace = true) => { if (i) navigate(`/course/${courseId}/lesson/${i.id}`, { replace }); };

  const applyCompletion = (completion: Completion | null) => {
    if (!completion) return;
    setCur(c => {
      if (c && !c.completion?.complete && completion.complete) setCelebrate(true);
      return c ? { ...c, completion } : c;
    });
  };

  if (state === 'loading') return <div className="min-h-screen flex items-center justify-center bg-gray-50"><FilmonsBrandLoader size="lg" label="Loading lesson" /></div>;
  if (state === 'error' || !cur) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50 px-6 text-center">
        <p className="text-sm font-bold text-gray-800">We couldn’t load this lesson.</p>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-gray-800 border border-gray-200"><RotateCcw className="h-4 w-4" /> Retry</button>
          <button onClick={() => navigate(`/course/${courseId}`)} className="rounded-xl px-4 py-2 text-sm font-bold text-gray-600">Back to course</button>
        </div>
      </div>
    );
  }
  if (!item) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50 px-6 text-center">
        <p className="text-sm font-bold text-gray-800">This lesson isn’t part of the course anymore.</p>
        <button onClick={() => navigate(`/course/${courseId}`)} className="text-sm font-bold text-blue-600">Back to course</button>
      </div>
    );
  }

  const completion = cur.completion;
  const percent = completion?.required ? Math.round((completion.done / completion.required) * 100) : 0;
  const nextLabel = next ? (next.type === 'quiz' ? 'Start quiz' : 'Next lesson') : completion?.complete ? 'View completion' : 'Back to course';
  const onNext = () => {
    if (next) go(next);
    else if (completion?.complete) setCelebrate(true);
    else navigate(`/course/${courseId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Back · course title · progress · Lessons */}
      <div className="sticky top-0 z-20 bg-black px-3 py-2.5" style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/course/${courseId}`)} aria-label="Back to course" className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 shrink-0">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white/90">{cur.course.title}</p>
            {learner && completion && completion.required > 0 && (
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-blue-500" style={{ width: `${percent}%` }} /></div>
                <span className="text-[10px] font-bold text-white/60">{percent}%</span>
              </div>
            )}
          </div>
          <button onClick={() => setShowLessons(true)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/20">
            <ListVideo className="w-4 h-4" /> Lessons <span className="text-white/50">{idx + 1}/{items.length}</span>
          </button>
        </div>
      </div>

      {!canOpen(item) ? (
        <Locked onEnroll={() => navigate(user ? `/course/${courseId}` : learningLoginPath(`/course/${courseId}`))} isQuiz={item.type === 'quiz'} />
      ) : item.type === 'quiz' ? (
        <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 pb-10">
          {user && cur.access !== 'preview' ? (
            <StudentQuiz courseId={courseId!} userId={user.id} item={item} state={cur.quizzes[item.id]}
              onChanged={(st, comp) => { setCur(c => (c ? { ...c, quizzes: { ...c.quizzes, [item.id]: st } } : c)); applyCompletion(comp); }}
              onNext={onNext} nextLabel={nextLabel} />
          ) : null}
        </div>
      ) : (
        <LessonView key={item.id} courseId={courseId!} userId={learner && user && cur.access === 'enrolled' ? user.id : null} item={item}
          progress={cur.progress[item.id]} onProgress={(p, comp) => { setCur(c => (c ? { ...c, progress: { ...c.progress, [item.id]: { ...(c.progress[item.id] ?? { completed: false, watchedPercent: 0, exerciseCompleted: false, positionSeconds: 0 }), ...p } } } : c)); applyCompletion(comp); }}
          prev={prev} onPrev={() => go(prev)} onNext={onNext} nextLabel={nextLabel} isInstructor={cur.access === 'instructor'} />
      )}

      {showLessons && (
        <BottomSheet title={learner && completion ? `Lessons · ${completion.done}/${completion.required} required complete` : 'Lessons'} onClose={() => setShowLessons(false)} maxHeightVh={80}>
          <div className="space-y-5 px-4 pb-6">
            {cur.sections.map(sec => (
              <div key={sec.id}>
                <p className="px-1 pb-2 text-xs font-black uppercase tracking-wide text-gray-400">{sec.title}</p>
                <div className="space-y-1">
                  {sec.items.map(l => {
                    const n = items.findIndex(x => x.id === l.id);
                    const current = l.id === item.id;
                    const done = learner && isItemDone(l, cur);
                    const open = canOpen(l);
                    return (
                      <button key={l.id} data-pop disabled={!open} onClick={() => { setShowLessons(false); if (!current) go(l); }}
                        aria-current={current ? 'true' : undefined}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left disabled:opacity-50 ${current ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                        {!open ? <Lock className="h-5 w-5 shrink-0 text-gray-300" />
                          : done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                          : l.type === 'quiz' ? <ClipboardCheck className={`h-5 w-5 shrink-0 ${current ? 'text-blue-600' : 'text-violet-500'}`} />
                          : current ? <PlayCircle className="h-5 w-5 shrink-0 text-blue-600" />
                          : <Circle className="h-5 w-5 shrink-0 text-gray-300" />}
                        <span className={`min-w-0 flex-1 truncate text-sm ${current ? 'font-black text-blue-600' : 'font-semibold text-gray-800'}`}>{n + 1}. {l.title}</span>
                        {l.type === 'quiz' ? <span className="shrink-0 text-xs text-gray-400">{l.quiz?.required ? 'Quiz' : 'Optional quiz'}</span>
                          : l.durationSeconds ? <span className="shrink-0 text-xs text-gray-400">{formatDuration(l.durationSeconds)}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </BottomSheet>
      )}

      {celebrate && completion?.complete && (
        <CompletionScreen courseTitle={cur.course.title} completion={completion} onClose={() => setCelebrate(false)} onBack={() => navigate(`/course/${courseId}`)} />
      )}
    </div>
  );
}

function Locked({ onEnroll, isQuiz }: { onEnroll: () => void; isQuiz: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <Lock className="h-8 w-8 text-gray-300" />
      <p className="text-sm font-bold text-gray-800">{isQuiz ? 'Enroll to take this quiz' : 'Enroll to watch this lesson'}</p>
      <button onClick={onEnroll} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white">See course options</button>
    </div>
  );
}

function LessonView({ courseId, userId, item, progress, onProgress, prev, onPrev, onNext, nextLabel, isInstructor }: {
  courseId: string; userId: string | null; item: ViewerItem; progress: Curriculum['progress'][string] | undefined;
  onProgress: (p: Partial<Curriculum['progress'][string]>, completion: Completion | null) => void;
  prev?: ViewerItem; onPrev: () => void; onNext: () => void; nextLabel: string; isInstructor: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reported = useRef(progress?.watchedPercent ?? 0);
  const sending = useRef(false);
  const [watched, setWatched] = useState(progress?.watchedPercent ?? 0);
  const completed = !!progress?.completed;
  const isVideo = item.type === 'video';

  // Share of the video actually played, from the browser's played ranges.
  const playedPercent = () => {
    const v = videoRef.current;
    if (!v || !v.duration || !Number.isFinite(v.duration)) return 0;
    let total = 0;
    for (let i = 0; i < v.played.length; i++) total += v.played.end(i) - v.played.start(i);
    return Math.min(100, Math.round((total / v.duration) * 100));
  };

  const report = useCallback(async (force = false) => {
    if (!userId || !isVideo || sending.current) return;
    const v = videoRef.current;
    const pct = Math.max(reported.current, playedPercent());
    setWatched(w => Math.max(w, pct));
    if (!force && pct - reported.current < 5 && !(pct >= VIDEO_COMPLETE_PERCENT && !completed)) return;
    if (pct <= reported.current && !force) return;
    sending.current = true;
    try {
      const r = await learningServer.videoProgress(courseId, item.id, userId, pct, Math.round(v?.currentTime ?? 0));
      reported.current = r.watchedPercent;
      onProgress({ watchedPercent: r.watchedPercent, completed: r.completed }, r.completion);
      if (r.completed && !completed) toast.success('Lesson complete');
    } catch { /* retried on the next report */ }
    sending.current = false;
  }, [userId, isVideo, courseId, item.id, completed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isVideo || !userId) return;
    const t = setInterval(() => report(), 10000);
    const onHide = () => { if (document.visibilityState === 'hidden') report(true); };
    document.addEventListener('visibilitychange', onHide);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onHide); report(true); };
  }, [isVideo, userId, report]);

  const resumeAt = progress?.positionSeconds ?? 0;
  const markLegacyDone = async () => {
    if (!userId) return;
    try { const r = await learningServer.completeLesson(courseId, item.id, userId, !completed); onProgress({ completed: !completed }, r.completion); }
    catch (e: any) { toast.error(e?.message || 'Could not update progress'); }
  };
  const toggleExercise = async () => {
    if (!userId) return;
    const nextVal = !progress?.exerciseCompleted;
    onProgress({ exerciseCompleted: nextVal }, null);
    try { await learningServer.exercise(courseId, item.id, userId, nextVal); }
    catch { onProgress({ exerciseCompleted: !nextVal }, null); toast.error('Could not save'); }
  };

  return (
    <>
      {isVideo && (
        <div className="w-full bg-black">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-center" style={{ aspectRatio: '16/9', maxHeight: '75vh' }}>
            {item.videoUrl ? (
              <video ref={videoRef} src={item.videoUrl} poster={item.posterUrl ?? undefined} controls playsInline className="h-full w-full object-contain"
                onLoadedMetadata={e => { if (resumeAt > 5 && resumeAt < (e.currentTarget.duration || 0) - 5) e.currentTarget.currentTime = resumeAt; }}
                onPause={() => report(true)} onEnded={() => report(true)} onTimeUpdate={() => setWatched(w => Math.max(w, playedPercent()))} />
            ) : <p className="text-sm text-white/50">This video isn’t available.</p>}
          </div>
        </div>
      )}
      {!isVideo && item.type !== 'quiz' && item.type !== 'text' && (
        <div className="w-full bg-black">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-center p-6" style={{ minHeight: 220 }}>
            {item.type === 'image' && item.content ? <img src={item.content} alt={item.title} className="max-h-[70vh] max-w-full object-contain" />
              : item.content ? <a href={item.content} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 text-white/80">
                {item.type === 'link' ? <LinkIcon className="h-10 w-10" /> : <FileText className="h-10 w-10" />}<span className="text-sm underline">Open {item.type === 'link' ? 'link' : 'file'}</span></a>
              : <p className="text-sm text-white/50">Nothing to show.</p>}
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl flex-1 px-5 pt-5 pb-10">
        <h1 data-pop className="text-xl font-black leading-snug text-gray-900">{item.title}</h1>
        {isVideo && userId && (
          <p data-pop className={`mt-1.5 flex items-center gap-1.5 text-xs font-semibold ${completed ? 'text-emerald-600' : 'text-gray-500'}`}>
            {completed ? <><CheckCircle2 className="h-3.5 w-3.5" /> Completed</> : <>Watched {watched}% · watch {VIDEO_COMPLETE_PERCENT}% to complete</>}
          </p>
        )}
        {isVideo && isInstructor && <p className="mt-1.5 text-xs text-gray-400">Instructor view -- your progress isn’t tracked.</p>}
        {!userId && !isInstructor && <p className="mt-1.5 text-xs font-semibold text-emerald-600">Free preview</p>}

        {item.type === 'text' && item.content && (
          <div data-pop className="mt-4 whitespace-pre-line rounded-2xl border border-gray-100 bg-white p-5 text-[15px] leading-relaxed text-gray-800">{item.content}</div>
        )}
        {item.description && <p data-pop className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600">{item.description}</p>}

        {item.resources.length > 0 && (
          <div data-pop className="mt-5 rounded-2xl border border-gray-100 bg-white p-4">
            <p className="text-sm font-black text-gray-900">Resources</p>
            <ul className="mt-2 divide-y divide-gray-50">
              {item.resources.map(r => (
                <li key={r.id}>
                  <a href={r.url} target="_blank" rel="noreferrer" download className="flex items-center gap-3 py-2.5 text-sm font-semibold text-gray-800 hover:text-blue-600">
                    <Download className="h-4 w-4 shrink-0 text-gray-400" /> <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    {r.fileType && <span className="shrink-0 text-[11px] font-bold uppercase text-gray-400">{r.fileType}</span>}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {item.exercise && (
          <div data-pop className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
            <p className="text-sm font-black text-gray-900">Practical exercise</p>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-gray-700">{item.exercise.instructions}</p>
            {item.exercise.expectedResult && <p className="mt-2 text-xs leading-relaxed text-gray-600"><b>Expected result:</b> {item.exercise.expectedResult}</p>}
            {userId && (
              <button onClick={toggleExercise} className={`mt-3 flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold ${progress?.exerciseCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-white text-gray-800 border border-gray-200'}`}>
                <CheckCircle2 className="h-4 w-4" /> {progress?.exerciseCompleted ? 'Exercise completed' : 'Mark exercise complete'}
              </button>
            )}
          </div>
        )}

        {!isVideo && userId && (
          <button data-pop onClick={markLegacyDone} className={`mt-5 w-full rounded-2xl py-3 text-sm font-bold ${completed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-600 text-white'}`}>
            {completed ? 'Completed' : 'Mark complete'}
          </button>
        )}

        <div data-pop className="mt-6 flex items-center gap-3">
          <button onClick={onPrev} disabled={!prev} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <button onClick={onNext} className="flex flex-[2] items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-3 text-sm font-black text-white hover:bg-blue-700">
            {nextLabel} <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}

function CompletionScreen({ courseTitle, completion, onClose, onBack }: { courseTitle: string; completion: Completion; onClose: () => void; onBack: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Course complete">
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-6 text-center shadow-2xl" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50"><PartyPopper className="h-8 w-8 text-emerald-600" /></div>
        <h2 className="mt-3 text-2xl font-black text-gray-900">Course complete!</h2>
        <p className="mt-1 text-sm text-gray-600">You finished <b>{courseTitle}</b>.</p>
        {completion.certificate ? (
          <div className="mt-5 space-y-3 text-left">
            <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-blue-700"><Award className="h-4 w-4" /> Your certificate of completion is ready</p>
            <CertificateActions certificate={completion.certificate} />
          </div>
        ) : completion.certificateEnabled ? (
          <p className="mt-4 text-xs text-gray-500">Your certificate is being prepared -- it will appear on the course page shortly.</p>
        ) : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button onClick={onBack} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white">Back to course</button>
          <button onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100">Keep reviewing</button>
        </div>
      </div>
    </div>
  );
}
