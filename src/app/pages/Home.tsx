/**
 * Filmons Home — Tinder-style discovery deck.
 * Users swipe through a mixed feed of listings, services, studios, and creator profiles.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Search, Sparkles, Package, Tag, Wrench, User, Building2, Briefcase, Compass, SlidersHorizontal, RefreshCw, PartyPopper } from 'lucide-react';
import { listingsApi } from '../lib/api';
import { boostApi } from '../lib/boostApi';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Listing } from '../types';
import { SwipeStack, clearPersistedSwipeIdx, type DeckItem, type CreatorProfile, type EnrichedListing } from '../components/SwipeStack';
import { swipeApi } from '../lib/swipeApi';

// ── Filter system ─────────────────────────────────────────────────────────────
type FilterId = 'all' | 'rentals' | 'sales' | 'services' | 'creators' | 'studios' | 'talent';

type LucideIcon = React.ComponentType<{ className?: string }>;
const FILTERS: { id: FilterId; label: string; icon: LucideIcon }[] = [
  { id: 'all',      label: 'All',      icon: Sparkles  },
  { id: 'rentals',  label: 'Rentals',  icon: Package   },
  { id: 'sales',    label: 'Sales',    icon: Tag       },
  { id: 'services', label: 'Services', icon: Wrench    },
  { id: 'creators', label: 'Creators', icon: User      },
  { id: 'studios',  label: 'Studios',  icon: Building2 },
  { id: 'talent',   label: 'Opportunity', icon: Briefcase },
];

function buildDeck(listings: EnrichedListing[], creators: CreatorProfile[], filter: FilterId): DeckItem[] {
  if (filter === 'creators') {
    return creators.map(c => ({ kind: 'creator', data: c }));
  }

  let filtered = [...listings];

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
    // Real Opportunity listings — listing_type === 'opportunity' is the
    // authoritative source of truth now; metadata.listingKind === 'talent'
    // (the earlier repurposed-kind marker) and the original keyword
    // heuristic are kept as fallbacks so older listings don't disappear.
    const talentListings = filtered.filter(l =>
      l.listingType === 'opportunity' ||
      l.listingKind === 'talent' ||
      /model|actor|actress|talent|ugc/i.test(l.title ?? '') ||
      /model|actor|actress|talent|ugc/i.test(l.serviceCategory ?? '')
    );
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

  const [listings,  setListings]  = useState<EnrichedListing[]>([]);
  const [creators,  setCreators]  = useState<CreatorProfile[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState<FilterId>('all');
  const [deckDone,  setDeckDone]  = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Whether this filter's queue was already finished in an earlier session
  // (per readCompleted) -- re-checked whenever the filter changes or fresh
  // data lands, so returning to an exhausted queue that now has new unseen
  // items shows "N new opportunities" instead of silently resuming (which
  // would otherwise also hit a stale, past-the-end persisted card index).
  const [showNewBanner, setShowNewBanner] = useState(false);
  const filterRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let done = false;
    Promise.all([
      listingsApi.getAll().catch(() => [] as Listing[]),
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
      // Already-left-swiped items are a permanent skip (Tinder-style) --
      // filtered out here, before buildDeck(), so every filter tab and any
      // reload excludes them consistently instead of just the current one.
      if (excluded.size) {
        l = l.filter(x => !excluded.has(x.id));
        c = c.filter(x => !excluded.has(x.id));
      }
      // getAll() already returns a blended order (organic recency + decayed
      // boost weight + jitter) — do NOT re-sort by createdAt here, that
      // would silently undo the blending and put boosted listings back to
      // a blunt recency-only order.
      let ordered: EnrichedListing[] = l;

      // Frequency control — once a viewer has already seen a boosted
      // listing's boosted-priority placement `frequency_cap_per_user` times
      // within the cooldown window, stop giving it a boost bonus for them
      // (demote to its plain position) rather than showing it every visit.
      const boostedIds = l.filter(x => x.boosted).map(x => x.id);
      if (user?.id && boostedIds.length) {
        try {
          const config = await boostApi.getConfig();
          const seen = await boostApi.getRecentlySeenBoosted(user.id, boostedIds, config.frequencyCooldownHours);
          const capped = new Set(Object.keys(seen).filter(id => seen[id] >= config.frequencyCapPerUser));
          if (capped.size) {
            const boosted = ordered.filter(x => capped.has(x.id));
            const rest = ordered.filter(x => !capped.has(x.id));
            // Interleave capped-out boosted listings back in as plain
            // organic entries rather than dropping them entirely.
            ordered = [...rest.slice(0, Math.ceil(rest.length / 2)), ...boosted, ...rest.slice(Math.ceil(rest.length / 2))];
          }
        } catch {}
      }

      setListings(ordered);
      setCreators(c);
      setLoading(false);
    });
    return () => { done = true; };
  }, [user?.id, refreshKey]);

  // Rebuild deck whenever filter or source data changes; reset deck state via key
  const deck = useMemo(() => buildDeck(listings, creators, filter), [listings, creators, filter]);

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
  const handleFilter = (id: FilterId) => {
    setFilter(id);
    setDeckDone(false);
    setFilterKey(k => k + 1);
  };

  // Distinct from a plain filter-chip click: this is a deliberate "let me
  // see them all again" action from the caught-up screen, so unlike
  // switching tabs (which should preserve each filter's own progress),
  // this explicitly clears the exhausted deck position. Without this the
  // remounted SwipeStack would still read its old, fully-advanced idx
  // from sessionStorage and render nothing at all -- not even the
  // caught-up screen -- since deckDone gets reset to false but the deck
  // itself was still sitting past its own end. Only the position resets;
  // the daily swipe-limit count is untouched (it's re-sourced from the
  // server/localStorage on every mount, never from this idx).
  const handleBrowseAll = () => {
    clearPersistedSwipeIdx('all');
    writeCompleted('all', false);
    handleFilter('all');
  };

  const handleRefresh = () => {
    clearPersistedSwipeIdx(filter);
    writeCompleted(filter, false);
    setDeckDone(false);
    setLoading(true);
    setFilterKey(k => k + 1);
    setRefreshKey(k => k + 1);
  };

  // "Start Swiping" on the new-opportunities interstitial -- explicit
  // opt-in rather than auto-resuming, since the previous session's
  // position has no meaning against a deck that, by construction, only
  // ever contains items not yet acted on.
  const handleStartSwiping = () => {
    clearPersistedSwipeIdx(filter);
    writeCompleted(filter, false);
    setShowNewBanner(false);
    setFilterKey(k => k + 1);
  };

  const scrollToFilters = () => filterRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const emptyState = (
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

  // "You're all caught up" — deck exhausted for the current filter.
  const caughtUpScreen = (
    <div className="flex flex-col items-center py-16 px-6 text-center gap-1">
      <span className="text-5xl mb-3">🎉</span>
      <p className="font-black text-gray-900 text-lg">You're all caught up</p>
      <p className="text-sm text-gray-400 mb-5">You've seen all available listings for now.</p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <button
          onClick={handleBrowseAll}
          className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 text-white text-sm font-bold rounded-2xl active:opacity-80">
          <Compass className="w-4 h-4" /> Browse All Listings
        </button>
        <button
          onClick={scrollToFilters}
          className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-2xl hover:bg-gray-50">
          <SlidersHorizontal className="w-4 h-4" /> Change Filters
        </button>
        <button
          onClick={handleRefresh}
          className="w-full flex items-center justify-center gap-2 py-3 text-gray-500 text-sm font-semibold hover:text-gray-700">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>
    </div>
  );

  // Shown instead of caughtUpScreen when returning to a filter that was
  // already finished in an earlier session and new unseen items have since
  // appeared -- requires an explicit "Start Swiping" rather than silently
  // resuming, since there's no previous position that means anything
  // against a deck built only from items not yet acted on.
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

      {/* ── Filter chips ── */}
      <div ref={filterRowRef} className="flex gap-2 px-4 lg:px-8 py-3 overflow-x-auto no-scrollbar">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => handleFilter(f.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 whitespace-nowrap ${
              filter === f.id
                ? 'bg-gray-900 text-white shadow-sm'
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
        {loading ? (
          <SkeletonDeck/>
        ) : deck.length === 0 ? emptyState : deckDone ? caughtUpScreen : showNewBanner ? newOpportunitiesScreen : (
          <SwipeStack
            key={filterKey}
            items={deck}
            persistKey={filter}
            onDone={() => { setDeckDone(true); writeCompleted(filter, true); }}
          />
        )}
      </div>

    </div>
  );
}
