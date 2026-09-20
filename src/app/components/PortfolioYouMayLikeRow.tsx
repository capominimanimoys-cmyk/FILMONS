// Home -> Connect feed's Portfolio-discovery break -- a horizontal,
// visually-driven carousel (unlike People You May Know's compact profile
// cards, these need real room for media) inserted further down the same
// unified feed. Each card keeps its OWN item's real aspect ratio -- the
// rail's height is fixed, but a portrait item still crops less than a
// landscape one would at the same box, per spec ("don't force all cards
// into the same media ratio, keep the rail visually stable").
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Heart, Layers, BadgeCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserAvatar } from './AccountTypeBadge';
import { TrustBadge } from './trust/TrustBadge';
import { getPortfolioMediaAspectRatio } from './PortfolioMedia';
import { togglePortfolioSave, isPortfolioSaved, type PortfolioFeedEntry } from '../lib/portfolioApi';
import { logPortfolioInteraction } from '../lib/personalization';
import { usePortfolioPreview } from '../context/PortfolioPreviewContext';
import type { TrustLevel } from '../lib/trustApi';

const RAIL_HEIGHT = 160;

function PortfolioSuggestionCard({ entry, trustLevel }: { entry: PortfolioFeedEntry; trustLevel?: TrustLevel }) {
  const navigate = useNavigate();
  const { openPortfolioPreview } = usePortfolioPreview();
  const { user, showGuestPrompt } = useAuth();
  const [saved, setSaved] = useState(false);

  const isAlbum = entry.type === 'album';
  const targetId = isAlbum ? entry.album.id : entry.item.id;
  const targetType = isAlbum ? 'portfolio_album' : 'portfolio_item';
  const title = isAlbum ? entry.album.title : entry.item.title;
  const category = isAlbum ? (entry.album as any).category : entry.item.category;
  const thumb = isAlbum ? entry.coverUrl : (entry.item.thumbnail_url || entry.item.media_url);
  const ratio = isAlbum ? (entry.coverAspectRatio || 4 / 5) : getPortfolioMediaAspectRatio(entry.item);

  useEffect(() => { if (user) isPortfolioSaved(user.id, targetId, targetType).then(setSaved); }, [targetId, user?.id]);

  const openCreatorPortfolio = () => openPortfolioPreview(entry.creator.id, isAlbum ? entry.album.id : undefined);

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { showGuestPrompt('Create your Filmons account to save portfolio work.', 'Sign up to save'); return; }
    const next = !saved;
    setSaved(next);
    const ok = await togglePortfolioSave(user.id, targetId, targetType, !next, entry.creator.id);
    if (!ok) { setSaved(!next); return; }
    logPortfolioInteraction(user.id, { category: category ?? '' }, next ? 'save' : 'unsave');
  };

  // Width scales with the item's own ratio at a fixed rail height, so a
  // vertical reel and a widescreen still both read at their real shape
  // instead of being stretched/cropped into one uniform box.
  const width = Math.round(RAIL_HEIGHT * Math.min(Math.max(ratio, 0.6), 1.6));

  return (
    <button
      onClick={openCreatorPortfolio}
      className="shrink-0 snap-start bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden text-left flex flex-col"
      style={{ width }}
    >
      <div className="relative bg-gray-100" style={{ height: RAIL_HEIGHT }}>
        {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gray-100" />}
        {isAlbum && (
          <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 text-[10px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded-full">
            <Layers className="w-2.5 h-2.5" /> {entry.itemCount}
          </span>
        )}
        <button
          onClick={handleSave}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/45 flex items-center justify-center"
        >
          <Heart className={`w-3 h-3 ${saved ? 'text-red-500 fill-red-500' : 'text-white'}`} />
        </button>
      </div>
      <div className="p-2.5">
        <p className="text-xs font-bold text-gray-900 truncate">{title}</p>
        <div className="flex items-center gap-1 mt-1 min-w-0">
          <UserAvatar user={{ id: entry.creator.id, name: entry.creator.name, avatar: entry.creator.avatar_url }} size={16} />
          <p className="text-[11px] text-gray-500 truncate">{entry.creator.name}</p>
          {entry.creator.is_verified && <BadgeCheck className="w-2.5 h-2.5 text-blue-600 fill-blue-100 shrink-0" />}
        </div>
        {trustLevel && (
          <div className="mt-1"><TrustBadge level={trustLevel} size="sm" /></div>
        )}
        {category && <p className="text-[10px] text-gray-400 truncate mt-1">{category}</p>}
      </div>
    </button>
  );
}

export function PortfolioYouMayLikeRow({ entries, trustLevels, onSeeAll }: {
  entries: PortfolioFeedEntry[];
  /** Same batched map Connect's main feed already builds -- reused here
   * rather than a second trust-level fetch for the same creators. */
  trustLevels?: Map<string, TrustLevel>;
  onSeeAll?: () => void;
}) {
  if (!entries.length) return null;
  // Single shared horizontal inset on the outer container -- the heading
  // and the card row both sit flush against it with no padding/negative-
  // margin math of their own, so their left edges can never drift apart
  // (was previously -mx-3.5/px-3.5 on the row alone, which depended on
  // exactly cancelling the parent's own p-3.5). The trailing spacer gives
  // the last card breathing room without needing to extend the row past
  // the container's padding.
  return (
    <div className="bg-white rounded-[20px] border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] py-3.5">
      <div className="flex items-center justify-between px-3.5 mb-3">
        <p className="text-sm font-bold text-gray-900">Portfolio You May Like</p>
        {onSeeAll && (
          <button onClick={onSeeAll} className="text-xs font-bold text-blue-600 shrink-0">See all →</button>
        )}
      </div>
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-3.5" style={{ scrollSnapType: 'x mandatory' }}>
        {entries.map(entry => (
          <PortfolioSuggestionCard key={entry.id} entry={entry} trustLevel={trustLevels?.get(entry.creator.id)} />
        ))}
        <div className="shrink-0 w-px" aria-hidden />
      </div>
    </div>
  );
}
