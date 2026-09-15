// "About" is renamed "All" and stops being a display of the bio alone --
// it's now the full vertically-stacked overview (see ProfileAllTab). Shared
// by Profile.tsx (owner) and HostProfile.tsx (viewer) so both use the exact
// same tab set: All | Portfolio | Listings | Services | Reviews |
// Recommendations | Activity.
export type ProfileTab = 'all' | 'portfolio' | 'listings' | 'services' | 'reviews' | 'recommendations' | 'activity';

export const PROFILE_TABS: { id: ProfileTab; label: string }[] = [
  { id: 'all',             label: 'All' },
  { id: 'portfolio',       label: 'Portfolio' },
  { id: 'listings',        label: 'Listings' },
  { id: 'services',        label: 'Services' },
  { id: 'reviews',         label: 'Reviews' },
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'activity',        label: 'Activity' },
];

export function ProfileTabNav({ tab, onChange, sticky = true }: { tab: ProfileTab; onChange: (t: ProfileTab) => void; sticky?: boolean }) {
  return (
    <div className={`${sticky ? 'sticky top-0 z-20' : ''} bg-white border-b border-gray-100`}>
      <div className="flex gap-5 overflow-x-auto no-scrollbar px-4">
        {PROFILE_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`relative shrink-0 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${
              tab === t.id ? 'text-gray-900' : 'text-gray-400'
            }`}
          >
            {t.label}
            <span
              className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-blue-600"
              style={{ opacity: tab === t.id ? 1 : 0, transition: 'opacity 150ms ease' }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
