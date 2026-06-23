/**
 * ProfessionPicker — reusable professional identity search component.
 * Used in: Create Account (Step 5), Edit Profile (AboutEditor), Profile About view.
 *
 * Supports typo-tolerant search, category-grouped suggestions, custom entries,
 * and a dark/light variant.
 */
import { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';

// ── Profession catalogue ──────────────────────────────────────────────────────
export const PROFESSIONS: { cat: string; items: string[] }[] = [
  { cat: 'Film & Video',  items: ['Director','Cinematographer','Camera Operator','Gaffer','Grip','Producer','Video Editor','Colorist','VFX Artist','Sound Designer','Steadicam Operator','Script Supervisor','Music Video Director','Documentary Filmmaker','Video Producer'] },
  { cat: 'Photography',   items: ['Photographer','Fashion Photographer','Retoucher','Studio Manager','Drone Photographer','Event Photographer','Portrait Photographer','Commercial Photographer','Product Photographer','Real Estate Photographer'] },
  { cat: 'Music & Audio', items: ['Music Producer','Beatmaker','Mixing Engineer','Mastering Engineer','DJ','Composer','Sound Designer','Podcast Producer','Audio Engineer','Recording Artist'] },
  { cat: 'Social Media',  items: ['Content Creator','UGC Creator','YouTuber','Streamer','TikTok Creator','Podcast Host','Influencer','Brand Ambassador','Social Media Manager'] },
  { cat: 'Design',        items: ['Graphic Designer','Motion Designer','UI Designer','UX Designer','Creative Director','Brand Designer','Animator','Illustrator','3D Artist','Visual Artist'] },
  { cat: 'Performance',   items: ['Actor','Voice Actor','Dancer','Choreographer','Comedian','Host','Model','Presenter','MC','Stunt Performer'] },
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
): { item: string; cat: string }[] {
  if (!query.trim()) return [];
  const results: { item: string; cat: string; score: number }[] = [];
  for (const { cat, items } of PROFESSIONS) {
    for (const item of items) {
      if (exclude.includes(item)) continue;
      const score = scoreMatch(item, query);
      if (score > 0) results.push({ item, cat, score });
    }
  }
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
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
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ProfessionPicker({
  primaryRole,
  onPrimaryChange,
  secondaryRoles,
  onSecondaryChange,
  variant     = 'light',
  primaryOnly = false,
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

  const primarySuggestions   = searchProfessions(primaryQ,   primaryRole ? [primaryRole, ...secondaryRoles] : secondaryRoles);
  const secondarySuggestions = searchProfessions(secondaryQ, [primaryRole, ...secondaryRoles]);

  const selectPrimary = (role: string) => {
    onPrimaryChange(role);
    setPrimaryQ('');
    setPrimaryOpen(false);
  };

  const addSecondary = (role: string) => {
    if (!secondaryRoles.includes(role)) onSecondaryChange([...secondaryRoles, role]);
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

  return (
    <div className="space-y-5">

      {/* ── Primary Profession ── */}
      <div>
        <span className={labelCls}>Primary Profession <span className={dark ? 'text-white/20 normal-case font-normal' : 'text-gray-400 normal-case font-normal'}>(required — pick one)</span></span>

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
          <span className={labelCls}>Secondary Professions <span className={dark ? 'text-white/20 normal-case font-normal' : 'text-gray-400 normal-case font-normal'}>(optional — multiple)</span></span>

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
