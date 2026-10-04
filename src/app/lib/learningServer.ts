// FILMONS Learning student-side server calls (see
// supabase/functions/server/learning.tsx): the course outline with
// whatever this viewer may open, progress, quizzes and certificates.
import { LearningApiError, learningGet, learningPost } from './courseBuilder';
import { supabase } from '../../lib/supabase';

export interface ViewerResource { id: string; name: string; url: string; fileType: string | null; isPreview: boolean }
export interface ViewerItem {
  id: string; type: string; title: string; description: string | null; durationSeconds: number | null;
  isPreview: boolean; posterUrl: string | null; videoUrl: string | null; content: string | null;
  exercise: { instructions: string; expectedResult: string | null } | null;
  resources: ViewerResource[];
  quiz: { instructions: string | null; passingScore: number; maxAttempts: number | null; required: boolean; isFinal: boolean; questionCount: number } | null;
}
export interface ViewerSection { id: string; title: string; description: string | null; items: ViewerItem[] }
export interface LessonProgress { completed: boolean; watchedPercent: number; exerciseCompleted: boolean; positionSeconds: number }
export interface QuizState {
  attemptsUsed: number; attemptsAllowed: number | null; bestScore: number | null;
  passed: boolean; exhausted: boolean; inProgressAttemptId: string | null;
}
export interface PublicCertificate {
  code: string; studentName: string; courseTitle: string; instructorName: string;
  completedAt: string; issuedAt: string; valid: boolean; courseId?: string;
}
export interface Completion {
  required: number; done: number; complete: boolean; certificateEnabled: boolean; certificate: PublicCertificate | null;
}
export interface Curriculum {
  access: 'instructor' | 'enrolled' | 'preview';
  course: { id: string; title: string; status: string; certificateEnabled: boolean; instructorId: string };
  sections: ViewerSection[];
  progress: Record<string, LessonProgress>;
  quizzes: Record<string, QuizState>;
  completion: Completion | null;
}
export interface QuizQuestion { id: string; type: 'multiple_choice' | 'true_false'; prompt: string; options: { id: string; text: string }[] }
export interface QuizReviewEntry { questionId: string; correctOptionId: string | null; explanation: string | null }
export interface QuizSubmitResult {
  score: number; passed: boolean; correctCount: number; questionCount: number; state: QuizState;
  review: QuizReviewEntry[] | null; completion: Completion | null;
}

// ── Fallback while the server routes aren't deployed yet ──────────────────
// The Learning routes ship in the make-server edge function, which deploys
// separately from the website. Until it's live, a call to a missing route
// gets the router's bare 404 (no JSON `error`), and course pages fall back
// to reading the course tables directly -- how they worked before -- so
// existing courses keep working. (A real "Course not found" 404 carries an
// error message and is not treated as missing.)
export function routeMissing(e: unknown): boolean {
  return e instanceof LearningApiError && e.status === 404 && !e.data?.error;
}

async function legacyCurriculum(courseId: string, userId?: string | null): Promise<Curriculum> {
  const { data: course } = await supabase.from('courses').select('id, title, status, instructor_id').eq('id', courseId).maybeSingle();
  if (!course) throw new LearningApiError('Course not found', 404, { error: 'Course not found' });
  const isInstructor = !!userId && course.instructor_id === userId;
  let enrolled = false;
  if (userId && !isInstructor) {
    const { data } = await supabase.from('course_enrollments').select('id').eq('course_id', courseId).eq('user_id', userId).eq('status', 'active').maybeSingle();
    enrolled = !!data;
  }
  const full = isInstructor || enrolled;
  const { data: sections } = await supabase.from('course_sections').select('id, title, position').eq('course_id', courseId).order('position');
  const sectionIds = (sections ?? []).map((s: any) => s.id);
  const { data: lessons } = sectionIds.length
    ? await supabase.from('course_lessons').select('*').in('section_id', sectionIds).order('position')
    : { data: [] as any[] };
  let progress: Curriculum['progress'] = {};
  if (userId && full) {
    const { data } = await supabase.from('course_progress').select('lesson_id, completed').eq('user_id', userId).eq('course_id', courseId);
    progress = Object.fromEntries((data ?? []).map((r: any) => [r.lesson_id, { completed: !!r.completed, watchedPercent: r.completed ? 100 : 0, exerciseCompleted: false, positionSeconds: 0 }]));
  }
  const all = (lessons ?? []) as any[];
  const done = all.filter(l => progress[l.id]?.completed).length;
  return {
    access: isInstructor ? 'instructor' : enrolled ? 'enrolled' : 'preview',
    course: { id: course.id, title: course.title, status: course.status, certificateEnabled: false, instructorId: course.instructor_id },
    sections: (sections ?? []).map((s: any) => ({
      id: s.id, title: s.title, description: null,
      items: all.filter(l => l.section_id === s.id).map(l => {
        const open = full || l.is_preview;
        return {
          id: l.id, type: l.type, title: l.title, description: null, durationSeconds: l.duration_seconds ?? null, isPreview: !!l.is_preview,
          posterUrl: l.video_poster_url ?? null, videoUrl: open ? l.video_url ?? null : null, content: open ? l.content ?? null : null,
          exercise: null, resources: [], quiz: null,
        };
      }),
    })),
    progress, quizzes: {},
    completion: userId && full ? { required: all.length, done, complete: all.length > 0 && done === all.length, certificateEnabled: false, certificate: null } : null,
  };
}

export const learningServer = {
  curriculum: (courseId: string, userId?: string | null) =>
    learningPost<Curriculum>('/curriculum', { courseId, userId: userId ?? null })
      .catch(e => { if (routeMissing(e)) return legacyCurriculum(courseId, userId); throw e; }),
  enroll: (courseId: string, userId: string) => learningPost('/enroll', { courseId, userId }).catch(async e => {
    if (!routeMissing(e)) throw e;
    const { data: c } = await supabase.from('courses').select('is_free, price, status').eq('id', courseId).maybeSingle();
    if (!c || c.status !== 'published' || (!c.is_free && Number(c.price) > 0)) throw e;
    const { error } = await supabase.from('course_enrollments').upsert({ user_id: userId, course_id: courseId, status: 'active' }, { onConflict: 'user_id,course_id', ignoreDuplicates: true });
    if (error) throw e;
    return { ok: true };
  }),
  videoProgress: (courseId: string, lessonId: string, userId: string, watchedPercent: number, positionSeconds: number) =>
    learningPost<{ watchedPercent: number; completed: boolean; completion: Completion | null }>('/progress/video', { courseId, lessonId, userId, watchedPercent, positionSeconds })
      .catch(async e => {
        if (!routeMissing(e)) throw e;
        const completed = watchedPercent >= 90;
        if (completed) {
          await supabase.from('course_progress').upsert({ user_id: userId, course_id: courseId, lesson_id: lessonId, completed: true, updated_at: new Date().toISOString() }, { onConflict: 'user_id,lesson_id' });
        }
        return { watchedPercent, completed, completion: null };
      }),
  exercise: (courseId: string, lessonId: string, userId: string, completed: boolean) => learningPost('/progress/exercise', { courseId, lessonId, userId, completed }),
  completeLesson: (courseId: string, lessonId: string, userId: string, completed = true) =>
    learningPost<{ completion: Completion }>('/progress/complete', { courseId, lessonId, userId, completed }).catch(async e => {
      if (!routeMissing(e)) throw e;
      const { error } = await supabase.from('course_progress').upsert({ user_id: userId, course_id: courseId, lesson_id: lessonId, completed, updated_at: new Date().toISOString() }, { onConflict: 'user_id,lesson_id' });
      if (error) throw e;
      return { completion: (await legacyCurriculum(courseId, userId)).completion! };
    }),
  quizStart: (courseId: string, lessonId: string, userId: string, retake = false) =>
    learningPost<{ attemptId: string; answers: Record<string, string>; questions: QuizQuestion[]; state: QuizState }>('/quiz/start', { courseId, lessonId, userId, retake }),
  quizAnswer: (attemptId: string, userId: string, answers: Record<string, string>) => learningPost('/quiz/answer', { attemptId, userId, answers }),
  quizSubmit: (attemptId: string, userId: string, answers: Record<string, string>) => learningPost<QuizSubmitResult>('/quiz/submit', { attemptId, userId, answers }),
  quizReview: (courseId: string, lessonId: string, userId: string) =>
    learningPost<{ questions: QuizQuestion[]; review: QuizReviewEntry[]; lastAttempt: { answers: Record<string, string>; score: number; passed: boolean } | null; state: QuizState }>('/quiz/review', { courseId, lessonId, userId }),
  completion: (courseId: string, userId: string) => learningPost<Completion>('/completion', { courseId, userId }),
  myCertificates: (userId: string) => learningPost<{ certificates: PublicCertificate[] }>('/certificates/mine', { userId }),
  verifyCertificate: (code: string) => learningGet<{ found: boolean; certificate?: PublicCertificate }>(`/certificates/verify/${encodeURIComponent(code)}`),
};

/** Flat, in-order list of every item in the course. */
export function flattenItems(sections: ViewerSection[]): ViewerItem[] {
  return sections.flatMap(s => s.items);
}

export function isItemDone(item: ViewerItem, c: Pick<Curriculum, 'progress' | 'quizzes'>): boolean {
  if (item.type === 'quiz') return !!c.quizzes[item.id]?.passed;
  return !!c.progress[item.id]?.completed;
}
