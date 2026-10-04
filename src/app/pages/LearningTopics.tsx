// FILMONS Learning topic pages (see lib/topicsApi.ts for what a topic is
// and how each list is ranked):
//   /explore           -- previews of Trending + Recent topics, View all
//   /topics/trending   -- ranked by recent course views, saves, enrollments
//   /topics/recent     -- topics of newly published courses, newest first
//   /topic/:tag        -- that topic's courses, Recommended · Latest · Popular
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, Clock, GraduationCap, TrendingUp } from 'lucide-react';
import {
  getRecentTopics, getTopicCourses, getTrendingTopics, topicLabel,
  type RecentTopic, type TopicSort, type TrendingTopic,
} from '../lib/topicsApi';
import { type Course } from '../lib/coursesApi';
import { getTrustLevelsBatch, type TrustLevel } from '../lib/trustApi';
import { CourseCard } from '../components/courses/CourseCard';
import {
  EmptyState, LearningPage, ListSkeleton, PageTitle, SectionTitle, TopicRow, plural, timeAgo,
} from '../components/learning/LearningPageParts';

function trendingMeta(t: TrendingTopic): string {
  const parts = [plural(t.courseCount, 'course')];
  if (t.enrollments) parts.push(plural(t.enrollments, 'enrollment'));
  if (t.saves) parts.push(plural(t.saves, 'save'));
  if (t.views) parts.push(plural(t.views, 'view'));
  return parts.join(' · ');
}

function recentMeta(t: RecentTopic): string {
  return `New: ${t.latestCourseTitle} · ${timeAgo(t.latestPublishedAt)}`;
}

const TRENDING_EMPTY = <EmptyState icon={<TrendingUp className="h-9 w-9" />} title="Nothing trending yet"
  body="Topics show up here as people view, save and enroll in courses." />;
const RECENT_EMPTY = <EmptyState icon={<Clock className="h-9 w-9" />} title="No new topics yet"
  body="Topics from newly published courses will appear here." />;

export function LearningExplore() {
  const navigate = useNavigate();
  const [trending, setTrending] = useState<TrendingTopic[] | null>(null);
  const [recent, setRecent] = useState<RecentTopic[] | null>(null);

  useEffect(() => {
    getTrendingTopics(5).then(setTrending).catch(() => setTrending([]));
    getRecentTopics(5).then(setRecent).catch(() => setRecent([]));
  }, []);

  return (
    <LearningPage>
      <PageTitle title="Explore" subtitle="Find what creators are learning right now." />
      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle title="Trending topics" subtitle="Most viewed, saved and enrolled lately." onViewAll={() => navigate('/topics/trending')} />
          {trending === null ? <ListSkeleton rows={5} /> : trending.length === 0 ? TRENDING_EMPTY : (
            <div className="space-y-2">{trending.map((t, i) => <TopicRow key={t.tag} tag={t.tag} rank={i + 1} meta={trendingMeta(t)} />)}</div>
          )}
        </section>
        <section>
          <SectionTitle title="Recent topics" subtitle="From newly published courses." onViewAll={() => navigate('/topics/recent')} />
          {recent === null ? <ListSkeleton rows={5} /> : recent.length === 0 ? RECENT_EMPTY : (
            <div className="space-y-2">{recent.map(t => <TopicRow key={t.tag} tag={t.tag} meta={recentMeta(t)} />)}</div>
          )}
        </section>
      </div>
    </LearningPage>
  );
}

export function TrendingTopicsPage() {
  const [topics, setTopics] = useState<TrendingTopic[] | null>(null);
  useEffect(() => { getTrendingTopics(50).then(setTopics).catch(() => setTopics([])); }, []);
  return (
    <LearningPage>
      <PageTitle title="Trending topics" subtitle="Ranked by course views, saves and enrollments over the last 30 days." />
      {topics === null ? <ListSkeleton /> : topics.length === 0 ? TRENDING_EMPTY : (
        <div className="space-y-2">{topics.map((t, i) => <TopicRow key={t.tag} tag={t.tag} rank={i + 1} meta={trendingMeta(t)} />)}</div>
      )}
    </LearningPage>
  );
}

export function RecentTopicsPage() {
  const [topics, setTopics] = useState<RecentTopic[] | null>(null);
  useEffect(() => { getRecentTopics(50).then(setTopics).catch(() => setTopics([])); }, []);
  return (
    <LearningPage>
      <PageTitle title="Recent topics" subtitle="Topics from newly published courses, newest first." />
      {topics === null ? <ListSkeleton /> : topics.length === 0 ? RECENT_EMPTY : (
        <div className="space-y-2">{topics.map(t => <TopicRow key={t.tag} tag={t.tag} meta={recentMeta(t)} />)}</div>
      )}
    </LearningPage>
  );
}

const SORTS: { id: TopicSort; label: string }[] = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'latest', label: 'Latest' },
  { id: 'popular', label: 'Popular' },
];

export function TopicCoursesPage() {
  const navigate = useNavigate();
  const { tag = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const sortParam = searchParams.get('sort') as TopicSort | null;
  const sort: TopicSort = SORTS.some(s => s.id === sortParam) ? sortParam! : 'recommended';
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [trust, setTrust] = useState<Map<string, TrustLevel>>(new Map());

  useEffect(() => {
    let cancelled = false;
    setCourses(null);
    getTopicCourses(tag, sort).then(async list => {
      if (cancelled) return;
      setCourses(list);
      const ids = [...new Set(list.map(c => c.instructorId))];
      if (ids.length) getTrustLevelsBatch(ids).then(m => { if (!cancelled) setTrust(m); }).catch(() => {});
    }).catch(() => { if (!cancelled) setCourses([]); });
    return () => { cancelled = true; };
  }, [tag, sort]);

  return (
    <LearningPage>
      <button data-pop onClick={() => navigate(-1)} className="-ml-1 mb-3 flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>
      <PageTitle title={<span className="text-blue-600">{topicLabel(tag)}</span>}
        subtitle={courses ? plural(courses.length, 'course') : 'Loading courses…'} />

      <div data-pop role="tablist" aria-label="Sort courses" className="mb-5 inline-flex rounded-full bg-gray-100 p-1">
        {SORTS.map((s, i) => (
          <span key={s.id} className="flex items-center">
            {i > 0 && <span aria-hidden className="px-0.5 text-gray-300">·</span>}
            <button role="tab" aria-selected={sort === s.id}
              onClick={() => setSearchParams(s.id === 'recommended' ? {} : { sort: s.id }, { replace: true })}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${sort === s.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
              {s.label}
            </button>
          </span>
        ))}
      </div>

      {courses === null ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState icon={<GraduationCap className="h-9 w-9" />} title="No courses in this topic yet" />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {courses.map(c => <div key={c.id} data-pop><CourseCard course={c} trustLevel={trust.get(c.instructorId)} /></div>)}
        </div>
      )}
    </LearningPage>
  );
}
