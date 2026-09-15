import { useState } from 'react';
import { Sparkles, Pencil } from 'lucide-react';

const PREVIEW_COUNT = 6;

export function TopSkillsSection({ skills, isOwner, onEdit }: { skills: string[]; isOwner: boolean; onEdit?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  if (!skills.length && !isOwner) return null;

  const visible = expanded ? skills : skills.slice(0, PREVIEW_COUNT);
  const remaining = skills.length - visible.length;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-black text-gray-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-gray-400" /> Top Skills</p>
        {isOwner && (
          <button onClick={onEdit} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
            <Pencil className="w-3 h-3" /> Edit
          </button>
        )}
      </div>

      {!skills.length ? (
        <p className="text-xs text-gray-400">No skills added yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {visible.map(s => (
            <span key={s} className="text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-full">
              {s}
            </span>
          ))}
          {!expanded && remaining > 0 && (
            <button onClick={() => setExpanded(true)}
              className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full">
              +{remaining} more
            </button>
          )}
        </div>
      )}
    </section>
  );
}
