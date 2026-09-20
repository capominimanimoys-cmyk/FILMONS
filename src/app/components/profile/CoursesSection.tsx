// Profile's Courses section -- published Filmons Learning courses by this
// creator, per the "FILMONS is a distribution/discovery surface for
// Learning courses" spec. Self-fetching (unlike most of ProfileAllTab's
// siblings, which take their data as props) since neither Profile.tsx nor
// HostProfile.tsx fetch course data today -- keeps this additive rather
// than threading a new prop through both pages' already-large load()
// functions. Hidden entirely for a creator with no published courses
// (never an empty placeholder), per this app's no-hardcoded-example-data
// rule. Course editing/management never happens here -- "Manage courses"
// deep-links into Filmons Learning's own My Learning/instructor view,
// same as every other Learning action in the main app.
import { useEffect, useState } from 'react';
import { getCourses, type Course } from '../../lib/coursesApi';
import { CourseCard } from '../courses/CourseCard';
import { useLearningTransition } from '../../context/LearningTransitionContext';

export function CoursesSection({ userId, isOwner }: { userId: string; isOwner: boolean }) {
  const { enterLearning } = useLearningTransition();
  const [courses, setCourses] = useState<Course[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCourses({ instructorId: userId, status: 'published', limit: 12 }).then(c => { if (!cancelled) setCourses(c); });
    return () => { cancelled = true; };
  }, [userId]);

  if (!courses?.length) return null;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-black text-gray-900">Courses</p>
        {isOwner && (
          <button onClick={() => enterLearning('/my-learning')} className="text-xs font-semibold text-blue-600 hover:underline">
            Manage courses
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {courses.map(c => <CourseCard key={c.id} course={c} />)}
      </div>
    </section>
  );
}
