// The one reusable Trust Badge -- used identically on Profile, HostProfile,
// Home Portfolio/Listing cards, and Settings, so a level never looks
// different between surfaces. Level name is ALWAYS shown alongside the icon
// (never color-only), per spec.
import { Shield, ShieldCheck, BadgeCheck } from 'lucide-react';
import { TrustLevel, trustLevelLabel } from '../../lib/trustApi';

const LEVEL_STYLE: Record<TrustLevel, { bg: string; text: string; border: string; Icon: typeof Shield }> = {
  new:            { bg: 'bg-gray-50',   text: 'text-gray-500',   border: 'border-gray-200',   Icon: Shield },
  building_trust: { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  Icon: Shield },
  reliable:       { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   Icon: ShieldCheck },
  trusted:        { bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200',Icon: ShieldCheck },
  elite:          { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', Icon: BadgeCheck },
};

const SIZE_CLASS: Record<'sm' | 'md' | 'lg', { pad: string; text: string; icon: string }> = {
  sm: { pad: 'px-2 py-0.5',   text: 'text-[10px]', icon: 'w-2.5 h-2.5' },
  md: { pad: 'px-2.5 py-1',   text: 'text-xs',     icon: 'w-3.5 h-3.5' },
  lg: { pad: 'px-3.5 py-1.5', text: 'text-sm',     icon: 'w-4 h-4' },
};

export function TrustBadge({ level, size = 'md', onClick }: {
  level: TrustLevel | string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}) {
  const style = LEVEL_STYLE[(level as TrustLevel) ?? 'new'] ?? LEVEL_STYLE.new;
  const s = SIZE_CLASS[size];
  const Icon = style.Icon;
  const Comp = onClick ? 'button' : 'span';

  return (
    <Comp
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      className={`inline-flex items-center gap-1 font-bold rounded-full border ${style.bg} ${style.text} ${style.border} ${s.pad} ${s.text} ${onClick ? 'cursor-pointer hover:brightness-95 transition-[filter]' : ''}`}
    >
      <Icon className={s.icon} />
      {trustLevelLabel(level as TrustLevel)}
    </Comp>
  );
}
