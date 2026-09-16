import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { ReliabilityProgressBar } from './ReliabilityProgressBar';

export function ReliabilityComponentCard({ icon: Icon, label, value, max, sub, children }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  max: number;
  sub?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const hasDetails = !!children;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button
        type="button"
        onClick={() => hasDetails && setOpen(o => !o)}
        className={`w-full text-left px-4 py-3.5 ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-gray-400 shrink-0" />
          <p className="text-sm font-bold text-gray-900 flex-1 min-w-0">{label}</p>
          <p className="text-sm font-black text-gray-900 shrink-0">{Math.round(value * 10) / 10} / {max}</p>
          {hasDetails && (
            <ChevronRight className={`w-4 h-4 text-gray-300 shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
          )}
        </div>
        <div className="mt-2">
          <ReliabilityProgressBar value={value} max={max} />
        </div>
        {sub && <p className="text-[11px] text-gray-400 mt-1.5">{sub}</p>}
      </button>

      {hasDetails && open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-50 dropdown-pop-in">
          {children}
        </div>
      )}
    </div>
  );
}
