import {
  Star, StarOff, Share2, FolderPlus, Trash2, Edit2, Image as ImageIcon,
  ListOrdered, FolderInput, Upload, FolderMinus,
} from 'lucide-react';
import { BottomSheet, SheetAction } from './BottomSheet';
import type { PortfolioItem } from '../lib/portfolioApi';

interface Props {
  item: PortfolioItem;
  open: boolean;
  onClose: () => void;
  onToggle: () => void;
  onShare: () => void;
  onAddToAlbum: () => void;
  onDelete: () => void;
  // Present only when opened from inside EditAlbumScreen's media list —
  // switches the sheet into the album-context action set instead of the
  // top-level portfolio grid's action set.
  onEditDetails?: () => void;
  onSetAsCover?: () => void;
  onReorder?: () => void;
  onMoveToAlbum?: () => void;
  onReplaceMedia?: () => void;
  onRemoveFromAlbum?: () => void;
}

/**
 * The single ••• menu used for portfolio items across Grid, Large Cards,
 * Editorial, and Minimal layouts, and (in its album-context form) inside
 * Edit Album's media list.
 */
export function ItemActionsSheet({
  item, open, onClose, onToggle, onShare, onAddToAlbum, onDelete,
  onEditDetails, onSetAsCover, onReorder, onMoveToAlbum, onReplaceMedia, onRemoveFromAlbum,
}: Props) {
  const inAlbumContext = !!(onEditDetails || onSetAsCover || onReorder || onMoveToAlbum || onReplaceMedia || onRemoveFromAlbum);

  const run = (fn?: () => void) => { onClose(); fn?.(); };

  if (!open) return null;

  return (
    <BottomSheet onClose={onClose} title={item.title}>
      <div className="pb-2">
        {inAlbumContext ? (
          <>
            {onEditDetails     && <SheetAction icon={Edit2}        label="Edit Details"          onClick={() => run(onEditDetails)} />}
            {onSetAsCover      && <SheetAction icon={ImageIcon}    label="Set as Album Cover"     onClick={() => run(onSetAsCover)} />}
            {onReorder         && <SheetAction icon={ListOrdered}  label="Reorder"                onClick={() => run(onReorder)} />}
            {onMoveToAlbum     && <SheetAction icon={FolderInput}  label="Move to Another Album"  onClick={() => run(onMoveToAlbum)} />}
            {onReplaceMedia    && <SheetAction icon={Upload}       label="Replace Media"          onClick={() => run(onReplaceMedia)} />}
            {onRemoveFromAlbum && (
              <>
                <div className="border-t border-gray-50 my-1" />
                <SheetAction icon={FolderMinus} label="Remove from Album" destructive onClick={() => run(onRemoveFromAlbum)} />
              </>
            )}
          </>
        ) : (
          <>
            <SheetAction
              icon={item.is_featured ? StarOff : Star}
              label={item.is_featured ? 'Unfeature' : 'Feature'}
              onClick={() => run(onToggle)}
            />
            <SheetAction icon={Share2} label="Share" onClick={() => run(onShare)} />
            <SheetAction icon={FolderPlus} label="Add to Album" onClick={() => run(onAddToAlbum)} />
            <div className="border-t border-gray-50 my-1" />
            <SheetAction
              icon={Trash2}
              label="Delete"
              destructive
              onClick={() => {
                onClose();
                if (window.confirm('Delete this portfolio item? This action cannot be undone.')) onDelete();
              }}
            />
          </>
        )}
      </div>
    </BottomSheet>
  );
}
