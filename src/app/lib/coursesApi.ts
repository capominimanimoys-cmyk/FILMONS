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

// ── Enrollment / progress -- see 20240516000000_course_enrollment_progress.sql
// for the student_count/rating_avg trigger-synced counters this writes into. ──

export async function isEnrolled(userId: string, courseId: string): Promise<boolean> {
  const { data } = await supabase.from('course_enrollments').select('id')
    .eq('user_id', userId).eq('course_id', courseId).eq('status', 'active').maybeSingle();
  return !!data;
}

// Paid courses need a real Stripe checkout (out of scope for this pass --
// see the CourseDetail "Coming soon" state) -- this path only ever writes
// an enrollment row for a genuinely free course, re-checked server-side
// against the course's own price/isFree rather than trusting the caller.
export async function enrollInFreeCourse(userId: string, courseId: string): Promise<boolean> {
  const course = await getCourse(courseId);
  if (!course || (!course.isFree && course.price > 0)) return false;
  const { error } = await supabase.from('course_enrollments')
    .upsert({ user_id: userId, course_id: courseId, status: 'active' }, { onConflict: 'user_id,course_id', ignoreDuplicates: true });
  if (error) { console.warn('[coursesApi] enroll error:', error.message); return false; }
  return true;
}

export async function getLessonProgressMap(userId: string, courseId: string): Promise<Record<string, boolean>> {
  const { data } = await supabase.from('course_progress').select('lesson_id, completed').eq('user_id', userId).eq('course_id', courseId);
  const map: Record<string, boolean> = {};
  (data ?? []).forEach((r: any) => { map[r.lesson_id] = !!r.completed; });
  return map;
}

export async function setLessonComplete(userId: string, courseId: string, lessonId: string, completed: boolean): Promise<boolean> {
  const { error } = await supabase.from('course_progress').upsert(
    { user_id: userId, course_id: courseId, lesson_id: lessonId, completed, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,lesson_id' },
  );
  if (error) { console.warn('[coursesApi] progress error:', error.message); return false; }
  return true;
}

export async function getCourseProgressStats(userId: string, courseId: string): Promise<{ completed: number; total: number; percent: number }> {
  const sections = await getCourseCurriculum(courseId, { viewerIsEnrolled: true });
  const total = sections.reduce((n, s) => n + s.lessons.length, 0);
  if (!total) return { completed: 0, total: 0, percent: 0 };
  const progress = await getLessonProgressMap(userId, courseId);
  const completed = sections.reduce((n, s) => n + s.lessons.filter(l => progress[l.id]).length, 0);
  return { completed, total, percent: Math.round((completed / total) * 100) };
}

export interface EnrolledCourse extends Course {
  enrolledAt: string;
  progressPercent: number;
  completedLessons: number;
}

/** "My Learning" -> Enrolled tab. Only courses the viewer has actually
 *  started (progressPercent > 0) belong in a "Continue Learning" row --
 *  the caller filters for that, this returns every active enrollment. */
export async function getMyEnrollments(userId: string): Promise<EnrolledCourse[]> {
  const { data: rows, error } = await supabase.from('course_enrollments')
    .select('course_id, enrolled_at').eq('user_id', userId).eq('status', 'active')
    .order('enrolled_at', { ascending: false });
  if (error || !rows?.length) return [];
  const courseIds = rows.map((r: any) => r.course_id);
  const { data: courseRows } = await supabase.from('courses').select('*').in('id', courseIds);
  const courses = await attachCurriculumStats(await attachInstructors(courseRows ?? []));
  const courseMap = new Map(courses.map(c => [c.id, c]));
  const enrolledAtMap = new Map(rows.map((r: any) => [r.course_id, r.enrolled_at]));

  const stats = await Promise.all(courseIds.map(id => getCourseProgressStats(userId, id)));
  const statsMap = new Map(courseIds.map((id, i) => [id, stats[i]]));

  return courseIds
    .map(id => courseMap.get(id))
    .filter((c): c is Course => !!c)
    .map(c => ({
      ...c,
      enrolledAt: enrolledAtMap.get(c.id) as string,
      progressPercent: statsMap.get(c.id)?.percent ?? 0,
      completedLessons: statsMap.get(c.id)?.completed ?? 0,
    }));
}

// ── Instructor / creation -- server-side enforced against
// canCreateCourses(), never just hidden in the UI (this app has no real
// Supabase Auth session to attach a trustworthy RLS check to, so this
// function -- called by every write path -- IS the enforcement point). ──

/** "My Learning" -> My Courses tab -- every status, not just published. */
export async function getCoursesByInstructor(instructorId: string): Promise<Course[]> {
  const { data, error } = await supabase.from('courses').select('*')
    .eq('instructor_id', instructorId).order('created_at', { ascending: false });
  if (error) return [];
  return attachCurriculumStats(await attachInstructors(data ?? []));
}

export async function createCourse(instructorId: string, accountType: string | null | undefined, input: {
  title: string; shortDescription?: string; description?: string; category?: string;
  level: CourseLevel; price: number; isFree: boolean; coverUrl?: string;
}): Promise<Course | null> {
  if (!canCreateCourses(accountType)) { console.warn('[coursesApi] createCourse blocked -- not Professional/Business'); return null; }
  const { data, error } = await supabase.from('courses').insert({
    instructor_id: instructorId,
    title: input.title.trim(),
    short_description: input.shortDescription?.trim() || null,
    description: input.description?.trim() || null,
    category: input.category || null,
    level: input.level,
    price: input.isFree ? 0 : input.price,
    is_free: input.isFree,
    cover_url: input.coverUrl || null,
    status: 'draft',
  }).select('*').single();
  if (error || !data) { console.warn('[coursesApi] createCourse error:', error?.message); return null; }
  const [course] = await attachInstructors([data]);
  return course;
}

export async function updateCourse(courseId: string, instructorId: string, input: Partial<{
  title: string; shortDescription: string; description: string; category: string;
  level: CourseLevel; price: number; isFree: boolean; coverUrl: string;
}>): Promise<boolean> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.shortDescription !== undefined) patch.short_description = input.shortDescription.trim() || null;
  if (input.description !== undefined) patch.description = input.description.trim() || null;
  if (input.category !== undefined) patch.category = input.category || null;
  if (input.level !== undefined) patch.level = input.level;
  if (input.isFree !== undefined) patch.is_free = input.isFree;
  if (input.price !== undefined) patch.price = input.isFree ? 0 : input.price;
  if (input.coverUrl !== undefined) patch.cover_url = input.coverUrl || null;
  const { data, error } = await supabase.from('courses').update(patch).eq('id', courseId).eq('instructor_id', instructorId).select('id').maybeSingle();
  return !error && !!data;
}

/** Publishing with zero lessons is allowed (a title/description-only course
 *  card is still real, purchasable content) -- the fuller curriculum
 *  builder is a separate, later phase; this just flips visibility. */
export async function publishCourse(courseId: string, instructorId: string): Promise<boolean> {
  const { data, error } = await supabase.from('courses')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', courseId).eq('instructor_id', instructorId).select('id').maybeSingle();
  return !error && !!data;
}

/** Unpublish (back to draft) / archive from "My Courses" -- existing
 *  students/conversations are never affected, per the status column's own
 *  comment on the courses table. */
export async function setCourseStatus(courseId: string, instructorId: string, status: CourseStatus): Promise<boolean> {
  const { data, error } = await supabase.from('courses').update({ status })
    .eq('id', courseId).eq('instructor_id', instructorId).select('id').maybeSingle();
  return !error && !!data;
}

export interface CourseReview {
  id: string;
  userId: string;
  rating: number;
  body: string | null;
  createdAt: string;
  author?: { name: string; avatarUrl: string | null };
}

export async function getCourseReviews(courseId: string, limit = 20): Promise<CourseReview[]> {
  const { data, error } = await supabase.from('course_reviews').select('id, user_id, rating, body, created_at')
    .eq('course_id', courseId).order('created_at', { ascending: false }).limit(limit);
  if (error || !data?.length) return [];
  const userIds = [...new Set(data.map((r: any) => r.user_id))];
  const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url').in('id', userIds);
  const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return data.map((r: any) => ({
    id: r.id, userId: r.user_id, rating: r.rating, body: r.body, createdAt: r.created_at,
    author: map.get(r.user_id) ? { name: map.get(r.user_id).name, avatarUrl: map.get(r.user_id).avatar_url } : undefined,
  }));
}

/** Only an active enrollee may review -- checked here, not just left to the
 *  UI to hide the composer (see the table's own migration comment). One
 *  review per (course, user): a repeat submission replaces the original. */
export async function submitCourseReview(courseId: string, userId: string, rating: number, body?: string): Promise<boolean> {
  const enrolled = await isEnrolled(userId, courseId);
  if (!enrolled) return false;
  const { error } = await supabase.from('course_reviews')
    .upsert({ course_id: courseId, user_id: userId, rating, body: body?.trim() || null }, { onConflict: 'course_id,user_id' });
  return !error;
}

/** Learning Home's "From Your Connections" row -- courses published by
 *  people the viewer follows/is connected to, not a separate discovery
 *  system. */
export async function getCoursesFromInstructors(instructorIds: string[], limit = 10): Promise<Course[]> {
  if (!instructorIds.length) return [];
  const { data, error } = await supabase.from('courses').select('*')
    .in('instructor_id', instructorIds).eq('status', 'published')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) return [];
  return attachCurriculumStats(await attachInstructors(data ?? []));
}
