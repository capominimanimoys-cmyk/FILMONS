/**
 * SwipeStack — Tinder-style discovery deck for Filmons.
 * Supports listings (rental / sale / service / studio) AND creator profiles.
 * Swipe right / Like button → ❤️ Like/Save | Swipe left / Pass button → ✖ Pass
 * | Eye button → 👀 See Listing (dedicated button only, never a gesture —
 * doesn't advance the deck; the same card is shown again on return).
 */
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Heart, X, Eye, Star, MapPin, ShieldCheck, RotateCcw, Lock, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router';
import { captureSnapshot } from '../lib/smartAnimate';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { Listing } from '../types';
import * as notifs from '../lib/notifications';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { isProfessional, normalizeTier } from '../lib/reliabilityApi';
import { swipeApi } from '../lib/swipeApi';
import { ENTITLEMENTS } from '../lib/entitlements';

// Guests (no account at all) get the same 10/day ceiling as Creator, but
// there's no user_id to enforce it against server-side -- there's no
// account to attach a `swipes` row to. Tracked client-side only, keyed by
// UTC date, same caveat every anonymous-visitor rate limit has (clearing
// storage or a new browser resets it); the real, unbypassable limits are
// the signed-in ones enforced by record-swipe.
const GUEST_DAILY_LIMIT = 10;
function guestSwipeKey(): string { return `filmons_guest_swipes_${new Date().toISOString().slice(0, 10)}`; }
function readGuestSwipeCount(): number {
  try { return parseInt(localStorage.getItem(guestSwipeKey()) || '0', 10) || 0; } catch { return 0; }
}
function writeGuestSwipeCount(n: number): void {
  try { localStorage.setItem(guestSwipeKey(), String(n)); } catch {}
}

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

function isNegotiableOpportunity(l: Listing) {
  return (l.listingType === 'opportunity' || l.listingKind === 'talent') &&
    !!l.opportunity?.paid && l.opportunity.compensationType === 'negotiable';
}

function fmtPrice(l: Listing) {
  const p = `$${Number(l.price).toLocaleString()}`;
  if (l.listingType === 'opportunity' || l.listingKind === 'talent') {
    if (l.opportunity && !l.opportunity.paid) return 'Unpaid / Collaboration';
    const ct = l.opportunity?.compensationType;
    return `${p}${ct === 'hourly' ? '/hr' : ct === 'daily' ? '/day' : ''}`;
  }
  if (l.listingMode === 'rent')    return `${p}/day`;
  if (l.listingType === 'service') return `${p}/hr`;
  return p;
}

// ── Listing card body ─────────────────────────────────────────────────────────
function ListingContent({ listing }: { listing: EnrichedListing }) {
  const isOpportunity = listing.listingType === 'opportunity' || listing.listingKind === 'talent';
  const typeLabel = isOpportunity ? 'Opportunity' :
    listing.listingType === 'service'          ? 'Service'
    : listing.listingMode === 'rent'            ? 'Rental'
    : (listing as any).listingType === 'studio' ? 'Studio'
    : 'For Sale';

  return (
    <>
      <div data-animate-id={listing.id ? `listing-image-${listing.id}` : undefined}
        className="relative h-72 lg:h-[420px] bg-gradient-to-br from-slate-800 to-slate-900 overflow-hidden">
        {listing.images?.[0]
          ? <img src={listing.images[0]} className="w-full h-full object-cover" alt="" draggable={false}/>
          : <div className="w-full h-full flex items-center justify-center text-5xl opacity-20">🎬</div>
        }
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent"/>
        <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
          <span className={`text-[10px] font-black text-white backdrop-blur-sm px-2.5 py-1 rounded-full uppercase tracking-wide ${isOpportunity ? 'bg-indigo-600' : 'bg-black/55'}`}>
            {typeLabel}
          </span>
          {!!listing.isEmergency && !!listing.emergencyExpiresAt && new Date(listing.emergencyExpiresAt) > new Date() && (
            <span className="text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full bg-red-500 text-white flex items-center gap-1 shadow-sm">
              <AlertTriangle className="w-3 h-3 fill-white" /> Emergency
            </span>
          )}
        </div>
      </div>

      <div className="px-4 lg:px-6 py-3.5 lg:py-5">
        <h3 className="text-[15px] lg:text-xl font-black text-gray-900 line-clamp-1 mb-1">{listing.title}</h3>
        <div className="flex items-center gap-1 text-xs lg:text-sm text-gray-400 mb-2">
          <MapPin className="w-3 h-3 shrink-0"/>
          <span>{[listing.city, listing.province].filter(Boolean).join(', ')}</span>
          {listing.distance !== undefined && (
            <span className="text-blue-500 font-semibold ml-1">
              · {listing.distance < 1 ? `${Math.round(listing.distance * 1000)}m` : `${listing.distance.toFixed(1)}km`}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          {isNegotiableOpportunity(listing) ? (
            <span className="text-base lg:text-lg font-black text-indigo-700">Negotiate your rate</span>
          ) : (
            <span className="text-xl lg:text-2xl font-black text-blue-600">{fmtPrice(listing)}</span>
          )}
          <span className="flex items-center gap-1 text-xs lg:text-sm">
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
// Drag here only ever Likes or Passes; a plain tap (no drag) acts exactly
// like the "See Listing" button below -- same onView callback, so it never
// counts as a swipe and never advances the deck either. Only a vertical
// drag with no real horizontal movement snaps back with no action (no
// swipe-up gesture, per spec).
interface CardProps {
  item: DeckItem;
  stackPos: number;
  isTop: boolean;
  exitDir: 'L' | 'R' | null;
  onSwipeLeft:  () => void;
  onSwipeRight: () => void;
  onView: () => void;
  /** Mobile pull-to-reveal -- fired with the clamped downward pull distance
   *  (0-80px) while a clearly-vertical drag is in progress, and with 0 on
   *  release/cancel so the parent can spring the reveal back to centered.
   *  The card itself never moves for this gesture (stays "centered and
   *  fixed" per spec) -- only reported upward for the parent to animate. */
  onPull?: (dy: number) => void;
}

const PULL_MAX = 80;

function SwipeCard({ item, stackPos, isTop, exitDir, onSwipeLeft, onSwipeRight, onView, onPull }: CardProps) {
  const [drag, setDrag]     = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const divRef   = useRef<HTMLDivElement>(null);
  const pulling  = useRef(false);

  const down = (e: React.PointerEvent) => {
    if (!isTop || exitDir) return;
    startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setActive(true);
    divRef.current?.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!startRef.current || !active) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    // Clearly-downward-dominant drag -- report as a pull-to-reveal instead
    // of moving the card, so the card stays put while the actions row
    // beneath it becomes visible. A little hysteresis (1.2x) keeps this
    // from flickering against a horizontal swipe near the diagonal.
    if (dy > 0 && dy > Math.abs(dx) * 1.2) {
      pulling.current = true;
      onPull?.(Math.min(dy, PULL_MAX));
      return;
    }
    if (pulling.current) { pulling.current = false; onPull?.(0); }
    setDrag({ x: dx, y: dy });
  };

  const up = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    if (pulling.current) {
      pulling.current = false;
      onPull?.(0);
      setActive(false);
      startRef.current = null;
      return;
    }

    const dx   = e.clientX - startRef.current.x;
    const dy   = e.clientY - startRef.current.y;
    const dt   = Date.now() - startRef.current.t;
    const dist = Math.hypot(dx, dy);

    if (dist < 8 && dt < 280) {
      onView();
    } else if (Math.abs(dx) > SWIPE_X && Math.abs(dx) > Math.abs(dy)) {
      dx > 0 ? onSwipeRight() : onSwipeLeft();
    }
    // Anything else (an indecisive drag, a vertical drag) snaps back -- no
    // swipe-up gesture, per spec; use the See Listing button instead.

    setDrag({ x: 0, y: 0 });
    setActive(false);
    startRef.current = null;
  };

  const cancel = () => {
    if (pulling.current) { pulling.current = false; onPull?.(0); }
    setDrag({ x: 0, y: 0 }); setActive(false); startRef.current = null;
  };

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

  const saveLabel = item.kind === 'creator' ? 'FOLLOW' : 'LIKE';

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
      {/* pop-in on an INNER wrapper, not this outer div -- the outer div
          already carries its own transform (drag position + STACK[stackPos]
          stack offset), and a CSS animation fighting an ancestor's own
          transform is the exact bug that broke ListingCard's shared-element
          tap feedback earlier (see its active:scale comment). Decoupling
          here the same way. */}
      <div className="pop-in">
        {item.kind === 'listing'
          ? <ListingContent listing={item.data}/>
          : <CreatorContent profile={item.data}/>
        }
      </div>

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
    </div>
  );
}

// ── Upgrade prompt (free-tier Undo attempt) ─────────────────────────────────
function UndoUpgradePrompt({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
          <RotateCcw className="w-6 h-6 text-blue-600" />
        </div>
        <h3 className="text-base font-black text-gray-900 mb-1.5">You passed this listing</h3>
        <p className="text-sm text-gray-500 mb-5">Upgrade to Professional or Business to go back and review listings you've passed.</p>
        <div className="flex flex-col gap-2">
          <button onClick={() => navigate('/account/upgrade')}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-sm">
            Upgrade Account
          </button>
          <button onClick={onClose} className="w-full py-2 text-gray-400 font-semibold text-xs">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Daily swipe limit reached (Creator/Creator+/guest only -- Professional
// and Business have no limit, so this never shows for them). This is a
// one-time interstitial shown the moment the limit is hit -- it never
// replaces the deck screen (the card stays mounted underneath) and is
// always dismissible without losing access to browsing/See Listing. ───────
function DailyLimitPrompt({ tier, limit, onClose, onViewListing }: { tier: 'creator' | 'creator_plus' | 'guest'; limit: number; onClose: () => void; onViewListing: () => void }) {
  const navigate = useNavigate();
  const isCreatorPlus = tier === 'creator_plus';
  const isGuest = tier === 'guest';
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
          <Heart className="w-6 h-6 text-blue-600" />
        </div>
        <h3 className="text-base font-black text-gray-900 mb-1.5">You've reached your daily swipe limit</h3>
        <p className="text-sm text-gray-500 mb-5">
          You've used all {limit} of your{isGuest ? ' free' : ' daily'} swipes{isGuest ? ' today' : ''}.{' '}
          {isGuest
            ? 'Create a free account to keep discovering creators, gear, and opportunities.'
            : isCreatorPlus
              ? 'Upgrade to Professional for unlimited swipes and Undo.'
              : 'Your swipes will reset tomorrow. Upgrade to Creator+ for 25 daily swipes or Professional for unlimited swipes.'}
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={() => navigate(isGuest ? '/create-account' : '/account/upgrade')}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-sm">
            {isGuest ? 'Sign Up' : isCreatorPlus ? 'Upgrade to Professional' : 'Upgrade to Creator+'}
          </button>
          <button onClick={() => { onClose(); onViewListing(); }} className="w-full py-2 text-gray-400 font-semibold text-xs">
            View Listing
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stack orchestrator ────────────────────────────────────────────────────────
interface SwipeStackProps {
  items: DeckItem[];
  onDone?: () => void;
  /** Scopes the "return to the same card after See Listing" sessionStorage
   *  key -- pass the active filter id so switching tabs doesn't restore a
   *  position from a different deck. */
  persistKey?: string;
  /** Fired (fire-and-forget from the caller's side) with a listing's id
   *  whenever a *listing* card (not a creator card) is swiped left or
   *  right -- used by Home.tsx's 'talent' filter to record an Opportunity
   *  swipe against its own separate 5/day server-side limit. Never
   *  blocks the swipe itself; the deck is already sized to whatever was
   *  allowed at load time (see Home.tsx). */
  onSwipeListing?: (listingId: string) => void;
}

function readPersistedIdx(key: string): number {
  try { return Math.max(0, parseInt(sessionStorage.getItem(`filmons_swipe_idx_${key}`) || '0', 10) || 0); }
  catch { return 0; }
}

// Deliberately does NOT touch anything daily-swipe-limit-related --
// swipesUsed is independently re-sourced on every mount (getTodaySwipeCount
// for signed-in users, localStorage for guests, both keyed by calendar
// date, neither by this idx), so clearing just the position is safe.
export function clearPersistedSwipeIdx(key: string): void {
  try { sessionStorage.removeItem(`filmons_swipe_idx_${key}`); } catch {}
}

export function SwipeStack({ items = [], onDone, persistKey = 'default', onSwipeListing }: SwipeStackProps) {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [idx,     setIdx]     = useState(() => readPersistedIdx(persistKey));
  const [exitDir, setExitDir] = useState<'L' | 'R' | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [undoing, setUndoing] = useState(false);

  // Mobile pull-to-reveal (see SwipeCard's onPull) -- pullY tracks the
  // finger 1:1 while a downward drag is in progress (isPulling true, no
  // transition), then springs back to 0 on release (isPulling false,
  // transition enabled). Only meaningful below lg; desktop's viewport
  // isn't height-clipped so this transform is a visual no-op there.
  const [pullY, setPullY] = useState(0);
  const isPullingRef = useRef(false);
  const handlePull = (dy: number) => {
    isPullingRef.current = dy > 0;
    setPullY(dy);
  };

  const tier = normalizeTier(user?.accountType);
  const dailyLimit = user ? ENTITLEMENTS[tier].swipesPerDay : GUEST_DAILY_LIMIT; // null = unlimited (Professional/Business)
  const [swipesUsed, setSwipesUsed] = useState(() => (user ? 0 : readGuestSwipeCount()));
  const [showDailyLimit, setShowDailyLimit] = useState(false);

  // Initial "N used today" for the display counter -- the record-swipe
  // edge function is the real gate for signed-in accounts; this is just
  // what the badge starts at (and the only source of truth at all for
  // guests, who have no server-side count to read).
  useEffect(() => {
    if (!user?.id || dailyLimit === null) return;
    swipeApi.getTodaySwipeCount(user.id).then(setSwipesUsed);
  }, [user?.id, dailyLimit]);

  // Persist position so tapping "See Listing" and coming back (a real
  // route change, not a modal) lands on the same card instead of
  // restarting the deck -- viewing never advances idx itself, so this is
  // the only thing that needs to survive the unmount/remount.
  useEffect(() => {
    try { sessionStorage.setItem(`filmons_swipe_idx_${persistKey}`, String(idx)); } catch {}
  }, [idx, persistKey]);

  // Fires onDone the moment idx reaches the end of the deck -- a
  // useLayoutEffect, not useEffect, so it (and whatever state update it
  // triggers in the parent, e.g. Home.tsx's setDeckDone) is flushed
  // synchronously before the browser paints. That's what actually
  // guarantees the parent has already swapped away from rendering this
  // component by the time anything becomes visible, rather than relying
  // on React 18 happening to batch a callback fired from inside setIdx's
  // updater (the previous approach) -- an implicit guarantee, not an
  // explicit one, and the reason this could render blank for a frame.
  // doneFiredRef guards against firing twice for the same "reached the
  // end" transition (effects can re-run) and resets if idx ever moves
  // back below the end (Undo, a bigger deck arriving via Refresh).
  const doneFiredRef = useRef(false);
  useLayoutEffect(() => {
    if (items.length > 0 && idx >= items.length) {
      if (!doneFiredRef.current) {
        doneFiredRef.current = true;
        onDone?.();
      }
    } else {
      doneFiredRef.current = false;
    }
  }, [idx, items.length, onDone]);

  const fly = (dir: 'L' | 'R') => {
    if (exitDir) return;
    // Local count is the fast UX gate (blocks before the card even
    // animates); record-swipe below is the real, server-enforced one --
    // this can only under-block, never let a swipe through the server
    // wouldn't also allow.
    if (dailyLimit !== null && swipesUsed >= dailyLimit) { setShowDailyLimit(true); return; }
    const item = items[idx];
    setExitDir(dir);

    setTimeout(async () => {
      if (dir === 'R' && user && item) {
        if (item.kind === 'listing') {
          // Trimmed shape only — matches ListingCard.tsx's handleSave.
          // Storing the full listing (images/videos arrays, sometimes
          // base64) here made favorites.item_data heavy and slowed down
          // Profile's Liked tab fetch for every swipe-saved listing.
          const cover = item.data.image || item.data.images?.find(i => typeof i === 'string');
          await supabase.from('favorites').upsert({
            user_id: user.id, item_id: item.data.id, item_type: 'listing',
            item_data: { title: item.data.title, image: cover, price: item.data.price, city: item.data.city, isEmergency: item.data.isEmergency, emergencyExpiresAt: item.data.emergencyExpiresAt },
          }, { onConflict: 'user_id,item_id' }).then(undefined, () => {});
          toast.success(`❤️ Saved: ${item.data.title}`);
          if (item.data.userId && item.data.userId !== user.id) {
            notifs.push(item.data.userId, {
              type: 'listing_liked', fromUserId: user.id, fromUserName: user.name, fromUserAvatar: user.avatar,
              listingId: item.data.id, listingTitle: item.data.title,
            });
            fetch(`https://${projectId}.supabase.co/functions/v1/notify-event`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
              body: JSON.stringify({ type: 'listing_liked', ownerId: item.data.userId, likerId: user.id, likerName: user.name, listingId: item.data.id, listingTitle: item.data.title }),
            }).catch(() => {});
          }
        } else {
          await supabase.from('favorites').upsert({
            user_id: user.id, item_id: item.data.id, item_type: 'creator',
            item_data: { id: item.data.id, name: item.data.name, username: item.data.username, avatar_url: item.data.avatar_url, city: item.data.city, primary_role: item.data.primary_role },
          }, { onConflict: 'user_id,item_id' }).then(undefined, () => {});
          toast.success(`❤️ Liked: ${item.data.name}`);
          if (item.data.id && item.data.id !== user.id) {
            notifs.push(item.data.id, {
              type: 'creator_liked', fromUserId: user.id, fromUserName: user.name, fromUserAvatar: user.avatar,
            });
            fetch(`https://${projectId}.supabase.co/functions/v1/notify-event`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
              body: JSON.stringify({ type: 'creator_liked', ownerId: item.data.id, likerId: user.id, likerName: user.name }),
            }).catch(() => {});
          }
        }
      }
      // Opportunity-specific swipe limit (Home.tsx's 'talent' filter only,
      // via onSwipeListing) -- independent of, and in addition to, the
      // general daily-limit recording right below. Guests included: the
      // caller resolves its own guest identity, unlike swipeApi.recordSwipe
      // below which only ever runs for a signed-in user.
      if (item?.kind === 'listing' && (dir === 'L' || dir === 'R')) {
        onSwipeListing?.(item.data.id);
      }
      // Record every swipe (both directions) -- left makes the pass
      // permanent (excluded from future deck loads, see Home.tsx); right
      // is recorded too so Undo can reverse a like, not just a pass. This
      // is also the real, server-enforced daily-limit check -- the local
      // gate above is just the fast path for the common case.
      if (user && item && (dir === 'L' || dir === 'R')) {
        const res = await swipeApi.recordSwipe(user.id, item.data.id, item.kind, dir === 'L' ? 'left' : 'right');
        if (res.ok) {
          // Only a confirmed write bumps the displayed count -- counting
          // this optimistically regardless of res.ok let the local number
          // drift ahead of what the server actually has (e.g. every call
          // silently failing while record-swipe was undeployed still
          // incremented the badge to 9 while only 3 rows ever landed in
          // `swipes`; a refresh re-syncs from getTodaySwipeCount and the
          // badge visibly "drops"). Show the limit message the moment this
          // swipe is the one that fills the quota, not just on the next
          // (blocked) attempt -- the card underneath stays put either way.
          const next = swipesUsed + 1;
          setSwipesUsed(next);
          if (dailyLimit !== null && next >= dailyLimit) setShowDailyLimit(true);
        } else if (res.limitReached) {
          setSwipesUsed(res.limit);
          setShowDailyLimit(true);
        }
        // else: network/server error recording the swipe -- don't count it
        // against the local daily-limit display; the `swipes` table (and
        // getTodaySwipeCount on next load) stays the source of truth.
      } else if (!user && item && (dir === 'L' || dir === 'R')) {
        // No account to persist against (no favorites, no swipe history) --
        // just the local guest counter, which is the whole enforcement for
        // this tier anyway (see GUEST_DAILY_LIMIT above).
        const next = swipesUsed + 1;
        writeGuestSwipeCount(next);
        setSwipesUsed(next);
        if (dailyLimit !== null && next >= dailyLimit) setShowDailyLimit(true);
      }
      // onDone firing lives in the useLayoutEffect below, not here -- a
      // callback fired from inside a state updater only reliably reaches
      // the parent before paint because React 18 happens to batch it;
      // that's an implicit guarantee, not an explicit one, and exactly the
      // "return null and hope batching saves you" shape that let this
      // component render blank for a frame between idx passing the end of
      // items and Home.tsx's deckDone actually flipping.
      setIdx(i => i + 1);
      setExitDir(null);
    }, 360);
  };

  // Professional/Business only, enforced server-side in undo-swipe (this
  // check is just for the prompt vs. actual-call branch, not the real
  // gate). Only offered when there's a same-session swipe to restore --
  // `items` is never mutated by a swipe, so idx-1 is always the exact card
  // just dismissed, regardless of which direction it went.
  const handleUndo = async () => {
    if (!user || idx === 0 || undoing) return;
    if (!isProfessional(user.accountType)) { setShowUpgradePrompt(true); return; }
    setUndoing(true);
    const res = await swipeApi.undoLastSwipe(user.id);
    setUndoing(false);
    if (res.ok) setIdx(i => Math.max(0, i - 1));
    else toast.error(res.reason === 'no_previous_swipe' ? 'Nothing to undo' : 'Could not undo');
  };

  const current = items[idx];
  const cards   = items.slice(idx, idx + 3);
  const viewItem = (target: DeckItem) => {
    if (target.kind === 'listing') {
      const listing = target.data;
      // Snapshots the deck card's [data-animate-id] image (see
      // ListingContent below) so ListingDetail's playTransition() can FLIP
      // it into the hero position -- same manual-FLIP pattern
      // ListingCard.tsx uses for every other listing grid in the app; the
      // swipe deck just never had it wired up. preview seeds the detail
      // page's skeleton hero/title/price the instant it mounts, same as
      // ListingCard's handleClick.
      captureSnapshot();
      const previewCover = listing.images?.find((i: any) => typeof i === 'string') || null;
      navigate(`/listing/${listing.id}`, {
        state: { preview: { title: listing.title, price: listing.price, cover: previewCover, city: listing.city } },
      });
    } else {
      navigate(`/host/${target.data.id}`);
    }
  };

  // Deck exhausted -- Home.tsx owns the "you're all caught up" screen
  // (Browse All Listings / Change Filters / Refresh) via onDone, so there's
  // nothing for this component to render here.
  if (!current || idx >= items.length) return null;

  const canUndo = isProfessional(user?.accountType);
  // Reached the daily cap -- the card stays put and See Listing stays
  // active; only Like/Pass lock, and only for the tiers that have a cap
  // at all (Professional/Business have dailyLimit === null, so this is
  // always false for them).
  const atLimit = dailyLimit !== null && swipesUsed >= dailyLimit;

  return (
    // isolate confines the card stack's internal z-index scale (up to 30,
    // for the drag/exit animation) to its own stacking context -- without
    // it those values compare directly against the page's sticky search
    // bar (z-20) in the shared root stacking context and win, so the deck
    // painted in front of the search bar while scrolling past it.
    // w-full is load-bearing here: this div is a flex item of Home's own
    // items-center column, so without it the container shrink-to-fits its
    // narrowest child's intrinsic width instead of the viewport -- which is
    // exactly why earlier padding-only tweaks on this element had no
    // visible effect (the card's own w-full was already 100% of an
    // already-too-narrow parent). Width itself now matches the exact
    // recipe requested: near-full viewport width with a small fixed
    // margin on phones, capped at 430px on larger phones, always centered.
    <div className="w-[calc(100vw-24px)] max-w-[430px] mx-auto flex flex-col items-center lg:w-full lg:max-w-2xl lg:mx-auto isolate">
      {/* Card stack — height must fit the tallest rendered card (image +
          text content), not just the image, or the card visually overflows
          this container and covers the counter/buttons below it (they're
          still there in the DOM, just hidden underneath). Deliberately NO
          overflow-hidden here (or on any ancestor of the card) -- the
          horizontal swipe/exit animation rotates and translates the card
          well past its own box, and clipping that container is exactly
          what produced the "overlay" bug (the card visibly cutting off
          against its own wrapper's edge mid-swipe). The mobile pull-reveal
          row below has its own separate, small clipped viewport instead of
          sharing this one, so it never constrains the card. */}
      <div className="relative w-full h-[420px] lg:h-[580px] isolate" style={{ zIndex: 2 }}>
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
              onView={() => viewItem(item)}
              onPull={handlePull}
            />
          );
        })}
      </div>

      {/* Compact mobile-only reveal row — Heart / Eye / X only, no labels,
          no counter, nothing else. This is the ONLY element that clips:
          its own height animates from 0 up to the live pull distance, so
          the row grows into view from underneath the (always fully
          visible, never-clipped) card above it. The full labeled row +
          counter below is desktop-only. */}
      <div
        className="lg:hidden w-full overflow-hidden"
        style={{
          height: pullY,
          transition: isPullingRef.current ? 'none' : 'height 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div className="flex items-center justify-center gap-10 pt-4" style={{ opacity: Math.min(pullY / 30, 1) }}>
          <button
            onClick={() => atLimit ? setShowDailyLimit(true) : fly('L')}
            aria-label={atLimit ? 'Daily swipe limit reached' : 'Pass'}
            className={`w-12 h-12 rounded-full border-2 shadow-md flex items-center justify-center transition-all active:scale-90 ${
              atLimit ? 'bg-gray-50 border-gray-200 cursor-not-allowed' : 'bg-white border-red-200 hover:border-red-400 hover:bg-red-50'
            }`}>
            {atLimit ? <Lock className="w-5 h-5 text-gray-300"/> : <X className="w-5 h-5 text-red-400"/>}
          </button>
          <button
            onClick={() => viewItem(current)}
            aria-label="See listing"
            className="w-11 h-11 rounded-full bg-white border-2 border-blue-200 shadow-md flex items-center justify-center transition-all active:scale-90 hover:border-blue-400 hover:bg-blue-50">
            <Eye className="w-4 h-4 text-blue-500"/>
          </button>
          <button
            onClick={() => atLimit ? setShowDailyLimit(true) : fly('R')}
            aria-label={atLimit ? 'Daily swipe limit reached' : 'Like'}
            className={`w-12 h-12 rounded-full border-2 shadow-md flex items-center justify-center transition-all active:scale-90 ${
              atLimit ? 'bg-gray-50 border-gray-200 cursor-not-allowed' : 'bg-white border-green-200 hover:border-green-400 hover:bg-green-50'
            }`}>
            {atLimit ? <Lock className="w-5 h-5 text-gray-300"/> : <Heart className="w-5 h-5 text-green-500"/>}
          </button>
        </div>
      </div>

      {/* Counter — desktop only (mobile shows the compact reveal row
          above instead). Daily swipe usage only shows for limited tiers
          (Creator/Creator+); Professional/Business have no limit. Near the
          end of the deck (3 or fewer cards including this one), supplement
          with an explicit "N left" so the approaching end is clear without
          interrupting with a modal. */}
      <div className="hidden lg:flex items-center gap-3 mt-3 mb-5">
        <p className="text-[11px] text-gray-400 font-medium">
          {idx + 1} of {items.length}
          {items.length - idx <= 3 && (
            <span className="text-amber-500 font-semibold"> · {items.length - idx} opportunit{items.length - idx === 1 ? 'y' : 'ies'} left</span>
          )}
        </p>
        {dailyLimit !== null && (
          <p className={`text-[11px] font-semibold ${atLimit ? 'text-red-500' : 'text-blue-500'}`}>
            {Math.min(swipesUsed, dailyLimit)} / {dailyLimit} daily swipes
          </p>
        )}
      </div>

      {/* Action buttons — desktop only. Creator/Creator+: Pass | See
          Listing | Like (no Undo at all); Professional/Business: Undo |
          Pass | See Listing | Like */}
      <div className="hidden lg:flex items-center gap-6 lg:gap-8">
        {canUndo && (
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={handleUndo}
              disabled={idx === 0 || undoing}
              aria-label="Undo last swipe"
              className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-white border-2 border-gray-200 shadow-sm flex items-center justify-center hover:border-gray-300 transition-all active:scale-90 disabled:opacity-30 disabled:cursor-default">
              <RotateCcw className="w-4 h-4 lg:w-5 lg:h-5 text-gray-500"/>
            </button>
            <span className="text-[10px] lg:text-xs font-semibold text-gray-400">Undo</span>
          </div>
        )}
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={() => atLimit ? setShowDailyLimit(true) : fly('L')}
            aria-label={atLimit ? 'Daily swipe limit reached' : 'Pass'}
            className={`w-14 h-14 lg:w-16 lg:h-16 rounded-full border-2 shadow-md flex items-center justify-center transition-all active:scale-90 ${
              atLimit ? 'bg-gray-50 border-gray-200 cursor-not-allowed' : 'bg-white border-red-200 hover:border-red-400 hover:bg-red-50'
            }`}>
            {atLimit
              ? <Lock className="w-5 h-5 lg:w-6 lg:h-6 text-gray-300"/>
              : <X className="w-6 h-6 lg:w-7 lg:h-7 text-red-400"/>}
          </button>
          <span className="text-[10px] lg:text-xs font-semibold text-gray-400">{atLimit ? 'Locked' : 'Pass'}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={() => viewItem(current)}
            className="w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-white border-2 border-blue-200 shadow-md flex items-center justify-center hover:border-blue-400 hover:bg-blue-50 transition-all active:scale-90">
            <Eye className="w-5 h-5 lg:w-6 lg:h-6 text-blue-500"/>
          </button>
          <span className="text-[10px] lg:text-xs font-semibold text-gray-400">See Listing</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={() => atLimit ? setShowDailyLimit(true) : fly('R')}
            aria-label={atLimit ? 'Daily swipe limit reached' : 'Like'}
            className={`w-14 h-14 lg:w-16 lg:h-16 rounded-full border-2 shadow-md flex items-center justify-center transition-all active:scale-90 ${
              atLimit ? 'bg-gray-50 border-gray-200 cursor-not-allowed' : 'bg-white border-green-200 hover:border-green-400 hover:bg-green-50'
            }`}>
            {atLimit
              ? <Lock className="w-5 h-5 lg:w-6 lg:h-6 text-gray-300"/>
              : <Heart className="w-6 h-6 lg:w-7 lg:h-7 text-green-500"/>}
          </button>
          <span className="text-[10px] lg:text-xs font-semibold text-gray-400">{atLimit ? 'Locked' : 'Like'}</span>
        </div>
      </div>

      <p className="hidden lg:block text-[11px] text-gray-300 mt-4">
        {atLimit ? 'Upgrade to unlock more swipes today' : '← Pass  ·  Like →'}
      </p>

      {showUpgradePrompt && <UndoUpgradePrompt onClose={() => setShowUpgradePrompt(false)} />}
      {showDailyLimit && dailyLimit !== null && (!user || tier === 'creator' || tier === 'creator_plus') && (
        <DailyLimitPrompt tier={!user ? 'guest' : tier} limit={dailyLimit} onClose={() => setShowDailyLimit(false)} onViewListing={() => viewItem(current)} />
      )}
    </div>
  );
}
