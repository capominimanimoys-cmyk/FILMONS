// Profile's Courses section -- published Filmons Learning courses by this
// creator, per the "FILMONS is a distribution/discovery surface for
// Learning courses" spec. Self-fetching (unlike most of ProfileAllTab's
// siblings, which take their data as props) since neither Profile.tsx nor
// HostProfile.tsx fetch course data today -- keeps this additive rather
// than threading a new prop through both pages' already-large load()
// functions. Hidden entirely for a creator with no published courses
// (never an empty placeholder), per this app's no-hardcoded-example-data
// rule. Course editing/management never happens here -- "Manage courses"
// deep-links into Filmons Learning's Instructor dashboard, same as every
// other Learning action in the main app.
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { getCourses, type Course } from '../../lib/coursesApi';
import { CourseCard } from '../courses/CourseCard';
import { LiveSessionCard } from '../learning/LiveSessionCard';
import { getPublishedLiveSessionsByInstructor, type LiveSession } from '../../lib/liveSessionsApi';
import { withTimeout } from '../../lib/withTimeout';
import { useLearningTransition } from '../../context/LearningTransitionContext';

export function CoursesSection({ userId, isOwner }: { userId: string; isOwner: boolean }) {
  const { enterLearning } = useLearningTransition();
  const location = useLocation();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [live, setLive] = useState<LiveSession[]>([]);

  // Courses and live sessions load independently, each bounded, so a slow
  // one never holds back (or hides) the other.
  useEffect(() => {
    let cancelled = false;
    withTimeout(getCourses({ instructorId: userId, status: 'published', limit: 12 }), 4000, [] as Course[]).then(c => { if (!cancelled) setCourses(c); });
    withTimeout(getPublishedLiveSessionsByInstructor(userId, 12), 4000, [] as LiveSession[]).then(l => { if (!cancelled) setLive(l); });
    return () => { cancelled = true; };
  }, [userId]);

  if (!courses?.length && !live.length) return null;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-black text-gray-900">Courses</p>
        {isOwner && (
          <button onClick={() => enterLearning('/instructor', { route: location.pathname + location.search })} className="text-xs font-semibold text-blue-600 hover:underline">
            Manage courses
          </button>
        )}
      </div>
      {!!courses?.length && (
        <div className="grid grid-cols-2 gap-3">
          {courses.map(c => <CourseCard key={c.id} course={c} />)}
        </div>
      )}
      {live.length > 0 && (
        <>
          <p className={`text-xs font-bold text-gray-500 ${courses?.length ? 'mt-4' : ''} mb-2`}>Live sessions</p>
          <div className="grid grid-cols-2 gap-3">
            {live.map(l => <LiveSessionCard key={l.id} session={l} />)}
          </div>
        </>
      )}
    </section>
  );
}
