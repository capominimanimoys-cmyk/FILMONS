/**
 * Filmons Home — Tinder-style discovery deck.
 * Users swipe through a mixed feed of listings, services, studios, and creator profiles.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Search, Sparkles, Package, Tag, Wrench, User, Building2, Briefcase, Compass, SlidersHorizontal, RefreshCw, PartyPopper, AlertTriangle, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { listingsApi, postsApi } from '../lib/api';
import { emergencyApi } from '../lib/emergencyApi';
import { normalizeTier } from '../lib/reliabilityApi';
import { supabase } from '../../lib/supabase';
import { filterOutLockedOpportunities } from '../lib/entitlements';
import { useAuth } from '../context/AuthContext';
import { Listing, Post } from '../types';
import { SwipeStack, clearPersistedSwipeIdx, type DeckItem, type CreatorProfile, type EnrichedListing } from '../components/SwipeStack';
import { swipeApi } from '../lib/swipeApi';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import { setPendingReturnUrl } from '../lib/authReturnUrl';
import { captureSnapshot } from '../lib/smartAnimate';
import { EmergencyPreviewGate } from '../components/EmergencyLockedState';
import { ListingCard } from '../components/ListingCard';
import { PostCard } from '../components/PostCard';

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

// ── Portfolio Feed filters ───────────────────────────────────────────────────
// There's no dedicated creative-category taxonomy on `posts` -- Photography/
// Film/Music/Design match against each post's own `tags` (best-effort,
// depends on creators actually tagging their work) with `postType` as a
// fallback signal for Film/Music specifically (video/audio posts). Nearby
// matches `location` text against the viewer's own profile city -- same
// honest, no-fake-geo-distance approach used elsewhere in this app (there's
// no lat/lng captured on posts or profiles to compute a real distance from).
type PortfolioFilterId = 'foryou' | 'following' | 'nearby' | 'photography' | 'film' | 'music' | 'design';
const PORTFOLIO_FILTERS: { id: PortfolioFilterId; label: string }[] = [
  { id: 'foryou',      label: 'For You' },
  { id: 'following',   label: 'Following' },
  { id: 'nearby',      label: 'Nearby' },
  { id: 'photography', label: 'Photography' },
  { id: 'film',        label: 'Film' },
  { id: 'music',       label: 'Music' },
  { id: 'design',      label: 'Design' },
];

// Real Opportunity listings — listing_type === 'opportunity' is the
// authoritative source of truth; metadata.listingKind === 'talent' (the
// earlier repurposed-kind marker) is kept as a fallback so older rows that
// predate listing_type don't disappear. The keyword heuristic that used to
// live here (title/serviceCategory containing "model"/"actor"/"talent"/
// "ugc") is deliberately gone -- it pulled ordinary gear listings into
// Opportunities any time their title happened to mention a camera "model"
// or similar, and simultaneously stripped them back out of Rental (see
// the exclusion below), which is exactly the category-contamination bug
// this was fixed for. Shared between buildDeck's 'talent' branch and
// Home()'s own count of how many real Opportunities exist (needed to tell
// "ran out because of the display cap" apart from "ran out because
// nothing else exists").
function isTalentListing(l: EnrichedListing): boolean {
  return l.listingType === 'opportunity' || l.listingKind === 'talent';
}

function isActiveEmergencyListing(l: EnrichedListing): boolean {
  return !!l.isEmergency && !!l.emergencyExpiresAt && new Date(l.emergencyExpiresAt) > new Date();
}

// Caps how many EMERGENCY-flagged items appear within one category's deck
// for a restricted tier (Guest/Creator/Creator+) -- non-emergency items in
// the same deck are completely untouched, and order is otherwise
// preserved. Emergency is a status on a listing, not its own category (see
// isTalentListing's comment for the earlier fix to a related category-
// contamination bug): an emergency rental stays in Rental, it just can't
// push more than `limit` emergency items into that one deck for a
// restricted tier. Professional/Business pass limit=Infinity.
function capEmergencyItems(listings: EnrichedListing[], limit: number): { visible: EnrichedListing[]; hiddenCount: number } {
  if (limit === Infinity) return { visible: listings, hiddenCount: 0 };
  let seen = 0, hiddenCount = 0;
  const visible = listings.filter(l => {
    if (!isActiveEmergencyListing(l)) return true;
    if (seen < limit) { seen++; return true; }
    hiddenCount++;
    return false;
  });
  return { visible, hiddenCount };
}

function buildDeck(
  listings: EnrichedListing[], creators: CreatorProfile[], filter: FilterId,
  emergencyLimit: number = Infinity,
): DeckItem[] {
  if (filter === 'creators') {
    return creators.map(c => ({ kind: 'creator', data: c }));
  }

  let filtered = [...listings];

  if (filter === 'emergency') {
    // `listings` here has already been through the fetch effect's swipe-
    // exclusion + Emergency recycling-exemption/cooldown logic (see the
    // isActiveEmergency block below) -- filtering it down to just active
    // Emergency listings reuses that same recycling behavior automatically
    // instead of re-implementing it for this category. This filter chip is
    // hidden entirely from Guest/Creator/Creator+ now (Emergency isn't its
    // own browsable category for them -- see the FILTERS render below), so
    // no emergencyLimit capping applies here; only Professional/Business
    // can ever reach this branch.
    filtered = filtered.filter(isActiveEmergencyListing);
    return filtered.map(l => ({ kind: 'listing' as const, data: l }));
  }

  if (filter === 'rentals') {
    filtered = filtered.filter(l => l.listingMode === 'rent' && l.listingType !== 'service' && !isTalentListing(l));
    filtered = capEmergencyItems(filtered, emergencyLimit).visible;
  } else if (filter === 'sales') {
    filtered = filtered.filter(l => l.listingMode === 'sale' && !isTalentListing(l));
    filtered = capEmergencyItems(filtered, emergencyLimit).visible;
  } else if (filter === 'services') {
    filtered = filtered.filter(l => l.listingType === 'service' && !isTalentListing(l));
    filtered = capEmergencyItems(filtered, emergencyLimit).visible;
  } else if (filter === 'studios') {
    filtered = filtered.filter(l =>
      !isTalentListing(l) && (
        (l.title?.toLowerCase() ?? '').includes('studio') ||
        (l.serviceCategory?.toLowerCase() ?? '').includes('studio')
      )
    );
    filtered = capEmergencyItems(filtered, emergencyLimit).visible;
  } else if (filter === 'talent') {
    // Every tier (Guest included) sees every real Opportunity listing here
    // -- no truncation. Viewing is unrestricted; only applying is limited,
    // enforced weekly at the point of applying (see ApplyModal.tsx).
    const talentListings = filtered.filter(isTalentListing);
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

  // Opportunity ("talent" filter) browsing: every tier (Guest included) can
  // view every real Opportunity listing in Home's deck, with no daily cap
  // -- viewing is unrestricted; only actually applying is limited, and
  // that's enforced weekly, server-side, at the point of applying (see
  // ApplyModal.tsx / OpportunityLimitUpgrade.tsx / _shared/entitlements.ts's
  // `applications` field). Listings must never disappear from this deck
  // because of an application limit.

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

  // ── Mobile-only Listings/Portfolio toggle ──────────────────────────────────
  // The toggle button itself only ever renders `lg:hidden` (see JSX below),
  // so desktop has no way to change this state at all -- it stays 'listings'
  // there permanently, which is what keeps the desktop layout completely
  // untouched by this feature without needing a second, duplicated render
  // path per breakpoint. Persisted to sessionStorage (not localStorage) --
  // "remember for this session" per spec; carrying the choice across
  // sessions entirely is a deliberate later step, not this one.
  const HOME_MODE_KEY = 'filmons_home_mode';
  const [homeMode, setHomeModeState] = useState<'listings' | 'portfolio'>(() => {
    try { return sessionStorage.getItem(HOME_MODE_KEY) === 'portfolio' ? 'portfolio' : 'listings'; } catch { return 'listings'; }
  });
  const setHomeMode = (m: 'listings' | 'portfolio') => {
    setHomeModeState(m);
    try { sessionStorage.setItem(HOME_MODE_KEY, m); } catch {}
  };

  const [feedTab, setFeedTab] = useState<PortfolioFilterId>('foryou');
  // Fetched once per session (feedFetchedRef), not on every toggle switch --
  // switching modes is local UI state from here on, never a refetch.
  const [allFeedPosts, setAllFeedPosts] = useState<Post[]>([]);
  const [followingPosts, setFollowingPosts] = useState<Post[] | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState(false);
  const feedFetchedRef = useRef(false);

  const loadFeed = useCallback(() => {
    setFeedLoading(true);
    setFeedError(false);
    postsApi.getAll(60, 0)
      .then(setAllFeedPosts)
      .catch(() => setFeedError(true))
      .finally(() => setFeedLoading(false));
  }, []);

  // First time Portfolio is opened this session -- not on every mode switch.
  useEffect(() => {
    if (homeMode !== 'portfolio' || feedFetchedRef.current) return;
    feedFetchedRef.current = true;
    loadFeed();
  }, [homeMode, loadFeed]);

  // Following posts are fetched lazily too -- only the first time that tab
  // is actually opened, not alongside the main feed fetch.
  useEffect(() => {
    if (feedTab !== 'following' || followingPosts !== null) return;
    postsApi.getFeedPosts(user?.following ?? []).then(setFollowingPosts).catch(() => setFollowingPosts([]));
  }, [feedTab, followingPosts, user?.following]);

  const displayedFeedPosts = useMemo(() => {
    if (feedTab === 'following') return followingPosts ?? [];
    let pool = allFeedPosts;
    const hasTag = (p: Post, ...needles: string[]) => (p.tags ?? []).some(t => needles.some(n => t.toLowerCase().includes(n)));
    switch (feedTab) {
      case 'nearby':
        pool = user?.city ? pool.filter(p => p.location?.toLowerCase().includes(user.city!.toLowerCase())) : [];
        break;
      case 'photography':
        pool = pool.filter(p => p.postType === 'photo' || hasTag(p, 'photo'));
        break;
      case 'film':
        pool = pool.filter(p => p.postType === 'video' || hasTag(p, 'film', 'video'));
        break;
      case 'music':
        pool = pool.filter(p => p.postType === 'audio' || hasTag(p, 'music', 'audio'));
        break;
      case 'design':
        pool = pool.filter(p => hasTag(p, 'design', 'graphic'));
        break;
    }
    return pool;
  }, [feedTab, allFeedPosts, followingPosts, user?.city]);


  useEffect(() => {
    let done = false;
    setLoadError(false);
    Promise.all([
      listingsApi.getAll(),
      // getAll() only ever returns the 80 most-recently-created listings
      // of ANY type -- a real Opportunity could be older than that cutoff
      // (rentals/sales/services are the higher-volume categories) and
      // never appear there at all, which is exactly why the Opportunity
      // filter could show "Nothing here yet" despite Opportunities
      // genuinely existing. Fetched and merged in unconditionally (not
      // just when filter === 'talent') so switching to that tab never
      // needs a second round-trip first.
      listingsApi.getOpportunities().catch(() => [] as Listing[]),
      supabase
        .from('profiles')
        .select('id, name, username, avatar_url, city, primary_role, bio, is_verified')
        .not('name', 'is', null)
        .neq('name', '')
        .not('primary_role', 'is', null)
        .limit(24)
        .then(r => (r.data ?? []) as CreatorProfile[], () => [] as CreatorProfile[]),
      user?.id ? swipeApi.getExcludedIds(user.id) : Promise.resolve(new Set<string>()),
    ]).then(async ([l0, opp, c, excluded]) => {
      if (done) return;
      // Dedupe by id -- an Opportunity that also happened to be within
      // getAll()'s 80-newest window would otherwise appear twice.
      const seenIds = new Set(l0.map(x => x.id));
      let l = [...l0, ...opp.filter(o => !seenIds.has(o.id))];

      // The two lookups below (opportunity owners' account tiers, and
      // which recycled-Emergency ids are on cooldown) each only depend on
      // this initial batch (`l`/`excluded`), not on each other -- they used
      // to run one after the other (await, then a second await), adding a
      // full extra round-trip of latency to every Home load on top of the
      // three already-parallel queries above. Computing both ID sets up
      // front and firing the lookups together cuts that back down to one.
      const isActiveEmergency = (x: EnrichedListing) =>
        !!x.isEmergency && !!x.emergencyExpiresAt && new Date(x.emergencyExpiresAt) > new Date();
      // Exclude Opportunity listings beyond their own host's tier
      // entitlement -- a locked listing (see filterOutLockedOpportunities)
      // stays visible on the host's own management view, but never in a
      // general discovery surface like this deck.
      const oppOwnerIds = [...new Set(l.filter(x => x.listingType === 'opportunity' || x.listingKind === 'talent').map(x => x.userId))];
      // Already-left-swiped items are a permanent skip (Tinder-style),
      // except active Emergency listings (paid feed-recycling is the whole
      // point) -- recycledIds is exactly that exception set, computed from
      // the SAME pre-filter `l`/`excluded` a locked-opportunity filter
      // wouldn't meaningfully change (Emergency listings aren't
      // Opportunities in this data model).
      const recycledIds = excluded.size ? l.filter(x => excluded.has(x.id) && isActiveEmergency(x)).map(x => x.id) : [];

      const [ownerRowsRes, recentlySeen] = await Promise.all([
        oppOwnerIds.length
          ? supabase.from('profiles').select('id, account_type').in('id', oppOwnerIds)
          : Promise.resolve({ data: [] as any[] }),
        // Spacing: a recycled Emergency listing shouldn't resurface too
        // soon after this viewer was already shown it this same way --
        // hold it back for a cooldown window rather than letting it cycle
        // back on literally every refresh.
        (user?.id && recycledIds.length)
          ? emergencyApi.getRecentlySeenEmergency(user.id, recycledIds, EMERGENCY_RECYCLE_COOLDOWN_HOURS).catch(() => ({} as Record<string, unknown>))
          : Promise.resolve({} as Record<string, unknown>),
      ]);

      if (oppOwnerIds.length) {
        const ownerAccountTypes = new Map((ownerRowsRes.data ?? []).map((r: any) => [r.id, r.account_type as string | undefined]));
        l = filterOutLockedOpportunities(l, ownerAccountTypes);
      }
      setRawListings(l);
      setRawCreators(c);
      if (excluded.size) {
        const onCooldown = new Set(Object.keys(recentlySeen));
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

  // Guest/Creator/Creator+ never see more than 2 emergency-flagged items
  // within any one category deck (Rental, Sales, Services, Studios) --
  // non-emergency items in that same deck are untouched. Professional/
  // Business are exempt (Infinity).
  const emergencyDisplayLimit = canBrowseEmergency ? Infinity : 2;

  // Rebuild deck whenever filter or source data changes; reset deck state via key
  const deck = useMemo(
    () => buildDeck(listings, creators, filter, emergencyDisplayLimit),
    [listings, creators, filter, emergencyDisplayLimit],
  );
  // rawDeck is deliberately never emergency-capped -- its only job is
  // telling "genuinely nothing exists" apart from "you've already seen/
  // swiped everything" (see the deckDone-promotion effect below).
  const rawDeck = useMemo(() => buildDeck(rawListings, rawCreators, filter), [rawListings, rawCreators, filter]);

  // How many emergency items got held back from the CURRENT filter's deck
  // -- computed independently of buildDeck (which only returns the deck
  // array, not a count) using the exact same category classification, so
  // the "see more emergency listings" screen only shows when there
  // genuinely were more. Categories/talent/creators/emergency itself
  // either don't apply emergency capping or already have their own
  // separate limit (Opportunities' 2-total cap already implies at most 2
  // emergency ones too), so this only matters for rentals/sales/services/
  // studios.
  const currentCategoryEmergencyHidden = useMemo(() => {
    if (canBrowseEmergency || !['rentals', 'sales', 'services', 'studios'].includes(filter)) return 0;
    let categoryFiltered: EnrichedListing[];
    if (filter === 'rentals') categoryFiltered = listings.filter(l => l.listingMode === 'rent' && l.listingType !== 'service' && !isTalentListing(l));
    else if (filter === 'sales') categoryFiltered = listings.filter(l => l.listingMode === 'sale' && !isTalentListing(l));
    else if (filter === 'services') categoryFiltered = listings.filter(l => l.listingType === 'service' && !isTalentListing(l));
    else categoryFiltered = listings.filter(l => !isTalentListing(l) && ((l.title?.toLowerCase() ?? '').includes('studio') || (l.serviceCategory?.toLowerCase() ?? '').includes('studio')));
    return capEmergencyItems(categoryFiltered, emergencyDisplayLimit).hiddenCount;
  }, [listings, filter, canBrowseEmergency, emergencyDisplayLimit]);

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
    // The category is always enterable now (guests included -- "do not
    // hide categories", see the guest-mode-limit/emergency-listing specs)
    // so the filter switches immediately regardless of tier; the render
    // below shows EmergencyPreviewGate (a 3-random-item preview + upgrade
    // gate, never the full deck) instead of the deck for anyone who
    // isn't Professional/Business. canBrowseEmergency is only the instant-
    // UX shortcut for THAT decision -- if the client thinks the account IS
    // eligible, still re-verify server-side (a stale cached account type
    // shouldn't silently grant access the server would refuse) and fall
    // back to the upgrade prompt if it disagrees.
    setFilter(id);
    if (id === 'emergency' && canBrowseEmergency) {
      const check = user?.id ? await emergencyApi.checkBrowseAccess(user.id) : { allowed: false };
      if (!check.allowed) setShowEmergencyUpgrade(true);
    }
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

  // Shown instead of caughtUpScreen/emptyState once a restricted tier
  // (Guest/Creator/Creator+) reaches the end of a category deck
  // (Rental/Sales/Services/Studios) that held back emergency-flagged
  // items past emergencyDisplayLimit (2) -- everything else in that
  // category was already shown normally, only the excess emergency ones
  // were capped.
  const categoryEmergencyLimitScreen = (
    <div className="flex flex-col items-center py-20 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle className="w-7 h-7 text-red-500" />
      </div>
      <p className="font-black text-gray-900 text-lg mb-1">See more emergency listings</p>
      <p className="text-sm text-gray-400 mb-5 max-w-xs">
        {user ? 'Upgrade to Professional or Business to access all emergency listings.'
              : 'Sign up or choose Professional or Business to access all emergency listings.'}
      </p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {!user && (
          <button
            onClick={() => { captureSnapshot(); navigate('/create-account'); }}
            className="w-full py-3 bg-red-600 text-white text-sm font-bold rounded-2xl active:opacity-80">
            Sign up
          </button>
        )}
        <button
          onClick={() => {
            if (!user) { setPendingReturnUrl('/account/upgrade?auto=professional'); navigate('/login'); return; }
            navigate('/account/upgrade?auto=professional');
          }}
          className={`w-full py-3 text-sm font-bold rounded-2xl active:opacity-80 ${user ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-700'}`}>
          {user ? 'Upgrade to Professional' : 'Explore Professional'}
        </button>
        <button
          onClick={() => {
            if (!user) { setPendingReturnUrl('/account/upgrade?auto=business'); navigate('/login'); return; }
            navigate('/account/upgrade?auto=business');
          }}
          className={`w-full py-3 text-sm font-bold rounded-2xl active:opacity-80 ${user ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-700'}`}>
          {user ? 'Upgrade to Business' : 'Explore Business'}
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
    // Fixed swipe interface below lg (mobile and tablet, where TopBar +
    // this page's own sticky search bar still render) -- height capped to
    // exactly the slice of viewport between the top nav and the bottom
    // nav, with overflow hidden here so the page itself never scrolls;
    // only the deck region below gets its own small bounded scroll. At lg+
    // (real desktop, sidebar layout, DesktopTopBar), this reverts entirely
    // to the original free-scrolling min-h-screen page -- desktop keeps
    // its previous behavior, only mobile/tablet get the bounded interface.
    <div className="h-[calc(100dvh-56px-54px-env(safe-area-inset-bottom))] md:h-[calc(100dvh-56px)] flex flex-col overflow-hidden bg-gray-100 lg:h-auto lg:min-h-screen lg:flex lg:flex-col lg:overflow-visible lg:pb-16">

      {/* ── Search bar — desktop gets DesktopTopBar's search instead, in the
           global top bar above every page, not just Home ── */}
      <div
        className="shrink-0 lg:hidden sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 lg:px-8"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: '10px' }}
      >
        <button
          onClick={() => navigate('/search')}
          className="w-full lg:max-w-xl flex items-center gap-2.5 bg-gray-100 rounded-2xl px-3.5 py-2.5 text-left hover:bg-gray-200 transition-colors active:scale-[0.99]">
          <Search className="w-4 h-4 text-blue-500 shrink-0"/>
          <span className="text-sm text-gray-400">Search creators, gear, services…</span>
        </button>
      </div>

      {/* ── Listings / Portfolio toggle — mobile only. Only renders below
           lg:, so desktop has no way to ever set homeMode to 'portfolio' --
           that's what keeps the desktop layout below completely untouched
           by this feature without a second, duplicated render path. */}
      <div className="lg:hidden shrink-0 px-4 pt-2 pb-1 bg-white">
        <div role="tablist" aria-label="Home mode" className="flex rounded-full p-1 gap-1">
          <button
            role="tab"
            aria-selected={homeMode === 'listings'}
            onClick={() => setHomeMode('listings')}
            className={`flex-1 py-2 text-sm font-bold rounded-full transition-colors duration-200 ${
              homeMode === 'listings' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700'
            }`}
          >
            Listings
          </button>
          <button
            role="tab"
            aria-selected={homeMode === 'portfolio'}
            onClick={() => setHomeMode('portfolio')}
            className={`flex-1 py-2 text-sm font-bold rounded-full transition-colors duration-200 ${
              homeMode === 'portfolio' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700'
            }`}
          >
            Portfolio
          </button>
        </div>
      </div>

      {/* ── Category row + deck — wrapped together so the branded loader
           covers BOTH for the entire real loading duration, not just a
           fixed window: while `loading` is true, neither the category
           chips nor any deck/empty/error state render at all, so there is
           nothing underneath the loader to flash through. Once loading
           resolves (success OR error), this swaps once to the real
           content — no intermediate skeleton, no predefined animation
           duration.
           Below lg, there's no scrolling here at all -- `flex-1 min-h-0`
           fills exactly the leftover height under the search bar; the
           fixed height on the ROOT element above (not overflow here) is
           what keeps the page from scrolling. Deliberately overflow-visible
           on this deck region itself -- it directly wraps the swipe card,
           and clipping it here cut off the card mid-swipe/exit animation.
           SwipeStack's own pull-to-reveal gesture (drag down on the card,
           spring back on release) is what surfaces the compact Like/See
           listing/Pass row, not scrolling. ── */}
      <div className="relative flex-1 min-h-0 overflow-visible lg:flex-none lg:min-h-[60vh] lg:h-auto">
        {/* Listings content -- kept MOUNTED (hidden via CSS, never removed
            from the tree) when Portfolio is active, not conditionally
            rendered. SwipeStack owns real state (current card index,
            already-passed/liked items, daily counters, locked-opportunity
            filtering) that a full unmount/remount would otherwise reset --
            hiding it instead means switching back to Listings resumes
            exactly where the user left off, with no refetch. Desktop can
            never actually reach the `hidden` branch (homeMode never leaves
            'listings' there), so this is a no-op change for desktop. */}
        <div className={loading || homeMode !== 'portfolio' ? 'block' : 'hidden'}>
          {loading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100">
              <FilmonsBrandLoader size="lg"/>
            </div>
          ) : (
            <div className="min-h-full flex flex-col">
              <p className="lg:hidden px-4 pt-1 pb-2 text-sm text-gray-500">
                Discover gear, services, creators and opportunities near you.
              </p>
              {/* ── Filter chips — the Emergency chip itself is now
                   Professional/Business only. Emergency isn't a separate
                   browsable category for Guest/Creator/Creator+ at all
                   (removed per spec) -- they still see emergency-flagged
                   listings, just inside each one's real category (Rental,
                   Services, ...) with an EMERGENCY badge on the card, capped
                   at emergencyDisplayLimit (2) per category. ── */}
              <div ref={filterRowRef} className="shrink-0 pop-in flex gap-2 px-4 lg:px-8 py-3 overflow-x-auto no-scrollbar">
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
                   the sidebar/top bar chrome that renders outside this page.
                   flex-1 + justify-center: when there's leftover height in the
                   bounded scroll region above, the card area centers vertically
                   instead of sitting flush under the chips with dead space below. ── */}
              <div className="flex-1 flex flex-col items-center justify-center mt-2 lg:mt-6 lg:px-8">
                {/* Explicit state ordering, each branch rendering its own UI
                    rather than falling through to a bare `return null` -- a
                    genuine fetch failure first, then (deckDone checked before
                    the plain deck.length === 0 empty state, since a Refresh
                    Listings click that comes up with nothing new sets deckDone
                    with an empty deck, and that must still render the
                    caught-up screen with its no-new-listings copy, not the
                    generic "Nothing here yet" state meant for a filter that
                    never had any listings at all) the caught-up/empty/new-
                    opportunities states, then the deck itself. */}
                {(filter === 'emergency' && !canBrowseEmergency && deck.length > 0) ? (
                  <EmergencyPreviewGate
                    items={deck.filter(d => d.kind === 'listing').map(d => d.data)}
                    renderCard={listing => <ListingCard key={listing.id} listing={listing} />}
                    isAuthenticated={!!user}
                  />
                )
                    : loadError ? errorScreen : deckDone
                    ? (currentCategoryEmergencyHidden > 0 ? categoryEmergencyLimitScreen : caughtUpScreen)
                    : deck.length === 0
                    ? (currentCategoryEmergencyHidden > 0 ? categoryEmergencyLimitScreen : emptyState)
                    : showNewBanner ? newOpportunitiesScreen : (
                  <SwipeStack
                    key={filterKey}
                    items={deck}
                    persistKey={filter}
                    onDone={() => { setDeckDone(true); writeCompleted(filter, true); }}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Portfolio Feed -- mobile only (`lg:hidden` unconditionally, on
            top of `homeMode` never reaching 'portfolio' on desktop in the
            first place). Also kept mounted-but-hidden rather than
            conditionally rendered once loading has resolved once, so its
            own scroll position survives switching to Listings and back. */}
        {!loading && (
          <div className={`lg:hidden ${homeMode === 'portfolio' ? 'block' : 'hidden'} min-h-full flex flex-col overflow-y-auto`}>
            <p className="px-4 pt-1 pb-2 text-sm text-gray-500">Discover what creators are making.</p>
            <div className="shrink-0 flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
              {PORTFOLIO_FILTERS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setFeedTab(t.id)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    feedTab === t.id ? 'bg-gray-900 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex-1 px-4 pb-6 space-y-4">
              {feedError ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <p className="text-sm text-gray-500">Couldn't load portfolio posts.</p>
                  <button onClick={loadFeed} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold">Try again</button>
                </div>
              ) : feedLoading ? (
                <div className="space-y-4">
                  {[0, 1].map(i => (
                    <div key={i} className="animate-pulse space-y-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-gray-200 shrink-0"/>
                        <div className="flex-1 space-y-1.5"><div className="h-3 w-24 bg-gray-200 rounded"/><div className="h-2.5 w-32 bg-gray-100 rounded"/></div>
                      </div>
                      <div className="w-full aspect-square bg-gray-200 rounded-2xl"/>
                      <div className="h-3 w-3/4 bg-gray-200 rounded"/>
                      <div className="h-2.5 w-full bg-gray-100 rounded"/>
                    </div>
                  ))}
                </div>
              ) : displayedFeedPosts.length === 0 ? (
                feedTab === 'following' ? (
                  <p className="text-center text-sm text-gray-400 py-16">Follow creators to see their work here.</p>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <p className="text-sm font-bold text-gray-700">Discover creators on Filmons</p>
                    <p className="text-xs text-gray-400 max-w-[220px]">Portfolio projects from creators will appear here.</p>
                    <button onClick={() => navigate('/search')} className="mt-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold">Explore Creators</button>
                  </div>
                )
              ) : (
                displayedFeedPosts.map(p => (
                  <div key={p.id} className="space-y-2">
                    <PostCard post={p}/>
                    <button
                      onClick={() => navigate(`/host/${p.userId}`)}
                      className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50 transition-colors"
                    >
                      View Portfolio
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
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
