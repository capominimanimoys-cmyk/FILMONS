// Read-only "About" card inside the All tab -- previously "About" WAS the
// tab (an inline edit form, AboutEditor). Now About is a display section;
// AboutEditor is reached via the Edit pencil here (and other sections'
// Edit links) as a full-screen overlay instead of tab content.
import { useState } from 'react';
import { Pencil } from 'lucide-react';

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
  bio, primaryRole, secondaryRoles, location, openTo, languages, isOwner, onEdit,
}: {
  bio?: string;
  primaryRole?: string;
  secondaryRoles?: string[];
  location?: string;
  openTo?: string[];
  languages?: string[];
  isOwner: boolean;
  onEdit?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Empty means null/undefined/""/whitespace-only, all treated identically.
  const trimmedBio = (bio ?? '').trim();
  const hasBio = trimmedBio.length > 0;
  const longBio = trimmedBio.length > 180;
  const shownBio = expanded || !longBio ? trimmedBio : `${trimmedBio.slice(0, 180)}…`;

  const secondaryRolesList = toList(secondaryRoles);
  const openToList = toList(openTo);
  const languagesList = toList(languages);

  const hasAnything = hasBio || primaryRole || secondaryRolesList.length || location || openToList.length || languagesList.length;
  if (!hasAnything && !isOwner) return null;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-black text-gray-900">About</p>
        {isOwner && (
          <button onClick={onEdit} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
            <Pencil className="w-3 h-3" /> Edit
          </button>
        )}
      </div>

      <div className="space-y-3">
        {hasBio ? (
          <div>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{shownBio}</p>
            {longBio && (
              <button onClick={() => setExpanded(v => !v)} className="text-xs font-semibold text-gray-500 hover:underline mt-0.5">
                {expanded ? 'See less' : 'See more'}
              </button>
            )}
          </div>
        ) : isOwner ? (
          // Owner + empty bio -> "+ Add bio", opens straight to the Bio
          // field (AboutEditor's Overview accordion); viewer + empty bio ->
          // nothing here at all, not even a placeholder.
          <button onClick={onEdit} className="text-sm font-semibold text-blue-600 hover:underline">
            + Add bio
          </button>
        ) : null}

        {(!!primaryRole || !!secondaryRolesList.length || !!location || !!openToList.length || !!languagesList.length) && (
          // Single column on narrow phones -- two cramped columns there
          // made every value truncate. sm: and up (tablet-width+) is where
          // there's actually room for two.
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 pt-1">
            {primaryRole && <Field label="Primary Role" value={primaryRole} />}
            {!!secondaryRolesList.length && <Field label="Also Works As" value={secondaryRolesList.join(', ')} />}
            {location && <Field label="Location" value={location} />}
            {!!openToList.length && <Field label="Open To" value={openToList.join(', ')} />}
            {!!languagesList.length && <Field label="Languages" value={languagesList.join(', ')} />}
          </div>
        )}
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xs text-gray-700 font-medium truncate">{value}</p>
    </div>
  );
}
