// /course/:courseId/share-card and /live/:sessionId/share-card -- see
// components/learning/LearningShareCard.tsx for the design. Both load their
// own data (bounded by the standard loader's 5s rule) and render the shared card.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { getCourse, type Course } from '../lib/coursesApi';
import { PLATFORM_LABEL, formatFee, getLiveSession, type LiveSession } from '../lib/liveSessionsApi';
import { learningOrigin } from '../lib/learningOrigin';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import { LearningShareCardView, type LearningShareData } from '../components/learning/LearningShareCard';

const LEVEL: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', all_levels: 'All levels' };

function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center bg-[#F5F5F3]">
      <p className="text-sm font-bold text-gray-700">We couldn’t load this card.</p>
      <button onClick={() => navigate('/')} className="text-sm font-bold text-blue-600">Back to Learning</button>
    </div>
  );
}

function useLoaded<T>(load: () => Promise<T | null>, deps: unknown[]): T | null | undefined {
  const [v, setV] = useState<T | null | undefined>(undefined);
  useEffect(() => { let c = false; load().then(r => { if (!c) setV(r); }).catch(() => { if (!c) setV(null); }); return () => { c = true; }; }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

export function CourseShareCard() {
  const { courseId } = useParams();
  const c = useLoaded<Course>(() => (courseId ? getCourse(courseId) : Promise.resolve(null)), [courseId]);
  if (c === undefined) return <FilmonsBrandLoader size="lg" fullscreen label="Loading" />;
  if (!c) return <NotFound />;
  const mins = Math.round((c.durationSeconds || 0) / 60);
  const dur = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : mins ? `${mins}m` : '';
  const data: LearningShareData = {
    id: c.id, fileKey: `course-${c.id}`, title: c.title, cover: c.coverUrl || '',
    pill: { label: 'COURSE', bg: '#2563eb' },
    meta: [LEVEL[c.level], dur, c.lessonCount ? `${c.lessonCount} lessons` : ''].filter(Boolean).join(' · '),
    priceText: c.isFree || !(c.price > 0) ? 'Free' : `${c.currency} $${c.price.toFixed(2)}`,
    instructor: { name: c.instructor?.name || 'Instructor', avatar: c.instructor?.avatar_url || '', accountType: c.instructor?.account_type },
    ctaLabel: 'View course on FILMONS Learning', ctaBg: '#2563eb',
    url: `${learningOrigin()}/course/${c.id}`, pageTitle: 'Share Course',
  };
  return <LearningShareCardView data={data} />;
}

export function LiveSessionShareCard() {
  const { sessionId } = useParams();
  const s = useLoaded<LiveSession>(() => (sessionId ? getLiveSession(sessionId) : Promise.resolve(null)), [sessionId]);
  if (s === undefined) return <FilmonsBrandLoader size="lg" fullscreen label="Loading" />;
  if (!s) return <NotFound />;
  const data: LearningShareData = {
    id: s.id, fileKey: `live-${s.id}`, title: s.title, cover: s.coverUrl || '',
    pill: { label: 'LIVE SESSION', bg: '#dc2626' },
    meta: [s.format === 'one_to_one' ? 'One-to-one' : `Small group · up to ${s.maxParticipants}`, `${s.durationMinutes} min`, PLATFORM_LABEL[s.platform]].join(' · '),
    priceText: s.isFree ? 'Free' : `${formatFee(s.price, s.currency)} per person`,
    instructor: { name: s.instructor?.name || 'Instructor', avatar: s.instructor?.avatarUrl || '' },
    ctaLabel: 'Apply on FILMONS Learning', ctaBg: '#dc2626',
    url: `${learningOrigin()}/live/${s.id}`, pageTitle: 'Share Live Session',
  };
  return <LearningShareCardView data={data} />;
}
