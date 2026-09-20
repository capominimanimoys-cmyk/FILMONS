// FILMONS Learning -- /learning. Its own product area, separate from
// Marketplace (courses are educational products, not listings) though it
// shares the app's design system (cards, spacing, radius) rather than
// looking like a bolted-on separate app.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, ChevronRight, GraduationCap, Video, Camera, Music2, Drama, Scissors, AudioWaveform, Lightbulb, Briefcase } from 'lucide-react';
import {
  getCourses, getPopularCourses, getMyEnrollments, getCoursesFromInstructors,
  type Course, type EnrolledCourse,
} from '../lib/coursesApi';
import { listConnections } from '../lib/connectionsApi';
import { getTrustLevelsBatch, type TrustLevel } from '../lib/trustApi';
import { CourseCard } from '../components/courses/CourseCard';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import { useAuth } from '../context/AuthContext';

const CATEGORIES = [
  { label: 'Filmmaking', Icon: Video },
  { label: 'Photography', Icon: Camera },
  { label: 'Music', Icon: Music2 },
  { label: 'Acting', Icon: Drama },
  { label: 'Editing', Icon: Scissors },
  { label: 'Audio', Icon: AudioWaveform },
  { label: 'Lighting', Icon: Lightbulb },
  { label: 'Business', Icon: Briefcase },
];

function CourseRow({ title, courses, trustLevels, onSeeAll }: {
  title: string; courses: Course[]; trustLevels: Map<string, TrustLevel>; onSeeAll?: () => void;
}) {
  if (!courses.length) return null;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-4 lg:px-0">
        <p className="text-sm font-black text-gray-900">{title}</p>
        {onSeeAll && (
          <button onClick={onSeeAll} className="flex items-center gap-0.5 text-xs font-bold text-blue-600">
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
        <p className="text-sm font-black text-gray-900">Continue Learning</p>
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
            <button onClick={() => navigate(`/course/${c.id}`)} className="w-full mt-2.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold">Continue</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CoursesHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [recommended, setRecommended] = useState<Course[]>([]);
  const [popular, setPopular] = useState<Course[]>([]);
  const [newest, setNewest] = useState<Course[]>([]);
  const [fromConnections, setFromConnections] = useState<Course[]>([]);
  const [continueLearning, setContinueLearning] = useState<EnrolledCourse[]>([]);
  const [searchResults, setSearchResults] = useState<Course[] | null>(null);
  const [trustLevels, setTrustLevels] = useState<Map<string, TrustLevel>>(new Map());

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getCourses({ category, limit: 12 }),
      getPopularCourses(category, 12),
      getCourses({ category, limit: 12 }),
      user ? getMyEnrollments(user.id) : Promise.resolve([]),
      user ? listConnections(user.id).then(rows => getCoursesFromInstructors(rows.map(r => r.otherUser.id))) : Promise.resolve([]),
    ]).then(async ([rec, pop, fresh, enrolled, connCourses]) => {
      setRecommended(rec);
      setPopular(pop);
      setNewest(fresh);
      setContinueLearning((enrolled as EnrolledCourse[]).filter(c => c.progressPercent > 0 && c.progressPercent < 100));
      setFromConnections(connCourses as Course[]);
      const ids = [...new Set([...rec, ...pop, ...fresh, ...(connCourses as Course[])].map(c => c.instructorId))];
      if (ids.length) setTrustLevels(await getTrustLevelsBatch(ids));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [category, user?.id]);

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
      <div className="bg-white border-b border-gray-100 px-4 lg:px-0 pt-4 pb-3 lg:max-w-4xl lg:mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xl font-black text-gray-900">FILMONS Learning</p>
            <p className="text-sm text-gray-400 mt-0.5">Learn. Create. Grow.</p>
          </div>
          <button onClick={() => navigate('/my-learning')} className="shrink-0 px-3 py-1.5 rounded-full bg-gray-100 text-xs font-bold text-gray-600">
            My Learning
          </button>
        </div>

        <div className="relative mt-3">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search courses, skills, instructors…"
            className="w-full bg-gray-100 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-50 focus:ring-1 focus:ring-gray-200 transition-colors"
          />
        </div>
      </div>

      {!query.trim() && (
        <div className="lg:max-w-4xl lg:mx-auto">
          {/* Featured banner */}
          <div className="mx-4 lg:mx-0 mt-4 rounded-2xl overflow-hidden relative" style={{ aspectRatio: '16/7', background: 'linear-gradient(135deg,#111827,#1f2937)' }}>
            <div className="absolute inset-0 flex flex-col items-start justify-end p-4">
              <p className="text-white text-lg font-black leading-tight">Real skills<br />for real creators.</p>
            </div>
          </div>

          {/* Categories */}
          <div className="px-4 lg:px-0 mt-5">
            <p className="text-sm font-black text-gray-900 mb-2.5">Categories</p>
            <div className="grid grid-cols-4 gap-2.5">
              {CATEGORIES.map(c => (
                <button key={c.label} onClick={() => setCategory(prev => prev === c.label ? undefined : c.label)}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border ${category === c.label ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-100'}`}>
                  <c.Icon className={`w-5 h-5 ${category === c.label ? 'text-white' : 'text-gray-500'}`} />
                  <span className={`text-[10px] font-bold ${category === c.label ? 'text-white' : 'text-gray-600'}`}>{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="lg:max-w-4xl lg:mx-auto py-5 space-y-6">
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
            <p className="text-xs text-gray-400 max-w-[240px]">
              {category ? `No published courses in ${category} yet.` : 'Check back soon as creators start publishing courses.'}
            </p>
          </div>
        ) : (
          <>
            <CourseRow title="For You" courses={recommended} trustLevels={trustLevels} onSeeAll={() => setCategory(undefined)} />
            <ContinueLearningRow courses={continueLearning} onSeeAll={() => navigate('/my-learning')} />
            <CourseRow title={category ? `Popular in ${category}` : 'Popular on FILMONS'} courses={popular} trustLevels={trustLevels} />
            <CourseRow title="From Your Connections" courses={fromConnections} trustLevels={trustLevels} />
            <CourseRow title="New Courses" courses={newest} trustLevels={trustLevels} />
          </>
        )}
      </div>
    </div>
  );
}
