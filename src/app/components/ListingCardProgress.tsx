// Segmented progress bar + "n / total" counter for the desktop
// ListingCardStack — genuinely new UI; neither SwipeStack nor Home.tsx has
// a visual progress indicator today (SwipeStack only has a plain text
// "n of total" line).
interface ListingCardProgressProps {
  index: number;
  total: number;
  onJump?: (i: number) => void;
}

export function ListingCardProgress({ index, total, onJump }: ListingCardProgressProps) {
  if (total <= 0) return null;

  // Cap the number of rendered segments so a large deck doesn't render
  // hundreds of slivers — collapse to a plain fraction instead past that.
  const MAX_SEGMENTS = 24;
  const showSegments = total <= MAX_SEGMENTS;

  return (
    <div className="flex flex-col items-center gap-2 w-full max-w-xl mx-auto">
      {showSegments && (
        <div className="flex gap-1 w-full">
          {Array.from({ length: total }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onJump?.(i)}
              aria-label={`Go to listing ${i + 1}`}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= index ? 'bg-gray-900' : 'bg-gray-200 hover:bg-gray-300'}`}
            />
          ))}
        </div>
      )}
      <p className="text-xs font-semibold text-gray-400">
        {index + 1} / {total} Listings
      </p>
    </div>
  );
}
