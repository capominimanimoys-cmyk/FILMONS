/**
 * SwipeStack — Tinder-style discovery deck for Filmons.
 * Supports listings (rental / sale / service / studio) AND creator profiles.
 * Swipe right → ❤️ Like/Save | Swipe left → ✖ Pass | Tap / swipe up → 👀 View
 */
import { useState, useRef } from 'react';
import { Heart, X, Eye, Star, MapPin, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { Listing } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────
export type EnrichedListing = Listing & { distance?: number };

export type CreatorProfile = {
  id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  city: string | null;
  province?: string | null;
  primary_role: string | null;
  bio: string | null;
  is_verified: boolean | null;
};

export type DeckItem =
  | { kind: 'listing'; data: EnrichedListing }
  | { kind: 'creator'; data: CreatorProfile };

// ── Constants ─────────────────────────────────────────────────────────────────
const SWIPE_X = 80;
const SWIPE_Y = 70;

const STACK: Record<number, string> = {
  0: 'scale-100 translate-y-0',
  1: 'scale-[0.96] translate-y-3',
  2: 'scale-[0.92] translate-y-6',
};

function fmtPrice(l: Listing) {
  const p = `$${Number(l.price).toLocaleString()}`;
  if (l.listingMode === 'rent')    return `${p}/day`;
  if (l.listingType === 'service') return `${p}/hr`;
  return p;
}

// ── Listing card body ─────────────────────────────────────────────────────────
function ListingContent({ listing }: { listing: EnrichedListing }) {
  const typeLabel =
    listing.listingType === 'service'          ? 'Service'
    : listing.listingMode === 'rent'            ? 'Rental'
    : (listing as any).listingType === 'studio' ? 'Studio'
    : 'For Sale';

  return (
    <>
      <div className="relative h-72 bg-gradient-to-br from-slate-800 to-slate-900 overflow-hidden">
        {listing.images?.[0]
          ? <img src={listing.images[0]} className="w-full h-full object-cover" alt="" draggable={false}/>
          : <div className="w-full h-full flex items-center justify-center text-5xl opacity-20">🎬</div>
        }
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent"/>
        <div className="absolute top-3 left-3">
          <span className="text-[10px] font-black text-white bg-black/55 backdrop-blur-sm px-2.5 py-1 rounded-full uppercase tracking-wide">
            {typeLabel}
          </span>
        </div>
      </div>

      <div className="px-4 py-3.5">
        <h3 className="text-[15px] font-black text-gray-900 line-clamp-1 mb-1">{listing.title}</h3>
        <div className="flex items-center gap-1 text-xs text-gray-400 mb-3">
          <MapPin className="w-3 h-3 shrink-0"/>
          <span>{[listing.city, listing.province].filter(Boolean).join(', ')}</span>
          {listing.distance !== undefined && (
            <span className="text-blue-500 font-semibold ml-1">
              · {listing.distance < 1 ? `${Math.round(listing.distance * 1000)}m` : `${listing.distance.toFixed(1)}km`}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xl font-black text-blue-600">{fmtPrice(listing)}</span>
          <span className="flex items-center gap-1 text-xs">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400"/>
            <span className="font-semibold text-gray-600">New</span>
          </span>
        </div>
      </div>
    </>
  );
}

// ── Creator card body ─────────────────────────────────────────────────────────
function CreatorContent({ profile }: { profile: CreatorProfile }) {
  return (
    <>
      <div className="relative h-72 bg-gradient-to-br from-slate-800 to-indigo-900 overflow-hidden">
        {profile.avatar_url && (
          <img
            src={profile.avatar_url}
            className="absolute inset-0 w-full h-full object-cover opacity-30 blur-xl scale-125"
            alt="" draggable={false}
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center pb-4">
          <div className="w-28 h-28 rounded-full border-4 border-white/90 overflow-hidden shadow-2xl">
            {profile.avatar_url
              ? <img src={profile.avatar_url} className="w-full h-full object-cover" alt=""/>
              : <div className="w-full h-full flex items-center justify-center bg-blue-600 text-white text-3xl font-black">
                  {profile.name?.[0]?.toUpperCase() ?? '?'}
                </div>
            }
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent"/>
        <div className="absolute top-3 left-3">
          <span className="text-[10px] font-black text-white bg-black/55 backdrop-blur-sm px-2.5 py-1 rounded-full uppercase tracking-wide">
            Creator
          </span>
        </div>
        {profile.is_verified && (
          <div className="absolute top-3 right-3">
            <ShieldCheck className="w-5 h-5 text-blue-400" strokeWidth={2.5}/>
          </div>
        )}
      </div>

      <div className="px-4 py-3.5">
        <h3 className="text-[16px] font-black text-gray-900 mb-0.5">{profile.name}</h3>
        {profile.primary_role && (
          <p className="text-sm text-blue-600 font-semibold mb-1">{profile.primary_role}</p>
        )}
        {profile.bio && (
          <p className="text-[13px] text-gray-500 line-clamp-2 mb-2 leading-snug">{profile.bio}</p>
        )}
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <MapPin className="w-3 h-3 shrink-0"/>
          <span>{profile.city ?? 'Canada'}</span>
        </div>
      </div>
    </>
  );
}

// ── Draggable card shell ──────────────────────────────────────────────────────
interface CardProps {
  item: DeckItem;
  stackPos: number;
  isTop: boolean;
  exitDir: 'L' | 'R' | 'U' | null;
  onSwipeLeft:  () => void;
  onSwipeRight: () => void;
  onSwipeUp:    () => void;
}

function SwipeCard({ item, stackPos, isTop, exitDir, onSwipeLeft, onSwipeRight, onSwipeUp }: CardProps) {
  const navigate = useNavigate();
  const [drag, setDrag]     = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const divRef   = useRef<HTMLDivElement>(null);

  const down = (e: React.PointerEvent) => {
    if (!isTop || exitDir) return;
    startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setActive(true);
    divRef.current?.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!startRef.current || !active) return;
    setDrag({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y });
  };

  const up = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const dx   = e.clientX - startRef.current.x;
    const dy   = e.clientY - startRef.current.y;
    const dt   = Date.now() - startRef.current.t;
    const dist = Math.hypot(dx, dy);

    if (dist < 8 && dt < 280) {
      if (item.kind === 'listing') navigate(`/listing/${item.data.id}`);
      else navigate(`/host/${item.data.id}`);
    } else if (Math.abs(dx) > SWIPE_X && Math.abs(dx) > Math.abs(dy)) {
      dx > 0 ? onSwipeRight() : onSwipeLeft();
    } else if (dy < -SWIPE_Y && Math.abs(dy) > Math.abs(dx)) {
      onSwipeUp();
    }

    setDrag({ x: 0, y: 0 });
    setActive(false);
    startRef.current = null;
  };

  const cancel = () => { setDrag({ x: 0, y: 0 }); setActive(false); startRef.current = null; };

  const showSave = isTop && drag.x > 35;
  const showSkip = isTop && drag.x < -35;
  const showView = isTop && drag.y < -35;
  const rot = isTop ? drag.x * 0.055 : 0;

  let style: React.CSSProperties;
  if (exitDir) {
    const tx = exitDir === 'R' ? '160%' : exitDir === 'L' ? '-160%' : '0';
    const ty = exitDir === 'U' ? '-140%' : '0';
    const rz = exitDir === 'R' ? '28deg' : exitDir === 'L' ? '-28deg' : '0';
    style = { transform:`translate(${tx},${ty}) rotate(${rz})`, opacity:0, transition:'transform 0.35s cubic-bezier(.5,0,1,1), opacity 0.3s', zIndex:30, touchAction:'none' };
  } else if (active) {
    style = { transform:`translate(${drag.x}px,${drag.y}px) rotate(${rot}deg)`, zIndex:30, cursor:'grabbing', touchAction:'none' };
  } else {
    style = { transition:'transform 0.28s ease', zIndex: 30 - stackPos * 10, touchAction:'none' };
  }

  const saveLabel = item.kind === 'creator' ? 'FOLLOW' : 'SAVE';
  const viewLabel = item.kind === 'creator' ? 'VIEW PROFILE' : 'VIEW DETAILS';

  return (
    <div
      ref={divRef}
      className={`absolute inset-x-0 rounded-[28px] overflow-hidden shadow-2xl bg-white select-none cursor-grab ${!active && !exitDir ? STACK[stackPos] ?? 'opacity-0' : ''}`}
      style={style}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
    >
      {item.kind === 'listing'
        ? <ListingContent listing={item.data}/>
        : <CreatorContent profile={item.data}/>
      }

      {showSave && (
        <div className="absolute top-3 right-3 pointer-events-none" style={{ opacity: Math.min(1, (drag.x - 35) / 55) }}>
          <div className="flex items-center gap-1.5 bg-green-500 text-white font-black text-sm px-3.5 py-1.5 rounded-full shadow-lg border-2 border-green-400">
            <Heart className="w-4 h-4 fill-white"/> {saveLabel}
          </div>
        </div>
      )}
      {showSkip && (
        <div className="absolute top-3 left-3 pointer-events-none" style={{ opacity: Math.min(1, (-drag.x - 35) / 55) }}>
          <div className="flex items-center gap-1.5 bg-red-500 text-white font-black text-sm px-3.5 py-1.5 rounded-full shadow-lg border-2 border-red-400">
            <X className="w-4 h-4"/> PASS
          </div>
        </div>
      )}
      {showView && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: Math.min(1, (-drag.y - 35) / 55) }}>
          <div className="flex items-center gap-2 bg-blue-600 text-white font-black text-sm px-5 py-2.5 rounded-full shadow-xl border-2 border-blue-400">
            <Eye className="w-4 h-4"/> {viewLabel}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stack orchestrator ────────────────────────────────────────────────────────
interface SwipeStackProps {
  items: DeckItem[];
  onDone?: () => void;
}

export function SwipeStack({ items = [], onDone }: SwipeStackProps) {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [idx,     setIdx]     = useState(0);
  const [exitDir, setExitDir] = useState<'L' | 'R' | 'U' | null>(null);

  const fly = (dir: 'L' | 'R' | 'U') => {
    if (exitDir) return;
    const item = items[idx];
    setExitDir(dir);

    setTimeout(async () => {
      if (dir === 'R' && user && item) {
        if (item.kind === 'listing') {
          await supabase.from('favorites').upsert({
            user_id: user.id, item_id: item.data.id,
            item_type: 'listing', item_data: item.data,
          }, { onConflict: 'user_id,item_id' }).then(undefined, () => {});
          toast.success(`❤️ Saved: ${item.data.title}`);
        } else {
          await supabase.from('favorites').upsert({
            user_id: user.id, item_id: item.data.id,
            item_type: 'creator', item_data: item.data,
          }, { onConflict: 'user_id,item_id' }).then(undefined, () => {});
          toast.success(`❤️ Liked: ${item.data.name}`);
        }
      }
      if (dir === 'U' && item) {
        if (item.kind === 'listing') navigate(`/listing/${item.data.id}`);
        else navigate(`/host/${item.data.id}`);
      }
      setIdx(i => {
        const next = i + 1;
        if (next >= items.length) onDone?.();
        return next;
      });
      setExitDir(null);
    }, 360);
  };

  const current = items[idx];
  const cards   = items.slice(idx, idx + 3);

  if (!current || idx >= items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
        <span className="text-5xl">✨</span>
        <div>
          <p className="font-black text-gray-900 text-lg">You've seen them all!</p>
          <p className="text-sm text-gray-400 mt-1">Try a different filter or check back later.</p>
        </div>
        <button
          onClick={() => { setIdx(0); setExitDir(null); }}
          className="text-xs text-blue-600 font-bold bg-blue-50 px-4 py-2 rounded-full hover:bg-blue-100 transition-colors">
          Start over
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-4">
      {/* Card stack */}
      <div className="relative w-full" style={{ height: 420 }}>
        {[...cards].reverse().map((item, rIdx) => {
          const stackPos = cards.length - 1 - rIdx;
          const isTop    = stackPos === 0;
          const key = item.kind === 'listing' ? `l-${item.data.id}` : `c-${item.data.id}`;
          return (
            <SwipeCard
              key={key}
              item={item}
              stackPos={stackPos}
              isTop={isTop}
              exitDir={isTop ? exitDir : null}
              onSwipeLeft={() => fly('L')}
              onSwipeRight={() => fly('R')}
              onSwipeUp={() => fly('U')}
            />
          );
        })}
      </div>

      {/* Counter */}
      <p className="text-[11px] text-gray-400 mt-3 mb-5 font-medium">
        {idx + 1} of {items.length}
      </p>

      {/* Action buttons */}
      <div className="flex items-center gap-6">
        <button
          onClick={() => fly('L')}
          className="w-14 h-14 rounded-full bg-white border-2 border-red-200 shadow-md flex items-center justify-center hover:border-red-400 hover:bg-red-50 transition-all active:scale-90">
          <X className="w-6 h-6 text-red-400"/>
        </button>
        <button
          onClick={() => current.kind === 'listing' ? navigate(`/listing/${current.data.id}`) : navigate(`/host/${current.data.id}`)}
          className="w-12 h-12 rounded-full bg-white border-2 border-blue-200 shadow-md flex items-center justify-center hover:border-blue-400 hover:bg-blue-50 transition-all active:scale-90">
          <Eye className="w-5 h-5 text-blue-500"/>
        </button>
        <button
          onClick={() => fly('R')}
          className="w-14 h-14 rounded-full bg-white border-2 border-green-200 shadow-md flex items-center justify-center hover:border-green-400 hover:bg-green-50 transition-all active:scale-90">
          <Heart className="w-6 h-6 text-green-500"/>
        </button>
      </div>

      <p className="text-[11px] text-gray-300 mt-4">← Pass  ·  ↑ View  ·  Save →</p>
    </div>
  );
}
