// Small building blocks shared by FILMONS Learning's list pages
// (Explore, Trending/Recent topics, a topic's courses, My learning,
// Notifications, Profile, Instructor dashboard). Blocks marked data-pop
// pop in as they appear (see lib/usePopIn.ts).
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ChevronRight, Hash } from 'lucide-react';
import { learningLoginPath } from '../../lib/learningAuth';
import { topicLabel } from '../../lib/topicsApi';

export function LearningPage({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-4 md:px-8 py-6 pb-16">{children}</div>;
}

export function PageTitle({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div data-pop className="mb-6 flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-black tracking-tight text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ title, subtitle, onViewAll }: { title: string; subtitle?: string; onViewAll?: () => void }) {
  return (
    <div data-pop className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-black text-gray-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
      </div>
      {onViewAll && (
        <button onClick={onViewAll} className="flex shrink-0 items-center gap-0.5 text-xs font-bold text-blue-600 hover:underline">
          View all <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Shown in place of a page that needs a Learning sign-in. */
export function SignInPrompt({ message }: { message: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div data-pop className="flex flex-col items-center gap-4 rounded-3xl border border-gray-100 bg-white px-6 py-14 text-center">
      <p className="max-w-xs text-sm text-gray-500">{message}</p>
      <button onClick={() => navigate(learningLoginPath(location.pathname + location.search))}
        className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
        Log in
      </button>
    </div>
  );
}

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body?: string }) {
  return (
    <div data-pop className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-gray-200 px-6 py-14 text-center">
      <div className="text-gray-300">{icon}</div>
      <p className="text-sm font-bold text-gray-700">{title}</p>
      {body && <p className="max-w-xs text-xs leading-relaxed text-gray-400">{body}</p>}
    </div>
  );
}

/** One topic row: optional rank, #tag, and a meta line. Opens the topic. */
export function TopicRow({ tag, rank, meta }: { tag: string; rank?: number; meta: ReactNode }) {
  const navigate = useNavigate();
  return (
    <button data-pop onClick={() => navigate(`/topic/${encodeURIComponent(tag)}`)}
      className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-left hover:border-gray-200 hover:bg-gray-50 transition-colors">
      {rank !== undefined ? (
        <span className={`w-7 shrink-0 text-center text-sm font-black ${rank <= 3 ? 'text-blue-600' : 'text-gray-300'}`}>{rank}</span>
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50"><Hash className="h-4 w-4 text-blue-600" /></span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black text-gray-900">{topicLabel(tag)}</span>
        <span className="mt-0.5 block truncate text-xs text-gray-400">{meta}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
    </button>
  );
}

export function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86_400 * 30) return `${Math.round(s / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-[62px] animate-pulse rounded-2xl bg-gray-100" />
      ))}
    </div>
  );
}
