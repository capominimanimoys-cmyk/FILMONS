import { Edit2, Images, Image as ImageIcon, ListOrdered, Eye, Share2, Trash2 } from 'lucide-react';
import { BottomSheet, SheetAction, SheetCancel } from './BottomSheet';
import type { PortfolioAlbum } from '../lib/portfolioApi';

export type EditAlbumSection = 'media' | 'cover' | 'reorder' | 'visibility';

interface Props {
  album: PortfolioAlbum;
  open: boolean;
  onClose: () => void;
  onEditAlbum: (focusSection?: EditAlbumSection) => void;
  onShare: () => void;
  onDelete: () => void;
}

export function AlbumActionsSheet({ album, open, onClose, onEditAlbum, onShare, onDelete }: Props) {
  const run = (fn: () => void) => { onClose(); fn(); };

  if (!open) return null;

  return (
    <BottomSheet onClose={onClose} title={album.title} footer={<SheetCancel onClick={onClose} />}>
      <div className="pb-2">
        <SheetAction icon={Edit2}       label="Edit Album"       onClick={() => run(() => onEditAlbum())} />
        <SheetAction icon={Images}      label="Manage Media"     onClick={() => run(() => onEditAlbum('media'))} />
        <SheetAction icon={ImageIcon}   label="Change Cover"     onClick={() => run(() => onEditAlbum('cover'))} />
        <SheetAction icon={ListOrdered} label="Reorder Album"    onClick={() => run(() => onEditAlbum('reorder'))} />
        <SheetAction icon={Eye}         label="Change Visibility" onClick={() => run(() => onEditAlbum('visibility'))} />
        <SheetAction icon={Share2}      label="Share Album"      onClick={() => run(onShare)} />
        <div className="border-t border-gray-50 my-1" />
        <SheetAction icon={Trash2} label="Delete Album" destructive onClick={() => { onClose(); onDelete(); }} />
      </div>
    </BottomSheet>
  );
}
