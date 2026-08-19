/**
 * SwipeStack — Tinder-style discovery deck for Filmons.
 * Supports listings (rental / sale / service / studio) AND creator profiles.
 * Swipe right → ❤️ Like/Save | Swipe left → ✖ Pass | Tap → 👀 View details
 */
import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  Heart, X, Star, MapPin, ShieldCheck, Zap, Camera, Video, Mic, Lightbulb,
  Wrench, Package, BadgeCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { Listing, User } from '../types';
import { authApi } from '../lib/api';
import { reliabilityApi, HOST_TIERS } from '../lib/reliabilityApi';
import { boostApi } from '../lib/boostApi';
import { swipeApi } from '../lib/swipeApi';

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
const IMAGE_H = 288; // matches h-72

const STACK: Record<number, string> = {
  0: 'scale-100 translate-y-0',
  1: 'scale-[0.96] translate-y-3',
  2: 'scale-[0.92] translate-y-6',
};

// Simple cache so revisiting a card (e.g. after Undo) doesn't re-fetch.
const _hostCache = new Map<string, { user: User | null; hostScore: number; hostLevel: string; avgRating: number; reviewCount: number }>();

function fmtPrice(l: Listing) {
  const p = `$${Number(l.price).toLocaleString()}`;
  if (l.listingMode === 'rent')    return `${p}/day`;
  if (l.listingType === 'service') return `${p}/hr`;
  return p;
}

function categoryIcon(l: Listing) {
  const text = `${l.title} ${l.serviceCategory ?? ''}`.toLowerCase();
  if (l.listingType === 'service') return Wrench;
  if (/camera|canon|sony|nikon|blackmagic/.test(text)) return Camera;
  if (/lens/.test(text)) return Camera;
  if (/light|led|strobe/.test(text)) return Lightbulb;
  if (/audio|mic|sound/.test(text)) return Mic;
  if (/video|cinema|film/.test(text)) return Video;
  return Package;
}

function categoryLabel(l: Listing) {
  if (l.listingType === 'service') return l.serviceCategory ? l.serviceCategory.replace(/-/g, ' ') : 'Service';
  return l.listingMode === 'sale' ? 'For Sale' : 'Gear';
}

// Real, derived quick-attribute chips — never hard-coded per listing.
function quickAttributes(l: Listing): string[] {
  const attrs: string[] = [];
  if (l.qualification) attrs.push(l.qualification);
  else if (l.tags?.[0]) attrs.push(l.tags[0]);
  if (l.condition) attrs.push(l.condition.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
  if (l.deliveryOptions?.includes('delivery')) attrs.push('Delivery Available');
  if (l.deliveryOptions?.includes('pickup')) attrs.push('Pickup Available');
  return attrs.slice(0, 4);
}

// ── Listing card body ─────────────────────────────────────────────────────────
function ListingContent({ listing, isTop, photoIdx, saved }: { listing: EnrichedListing; isTop: boolean; photoIdx: number; saved: boolean }) {
  const typeLabel =
    listing.listingType === 'service'          ? 'Service'
    : listing.listingMode === 'rent'            ? 'Rental'
    : (listing as any).listingType === 'studio' ? 'Studio'
    : 'For Sale';

  const images = listing.images?.length ? listing.images : (listing.image ? [listing.image] : []);
  const cover = images[Math.min(photoIdx, Math.max(images.length - 1, 0))];
  const CatIcon = categoryIcon(listing);
  const attrs = quickAttributes(listing);
  const insuranceEnabled = !!(listing as any).insuranceRequired;

  const [host, setHost] = useState(_hostCache.get(listing.userId) ?? null);

  useEffect(() => {
    if (!isTop || !listing.userId) return;
    const cached = _hostCache.get(listing.userId);
    if (cached) { setHost(cached); return; }
    (async () => {
      const [u, score] = await Promise.all([
        authApi.getUserById(listing.userId).catch(() => null),
        reliabilityApi.getScore(listing.userId).catch(() => null),
      ]);
      const entry = {
        user: u,
        hostScore: score?.host_score ?? 0,
        hostLevel: score?.host_level ?? 'new_host',
        avgRating: score?.host_avg_rating ?? 0,
        reviewCount: score?.host_reviews_count ?? 0,
      };
      _hostCache.set(listing.userId, entry);
      setHost(entry);
    })();
  }, [isTop, listing.userId]);

  const tierInfo = host ? HOST_TIERS[host.hostLevel] : null;
  const isTopHost = host && (host.hostLevel === 'trusted_host' || host.hostLevel === 'elite_marketplace');

  return (
    <>
      <div className="relative h-72 bg-gradient-to-br from-slate-800 to-slate-900 overflow-hidden">
        {cover
          ? <img src={cover} className="w-full h-full object-cover" alt="" draggable={false}/>
          : <div className="w-full h-full flex items-center justify-center text-5xl opacity-20">🎬</div>
        }
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent"/>

        <div className="absolute top-3 left-3 flex flex-col gap-1.5 items-start">
          <span className="text-[10px] font-black text-white bg-black/55 backdrop-blur-sm px-2.5 py-1 rounded-full uppercase tracking-wide">
            {typeLabel}
          </span>
          {listing.boosted && (
            <span className="flex items-center gap-1 text-[10px] font-black text-white bg-amber-500 px-2.5 py-1 rounded-full uppercase tracking-wide">
              <Zap className="w-2.5 h-2.5 fill-white"/> Boosted
            </span>
          )}
        </div>

        <div className="absolute top-3 right-3">
          <Heart className={`w-5 h-5 drop-shadow ${saved ? 'text-red-500 fill-red-500' : 'text-white'}`}/>
        </div>

        {images.length > 1 && (
          <div className="absolute bottom-2 inset-x-0 flex items-center justify-center gap-1">
            {images.map((_, i) => (
              <span key={i} className={`h-1 rounded-full transition-all ${i === photoIdx ? 'w-4 bg-white' : 'w-1 bg-white/50'}`}/>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-3.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="flex items-center gap-1 text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            <CatIcon className="w-3 h-3"/> {categoryLabel(listing)}
          </span>
          {isTopHost && tierInfo && (
            <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${tierInfo.bg} ${tierInfo.color}`}>
              <Star className="w-3 h-3 fill-current"/> {tierInfo.label}
            </span>
          )}
        </div>

        <h3 className="text-[15px] font-black text-gray-900 line-clamp-1 mb-1">{listing.title}</h3>
        <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
          <MapPin className="w-3 h-3 shrink-0"/>
          <span>{[listing.city, listing.province].filter(Boolean).join(', ')}</span>
          {listing.distance !== undefined && (
            <span className="text-blue-500 font-semibold ml-1">
              · {listing.distance < 1 ? `${Math.round(listing.distance * 1000)}m` : `${listing.distance.toFixed(1)}km`}
            </span>
          )}
        </div>
        <p className="text-xl font-black text-blue-600 mb-2.5">{fmtPrice(listing)}</p>

        {host?.user && (
          <div className="flex items-center gap-2 py-2 border-t border-gray-100">
            <div className="w-7 h-7 rounded-full overflow-hidden bg-gray-100 shrink-0">
              {host.user.avatar ? <img src={host.user.avatar} className="w-full h-full object-cover" alt=""/> : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-gray-900 truncate flex items-center gap-1">
                {host.user.name} {host.user.isVerified && <BadgeCheck className="w-3 h-3 text-blue-500 shrink-0"/>}
              </p>
              {host.reviewCount > 0 && (
                <p className="text-[11px] text-gray-400 flex items-center gap-0.5">
                  <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400"/> {host.avgRating.toFixed(1)} ({host.reviewCount})
                  {tierInfo && <span> · {tierInfo.label}</span>}
                </p>
              )}
            </div>
          </div>
        )}

        {insuranceEnabled && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-teal-700 bg-teal-50 rounded-lg px-2.5 py-1.5 mt-1.5">
            <ShieldCheck className="w-3.5 h-3.5"/> Rental Protection — Covered by Filmons
          </div>
        )}

        {attrs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {attrs.map((a, i) => (
              <span key={i} className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">{a}</span>
            ))}
          </div>
        )}
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
  exitDir: 'L' | 'R' | null;
  saved: boolean;
  onSwipeLeft:  () => void;
  onSwipeRight: () => void;
}

function SwipeCard({ item, stackPos, isTop, exitDir, saved, onSwipeLeft, onSwipeRight }: CardProps) {
  const navigate = useNavigate();
  const [drag, setDrag]     = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const divRef   = useRef<HTMLDivElement>(null);

  const images = item.kind === 'listing' ? (item.data.images?.length ? item.data.images : (item.data.image ? [item.data.image] : [])) : [];

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
      const rect = divRef.current?.getBoundingClientRect();
      const localY = rect ? e.clientY - rect.top : IMAGE_H + 1;
      const localXRatio = rect && rect.width ? (e.clientX - rect.left) / rect.width : 0.5;

      if (item.kind === 'listing' && images.length > 1 && localY < IMAGE_H) {
        setPhotoIdx(i => localXRatio < 0.4 ? Math.max(0, i - 1) : Math.min(images.length - 1, i + 1));
      } else if (item.kind === 'listing') {
        navigate(`/listing/${item.data.id}`);
      } else {
        navigate(`/host/${item.data.id}`);
      }
    } else if (Math.abs(dx) > SWIPE_X && Math.abs(dx) > Math.abs(dy)) {
      dx > 0 ? onSwipeRight() : onSwipeLeft();
    }

    setDrag({ x: 0, y: 0 });
    setActive(false);
    startRef.current = null;
  };

  const cancel = () => { setDrag({ x: 0, y: 0 }); setActive(false); startRef.current = null; };

  const showSave = isTop && drag.x > 35;
  const showSkip = isTop && drag.x < -35;
  const rot = isTop ? drag.x * 0.055 : 0;

  let style: React.CSSProperties;
  if (exitDir) {
    const tx = exitDir === 'R' ? '160%' : '-160%';
    const rz = exitDir === 'R' ? '28deg' : '-28deg';
    style = { transform:`translate(${tx},0) rotate(${rz})`, opacity:0, transition:'transform 0.35s cubic-bezier(.5,0,1,1), opacity 0.3s', zIndex:30, touchAction:'none' };
  } else if (active) {
    style = { transform:`translate(${drag.x}px,${drag.y}px) rotate(${rot}deg)`, zIndex:30, cursor:'grabbing', touchAction:'none' };
  } else {
    style = { transition:'transform 0.28s ease', zIndex: 30 - stackPos * 10, touchAction:'none' };
  }

  const saveLabel = item.kind === 'creator' ? 'FOLLOW' : 'SAVE';

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
        ? <ListingContent listing={item.data} isTop={isTop} photoIdx={photoIdx} saved={saved}/>
        : <CreatorContent profile={item.data}/>
      }

      {showSave && (
        <div className="absolute top-3 right-14 pointer-events-none" style={{ opacity: Math.min(1, (drag.x - 35) / 55) }}>
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
    </div>
  );
}

// ── Stack orchestrator ────────────────────────────────────────────────────────
interface SwipeStackProps {
  items: DeckItem[];
  onDone?: () => void;
}

export interface SwipeStackHandle {
  pass: () => void;
  like: () => void;
  undo: () => void;
}

type LastAction = { idx: number; item: DeckItem; dir: 'L' | 'R'; swipeRowId: string | null };

export const SwipeStack = forwardRef<SwipeStackHandle, SwipeStackProps>(function SwipeStack({ items = [], onDone }, ref) {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [idx,     setIdx]     = useState(0);
  const [exitDir, setExitDir] = useState<'L' | 'R' | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const lastActionRef = useRef<LastAction | null>(null);

  const fly = (dir: 'L' | 'R') => {
    if (exitDir) return;
    const item = items[idx];
    if (!item) return;
    setExitDir(dir);

    setTimeout(async () => {
      let swipeRowId: string | null = null;

      if (dir === 'R' && user && item) {
        if (item.kind === 'listing') {
          const cover = item.data.image || item.data.images?.find(i => typeof i === 'string');
          await supabase.from('favorites').upsert({
            user_id: user.id, item_id: item.data.id, item_type: 'listing',
            item_data: { title: item.data.title, image: cover, price: item.data.price, city: item.data.city },
          }, { onConflict: 'user_id,item_id' }).then(undefined, () => {});
          setSavedIds(prev => new Set(prev).add(item.data.id));
          boostApi.logEvent(item.data.id, 'save', item.data.boosted ? 'boosted' : 'organic', undefined, user.id);
          toast.success(`❤️ Saved: ${item.data.title}`);
        } else {
          await supabase.from('favorites').upsert({
            user_id: user.id, item_id: item.data.id,
            item_type: 'creator', item_data: item.data,
          }, { onConflict: 'user_id,item_id' }).then(undefined, () => {});
          toast.success(`❤️ Liked: ${item.data.name}`);
        }
      }

      if (user && item.kind === 'listing') {
        swipeRowId = await swipeApi.logSwipe(user.id, item.data.id, dir === 'R' ? 'like' : 'pass');
      }

      lastActionRef.current = { idx, item, dir, swipeRowId };

      setIdx(i => {
        const next = i + 1;
        if (next >= items.length) onDone?.();
        return next;
      });
      setExitDir(null);
    }, 360);
  };

  const undo = () => {
    const last = lastActionRef.current;
    if (!last || exitDir) return;
    lastActionRef.current = null;

    if (last.item.kind === 'listing') {
      if (last.dir === 'R' && user) {
        supabase.from('favorites').delete().eq('user_id', user.id).eq('item_id', last.item.data.id).then(undefined, () => {});
        setSavedIds(prev => { const next = new Set(prev); next.delete(last.item.data.id); return next; });
      }
      if (last.swipeRowId) swipeApi.deleteSwipe(last.swipeRowId);
    }

    setIdx(last.idx);
  };

  useImperativeHandle(ref, () => ({
    pass: () => fly('L'),
    like: () => fly('R'),
    undo,
  }));

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
    <div className="relative w-full" style={{ height: 420 }}>
      {[...cards].reverse().map((item, rIdx) => {
        const stackPos = cards.length - 1 - rIdx;
        const isTop    = stackPos === 0;
        const key = item.kind === 'listing' ? `l-${item.data.id}` : `c-${item.data.id}`;
        const saved = item.kind === 'listing' && savedIds.has(item.data.id);
        return (
          <SwipeCard
            key={key}
            item={item}
            stackPos={stackPos}
            isTop={isTop}
            exitDir={isTop ? exitDir : null}
            saved={saved}
            onSwipeLeft={() => fly('L')}
            onSwipeRight={() => fly('R')}
          />
        );
      })}
    </div>
  );
});
