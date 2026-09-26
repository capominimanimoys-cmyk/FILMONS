/**
 * BusinessIndustryPicker — Business accounts' equivalent of ProfessionPicker's
 * `useSheetOnMobile` mode: a trigger row showing the current selection, tap
 * opens an EditProfileFieldPanel (full-screen bottom-up on mobile, right-side
 * panel on desktop -- that responsiveness is built into the panel itself, no
 * separate desktop system needed) with a search box + flat single-select list
 * over BUSINESS_INDUSTRIES. Flat, not grouped -- there's no "Community"/custom
 * entry like ProfessionPicker's role catalogue has, since the taxonomy already
 * includes "Other" and the spec is explicit about using the real taxonomy
 * rather than hard-coded/free-text options.
 */
import { useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { EditProfileFieldPanel } from './EditProfileFieldPanel';
import { BUSINESS_INDUSTRIES } from '../lib/businessIndustries';

/** The reusable "search + flat single-select list" content, shared between
 *  this field-editor picker and BusinessIndustryPrompt's completion prompt. */
export function BusinessIndustryList({ value, onSelect }: { value?: string; onSelect: (industry: string) => void }) {
  const [q, setQ] = useState('');
  const rows = q.trim()
    ? BUSINESS_INDUSTRIES.filter(i => i.toLowerCase().includes(q.trim().toLowerCase()))
    : BUSINESS_INDUSTRIES;

  return (
    <>
      <div className="px-4 pt-3 pb-2 sticky top-0 bg-white z-10">
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search industries…"
            className="flex-1 bg-transparent text-sm outline-none text-gray-900 placeholder:text-gray-400"
          />
        </div>
      </div>
      <div className="pb-2">
        {rows.map(item => (
          <button key={item} type="button" onClick={() => onSelect(item)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
            <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${value === item ? 'border-blue-600' : 'border-gray-300'}`}>
              {value === item && <span className="w-2 h-2 rounded-full bg-blue-600" />}
            </span>
            <span className="text-sm font-semibold text-gray-800">{item}</span>
          </button>
        ))}
        {rows.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">No matches</p>}
      </div>
    </>
  );
}

export interface BusinessIndustryPickerProps {
  value: string;
  onChange: (industry: string) => void;
  variant?: 'dark' | 'light';
}

export function BusinessIndustryPicker({ value, onChange, variant = 'light' }: BusinessIndustryPickerProps) {
  const dark = variant === 'dark';
  const [open, setOpen] = useState(false);

  const labelCls = dark
    ? 'text-[10px] font-black text-white/30 uppercase tracking-widest mb-2 block'
    : 'text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block';
  const triggerCls = dark
    ? 'w-full flex items-center justify-between gap-2 pl-9 pr-4 py-3.5 text-sm rounded-2xl bg-white/10 border border-white/20 text-left'
    : 'w-full flex items-center justify-between gap-2 pl-9 pr-4 py-3 text-sm rounded-xl bg-gray-50 border border-gray-200 text-left';

  return (
    <div>
      <span className={labelCls}>
        Business Industry <span className={dark ? 'text-white/20 normal-case font-normal' : 'text-gray-400 normal-case font-normal'}>(required, pick one)</span>
      </span>
      <div className="relative">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none w-4 h-4 ${dark ? 'text-white/40' : 'text-gray-400'}`} />
        <button type="button" onClick={() => setOpen(true)} className={triggerCls}>
          <span className={value ? (dark ? 'text-white font-semibold' : 'text-gray-900 font-semibold') : (dark ? 'text-white/40' : 'text-gray-400')}>
            {value || 'Select your business industry…'}
          </span>
          <ChevronDown className={`w-4 h-4 shrink-0 ${dark ? 'text-white/40' : 'text-gray-400'}`} />
        </button>
      </div>

      {open && (
        <EditProfileFieldPanel title="Business Industry" onClose={() => setOpen(false)}>
          <BusinessIndustryList value={value} onSelect={industry => { onChange(industry); setOpen(false); }} />
        </EditProfileFieldPanel>
      )}
    </div>
  );
}
