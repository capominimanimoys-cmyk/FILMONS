// Followers / Following / Portfolio Works / Listings — shared by Profile.tsx
// (owner) and HostProfile.tsx (viewer). Counts are passed in rather than
// fetched here since both pages already have their own loading strategy
// for them (Profile.tsx uses useFollowCounts + its own listings/portfolio
// fetch; HostProfile.tsx the same) — this component is purely presentational.
export function ProfileStatsRow({
  followerCount, followingCount, portfolioCount, listingsCount,
  onTapFollowers, onTapFollowing, onTapPortfolio, onTapListings,
}: {
  followerCount: number | null;
  followingCount: number | null;
  portfolioCount: number;
  listingsCount: number;
  onTapFollowers: () => void;
  onTapFollowing: () => void;
  onTapPortfolio: () => void;
  onTapListings: () => void;
}) {
  const Stat = ({ value, label, onClick }: { value: number | null; label: string; onClick: () => void }) => (
    <button onClick={onClick} className="flex-1 flex flex-col items-center py-2.5 active:opacity-60 transition-opacity">
      <span className="text-sm font-black text-gray-900 tabular-nums">{value ?? '—'}</span>
      <span className="text-[10px] text-gray-400 font-semibold mt-0.5">{label}</span>
    </button>
  );

  return (
    <div className="flex items-stretch bg-white border-y border-gray-100 divide-x divide-gray-100">
      <Stat value={followerCount}  label="Followers"       onClick={onTapFollowers} />
      <Stat value={followingCount} label="Following"       onClick={onTapFollowing} />
      <Stat value={portfolioCount} label="Portfolio Works" onClick={onTapPortfolio} />
      <Stat value={listingsCount}  label="Listings"        onClick={onTapListings} />
    </div>
  );
}
