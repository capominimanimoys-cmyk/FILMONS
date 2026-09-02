/**
 * Guest/Creator/Creator+ access to Emergency Listings -- a 3-random-item
 * preview + "See More" upgrade gate, never a full lock-out and never the
 * complete unrestricted list. Professional/Business never render this at
 * all (they get the real, full list directly). Shared by Home.tsx and
 * SearchOverlay.tsx, each supplying its own item list + card renderer
 * (Home has real Listing objects and uses ListingCard; SearchOverlay has
 * its own slim ListingRow shape and MarketplaceCard) via a render prop, so
 * this component stays free of either page's specific data types.
 */
import { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle } from 'lucide-react';

export function EmergencyPreviewGate<T>({ items, renderCard, grid = true }: {
  items: T[];
  renderCard: (item: T, index: number) => ReactNode;
  /** Preview cards render in a 2-col grid (Home, Search's marketplace-style
   *  sections) by default; pass false for a single-column list layout. */
  grid?: boolean;
}) {
  const [showModal, setShowModal] = useState(false);
  // Picked once on mount and never reshuffled on re-render (a parent
  // re-render for an unrelated reason -- a notification badge updating,
  // etc. -- must not visibly shuffle which 3 listings are shown).
  const [preview] = useState(() => [...items].sort(() => Math.random() - 0.5).slice(0, 3));

  if (items.length === 0) return null;

  return (
    <>
      <div className="flex flex-col items-center text-center py-4 px-4">
        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-2">
          <AlertTriangle className="w-5 h-5 text-red-500" />
        </div>
        <p className="text-sm font-bold text-gray-900 max-w-xs">
          Unlock Professional or Business Account to see all Emergency Listings.
        </p>
      </div>
      <div className={grid ? 'grid grid-cols-2 gap-2.5 px-4' : 'space-y-2 px-4'}>
        {preview.map((item, i) => renderCard(item, i))}
      </div>
      <div className="px-4 pt-3 pb-4">
        <button
          onClick={() => setShowModal(true)}
          className="w-full py-3 text-center text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors"
        >
          See More
        </button>
      </div>
      {showModal && <EmergencyUpgradeModal onClose={() => setShowModal(false)} />}
    </>
  );
}

function EmergencyUpgradeModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl sm:max-w-sm w-full p-6 text-center space-y-4" onClick={e => e.stopPropagation()}>
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>
        <div>
          <p className="text-lg font-black text-gray-900">Unlock Emergency Listings</p>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            Upgrade to a Professional or Business account to see all Emergency Listings on FILMONS.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigate('/account/upgrade')}
            className="w-full py-3 bg-gray-900 text-white text-sm font-bold rounded-2xl active:opacity-80"
          >
            Upgrade Account
          </button>
          <button onClick={onClose} className="w-full py-2.5 text-sm font-semibold text-gray-400">
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
}
