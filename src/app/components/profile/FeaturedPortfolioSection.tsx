// Horizontal carousel on the All tab. Respects each item's real aspect
// ratio (object-contain inside a ratio-boxed frame) instead of force-
// cropping everything to a square -- Profile.tsx's old local `PortfolioCard`
// hardcoded `aspect-square` + `object-cover`; this fixes that per spec
// ("Respect the ORIGINAL media aspect ratio... do not force every
// portfolio image/video into the same crop").
//
// No stored duration field exists on portfolio_items, so video cards get a
// play-icon badge, not a fabricated timestamp like the design mock shows.
//
// Category chips reuse the EXACT same personalized-category system Home's
// full Portfolio tab uses (getPersonalizedCategories/resolveCategoryFilter,
// src/app/lib/personalization.ts) -- no second category system, per spec.
// Personalized to the PROFILE OWNER (not the viewer): this section is
// meant to reflect what this creator's own portfolio spans, and
// getPersonalizedCategories' cold-start signals (primary_role/skills) plus
// affinity already converge on exactly that for a creator whose own
// portfolio matches their own stated skills/roles.
import { useEffect, useState } from 'react';
import { Play, Eye, Heart, MessageCircle } from 'lucide-react';
import { PortfolioItem } from '../../lib/portfolioApi';
import { getPersonalizedCategories, resolveCategoryFilter } from '../../lib/personalization';

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
}

function Card({ item, onTap }: { item: PortfolioItem; onTap: () => void }) {
  const ratio = item.aspect_ratio && item.aspect_ratio > 0 ? item.aspect_ratio : 1;
  const thumb = item.thumbnail_url || item.media_url;
  const isVideo = item.media_type === 'video';

  return (
    <button onClick={onTap} className="shrink-0 w-40 text-left group">
      <div className="relative w-full rounded-xl overflow-hidden bg-gray-100" style={{ aspectRatio: ratio }}>
        {thumb ? (
          <img src={thumb} alt="" className="w-full h-full object-contain bg-gray-100" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl">🎬</div>
        )}
        {isVideo && (
          <span className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="w-3 h-3 text-white fill-white" />
          </span>
        )}
      </div>
      <p className="text-xs font-bold text-gray-900 mt-1.5 truncate">{item.title}</p>
      <p className="text-[10px] text-gray-400 truncate">{item.category}</p>
      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
        <span className="flex items-center gap-0.5"><Eye className="w-2.5 h-2.5" />{formatCount(item.views_count ?? 0)}</span>
        <span className="flex items-center gap-0.5"><Heart className="w-2.5 h-2.5" />{formatCount(item.likes_count ?? 0)}</span>
        <span className="flex items-center gap-0.5"><MessageCircle className="w-2.5 h-2.5" />{formatCount(item.comments_count ?? 0)}</span>
      </div>
    </button>
  );
}

export function FeaturedPortfolioSection({
  userId, items, isOwner, onOpenItem, onViewAll,
}: {
  /** The PROFILE OWNER's id -- personalized categories are generated for
   * them (what their own portfolio/skills/role span), not the viewer. */
  userId: string;
  items: PortfolioItem[];
  isOwner: boolean;
  onOpenItem: (item: PortfolioItem) => void;
  onViewAll: () => void;
}) {
  const [categories, setCategories] = useState<string[]>([]);
  const [selected, setSelected] = useState('All');
  useEffect(() => {
    if (!userId) return;
    getPersonalizedCategories(userId, { limit: 6 }).then(setCategories);
  }, [userId]);

  if (!items.length && !isOwner) return null;

  const visibleItems = selected === 'All'
    ? items
    : items.filter(item => {
        const { category, subcategory } = resolveCategoryFilter(selected);
        return subcategory ? item.subcategory === subcategory : item.category === category;
      });

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-black text-gray-900">Portfolio</p>
        {items.length > 0 && (
          <button onClick={onViewAll} className="text-xs font-semibold text-blue-600 hover:underline">View all →</button>
        )}
      </div>

      {items.length > 0 && categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3 -mx-1 px-1">
          {['All', ...categories].map(cat => (
            <button
              key={cat}
              onClick={() => setSelected(cat)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                selected === cat ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-50 text-gray-600 border border-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {!items.length ? (
        <p className="text-xs text-gray-400">
          {isOwner ? "You haven't added any portfolio work yet." : 'No portfolio work yet.'}
        </p>
      ) : !visibleItems.length ? (
        <p className="text-xs text-gray-400">No portfolio work in this category yet.</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1">
          {visibleItems.slice(0, 10).map(item => <Card key={item.id} item={item} onTap={() => onOpenItem(item)} />)}
        </div>
      )}
    </section>
  );
}
