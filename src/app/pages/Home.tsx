/**
 * Filmons Home — Tinder-style discovery deck.
 * Users swipe through a mixed feed of listings, services, studios, and creator profiles.
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Search, Sparkles, Package, Tag, Wrench, User, Building2, Star } from 'lucide-react';
import { listingsApi } from '../lib/api';
import { supabase } from '../../lib/supabase';
import { Listing } from '../types';
import { SwipeStack, type DeckItem, type CreatorProfile } from '../components/SwipeStack';

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
  { id: 'talent',   label: 'Talent',   icon: Star      },
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
    const talentListings = filtered.filter(l =>
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
    ]).then(([l, c]) => {
      if (done) return;
      // Sort listings newest-first
      const sorted = [...l].sort((a, b) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      setListings(sorted);
      setCreators(c);
      setLoading(false);
    });
    return () => { done = true; };
  }, []);

  // Rebuild deck whenever filter or source data changes; reset deck state via key
  const deck = useMemo(() => buildDeck(listings, creators, filter), [listings, creators, filter]);

  // Reset done-state when filter changes
  const [filterKey, setFilterKey] = useState(0);
  const handleFilter = (id: FilterId) => {
    setFilter(id);
    setDeckDone(false);
    setFilterKey(k => k + 1);
  };

  return (
    <div className="min-h-screen bg-gray-100 pb-24">

      {/* ── Search bar ── */}
      <div
        className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: '10px' }}
      >
        <button
          onClick={() => navigate('/search')}
          className="w-full flex items-center gap-2.5 bg-gray-100 rounded-2xl px-3.5 py-2.5 text-left hover:bg-gray-200 transition-colors active:scale-[0.99]">
          <Search className="w-4 h-4 text-blue-500 shrink-0"/>
          <span className="text-sm text-gray-400">Search creators, gear, services…</span>
        </button>
      </div>

      {/* ── Filter chips ── */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
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

      {/* ── Deck ── */}
      <div className="mt-2">
        {loading ? (
          <SkeletonDeck/>
        ) : deck.length === 0 ? (
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
        ) : (
          <SwipeStack
            key={filterKey}
            items={deck}
            onDone={() => setDeckDone(true)}
          />
        )}
      </div>

      {/* ── After deck exhausted — restart nudge ── */}
      {deckDone && !loading && (
        <div className="px-4 mt-4 text-center">
          <button
            onClick={() => { setDeckDone(false); setFilterKey(k => k + 1); }}
            className="text-sm text-blue-600 font-semibold underline">
            See them again
          </button>
          <span className="text-gray-300 mx-2">·</span>
          <button
            onClick={() => navigate('/marketplace')}
            className="text-sm text-blue-600 font-semibold underline">
            Browse marketplace
          </button>
        </div>
      )}

    </div>
  );
}
