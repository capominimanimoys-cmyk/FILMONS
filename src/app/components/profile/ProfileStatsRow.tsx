// Followers / Following / Profile Interaction -- rendered INSIDE
// ProfileHeader (right under the creator's identity block), shared by
// Profile.tsx (owner) and HostProfile.tsx (viewer) via that one component
// so placement/behavior can never drift between the two pages. Portfolio
// Works/Listings counts used to live here too -- dropped per spec; those
// counts still live inside their own Portfolio/Listings sections further
// down the page. Counts are passed in (this stays purely presentational)
// since both pages already have their own loading strategy for them.
function formatCount(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

export function ProfileStatsRow({
  followerCount, followingCount, interactionCount,
  onTapFollowers, onTapFollowing, onTapInteraction,
}: {
  followerCount: number | null;
  followingCount: number | null;
  interactionCount: number | null;
  onTapFollowers: () => void;
  onTapFollowing: () => void;
  /** Owner: can later open a Profile analytics/details experience once one
   * exists. Viewers: omit -- there's no public details view yet, so this
   * stays purely informational (non-interactive) for them per spec. */
  onTapInteraction?: () => void;
}) {
  const Stat = ({ value, label, onClick }: { value: number | null; label: string; onClick?: () => void }) => {
    const content = (
      <>
        <span className="text-sm font-black text-gray-900 tabular-nums">{formatCount(value)}</span>
        <span className="text-[9px] sm:text-[10px] text-gray-400 font-semibold mt-0.5 whitespace-nowrap">{label}</span>
      </>
    );
    return onClick ? (
      <button onClick={onClick} className="flex-1 min-w-0 flex flex-col items-center py-2.5 active:opacity-60 transition-opacity">
        {content}
      </button>
    ) : (
      <div className="flex-1 min-w-0 flex flex-col items-center py-2.5">
        {content}
      </div>
    );
  };

  return (
    <div className="flex items-stretch bg-white">
      <Stat value={followerCount}    label="Followers"           onClick={onTapFollowers} />
      <Stat value={followingCount}   label="Following"           onClick={onTapFollowing} />
      <Stat value={interactionCount} label="Profile Interaction" onClick={onTapInteraction} />
    </div>
  );
}
