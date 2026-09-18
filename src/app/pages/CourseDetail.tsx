// FILMONS Courses -- /courses/:courseId. Foundation phase: read-only.
// Purchase/enrollment isn't built yet (see coursesApi.ts), so this shows
// real price/curriculum but an honest "opening soon" state instead of a
// Buy button that would lead nowhere.
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Star, Users, Clock, Play, ChevronDown, ChevronUp, FileText, Image as ImageIcon, Link as LinkIcon, Download, BadgeCheck, X } from 'lucide-react';
import { getCourse, getCourseCurriculum, type Course, type CourseSection } from '../lib/coursesApi';
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

export function CourseDetail() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [course, setCourse] = useState<Course | null | undefined>(undefined);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [instructorTrust, setInstructorTrust] = useState<TrustLevel | undefined>();
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const [previewLesson, setPreviewLesson] = useState<{ title: string; url: string } | null>(null);

  useEffect(() => {
    if (!courseId) return;
    getCourse(courseId).then(c => {
      setCourse(c ?? null);
      if (c) {
        getTrustLevelCached(c.instructorId).then(setInstructorTrust).catch(() => {});
        getCourseCurriculum(courseId, { viewerIsInstructor: user?.id === c.instructorId }).then(secs => {
          setSections(secs);
          if (secs[0]) setOpenSectionId(secs[0].id);
        });
      }
    });
  }, [courseId, user?.id]);

  if (course === undefined) {
    return <div className="min-h-screen flex items-center justify-center"><FilmonsBrandLoader size="lg" label="Loading course" /></div>;
  }
  if (course === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-bold text-gray-700">Course not found</p>
        <button onClick={() => navigate('/courses')} className="text-sm font-bold text-blue-600">Back to Courses</button>
      </div>
    );
  }

  const duration = formatDuration(course.durationSeconds);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 lg:top-14 z-20 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <p className="text-sm font-bold text-gray-900 truncate">{course.category}{course.subcategory ? ` · ${course.subcategory}` : ''}</p>
      </div>

      <div className="lg:max-w-3xl lg:mx-auto">
        {/* Trailer / cover -- publicly viewable, no enrollment needed */}
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
          </div>

          {/* Instructor */}
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

          {/* Price / enrollment */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
            <p className="text-xl font-black text-gray-900">
              {course.isFree || course.price === 0 ? 'Free' : `${course.currency} $${course.price.toFixed(2)}`}
            </p>
            <div className="w-full py-3 rounded-2xl bg-gray-100 text-gray-500 text-sm font-bold text-center">
              Enrollment opening soon
            </div>
          </div>

          {/* What you'll learn */}
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

          {/* Course content */}
          {sections.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="p-4 pb-2">
                <p className="text-sm font-black text-gray-900">Course content</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {sections.reduce((n, s) => n + s.lessons.length, 0)} lessons{duration ? ` · ${duration}` : ''}
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
                            const canPreview = l.isPreview && l.type === 'video' && !!l.videoUrl;
                            return (
                              <button
                                key={l.id}
                                onClick={() => canPreview && setPreviewLesson({ title: l.title, url: l.videoUrl! })}
                                disabled={!canPreview}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${canPreview ? 'hover:bg-white' : ''}`}
                              >
                                <Icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <p className="flex-1 min-w-0 text-xs text-gray-700 truncate">{li + 1}. {l.title}</p>
                                {l.isPreview && (
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

          {course.description && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-sm font-black text-gray-900 mb-2">About this course</p>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{course.description}</p>
            </div>
          )}
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
