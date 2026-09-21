// Local header for /connections and every subpage under it (requests/all/
// suggested/activity) -- these are focused full-screen workspaces per spec,
// so the global FILMONS TopBar/DesktopTopBar is hidden entirely for this
// whole path (see Root.tsx's hideTopBar) and replaced with just this: a
// back arrow + page title, nothing else. Back always uses router history
// (navigate(-1)), which is also what makes an edge-swipe-back gesture on a
// supported mobile browser equivalent to tapping it -- both just pop the
// same history entry, no custom gesture code needed.
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { captureSnapshot } from '../../lib/smartAnimate';

export function ConnectionsPageHeader({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 flex items-center gap-3" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: '12px' }}>
      <button onClick={() => { captureSnapshot(); navigate(-1); }} aria-label="Back" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors -ml-1 shrink-0">
        <ArrowLeft className="w-4 h-4 text-gray-700" />
      </button>
      <h1 className="text-base font-black text-gray-900 flex-1 min-w-0 truncate">{title}</h1>
    </div>
  );
}
