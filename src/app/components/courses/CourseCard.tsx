// FILMONS Courses -- browse card. Trust is shown via the compact
// TrustBadge only -- never the instructor's raw /100 Reliability score,
// per spec.
import { useLocation, useNavigate } from 'react-router';
import { Star, Clock, BadgeCheck } from 'lucide-react';
import { UserAvatar } from '../AccountTypeBadge';
import { TrustBadge } from '../trust/TrustBadge';
import { useLearningTransition } from '../../context/LearningTransitionContext';
import { isInsideLearningBundle } from '../../lib/learningBundle';
import type { Course } from '../../lib/coursesApi';
import type { TrustLevel } from '../../lib/trustApi';

function formatDuration(totalSeconds: number): string {
  if (!totalSeconds) return '';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', all_levels: 'All levels',
};

export function CourseCard({ course, trustLevel }: { course: Course; trustLevel?: TrustLevel }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { enterLearning } = useLearningTransition();
  const duration = formatDuration(course.durationSeconds);
  // Already inside the Learning bundle -> plain in-product (basename-
  // relative) navigation, never replay the branded transition (spec: "do
  // not show special loading every time"). Tapped from the main Filmons
  // bundle (Search, a Hashtag/Location page, Connect, etc.) -> the full
  // Filmons -> Learning product switch, a real cross-bundle navigation.
  const insideLearning = isInsideLearningBundle();

  const open = () => {
    if (insideLearning) navigate(`/course/${course.id}`);
    else enterLearning(`/learning/course/${course.id}`, { route: location.pathname + location.search });
  };

  return (
    <button
      onClick={open}
      className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden active:scale-[0.98] transition-transform"
    >
      <div className="relative w-full bg-gray-100" style={{ aspectRatio: '16/9' }}>
        {course.coverUrl ? (
          <img src={course.coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl">🎬</div>
        )}
        {duration && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/65 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
            {duration}
          </span>
        )}
      </div>

      <div className="p-3 space-y-2">
        <p className="text-sm font-black text-gray-900 leading-snug line-clamp-2">{course.title}</p>

        <div className="flex items-center gap-1.5 min-w-0">
          <UserAvatar user={{ id: course.instructor?.id, name: course.instructor?.name || '', avatar: course.instructor?.avatar_url ?? undefined }} size={18} />
          <p className="text-xs text-gray-500 truncate">{course.instructor?.name}</p>
          {course.instructor?.is_verified && <BadgeCheck className="w-3 h-3 text-blue-500 shrink-0" />}
          {trustLevel && <TrustBadge level={trustLevel} size="sm" />}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          {course.ratingCount > 0 && (
            <span className="flex items-center gap-0.5 font-bold text-gray-600">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> {course.ratingAvg.toFixed(1)}
              <span className="text-gray-400 font-normal">({course.ratingCount})</span>
            </span>
          )}
          {course.level && <span>{LEVEL_LABEL[course.level] ?? course.level}</span>}
          {course.lessonCount > 0 && (
            <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" /> {course.lessonCount} lessons</span>
          )}
        </div>

        <p className="text-sm font-black text-gray-900">
          {course.isFree || course.price === 0 ? 'Free' : `${course.currency} $${course.price.toFixed(2)}`}
        </p>
      </div>
    </button>
  );
}
