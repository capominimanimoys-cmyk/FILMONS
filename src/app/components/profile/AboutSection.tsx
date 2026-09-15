// Read-only "About" card inside the All tab -- previously "About" WAS the
// tab (an inline edit form, AboutEditor). Now About is a display section;
// AboutEditor is reached via the Edit pencil here (and other sections'
// Edit links) as a full-screen overlay instead of tab content.
import { useState } from 'react';
import { Pencil } from 'lucide-react';

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
  const longBio = (bio?.length ?? 0) > 180;
  const shownBio = expanded || !longBio ? bio : `${bio!.slice(0, 180)}…`;

  const hasAnything = bio || primaryRole || (secondaryRoles?.length) || location || (openTo?.length) || (languages?.length);
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

      {!hasAnything ? (
        <p className="text-xs text-gray-400">Tell people what you create — add a bio to your profile.</p>
      ) : (
        <div className="space-y-3">
          {bio && (
            <div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{shownBio}</p>
              {longBio && (
                <button onClick={() => setExpanded(v => !v)} className="text-xs font-semibold text-gray-500 hover:underline mt-0.5">
                  {expanded ? 'See less' : 'See more'}
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-1">
            {primaryRole && <Field label="Primary Role" value={primaryRole} />}
            {!!secondaryRoles?.length && <Field label="Also Works As" value={secondaryRoles.join(', ')} />}
            {location && <Field label="Location" value={location} />}
            {!!openTo?.length && <Field label="Open To" value={openTo.join(', ')} />}
            {!!languages?.length && <Field label="Languages" value={languages.join(', ')} />}
          </div>
        </div>
      )}
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
