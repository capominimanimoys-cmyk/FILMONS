/**
 * Skeleton loading placeholders — shimmer effect, no spinners.
 */

export function SkeletonLine({ w = 'w-full', h = 'h-4' }: { w?: string; h?: string }) {
  return <div className={`skeleton rounded-xl ${w} ${h}`} />;
}

export function SkeletonAvatar({ size = 40 }: { size?: number }) {
  return <div className="skeleton rounded-full shrink-0" style={{ width: size, height: size }} />;
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
      <div className="flex items-center gap-3">
        <SkeletonAvatar size={40} />
        <div className="flex-1 space-y-2">
          <SkeletonLine w="w-32" h="h-3" />
          <SkeletonLine w="w-20" h="h-2.5" />
        </div>
      </div>
      <SkeletonLine h="h-3" />
      <SkeletonLine w="w-4/5" h="h-3" />
      <div className="skeleton rounded-xl w-full h-48" />
      <div className="flex gap-4">
        <SkeletonLine w="w-16" h="h-2.5" />
        <SkeletonLine w="w-16" h="h-2.5" />
      </div>
    </div>
  );
}

export function SkeletonListingCard() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
      <div className="skeleton w-full aspect-[4/3]" />
      <div className="p-3 space-y-2">
        <SkeletonLine h="h-3" />
        <SkeletonLine w="w-2/3" h="h-2.5" />
        <SkeletonLine w="w-1/2" h="h-3" />
      </div>
    </div>
  );
}

export function SkeletonProfile() {
  return (
    <div className="animate-pulse">
      {/* Cover */}
      <div className="skeleton w-full h-48" />
      {/* Identity card */}
      <div className="bg-white rounded-b-2xl p-4 pb-5">
        <div className="flex justify-end gap-2 mb-3">
          <div className="skeleton w-8 h-8 rounded-lg" />
          <div className="skeleton w-20 h-8 rounded-lg" />
        </div>
        <div className="flex items-center gap-3 mt-2">
          <div className="skeleton w-28 h-4 rounded-xl" />
          <div className="skeleton w-16 h-4 rounded-xl" />
        </div>
        <div className="skeleton w-48 h-3 rounded-xl mt-2" />
        <div className="flex gap-4 mt-3">
          <div className="skeleton w-16 h-3 rounded-xl" />
          <div className="skeleton w-16 h-3 rounded-xl" />
          <div className="skeleton w-16 h-3 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div className="space-y-4 px-4 pt-2">
      {[1,2,3].map(i => <SkeletonCard key={i} />)}
    </div>
  );
}