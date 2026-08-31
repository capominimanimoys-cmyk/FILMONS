/**
 * Filmons Home — Tinder-style discovery deck.
 * Users swipe through a mixed feed of listings, services, studios, and creator profiles.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Search, Sparkles, Package, Tag, Wrench, User, Building2, Briefcase, Compass, SlidersHorizontal, RefreshCw, PartyPopper, AlertTriangle, Zap, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { listingsApi } from '../lib/api';
import { emergencyApi } from '../lib/emergencyApi';
import { normalizeTier } from '../lib/reliabilityApi';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Listing } from '../types';
import { SwipeStack, clearPersistedSwipeIdx, type DeckItem, type CreatorProfile, type EnrichedListing } from '../components/SwipeStack';
import { swipeApi } from '../lib/swipeApi';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import { opportunityFeedApi } from '../lib/opportunityFeedApi';
import { setPendingReturnUrl } from '../lib/authReturnUrl';

// A recycled (already-swiped) Emergency listing shouldn't reappear too
// soon for the same viewer -- short enough that an active Emergency
// listing still cycles back meaningfully within its 72h/7d window, long
// enough that it never feels like it's just following the user around.
const EMERGENCY_RECYCLE_COOLDOWN_HOURS = 2;

// ── Filter system ─────────────────────────────────────────────────────────────
type FilterId = 'all' | 'rentals' | 'sales' | 'services' | 'creators' | 'studios' | 'talent' | 'emergency';

type LucideIcon = React.ComponentType<{ className?: string }>;
const FILTERS: { id: FilterId; label: string; icon: LucideIcon }[] = [
  { id: 'all',      label: 'All',      icon: Sparkles  },
  { id: 'rentals',  label: 'Rentals',  icon: Package   },
  { id: 'sales',    label: 'Sales',    icon: Tag       },
  { id: 'services', label: 'Services', icon: Wrench    },
  { id: 'creators', label: 'Creators', icon: User      },
  { id: 'studios',  label: 'Studios',  icon: Building2 },
  { id: 'talent',   label: 'Opportunity', icon: Briefcase },
  // Browsing (not creating) this category is gated to Professional/Business
  // accounts -- see canBrowseEmergency below and check-emergency-access,
  // which re-verifies server-side rather than trusting the client tier.
  { id: 'emergency', label: 'Emergency', icon: AlertTriangle },
];

// Real Opportunity listings — listing_type === 'opportunity' is the
// authoritative source of truth now; metadata.listingKind === 'talent'
// (the earlier repurposed-kind marker) and the original keyword
// heuristic are kept as fallbacks so older listings don't disappear.
// Shared between buildDeck's 'talent' branch and Home()'s own count of
// how many real Opportunities exist (needed to tell "ran out because of
// the daily swipe cap" apart from "ran out because nothing else exists").
function isTalentListing(l: EnrichedListing): boolean {
  return l.listingType === 'opportunity' ||
    l.listingKind === 'talent' ||
    /model|actor|actress|talent|ugc/i.test(l.title ?? '') ||
    /model|actor|actress|talent|ugc/i.test(l.serviceCategory ?? '');
}

function buildDeck(listings: EnrichedListing[], creators: CreatorProfile[], filter: FilterId, opportunitySwipesRemaining?: number | null): DeckItem[] {
  if (filter === 'creators') {
    return creators.map(c => ({ kind: 'creator', data: c }));
  }

  let filtered = [...listings];

  if (filter === 'emergency') {
    // `listings` here has already been through the fetch effect's swipe-
    // exclusion + Emergency recycling-exemption/cooldown logic (see the
    // isActiveEmergency block below) -- filtering it down to just active
    // Emergency listings reuses that same recycling behavior automatically
    // instead of re-implementing it for this category.
    filtered = filtered.filter(l => l.isEmergency && !!l.emergencyExpiresAt && new Date(l.emergencyExpiresAt) > new Date());
    return filtered.map(l => ({ kind: 'listing' as const, data: l }));
  }

  if (filter === 'rentals') {
    filtered = filtered.filter(l => l.listingMode === 'rent' && l.listingType !== 'service');
  } else if (filter === 'sales') {
    filtered = filtered.filter(l => l.listingMode === 'sale');
  } else if (filter === 'services') {
    filtered = filtered.filter(l => l.listingType === 'service');
  } else if (filter === 'studios') {
    filtered = filtered.filter(l =>
      (l.title?.toLowerCase() ?? '').includes('studio') ||
      (l.serviceCategory?.toLowerCase() ?? '').includes('studio')
    );
  } else if (filter === 'talent') {
    let talentListings = filtered.filter(isTalentListing);
    // Guest/Creator/Creator+ see every real Opportunity listing (never a
    // restricted subset) -- opportunitySwipesRemaining just sizes the
    // deck to however many swipes they have left today (server-enforced
    // per-swipe via record-opportunity-swipe, see Home()'s handleSwipe),
    // so they can never swipe past the daily limit. null/undefined means
    // Professional/Business (unlimited) -- full list, no truncation.
    if (opportunitySwipesRemaining != null) {
      talentListings = talentListings.slice(0, Math.max(0, opportunitySwipesRemaining));
    }
    const talentCreators = creators.filter(c =>
      /model|actor|actress|talent|influencer|ugc/i.test(c.primary_role ?? '')
    );
    const items: DeckItem[] = [
      ...talentListings.map(l => ({ kind: 'listing' as const, data: l })),
      ...talentCreators.map(c => ({ kind: 'creator' as const, data: c })),
    ];
    // interleave
    return items.sort(() => Math.random() - 0.5);
  }

  const listingItems: DeckItem[] = filtered.map(l => ({ kind: 'listing' as const, data: l }));

  if (filter !== 'all' || creators.length === 0) return listingItems;

  // 'all' — insert a creator every 4 listing cards
  const creatorItems: DeckItem[] = creators.map(c => ({ kind: 'creator' as const, data: c }));
  const result: DeckItem[] = [];
  let ci = 0;
  for (let i = 0; i < listingItems.length; i++) {
    result.push(listingItems[i]);
    if ((i + 1) % 4 === 0 && ci < creatorItems.length) {
      result.push(creatorItems[ci++]);
    }
  }
  while (ci < creatorItems.length) result.push(creatorItems[ci++]);
  return result;
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonDeck() {
  return (
    <div className="px-4">
      <div className="w-full rounded-[28px] overflow-hidden shadow-2xl bg-white animate-pulse" style={{ height: 420 }}>
        <div className="h-72 bg-gray-200"/>
        <div className="p-4 space-y-2.5">
          <div className="h-4 bg-gray-200 rounded w-3/4"/>
          <div className="h-3 bg-gray-200 rounded w-1/2"/>
          <div className="h-5 bg-gray-200 rounded w-1/3 mt-3"/>
        </div>
      </div>
      <div className="flex items-center justify-center gap-6 mt-8">
        <div className="w-14 h-14 rounded-full bg-gray-200 animate-pulse"/>
        <div className="w-12 h-12 rounded-full bg-gray-200 animate-pulse"/>
        <div className="w-14 h-14 rounded-full bg-gray-200 animate-pulse"/>
      </div>
    </div>
  );
}

// Per-filter "did the user already reach the end of this queue" flag --
// deliberately sessionStorage, not the source of truth for anything (the
// actual passed/liked state is fully server-persisted via swipes/
// favorites regardless of this). This only decides whether a fresh mount
// jumps straight into the deck or shows a "N new opportunities" interstitial
// first, so re-opening a filter that was already finished doesn't look
// like nothing happened when new listings have actually appeared since.
function completedKey(filter: FilterId): string { return `filmons_deck_completed_${filter}`; }
function readCompleted(filter: FilterId): boolean {
  try { return sessionStorage.getItem(completedKey(filter)) === 'true'; } catch { return false; }
}
function writeCompleted(filter: FilterId, done: boolean): void {
  try { done ? sessionStorage.setItem(completedKey(filter), 'true') : sessionStorage.removeItem(completedKey(filter)); } catch {}
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Client-side shortcut only (instant tab visibility) -- the real gate is
  // checkBrowseAccess in handleFilter below, same "shortcut client-side,
  // enforce server-side" split already used for the Opportunity Creator-tier
  // restriction (see ApplyModal.tsx).
  const userTier = normalizeTier(user?.accountType);
  const canBrowseEmergency = userTier === 'professional' || userTier === 'business';
  const [showEmergencyUpgrade, setShowEmergencyUpgrade] = useState(false);

  // Opportunity ("talent" filter) browsing: Guest/Creator/Creator+ see
  // every real Opportunity listing (buildDeck's 'talent' branch is never
  // filtered down by which ones), just capped at 5 SWIPES/day --
  // server-enforced per swipe (see handleOpportunitySwipe below /
  // record-opportunity-swipe). oppSwipesRemaining is resolved once per
  // Home mount (not live-updated as the user swipes through the deck
  // this session -- the deck is sized once, at load, to whatever was
  // remaining then) so the deck doesn't shrink out from under an
  // in-progress swipe-through. Starts at 0 (not the full amount) for a
  // limited tier so the brief window before the server round-trip
  // resolves shows zero Opportunity cards, not a flash of everything.
  const oppUnlimited = userTier === 'professional' || userTier === 'business';
  const [oppSwipesRemaining, setOppSwipesRemaining] = useState(0);
  // Temporary — remove once confirmed fixed on a real device.
  const [oppDebug, setOppDebug] = useState('not run yet');
  useEffect(() => {
    if (oppUnlimited) { setOppDebug('oppUnlimited=true, skipped'); return; }
    let cancelled = false;
    setOppDebug(`fetching… userTier=${userTier} userId=${user?.id ?? 'none'}`);
    opportunityFeedApi.getSwipeStatus(user?.id, !user).then(({ unlimited, swipeCount, limit }) => {
      if (cancelled) return;
      setOppDebug(`resolved: unlimited=${unlimited} swipeCount=${swipeCount} limit=${limit}`);
      if (unlimited) return; // unlimited: server disagreed with the client tier read -- oppUnlimited already covers this path
      setOppSwipesRemaining(Math.max(0, limit - swipeCount));
    });
    return () => { cancelled = true; };
  }, [oppUnlimited, user?.id]);

  // Fire-and-forget per swipe (both directions -- Pass also "uses up" a
  // preview, matching how the general Home swipe limit already treats
  // left/right the same). Never blocks the UI: the deck was already
  // sized to oppSwipesRemaining at load, so nothing here needs to gate
  // the NEXT card in the same session -- this just keeps the server
  // count correct for tomorrow/a refresh.
  const handleOpportunitySwipe = (listingId: string) => {
    if (oppUnlimited) return;
    opportunityFeedApi.recordSwipe(user?.id, !user, listingId).catch(() => {});
  };

  const [listings,  setListings]  = useState<EnrichedListing[]>([]);
  const [creators,  setCreators]  = useState<CreatorProfile[]>([]);
  // Pre-exclusion versions of the same fetch -- kept only to tell "this
  // filter has zero eligible items because everything was already swiped"
  // (show the caught-up screen) apart from "this filter has zero items,
  // period" (show the plain empty state). Both look identical as an empty
  // `deck` alone: swipe-exclusion runs on the raw fetch before buildDeck()
  // ever applies a filter, so a fully-swiped 'all' deck and a category with
  // no listings at all are otherwise indistinguishable.
  const [rawListings, setRawListings] = useState<EnrichedListing[]>([]);
  const [rawCreators, setRawCreators] = useState<CreatorProfile[]>([]);
  const [loading,   setLoading]   = useState(true);
  // Branded loading — the animated Filmons wordmark shows first (a fixed,
  // brief window, not "until the fetch resolves") since the request often
  // resolves in well under a second and a full-viewport brand loader
  // flashing for 50ms would read as a glitch, not a loading state. The
  // listing-card skeleton (already existed) takes over for however much
  // longer the fetch actually takes beyond that.
  const [showBrandLoader, setShowBrandLoader] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowBrandLoader(false), 500);
    return () => clearTimeout(t);
  }, []);
  const [filter,    setFilter]    = useState<FilterId>('all');
  const [deckDone,  setDeckDone]  = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Whether this filter's queue was already finished in an earlier session
  // (per readCompleted) -- re-checked whenever the filter changes or fresh
  // data lands, so returning to an exhausted queue that now has new unseen
  // items shows "N new opportunities" instead of silently resuming (which
  // would otherwise also hit a stale, past-the-end persisted card index).
  const [showNewBanner, setShowNewBanner] = useState(false);
  // Set by handleRefresh, cleared once the resulting fetch lands -- decides
  // whether that landing means "toast the new count and show the deck" or
  // "nothing new, stay on the caught-up screen with the no-new-listings copy".
  const [refreshPending, setRefreshPending] = useState(false);
  const [noNewListings, setNoNewListings] = useState(false);
  // Distinct from "loaded fine, zero results" -- a genuine fetch failure
  // must not silently collapse into the same empty/caught-up states. Only
  // the listings fetch below can trigger this (it no longer swallows its
  // own error); profiles/excluded-ids stay individually resilient since a
  // failure there shouldn't block the whole page over a secondary source.
  const [loadError, setLoadError] = useState(false);
  const filterRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let done = false;
    setLoadError(false);
    Promise.all([
      listingsApi.getAll(),
      supabase
        .from('profiles')
        .select('id, name, username, avatar_url, city, primary_role, bio, is_verified')
        .not('name', 'is', null)
        .neq('name', '')
        .not('primary_role', 'is', null)
        .limit(24)
        .then(r => (r.data ?? []) as CreatorProfile[], () => [] as CreatorProfile[]),
      user?.id ? swipeApi.getExcludedIds(user.id) : Promise.resolve(new Set<string>()),
    ]).then(async ([l, c, excluded]) => {
      if (done) return;
      setRawListings(l);
      setRawCreators(c);
      // Already-left-swiped items are a permanent skip (Tinder-style) --
      // filtered out here, before buildDeck(), so every filter tab and any
      // reload excludes them consistently instead of just the current one.
      // Active Emergency listings are the one deliberate exception: they're
      // exempt from this permanent exclusion (paid feed-recycling is the
      // whole point), so a previously-swiped one can legitimately come
      // back as long as its Emergency period hasn't expired yet.
      if (excluded.size) {
        const isActiveEmergency = (x: EnrichedListing) =>
          !!x.isEmergency && !!x.emergencyExpiresAt && new Date(x.emergencyExpiresAt) > new Date();
        const recycledIds = l.filter(x => excluded.has(x.id) && isActiveEmergency(x)).map(x => x.id);

        // Spacing: a recycled Emergency listing shouldn't resurface too
        // soon after this viewer was already shown it this same way --
        // hold it back for a cooldown window rather than letting it cycle
        // back on literally every refresh.
        let onCooldown = new Set<string>();
        if (user?.id && recycledIds.length) {
          try {
            const seen = await emergencyApi.getRecentlySeenEmergency(user.id, recycledIds, EMERGENCY_RECYCLE_COOLDOWN_HOURS);
            onCooldown = new Set(Object.keys(seen));
          } catch {}
        }

        l = l.filter(x => !excluded.has(x.id) || (isActiveEmergency(x) && !onCooldown.has(x.id)));
        c = c.filter(x => !excluded.has(x.id));

        // Log an impression for whichever recycled Emergency listings
        // actually made it into this deck, so the next fetch's cooldown
        // check above knows to hold them back for a while.
        if (user?.id) {
          l.filter(x => excluded.has(x.id) && isActiveEmergency(x))
            .forEach(x => emergencyApi.logImpression(x.id, user.id));
        }
      }
      // Boost Listing is temporarily disabled -- listingsApi.getAll() no
      // longer gives boosted listings priority placement (see api.ts), so
      // there's nothing here to frequency-cap or demote anymore. `l` is
      // already normal-feed order.
      const ordered: EnrichedListing[] = l;

      setListings(ordered);
      setCreators(c);
      setLoading(false);
    }).catch(() => {
      if (done) return;
      setLoadError(true);
      setLoading(false);
    });
    return () => { done = true; };
  }, [user?.id, refreshKey]);

  // Rebuild deck whenever filter or source data changes; reset deck state via key
  // null (Professional/Business) means "don't truncate" inside buildDeck.
  const oppSwipesRemainingForDeck = oppUnlimited ? null : oppSwipesRemaining;
  const deck = useMemo(() => buildDeck(listings, creators, filter, oppSwipesRemainingForDeck), [listings, creators, filter, oppSwipesRemainingForDeck]);
  const rawDeck = useMemo(() => buildDeck(rawListings, rawCreators, filter, oppSwipesRemainingForDeck), [rawListings, rawCreators, filter, oppSwipesRemainingForDeck]);

  // Reaching the end of the 'talent' deck means "hit the daily swipe cap"
  // only if there were genuinely more real Opportunities than the capped
  // deck showed -- otherwise the user just saw everything that exists,
  // same as any other caught-up filter, and the upsell would be
  // misleading ("unlock more" when there is no more).
  const talentTotalCount = useMemo(() => listings.filter(isTalentListing).length, [listings]);
  const oppLimitReached = !oppUnlimited && talentTotalCount > oppSwipesRemaining;

  // A reload (or first visit this session) after having already swiped
  // through everything for this filter never fires SwipeStack's onDone --
  // there's no deck left to mount and swipe through in the first place, so
  // deckDone (plain React state) starts false again. Detect that case here
  // instead: deck is empty but rawDeck (pre-exclusion) isn't, meaning real
  // eligible items exist and were all already swiped -- promote straight to
  // the same deckDone state onDone would have set, so this renders the
  // caught-up screen rather than the plain "Nothing here yet" empty state.
  useEffect(() => {
    if (loading || deckDone) return;
    if (deck.length === 0 && rawDeck.length > 0) {
      setDeckDone(true);
      writeCompleted(filter, true);
    }
  }, [loading, deck.length, rawDeck.length, filter, deckDone]);

  // Re-checked whenever the filter changes or fresh listings land -- if
  // this filter's queue was already finished in an earlier session and
  // there's still a non-empty deck (only possible now because new unseen
  // items appeared, since everything previously seen is excluded before
  // buildDeck ever runs), show the "N new opportunities" interstitial
  // instead of silently resuming into a stale, past-the-end card position.
  useEffect(() => {
    if (!loading) setShowNewBanner(readCompleted(filter) && deck.length > 0);
  }, [filter, deck, loading]);

  // Reset done-state when filter changes
  const [filterKey, setFilterKey] = useState(0);
  const handleFilter = async (id: FilterId) => {
    if (id === 'emergency') {
      // Never just trust the client's own accountType for this decision --
      // canBrowseEmergency above is only the instant-UX shortcut (and the
      // chip is already hidden for ineligible tiers below), the real check
      // is this server round-trip, same as any other direct-entry attempt.
      const check = user?.id ? await emergencyApi.checkBrowseAccess(user.id) : { allowed: false };
      if (!check.allowed) { setShowEmergencyUpgrade(true); return; }
    }
    setFilter(id);
    setDeckDone(false);
    setNoNewListings(false);
    setFilterKey(k => k + 1);
  };

  // "Browse All Listings" from the caught-up screen is deliberate
  // marketplace exploration, not another attempt at the discovery queue --
  // it navigates to the existing marketplace grid (/search, which already
  // has its own filter/sort system), where a previously passed listing can
  // legitimately reappear. Opening one from there never touches `swipes` or
  // restores it to Home; Home's own exhausted-deck state is left exactly as
  // it was, so coming back here still shows the caught-up screen unless a
  // genuinely new listing has appeared since.
  const handleBrowseAll = () => navigate('/search');

  // Error-state retry -- just re-runs the fetch effect. Deliberately not
  // handleRefresh: that also clears the persisted swipe index and flips
  // deckDone/noNewListings, which is right for "check for new listings"
  // but wrong here since a fetch failure says nothing about the deck
  // actually being exhausted.
  const handleRetry = () => {
    setLoadError(false);
    setLoading(true);
    setRefreshKey(k => k + 1);
  };

  const handleRefresh = () => {
    clearPersistedSwipeIdx(filter);
    // Written synchronously here, not inside the landing effect below --
    // the showNewBanner effect also reacts to this same filter once loading
    // flips back to false, and it must see the fresh 'false' immediately
    // rather than racing the landing effect for who writes it first.
    writeCompleted(filter, false);
    setNoNewListings(false);
    setRefreshPending(true);
    setDeckDone(false);
    setLoading(true);
    setFilterKey(k => k + 1);
    setRefreshKey(k => k + 1);
  };

  // Lands once the refresh-triggered fetch finishes rebuilding `deck`
  // (which already excludes every already-swiped id) -- if anything made
  // it through, surface the count and drop straight into the deck; if
  // nothing did, go back to the caught-up screen with the no-new-listings
  // copy instead of falling through to the generic "Nothing here yet"
  // empty state, which is meant for a filter that never had any listings.
  useEffect(() => {
    if (!refreshPending || loading) return;
    setRefreshPending(false);
    if (deck.length > 0) {
      toast.success(`${deck.length} new listing${deck.length === 1 ? '' : 's'} available`);
    } else {
      writeCompleted(filter, true);
      setDeckDone(true);
      setNoNewListings(true);
    }
  }, [refreshPending, loading, deck.length, filter]);

  // "Start Swiping" on the new-opportunities interstitial -- explicit
  // opt-in rather than auto-resuming, since the previous session's
  // position has no meaning against a deck that, by construction, only
  // ever contains items not yet acted on.
  const handleStartSwiping = () => {
    clearPersistedSwipeIdx(filter);
    writeCompleted(filter, false);
    setShowNewBanner(false);
    setNoNewListings(false);
    setFilterKey(k => k + 1);
  };

  const scrollToFilters = () => filterRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const emptyState = filter === 'emergency' ? (
    <div className="flex flex-col items-center py-24 px-6 text-center">
      <span className="text-5xl mb-4">🚨</span>
      <p className="font-black text-gray-900 text-lg mb-1">No Emergency Listings right now</p>
      <p className="text-sm text-gray-400">Urgent opportunities will appear here when they become available.</p>
    </div>
  ) : (
    <div className="flex flex-col items-center py-24 px-6 text-center">
      <span className="text-5xl mb-4">🎬</span>
      <p className="font-black text-gray-900 text-lg mb-1">Nothing here yet</p>
      <p className="text-sm text-gray-400">Try a different filter or list your own gear.</p>
      <button
        onClick={() => navigate('/create-listing')}
        className="mt-5 bg-blue-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl active:opacity-80">
        + List your gear
      </button>
    </div>
  );

  // "You're all caught up" — deck exhausted for the current filter. Caught
  // up is tracked per-filter (deckDone/writeCompleted key off `filter`), so
  // this is naturally calculated separately per category -- exhausting one
  // never marks another as exhausted. When this follows a Refresh Listings
  // click that came up empty (noNewListings), the subtitle swaps to that
  // specific message instead of resetting back to the generic one -- same
  // screen, same three actions, per spec.
  const currentFilterLabel = FILTERS.find(f => f.id === filter)?.label ?? 'this category';
  const caughtUpScreen = (
    <div className="flex flex-col items-center py-16 px-6 text-center gap-1">
      <span className="text-5xl mb-3">🎉</span>
      <p className="font-black text-gray-900 text-lg">You're all caught up</p>
      <p className="text-sm text-gray-400 mb-5">
        {noNewListings
          ? 'No new listings available yet. Check back later or adjust your filters.'
          : `You've seen all available listings in ${currentFilterLabel} for now. Check back later for new opportunities.`}
      </p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <button
          onClick={handleBrowseAll}
          className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 text-white text-sm font-bold rounded-2xl active:opacity-80">
          <Compass className="w-4 h-4" /> Browse All Listings
        </button>
        <button
          onClick={handleRefresh}
          className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-2xl hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> Refresh Listings
        </button>
        <button
          onClick={scrollToFilters}
          className="w-full flex items-center justify-center gap-2 py-3 text-gray-500 text-sm font-semibold hover:text-gray-700">
          <SlidersHorizontal className="w-4 h-4" /> Change Filters
        </button>
      </div>
    </div>
  );

  // Shown instead of caughtUpScreen/emptyState once a limited tier
  // (Guest/Creator/Creator+) has gone through today's capped Opportunity
  // allowance -- "After the 5 visible opportunities, show an upgrade
  // card/message" (spec). "Not Now" needs no handler: staying here is
  // simply not tapping Upgrade Account.
  const opportunityLimitScreen = (
    <div className="flex flex-col items-center py-20 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
        <Lock className="w-7 h-7 text-indigo-600" />
      </div>
      <p className="font-black text-gray-900 text-lg mb-1">Unlock All Opportunities</p>
      <p className="text-sm text-gray-400 mb-5 max-w-xs">Upgrade to a Professional or Business account to access all available Opportunity listings.</p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <button
          onClick={() => {
            if (!user) { setPendingReturnUrl('/account/upgrade'); navigate('/login'); return; }
            navigate('/account/upgrade');
          }}
          className="w-full py-3 bg-indigo-600 text-white text-sm font-bold rounded-2xl active:opacity-80">
          Upgrade Account
        </button>
        <button onClick={() => setFilter('all')} className="w-full py-2.5 text-gray-500 text-sm font-semibold hover:text-gray-700">
          Not Now
        </button>
      </div>
    </div>
  );

  // Shown instead of caughtUpScreen when returning to a filter that was
  // already finished in an earlier session and new unseen items have since
  // appeared -- requires an explicit "Start Swiping" rather than silently
  // resuming, since there's no previous position that means anything
  // against a deck built only from items not yet acted on.
  const errorScreen = (
    <div className="flex flex-col items-center py-16 px-6 text-center gap-1">
      <span className="text-5xl mb-3">⚠️</span>
      <p className="font-black text-gray-900 text-lg">Couldn't load listings</p>
      <p className="text-sm text-gray-400 mb-5">Something went wrong loading your feed. Check your connection and try again.</p>
      <button
        onClick={handleRetry}
        className="w-full max-w-xs flex items-center justify-center gap-2 py-3 bg-gray-900 text-white text-sm font-bold rounded-2xl active:opacity-80">
        <RefreshCw className="w-4 h-4" /> Retry
      </button>
    </div>
  );

  const newOpportunitiesScreen = (
    <div className="flex flex-col items-center py-16 px-6 text-center gap-1">
      <span className="text-5xl mb-3">✨</span>
      <p className="font-black text-gray-900 text-lg">{deck.length} new opportunit{deck.length === 1 ? 'y' : 'ies'}</p>
      <p className="text-sm text-gray-400 mb-5">New projects have been added since you last browsed.</p>
      <button
        onClick={handleStartSwiping}
        className="w-full max-w-xs flex items-center justify-center gap-2 py-3 bg-blue-600 text-white text-sm font-bold rounded-2xl active:opacity-80">
        <PartyPopper className="w-4 h-4" /> Start Swiping
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 pb-24 lg:pb-16">

      {/* Temporary debug readout for the Opportunity daily-limit bug —
          remove once confirmed fixed on a real device. */}
      {filter === 'talent' && (
        <div className="bg-yellow-300 text-black text-[10px] font-mono px-2 py-1.5 leading-tight break-words">
          status:{oppDebug} | oppUnlimited:{String(oppUnlimited)} remaining:{oppSwipesRemaining} talentTotal:{talentTotalCount} listingsLen:{listings.length} deckLen:{deck.length} limitReached:{String(oppLimitReached)} deckDone:{String(deckDone)}
        </div>
      )}

      {/* ── Search bar — desktop gets DesktopTopBar's search instead, in the
           global top bar above every page, not just Home ── */}
      <div
        className="lg:hidden sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 lg:px-8"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: '10px' }}
      >
        <button
          onClick={() => navigate('/search')}
          className="w-full lg:max-w-xl flex items-center gap-2.5 bg-gray-100 rounded-2xl px-3.5 py-2.5 text-left hover:bg-gray-200 transition-colors active:scale-[0.99]">
          <Search className="w-4 h-4 text-blue-500 shrink-0"/>
          <span className="text-sm text-gray-400">Search creators, gear, services…</span>
        </button>
      </div>

      {/* ── Filter chips — Emergency tab only shown to Professional/
           Business (canBrowseEmergency is the client-side shortcut; the
           real access decision is still re-checked server-side in
           handleFilter, so a direct entry point can't bypass this by
           just being invisible here). ── */}
      <div ref={filterRowRef} className="flex gap-2 px-4 lg:px-8 py-3 overflow-x-auto no-scrollbar">
        {FILTERS.filter(f => f.id !== 'emergency' || canBrowseEmergency).map(f => (
          <button
            key={f.id}
            onClick={() => handleFilter(f.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 whitespace-nowrap ${
              filter === f.id
                ? f.id === 'emergency' ? 'bg-red-600 text-white shadow-sm' : 'bg-gray-900 text-white shadow-sm'
                : f.id === 'emergency' ? 'bg-red-50 text-red-600 border border-red-100 hover:border-red-200'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
            }`}>
            <f.icon className="w-3.5 h-3.5"/>
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Deck — same Tinder swipe mechanics on every breakpoint; desktop
           just gets a bigger card via SwipeStack's own lg: classes, plus
           the sidebar/top bar chrome that renders outside this page. ── */}
      <div className="mt-2 lg:mt-6 lg:px-8">
        {loading && showBrandLoader ? (
          <div className="py-24"><FilmonsBrandLoader size="lg"/></div>
        ) : loading ? (
          <SkeletonDeck/>
        // Explicit state ordering, each branch rendering its own UI rather
        // than falling through to a bare `return null` -- loading, then a
        // genuine fetch failure, then (deckDone checked before the plain
        // deck.length === 0 empty state, since a Refresh Listings click
        // that comes up with nothing new sets deckDone with an empty deck,
        // and that must still render the caught-up screen with its
        // no-new-listings copy, not the generic "Nothing here yet" state
        // meant for a filter that never had any listings at all) the
        // caught-up/empty/new-opportunities states, then the deck itself.
        ) : loadError ? errorScreen : deckDone
            ? ((filter === 'talent' && oppLimitReached) ? opportunityLimitScreen : caughtUpScreen)
            : deck.length === 0
            ? ((filter === 'talent' && oppLimitReached) ? opportunityLimitScreen : emptyState)
            : showNewBanner ? newOpportunitiesScreen : (
          <SwipeStack
            key={filterKey}
            items={deck}
            persistKey={filter}
            onDone={() => { setDeckDone(true); writeCompleted(filter, true); }}
            onSwipeListing={filter === 'talent' ? handleOpportunitySwipe : undefined}
          />
        )}
      </div>

      {/* ── Emergency category upgrade prompt — shown whenever a direct
           entry point (or the tab, before it's hidden) is attempted by an
           ineligible tier and the server confirms it's not allowed. Does
           not change the user's subscription; just links to the existing
           upgrade flow. ── */}
      {showEmergencyUpgrade && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowEmergencyUpgrade(false)}>
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center space-y-4" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
              <Zap className="w-7 h-7 text-red-500"/>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">Emergency Listings are available with Professional and Business accounts.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { setShowEmergencyUpgrade(false); navigate('/account/upgrade'); }}
                className="w-full py-3 bg-gray-900 text-white text-sm font-bold rounded-2xl active:opacity-80">
                View Upgrade Options
              </button>
              <button onClick={() => setShowEmergencyUpgrade(false)} className="w-full py-2.5 text-sm font-semibold text-gray-400">
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
