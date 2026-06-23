import { Link } from 'react-router';
import { Zap } from 'lucide-react';
import { fpApi } from '../lib/fpSystem';

interface FPBadgeProps {
  userId: string;
  compact?: boolean;
}

export function FPBadge({ userId, compact }: FPBadgeProps) {
  const balance = fpApi.getBalance(userId);

  if (compact) {
    return (
      <Link to="/wallet"
        className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black px-2.5 py-1.5 rounded-xl transition-colors">
        <Zap className="w-3.5 h-3.5 text-yellow-300" />
        <span>{fpApi.fmt(balance)}</span>
      </Link>
    );
  }

  return (
    <Link to="/wallet"
      className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white px-3 py-1.5 rounded-xl transition-all shadow-sm">
      <Zap className="w-4 h-4 text-yellow-300" />
      <span className="text-sm font-black">{fpApi.fmt(balance)} <span className="text-blue-300 font-semibold">FP</span></span>
    </Link>
  );
}
