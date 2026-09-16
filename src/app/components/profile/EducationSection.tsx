// Kept deliberately separate from TopSkillsSection -- education tells
// viewers WHERE/HOW a creator learned their craft, skills tell them WHAT
// they can do. Same card treatment as the other "All" tab sections, but
// never merged into Skills.
import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { EduEntry, parseEducation, EDUCATION_TYPE_LABEL, EDUCATION_TYPE_EMOJI } from '../../lib/education';

const PREVIEW_COUNT = 3;

function EntryRow({ e }: { e: EduEntry }) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-sm mt-0.5">
        {EDUCATION_TYPE_EMOJI[e.type] || '🎓'}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-gray-900">{e.school}</p>
        <p className="text-[11px] text-gray-400 flex items-center gap-1 flex-wrap">
          {e.type && <span>{EDUCATION_TYPE_LABEL[e.type]}</span>}
          {(e.schoolCity || e.schoolProvince) && (
            <span>· {[e.schoolCity, e.schoolProvince].filter(Boolean).join(', ')}</span>
          )}
        </p>
        {(e.degree || e.field) && (
          <p className="text-xs text-blue-600 font-medium mt-0.5">{[e.degree, e.field].filter(Boolean).join(' · ')}</p>
        )}
        {(e.startYear || e.endYear || e.current) && (
          <p className="text-[11px] text-gray-400 mt-0.5">
            {e.startYear}{e.startYear && (e.endYear || e.current) ? ' – ' : ''}{e.current ? 'Present' : e.endYear}
          </p>
        )}
        {e.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{e.description}</p>
        )}
      </div>
    </div>
  );
}

export function EducationSection({ education, isOwner, onEdit }: {
  education: unknown; isOwner: boolean; onEdit?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const entries = parseEducation(education).entries.filter(e => e.showOnProfile || isOwner);

  // Viewer with nothing to show gets the section omitted entirely, per spec.
  if (!entries.length && !isOwner) return null;

  const visible = expanded ? entries : entries.slice(0, PREVIEW_COUNT);
  const remaining = entries.length - visible.length;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-black text-gray-900 flex items-center gap-1.5">🎓 Education & Training</p>
        {isOwner && (
          <button onClick={onEdit} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
            <Pencil className="w-3 h-3" /> {entries.length ? 'Edit' : '+ Add'}
          </button>
        )}
      </div>

      {!entries.length ? (
        <p className="text-xs text-gray-400">No education or training added yet.</p>
      ) : (
        <div className="space-y-3">
          {visible.map(e => <EntryRow key={e.id} e={e} />)}
          {!expanded && remaining > 0 && (
            <button onClick={() => setExpanded(true)} className="text-xs font-bold text-blue-600 hover:underline">
              View all education & training →
            </button>
          )}
        </div>
      )}
    </section>
  );
}
