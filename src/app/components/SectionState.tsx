// One section of a page with its OWN loading, empty, error and retry states, so a slow or failed
// section never blanks the page around it. After 5 s of loading (CLAUDE.md loading rule) it offers Retry.
import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { useLoadDeadline } from '../lib/useLoadDeadline';

export function SectionState({ loading, error, empty, onRetry, skeleton, emptyState, label = 'this section', children }: {
  loading: boolean;
  error?: boolean;
  /** True when the load finished and there is nothing to show. */
  empty?: boolean;
  onRetry: () => void;
  skeleton: ReactNode;
  emptyState?: ReactNode;
  label?: string;
  children: ReactNode;
}) {
  const late = useLoadDeadline(loading);
  if (error || (loading && late)) {
    return (
      <div role="alert" className="rounded-2xl border border-gray-100 bg-white p-4 text-center">
        <p className="text-sm font-semibold text-gray-800">{error ? `We couldn’t load ${label}.` : `${label[0].toUpperCase()}${label.slice(1)} is taking longer than expected.`}</p>
        <button onClick={onRetry} className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700">
          <RotateCcw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }
  if (loading) return <>{skeleton}</>;
  if (empty) return <>{emptyState ?? null}</>;
  return <>{children}</>;
}
