// FILMONS Learning Home -- filmons.app/learning for now (see
// learningOrigin.ts). Cinematic, creator-
// focused redesign inspired by LinkedIn Learning's information
// architecture (personalized rails, role/tool-based recommendations,
// continue-learning, instructor discovery) without copying its visual
// design. Personalized sections only ever render when the underlying
// Filmons profile data actually exists (no primaryRole -> no "Recommended
// because you're a ___" section, no gear -> no tool section) -- never an
// awkward placeholder for missing data.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Search, ChevronRight, GraduationCap, ArrowRight, PlayCircle,
  Users2, BookOpen, Award, Globe2, BadgeCheck,
} from 'lucide-react';
import {
  getCourses, getPopularCourses, getMyEnrollments, getCoursesFromInstructors,
  getTopInstructors,
  type Course, type EnrolledCourse, type TopInstructor,
} from '../lib/coursesApi';
import { getDisplayIdentity } from '../lib/displayIdentity';
import { listConnections } from '../lib/connectionsApi';
import { getTrustLevelsBatch, type TrustLevel } from '../lib/trustApi';
import { CourseCard } from '../components/courses/CourseCard';
import { UserAvatar } from '../components/AccountTypeBadge';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import { useAuth } from '../context/AuthContext';
import { useFollow } from '../context/FollowContext';

// Discovery chips + "Popular right now" topics -- Learning's own light
// topic vocabulary, distinct from the removed category grid. Still just a
// starting set of real, functional search shortcuts (each one runs an
// actual query), not a fixed taxonomy courses are locked into.
const TOPIC_TAGS = ['filmmaking', 'videoediting', 'photography', 'music', 'acting', 'lighting', 'business', 'contentcreation'];

function toArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

function CourseRow({ title, subtitle, courses, trustLevels, onSeeAll, highlight }: {
  title: string; subtitle?: string; courses: Course[]; trustLevels: Map<string, TrustLevel>; onSeeAll?: () => void;
  /** The dynamic role/tool name, rendered in Filmons blue within the title. */
  highlight?: string;
}) {
  if (!courses.length) return null;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-4 lg:px-0">
        <div className="min-w-0">
          <p className="text-base font-black text-gray-900 truncate">
            {highlight ? (
              <>{title.split(highlight)[0]}<span className="text-blue-600">{highlight}</span>{title.split(highlight)[1]}</>
            ) : title}
          </p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {onSeeAll && (
          <button onClick={onSeeAll} className="shrink-0 flex items-center gap-0.5 text-xs font-bold text-blue-600">
            See all <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 lg:px-0">
        {courses.map(c => (
          <div key={c.id} className="shrink-0 w-56">
            <CourseCard course={c} trustLevel={trustLevels.get(c.instructorId)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ContinueLearningRow({ courses, onSeeAll }: { courses: EnrolledCourse[]; onSeeAll: () => void }) {
  const navigate = useNavigate();
  if (!courses.length) return null;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-4 lg:px-0">
        <div>
          <p className="text-base font-black text-gray-900">Continue learning</p>
          <p className="text-xs text-gray-400 mt-0.5">Pick up where you left off.</p>
        </div>
        <button onClick={onSeeAll} className="flex items-center gap-0.5 text-xs font-bold text-blue-600">See all <ChevronRight className="w-3.5 h-3.5" /></button>
      </div>
      <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 lg:px-0">
        {courses.map(c => (
          <div key={c.id} className="shrink-0 w-64 bg-white rounded-2xl border border-gray-100 p-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                {c.coverUrl ? <img src={c.coverUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-lg">🎬</div>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-900 truncate">{c.title}</p>
                <p className="text-[11px] text-gray-400 truncate">{c.instructor?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2.5">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-blue-600 rounded-full" style={{ width: `${c.progressPercent}%` }} /></div>
              <span className="text-[10px] font-bold text-gray-400 shrink-0">{c.progressPercent}%</span>
            </div>
            <button onClick={() => navigate(`/course/${c.id}`)} className="w-full mt-2.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1.5">
              <PlayCircle className="w-3.5 h-3.5" /> Continue
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function InstructorCard({ instructor }: { instructor: TopInstructor }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isFollowing, isPending, follow } = useFollow();
  const following = isFollowing(instructor.id) || isPending(instructor.id);
  const isSelf = user?.id === instructor.id;

  return (
    <div className="shrink-0 w-40 bg-white rounded-2xl border border-gray-100 p-4 flex flex-col items-center text-center">
      <button onClick={() => navigate(`/host/${instructor.id}`)}>
        <UserAvatar user={{ id: instructor.id, name: instructor.name, avatar: instructor.avatar_url ?? undefined }} size={64} />
      </button>
      <div className="flex items-center gap-1 mt-2.5 min-w-0 max-w-full">
        <p className="text-sm font-black text-gray-900 truncate">{instructor.name}</p>
        {instructor.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 fill-blue-100 shrink-0" />}
      </div>
      {getDisplayIdentity({ accountType: instructor.account_type, primaryRole: instructor.primary_role, businessIndustry: instructor.business_industry }) && (
        <p className="text-xs text-gray-400 truncate w-full mt-0.5">
          {getDisplayIdentity({ accountType: instructor.account_type, primaryRole: instructor.primary_role, businessIndustry: instructor.business_industry })}
        </p>
      )}
      {instructor.studentCount > 0 && (
        <p className="text-[11px] font-semibold text-gray-400 mt-1">{instructor.studentCount.toLocaleString()} learner{instructor.studentCount === 1 ? '' : 's'}</p>
      )}
      {!isSelf && (
        <button
          onClick={() => follow(instructor.id)}
          disabled={following}
          className={`mt-3 w-full py-1.5 rounded-full text-xs font-black ${following ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 text-white'}`}
        >
          {following ? 'Following' : 'Follow'}
        </button>
      )}
    </div>
  );
}

export function CoursesHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [recommended, setRecommended] = useState<Course[]>([]);
  const [popular, setPopular] = useState<Course[]>([]);
  const [newest, setNewest] = useState<Course[]>([]);
  const [fromConnections, setFromConnections] = useState<Course[]>([]);
  const [byRole, setByRole] = useState<Course[]>([]);
  const [byTool, setByTool] = useState<Course[]>([]);
  const [continueLearning, setContinueLearning] = useState<EnrolledCourse[]>([]);
  const [topInstructors, setTopInstructors] = useState<TopInstructor[]>([]);
  const [searchResults, setSearchResults] = useState<Course[] | null>(null);
  const [trustLevels, setTrustLevels] = useState<Map<string, TrustLevel>>(new Map());

  // First tool from the creator's own gear/software list -- per spec,
  // multiple tools don't each get a homepage section; the rest are only
  // reachable through search/Explore. profile_meta's gear array already
  // mixes software and physical equipment, matching the spec's own "tools
  // can include both" note.
  const primaryTool = useMemo(() => toArr((user as any)?.gear ?? user?.profileMeta?.gear)[0], [user]);
  const primaryRole = user?.primaryRole?.trim() || null;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getCourses({ limit: 12 }),
      getPopularCourses(undefined, 12),
      getCourses({ limit: 12 }),
      user ? getMyEnrollments(user.id) : Promise.resolve([]),
      user ? listConnections(user.id).then(rows => getCoursesFromInstructors(rows.map(r => r.otherUser.id))) : Promise.resolve([]),
      primaryRole ? getCourses({ query: primaryRole, limit: 8 }) : Promise.resolve([]),
      primaryTool ? getCourses({ query: primaryTool, limit: 8 }) : Promise.resolve([]),
      getTopInstructors(6),
    ]).then(async ([rec, pop, fresh, enrolled, connCourses, roleCourses, toolCourses, instructors]) => {
      setRecommended(rec);
      setPopular(pop);
      setNewest(fresh);
      setContinueLearning((enrolled as EnrolledCourse[]).filter(c => c.progressPercent > 0 && c.progressPercent < 100));
      setFromConnections(connCourses as Course[]);
      setByRole(roleCourses as Course[]);
      setByTool(toolCourses as Course[]);
      setTopInstructors(instructors as TopInstructor[]);
      const ids = [...new Set([...rec, ...pop, ...fresh, ...(connCourses as Course[]), ...(roleCourses as Course[]), ...(toolCourses as Course[])].map(c => c.instructorId))];
      if (ids.length) setTrustLevels(await getTrustLevelsBatch(ids));
      setLoading(false);
    }).catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const runSearch = (q: string) => {
    setQuery(q);
  };

  useEffect(() => {
    if (!query.trim()) { setSearchResults(null); return; }
    const t = setTimeout(() => {
      getCourses({ query, limit: 20 }).then(async r => {
        setSearchResults(r);
        const ids = [...new Set(r.map(c => c.instructorId))].filter(id => !trustLevels.has(id));
        if (ids.length) {
          const fresh = await getTrustLevelsBatch(ids);
          setTrustLevels(prev => new Map([...prev, ...fresh]));
        }
      });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const nothingAtAll = !loading && !recommended.length && !popular.length && !newest.length;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* ── Search -- the ONE search bar on this page ── */}
      <div className="bg-white border-b border-gray-100 px-4 lg:px-0 py-3">
        <div className="lg:max-w-5xl lg:mx-auto relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={e => runSearch(e.target.value)}
            placeholder="Search courses, skills, creators, tools, or topics…"
            className="w-full bg-gray-100 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-50 focus:ring-1 focus:ring-gray-200 transition-colors"
          />
        </div>
      </div>

      {!query.trim() && (
        <>
          {/* ── Hero ── */}
          <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#0b0f19,#111827 60%,#1f2937)' }}>
            <div className="lg:max-w-5xl lg:mx-auto px-4 lg:px-0 py-10 lg:py-16">
              <p className="text-[11px] font-black tracking-[0.2em] text-blue-400 uppercase mb-3">Filmons Learning</p>
              <h1 className="text-3xl lg:text-5xl font-black text-white leading-[1.1] max-w-lg">
                Real skills<br />for real <span className="text-blue-400">creators.</span>
              </h1>
              <p className="text-sm lg:text-base text-gray-300 mt-4 max-w-md leading-relaxed">
                Learn from industry professionals. Practical skills. Real projects.
                A stronger future for creators.
              </p>
              <button
                onClick={() => document.getElementById('learning-discover')?.scrollIntoView({ behavior: 'smooth' })}
                className="mt-6 flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700 transition-colors"
              >
                Start Learning <ArrowRight className="w-4 h-4" />
              </button>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-8 pt-6 border-t border-white/10">
                {[
                  { icon: Award, label: 'Industry experts' },
                  { icon: BookOpen, label: 'Practical lessons' },
                  { icon: GraduationCap, label: 'Certificates' },
                  { icon: Globe2, label: 'Global community' },
                ].map(v => (
                  <span key={v.label} className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">
                    <v.icon className="w-3.5 h-3.5 text-blue-400" /> {v.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ── Discovery chips ── */}
          <div id="learning-discover" className="bg-white border-b border-gray-100 py-3">
            <div className="lg:max-w-5xl lg:mx-auto flex items-center gap-2 overflow-x-auto no-scrollbar px-4 lg:px-0">
              <button className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-black bg-blue-600 text-white">All</button>
              {TOPIC_TAGS.map(tag => (
                <button key={tag} onClick={() => runSearch(tag)} className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                  #{tag}
                </button>
              ))}
              <button onClick={() => navigate('/create')} className="shrink-0 flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-bold bg-white border border-gray-200 text-gray-600">
                <Users2 className="w-3.5 h-3.5" /> Creators
              </button>
            </div>
          </div>
        </>
      )}

      <div className="lg:max-w-5xl lg:mx-auto py-6 space-y-8">
        {query.trim() ? (
          searchResults === null ? (
            <div className="flex justify-center py-16"><FilmonsBrandLoader size="md" label="Searching" /></div>
          ) : searchResults.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-16">No courses matching "{query}"</p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 lg:px-0">
              {searchResults.map(c => <CourseCard key={c.id} course={c} trustLevel={trustLevels.get(c.instructorId)} />)}
            </div>
          )
        ) : loading ? (
          <div className="flex justify-center py-16"><FilmonsBrandLoader size="md" label="Loading courses" /></div>
        ) : nothingAtAll ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center px-6">
            <GraduationCap className="w-10 h-10 text-gray-200" />
            <p className="text-sm font-bold text-gray-700">No courses yet</p>
            <p className="text-xs text-gray-400 max-w-[240px]">Check back soon as creators start publishing courses.</p>
          </div>
        ) : (
          <>
            <CourseRow
              title="Recommended for you" subtitle="Handpicked based on your activity and interests."
              courses={recommended} trustLevels={trustLevels}
            />

            {/* Only ever rendered when the underlying Filmons profile data
                exists -- no primaryRole/gear, no awkward empty section. */}
            {primaryRole && byRole.length > 0 && (
              <CourseRow
                title={`Recommended because you are a ${primaryRole}`} highlight={primaryRole}
                subtitle="Skills and knowledge to grow in your role."
                courses={byRole} trustLevels={trustLevels}
                onSeeAll={() => runSearch(primaryRole)}
              />
            )}

            {primaryTool && byTool.length > 0 && (
              <CourseRow
                title={`Recommended because you use ${primaryTool}`} highlight={primaryTool}
                subtitle="Courses tailored to the tools you work with."
                courses={byTool} trustLevels={trustLevels}
                onSeeAll={() => runSearch(primaryTool)}
              />
            )}

            <ContinueLearningRow courses={continueLearning} onSeeAll={() => navigate('/my-learning')} />

            <CourseRow title="Popular right now" subtitle="Trending across Filmons Learning." courses={popular} trustLevels={trustLevels} />
            <CourseRow title="From your connections" courses={fromConnections} trustLevels={trustLevels} />
            <CourseRow title="New courses" courses={newest} trustLevels={trustLevels} />

            {topInstructors.length > 0 && (
              <div className="space-y-2.5">
                <div className="px-4 lg:px-0">
                  <p className="text-base font-black text-gray-900">Top instructors</p>
                  <p className="text-xs text-gray-400 mt-0.5">Learn from real creators making an impact.</p>
                </div>
                <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 lg:px-0">
                  {topInstructors.map(i => <InstructorCard key={i.id} instructor={i} />)}
                </div>
              </div>
            )}

            {/* ── Teach CTA ── */}
            <div className="mx-4 lg:mx-0 rounded-3xl overflow-hidden relative p-6 lg:p-10" style={{ background: 'linear-gradient(135deg,#111827,#1f2937)' }}>
              <p className="text-xl lg:text-2xl font-black text-white">Teach on Filmons Learning</p>
              <p className="text-sm text-gray-300 mt-2 max-w-md leading-relaxed">
                Turn your experience into opportunity. Create a course, reach creators worldwide and earn from your knowledge.
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-4">
                {['Reach a global audience', 'Earn from your knowledge', 'Build your reputation', 'Make an impact'].map(b => (
                  <span key={b} className="text-xs font-semibold text-gray-400">• {b}</span>
                ))}
              </div>
              <button
                onClick={() => navigate('/create')}
                className="mt-5 flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700 transition-colors"
              >
                Create a course <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
