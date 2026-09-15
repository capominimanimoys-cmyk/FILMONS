// Equipment the creator owns/uses -- distinct from Listings (marketplace
// items actively for rent/sale). Reads the existing `gear` string-array
// field (already collected in AboutEditor's "Gear & Tools" accordion).
import { useState } from 'react';
import { Camera, Pencil } from 'lucide-react';

const PREVIEW_COUNT = 6;

export function MyGearSection({ gear, isOwner, onEdit }: { gear: string[]; isOwner: boolean; onEdit?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  if (!gear.length && !isOwner) return null;

  const visible = expanded ? gear : gear.slice(0, PREVIEW_COUNT);
  const remaining = gear.length - visible.length;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-black text-gray-900 flex items-center gap-1.5"><Camera className="w-4 h-4 text-gray-400" /> My Gear/Tools</p>
        {isOwner && (
          <button onClick={onEdit} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
            <Pencil className="w-3 h-3" /> Edit
          </button>
        )}
      </div>

      {!gear.length ? (
        <p className="text-xs text-gray-400">No gear or tools listed yet.</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {visible.map(g => (
            <span key={g} className="shrink-0 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-full whitespace-nowrap">
              {g}
            </span>
          ))}
          {!expanded && remaining > 0 && (
            <button onClick={() => setExpanded(true)}
              className="shrink-0 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full whitespace-nowrap">
              +{remaining}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
