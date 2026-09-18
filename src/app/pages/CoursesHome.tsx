// FILMONS Courses -- /courses. Foundation phase: browse only, no
// purchase/enrollment yet (see coursesApi.ts's own header comment). No
// "Continue Learning" row for the same reason -- there's no real progress
// data to show until enrollment exists, and a fake/empty row would be
// worse than no row at all.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, ChevronRight, GraduationCap } from 'lucide-react';
import { getCourses, getPopularCourses, type Course } from '../lib/coursesApi';
import { PORTFOLIO_CATEGORIES } from '../lib/portfolioApi';
import { getTrustLevelsBatch, type TrustLevel } from '../lib/trustApi';
import { CourseCard } from '../components/courses/CourseCard';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';

const CHIPS = ['For You', ...PORTFOLIO_CATEGORIES.slice(0, 8)];

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

export function CoursesHome() {
  const navigate = useNavigate();
  const [chip, setChip] = useState('For You');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [recommended, setRecommended] = useState<Course[]>([]);
  const [popular, setPopular] = useState<Course[]>([]);
  const [newest, setNewest] = useState<Course[]>([]);
  const [searchResults, setSearchResults] = useState<Course[] | null>(null);
  const [trustLevels, setTrustLevels] = useState<Map<string, TrustLevel>>(new Map());

  const category = chip === 'For You' ? undefined : chip;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getCourses({ category, limit: 12 }),
      getPopularCourses(category, 12),
      getCourses({ category, limit: 12 }), // already newest-first
    ]).then(async ([rec, pop, fresh]) => {
      setRecommended(rec);
      setPopular(pop);
      setNewest(fresh);
      const ids = [...new Set([...rec, ...pop, ...fresh].map(c => c.instructorId))];
      if (ids.length) setTrustLevels(await getTrustLevelsBatch(ids));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [chip]);

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
        <p className="text-xl font-black text-gray-900">Courses</p>
        <p className="text-sm text-gray-400 mt-0.5">Learn from creators.</p>

        <div className="relative mt-3">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search courses…"
            className="w-full bg-gray-100 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-50 focus:ring-1 focus:ring-gray-200 transition-colors"
          />
        </div>

        {!query.trim() && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar mt-3 -mx-4 px-4 lg:mx-0 lg:px-0">
            {CHIPS.map(c => (
              <button
                key={c}
                onClick={() => setChip(c)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  chip === c ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 border border-gray-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

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
            <CourseRow title="Recommended for You" courses={recommended} trustLevels={trustLevels} />
            <CourseRow title={category ? `Popular in ${category}` : 'Popular'} courses={popular} trustLevels={trustLevels} />
            <CourseRow title="New Courses" courses={newest} trustLevels={trustLevels} />
          </>
        )}
      </div>
    </div>
  );
}
