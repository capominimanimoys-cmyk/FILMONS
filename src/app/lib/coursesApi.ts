// FILMONS Courses -- creator-education marketplace. This pass ships the
// read-only browse/detail surface (CoursesHome, CourseDetail) plus the
// full schema underneath it; creation/checkout/player land in a later
// phase. See supabase/migrations/20240511000000_courses.sql.
import { supabase } from '../../lib/supabase';

export type CourseLevel = 'beginner' | 'intermediate' | 'advanced' | 'all_levels';
export type CourseStatus = 'draft' | 'published' | 'archived';
export type LessonType = 'video' | 'text' | 'image' | 'pdf' | 'file' | 'link';

export interface CourseInstructor {
  id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  account_type: string | null;
  primary_role: string | null;
}

export interface Course {
  id: string;
  instructorId: string;
  instructor?: CourseInstructor;
  title: string;
  shortDescription: string | null;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  level: CourseLevel;
  language: string;
  learningOutcomes: string[];
  audience: string | null;
  prerequisites: string | null;
  coverUrl: string | null;
  trailerUrl: string | null;
  price: number;
  currency: string;
  isFree: boolean;
  status: CourseStatus;
  ratingAvg: number;
  ratingCount: number;
  studentCount: number;
  lessonCount: number;
  durationSeconds: number;
  createdAt: string;
  publishedAt: string | null;
}

export interface CourseLesson {
  id: string;
  sectionId: string;
  title: string;
  type: LessonType;
  /** Scrubbed to null for a non-preview lesson unless the viewer is
   * enrolled or is the course's own instructor -- see rowsToLessons. */
  content: string | null;
  videoUrl: string | null;
  videoPosterUrl: string | null;
  durationSeconds: number | null;
  isPreview: boolean;
  position: number;
}

export interface CourseSection {
  id: string;
  title: string;
  position: number;
  lessons: CourseLesson[];
}

// ── Permissions -- enforce server-side too (coursesApi's own writes check
// this before inserting, not just the UI hiding the Create Course entry
// point) once the create flow exists. Creator/Creator+ can browse and buy,
// same as everyone else, but cannot publish. ──────────────────────────────
export function canCreateCourses(accountType?: string | null): boolean {
  return accountType === 'professional' || accountType === 'business';
}

const INSTRUCTOR_SELECT = 'id, name, username, avatar_url, is_verified, account_type, primary_role';

function rowToCourse(row: any, instructor?: any): Course {
  return {
    id: row.id,
    instructorId: row.instructor_id,
    instructor: instructor ? {
      id: instructor.id, name: instructor.name, username: instructor.username,
      avatar_url: instructor.avatar_url, is_verified: !!instructor.is_verified,
      account_type: instructor.account_type, primary_role: instructor.primary_role,
    } : undefined,
    title: row.title,
    shortDescription: row.short_description,
    description: row.description,
    category: row.category,
    subcategory: row.subcategory,
    level: row.level || 'all_levels',
    language: row.language || 'English',
    learningOutcomes: Array.isArray(row.learning_outcomes) ? row.learning_outcomes : [],
    audience: row.audience,
    prerequisites: row.prerequisites,
    coverUrl: row.cover_url,
    trailerUrl: row.trailer_url,
    price: Number(row.price) || 0,
    currency: row.currency || 'CAD',
    isFree: !!row.is_free,
    status: row.status || 'draft',
    ratingAvg: Number(row.rating_avg) || 0,
    ratingCount: row.rating_count || 0,
    studentCount: row.student_count || 0,
    lessonCount: row.lesson_count || 0,
    durationSeconds: row.duration_seconds || 0,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

async function attachInstructors(rows: any[]): Promise<Course[]> {
  if (!rows.length) return [];
  const ids = [...new Set(rows.map(r => r.instructor_id))];
  const { data: profiles } = await supabase.from('profiles').select(INSTRUCTOR_SELECT).in('id', ids);
  const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return rows.map(r => rowToCourse(r, map.get(r.instructor_id)));
}

// Lesson/section counts + total duration aren't stored columns (avoids a
// trigger to keep them in sync on every lesson edit) -- computed here from
// course_lessons via a join through course_sections since lessons only
// carry section_id, not course_id directly.
async function attachCurriculumStats(courses: Course[]): Promise<Course[]> {
  if (!courses.length) return courses;
  const courseIds = courses.map(c => c.id);
  const { data: sections } = await supabase.from('course_sections').select('id, course_id').in('course_id', courseIds);
  const sectionToCourse = new Map((sections ?? []).map((s: any) => [s.id, s.course_id]));
  const sectionIds = [...sectionToCourse.keys()];
  if (!sectionIds.length) return courses;
  const { data: lessons } = await supabase.from('course_lessons').select('section_id, duration_seconds').in('section_id', sectionIds);
  const stats = new Map<string, { count: number; duration: number }>();
  (lessons ?? []).forEach((l: any) => {
    const courseId = sectionToCourse.get(l.section_id);
    if (!courseId) return;
    const s = stats.get(courseId) ?? { count: 0, duration: 0 };
    s.count += 1;
    s.duration += l.duration_seconds || 0;
    stats.set(courseId, s);
  });
  return courses.map(c => {
    const s = stats.get(c.id);
    return s ? { ...c, lessonCount: s.count, durationSeconds: s.duration } : c;
  });
}

export async function getCourses(opts: {
  category?: string;
  subcategory?: string;
  query?: string;
  instructorId?: string;
  /** Defaults to only 'published' -- pass explicitly to include drafts
   * (e.g. the instructor viewing their own course list). */
  status?: CourseStatus;
  limit?: number;
} = {}): Promise<Course[]> {
  const limit = opts.limit ?? 20;
  let q = supabase.from('courses').select('*').order('created_at', { ascending: false }).limit(limit);
  q = q.eq('status', opts.status ?? 'published');
  if (opts.category) q = q.eq('category', opts.category);
  if (opts.subcategory) q = q.eq('subcategory', opts.subcategory);
  if (opts.instructorId) q = q.eq('instructor_id', opts.instructorId);
  if (opts.query?.trim()) q = q.ilike('title', `%${opts.query.trim()}%`);
  const { data, error } = await q;
  if (error) { console.warn('[coursesApi] getCourses error:', error.message); return []; }
  const withInstructors = await attachInstructors(data ?? []);
  return attachCurriculumStats(withInstructors);
}

export async function getPopularCourses(category?: string, limit = 10): Promise<Course[]> {
  let q = supabase.from('courses').select('*').eq('status', 'published').order('student_count', { ascending: false }).limit(limit);
  if (category) q = q.eq('category', category);
  const { data, error } = await q;
  if (error) return [];
  return attachCurriculumStats(await attachInstructors(data ?? []));
}

export async function getCourse(id: string): Promise<Course | null> {
  const { data, error } = await supabase.from('courses').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  const [withInstructor] = await attachInstructors([data]);
  const [withStats] = await attachCurriculumStats([withInstructor]);
  return withStats;
}

// `viewerIsEnrolled`/`viewerIsInstructor` decide whether non-preview lesson
// content is scrubbed -- the actual access gate (this pass has no purchase
// flow yet, so every non-instructor viewer sees preview-only content,
// matching "students must be enrolled to see lesson content").
export async function getCourseCurriculum(courseId: string, opts: {
  viewerIsEnrolled?: boolean;
  viewerIsInstructor?: boolean;
} = {}): Promise<CourseSection[]> {
  const canSeeAll = !!opts.viewerIsEnrolled || !!opts.viewerIsInstructor;
  const { data: sections, error: sErr } = await supabase
    .from('course_sections').select('id, title, position').eq('course_id', courseId).order('position');
  if (sErr || !sections?.length) return [];

  const sectionIds = sections.map((s: any) => s.id);
  const { data: lessons } = await supabase
    .from('course_lessons').select('*').in('section_id', sectionIds).order('position');

  const lessonsBySection = new Map<string, CourseLesson[]>();
  (lessons ?? []).forEach((l: any) => {
    const visible = canSeeAll || l.is_preview;
    const lesson: CourseLesson = {
      id: l.id, sectionId: l.section_id, title: l.title, type: l.type,
      content: visible ? l.content : null,
      videoUrl: visible ? l.video_url : null,
      videoPosterUrl: l.video_poster_url,
      durationSeconds: l.duration_seconds,
      isPreview: !!l.is_preview,
      position: l.position,
    };
    const arr = lessonsBySection.get(l.section_id) ?? [];
    arr.push(lesson);
    lessonsBySection.set(l.section_id, arr);
  });

  return sections.map((s: any) => ({
    id: s.id, title: s.title, position: s.position,
    lessons: lessonsBySection.get(s.id) ?? [],
  }));
}

export async function getCourseReviewSummary(courseId: string): Promise<{ avg: number; count: number }> {
  const { data } = await supabase.from('courses').select('rating_avg, rating_count').eq('id', courseId).maybeSingle();
  return { avg: Number(data?.rating_avg) || 0, count: data?.rating_count || 0 };
}
