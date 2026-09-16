// Settings -> Trust & Verification header -- unlike Home/Profile, Settings
// is the ONE place the owner sees the actual numerical score (per spec:
// "Home answers 'trust level?', Settings answers 'why this score?'").
import { ShieldCheck, BadgeCheck } from 'lucide-react';
import { ReliabilityProgressBar } from './ReliabilityProgressBar';
import { trustLevelLabel, nextTrustLevel, type TrustLevel } from '../../lib/trustApi';

export function ReliabilityScoreHeader({ score, level }: { score: number; level: TrustLevel }) {
  const next = nextTrustLevel(score, level);
  const isElite = level === 'elite';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-2">
        {isElite ? <BadgeCheck className="w-7 h-7 text-purple-600" /> : <ShieldCheck className="w-7 h-7 text-gray-500" />}
      </div>
      <p className="text-xl font-black text-gray-900 tracking-tight uppercase">{trustLevelLabel(level)}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">
        {isElite ? 'Highest FILMONS Trust Level' : 'FILMONS Reliability'}
      </p>

      <p className="text-3xl font-black text-gray-900 mt-3">{Math.round(score)}<span className="text-base text-gray-400 font-bold">/100</span></p>
      <div className="mt-3 max-w-xs mx-auto">
        <ReliabilityProgressBar value={score} max={100} colorClass={isElite ? 'bg-purple-600' : 'bg-blue-600'} />
      </div>

      <p className="text-xs text-gray-500 mt-3">
        {isElite
          ? 'Continue building genuine professional relationships and maintaining a strong FILMONS history.'
          : next ? `${next.pointsRemaining} points to ${next.label}` : null}
      </p>
    </div>
  );
}
