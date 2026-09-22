// Repost menu -- shared by PostCard.tsx and every Portfolio card (item/
// album), so there is exactly one implementation to fix/style, not one
// per content type. Deliberately NOT built on BottomSheet/createPortal:
// rendered directly inline in the caller's own tree, the same pattern
// this file's neighboring "Quote Repost Modal"/"Boost Modal" already use.
// A portaled sheet was confirmed (via live debugging with a user) to
// sometimes never actually reach the DOM even though React's own render
// log proved the component tree included it -- consistent with a browser
// extension/content blocker treating a dynamically-inserted, high-z-index,
// document.body-appended overlay as an unwanted popup and stripping it.
// A plain in-tree overlay (no portal) sidesteps that heuristic entirely.
import { Repeat2, MessageCircle, Check, X } from 'lucide-react';

export function RepostMenuSheet({
  open, onClose, hasReposted, busy, busyLabel, onRepost, onUndoRepost, onRepostWithThoughts,
}: {
  open: boolean;
  onClose: () => void;
  hasReposted: boolean;
  busy: boolean;
  /** e.g. "Reposting…" / "Removing…" while busy -- callers already track this. */
  busyLabel?: string;
  onRepost: () => void;
  onUndoRepost: () => void;
  onRepostWithThoughts: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1 sm:hidden" />
        <div className="hidden sm:flex items-center justify-between px-4 pt-3">
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Repost</p>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
        <div className="px-2 py-2">
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest px-4 pb-3 sm:hidden">Repost</p>
          {hasReposted && (
            <div className="flex items-center gap-2 px-4 pb-2 text-green-600">
              <Check className="w-3.5 h-3.5" />
              <p className="text-xs font-black">Reposted</p>
            </div>
          )}
          {hasReposted ? (
            <button onClick={onUndoRepost} disabled={busy}
              className="flex items-center gap-3 w-full px-4 py-3.5 text-left rounded-xl hover:bg-red-50 transition-colors">
              <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <Repeat2 className="w-4 h-4 text-red-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-black text-red-600">{busy ? (busyLabel || 'Removing…') : 'Remove repost'}</p>
                <p className="text-xs text-gray-400">Remove from your Activity and future distribution</p>
              </div>
            </button>
          ) : (
            <button onClick={onRepost} disabled={busy}
              className="flex items-center gap-3 w-full px-4 py-3.5 text-left rounded-xl hover:bg-green-50 transition-colors">
              <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                <Repeat2 className="w-4 h-4 text-green-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-black text-gray-900">{busy ? (busyLabel || 'Reposting…') : 'Repost'}</p>
                <p className="text-xs text-gray-400">Share instantly with your network</p>
              </div>
            </button>
          )}
          <button onClick={onRepostWithThoughts}
            className="flex items-center gap-3 w-full px-4 py-3.5 text-left rounded-xl hover:bg-gray-50 transition-colors">
            <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4 text-blue-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-black text-gray-900">Repost with your thoughts</p>
              <p className="text-xs text-gray-400">Add something before sharing</p>
            </div>
          </button>
        </div>
        <button onClick={onClose} className="w-full py-3.5 text-sm font-black text-gray-500 text-center border-t border-gray-100">
          Cancel
        </button>
      </div>
    </div>
  );
}
