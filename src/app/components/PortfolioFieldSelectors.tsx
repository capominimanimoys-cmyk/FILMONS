// Shared field-selector CONTENT components for the Work/Album "attached
// page" creation system -- each renders inside EditProfileFieldPanel (the
// existing, already-generic depth-stacked slide-in panel Edit Profile
// built; reused as-is rather than duplicated, since its own implementation
// has nothing profile-specific about it beyond its name/comments). One
// TagsSelector content component covers Skills & Tools, Hashtags, and
// Collaborators (Collaborators is scoped to a simple tag-style string
// array here, not the full linked-profile Credits picker Albums have --
// portfolio_items has no credits table today and this avoids a new
// migration) since all three are the same "chip list, type + Enter to
// add" interaction.
import { useState } from 'react';
import { Check, Globe, Lock, Users, Search, X } from 'lucide-react';
import { EditProfileFieldPanel } from './EditProfileFieldPanel';
import { PORTFOLIO_CATEGORIES, PORTFOLIO_SUBCATEGORIES } from '../lib/portfolioApi';

export type ItemVisibility = 'public' | 'connections' | 'private';

export const VISIBILITY_OPTIONS: { id: ItemVisibility; label: string; sub: string; Icon: any }[] = [
  { id: 'public',      label: 'Public',      sub: 'Anyone can view',       Icon: Globe },
  { id: 'connections', label: 'Connections', sub: 'Your connections only', Icon: Users },
  { id: 'private',     label: 'Private',     sub: 'Only you',              Icon: Lock  },
];

export function CategoryPanel({ category, subcategory, onSave, onClose, closing }: {
  category: string; subcategory: string;
  onSave: (category: string, subcategory: string) => void;
  onClose: () => void; closing?: boolean;
}) {
  const subs = PORTFOLIO_SUBCATEGORIES[category] ?? [];
  return (
    <EditProfileFieldPanel title="Category" onClose={onClose} closing={closing}>
      <div className="px-2 py-2">
        {PORTFOLIO_CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => onSave(c, PORTFOLIO_SUBCATEGORIES[c]?.includes(subcategory) ? subcategory : '')}
            className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-gray-50 rounded-xl"
          >
            <span className="text-sm font-bold text-gray-900">{c}</span>
            {category === c && <Check className="w-4 h-4 text-blue-500 shrink-0" />}
          </button>
        ))}
        {subs.length > 0 && (
          <>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4 pt-4 pb-2">Subcategory</p>
            {subs.map(s => (
              <button
                key={s}
                onClick={() => onSave(category, s)}
                className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-gray-50 rounded-xl"
              >
                <span className="text-sm font-bold text-gray-900">{s}</span>
                {subcategory === s && <Check className="w-4 h-4 text-blue-500 shrink-0" />}
              </button>
            ))}
          </>
        )}
      </div>
    </EditProfileFieldPanel>
  );
}

export function TextFieldPanel({ title, placeholder, value, onSave, onClose, closing, icon: Icon }: {
  title: string; placeholder: string; value: string;
  onSave: (v: string) => void; onClose: () => void; closing?: boolean;
  icon?: any;
}) {
  const [v, setV] = useState(value);
  return (
    <EditProfileFieldPanel
      title={title} onClose={onClose} closing={closing}
      footer={<button onClick={() => onSave(v.trim())} className="px-5 py-2.5 rounded-xl font-black text-white text-sm bg-blue-600">Done</button>}
    >
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 border border-gray-200 rounded-2xl px-4 py-3 bg-white">
          {Icon && <Icon className="w-4 h-4 text-gray-400 shrink-0" />}
          <input
            autoFocus value={v} onChange={e => setV(e.target.value)} placeholder={placeholder}
            onKeyDown={e => { if (e.key === 'Enter') onSave(v.trim()); }}
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
          />
        </div>
      </div>
    </EditProfileFieldPanel>
  );
}

export function TagsPanel({ title, placeholder, values, onSave, onClose, closing }: {
  title: string; placeholder: string; values: string[];
  onSave: (v: string[]) => void; onClose: () => void; closing?: boolean;
}) {
  const [tags, setTags] = useState<string[]>(values);
  const [input, setInput] = useState('');
  const add = () => {
    const t = input.trim().replace(/^#/, '');
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setInput('');
  };
  return (
    <EditProfileFieldPanel
      title={title} onClose={onClose} closing={closing}
      footer={<button onClick={() => onSave(tags)} className="px-5 py-2.5 rounded-xl font-black text-white text-sm bg-blue-600">Done</button>}
    >
      <div className="px-4 py-4">
        <div className="flex flex-wrap gap-2 border border-gray-200 rounded-2xl px-3 py-2.5 bg-white">
          {tags.map(t => (
            <span key={t} className="flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
              {t}
              <button onClick={() => setTags(prev => prev.filter(x => x !== t))}><X className="w-3 h-3" /></button>
            </span>
          ))}
          <input
            autoFocus value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
            onBlur={add}
            placeholder={tags.length ? '' : placeholder}
            className="flex-1 min-w-[100px] text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent py-1"
          />
        </div>
      </div>
    </EditProfileFieldPanel>
  );
}

export function VisibilityPanel({ value, onSave, onClose, closing }: {
  value: ItemVisibility; onSave: (v: ItemVisibility) => void; onClose: () => void; closing?: boolean;
}) {
  return (
    <EditProfileFieldPanel title="Visibility" onClose={onClose} closing={closing}>
      <div className="px-2 py-2">
        {VISIBILITY_OPTIONS.map(opt => (
          <button key={opt.id} onClick={() => onSave(opt.id)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 rounded-xl">
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
              <opt.Icon className="w-4 h-4 text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">{opt.label}</p>
              <p className="text-xs text-gray-400">{opt.sub}</p>
            </div>
            {value === opt.id && <Check className="w-4 h-4 text-blue-500 shrink-0" />}
          </button>
        ))}
      </div>
    </EditProfileFieldPanel>
  );
}

// A tappable row in the parent form that opens one of the panels above --
// same visual shape everywhere (label, current value preview, chevron).
export function FieldRow({ label, value, placeholder, onClick }: {
  label: string; value?: string; placeholder: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between border border-gray-200 rounded-2xl px-4 py-3 bg-white text-left">
      <span className="min-w-0">
        <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">{label}</span>
        <span className={`block text-sm font-bold truncate ${value ? 'text-gray-900' : 'text-gray-400'}`}>{value || placeholder}</span>
      </span>
      <span className="text-gray-300 shrink-0 ml-2">›</span>
    </button>
  );
}
