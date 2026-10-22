// Read-only "About" card (bio + role / location / language rows) inside the All tab -- previously "About" WAS the
// tab (an inline edit form, AboutEditor). Now About is a display section;
// AboutEditor is reached via the Edit pencil here (and other sections'
// Edit links) as a full-screen overlay instead of tab content.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pencil, Briefcase, User, MapPin, Globe } from 'lucide-react';
import { BioText } from '../BioText';
import { normalizeTier } from '../../lib/reliabilityApi';

// secondaryRoles/openTo/languages come from the free-form profile_meta
// jsonb blob (see AboutEditor/Profile.tsx/HostProfile.tsx) -- nothing
// enforces it actually holds an array at the DB level, so an older record
// with e.g. a comma-string instead of a real array here would crash
// `.join()` ("x.join is not a function"). Normalize defensively instead of
// trusting the prop's declared type.
// "null"/"undefined" as literal text (not the JS values) show up when
// something upstream stringified a genuinely-empty value before it got
// here, and would otherwise survive as a garbage "Also Works As: null" row
// instead of being treated as empty.
const EMPTY_TOKENS = new Set(['null', 'undefined']);
const isRealValue = (s: string) => !!s && !EMPTY_TOKENS.has(s.toLowerCase());
function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(x => String(x ?? '').trim()).filter(isRealValue);
  if (typeof v === 'string' && v.trim()) return v.split(',').map(s => s.trim()).filter(isRealValue);
  return [];
}

export function AboutSection({
  bio, primaryRole, businessIndustry, accountType, secondaryRoles, location, languages, isOwner, onEdit,
}: {
  bio?: string;
  primaryRole?: string;
  /** Business accounts only -- replaces the two role rows. */
  businessIndustry?: string;
  accountType?: string;
  secondaryRoles?: string[];
  location?: string;
  /** Accepted for compatibility with callers; the About card no longer shows "Open to". */
  openTo?: string[];
  languages?: string[];
  isOwner: boolean;
  onEdit?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const bioRef = useRef<HTMLParagraphElement>(null);
  const isBusiness = normalizeTier(accountType) === 'business';
  const text = (bio ?? '').trim();

  // "See more" only when the four-line preview actually cuts text off.
  useLayoutEffect(() => {
    const el = bioRef.current;
    if (el && !expanded) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded]);
  useEffect(() => {
    const on = () => { const el = bioRef.current; if (el && !expanded) setOverflowing(el.scrollHeight > el.clientHeight + 1); };
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [expanded]);

  const secondary = toList(secondaryRoles);
  const langs = toList(languages);
  const loc = (location ?? '').trim();
  const rows: { key: string; Icon: typeof Briefcase; label: string; value: string }[] = [];
  if (isBusiness) {
    if (isRealValue((businessIndustry ?? '').trim())) rows.push({ key: 'industry', Icon: Briefcase, label: 'Business industry', value: businessIndustry!.trim() });
  } else {
    if (isRealValue((primaryRole ?? '').trim())) rows.push({ key: 'primary', Icon: Briefcase, label: 'Primary role', value: primaryRole!.trim() });
    if (secondary.length) rows.push({ key: 'secondary', Icon: User, label: 'Secondary role', value: secondary.join(', ') });
  }
  if (isRealValue(loc)) rows.push({ key: 'loc', Icon: MapPin, label: 'Location', value: loc });
  if (langs.length) rows.push({ key: 'lang', Icon: Globe, label: 'Languages', value: langs.join(', ') });

  const empty = !text && rows.length === 0;
  if (empty && !isOwner) return null;

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">About</h2>
        {isOwner && (
          <button onClick={onEdit} aria-label="Edit about" className="-mr-1.5 w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
            <Pencil className="w-4 h-4" strokeWidth={1.75} />
          </button>
        )}
      </div>

      {empty ? (
        <div className="pt-2">
          <p className="text-sm text-gray-500">Tell creators about yourself</p>
          <button onClick={onEdit} className="mt-3 px-4 py-2 rounded-full bg-gray-900 text-white text-sm font-semibold active:scale-95 transition-transform">Add about</button>
        </div>
      ) : (
        <>
          {text && (
            <div className="mt-2">
              <p ref={bioRef} className={`text-sm text-gray-700 leading-relaxed whitespace-pre-line break-words ${expanded ? '' : 'line-clamp-4'}`}><BioText text={text} /></p>
              {(overflowing || expanded) && (
                <button onClick={() => setExpanded(v => !v)} className="mt-1 text-sm font-semibold text-gray-500 hover:text-gray-800">
                  {expanded ? 'See less' : 'See more'}
                </button>
              )}
            </div>
          )}
          {rows.length > 0 && (
            <div className={text ? 'mt-3 border-t border-gray-100' : 'mt-2'}>
              {rows.map((r, i) => (
                <div key={r.key} className={`flex items-start gap-3 py-2.5 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                  <r.Icon className="w-[18px] h-[18px] mt-0.5 shrink-0 text-gray-500" strokeWidth={1.75} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-400 leading-tight">{r.label}</p>
                    <p className="text-sm text-gray-900 font-medium break-words">{r.value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
