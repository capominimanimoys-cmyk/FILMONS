// The ONE three-dot menu for a Portfolio item -- used by both Home ->
// Portfolio's feed card and Portfolio.tsx's own grid, so "my item" gets
// the exact same actions, ordering, labels, and handlers regardless of
// which page it's tapped from (previously two separate implementations:
// PortfolioFeedCard's own CardMenu and ItemActionsSheet's non-album-context
// branch -- ItemActionsSheet itself is untouched and still used for its
// OTHER job, the album-context menu inside EditAlbumScreen, a genuinely
// different flow this request doesn't touch).
//
// Every action here calls the real portfolioApi function directly (not a
// caller-supplied callback) -- "reuse the same functions... so an action
// behaves identically no matter where it's triggered" -- except View Item,
// which stays a caller-supplied callback on purpose: Portfolio.tsx already
// has a richer full-screen viewer (PortfolioViewer, with next/prev
// browsing and inline like/comment) wired to its own card taps, and this
// menu's "View Item" should open THAT, not a second, simpler viewer.
// Forcing Home's simpler ItemFocusView onto Portfolio.tsx here would be a
// regression, not a consistency win.
//
// Rendered as a real BottomSheet (shared slide-up/backdrop/drag-to-dismiss
// motion, not a floating dropdown) -- callers are expected to render this
// via createPortal(..., document.body), same as Portfolio.tsx's own
// ItemActionsSheet already does for its menu, so it can never end up
// visually clipped to/attached to whichever card opened it regardless of
// that card's own transform/overflow/stacking context.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  ExternalLink, Share2, FolderCog, EyeOff, Trash2, User, Flag, Bookmark,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { BottomSheet, SheetCancel } from './BottomSheet';
import { AddToAlbumSheet } from './AddToAlbumSheet';
import {
  type PortfolioItem, type PortfolioAlbum,
  deletePortfolioItem, setItemHidden, reportPortfolioContent,
  isPortfolioSaved, togglePortfolioSave, getAlbums,
} from '../lib/portfolioApi';

const rowClass = 'flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors';
const destructiveRowClass = 'flex items-center gap-3 w-full px-4 py-3.5 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50';

export function PortfolioItemActionSheet({
  item, creatorId, isOwn, onClose, onViewItem, onRemoved,
}: {
  item: PortfolioItem;
  creatorId: string;
  isOwn: boolean;
  onClose: () => void;
  onViewItem: () => void;
  /** Called after a successful Delete or Hide -- the caller owns removing
   * the item from whatever list it's rendering (Home's feed array, or
   * Portfolio.tsx's items/albumItems state); this component only performs
   * the actual API call. */
  onRemoved: () => void;
}) {
  const navigate = useNavigate();
  const { user, showGuestPrompt } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showAddToAlbum, setShowAddToAlbum] = useState(false);
  const [myAlbums, setMyAlbums] = useState<PortfolioAlbum[]>([]);

  useEffect(() => {
    if (!isOwn && user) isPortfolioSaved(user.id, item.id, 'portfolio_item').then(setSaved);
  }, [item.id, isOwn, user?.id]);

  const run = (fn: () => void) => { onClose(); fn(); };

  const handleShare = async () => {
    const url = `${window.location.origin}/portfolio/${creatorId}`;
    if (navigator.share) { navigator.share({ url, title: item.title }).catch(() => {}); return; }
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); } catch { toast.error('Could not copy link'); }
  };

  const handleToggleSave = async () => {
    if (!user) { showGuestPrompt('Create your Filmons account to save portfolio work.', 'Sign up to save'); return; }
    const next = !saved;
    setSaved(next);
    const ok = await togglePortfolioSave(user.id, item.id, 'portfolio_item', !next);
    if (!ok) { setSaved(!next); toast.error('Could not update save'); }
  };

  const handleOpenAddToAlbum = async () => {
    setMyAlbums(await getAlbums(item.user_id));
    setShowAddToAlbum(true);
  };

  const handleHide = async () => {
    if (!window.confirm('Hide this item from your Portfolio? You can still find and unhide it from Manage in Portfolio.')) return;
    setHiding(true);
    const ok = await setItemHidden(item.id, true);
    setHiding(false);
    if (!ok) { toast.error('Could not hide this item.'); return; }
    toast.success('Item hidden from your Portfolio');
    onClose();
    onRemoved();
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this item? This action cannot be undone.')) return;
    setDeleting(true);
    const ok = await deletePortfolioItem(item.id);
    setDeleting(false);
    if (!ok) { toast.error('Could not delete this item.'); return; }
    toast.success('Item deleted');
    onClose();
    onRemoved();
  };

  const handleReport = async () => {
    if (!user) { onClose(); showGuestPrompt('Create your Filmons account to report content.', 'Sign up'); return; }
    if (!window.confirm('Report this content to Filmons?')) return;
    const ok = await reportPortfolioContent(user.id, item.id, 'portfolio_item');
    onClose();
    toast[ok ? 'success' : 'error'](ok ? 'Reported. Thanks for letting us know.' : 'Could not submit report. Please try again.');
  };

  return (
    <>
      <BottomSheet onClose={onClose}>
        <div className="px-2 py-1">
          {isOwn ? (
            <>
              <button onClick={() => run(onViewItem)} className={rowClass}>
                <ExternalLink className="w-4 h-4 text-gray-400" /> View Item
              </button>
              <button onClick={() => run(() => navigate(`/edit-portfolio-item/${item.id}`))} className={rowClass}>
                <Pencil className="w-4 h-4 text-gray-400" /> Edit Work
              </button>
              <button onClick={() => run(handleOpenAddToAlbum)} className={rowClass}>
                <FolderCog className="w-4 h-4 text-gray-400" /> Add to Album
              </button>
              <button onClick={() => run(handleShare)} className={rowClass}>
                <Share2 className="w-4 h-4 text-gray-400" /> Share
              </button>
              <button onClick={handleHide} disabled={hiding} className={rowClass + ' disabled:opacity-50'}>
                <EyeOff className="w-4 h-4 text-gray-400" /> {hiding ? 'Hiding…' : 'Hide from Portfolio'}
              </button>
              <div className="border-t border-gray-50 my-1" />
              <button onClick={handleDelete} disabled={deleting} className={destructiveRowClass}>
                <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting…' : 'Delete Item'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => run(() => navigate(`/host/${creatorId}`))} className={rowClass}>
                <User className="w-4 h-4 text-gray-400" /> View creator profile
              </button>
              <button onClick={() => run(() => navigate(`/portfolio/${creatorId}`))} className={rowClass}>
                <ExternalLink className="w-4 h-4 text-gray-400" /> View portfolio
              </button>
              <button onClick={() => run(handleShare)} className={rowClass}>
                <Share2 className="w-4 h-4 text-gray-400" /> Share
              </button>
              <button onClick={() => run(handleToggleSave)} className={rowClass}>
                <Bookmark className={`w-4 h-4 ${saved ? 'text-gray-900 fill-gray-900' : 'text-gray-400'}`} /> {saved ? 'Unsave' : 'Save'}
              </button>
              <div className="border-t border-gray-50 my-1" />
              <button onClick={handleReport} className={destructiveRowClass}>
                <Flag className="w-4 h-4" /> Report
              </button>
            </>
          )}
          <div className="border-t border-gray-50 mt-1" />
          <SheetCancel onClick={onClose} />
        </div>
      </BottomSheet>
      {showAddToAlbum && (
        <AddToAlbumSheet item={item} albums={myAlbums} onClose={() => setShowAddToAlbum(false)} />
      )}
    </>
  );
}
