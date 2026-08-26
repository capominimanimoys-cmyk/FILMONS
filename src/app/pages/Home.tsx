/**
 * Filmons Home — Tinder-style discovery deck.
 * Users swipe through a mixed feed of listings, services, studios, and creator profiles.
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Search, Sparkles, Package, Tag, Wrench, User, Building2, Briefcase } from 'lucide-react';
import { listingsApi } from '../lib/api';
import { boostApi } from '../lib/boostApi';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Listing } from '../types';
import { SwipeStack, type DeckItem, type CreatorProfile } from '../components/SwipeStack';
import { ListingCardStack } from '../components/ListingCardStack';
import { ListingCardProgress } from '../components/ListingCardProgress';
import { useListingCardNavigation } from '../lib/useListingCardNavigation';

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

function buildDeck(listings: Listing[], creators: CreatorProfile[], filter: FilterId): DeckItem[] {
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

// ── Page ──────────────────────────────────────────────────────────────────────
export function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [listings,  setListings]  = useState<Listing[]>([]);
  const [creators,  setCreators]  = useState<CreatorProfile[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState<FilterId>('all');
  const [deckDone,  setDeckDone]  = useState(false);

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
    ]).then(async ([l, c]) => {
      if (done) return;
      // getAll() already returns a blended order (organic recency + decayed
      // boost weight + jitter) — do NOT re-sort by createdAt here, that
      // would silently undo the blending and put boosted listings back to
      // a blunt recency-only order.
      let ordered = l;

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
  }, [user?.id]);

  // Rebuild deck whenever filter or source data changes; reset deck state via key
  const deck = useMemo(() => buildDeck(listings, creators, filter), [listings, creators, filter]);

  // Desktop-only (lg:) stacked-card navigation — independent of SwipeStack's
  // own idx state, since mobile keeps its swipe-to-like/pass gestures while
  // desktop is pure prev/next browsing over the same deck.
  const desktopNav = useListingCardNavigation(deck.length);

  // Reset done-state when filter changes
  const [filterKey, setFilterKey] = useState(0);
  const handleFilter = (id: FilterId) => {
    setFilter(id);
    setDeckDone(false);
    setFilterKey(k => k + 1);
    desktopNav.goTo(0);
  };

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

  return (
    <div className="min-h-screen bg-gray-100 pb-24 lg:pb-16">

      {/* ── Search bar ── */}
      <div
        className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 lg:px-8"
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
      <div className="flex gap-2 px-4 lg:px-8 py-3 overflow-x-auto no-scrollbar">
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

      {/* ── Deck — mobile/tablet: SwipeStack (swipe-to-like/pass), untouched ── */}
      <div className="mt-2 lg:hidden">
        {loading ? (
          <SkeletonDeck/>
        ) : deck.length === 0 ? emptyState : (
          <SwipeStack
            key={filterKey}
            items={deck}
            onDone={() => setDeckDone(true)}
          />
        )}
      </div>

      {/* ── After deck exhausted — restart nudge (mobile/tablet only) ── */}
      {deckDone && !loading && (
        <div className="px-4 mt-4 text-center lg:hidden">
          <button
            onClick={() => { setDeckDone(false); setFilterKey(k => k + 1); }}
            className="text-sm text-blue-600 font-semibold underline">
            See them again
          </button>
        </div>
      )}

      {/* ── Deck — desktop (lg:): stacked-card browsing, no like/pass semantics ── */}
      <div className="hidden lg:block mt-6 px-8">
        {loading ? (
          <div className="flex justify-center"><SkeletonDeck/></div>
        ) : deck.length === 0 ? emptyState : (
          <div className="flex flex-col items-center gap-5">
            <ListingCardStack
              items={deck}
              idx={desktopNav.idx}
              goNext={desktopNav.goNext}
              goPrev={desktopNav.goPrev}
              goTo={desktopNav.goTo}
              isFirst={desktopNav.isFirst}
              isLast={desktopNav.isLast}
            />
            <ListingCardProgress index={desktopNav.idx} total={deck.length} onJump={desktopNav.goTo} />
            <p className="text-xs text-gray-400">Use ← → or drag to browse · click a card to view details</p>
          </div>
        )}
      </div>

    </div>
  );
}
