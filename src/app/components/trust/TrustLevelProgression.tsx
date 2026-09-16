// Horizontal 5-level progression track near the bottom of Settings ->
// Trust & Verification. Elite begins at 80 -- never implies 100/100 is
// required to reach it.
import { TRUST_LEVELS, type TrustLevel } from '../../lib/trustApi';

export function TrustLevelProgression({ score, level }: { score: number; level: TrustLevel }) {
  const clamped = Math.min(100, Math.max(0, score));

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Trust Level</p>

      <div className="flex justify-between mb-1">
        {TRUST_LEVELS.map(t => (
          <p key={t.level} className={`text-[10px] font-bold ${t.level === level ? 'text-gray-900' : 'text-gray-300'}`}>
            {t.label}
          </p>
        ))}
      </div>

      <div className="relative h-1.5 bg-gray-100 rounded-full mt-2 mb-1">
        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 via-emerald-500 to-purple-600 rounded-full" style={{ width: `${clamped}%` }} />
        {TRUST_LEVELS.map(t => (
          <div key={t.level} className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white border-2 border-gray-300"
            style={{ left: `${t.minScore}%` }} />
        ))}
        <div className="absolute -top-1.5 w-3.5 h-3.5 rounded-full bg-gray-900 border-2 border-white shadow"
          style={{ left: `calc(${clamped}% - 7px)` }} title={`You: ${Math.round(score)}`} />
      </div>

      <div className="flex justify-between mt-1">
        {TRUST_LEVELS.map(t => <p key={t.level} className="text-[9px] text-gray-300">{t.minScore}</p>)}
      </div>

      <p className="text-center text-xs text-gray-500 mt-3">You: {Math.round(score)}</p>
    </div>
  );
}
