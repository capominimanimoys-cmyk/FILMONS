// Own-post "•••" menu (Edit/Change visibility/Save/Copy link/Toggle
// comments/Delete) -- rewritten as its own self-contained, portaled sheet
// (createPortal to document.body, double-RAF entrance, delayed-close exit)
// instead of the shared BottomSheet component, mirroring RepostMenuSheet.tsx's
// proven structure exactly. Extracted so PostCard.tsx's two render branches
// (regular + standalone-audio) share ONE implementation instead of two
// near-identical copies of the same action list.
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Edit2, Globe, Bookmark, Link2, MessageCircle, Trash2, X } from 'lucide-react';

export function PostOwnMenuSheet({
  open, onClose, saved, allowComments, deleting,
  onEdit, onChangeVisibility, onToggleSave, onCopyLink, onToggleComments, onDelete,
}: {
  open: boolean;
  onClose: () => void;
  saved: boolean;
  allowComments: boolean;
  deleting?: boolean;
  onEdit: () => void;
  onChangeVisibility: () => void;
  onToggleSave: () => void;
  onCopyLink: () => void;
  onToggleComments: () => void;
  onDelete: () => void;
}) {
  if (!open) return null;
  return <PostOwnMenuSheetInner {...{ onClose, saved, allowComments, deleting, onEdit, onChangeVisibility, onToggleSave, onCopyLink, onToggleComments, onDelete }} />;
}

function PostOwnMenuSheetInner({
  onClose, saved, allowComments, deleting, onEdit, onChangeVisibility, onToggleSave, onCopyLink, onToggleComments, onDelete,
}: Omit<Parameters<typeof PostOwnMenuSheet>[0], 'open'>) {
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

  // Each action fires immediately (so Edit's/Delete-confirm's own modal
  // shows up right away) while the sheet animates itself away underneath,
  // rather than waiting for the 320ms close to finish first.
  const act = (fn: () => void) => () => { close(); fn(); };

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
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Post options</p>
          <button onClick={close} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
        <div className="px-2 py-1">
          <button onClick={act(onEdit)}
            className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
            <Edit2 className="w-4 h-4 text-gray-400" /> Edit post
          </button>
          <button onClick={act(onChangeVisibility)}
            className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
            <Globe className="w-4 h-4 text-gray-400" /> Change visibility
          </button>
          <button onClick={act(onToggleSave)}
            className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
            <Bookmark className={`w-3.5 h-3.5 ${saved ? 'fill-current text-blue-600' : 'text-gray-500'}`} />
            {saved ? 'Unsave post' : 'Save post'}
          </button>
          <button onClick={act(onCopyLink)}
            className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
            <Link2 className="w-4 h-4 text-gray-400" /> Copy link
          </button>
          <button onClick={act(onToggleComments)}
            className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
            <MessageCircle className="w-4 h-4 text-gray-400" /> {allowComments ? 'Turn off comments' : 'Turn on comments'}
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button onClick={act(onDelete)} disabled={deleting}
            className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors">
            <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting…' : 'Delete post'}
          </button>
        </div>
        <button onClick={close} className="w-full py-3.5 text-sm font-black text-gray-500 text-center border-t border-gray-100">
          Cancel
        </button>
      </div>
    </div>
  ), document.body);
}
