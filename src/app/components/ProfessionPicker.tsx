/**
 * ProfessionPicker — reusable professional identity search component.
 * Used in: Create Account (Step 5), Edit Profile (AboutEditor), Profile About view.
 *
 * Supports typo-tolerant search, category-grouped suggestions, custom entries,
 * and a dark/light variant.
 */
import { useState, useRef, useEffect } from 'react';
import { Search, Check, ChevronDown } from 'lucide-react';
import { Icon } from './Icon';
import { BottomSheet } from './BottomSheet';

// ── Profession catalogue ──────────────────────────────────────────────────────
export const PROFESSIONS: { cat: string; items: string[] }[] = [
  { cat: 'Film & Video',  items: ['Director','Cinematographer','Camera Operator','Gaffer','Grip','Producer','Video Editor','Colorist','VFX Artist','Sound Designer','Steadicam Operator','Script Supervisor','Music Video Director','Documentary Filmmaker','Video Producer'] },
  { cat: 'Photography',   items: ['Photographer','Fashion Photographer','Retoucher','Studio Manager','Drone Photographer','Event Photographer','Portrait Photographer','Commercial Photographer','Product Photographer','Real Estate Photographer'] },
  { cat: 'Music & Audio', items: ['Music Producer','Beatmaker','Rapper','Singer','Songwriter','Mixing Engineer','Mastering Engineer','DJ','Composer','Sound Designer','Podcast Producer','Audio Engineer','Recording Artist','Vocalist'] },
  { cat: 'Social Media',  items: ['Content Creator','UGC Creator','YouTuber','Streamer','TikTok Creator','Podcast Host','Influencer','Brand Ambassador','Social Media Manager'] },
  { cat: 'Design',        items: ['Graphic Designer','Motion Designer','UI Designer','UX Designer','Creative Director','Brand Designer','Animator','Illustrator','3D Artist','Visual Artist'] },
  { cat: 'Performance',   items: ['Actor','Voice Actor','Dancer','Choreographer','Comedian','Host','Model','Presenter','MC','Stunt Performer','Spoken Word Artist'] },
  { cat: 'Writing',       items: ['Screenwriter','Copywriter','Story Editor','Blogger','Journalist','Lyricist','Narrative Designer','Script Doctor'] },
  { cat: 'Emerging',      items: ['AI Artist','Prompt Engineer','XR Designer','Virtual Production Artist','NFT Creator','Generative Artist','Technical Director'] },
];

export const ALL_PROFESSIONS = PROFESSIONS.flatMap(c => c.items);

// ── Fuzzy search ──────────────────────────────────────────────────────────────
function scoreMatch(item: string, query: string): number {
  const lc = item.toLowerCase();
  const q  = query.toLowerCase().trim();
  if (!q) return 0;
  if (lc === q)                                         return 10;
  if (lc.startsWith(q))                                return 8;
  if (lc.includes(q))                                  return 6;
  const words = lc.split(/\s+/);
  if (words.some(w => w.startsWith(q)))                return 5;
  if (words.some(w => w.includes(q) && q.length > 2)) return 3;
  // multi-word query: every token in query must appear somewhere
  const tokens = q.split(/\s+/).filter(t => t.length > 1);
  if (tokens.length > 1 && tokens.every(t => lc.includes(t)))  return 4;
  return 0;
}

function searchProfessions(
  query: string,
  exclude: string[],
  extras: string[] = [],
): { item: string; cat: string }[] {
  if (!query.trim()) return [];
  const results: { item: string; cat: string; score: number }[] = [];
  const hardcodedLower = new Set(ALL_PROFESSIONS.map(p => p.toLowerCase()));
  for (const { cat, items } of PROFESSIONS) {
    for (const item of items) {
      if (exclude.some(e => e.toLowerCase() === item.toLowerCase())) continue;
      const score = scoreMatch(item, query);
      if (score > 0) results.push({ item, cat, score });
    }
  }
  // DB suggestions not already in the hardcoded catalogue
  for (const item of extras) {
    if (hardcodedLower.has(item.toLowerCase())) continue;
    if (exclude.some(e => e.toLowerCase() === item.toLowerCase())) continue;
    const score = scoreMatch(item, query);
    if (score > 0) results.push({ item, cat: 'Community', score });
  }
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ item, cat }) => ({ item, cat }));
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface ProfessionPickerProps {
  primaryRole:       string;
  onPrimaryChange:   (role: string) => void;
  secondaryRoles:    string[];
  onSecondaryChange: (roles: string[]) => void;
  variant?:          'dark' | 'light';
  /** Hide the secondary section (useful when only primary is needed) */
  primaryOnly?:      boolean;
  /** Extra suggestions loaded from the DB (merged with the hardcoded catalogue) */
  dbSuggestions?:    string[];
  /** Called whenever a role is selected — use to persist to DB */
  onTagSelected?:    (role: string, type: 'primary_role' | 'secondary_role') => void;
  /** Opt-in: renders both pickers as a tap-to-open BottomSheet (search +
   * full grouped list, radio/check-style rows) instead of the always-
   * visible inline autocomplete below. BottomSheet's own responsive CSS
   * already renders as a centered modal on desktop, so this one flag
   * covers both breakpoints. Defaults to false/unset so the other existing
   * callers (Onboarding, GoogleSignup, CategoryResults' filter panel) are
   * completely unaffected -- only a caller that explicitly opts in (Edit
   * Profile) gets the new sheet-based picker. */
  useSheetOnMobile?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ProfessionPicker({
  primaryRole,
  onPrimaryChange,
  secondaryRoles,
  onSecondaryChange,
  variant        = 'light',
  primaryOnly    = false,
  dbSuggestions  = [],
  onTagSelected,
  useSheetOnMobile = false,
}: ProfessionPickerProps) {
  const dark = variant === 'dark';

  // Primary search
  const [primaryQ,     setPrimaryQ]     = useState('');
  const [primaryOpen,  setPrimaryOpen]  = useState(false);
  const primaryRef = useRef<HTMLDivElement>(null);

  // Secondary search
  const [secondaryQ,    setSecondaryQ]    = useState('');
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const secondaryRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (primaryRef.current   && !primaryRef.current.contains(e.target as Node))   setPrimaryOpen(false);
      if (secondaryRef.current && !secondaryRef.current.contains(e.target as Node)) setSecondaryOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const primarySuggestions   = searchProfessions(primaryQ,   primaryRole ? [primaryRole, ...secondaryRoles] : secondaryRoles, dbSuggestions);
  const secondarySuggestions = searchProfessions(secondaryQ, [primaryRole, ...secondaryRoles], dbSuggestions);

  const selectPrimary = (role: string) => {
    onPrimaryChange(role);
    onTagSelected?.(role, 'primary_role');
    setPrimaryQ('');
    setPrimaryOpen(false);
  };

  const addSecondary = (role: string) => {
    if (!secondaryRoles.includes(role)) onSecondaryChange([...secondaryRoles, role]);
    onTagSelected?.(role, 'secondary_role');
    setSecondaryQ('');
    setSecondaryOpen(false);
  };

  const removeSecondary = (role: string) => {
    onSecondaryChange(secondaryRoles.filter(r => r !== role));
  };

  // Styles
  const inputCls = dark
    ? 'w-full pl-9 pr-4 py-3.5 text-sm rounded-2xl outline-none bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-blue-400 transition-all'
    : 'w-full pl-9 pr-4 py-3 text-sm rounded-xl outline-none bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all';

  const dropCls = dark
    ? 'absolute z-50 top-full left-0 right-0 mt-1 bg-gray-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden'
    : 'absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden';

  const labelCls = dark
    ? 'text-[10px] font-black text-white/30 uppercase tracking-widest mb-2 block'
    : 'text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block';

  const chipCls  = dark
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600/25 border border-blue-500/40 text-white'
    : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-50 border border-blue-200 text-blue-700';

  const rowHoverCls = dark
    ? 'w-full text-left flex items-start gap-3 px-4 py-2.5 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0'
    : 'w-full text-left flex items-start gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0';

  // "Large selector" mode -- opt-in (see useSheetOnMobile's own comment).
  // A trigger row (shows the current selection, chevron rotates open/
  // closed) opens a BottomSheet containing a search box + the full
  // grouped catalogue (radio dots for the single-select Primary, check
  // marks for the multi-select Secondary), instead of the always-visible
  // inline autocomplete below. BottomSheet's own responsive CSS already
  // renders as a centered modal on desktop, so this covers both.
  if (useSheetOnMobile) {
    const triggerCls = dark
      ? 'w-full flex items-center justify-between gap-2 pl-9 pr-4 py-3.5 text-sm rounded-2xl bg-white/10 border border-white/20 text-left'
      : 'w-full flex items-center justify-between gap-2 pl-9 pr-4 py-3 text-sm rounded-xl bg-gray-50 border border-gray-200 text-left';

    const sheetRows = (query: string, exclude: string[]) => {
      if (query.trim()) return searchProfessions(query, exclude, dbSuggestions);
      return PROFESSIONS.flatMap(({ cat, items }) => items.filter(i => !exclude.includes(i)).map(item => ({ item, cat })));
    };

    return (
      <div className="space-y-5">
        {/* ── Primary Profession ── */}
        <div>
          <span className={labelCls}>Primary Profession <span className={dark ? 'text-white/20 normal-case font-normal' : 'text-gray-400 normal-case font-normal'}>(required, pick one)</span></span>
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none w-4 h-4 ${dark ? 'text-white/40' : 'text-gray-400'}`} />
            <button type="button" onClick={() => setPrimaryOpen(true)} className={triggerCls}>
              <span className={primaryRole ? (dark ? 'text-white font-semibold' : 'text-gray-900 font-semibold') : (dark ? 'text-white/40' : 'text-gray-400')}>
                {primaryRole || 'Select your primary profession…'}
              </span>
              <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${primaryOpen ? 'rotate-180' : ''} ${dark ? 'text-white/40' : 'text-gray-400'}`} />
            </button>
          </div>
        </div>

        {/* ── Secondary Professions ── */}
        {!primaryOnly && (
          <div>
            <span className={labelCls}>Secondary Professions <span className={dark ? 'text-white/20 normal-case font-normal' : 'text-gray-400 normal-case font-normal'}>(optional, multiple)</span></span>
            {secondaryRoles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {secondaryRoles.map(r => (
                  <span key={r} className={chipCls}>
                    {r}
                    <button type="button" onClick={() => removeSecondary(r)} className={dark ? 'text-white/40 hover:text-red-400 transition-colors' : 'text-blue-400 hover:text-red-500 transition-colors'}>
                      <Icon name="close" size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none w-4 h-4 ${dark ? 'text-white/40' : 'text-gray-400'}`} />
              <button type="button" onClick={() => setSecondaryOpen(true)} className={triggerCls}>
                <span className={dark ? 'text-white/40' : 'text-gray-400'}>Add another profession…</span>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${secondaryOpen ? 'rotate-180' : ''} ${dark ? 'text-white/40' : 'text-gray-400'}`} />
              </button>
            </div>
          </div>
        )}

        {primaryOpen && (
          <BottomSheet title="Primary Role" onClose={() => { setPrimaryOpen(false); setPrimaryQ(''); }}>
            <div className="px-4 pt-3 pb-2 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                <Search className="w-4 h-4 text-gray-400 shrink-0" />
                <input autoFocus value={primaryQ} onChange={e => setPrimaryQ(e.target.value)} placeholder="Search roles…"
                  className="flex-1 bg-transparent text-sm outline-none text-gray-900 placeholder:text-gray-400" />
              </div>
            </div>
            <div className="pb-2">
              {sheetRows(primaryQ, secondaryRoles).map(({ item, cat }) => (
                <button key={item} type="button" onClick={() => selectPrimary(item)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                  <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${primaryRole === item ? 'border-blue-600' : 'border-gray-300'}`}>
                    {primaryRole === item && <span className="w-2 h-2 rounded-full bg-blue-600" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-800">{item}</span>
                    <span className="block text-xs text-gray-400">{cat}</span>
                  </span>
                </button>
              ))}
              {primaryQ.trim() && !ALL_PROFESSIONS.some(p => p.toLowerCase() === primaryQ.trim().toLowerCase()) && (
                <button type="button" onClick={() => selectPrimary(primaryQ.trim())} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                  <Icon name="plus" size={14} className="text-blue-500 shrink-0" />
                  <span className="text-sm font-semibold text-blue-600">Add &ldquo;{primaryQ.trim()}&rdquo;</span>
                </button>
              )}
            </div>
          </BottomSheet>
        )}

        {secondaryOpen && (
          <BottomSheet title="Also Works As" onClose={() => { setSecondaryOpen(false); setSecondaryQ(''); }}>
            <div className="px-4 pt-3 pb-2 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                <Search className="w-4 h-4 text-gray-400 shrink-0" />
                <input autoFocus value={secondaryQ} onChange={e => setSecondaryQ(e.target.value)} placeholder="Search roles…"
                  className="flex-1 bg-transparent text-sm outline-none text-gray-900 placeholder:text-gray-400" />
              </div>
            </div>
            <div className="pb-2">
              {sheetRows(secondaryQ, [primaryRole, ...secondaryRoles]).map(({ item, cat }) => (
                <button key={item} type="button" onClick={() => addSecondary(item)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                  <span className="w-4 h-4 rounded border-2 border-gray-300 shrink-0 flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-transparent" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-800">{item}</span>
                    <span className="block text-xs text-gray-400">{cat}</span>
                  </span>
                </button>
              ))}
              {secondaryQ.trim() && !ALL_PROFESSIONS.some(p => p.toLowerCase() === secondaryQ.trim().toLowerCase()) && (
                <button type="button" onClick={() => addSecondary(secondaryQ.trim())} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                  <Icon name="plus" size={14} className="text-blue-500 shrink-0" />
                  <span className="text-sm font-semibold text-blue-600">Add &ldquo;{secondaryQ.trim()}&rdquo;</span>
                </button>
              )}
            </div>
          </BottomSheet>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Primary Profession ── */}
      <div>
        <span className={labelCls}>Primary Profession <span className={dark ? 'text-white/20 normal-case font-normal' : 'text-gray-400 normal-case font-normal'}>(required, pick one)</span></span>

        {/* Selected primary chip */}
        {primaryRole && (
          <div className="flex items-center gap-2 mb-2.5">
            <span className={chipCls}>
              {primaryRole}
              <button
                type="button"
                onClick={() => onPrimaryChange('')}
                className={dark ? 'text-white/40 hover:text-red-400 transition-colors' : 'text-blue-400 hover:text-red-500 transition-colors'}
              >
                <Icon name="close" size={11} />
              </button>
            </span>
            <span className={dark ? 'text-[11px] text-white/30' : 'text-[11px] text-gray-400'}>Tap to change</span>
          </div>
        )}

        {/* Search input */}
        <div className="relative" ref={primaryRef}>
          <Icon
            name="search"
            size={16}
            className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${dark ? 'text-white/40' : 'text-gray-400'}`}
          />
          <input
            type="text"
            value={primaryQ}
            onChange={e => { setPrimaryQ(e.target.value); setPrimaryOpen(true); }}
            onFocus={() => setPrimaryOpen(true)}
            placeholder={primaryRole ? `Search to change primary…` : 'Director, Photographer, Video Editor…'}
            className={inputCls}
          />

          {primaryOpen && (primarySuggestions.length > 0 || primaryQ.trim()) && (
            <div className={dropCls}>
              {primarySuggestions.map(({ item, cat }) => (
                <button
                  key={item}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); selectPrimary(item); }}
                  className={rowHoverCls}
                >
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${dark ? 'text-white' : 'text-gray-800'}`}>{item}</p>
                    <p className={`text-xs ${dark ? 'text-white/30' : 'text-gray-400'}`}>{cat}</p>
                  </div>
                </button>
              ))}

              {/* Add custom */}
              {primaryQ.trim() && !ALL_PROFESSIONS.some(p => p.toLowerCase() === primaryQ.trim().toLowerCase()) && (
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); selectPrimary(primaryQ.trim()); }}
                  className={rowHoverCls}
                >
                  <Icon name="plus" size={14} className={dark ? 'text-blue-400 mt-0.5 shrink-0' : 'text-blue-500 mt-0.5 shrink-0'} />
                  <p className={`text-sm font-semibold ${dark ? 'text-blue-400' : 'text-blue-600'}`}>
                    Add &ldquo;{primaryQ.trim()}&rdquo;
                  </p>
                </button>
              )}

              {primarySuggestions.length === 0 && !primaryQ.trim() && (
                <p className={`px-4 py-3 text-sm ${dark ? 'text-white/30' : 'text-gray-400'}`}>Start typing to search…</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Secondary Professions ── */}
      {!primaryOnly && (
        <div>
          <span className={labelCls}>Secondary Professions <span className={dark ? 'text-white/20 normal-case font-normal' : 'text-gray-400 normal-case font-normal'}>(optional, multiple)</span></span>

          {/* Selected secondary chips */}
          {secondaryRoles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {secondaryRoles.map(r => (
                <span key={r} className={chipCls}>
                  {r}
                  <button
                    type="button"
                    onClick={() => removeSecondary(r)}
                    className={dark ? 'text-white/40 hover:text-red-400 transition-colors' : 'text-blue-400 hover:text-red-500 transition-colors'}
                  >
                    <Icon name="close" size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Search input */}
          <div className="relative" ref={secondaryRef}>
            <Icon
              name="search"
              size={16}
              className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${dark ? 'text-white/40' : 'text-gray-400'}`}
            />
            <input
              type="text"
              value={secondaryQ}
              onChange={e => { setSecondaryQ(e.target.value); setSecondaryOpen(true); }}
              onFocus={() => setSecondaryOpen(true)}
              placeholder="Camera Operator, Gaffer, DJ, Actor…"
              className={inputCls}
            />

            {secondaryOpen && (secondarySuggestions.length > 0 || secondaryQ.trim()) && (
              <div className={dropCls}>
                {secondarySuggestions.map(({ item, cat }) => (
                  <button
                    key={item}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); addSecondary(item); }}
                    className={rowHoverCls}
                  >
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${dark ? 'text-white' : 'text-gray-800'}`}>{item}</p>
                      <p className={`text-xs ${dark ? 'text-white/30' : 'text-gray-400'}`}>{cat}</p>
                    </div>
                  </button>
                ))}

                {/* Add custom */}
                {secondaryQ.trim() && !ALL_PROFESSIONS.some(p => p.toLowerCase() === secondaryQ.trim().toLowerCase()) && (
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); addSecondary(secondaryQ.trim()); }}
                    className={rowHoverCls}
                  >
                    <Icon name="plus" size={14} className={dark ? 'text-blue-400 mt-0.5 shrink-0' : 'text-blue-500 mt-0.5 shrink-0'} />
                    <p className={`text-sm font-semibold ${dark ? 'text-blue-400' : 'text-blue-600'}`}>
                      Add &ldquo;{secondaryQ.trim()}&rdquo;
                    </p>
                  </button>
                )}

                {secondarySuggestions.length === 0 && !secondaryQ.trim() && (
                  <p className={`px-4 py-3 text-sm ${dark ? 'text-white/30' : 'text-gray-400'}`}>Start typing to search…</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
