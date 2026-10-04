// FILMONS Learning student-side server calls (see
// supabase/functions/server/learning.tsx): the course outline with
// whatever this viewer may open, progress, quizzes and certificates.
import { learningGet, learningPost } from './courseBuilder';

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

export const learningServer = {
  curriculum: (courseId: string, userId?: string | null) => learningPost<Curriculum>('/curriculum', { courseId, userId: userId ?? null }),
  enroll: (courseId: string, userId: string) => learningPost('/enroll', { courseId, userId }),
  videoProgress: (courseId: string, lessonId: string, userId: string, watchedPercent: number, positionSeconds: number) =>
    learningPost<{ watchedPercent: number; completed: boolean; completion: Completion | null }>('/progress/video', { courseId, lessonId, userId, watchedPercent, positionSeconds }),
  exercise: (courseId: string, lessonId: string, userId: string, completed: boolean) => learningPost('/progress/exercise', { courseId, lessonId, userId, completed }),
  completeLesson: (courseId: string, lessonId: string, userId: string, completed = true) =>
    learningPost<{ completion: Completion }>('/progress/complete', { courseId, lessonId, userId, completed }),
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
