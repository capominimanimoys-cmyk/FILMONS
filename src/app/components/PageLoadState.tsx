// Standard page-level loading wrapper -- the way every page should render its
// load state (see CLAUDE.md "Loading rule"): skeleton while loading, and if
// it hasn't finished within 5s (or failed) a clear message with Retry, never
// an endless spinner.
import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { useLoadDeadline } from '../lib/useLoadDeadline';

export function PageLoadState({ loading, error, onRetry, skeleton, children, label = 'this page' }: {
  loading: boolean;
  error?: boolean;
  onRetry: () => void;
  /** Shown while loading (should look like the real layout). */
  skeleton: ReactNode;
  children: ReactNode;
  label?: string;
}) {
  const late = useLoadDeadline(loading);
  if (error || (loading && late)) {
    return (
      <div role="alert" className="mx-auto my-16 max-w-sm rounded-2xl border border-gray-100 bg-white p-6 text-center">
        <p className="text-sm font-bold text-gray-900">{error ? `We couldn’t load ${label}.` : 'This is taking longer than expected.'}</p>
        <p className="mt-1 text-xs text-gray-500">Check your connection and try again.</p>
        <button onClick={onRetry} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
          <RotateCcw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }
  return <>{loading ? skeleton : children}</>;
}
