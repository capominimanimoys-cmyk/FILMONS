// FILMONS Learning -- /learning/course/:courseId. Enrollment is real for
// free courses (course_enrollments insert, gated by coursesApi's own
// server-side price check); paid courses show an honest "coming soon"
// state instead of a Buy button that would lead nowhere -- real one-time
// checkout needs its own Stripe wiring (see stripe-charge/stripe-webhook,
// built for a different flow) that's out of scope for this pass.
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  ArrowLeft, Star, Users, Clock, Play, ChevronDown, ChevronUp, FileText,
  Image as ImageIcon, Link as LinkIcon, Download, BadgeCheck, X, CheckCircle2,
} from 'lucide-react';
import {
  getCourse, getCourseCurriculum, isEnrolled, enrollInFreeCourse,
  getLessonProgressMap, getCourseReviews, submitCourseReview,
  type Course, type CourseSection, type CourseReview,
} from '../lib/coursesApi';
import { getTrustLevelCached, type TrustLevel } from '../lib/trustApi';
import { UserAvatar } from '../components/AccountTypeBadge';
import { TrustBadge } from '../components/trust/TrustBadge';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import { useAuth } from '../context/AuthContext';

function formatDuration(totalSeconds: number): string {
  if (!totalSeconds) return '';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

const LESSON_ICON: Record<string, any> = { video: Play, text: FileText, image: ImageIcon, pdf: FileText, file: Download, link: LinkIcon };
const LEVEL_LABEL: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', all_levels: 'All levels' };
const TABS = [
  { id: 'about', label: 'About' },
  { id: 'outcomes', label: "What you'll learn" },
  { id: 'content', label: 'Course content' },
  { id: 'instructor', label: 'Instructor' },
  { id: 'reviews', label: 'Reviews' },
] as const;

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} onClick={() => onChange(n)}>
          <Star className={`w-6 h-6 ${n <= value ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`} />
        </button>
      ))}
    </div>
  );
}

export function CourseDetail() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [course, setCourse] = useState<Course | null | undefined>(undefined);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [instructorTrust, setInstructorTrust] = useState<TrustLevel | undefined>();
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const [previewLesson, setPreviewLesson] = useState<{ title: string; url: string } | null>(null);

  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [lessonProgress, setLessonProgress] = useState<Record<string, boolean>>({});
  const [reviews, setReviews] = useState<CourseReview[]>([]);
  const [myRating, setMyRating] = useState(0);
  const [myReviewBody, setMyReviewBody] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const isOwn = !!user && !!course && user.id === course.instructorId;

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollToTab = (id: string) => sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  useEffect(() => {
    if (!courseId) return;
    getCourse(courseId).then(async c => {
      setCourse(c ?? null);
      if (!c) return;
      getTrustLevelCached(c.instructorId).then(setInstructorTrust).catch(() => {});
      getCourseReviews(courseId).then(setReviews);
      const alreadyEnrolled = user ? await isEnrolled(user.id, courseId) : false;
      const isInstructor = user?.id === c.instructorId;
      setEnrolled(alreadyEnrolled);
      const secs = await getCourseCurriculum(courseId, { viewerIsEnrolled: alreadyEnrolled, viewerIsInstructor: isInstructor });
      setSections(secs);
      if (secs[0]) setOpenSectionId(secs[0].id);
      if (alreadyEnrolled && user) setLessonProgress(await getLessonProgressMap(user.id, courseId));
    });
  }, [courseId, user?.id]);

  if (course === undefined) {
    return <div className="min-h-screen flex items-center justify-center"><FilmonsBrandLoader size="lg" label="Loading course" /></div>;
  }
  if (course === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-bold text-gray-700">Course not found</p>
        <button onClick={() => navigate('/learning')} className="text-sm font-bold text-blue-600">Back to Learning</button>
      </div>
    );
  }

  const duration = formatDuration(course.durationSeconds);
  const allLessons = sections.flatMap(s => s.lessons);

  const firstIncompleteLesson = () => allLessons.find(l => !lessonProgress[l.id]) ?? allLessons[allLessons.length - 1];

  const handleEnroll = async () => {
    if (!user) { navigate('/login'); return; }
    if (!course.isFree && course.price > 0) { toast('Course checkout is coming soon', { description: 'Paid enrollment isn\'t live yet.' }); return; }
    setEnrolling(true);
    const ok = await enrollInFreeCourse(user.id, course.id);
    setEnrolling(false);
    if (!ok) { toast.error('Could not enroll'); return; }
    setEnrolled(true);
    toast.success('Enrolled!');
    const secs = await getCourseCurriculum(course.id, { viewerIsEnrolled: true });
    setSections(secs);
  };

  const handleContinue = () => {
    const lesson = firstIncompleteLesson();
    if (!lesson) { navigate(`/learning/course/${course.id}/content`); return; }
    navigate(`/learning/course/${course.id}/lesson/${lesson.id}`);
  };

  const handleSubmitReview = async () => {
    if (!user || myRating === 0) return;
    setSubmittingReview(true);
    const ok = await submitCourseReview(course.id, user.id, myRating, myReviewBody);
    setSubmittingReview(false);
    if (!ok) { toast.error('Only enrolled students can review this course'); return; }
    toast.success('Review posted');
    setReviews(await getCourseReviews(course.id));
    setMyRating(0);
    setMyReviewBody('');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 lg:top-14 z-20 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <p className="text-sm font-bold text-gray-900 truncate">{course.category}{course.subcategory ? ` · ${course.subcategory}` : ''}</p>
      </div>

      <div className="lg:max-w-3xl lg:mx-auto">
        <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
          {course.trailerUrl ? (
            <video src={course.trailerUrl} poster={course.coverUrl ?? undefined} controls className="w-full h-full object-contain bg-black" />
          ) : course.coverUrl ? (
            <img src={course.coverUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl">🎬</div>
          )}
        </div>

        <div className="px-4 py-4 space-y-4">
          <div>
            <p className="text-lg font-black text-gray-900 leading-snug">{course.title}</p>
            {course.shortDescription && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{course.shortDescription}</p>}
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            {course.ratingCount > 0 && (
              <span className="flex items-center gap-1 font-bold text-gray-700">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> {course.ratingAvg.toFixed(1)}
                <span className="text-gray-400 font-normal">({course.ratingCount} ratings)</span>
              </span>
            )}
            {course.studentCount > 0 && (
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {course.studentCount} students</span>
            )}
            {LEVEL_LABEL[course.level] && <span>{LEVEL_LABEL[course.level]}</span>}
            {duration && <span>{duration}</span>}
          </div>

          <button onClick={() => navigate(course.instructor?.username ? `/${course.instructor.username}` : `/host/${course.instructorId}`)}
            className="w-full flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-3 text-left">
            <UserAvatar user={{ id: course.instructorId, name: course.instructor?.name || '', avatar: course.instructor?.avatar_url ?? undefined }} size={44} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Created by</p>
              <p className="text-sm font-black text-gray-900 flex items-center gap-1 truncate">
                {course.instructor?.name}
                {course.instructor?.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {course.instructor?.primary_role && <p className="text-xs text-gray-400">{course.instructor.primary_role}</p>}
                {instructorTrust && <TrustBadge level={instructorTrust} size="sm" />}
              </div>
            </div>
          </button>

          {/* Enroll / Continue */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <p className="text-xl font-black text-gray-900">
              {course.isFree || course.price === 0 ? 'Free' : `${course.currency} $${course.price.toFixed(2)}`}
            </p>
            {isOwn ? (
              <button onClick={() => navigate(`/learning/course/${course.id}/content`)} className="w-full py-3 rounded-2xl bg-gray-900 text-white text-sm font-bold">
                View course content
              </button>
            ) : enrolled ? (
              <>
                <button onClick={handleContinue} className="w-full py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold">
                  Continue course
                </button>
                <button onClick={() => navigate(`/learning/course/${course.id}/content`)} className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 text-sm font-bold">
                  View course content
                </button>
              </>
            ) : (
              <button onClick={handleEnroll} disabled={enrolling} className="w-full py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60">
                {enrolling ? 'Enrolling…' : 'Enroll now'}
              </button>
            )}
          </div>

          {/* Tabs -- anchor-scroll rather than swap panels, so the page
              stays one continuous scroll (spec: "scroll through the
              complete course information") while still reading as tabs. */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar sticky top-[52px] lg:top-[108px] z-10 bg-gray-50 py-1 -mx-4 px-4">
            {TABS.map(t => (
              <button key={t.id} onClick={() => scrollToTab(t.id)}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold bg-white border border-gray-200 text-gray-600">
                {t.label}
              </button>
            ))}
          </div>

          <div ref={el => { sectionRefs.current.outcomes = el; }} />
          {course.learningOutcomes.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-sm font-black text-gray-900 mb-3">What you'll learn</p>
              <div className="space-y-2">
                {course.learningOutcomes.map((o, i) => (
                  <p key={i} className="text-sm text-gray-700 flex items-start gap-2">
                    <span className="text-emerald-500 font-bold shrink-0">✓</span> {o}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div ref={el => { sectionRefs.current.content = el; }} />
          {sections.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="p-4 pb-2">
                <p className="text-sm font-black text-gray-900">Course content</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {allLessons.length} lessons{duration ? ` · ${duration}` : ''}
                </p>
              </div>
              <div className="divide-y divide-gray-50 border-t border-gray-50">
                {sections.map((s, i) => {
                  const open = openSectionId === s.id;
                  return (
                    <div key={s.id}>
                      <button onClick={() => setOpenSectionId(open ? null : s.id)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50">
                        <p className="text-sm font-bold text-gray-800">Section {i + 1} — {s.title}</p>
                        {open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                      </button>
                      {open && (
                        <div className="bg-gray-50/60">
                          {s.lessons.map((l, li) => {
                            const Icon = LESSON_ICON[l.type] ?? Play;
                            const canOpen = enrolled || isOwn || (l.isPreview && l.type === 'video' && !!l.videoUrl);
                            const completed = !!lessonProgress[l.id];
                            const onTap = () => {
                              if (enrolled || isOwn) navigate(`/learning/course/${course.id}/lesson/${l.id}`);
                              else if (l.isPreview && l.videoUrl) setPreviewLesson({ title: l.title, url: l.videoUrl });
                            };
                            return (
                              <button
                                key={l.id}
                                onClick={onTap}
                                disabled={!canOpen}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${canOpen ? 'hover:bg-white' : ''}`}
                              >
                                {completed ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <Icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                                <p className="flex-1 min-w-0 text-xs text-gray-700 truncate">{li + 1}. {l.title}</p>
                                {l.isPreview && !enrolled && !isOwn && (
                                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full shrink-0">Preview</span>
                                )}
                                {l.durationSeconds ? (
                                  <span className="text-[10px] text-gray-400 shrink-0">{formatDuration(l.durationSeconds)}</span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div ref={el => { sectionRefs.current.about = el; }} />
          {course.description && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-sm font-black text-gray-900 mb-2">About this course</p>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{course.description}</p>
            </div>
          )}

          <div ref={el => { sectionRefs.current.instructor = el; }} />
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-sm font-black text-gray-900 mb-3">Instructor</p>
            <div className="flex items-center gap-3">
              <UserAvatar user={{ id: course.instructorId, name: course.instructor?.name || '', avatar: course.instructor?.avatar_url ?? undefined }} size={48} />
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 flex items-center gap-1">
                  {course.instructor?.name}
                  {course.instructor?.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                </p>
                {course.instructor?.primary_role && <p className="text-xs text-gray-400">{course.instructor.primary_role}</p>}
              </div>
            </div>
          </div>

          <div ref={el => { sectionRefs.current.reviews = el; }} />
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <p className="text-sm font-black text-gray-900">Reviews</p>
            {enrolled && (
              <div className="border border-gray-100 rounded-xl p-3 space-y-2">
                <StarPicker value={myRating} onChange={setMyRating} />
                <textarea value={myReviewBody} onChange={e => setMyReviewBody(e.target.value)} placeholder="Share your thoughts (optional)…" rows={2}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none resize-none" />
                <button onClick={handleSubmitReview} disabled={myRating === 0 || submittingReview}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:opacity-40">
                  {submittingReview ? 'Posting…' : 'Post review'}
                </button>
              </div>
            )}
            {reviews.length === 0 ? (
              <p className="text-xs text-gray-400">No reviews yet.</p>
            ) : (
              <div className="space-y-3">
                {reviews.map(r => (
                  <div key={r.id} className="flex items-start gap-2.5">
                    <UserAvatar user={{ id: r.userId, name: r.author?.name || '', avatar: r.author?.avatarUrl ?? undefined }} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-gray-900">{r.author?.name ?? 'Filmons student'}</p>
                        <span className="flex items-center gap-0.5">{Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />)}</span>
                      </div>
                      {r.body && <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{r.body}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {previewLesson && (
        <div className="fixed inset-0 z-[90] bg-black flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
            <p className="text-sm font-bold text-white truncate pr-3">{previewLesson.title}</p>
            <button onClick={() => setPreviewLesson(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 shrink-0">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <video src={previewLesson.url} controls autoPlay className="w-full max-h-full" />
          </div>
        </div>
      )}
    </div>
  );
}
