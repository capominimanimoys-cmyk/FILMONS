// Repost menu -- shared by PostCard.tsx and every Portfolio card (item/
// album), so there is exactly one implementation to fix/style, not one
// per content type.
//
// Portaled to document.body via createPortal, same as CommentSheet.tsx --
// an earlier version of this file rendered inline (no portal) instead,
// on the theory that something was stripping portaled overlays. That
// theory didn't hold up: rendering inline meant this sheet's `fixed`
// positioning got trapped inside whatever ancestor of PostCard happens to
// establish a CSS containing block (a transform/filter/etc. somewhere up
// the tree, e.g. Home's feed wrapper) instead of the real viewport -- the
// sheet showed up clipped inside the post card instead of covering the
// screen. Comments (also portaled) was independently confirmed working
// for the user who hit that bug, so the portal itself was never the
// problem; this now matches CommentSheet's exact structure.
//
// Slides up from the bottom on open / down on close -- same double-RAF
// mount trick + delayed-close pattern as CommentSheet.tsx.
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  return <RepostMenuSheetInner {...{ onClose, hasReposted, busy, busyLabel, onRepost, onUndoRepost, onRepostWithThoughts }} />;
}

// Split out so the double-RAF/visible-state effect resets cleanly every
// time the sheet mounts (parent controls mount/unmount via `open`, same
// convention BottomSheet's own doc comment already establishes).
function RepostMenuSheetInner({
  onClose, hasReposted, busy, busyLabel, onRepost, onUndoRepost, onRepostWithThoughts,
}: Omit<Parameters<typeof RepostMenuSheet>[0], 'open'>) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let t: number;
    const outer = requestAnimationFrame(() => { t = requestAnimationFrame(() => setVisible(true)); });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(t); };
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 320);
  }, [onClose]);

  // Repost/Undo/"with thoughts" are NOT wrapped in close() here -- their
  // handlers (in PostCard.tsx/PortfolioProjectCard.tsx/PortfolioAlbumCard.tsx)
  // are optimistic and call the parent's setShowRepostMenu(false)
  // synchronously, before the write even starts, so `busy`/busyLabel below
  // are effectively dead in the common case (the sheet is already gone by
  // the time a write could still be in flight) -- kept only as a fallback
  // for whatever brief instant remains between click and unmount. Only
  // Cancel/backdrop/X use the local animated close() -- those have nothing
  // to wait on either way.
  return createPortal((
    <div className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={close}
      />
      <div
        className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1 sm:hidden" />
        <div className="hidden sm:flex items-center justify-between px-4 pt-3">
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Repost</p>
          <button onClick={close} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
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
        <button onClick={close} className="w-full py-3.5 text-sm font-black text-gray-500 text-center border-t border-gray-100">
          Cancel
        </button>
      </div>
    </div>
  ), document.body);
}
