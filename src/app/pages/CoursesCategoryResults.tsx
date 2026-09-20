// FILMONS Browse Search -- /search/category/courses. All Courses matching
// the active search query. Mirrors HashtagCategoryResults.tsx's structure;
// reuses the existing CourseCard (no search-specific course card).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Search } from 'lucide-react';
import { getCourses, type Course } from '../lib/coursesApi';
import { CourseCard } from '../components/courses/CourseCard';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';

export function CoursesCategoryResults({ query: initialQuery }: { query?: string }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [results, setResults] = useState<Course[] | null>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setResults(null);
    const t = setTimeout(() => { getCourses({ query, limit: 50 }).then(setResults); }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <p className="text-sm font-bold text-gray-900">Courses</p>
      </div>

      <div className="lg:max-w-4xl lg:mx-auto px-4 py-4 space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query} onChange={e => setQuery(e.target.value)} placeholder="Search courses…"
            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-blue-300"
          />
        </div>

        {!query.trim() ? (
          <p className="text-center text-sm text-gray-400 py-16">Search courses to get started.</p>
        ) : results === null ? (
          <div className="flex justify-center py-16"><FilmonsBrandLoader size="md" label="Searching" /></div>
        ) : results.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-16">No courses matching "{query}"</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {results.map(c => <CourseCard key={c.id} course={c} />)}
          </div>
        )}
      </div>
    </div>
  );
}
