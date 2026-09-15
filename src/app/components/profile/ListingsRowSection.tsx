// Shared by the Listings and Services All-tab sections -- same shape
// (horizontal preview row of ListingCard + "View all →"), different input
// array. Services are listing_type === 'service' rows (isServiceListing,
// src/app/lib/filmSearch.ts) -- a real marketplace listing, just displayed
// as a separate profile concept from gear rentals/sales/opportunities per
// spec ("Services MUST remain separate from Listings"). No new data model:
// both sections read the same `listings` array the page already fetches,
// just filtered differently.
import { Listing } from '../../types';
import { ListingCard } from '../ListingCard';

export function ListingsRowSection({
  title, icon, listings, lockedIds, onViewAll, emptyText, ownerEmptyText, isOwner,
}: {
  title: string;
  icon?: React.ReactNode;
  listings: (Listing & { distance?: number })[];
  lockedIds?: Set<string>;
  onViewAll: () => void;
  emptyText: string;
  ownerEmptyText: string;
  isOwner: boolean;
}) {
  if (!listings.length && !isOwner) return null;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-black text-gray-900 flex items-center gap-1.5">{icon}{title}</p>
        {listings.length > 0 && (
          <button onClick={onViewAll} className="text-xs font-semibold text-blue-600 hover:underline">View all →</button>
        )}
      </div>

      {!listings.length ? (
        <p className="text-xs text-gray-400">{isOwner ? ownerEmptyText : emptyText}</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1">
          {listings.slice(0, 6).map(l => (
            <div key={l.id} className="shrink-0 w-40">
              <ListingCard listing={l} locked={lockedIds?.has(l.id)} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
