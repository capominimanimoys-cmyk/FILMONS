// Shared "[Avatar] Share something... / Photo-Video Portfolio Listing"
// composer entry row -- used identically by Home -> Connect and by
// Profile's All/Activity tabs, so every entry point opens the exact same
// PostComposer instead of a separate composer per surface.
import { Image as ImageIcon, Layers, Tag } from 'lucide-react';
import { UserAvatar } from './AccountTypeBadge';

export function CreatePostTrigger({ avatar, name, onOpen, onShortcut }: {
  avatar?: string;
  name?: string;
  onOpen: () => void;
  onShortcut: (action: 'photo' | 'portfolio' | 'listing') => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
      <button onClick={onOpen} className="w-full flex items-center gap-3 text-left">
        <UserAvatar user={{ id: '', name: name || 'You', avatar }} size={36} />
        <span className="flex-1 text-sm text-gray-400 bg-gray-50 rounded-full px-4 py-2.5">Share something...</span>
      </button>
      <div className="flex items-center gap-1 mt-2.5 pt-2.5 border-t border-gray-50">
        <button onClick={() => onShortcut('photo')} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          <ImageIcon className="w-4 h-4 text-blue-500" /> Photo/Video
        </button>
        <button onClick={() => onShortcut('portfolio')} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          <Layers className="w-4 h-4 text-purple-500" /> Portfolio
        </button>
        <button onClick={() => onShortcut('listing')} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          <Tag className="w-4 h-4 text-amber-500" /> Listing
        </button>
      </div>
    </div>
  );
}
