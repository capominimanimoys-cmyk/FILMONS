import { Zap } from 'lucide-react';

type AccountType = 'creator' | 'creator_plus' | 'professional' | 'business' | undefined;

interface AccountTypeBadgeProps {
  type?: AccountType;
  size?: 'sm' | 'md';
}

export function AccountTypeBadge({ type, size = 'md' }: AccountTypeBadgeProps) {
  // Only show for creator+ (business) — no generic "Business" label
  if (type !== 'business') return null;
  const isSmall = size === 'sm';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-0 shadow-sm ${
      isSmall ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
    }`}>
      <Zap className={isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      Creator+
    </span>
  );
}

/** Returns avatar background class deterministically from a name/id string */
export function getAvatarColor(seed: string): string {
  const palette = [
    'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-orange-500',
    'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500',
    'bg-amber-500', 'bg-cyan-500',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

/** Avatar circle — shows photo if available, otherwise coloured initials.
 *  Pass `accountType` to show the Creator+ badge overlay on the avatar.
 */
export function UserAvatar({
  user,
  size = 40,
  className = '',
  showAccountBadge = false,
}: {
  user: { name: string; avatar?: string; id?: string; accountType?: string } | null | undefined;
  size?: number;
  className?: string;
  showAccountBadge?: boolean;
}) {
  if (!user) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 ${className}`}
      >
        <span style={{ fontSize: size * 0.36 }} className="text-gray-400 font-bold">?</span>
      </div>
    );
  }
  const initials = (user.name || '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const colorClass = getAvatarColor(user.id || user.name || '');
  const style = { width: size, height: size, fontSize: size * 0.36 };

  const isCreatorPlus = user.accountType === 'business';
  const badgeSize = Math.max(14, Math.round(size * 0.32));

  const avatar = user.avatar ? (
    <img
      src={user.avatar}
      alt={user.name}
      style={style}
      className={`rounded-full object-cover flex-shrink-0 ${className}`}
    />
  ) : (
    <div
      style={style}
      className={`rounded-full ${colorClass} flex items-center justify-center text-white font-bold flex-shrink-0 ${className}`}
    >
      {initials}
    </div>
  );

  if (!isCreatorPlus || !showAccountBadge) {
    return avatar;
  }

  // Creator+ overlay badge
  return (
    <div className="relative inline-flex flex-shrink-0">
      {avatar}
      <div
        style={{ width: badgeSize, height: badgeSize, bottom: -2, right: -2 }}
        className="absolute bg-gradient-to-br from-purple-600 to-indigo-700 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-10"
        title="Creator+"
      >
        <span style={{ fontSize: badgeSize * 0.45 }} className="text-white font-black leading-none">C+</span>
      </div>
    </div>
  );
}