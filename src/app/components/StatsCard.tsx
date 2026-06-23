/**
 * StatsCard — reusable metric/KPI card.
 * Used across: HostDashboard, FPWallet, AdminVerifications, etc.
 */
import { ReactNode } from 'react';

interface StatsCardProps {
  /** Icon element rendered in the coloured square */
  icon: ReactNode;
  /** Short label shown above the value */
  label: string;
  /** Primary metric value (string so callers can pre-format) */
  value: string;
  /** Optional secondary/sub text below the value */
  sub?: string;
  /** Tailwind classes for the icon background + text colour, e.g. "bg-blue-100 text-blue-600" */
  color?: string;
  /** Optional trend indicator — positive number turns green, negative turns red */
  trend?: number;
  /** Click handler if the card is interactive */
  onClick?: () => void;
  className?: string;
}

export function StatsCard({
  icon,
  label,
  value,
  sub,
  color = 'bg-blue-100 text-blue-600',
  trend,
  onClick,
  className = '',
}: StatsCardProps) {
  const hasTrend = trend !== undefined;
  const trendPositive = hasTrend && trend >= 0;

  return (
    <div
      className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-4 items-start
        ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} ${className}`}
      onClick={onClick}
    >
      {/* Icon */}
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-400 font-medium mb-0.5 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-black text-gray-900 leading-tight truncate">{value}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
          {hasTrend && (
            <span
              className={`text-[11px] font-bold ${
                trendPositive ? 'text-green-500' : 'text-red-400'
              }`}
            >
              {trendPositive ? '↑' : '↓'} {Math.abs(trend)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatsGrid — convenience wrapper that places StatsCards in a responsive grid
// ─────────────────────────────────────────────────────────────────────────────
interface StatsGridProps {
  children: ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}

const COL_MAP: Record<2 | 3 | 4, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
};

export function StatsGrid({ children, cols = 4, className = '' }: StatsGridProps) {
  return (
    <div className={`grid gap-4 ${COL_MAP[cols]} ${className}`}>
      {children}
    </div>
  );
}
