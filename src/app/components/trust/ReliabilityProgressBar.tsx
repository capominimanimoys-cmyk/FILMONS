// Thin, premium, rounded progress bar shared by every Reliability breakdown
// row in Settings -> Trust & Verification.
export function ReliabilityProgressBar({ value, max, colorClass = 'bg-blue-600' }: {
  value: number; max: number; colorClass?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-[width] duration-300 ${colorClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
