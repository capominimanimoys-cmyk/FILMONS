// Live "Profile Preview" card for the desktop Edit Profile two-column
// layout -- right column, sticky while the left column (the actual
// AboutEditor form) scrolls. Reads straight off Profile.tsx's own
// in-progress edit state (displayName/primaryRole/location), so it
// updates the instant the user types, before Save is even pressed.
// Mobile never renders this (single-column full page, per spec).
import { UserAvatar } from '../AccountTypeBadge';

export function ProfilePreviewCard({ avatar, name, primaryRole, location }: {
  avatar?: string;
  name: string;
  primaryRole?: string;
  location?: string;
}) {
  return (
    <div className="sticky top-20 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Profile Preview</p>
      <div className="flex justify-center">
        <UserAvatar user={{ id: '', name: name || 'You', avatar }} size={72} />
      </div>
      <p className="text-base font-black text-gray-900 mt-3 truncate">{name || 'Your name'}</p>
      {primaryRole && <p className="text-sm text-gray-500 mt-0.5 truncate">{primaryRole}</p>}
      {location && <p className="text-xs text-gray-400 mt-1 truncate">{location}</p>}
    </div>
  );
}
