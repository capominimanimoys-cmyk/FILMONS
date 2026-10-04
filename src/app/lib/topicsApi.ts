// FILMONS Learning topics -- what Explore, Trending topics, Recent topics
// and a topic's own course list are built on. A "topic" is a normalized
// tag ('videoediting'): every hashtag a published course mentions (see
// hashtagsApi.ts's hashtag_mentions, content_type 'course') plus each
// course's own category/subcategory, normalized the same way, so a course
// with no hashtags still belongs to its category's topic. Topics the
// instructor picks in the course builder (courses.topics) count too.
//
// Ranking is computed client-side from the open course tables (same RLS
// model as coursesApi.ts) over a bounded window -- fine at Learning's
// current catalog size; move into an RPC if the catalog grows large.
import { supabase } from '../../lib/supabase';
import { normalizeHashtag } from './hashtagsApi';
import { getCoursesByIds, type Course } from './coursesApi';

export interface Topic {
  tag: string;
  courseCount: number;
}

export interface TrendingTopic extends Topic {
  score: number;
  views: number;
  saves: number;
  enrollments: number;
}

export interface RecentTopic extends Topic {
  /** Publication date of the topic's newest course. */
  latestPublishedAt: string;
  latestCourseTitle: string;
}

export type TopicSort = 'recommended' | 'latest' | 'popular';

// Weights for the trending score: an enrollment is a much stronger signal
// than a save, and a save stronger than a view.
const WEIGHTS = { view: 1, save: 3, enrollment: 5 };
const TRENDING_WINDOW_DAYS = 30;
const CATALOG_LIMIT = 1000;

export function topicLabel(tag: string): string {
  return `#${tag}`;
}

function normalizeTopic(input: string | null | undefined): string | null {
  if (!input) return null;
  const tag = normalizeHashtag(input).replace(/[^a-z0-9_]/g, '');
  return tag || null;
}

// ── Topic index: topic -> published courses ──────────────────────────────
interface CatalogCourse { id: string; title: string; publishedAt: string }
interface TopicIndex {
  courses: Map<string, CatalogCourse>;
  topicCourses: Map<string, Set<string>>;
}

let indexCache: { at: number; promise: Promise<TopicIndex> } | null = null;
const INDEX_TTL_MS = 60_000;

async function buildTopicIndex(): Promise<TopicIndex> {
  const catalog = (cols: string) => supabase.from('courses')
    .select(cols)
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(CATALOG_LIMIT);
  let { data: rows, error } = await catalog('id, title, category, subcategory, topics, published_at, created_at');
  // Before the course-builder migration there's no topics column yet.
  if (error) ({ data: rows, error } = await catalog('id, title, category, subcategory, published_at, created_at'));
  if (error) console.warn('[topicsApi] catalog error:', error.message);

  const courses = new Map<string, CatalogCourse>();
  const topicCourses = new Map<string, Set<string>>();
  const add = (tag: string | null, courseId: string) => {
    if (!tag) return;
    if (!topicCourses.has(tag)) topicCourses.set(tag, new Set());
    topicCourses.get(tag)!.add(courseId);
  };

  for (const r of (rows ?? []) as any[]) {
    courses.set(r.id, { id: r.id, title: r.title, publishedAt: r.published_at || r.created_at });
    add(normalizeTopic(r.category), r.id);
    add(normalizeTopic(r.subcategory), r.id);
    for (const t of (Array.isArray(r.topics) ? r.topics : [])) add(normalizeTopic(t), r.id);
  }

  const ids = [...courses.keys()];
  for (let i = 0; i < ids.length; i += 200) {
    const { data: mentions } = await supabase.from('hashtag_mentions')
      .select('content_id, hashtags(tag)')
      .eq('content_type', 'course')
      .in('content_id', ids.slice(i, i + 200));
    for (const m of (mentions ?? []) as any[]) {
      const tag = Array.isArray(m.hashtags) ? m.hashtags[0]?.tag : m.hashtags?.tag;
      add(normalizeTopic(tag), m.content_id);
    }
  }
  return { courses, topicCourses };
}

function getTopicIndex(): Promise<TopicIndex> {
  if (!indexCache || Date.now() - indexCache.at > INDEX_TTL_MS) {
    indexCache = { at: Date.now(), promise: buildTopicIndex() };
  }
  return indexCache.promise;
}

// ── Engagement signals (views, saves, enrollments) per course ────────────
interface CourseSignals { views: number; saves: number; enrollments: number }

async function getCourseSignals(sinceDays: number): Promise<Map<string, CourseSignals>> {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  // Each read degrades to "no signal" on its own (e.g. course_views not
  // migrated yet) rather than failing the whole ranking.
  const [views, saves, enrollments] = await Promise.all([
    supabase.from('course_views').select('course_id').gte('created_at', since).limit(20_000),
    supabase.from('course_saves').select('course_id').gte('created_at', since).limit(20_000),
    supabase.from('course_enrollments').select('course_id').eq('status', 'active').gte('enrolled_at', since).limit(20_000),
  ]);
  const map = new Map<string, CourseSignals>();
  const bump = (rows: any[] | null, key: keyof CourseSignals) => {
    for (const r of rows ?? []) {
      const s = map.get(r.course_id) ?? { views: 0, saves: 0, enrollments: 0 };
      s[key] += 1;
      map.set(r.course_id, s);
    }
  };
  bump(views.error ? null : views.data, 'views');
  bump(saves.error ? null : saves.data, 'saves');
  bump(enrollments.error ? null : enrollments.data, 'enrollments');
  return map;
}

function signalScore(s: CourseSignals | undefined): number {
  return s ? s.views * WEIGHTS.view + s.saves * WEIGHTS.save + s.enrollments * WEIGHTS.enrollment : 0;
}

/** Topics ranked by recent course views, saves and enrollments. */
export async function getTrendingTopics(limit = 30): Promise<TrendingTopic[]> {
  const [index, signals] = await Promise.all([getTopicIndex(), getCourseSignals(TRENDING_WINDOW_DAYS)]);
  const out: TrendingTopic[] = [];
  for (const [tag, ids] of index.topicCourses) {
    const t: TrendingTopic = { tag, courseCount: ids.size, score: 0, views: 0, saves: 0, enrollments: 0 };
    for (const id of ids) {
      const s = signals.get(id);
      if (!s) continue;
      t.views += s.views; t.saves += s.saves; t.enrollments += s.enrollments;
    }
    t.score = signalScore(t);
    if (t.score > 0) out.push(t);
  }
  return out.sort((a, b) => b.score - a.score || b.courseCount - a.courseCount).slice(0, limit);
}

/** Topics of newly published courses, newest publication first. */
export async function getRecentTopics(limit = 30): Promise<RecentTopic[]> {
  const index = await getTopicIndex();
  const out: RecentTopic[] = [];
  for (const [tag, ids] of index.topicCourses) {
    let latest: CatalogCourse | null = null;
    for (const id of ids) {
      const c = index.courses.get(id);
      if (c && (!latest || c.publishedAt > latest.publishedAt)) latest = c;
    }
    if (latest) out.push({ tag, courseCount: ids.size, latestPublishedAt: latest.publishedAt, latestCourseTitle: latest.title });
  }
  return out.sort((a, b) => b.latestPublishedAt.localeCompare(a.latestPublishedAt)).slice(0, limit);
}

/** Published courses in a topic, sorted for the topic page. */
export async function getTopicCourses(tagInput: string, sort: TopicSort): Promise<Course[]> {
  const tag = normalizeTopic(tagInput);
  if (!tag) return [];
  const index = await getTopicIndex();
  const ids = [...(index.topicCourses.get(tag) ?? [])];
  if (!ids.length) return [];
  const courses = await getCoursesByIds(ids);
  const published = (c: Course) => c.publishedAt || c.createdAt;

  if (sort === 'latest') return courses.sort((a, b) => published(b).localeCompare(published(a)));
  if (sort === 'popular') return courses.sort((a, b) => b.studentCount - a.studentCount || b.ratingAvg - a.ratingAvg);

  // Recommended: overall quality (rating, weighted by how many ratings
  // back it), reach (students), current momentum (recent engagement) and
  // a freshness bump for courses published in the last 30 days.
  const signals = await getCourseSignals(TRENDING_WINDOW_DAYS);
  const now = Date.now();
  const score = (c: Course) => {
    const ratingConfidence = Math.min(c.ratingCount, 20) / 20;
    const fresh = now - new Date(published(c)).getTime() < 30 * 86_400_000 ? 1 : 0;
    return c.ratingAvg * ratingConfidence * 1.5
      + Math.log1p(c.studentCount) * 2
      + Math.log1p(signalScore(signals.get(c.id)))
      + fresh;
  };
  return courses.sort((a, b) => score(b) - score(a));
}

// ── Signals written from the course page ─────────────────────────────────
const VIEWED_KEY = 'filmons_learning_viewed';

/** Counts one course-detail view per course per tab session. */
export function recordCourseView(courseId: string, viewerId?: string | null) {
  try {
    const seen: string[] = JSON.parse(sessionStorage.getItem(VIEWED_KEY) || '[]');
    if (seen.includes(courseId)) return;
    sessionStorage.setItem(VIEWED_KEY, JSON.stringify([...seen, courseId].slice(-200)));
  } catch {}
  supabase.from('course_views').insert({ course_id: courseId, viewer_id: viewerId ?? null })
    .then(({ error }) => { if (error) console.warn('[topicsApi] view not recorded:', error.message); });
}

export async function isCourseSaved(userId: string, courseId: string): Promise<boolean> {
  const { data } = await supabase.from('course_saves').select('id').eq('user_id', userId).eq('course_id', courseId).maybeSingle();
  return !!data;
}

export async function setCourseSaved(userId: string, courseId: string, saved: boolean): Promise<boolean> {
  const { error } = saved
    ? await supabase.from('course_saves').upsert({ user_id: userId, course_id: courseId }, { onConflict: 'user_id,course_id', ignoreDuplicates: true })
    : await supabase.from('course_saves').delete().eq('user_id', userId).eq('course_id', courseId);
  if (error) console.warn('[topicsApi] save failed:', error.message);
  return !error;
}

export async function getSavedCourses(userId: string): Promise<Course[]> {
  const { data, error } = await supabase.from('course_saves').select('course_id').eq('user_id', userId).order('created_at', { ascending: false });
  if (error || !data?.length) return [];
  const order = data.map((r: any) => r.course_id as string);
  const courses = await getCoursesByIds(order);
  const byId = new Map(courses.map(c => [c.id, c]));
  return order.map(id => byId.get(id)).filter((c): c is Course => !!c);
}
