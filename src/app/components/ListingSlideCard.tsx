// The single large "active card" in the desktop ListingCardStack. For a
// listing item this wraps the real `ListingCard` component directly (same
// save-heart button, same `•••` BottomMenuSheet, same fields) rather than
// reimplementing card content — SwipeStack's own ListingContent/CreatorContent
// are intentionally NOT reused here since they duplicate ListingCard's logic
// with a different visual language; ListingCard is the actual source of
// truth used everywhere else in the app (marketplace/profile grids).
import { ShieldCheck, MapPin } from 'lucide-react';
import { ListingCard } from './ListingCard';
import type { DeckItem } from './SwipeStack';
import { useNavigate } from 'react-router';

function CreatorSlideContent({ profile }: { profile: Extract<DeckItem, { kind: 'creator' }>['data'] }) {
  const navigate = useNavigate();
  return (
    <div className="cursor-pointer" onClick={() => navigate(`/host/${profile.id}`)}>
      <div className="relative h-64 rounded-2xl overflow-hidden bg-gradient-to-br from-slate-800 to-indigo-900 mb-3">
        {profile.avatar_url && (
          <img src={profile.avatar_url} className="absolute inset-0 w-full h-full object-cover opacity-30 blur-xl scale-125" alt="" draggable={false} />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-24 h-24 rounded-full border-4 border-white/90 overflow-hidden shadow-2xl">
            {profile.avatar_url
              ? <img src={profile.avatar_url} className="w-full h-full object-cover" alt="" />
              : <div className="w-full h-full flex items-center justify-center bg-blue-600 text-white text-2xl font-black">{profile.name?.[0]?.toUpperCase() ?? '?'}</div>}
          </div>
        </div>
        {profile.is_verified && (
          <div className="absolute top-3 right-3"><ShieldCheck className="w-5 h-5 text-blue-400" strokeWidth={2.5} /></div>
        )}
      </div>
      <h3 className="text-base font-black text-gray-900 mb-0.5">{profile.name}</h3>
      {profile.primary_role && <p className="text-sm text-blue-600 font-semibold mb-1">{profile.primary_role}</p>}
      {profile.bio && <p className="text-[13px] text-gray-500 line-clamp-2 mb-2 leading-snug">{profile.bio}</p>}
      <div className="flex items-center gap-1 text-xs text-gray-400">
        <MapPin className="w-3 h-3 shrink-0" /><span>{profile.city ?? 'Canada'}</span>
      </div>
    </div>
  );
}

export function ListingSlideCard({ item }: { item: DeckItem }) {
  return (
    <div className="bg-white rounded-3xl shadow-xl p-4 w-full">
      {item.kind === 'listing'
        ? <ListingCard listing={item.data} />
        : <CreatorSlideContent profile={item.data} />}
    </div>
  );
}
