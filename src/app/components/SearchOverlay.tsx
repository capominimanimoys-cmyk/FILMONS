/**
 * Filmons — Universal AI Search Overlay
 * Instant typeahead suggestions + ranked results + filter sheet + sort picker.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, X, ArrowLeft, MapPin, Loader2, ChevronRight,
  TrendingUp, Clock, SlidersHorizontal, ArrowUpDown, Lock, AlertTriangle,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { supabase } from '../../lib/supabase';
import {
  expandQuery, normalize, extractLocation, detectMarketplaceIntent, type MarketplaceIntentType,
  recognizeQuery, type SearchSource,
} from '../lib/searchUtils';
import { withModerationFilter, postsApi } from '../lib/api';
import { PostCard } from './PostCard';
import type { Post } from '../types';
import { useAuth } from '../context/AuthContext';
import { isProfessional } from '../lib/reliabilityApi';
import { getDisplayIdentity } from '../lib/displayIdentity';
import { getLockedOpportunityIds } from '../lib/entitlements';
import { setPendingReturnUrl } from '../lib/authReturnUrl';
import { EmergencyUpgradeModal } from './EmergencyLockedState';
import { saveSearchState, consumeSearchState } from '../lib/searchStatePersist';
import { searchHashtagSuggestions, getTopHashtags, type HashtagSuggestion, type Hashtag } from '../lib/hashtagsApi';
import { searchLocationSuggestions } from '../lib/locationsApi';
import { usePortfolioPreview } from '../context/PortfolioPreviewContext';
import { getCourses, type Course } from '../lib/coursesApi';
import { CourseCard } from './courses/CourseCard';
import {
  searchMatchingListings, searchMatchingCreators, searchMatchingPortfolio, searchMatchingPosts,
  searchListingsByIntent,
  isOpportunityListing, isStudioListing, isRentalListing, isSaleListing, isServiceListing,
  type SearchPortfolioRow, type SearchPostRow,
} from '../lib/filmSearch';
import { getSuggestedCreators, getPortfolioFeed, type SuggestedCreator, type PortfolioFeedEntry } from '../lib/portfolioApi';
import { getActivityFeed, getActivitySentence, type ActivityEntry } from '../lib/activityApi';
import { dismissSuggestion } from '../lib/connectionsApi';
import { SuggestedConnectionCard } from './connect/SuggestedConnectionCard';
import { PortfolioProjectCard } from './connect/PortfolioProjectCard';
import { PortfolioAlbumCard } from './connect/PortfolioAlbumCard';
import { UserAvatar } from './AccountTypeBadge';

// ── Types ─────────────────────────────────────────────────────────────────────
// Global-search categories -- deliberately separate from ListingTypeFilter
// below (the marketplace Filter Sheet's own "Type" facet). These drive
// which data source(s) the search bar itself fetches from; ListingTypeFilter
// stays exactly as it was, an orthogonal refinement layered on top of
// whatever the active category already fetched.
// Four top-level Filmons discovery modes -- All is a universal layer over
// the other three (never a fourth product of its own, per spec): Marketplace
// = Rental/Sale/Services/Studios/Opportunities/Emergency listings, Connect =
// Creators/Portfolio/Posts/Hashtags/Locations, Learning = Courses. The
// old one-tab-per-listing-category model (rental/sale/services/studios/
// opportunities/emergency each its own top-level tab) is gone -- those
// stay real classifications used internally to group results WITHIN
// Marketplace/Connect, just never their own tab anymore.
type TabId = 'all' | 'marketplace' | 'connect' | 'learning';
type SortBy = 'best_match' | 'newest' | 'price_asc' | 'price_desc';

// All Results' Connect section mixes 3 differently-shaped result types
// (a row-style creator card, a square portfolio thumbnail, a full-height
// PostCard) into one 2-column layout -- round-robin interleaved so a
// creator-heavy or post-heavy match set doesn't crowd the other types out
// of the first 6 shown.
type AllResultsConnectItem =
  | { kind: 'creator'; row: ProfileRow }
  | { kind: 'portfolio'; row: SearchPortfolioRow }
  | { kind: 'post'; post: Post };

function interleave3<A, B, C>(a: A[], b: B[], c: C[]): (A | B | C)[] {
  const out: (A | B | C)[] = [];
  const max = Math.max(a.length, b.length, c.length);
  for (let i = 0; i < max; i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
    if (i < c.length) out.push(c[i]);
  }
  return out;
}

interface ProfileRow {
  id: string; name: string; username: string | null; avatar_url: string | null;
  city: string | null; location: string | null; primary_role: string | null;
  business_industry?: string | null; account_type?: string | null;
  bio: string | null; is_verified: boolean | null;
  available_for_hire?: boolean | null;
  available_remotely?: boolean | null;
  available_to_travel?: boolean | null;
}
interface ListingRow {
  id: string; user_id?: string; title: string; description: string | null; price: number;
  city: string | null; province: string | null; images: string[] | null;
  listing_type: string; listing_mode: string | null;
  delivery_options?: string[] | null;
  payment_methods?: string[] | null;
  created_at?: string | null;
  is_active?: boolean | null;
  is_emergency?: boolean | null;
  emergency_expires_at?: string | null;
  /** Marketplace landing page's "Top listings" signal -- the same real,
   * non-fabricated promotion flag CategoryResults.tsx's own Top row uses
   * (see fetchTopMarketplaceListings there). Added to LISTING_SELECT
   * below since this file never previously selected it. */
  boosted?: boolean | null;
}

interface Suggestion {
  id: string; text: string; subtext?: string;
  icon: string; kind: 'listing' | 'creator' | 'service' | 'smart' | 'location' | 'location-real' | 'hashtag'; action: string;
}

// ── Filter state ───────────────────────────────────────────────────────────────
type ListingTypeFilter = 'all' | 'rental' | 'sale' | 'service' | 'creator' | 'studio' | 'opportunity';
type PriceRange = 'free' | 'under50' | '50to100' | '100to250' | '250plus';

interface SearchFilters {
  listingType: ListingTypeFilter;
  priceRange: PriceRange | null;
  deliveryAvailable: boolean;
  pickupOnly: boolean;
  availableForHire: boolean;
  availableRemotely: boolean;
  availableToTravel: boolean;
}

const DEFAULT_FILTERS: SearchFilters = {
  listingType: 'all',
  priceRange: null,
  deliveryAvailable: false,
  pickupOnly: false,
  availableForHire: false,
  availableRemotely: false,
  availableToTravel: false,
};

function countActiveFilters(f: SearchFilters): number {
  return [
    f.listingType !== 'all',
    f.priceRange !== null,
    f.deliveryAvailable,
    f.pickupOnly,
    f.availableForHire,
    f.availableRemotely,
    f.availableToTravel,
  ].filter(Boolean).length;
}

const TYPE_LABELS: Record<ListingTypeFilter, string> = {
  all: 'All', rental: 'Rental', sale: 'Sale', service: 'Service', creator: 'Creator', studio: 'Studios', opportunity: 'Opportunity',
};
const PRICE_LABELS: Record<PriceRange, string> = {
  free: 'Free', under50: 'Under $50', '50to100': '$50–$100', '100to250': '$100–$250', '250plus': '$250+',
};
const SORT_LABELS: Record<SortBy, string> = {
  best_match: 'Best Match', newest: 'Newest', price_asc: 'Price ↑', price_desc: 'Price ↓',
};

// ── Client-side filter + sort ──────────────────────────────────────────────────
function applyFilters(
  rawListings: ListingRow[],
  rawUsers: ProfileRow[],
  filters: SearchFilters,
  sort: SortBy,
): { listings: ListingRow[]; users: ProfileRow[] } {
  let listings = [...rawListings];
  let users    = [...rawUsers];

  // 'creator' has no matching listing at all -- it's a profile-type facet,
  // not a listing one, added here for the first time alongside the
  // existing listing types. Users stay unaffected by this switch (already
  // narrowed independently by the Creator Options toggles below), so
  // selecting Creator here shows every creator and zero listings.
  if (filters.listingType === 'creator') {
    listings = [];
  } else if (filters.listingType !== 'all') {
    listings = listings.filter(l => {
      switch (filters.listingType) {
        case 'rental':      return isRentalListing(l);
        case 'sale':        return isSaleListing(l);
        case 'service':     return isServiceListing(l);
        case 'opportunity': return isOpportunityListing(l);
        case 'studio':      return isStudioListing(l);
        default: return true;
      }
    });
  }

  if (filters.priceRange) {
    listings = listings.filter(l => {
      const p = l.price;
      switch (filters.priceRange) {
        case 'free':      return p === 0;
        case 'under50':   return p < 50;
        case '50to100':   return p >= 50 && p <= 100;
        case '100to250':  return p > 100 && p <= 250;
        case '250plus':   return p > 250;
        default: return true;
      }
    });
  }

  if (filters.deliveryAvailable) {
    listings = listings.filter(l => l.delivery_options?.includes('delivery'));
  }
  if (filters.pickupOnly) {
    listings = listings.filter(l => l.delivery_options?.includes('pickup'));
  }

  if (filters.availableForHire)   users = users.filter(u => u.available_for_hire === true);
  if (filters.availableRemotely)  users = users.filter(u => u.available_remotely === true);
  if (filters.availableToTravel)  users = users.filter(u => u.available_to_travel === true);

  switch (sort) {
    case 'newest':
      listings.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
      break;
    case 'price_asc':  listings.sort((a, b) => a.price - b.price); break;
    case 'price_desc': listings.sort((a, b) => b.price - a.price); break;
  }

  return { listings, users };
}

// ── Smart suggestion templates ─────────────────────────────────────────────────
interface SmartTemplate { matches: string[]; phrases: { text: string; subtext: string; icon: string }[]; }

const SMART_TEMPLATES: SmartTemplate[] = [
  { matches: ['dji','drone','fpv','mavic','aerial'], phrases: [
    { text:'DJI Drone Rental', subtext:'Rental', icon:'🚁' },
    { text:'DJI RS4 Gimbal', subtext:'Rental', icon:'🎬' },
    { text:'DJI Mavic 4 Pro', subtext:'Rental', icon:'🚁' },
    { text:'Drone Services', subtext:'Service', icon:'🚁' },
    { text:'DJI Operator Vancouver', subtext:'Service', icon:'🚁' },
    { text:'Aerial Filming', subtext:'Service', icon:'🚁' },
  ]},
  { matches: ['gimbal','stabilizer','ronin','zhiyun'], phrases: [
    { text:'Gimbal Rental', subtext:'Rental', icon:'🎬' },
    { text:'DJI RS4 Gimbal', subtext:'Rental', icon:'🎬' },
    { text:'Zhiyun Weebill S', subtext:'Rental', icon:'🎬' },
  ]},
  { matches: ['camera','dslr','mirrorless'], phrases: [
    { text:'Camera Rental', subtext:'Rental', icon:'📷' },
    { text:'Camera for Sale', subtext:'For Sale', icon:'📷' },
    { text:'Cinema Camera Rental', subtext:'Rental', icon:'🎬' },
    { text:'Camera Operator', subtext:'Service', icon:'🎬' },
  ]},
  { matches: ['sony','fx3','fx6','a7siii','a7s'], phrases: [
    { text:'Sony FX3 Rental', subtext:'Rental', icon:'📷' },
    { text:'Sony FX6 Rental', subtext:'Rental', icon:'📷' },
    { text:'Sony A7S III', subtext:'Rental', icon:'📷' },
    { text:'Sony Camera for Sale', subtext:'For Sale', icon:'📷' },
  ]},
  { matches: ['canon','eos','c70','c300','r5'], phrases: [
    { text:'Canon C70 Rental', subtext:'Rental', icon:'📷' },
    { text:'Canon EOS R5 Rental', subtext:'Rental', icon:'📷' },
    { text:'Canon Cinema Camera', subtext:'Rental', icon:'🎬' },
  ]},
  { matches: ['blackmagic','bmpcc','ursa','braw'], phrases: [
    { text:'Blackmagic Pocket Cinema 6K', subtext:'Rental', icon:'🎬' },
    { text:'BMPCC 6K Rental', subtext:'Rental', icon:'🎬' },
    { text:'Blackmagic URSA Mini', subtext:'Rental', icon:'🎬' },
  ]},
  { matches: ['arri','alexa'], phrases: [
    { text:'Arri Alexa Mini LF', subtext:'Rental', icon:'🎬' },
    { text:'Arri Rental', subtext:'Rental', icon:'🎬' },
  ]},
  { matches: ['lens','lenses','prime','anamorphic','sigma','zeiss'], phrases: [
    { text:'Lens Rental', subtext:'Rental', icon:'🔭' },
    { text:'Anamorphic Lens Rental', subtext:'Rental', icon:'🔭' },
    { text:'Prime Lens Set', subtext:'Rental', icon:'🔭' },
    { text:'Sigma Cine Lens', subtext:'Rental', icon:'🔭' },
  ]},
  { matches: ['light','lighting','aputure','godox','led','strobe'], phrases: [
    { text:'Lighting Kit Rental', subtext:'Rental', icon:'💡' },
    { text:'Aputure 600d Rental', subtext:'Rental', icon:'💡' },
    { text:'LED Panel Rental', subtext:'Rental', icon:'💡' },
    { text:'Studio Lighting Setup', subtext:'Service', icon:'💡' },
  ]},
  { matches: ['audio','mic','microphone','rode','sennheiser','boom','recorder'], phrases: [
    { text:'Microphone Rental', subtext:'Rental', icon:'🎤' },
    { text:'Rode NTG5 Rental', subtext:'Rental', icon:'🎤' },
    { text:'Audio Engineer for Hire', subtext:'Service', icon:'🎤' },
    { text:'Boom Operator', subtext:'Service', icon:'🎤' },
  ]},
  { matches: ['podcast','podcasting'], phrases: [
    { text:'Podcast Studio Rental', subtext:'Rental', icon:'🎙️' },
    { text:'Podcast Setup', subtext:'Rental', icon:'🎙️' },
    { text:'Podcast Producer', subtext:'Service', icon:'🎙️' },
    { text:'Podcast Recording', subtext:'Service', icon:'🎙️' },
  ]},
  { matches: ['studio','soundstage','greenscreen'], phrases: [
    { text:'Photography Studio Rental', subtext:'Rental', icon:'🏢' },
    { text:'Film Studio Rental', subtext:'Rental', icon:'🏢' },
    { text:'Green Screen Studio', subtext:'Rental', icon:'🏢' },
    { text:'Production Studio', subtext:'Rental', icon:'🏢' },
  ]},
  { matches: ['video','videographer','videography','filmmaker','cinematographer','dp','dop'], phrases: [
    { text:'Videographer for Hire', subtext:'Service', icon:'🎬' },
    { text:'Wedding Videographer', subtext:'Service', icon:'🎬' },
    { text:'Corporate Videographer', subtext:'Service', icon:'🎬' },
    { text:'Cinematographer', subtext:'Service', icon:'🎬' },
  ]},
  { matches: ['photo','photography','photographer','photoshoot','portrait'], phrases: [
    { text:'Photographer for Hire', subtext:'Service', icon:'📸' },
    { text:'Wedding Photographer', subtext:'Service', icon:'📸' },
    { text:'Portrait Photography', subtext:'Service', icon:'📸' },
    { text:'Product Photography', subtext:'Service', icon:'📸' },
  ]},
  { matches: ['editor','editing','colorist','colorgrade','davinci','premiere'], phrases: [
    { text:'Video Editor for Hire', subtext:'Service', icon:'✂️' },
    { text:'Color Grading', subtext:'Service', icon:'✂️' },
    { text:'Post Production', subtext:'Service', icon:'✂️' },
    { text:'Motion Graphics', subtext:'Service', icon:'✂️' },
  ]},
  { matches: ['music','producer','beat','beats','ableton','mixing','mastering'], phrases: [
    { text:'Music Producer for Hire', subtext:'Service', icon:'🎵' },
    { text:'Recording Studio Rental', subtext:'Rental', icon:'🎵' },
    { text:'Beat Production', subtext:'Service', icon:'🎵' },
    { text:'Mixing & Mastering', subtext:'Service', icon:'🎵' },
  ]},
  { matches: ['stream','streaming','broadcast','elgato','obs'], phrases: [
    { text:'Live Streaming Setup', subtext:'Service', icon:'📡' },
    { text:'Streaming Equipment', subtext:'Rental', icon:'📡' },
    { text:'Broadcast Camera', subtext:'Rental', icon:'📡' },
  ]},
  { matches: ['grip','tripod','slider','dolly','rig'], phrases: [
    { text:'Camera Rig Rental', subtext:'Rental', icon:'🎬' },
    { text:'Slider Rental', subtext:'Rental', icon:'🎬' },
    { text:'Tripod Rental', subtext:'Rental', icon:'🎬' },
    { text:'Grip Package', subtext:'Rental', icon:'🎬' },
  ]},
  { matches: ['wedding','event','corporate'], phrases: [
    { text:'Wedding Videographer', subtext:'Service', icon:'💍' },
    { text:'Wedding Photographer', subtext:'Service', icon:'💍' },
    { text:'Event Coverage', subtext:'Service', icon:'🎉' },
    { text:'Corporate Video Production', subtext:'Service', icon:'🏢' },
  ]},
  { matches: ['vfx','visualeffects','animation','3d','cgi'], phrases: [
    { text:'VFX Artist for Hire', subtext:'Service', icon:'✨' },
    { text:'3D Animation', subtext:'Service', icon:'✨' },
    { text:'Motion Graphics', subtext:'Service', icon:'✨' },
  ]},
  { matches: ['model','talent','actor','actress','ugc'], phrases: [
    { text:'Model for Hire', subtext:'Service', icon:'🎭' },
    { text:'UGC Creator', subtext:'Service', icon:'🎭' },
    { text:'Actor / Talent', subtext:'Service', icon:'🎭' },
  ]},
];

function generateSmartSuggestions(rawQ: string): Suggestion[] {
  if (!rawQ.trim()) return [];
  const expanded = new Set(expandQuery(rawQ));
  const ql = normalize(rawQ);
  const results: Suggestion[] = [];
  const seen = new Set<string>();

  for (const { matches, phrases } of SMART_TEMPLATES) {
    if (matches.some(m => expanded.has(m))) {
      for (const p of phrases) {
        if (!seen.has(p.text)) {
          seen.add(p.text);
          results.push({ id:`smart-${p.text}`, text:p.text, subtext:p.subtext, icon:p.icon, kind:'smart', action:p.text });
        }
      }
    }
  }

  const loc = extractLocation(rawQ);
  if (loc?.city) {
    const city = loc.city;
    const locs: [string, string, string][] = [
      [`Creators in ${city}`, 'People', '👥'],
      [`${city} Studio Rental`, 'Rental', '🏢'],
      [`${city} Videographer`, 'Service', '🎬'],
      [`${city} Photographer`, 'Service', '📸'],
    ];
    for (const [text, subtext, icon] of locs) {
      if (!seen.has(text)) { seen.add(text); results.push({ id:`loc-${text}`, text, subtext, icon, kind:'location', action:text }); }
    }
  }

  if (ql.includes('near me') || ql.includes('nearby')) {
    if (!seen.has('Services Near Me')) {
      results.push({ id:'nearme-1', text:'Services Near Me', subtext:'Location', icon:'📍', kind:'location', action:'services near me' });
      results.push({ id:'nearme-2', text:'Rentals Near Me', subtext:'Location', icon:'📍', kind:'location', action:'rentals near me' });
    }
  }

  return results.slice(0, 6);
}

async function fetchSuggestions(rawQ: string): Promise<Suggestion[]> {
  const q = rawQ.trim();
  if (q.length < 1) return [];
  const ql = normalize(q).replace(/[%_\\,]/g, '');

  const [lRes, uRes, hashtags, locations] = await Promise.all([
    supabase.from('listings').select('id, title, listing_type, listing_mode')
      .ilike('title', `${ql}%`).limit(5),
    supabase.from('profiles').select('id, name, username, primary_role')
      .or(`name.ilike.${ql}%,username.ilike.${ql}%`)
      .not('name','is',null).neq('name','').limit(3),
    // Both "filmmaking" and "#filmmaking" find #filmmaking -- searchHashtagSuggestions
    // strips a leading '#' before matching. Shown first in the list, per spec.
    searchHashtagSuggestions(rawQ, 4),
    // Real, DB-backed location matches (distinct from the cosmetic
    // "${city} Videographer" canned phrases generateSmartSuggestions
    // produces below) -- tapping one opens the dedicated /search/location
    // page directly, per the Browse/Search spec's "Locations" suggestion
    // group.
    searchLocationSuggestions(rawQ, 3),
  ]);

  const results: Suggestion[] = [];
  const seen = new Set<string>();

  for (const l of locations) {
    results.push({
      id: `location-${l.key}`, text: l.displayName,
      subtext: l.mentionCount > 0 ? `${l.mentionCount} result${l.mentionCount === 1 ? '' : 's'}` : undefined,
      icon: '📍', kind: 'location-real', action: l.key,
    });
  }
  for (const h of hashtags) {
    results.push({
      id: `hashtag-${h.tag}`, text: `#${h.tag}`,
      subtext: h.usageCount > 0 ? `${h.usageCount} post${h.usageCount === 1 ? '' : 's'}` : undefined,
      icon: '#', kind: 'hashtag', action: h.tag,
    });
  }
  for (const l of (lRes.data ?? [])) {
    if (!l.title || seen.has(l.title)) continue;
    seen.add(l.title);
    results.push({
      id:`db-l-${l.id}`, text:l.title,
      subtext: l.listing_type === 'service' ? 'Service' : l.listing_mode === 'rent' ? 'Rental' : 'For Sale',
      icon: l.listing_type === 'service' ? '🛠️' : '📦',
      kind: l.listing_type === 'service' ? 'service' : 'listing',
      action: l.title,
    });
  }
  for (const u of (uRes.data ?? [])) {
    if (!u.name || seen.has(u.name)) continue;
    seen.add(u.name);
    results.push({ id:`db-u-${u.id}`, text:u.name, subtext:getDisplayIdentity({ accountType: u.account_type, primaryRole: u.primary_role, businessIndustry: u.business_industry })||'Creator', icon:'👤', kind:'creator', action:u.name });
  }
  for (const s of generateSmartSuggestions(rawQ)) {
    if (!seen.has(s.text)) { seen.add(s.text); results.push(s); }
  }
  return results.slice(0, 8);
}

// ── Universal search ───────────────────────────────────────────────────────────
// Columns confirmed to exist in DB (matches api.ts getAll select — no province)
const LISTING_SELECT  = 'id, user_id, title, description, price, city, listing_type, listing_mode, service_category, tags, images, created_at, is_active, is_emergency, emergency_expires_at, boosted';
const PROFILE_SELECT  = 'id, name, username, avatar_url, city, location, primary_role, business_industry, account_type, bio, is_verified';

// ── Category classification + core matching ──────────────────────────────────
// Both now live in filmSearch.ts, imported below -- shared with
// CategoryResults.tsx so /search and /search/category/all can never
// disagree again about what matches a query or which category a listing
// belongs to (this used to be a second, independently-written copy of both).

// Delegates entirely to filmSearch.ts's searchMatchingListings/
// searchMatchingCreators -- see that module's header comment. This used to
// have its own copy of the term-expansion + per-term-query + dedup logic;
// CategoryResults.tsx had a second, different copy for /search/category/all,
// and the two could (and did) disagree about which listings matched a given
// query. One implementation now, called from both places.
async function searchAll(rawQ: string): Promise<{ users: ProfileRow[]; listings: ListingRow[] }> {
  const q = rawQ.trim();
  if (!q) return { users: [], listings: [] };

  // Marketplace intent (Rental/Sale/Service/Opportunity) means "show me
  // listings of THIS type", not "find listings whose title literally
  // contains the intent word" -- searchListingsByIntent returns every
  // eligible listing of the detected type(s) directly (optionally
  // relevance-scoped by whatever's left of the query after stripping the
  // intent words, e.g. "camera" from "camera rental"), never requiring
  // the literal intent word to appear in a listing's own text. More than
  // one intent can fire at once ("rental or sale camera") -- results are
  // unioned, deduped by id.
  const { intents, remainder } = detectMarketplaceIntent(rawQ);
  const hasIntent = intents.length > 0;
  const [rawListingResults, users] = await Promise.all([
    hasIntent
      ? Promise.all(intents.map(t => searchListingsByIntent(t, remainder))).then(sets => sets.flat())
      : searchMatchingListings(rawQ),
    searchMatchingCreators(hasIntent ? remainder : rawQ),
  ]);
  const seen = new Set<string>();
  const listings = rawListingResults.filter(l => {
    if (!l?.id || seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });

  console.log(`[Search] "${q}" → ${listings.length} listings | ${users.length} profiles`);
  return { users: users as ProfileRow[], listings: listings as unknown as ListingRow[] };
}

// ── Category browse (no query typed yet) ─────────────────────────────────────
// Tapping a top-level mode before typing anything must show that mode's
// content immediately (spec) -- searchAll/runSearch only ever fire on a
// non-empty query, so this is a separate, simpler DB-level fetch per mode:
// newest-first, is_active/published only, no text matching at all. Each
// mode fetches everything it needs in one shot; render-time classifiers
// (isRentalListing etc.) still do the fine-grained grouping within it.
async function fetchCategoryBrowse(category: TabId): Promise<{ users: ProfileRow[]; listings: ListingRow[]; courses: Course[] }> {
  if (category === 'all') return { users: [], listings: [], courses: [] };

  if (category === 'learning') {
    const courses = await getCourses({ limit: 24 }).catch(() => []);
    return { users: [], listings: [], courses };
  }

  if (category === 'connect') {
    // Creators only -- Services/Opportunities are Marketplace's.
    // Business accounts may have no primary_role at all (identified by
    // business_industry instead, per spec) -- requiring primary_role alone
    // would silently exclude them from Browse Connect entirely.
    const res = await supabase.from('profiles').select(PROFILE_SELECT)
      .not('name', 'is', null).neq('name', '')
      .or('primary_role.not.is.null,business_industry.not.is.null')
      .order('created_at', { ascending: false }).limit(24);
    if (res.error) console.error('[Search] browse connect creators error:', res.error.message);
    return { users: (res.data ?? []) as ProfileRow[], listings: [], courses: [] };
  }

  // marketplace -- every listing (Rental/Sale/Services/Studios/
  // Opportunities/Emergency); render-time classifiers (isRentalListing/
  // isSaleListing/isServiceListing/isOpportunityListing/isStudioListing/
  // emergency flag) group this single fetch into its sections, same as the
  // typed-search path.
  const res = await withModerationFilter((filterActive) => {
    let query = supabase.from('listings').select(LISTING_SELECT).eq('is_active', true);
    if (filterActive) query = query.eq('moderation_status', 'active');
    return query.order('created_at', { ascending: false }).limit(40);
  });
  if (res.error) console.error('[Search] browse marketplace error:', res.error.message);
  return { users: [], listings: (res.data ?? []) as ListingRow[], courses: [] };
}

// ── Trending + pre-search ──────────────────────────────────────────────────────
const FALLBACK_TRENDING = ['Sony FX3', 'DJI Drone', 'Aputure 600d', 'DP for hire', 'Vancouver Studio', 'Podcast Setup'];
const TITLE_STOP_WORDS  = new Set(['the','a','an','and','or','for','with','in','on','at','to','of','by','from','this','that','is','are','was','be','my','your','our','kit','package','pro','new','used','high','low','great','good','best','full','top','sale','rent','hire','need','want','looking','available','professional','quality']);

async function fetchTrendingKeywords(): Promise<string[]> {
  try {
    const { data } = await supabase.from('listings').select('title').not('title','is',null).order('created_at',{ascending:false}).limit(120);
    if (!data || data.length < 3) return FALLBACK_TRENDING;
    const counts = new Map<string, number>();
    for (const { title } of data) {
      const words = normalize(String(title)).replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w => w.length >= 3 && !TITLE_STOP_WORDS.has(w));
      for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
    }
    const top = Array.from(counts.entries()).sort((a,b) => b[1]-a[1]).slice(0,8).map(([w]) => w.charAt(0).toUpperCase()+w.slice(1));
    return top.length >= 3 ? top : FALLBACK_TRENDING;
  } catch { return FALLBACK_TRENDING; }
}

const CATEGORY_CHIPS = [
  { emoji:'🎬', label:'Filmmakers'  }, { emoji:'📸', label:'Photographers' },
  { emoji:'🎤', label:'Audio'       }, { emoji:'🎭', label:'Models'         },
  { emoji:'✂️', label:'Editors'     }, { emoji:'💡', label:'Lighting'       },
  { emoji:'🚁', label:'Drones'      }, { emoji:'🏢', label:'Studios'        },
  { emoji:'🎵', label:'Music'       }, { emoji:'🎮', label:'Gaming'         },
  { emoji:'🛒', label:'Gear'        }, { emoji:'🛠️', label:'Services'       },
];

const TABS: { id: TabId; label: string }[] = [
  { id:'all',         label:'All'         },
  { id:'marketplace', label:'Marketplace' },
  { id:'connect',     label:'Connect'     },
  { id:'learning',    label:'Learning'    },
];

// ── Typed category keyword recognition (Enter/Search submit only) ────────────
// "rental", "opportunity", "course", etc. typed as the first word and
// submitted with Enter jumps straight to that word's top-level mode --
// separate from tapping a tab, which already covers the no-keyword case.
// Singular and plural both recognized, case-insensitively, matched only
// against the FIRST word so a category name appearing later in an ordinary
// search phrase is never misread as this.
const CATEGORY_KEYWORDS: Record<string, TabId> = {
  rental: 'marketplace', rentals: 'marketplace', rent: 'marketplace', renting: 'marketplace',
  sale: 'marketplace', sales: 'marketplace', buy: 'marketplace', buying: 'marketplace', purchase: 'marketplace', used: 'marketplace',
  studio: 'marketplace', studios: 'marketplace',
  emergency: 'marketplace',
  service: 'marketplace', services: 'marketplace', freelancer: 'marketplace', freelancers: 'marketplace',
  opportunity: 'marketplace', opportunities: 'marketplace',
  job: 'marketplace', jobs: 'marketplace', work: 'marketplace', works: 'marketplace',
  creator: 'connect', creators: 'connect',
  course: 'learning', courses: 'learning', learning: 'learning',
};

function parseCategoryKeyword(raw: string): { tab: TabId; rest: string } | null {
  const trimmed = raw.trim();
  const spaceIdx = trimmed.indexOf(' ');
  const firstWord = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
  const tab = CATEGORY_KEYWORDS[firstWord];
  if (!tab) return null;
  const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
  return { tab, rest };
}

// ── Motion variants ────────────────────────────────────────────────────────────
const panelV     = { hidden:{ y:'100%' }, visible:{ y:0 }, exit:{ y:'100%' } };
const backdropV  = { hidden:{ opacity:0 }, visible:{ opacity:1 }, exit:{ opacity:0 } };
const sheetV     = { hidden:{ y:'100%' }, visible:{ y:0 }, exit:{ y:'100%' } };
const sheetBgV   = { hidden:{ opacity:0 }, visible:{ opacity:1 }, exit:{ opacity:0 } };
const chipContainerV = { hidden:{}, visible:{ transition:{ staggerChildren:0.03, delayChildren:0.08 } } };
const chipV  = { hidden:{ opacity:0, y:10 }, visible:{ opacity:1, y:0, transition:{ duration:0.2, ease:'easeOut' as const } } };
const listV  = { hidden:{}, visible:{ transition:{ staggerChildren:0.04 } } };
// FILMONS pop-up appearance -- scale only, opacity stays at 1 throughout
// (no fade, no slide, no translateY per spec). staggerChildren above
// (40ms) already matches the card-to-card stagger this calls for.
const itemV  = { hidden:{ scale:0.85 }, visible:{ scale:[0.85, 1.03, 1], transition:{ duration:0.3, times:[0, 0.75, 1], ease:[0.22, 1, 0.36, 1] as const } } };
const suggV  = { hidden:{ opacity:0, y:-4 }, visible:{ opacity:1, y:0, transition:{ duration:0.12, ease:'easeOut' as const } } };

// ── Helpers ────────────────────────────────────────────────────────────────────
function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-4 py-4 border-b border-gray-50">
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">{label}</p>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${checked ? 'bg-gray-900' : 'bg-gray-200'}`}>
        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-0.5'}`}/>
      </button>
    </div>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <div className="shrink-0 flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full text-xs font-semibold">
      {label}
      <button onClick={onRemove} className="ml-0.5 hover:text-blue-900">
        <X className="w-3 h-3"/>
      </button>
    </div>
  );
}

// ── Filter Sheet ───────────────────────────────────────────────────────────────
const TYPE_OPTIONS: { id: ListingTypeFilter; label: string; emoji: string }[] = [
  { id:'all', label:'All', emoji:'✨' },
  { id:'rental', label:'Rental', emoji:'📦' },
  { id:'sale', label:'Sale', emoji:'🏷️' },
  { id:'service', label:'Service', emoji:'🛠️' },
  { id:'creator', label:'Creator', emoji:'👤' },
  { id:'studio', label:'Studios', emoji:'🏢' },
  { id:'opportunity', label:'Opportunity', emoji:'💼' },
];

const PRICE_OPTIONS: { id: PriceRange; label: string }[] = [
  { id:'free', label:'Free' },
  { id:'under50', label:'Under $50' },
  { id:'50to100', label:'$50 – $100' },
  { id:'100to250', label:'$100 – $250' },
  { id:'250plus', label:'$250+' },
];

function FilterSheet({ filters, onApply, onClose }: {
  filters: SearchFilters; onApply: (f: SearchFilters) => void; onClose: () => void;
}) {
  const [local, setLocal] = useState<SearchFilters>(filters);
  const set = <K extends keyof SearchFilters>(k: K, v: SearchFilters[K]) => {
    setLocal(prev => ({ ...prev, [k]: v }));
  };

  return (
    <>
      <motion.div variants={sheetBgV} initial="hidden" animate="visible" exit="exit"
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[105] bg-black/30"
        onClick={onClose}/>
      <motion.div variants={sheetV} initial="hidden" animate="visible" exit="exit"
        transition={{ type:'spring', damping:32, stiffness:320, mass:0.8 }}
        className="fixed inset-x-0 bottom-0 z-[110] bg-white rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight:'88vh', paddingBottom:'env(safe-area-inset-bottom)' }}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200"/>
        </div>

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <button onClick={() => setLocal(DEFAULT_FILTERS)}
            className="text-sm text-blue-600 font-semibold active:opacity-60">Reset all</button>
          <p className="text-sm font-black text-gray-900">Filters</p>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200">
            <X className="w-4 h-4 text-gray-600"/>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain">

          {/* Type */}
          <FilterSection label="Type">
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map(o => (
                <button key={o.id} onClick={() => set('listingType', o.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95 ${
                    local.listingType === o.id
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}>
                  {o.emoji} {o.label}
                </button>
              ))}
            </div>
          </FilterSection>

          {/* Price */}
          <FilterSection label="Price Range">
            <div className="flex flex-wrap gap-2">
              {PRICE_OPTIONS.map(o => (
                <button key={o.id}
                  onClick={() => set('priceRange', local.priceRange === o.id ? null : o.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95 ${
                    local.priceRange === o.id
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          </FilterSection>

          {/* Listing options */}
          <FilterSection label="Listing Options">
            <div className="space-y-4">
              <Toggle label="Delivery Available" checked={local.deliveryAvailable} onChange={v => set('deliveryAvailable', v)}/>
              <Toggle label="Pickup Only" checked={local.pickupOnly} onChange={v => set('pickupOnly', v)}/>
            </div>
          </FilterSection>

          {/* Creator options */}
          <FilterSection label="Creator Options">
            <div className="space-y-4">
              <Toggle label="Available for Hire" checked={local.availableForHire} onChange={v => set('availableForHire', v)}/>
              <Toggle label="Available Remotely" checked={local.availableRemotely} onChange={v => set('availableRemotely', v)}/>
              <Toggle label="Available to Travel" checked={local.availableToTravel} onChange={v => set('availableToTravel', v)}/>
            </div>
          </FilterSection>

        </div>

        {/* Apply */}
        <div className="shrink-0 px-4 pt-3 pb-4 border-t border-gray-100">
          <button onClick={() => { onApply(local); onClose(); }}
            className="w-full bg-gray-900 text-white font-black py-3.5 rounded-2xl active:opacity-80 transition-opacity text-[15px]">
            Show Results
          </button>
        </div>
      </motion.div>
    </>
  );
}

// ── Sort Sheet ─────────────────────────────────────────────────────────────────
const SORT_OPTIONS: { id: SortBy; label: string; icon: string }[] = [
  { id:'best_match', label:'Best Match',         icon:'✨' },
  { id:'newest',     label:'Newest',             icon:'🆕' },
  { id:'price_asc',  label:'Price: Low to High', icon:'⬆️' },
  { id:'price_desc', label:'Price: High to Low', icon:'⬇️' },
];

function SortSheet({ sort, onSelect, onClose }: {
  sort: SortBy; onSelect: (s: SortBy) => void; onClose: () => void;
}) {
  return (
    <>
      <motion.div variants={sheetBgV} initial="hidden" animate="visible" exit="exit"
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[105] bg-black/30"
        onClick={onClose}/>
      <motion.div variants={sheetV} initial="hidden" animate="visible" exit="exit"
        transition={{ type:'spring', damping:32, stiffness:320, mass:0.8 }}
        className="fixed inset-x-0 bottom-0 z-[110] bg-white rounded-t-3xl shadow-2xl"
        style={{ paddingBottom:'env(safe-area-inset-bottom)' }}>

        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200"/>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-black text-gray-900">Sort By</p>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200">
            <X className="w-4 h-4 text-gray-600"/>
          </button>
        </div>
        <div className="py-2">
          {SORT_OPTIONS.map(o => (
            <button key={o.id} onClick={() => { onSelect(o.id); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors">
              <span className="text-lg shrink-0">{o.icon}</span>
              <span className={`text-sm flex-1 text-left ${sort === o.id ? 'font-black text-gray-900' : 'font-medium text-gray-700'}`}>
                {o.label}
              </span>
              {sort === o.id && <div className="w-2 h-2 rounded-full bg-gray-900 shrink-0"/>}
            </button>
          ))}
        </div>
        <div className="pb-2"/>
      </motion.div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function CreatorCard({ u, onNavigate }: { u: ProfileRow; onNavigate: (url: string) => void }) {
  return (
    <motion.button variants={itemV}
      onClick={() => onNavigate(`/host/${u.id}`)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
      <div className="w-11 h-11 rounded-full overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
        {u.avatar_url
          ? <img src={u.avatar_url} className="w-full h-full object-cover" alt=""/>
          : <div className="w-full h-full flex items-center justify-center text-sm font-black text-gray-400">{u.name?.[0]?.toUpperCase() ?? '?'}</div>
        }
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-bold text-gray-900 truncate">{u.name}</p>
          {u.is_verified && <span className="text-[9px] font-black text-green-600 bg-green-50 px-1 py-0.5 rounded">✓</span>}
          {u.username && <span className="text-[11px] text-gray-400 shrink-0">@{u.username}</span>}
        </div>
        {(() => { const identity = getDisplayIdentity({ accountType: u.account_type, primaryRole: u.primary_role, businessIndustry: u.business_industry });
          return identity && <p className="text-xs text-blue-600 font-medium truncate">{identity}</p>; })()}
        {(u.city ?? u.location) && (
          <p className="text-[11px] text-gray-400 flex items-center gap-0.5 mt-0.5">
            <MapPin className="w-2.5 h-2.5 shrink-0"/>{u.city ?? u.location}
          </p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>
    </motion.button>
  );
}

// Seeds ListingDetail's skeleton immediately (same hint-only pattern
// ListingCard.tsx/SwipeStack.tsx already use) and flags the Browse/Search
// pop-up transition, per the Browse/Search -> Listing Details pop-up spec.
function previewStateFor(l: ListingRow) {
  return { preview: { title: l.title, price: l.price, cover: l.images?.[0] || null, city: l.city } };
}

function MarketplaceCard({ l, onNavigate }: { l: ListingRow; onNavigate: (url: string, state?: Record<string, unknown>) => void }) {
  const price = `$${Number(l.price).toLocaleString()}${l.listing_mode === 'rent' ? '/day' : ''}`;
  const isEmergency = !!l.is_emergency && !!l.emergency_expires_at && new Date(l.emergency_expires_at) > new Date();
  return (
    <motion.button variants={itemV}
      onClick={() => onNavigate(`/listing/${l.id}`, previewStateFor(l))}
      className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm active:scale-[0.97] transition-transform text-left">
      <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
        {l.images?.[0]
          ? <img src={l.images[0]} className="w-full h-full object-cover" alt=""/>
          : <div className="w-full h-full flex items-center justify-center text-2xl opacity-25">🎬</div>
        }
        {isEmergency && (
          <span className="absolute top-1.5 left-1.5 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-red-500 text-white flex items-center gap-0.5 shadow-sm">
            <AlertTriangle className="w-2.5 h-2.5 fill-white" /> Emergency
          </span>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-xs font-bold text-gray-900 truncate leading-snug">{l.title}</p>
        {l.city && (
          <p className="text-[10px] text-gray-400 flex items-center gap-0.5 mt-0.5">
            <MapPin className="w-2.5 h-2.5 shrink-0"/>{[l.city,l.province].filter(Boolean).join(', ')}
          </p>
        )}
        <p className="text-xs font-black text-blue-600 mt-1">{price}</p>
      </div>
    </motion.button>
  );
}

function ServiceCard({ l, onNavigate }: { l: ListingRow; onNavigate: (url: string, state?: Record<string, unknown>) => void }) {
  const isEmergency = !!l.is_emergency && !!l.emergency_expires_at && new Date(l.emergency_expires_at) > new Date();
  return (
    <motion.button variants={itemV}
      onClick={() => onNavigate(`/listing/${l.id}`, previewStateFor(l))}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
      <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
        {l.images?.[0]
          ? <img src={l.images[0]} className="w-full h-full object-cover" alt=""/>
          : <div className="w-full h-full flex items-center justify-center text-xl opacity-25">🛠️</div>
        }
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-bold text-gray-900 truncate">{l.title}</p>
          {isEmergency && (
            <span className="shrink-0 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-red-500 text-white flex items-center gap-0.5">
              <AlertTriangle className="w-2.5 h-2.5 fill-white" /> Emergency
            </span>
          )}
        </div>
        {l.city && (
          <p className="text-[11px] text-gray-400 flex items-center gap-0.5">
            <MapPin className="w-2.5 h-2.5 shrink-0"/>{[l.city,l.province].filter(Boolean).join(', ')}
          </p>
        )}
        <p className="text-sm font-black text-blue-600">${Number(l.price).toLocaleString()}/hr</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>
    </motion.button>
  );
}

function OpportunityCard({ l, onNavigate }: { l: ListingRow; onNavigate: (url: string, state?: Record<string, unknown>) => void }) {
  const isEmergency = !!l.is_emergency && !!l.emergency_expires_at && new Date(l.emergency_expires_at) > new Date();
  return (
    <motion.button variants={itemV}
      onClick={() => onNavigate(`/listing/${l.id}`, previewStateFor(l))}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
      <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
        {l.images?.[0]
          ? <img src={l.images[0]} className="w-full h-full object-cover" alt=""/>
          : <div className="w-full h-full flex items-center justify-center text-xl opacity-25">💼</div>
        }
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-bold text-gray-900 truncate">{l.title}</p>
          {isEmergency && (
            <span className="shrink-0 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-red-500 text-white flex items-center gap-0.5">
              <AlertTriangle className="w-2.5 h-2.5 fill-white" /> Emergency
            </span>
          )}
        </div>
        {l.city && (
          <p className="text-[11px] text-gray-400 flex items-center gap-0.5">
            <MapPin className="w-2.5 h-2.5 shrink-0"/>{[l.city,l.province].filter(Boolean).join(', ')}
          </p>
        )}
        {l.price > 0 && <p className="text-sm font-black text-blue-600">${Number(l.price).toLocaleString()}</p>}
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>
    </motion.button>
  );
}

// Which of the 4 badge labels the Marketplace landing page's mixed-type
// cards show -- reuses the exact same classifiers every other category
// split in this file already relies on (isOpportunityListing etc from
// filmSearch.ts), so a listing can never disagree with itself about what
// it is between this badge and its actual section elsewhere. Studios
// aren't their own badge (per spec: only RENTAL/SALE/SERVICE/OPPORTUNITY)
// -- a studio listing is really just a rental or sale whose title/category
// happens to mention "studio", so it falls back to whichever of those two
// its own listing_mode says.
function listingTypeBadge(l: ListingRow): 'RENTAL' | 'SALE' | 'SERVICE' | 'OPPORTUNITY' {
  if (isOpportunityListing(l as any)) return 'OPPORTUNITY';
  if (isServiceListing(l as any)) return 'SERVICE';
  return l.listing_mode === 'sale' ? 'SALE' : 'RENTAL';
}

const BADGE_STYLE: Record<ReturnType<typeof listingTypeBadge>, string> = {
  RENTAL: 'bg-blue-600', SALE: 'bg-emerald-600', SERVICE: 'bg-teal-600', OPPORTUNITY: 'bg-purple-600',
};

// Single consistent grid-card design for the Marketplace landing page's 3
// mixed-type rows (Top/Latest/Nearby) -- MarketplaceCard/ServiceCard/
// OpportunityCard each have their own per-category layout (grid vs. row)
// elsewhere in this file, but the landing page's own spec shows one
// uniform card shape with a type badge across every listing kind, so this
// is a new, dedicated component rather than forcing the type badge onto
// 3 differently-shaped existing ones.
function DiscoveryListingCard({ l, onNavigate, gridMode = false }: { l: ListingRow; onNavigate: (url: string, state?: Record<string, unknown>) => void; /** All Results' 2-col grid needs this to fill its cell instead of the horizontal-scroll rows' fixed 150px width. */ gridMode?: boolean }) {
  const badge = listingTypeBadge(l);
  const price = badge === 'SERVICE' ? `$${Number(l.price).toLocaleString()}/hr`
    : badge === 'OPPORTUNITY' ? (l.price > 0 ? `$${Number(l.price).toLocaleString()}` : 'Unpaid')
    : `$${Number(l.price).toLocaleString()}${l.listing_mode === 'rent' ? '/day' : ''}`;
  return (
    <motion.button variants={itemV}
      onClick={() => onNavigate(`/listing/${l.id}`, previewStateFor(l))}
      className={`bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm active:scale-[0.97] transition-transform text-left ${gridMode ? 'w-full' : 'shrink-0 w-[150px] snap-start'}`}>
      <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
        {l.images?.[0]
          ? <img src={l.images[0]} className="w-full h-full object-cover" alt=""/>
          : <div className="w-full h-full flex items-center justify-center text-2xl opacity-25">🎬</div>
        }
        <span className={`absolute top-1.5 left-1.5 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white shadow-sm ${BADGE_STYLE[badge]}`}>
          {badge}
        </span>
      </div>
      <div className="p-2.5">
        <p className="text-xs font-bold text-gray-900 truncate leading-snug">{l.title}</p>
        {l.city && (
          <p className="text-[10px] text-gray-400 flex items-center gap-0.5 mt-0.5 truncate">
            <MapPin className="w-2.5 h-2.5 shrink-0"/>{l.city}
          </p>
        )}
        <p className="text-xs font-black text-blue-600 mt-1">{price}</p>
      </div>
    </motion.button>
  );
}

// "View all ->" link -- distinct from ViewMoreButton (a full-width row
// used by the per-category sections below) since the Marketplace landing
// page's own spec shows a compact inline link next to each section title
// instead.
function ViewAllLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-0.5 text-xs font-bold text-blue-600 hover:text-blue-700 shrink-0">
      View all <ChevronRight className="w-3.5 h-3.5"/>
    </button>
  );
}

// One row of the Marketplace landing page (Top/Latest/Nearby) -- title +
// "View all", horizontal scroll of up to 5 mixed-type cards. Hides itself
// entirely when empty (e.g. "Listings nearby" with no city match) rather
// than showing an empty section.
function MarketplaceDiscoveryRow({ title, listings, onNavigate, onViewAll }: {
  title: string; listings: ListingRow[];
  onNavigate: (url: string, state?: Record<string, unknown>) => void;
  onViewAll: () => void;
}) {
  if (!listings.length) return null;
  return (
    <section className="mb-4">
      <div className="flex items-center justify-between px-4 py-2">
        <p className="text-[13px] font-black text-gray-900">{title}</p>
        <ViewAllLink onClick={onViewAll}/>
      </div>
      {/* scroll-pl-4 (scroll-padding-left, matching this row's own px-4) --
          without it, a snap-x/snap-mandatory row with no explicit scroll
          padding can settle its initial scroll position so the first
          card's edge lines up with the scrollport edge instead of the
          row's own left padding, landing flush against the screen edge
          instead of under the first letter of the section label above
          it. Same fix as CategoryResults.tsx's own preview rows. */}
      <motion.div variants={listV} initial="hidden" animate="visible"
        className="flex gap-2.5 overflow-x-auto no-scrollbar px-4 pb-1 snap-x snap-mandatory scroll-pl-4">
        {listings.map(l => <DiscoveryListingCard key={l.id} l={l} onNavigate={onNavigate}/>)}
      </motion.div>
    </section>
  );
}

function timeAgoShort(iso?: string | null): string {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

// Content-agnostic version of MarketplaceDiscoveryRow above, for Connect's
// landing page -- its 5 sections each need a genuinely different card
// design (a creator card isn't a post card isn't a hashtag chip), so this
// only owns the shared title+"View all"+scroll-pl-4-alignment shell;
// callers pass their own cards as children and decide their own
// empty-hiding (no single `items.length` this component could check).
function ConnectDiscoveryRow({ title, onViewAll, children }: {
  title: string; onViewAll: () => void; children: ReactNode;
}) {
  return (
    <section className="mb-4">
      <div className="flex items-center justify-between px-4 py-2">
        <p className="text-[13px] font-black text-gray-900">{title}</p>
        <ViewAllLink onClick={onViewAll}/>
      </div>
      <motion.div variants={listV} initial="hidden" animate="visible"
        className="flex gap-2.5 overflow-x-auto no-scrollbar px-4 pb-1 snap-x snap-mandatory scroll-pl-4">
        {children}
      </motion.div>
    </section>
  );
}

// "Creator Activity" -- compact rows (not cards) per spec: avatar + name +
// activity sentence + time. getActivitySentence is the same real-sentence
// generator Connect's dedicated Activity tab (ActivityFeedCard.tsx) uses,
// just laid out inline instead of that card's bigger bordered layout.
function CreatorActivityRow({ entry, onOpen }: { entry: ActivityEntry; onOpen: () => void }) {
  return (
    <button onClick={onOpen}
      className="shrink-0 snap-start w-[230px] flex items-center gap-2.5 bg-white border border-gray-100 rounded-2xl p-3 text-left active:scale-[0.98] transition-transform">
      <UserAvatar user={{ id: entry.actor.id, name: entry.actor.name, avatar: entry.actor.avatar_url }} size={32}/>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-700 truncate"><span className="font-bold text-gray-900">{entry.actor.name}</span> {getActivitySentence(entry)}</p>
        <p className="text-[10px] text-gray-300 mt-0.5">{timeAgoShort(entry.createdAt)}</p>
      </div>
    </button>
  );
}

function ResultSection({ label, count, grid=false, children, footer }: { label:string; count:number; grid?:boolean; children:ReactNode; footer?:ReactNode }) {
  return (
    <section className="mb-1">
      <div className="flex items-center justify-between px-4 py-2 mt-1">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
        <span className="text-[10px] text-gray-400">{count}</span>
      </div>
      {grid ? (
        <motion.div variants={listV} initial="hidden" animate="visible" className="grid grid-cols-2 gap-2.5 px-4">
          {children}
        </motion.div>
      ) : (
        <motion.div variants={listV} initial="hidden" animate="visible" className="divide-y divide-gray-50">
          {children}
        </motion.div>
      )}
      {/* Rendered outside the grid/list container so it's always a
          full-width row belonging to this section, not a grid cell. */}
      {footer}
    </section>
  );
}

// "View more" footer for a capped category -- visually belongs to the
// section it's passed into (ResultSection's `footer` prop), matching the
// spec's "the button should visually belong to that category section".
// Used for both the guest signup-prompt path and the logged-in
// full-category-page path -- same label, different onClick.
function ViewMoreButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full py-3 text-center text-sm font-bold text-indigo-600 hover:bg-indigo-50 transition-colors">
      View more
    </button>
  );
}

// All Results' per-product section shell -- title + "View all ->" header
// (always shown, same destination as the granular per-category pages),
// up to 6 items passed in as children, and a "View more {label} results
// (N)" full-width footer using the REAL total match count -- shown only
// when there actually are more than 6 (per spec: "If there are 6 or fewer
// results, do not show View more").
function AllResultsSection({ title, totalCount, onViewAll, onViewMore, moreLabel, children }: {
  title: string; totalCount: number; onViewAll: () => void; onViewMore: () => void; moreLabel: string; children: ReactNode;
}) {
  return (
    <section className="mb-5">
      <div className="flex items-center justify-between px-4 py-2">
        <p className="text-[13px] font-black text-gray-900">{title}</p>
        <ViewAllLink onClick={onViewAll}/>
      </div>
      {children}
      {totalCount > 6 && (
        <div className="px-4 pt-2">
          <button onClick={onViewMore}
            className="w-full py-3 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-center gap-1 text-sm font-bold text-gray-700">
            View more {moreLabel} results ({totalCount.toLocaleString()}) <ChevronRight className="w-3.5 h-3.5"/>
          </button>
        </div>
      )}
    </section>
  );
}

// One cell of All Results' Connect section -- three differently-shaped
// result types share this one 2-column layout (see AllResultsConnectItem/
// interleave3), each rendered through its own REAL existing component
// (CreatorCard row / portfolio thumbnail tile matching the granular
// Portfolio section's own design / the full PostCard), never a generic
// compact substitute.
function AllResultsConnectCard({ item, onNavigate, onOpenPortfolio }: {
  item: AllResultsConnectItem;
  onNavigate: (url: string) => void;
  onOpenPortfolio: (userId: string, albumId?: string) => void;
}) {
  if (item.kind === 'creator') return <CreatorCard u={item.row} onNavigate={onNavigate}/>;
  if (item.kind === 'portfolio') {
    const r = item.row;
    return (
      <button
        onClick={() => onOpenPortfolio(r.user_id, r.type === 'album' ? r.id : undefined)}
        className="relative w-full rounded-xl overflow-hidden bg-gray-100"
        style={{ aspectRatio: 4 / 5 }}
      >
        {(r.thumbnail_url || r.media_url || r.cover_url) ? (
          <img src={r.thumbnail_url || r.media_url || r.cover_url || ''} alt="" className="w-full h-full object-cover"/>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">🎬</div>
        )}
        <span className="absolute bottom-1.5 left-1.5 right-1.5 text-[11px] font-bold text-white drop-shadow truncate text-left">{r.title}</span>
      </button>
    );
  }
  return <PostCard post={item.post}/>;
}

function EmergencyCategoryGateButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full py-3 text-center text-sm font-bold text-red-600 hover:bg-red-50 transition-colors">
      See more emergency listings
    </button>
  );
}

// Guest/Creator/Creator+'s permanent Marketplace results cap -- an inline
// locked section, not a button, since there's no further page to send
// these tiers to. Originally Opportunity-only (per the Opportunity
// browsing limit spec: "Do not expose the remaining opportunities through
// ... /search/category/opportunities"); now shared by every Marketplace
// category section (Rental/Sale/Service/Studios/Opportunities) in search
// results, per the later "show max 5 listing results + upgrade CTA for
// Creator accounts" request -- same cap, same upgrade path, generalized
// beyond Opportunities.
function MarketplaceLockedNotice({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div className="mx-4 mb-1 rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-4 text-center space-y-2">
      <p className="text-sm font-black text-gray-900">Unlock all {label}</p>
      <p className="text-xs text-gray-600">
        You're seeing {OPPORTUNITY_LOCKED_LIMIT} results. Upgrade to a Professional or Business account to browse all Marketplace listings.
      </p>
      <button onClick={onClick} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs mt-1">
        Upgrade account
      </button>
    </div>
  );
}


// Singular, category-specific noun for the empty-state copy -- "rental
// results", "creators", "opportunities", matching the exact phrasing spec'd
// (e.g. "No rental results found for 'DJI'.", "No creators found for
// 'Photographer'.", "No opportunities found for 'Editor'.").
const CATEGORY_EMPTY_NOUN: Record<TabId, string> = {
  all: 'results', marketplace: 'marketplace results', connect: 'results', learning: 'courses',
};

function EmptyState({ q, tab }: { q: string; tab: TabId }) {
  const noun = CATEGORY_EMPTY_NOUN[tab];
  return (
    <div className="flex flex-col items-center py-20 text-center px-6">
      <span className="text-5xl mb-4">🔍</span>
      <p className="font-black text-gray-900 mb-1.5 text-base">
        {q ? `No ${noun} found for "${q}".` : `No ${noun} available right now.`}
      </p>
      <p className="text-sm text-gray-400 leading-relaxed">Try different keywords, a location, or browse a category.</p>
    </div>
  );
}

// ── Pre-search ─────────────────────────────────────────────────────────────────
function PreSearch({ onSelect }: { onSelect: (q: string) => void }) {
  const [recent, setRecent] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('filmons_recent_searches') ?? '[]'); } catch { return []; }
  });
  const [trendingKws, setTrendingKws] = useState<string[]>(FALLBACK_TRENDING);

  useEffect(() => { fetchTrendingKeywords().then(setTrendingKws); }, []);
  const clearRecent = () => { setRecent([]); localStorage.removeItem('filmons_recent_searches'); };

  return (
    <div className="py-5 space-y-7">
      {recent.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-4 mb-3">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5"><Clock className="w-3 h-3"/> Recent</p>
            <button onClick={clearRecent} className="text-[10px] text-blue-600 font-semibold">Clear</button>
          </div>
          <div className="space-y-0.5">
            {recent.map(term => (
              <button key={term} onClick={() => onSelect(term)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
                <Clock className="w-3.5 h-3.5 text-gray-300 shrink-0"/>
                <span className="text-sm text-gray-700">{term}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4 mb-3 flex items-center gap-1.5">
          <TrendingUp className="w-3 h-3"/> Trending on Filmons
        </p>
        <div className="flex flex-wrap gap-2 px-4">
          {trendingKws.map(t => (
            <button key={t} onClick={() => onSelect(t)}
              className="flex items-center gap-1.5 text-sm bg-gray-100 text-gray-700 px-3.5 py-1.5 rounded-full hover:bg-gray-200 font-medium active:scale-95 transition-all">
              🔥 {t}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4 mb-3">Browse by Category</p>
        <motion.div variants={chipContainerV} initial="hidden" animate="visible" className="flex flex-wrap gap-2 px-4">
          {CATEGORY_CHIPS.map(cat => (
            <motion.button key={cat.label} variants={chipV} onClick={() => onSelect(cat.label)}
              className="flex items-center gap-1.5 text-sm bg-gray-50 border border-gray-200 text-gray-700 px-3.5 py-1.5 rounded-full hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 font-medium active:scale-95 transition-colors">
              {cat.emoji} {cat.label}
            </motion.button>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

// ── Suggestion list ────────────────────────────────────────────────────────────
function SuggestionList({ suggestions, onSelect, loading }: {
  suggestions: Suggestion[]; onSelect: (s: Suggestion) => void; loading: boolean;
}) {
  if (loading && suggestions.length === 0) return (
    <div className="px-4 py-6 flex items-center gap-2 text-gray-400">
      <Loader2 className="w-4 h-4 animate-spin"/>
      <span className="text-sm">Finding suggestions…</span>
    </div>
  );
  if (suggestions.length === 0) return null;
  return (
    <motion.div variants={listV} initial="hidden" animate="visible" className="divide-y divide-gray-50 pb-2">
      {suggestions.map(s => (
        <motion.button key={s.id} variants={suggV} onClick={() => onSelect(s)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
          <span className="text-lg shrink-0">{s.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900 font-medium truncate">{s.text}</p>
            {s.subtext && <p className="text-[11px] text-gray-400">{s.subtext}</p>}
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-gray-200 shrink-0"/>
        </motion.button>
      ))}
    </motion.div>
  );
}

// ── Main overlay ───────────────────────────────────────────────────────────────
interface Props {
  onClose: () => void;
  /** If provided, called with the target URL when a result card is clicked.
   *  Use this in route-based contexts (SearchPage) to avoid the 280ms delayed
   *  navigate(-1) from firing after the user has already navigated to a result. */
  onResultNavigate?: (url: string, state?: Record<string, unknown>) => void;
}

// Browse Search's preview cap -- every regular category (Rental, Sale,
// Services, Creators, Studios) shows at most this many, for guest and
// logged-in alike, per the Browse Search Category Display Rules spec.
// What differs by account state is only what "View More" does: a guest
// gets the signup prompt, a logged-in user (any tier) gets the full,
// uncapped /search/category/:tab page. Opportunities' own, stricter cap
// below is unrelated and still applies on top of this for Guest/Creator/
// Creator+.
const PREVIEW_LIMIT = 5;
// Guest/Creator/Creator+ never see more than this many real Opportunity
// listings, anywhere -- Browse Search, the Opportunity category page,
// search results, filters -- a permanent display cap, not a resettable
// daily allowance, and never exposed via "View More" for these tiers
// (there's no further category page to send them to). Professional/
// Business (canBrowseOpportunities) are exempt entirely.
const OPPORTUNITY_LOCKED_LIMIT = 5;
// Guest/Creator/Creator+ never see more than this many EMERGENCY-flagged
// items within any one category's list (Rental, Sales, Services, Studios)
// -- non-emergency items in the same list are completely untouched.
// Professional/Business pass Infinity. Opportunities isn't listed here
// because its own OPPORTUNITY_LOCKED_LIMIT (5 total) already implies at
// most 5 emergency ones too.
const EMERGENCY_LIMIT_RESTRICTED = 2;

// Caps how many emergency-flagged items appear within one category's list
// for a restricted tier -- order otherwise preserved, non-emergency items
// untouched. Emergency is a status on a listing, not its own category (see
// isOpportunityListing's comment above for the earlier fix to a related
// category-contamination bug).
function capEmergencyInCategory(items: ListingRow[], limit: number): { visible: ListingRow[]; hiddenCount: number } {
  if (limit === Infinity) return { visible: items, hiddenCount: 0 };
  let seen = 0, hiddenCount = 0;
  const visible = items.filter(l => {
    const isEmergency = !!l.is_emergency && !!l.emergency_expires_at && new Date(l.emergency_expires_at) > new Date();
    if (!isEmergency) return true;
    if (seen < limit) { seen++; return true; }
    hiddenCount++;
    return false;
  });
  return { visible, hiddenCount };
}

const TAB_IDS: TabId[] = ['all', 'marketplace', 'connect', 'learning'];

export function SearchOverlay({ onClose, onResultNavigate }: Props) {
  const [searchParams] = useSearchParams();
  const [q,              setQ]              = useState('');
  const [rawUsers,       setRawUsers]       = useState<ProfileRow[]>([]);
  const [rawListings,    setRawListings]    = useState<ListingRow[]>([]);
  // Marketplace landing page's 4th row ("Because you're a {role}") -- a
  // real full-text match against the viewer's own saved primaryRole
  // (searchMatchingListings, the same matcher every other search surface
  // uses), not a filter over the already-fetched 40-row browse pool --
  // that pool is too small/recent-only to reliably contain a good role
  // match, so this gets its own small fetch. See the effect below.
  const [roleListings,   setRoleListings]   = useState<ListingRow[]>([]);
  // Connect landing page (Search -> Connect, empty query) -- 5 discovery
  // sections, each sourced from real existing infrastructure (never a
  // fabricated/newest-only substitute): getSuggestedCreators (same signal
  // set as the Connections hub), postsApi.getTopPosts (real likes_count),
  // getPortfolioFeed (already public-only), getTopHashtags (real
  // post_count), getActivityFeed (broad public "foryou" activity). See the
  // fetch effect below.
  const [connectSuggested,        setConnectSuggested]        = useState<SuggestedCreator[]>([]);
  const [connectTrendingPosts,    setConnectTrendingPosts]    = useState<Post[]>([]);
  const [connectFeaturedPortfolio,setConnectFeaturedPortfolio]= useState<PortfolioFeedEntry[]>([]);
  const [connectPopularHashtags,  setConnectPopularHashtags]  = useState<Hashtag[]>([]);
  const [connectActivity,         setConnectActivity]         = useState<ActivityEntry[]>([]);
  // Portfolio/Posts/Hashtags -- only ever populated for a typed search on
  // the 'all' tab (no dedicated tab UI for these yet, unlike
  // rawUsers/rawListings above); shown as their own ResultSections there,
  // same PREVIEW_LIMIT-and-"View all" pattern as every other section.
  const [rawPortfolio,   setRawPortfolio]   = useState<SearchPortfolioRow[]>([]);
  const [rawPosts,       setRawPosts]       = useState<SearchPostRow[]>([]);
  // rawPosts is the lightweight match set (drives the count/"View all"
  // gate below); only the first PREVIEW_LIMIT get hydrated into full Post
  // objects so this preview renders through the same universal PostCard
  // Home uses without paying for post bodies it never shows.
  const [shownPosts,     setShownPosts]     = useState<Post[]>([]);
  const [rawHashtags,    setRawHashtags]    = useState<HashtagSuggestion[]>([]);
  // Learning -- courses, distinct top-level mode from Connect/Marketplace.
  const [rawCourses,     setRawCourses]     = useState<Course[]>([]);
  // Cached account_type per Opportunity-listing owner, used to exclude
  // locked (over-tier) listings from every result surface here -- grows
  // as new owners show up in results, never refetches one already known.
  const [oppOwnerTypes,  setOppOwnerTypes]  = useState<Map<string, string | undefined>>(new Map());
  const [suggestions,    setSuggestions]    = useState<Suggestion[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [suggLoading,    setSuggLoading]    = useState(false);
  const [resultsReady,   setResultsReady]   = useState(false);
  // Initialized from ?tab= so a guest returning from Login after tapping
  // "See more" on a specific category (see handleGuestSeeMore) lands back
  // directly on that category instead of the generic 'all' view.
  const [activeTab,      setActiveTab]      = useState<TabId>(() => {
    const t = searchParams.get('tab');
    return t && (TAB_IDS as string[]).includes(t) ? (t as TabId) : 'all';
  });
  const [closing,        setClosing]        = useState(false);
  const [filters,        setFilters]        = useState<SearchFilters>(DEFAULT_FILTERS);
  const [sort,           setSort]           = useState<SortBy>('best_match');
  const [showFilterSheet,setShowFilterSheet]= useState(false);
  const [showSortSheet,  setShowSortSheet]  = useState(false);
  // Professional/Business get unlimited Opportunity browsing. Everyone
  // else sees the 5 latest (opportunityListings is already newest-first,
  // same as every other category) plus a "See More" button instead of the
  // rest -- tapping it shows the account-tier gate, it doesn't fetch or
  // reveal anything further. isProfessional() covers both unlimited
  // tiers, and defaults false for a guest (no user) or any lower tier.
  const { user, isAuthenticated } = useAuth();
  const { openPortfolioPreview } = usePortfolioPreview();
  const canBrowseOpportunities = isProfessional(user?.accountType);
  const [showMarketplaceGate, setShowMarketplaceGate] = useState(false);
  // Same Professional-or-Business rule as Home.tsx's canBrowseEmergency --
  // isProfessional() already covers both, deliberately never Creator+ alone
  // (see the emergency-listing spec's explicit "Creator+ status alone does
  // NOT unlock Emergency Listings").
  const canBrowseEmergency = isProfessional(user?.accountType);
  // Shared across every category section (Rental/Sales/Services/Studios) --
  // whichever one's "See more emergency listings" button was tapped opens
  // the same modal, same as showMarketplaceGate above.
  const [showEmergencyCategoryGate, setShowEmergencyCategoryGate] = useState(false);
  const emergencyLimit = canBrowseEmergency ? Infinity : EMERGENCY_LIMIT_RESTRICTED;

  const navigate    = useNavigate();
  const inputRef    = useRef<HTMLInputElement>(null);
  const resultsRef  = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suggRef     = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Guards a slow, now-stale runSearch response from overwriting a newer
  // query's results -- confirmed missing before this (no AbortController,
  // no version check), so a slower earlier response could silently clobber
  // a faster later one. Same query-version-ref pattern already used this
  // session in SharePostSheet.tsx's recipient search.
  const searchVersionRef = useRef(0);

  const handleClose = useCallback(() => { setClosing(true); setTimeout(onClose, 280); }, [onClose]);

  // For result card clicks: if caller provides onResultNavigate, use it directly
  // (avoids the delayed navigate(-1) firing AFTER we've already navigated to the result).
  // For modal usage (Root.tsx), fall back to navigate(url) + delayed onClose.
  // `previewState`, when given, seeds ListingDetail's skeleton immediately
  // and flags it to use the Browse/Search pop-up transition (see the
  // Browse/Search -> Listing Details pop-up spec) instead of no transition
  // at all -- Home's own swipe-card transition is separate and untouched.
  const handleResultNavigate = useCallback((url: string, previewState?: Record<string, unknown>) => {
    setClosing(true);
    // Snapshot this session's search state so a "Back" from the listing
    // (ListingDetail's own exit animation calls navigate(-1)) restores
    // exactly where the user left off instead of a blank fresh search.
    saveSearchState({ q, activeTab, filters, sort, scrollY: resultsRef.current?.scrollTop ?? 0 });
    const state = previewState ? { fromSearch: true, ...previewState } : undefined;
    if (onResultNavigate) {
      onResultNavigate(url, state);
    } else {
      navigate(url, state ? { state } : undefined);
      setTimeout(onClose, 280);
    }
  }, [navigate, onClose, onResultNavigate, q, activeTab, filters, sort]);

  // Shared by every navigation-away-from-search action below (View More,
  // View all results, the guest signup prompt) -- same close-then-navigate
  // pattern handleResultNavigate already uses for listing clicks. Without
  // this, navigating away only changes the route; when SearchOverlay is
  // mounted as Root.tsx's modal (searchOpen, no onResultNavigate passed),
  // the overlay itself has no idea the URL changed and stays mounted on
  // top of whatever the new route renders underneath it. Closing first (or
  // via onResultNavigate when the route-page caller provides one) is what
  // actually unmounts it.
  const closeAndNavigate = useCallback((url: string, state?: Record<string, unknown>) => {
    setClosing(true);
    if (onResultNavigate) {
      onResultNavigate(url, state);
    } else {
      navigate(url, state ? { state } : undefined);
      setTimeout(onClose, 280);
    }
  }, [navigate, onClose, onResultNavigate]);

  // Guest "See more" on a category section — never loads more results for
  // a guest, always sends them to Login instead. Remembers the category
  // (via ?tab= on the return URL, read by activeTab's initializer above)
  // so a successful login/signup lands back on that same filtered category
  // view rather than the top of Home or a generic search page.
  // Accepts either a top-level TabId or one of the finer-grained legacy
  // category ids (rental/creators/portfolio/etc, still real routes under
  // /search/category/:id -- see CategoryResults.tsx's SingleCategoryResults
  // -- just no longer top-level tabs in this overlay).
  const handleGuestSeeMore = useCallback((tab: string) => {
    setPendingReturnUrl(`/search?tab=${tab}`);
    closeAndNavigate(`/login?heading=${encodeURIComponent('Sign up to see more listings')}&sub=${encodeURIComponent("Create your FILMONS account to explore all listings.")}`);
  }, [closeAndNavigate]);

  // Logged-in "View More" on a category section — opens the full, uncapped
  // /search/category/:tab page, carrying the current search state (query,
  // filters, sort) so the full page picks up right where Browse Search
  // left off instead of starting from a blank category browse. Its own
  // dedicated page, not rendered as a child/overlay of this one -- see
  // closeAndNavigate above for why that requires actually closing this
  // overlay, not just changing the route.
  const handleViewMoreCategory = useCallback((tab: string) => {
    // `q` also rides along as a real URL query param (not just router
    // state) so the destination is a shareable/bookmarkable standalone URL
    // per spec, e.g. `/search/category/all?q=dji` -> `/search/category/
    // rentals?q=dji`. State still carries filters/sort, which don't have a
    // URL representation yet.
    const trimmed = q.trim();
    const qs = trimmed ? `?q=${encodeURIComponent(trimmed)}` : '';
    closeAndNavigate(`/search/category/${tab}${qs}`, { query: q, filters, sort });
  }, [closeAndNavigate, q, filters, sort]);

  // Marketplace landing page's "Because you're a {role}" row -- its own
  // "View all", distinct from handleViewMoreCategory above, because the
  // destination needs to (a) carry the role itself as the page's actual
  // search query, so the personalization stays active rather than
  // dropping to a generic unfiltered Marketplace list, and (b) show
  // "Because you're a {role}" as the page's own title instead of the
  // generic "Marketplace" -- see CategoryResults.tsx's pageTitle.
  const handleViewAllRole = useCallback(() => {
    if (!user?.primaryRole) return;
    const role = user.primaryRole;
    closeAndNavigate(`/search/category/marketplace?q=${encodeURIComponent(role)}`, {
      query: role, filters, sort, pageTitle: `Because you're a ${role}`,
    });
  }, [closeAndNavigate, user?.primaryRole, filters, sort]);

  // Same idea as handleViewAllRole above, for the OTHER two Marketplace
  // landing-page discovery rows (Top listings / Latest listings / Listings
  // nearby -- see topListings/latestListings/nearbyListings below). All
  // three used to share handleViewMoreCategory('marketplace'), which lands
  // on a blank-query page showing every discovery row again (Latest+Top+
  // role) instead of scoping down to the ONE row the viewer actually
  // tapped -- discoveryView (CategoryResults.tsx's NavState field) is what
  // makes that page render just this one list.
  const DISCOVERY_VIEW_TITLE = { top: 'Top listings', latest: 'Latest listings', nearby: 'Listings nearby' } as const;
  const handleViewAllDiscovery = useCallback((view: 'top' | 'latest' | 'nearby') => {
    closeAndNavigate('/search/category/marketplace', {
      query: '', filters, sort, discoveryView: view, pageTitle: DISCOVERY_VIEW_TITLE[view],
    });
  }, [closeAndNavigate, filters, sort]);

  // Backfills oppOwnerTypes for any Opportunity-listing owner in the
  // current results not already cached -- one small profiles lookup per
  // newly-seen batch of owners, never re-fetching one already known.
  useEffect(() => {
    const ownerIds = [...new Set(
      rawListings.filter(l => l.listing_type === 'opportunity' && l.user_id).map(l => l.user_id!)
    )].filter(id => !oppOwnerTypes.has(id));
    if (!ownerIds.length) return;
    let cancelled = false;
    supabase.from('profiles').select('id, account_type').in('id', ownerIds).then(({ data }) => {
      if (cancelled || !data) return;
      setOppOwnerTypes(prev => {
        const next = new Map(prev);
        for (const row of data as any[]) next.set(row.id, row.account_type);
        for (const id of ownerIds) if (!next.has(id)) next.set(id, undefined);
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [rawListings]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ids = rawPosts.slice(0, PREVIEW_LIMIT).map(r => r.id);
    if (!ids.length) { setShownPosts([]); return; }
    let cancelled = false;
    postsApi.getByIds(ids).then(posts => {
      if (cancelled) return;
      const byId = new Map(posts.map(p => [p.id, p]));
      setShownPosts(ids.map(id => byId.get(id)).filter((p): p is Post => !!p));
    });
    return () => { cancelled = true; };
  }, [rawPosts]);

  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 80); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [handleClose]);

  const runSearch = useCallback((query: string) => {
    if (!query.trim()) {
      setRawUsers([]); setRawListings([]); setRawPortfolio([]); setRawPosts([]); setRawHashtags([]); setRawCourses([]); setResultsReady(false); return;
    }
    setLoading(true); setResultsReady(false);
    clearTimeout(debounceRef.current);
    const myVersion = ++searchVersionRef.current;
    debounceRef.current = setTimeout(() => {
      // Under any Marketplace intent (Rental/Sale/Service/Opportunity),
      // Connect/Learning should be scoped to whatever's LEFT of the query
      // after the intent word is stripped ("camera" from "camera
      // rental") -- per spec, relevant to the remainder, never "every
      // post/course" just because an intent word was typed. A bare intent
      // query ("rental" alone) has no remainder to score by, so
      // Portfolio/Posts stay correctly empty on their own
      // (searchMatchingPortfolio/Posts already return [] for an empty
      // query) -- only getCourses needs an explicit guard here, since an
      // empty query string there means "no filter", not "no results" (see
      // coursesApi.ts).
      const { intents, remainder } = detectMarketplaceIntent(query);
      const hasIntent = intents.length > 0;
      const textQuery = hasIntent ? remainder : query;
      const coursesQuery = hasIntent && !remainder.trim() ? null : textQuery;
      Promise.all([
        searchAll(query),
        // Fetched alongside listings/creators regardless of which of the
        // four top-level modes is active, so switching modes never needs a
        // second round trip -- the visible* derivations below decide what
        // actually renders per mode.
        searchMatchingPortfolio(textQuery).catch(() => []),
        searchMatchingPosts(textQuery).catch(() => []),
        searchHashtagSuggestions(textQuery, 6).catch(() => []),
        coursesQuery ? getCourses({ query: coursesQuery, limit: 24 }).catch(() => []) : Promise.resolve([]),
      ])
        .then(([{ users: u, listings: l }, portfolio, posts, hashtags, courses]) => {
          if (searchVersionRef.current !== myVersion) return; // a newer query already superseded this one
          setRawUsers(u); setRawListings(l);
          setRawPortfolio(portfolio); setRawPosts(posts); setRawHashtags(hashtags); setRawCourses(courses);
          setResultsReady(true);
          if (u.length > 0 || l.length > 0) {
            try {
              const prev: string[] = JSON.parse(localStorage.getItem('filmons_recent_searches') ?? '[]');
              const next = [query.trim(), ...prev.filter(s => s !== query.trim())].slice(0, 5);
              localStorage.setItem('filmons_recent_searches', JSON.stringify(next));
            } catch {}
          }
        })
        .catch(() => { if (searchVersionRef.current === myVersion) setResultsReady(true); })
        .finally(() => { if (searchVersionRef.current === myVersion) setLoading(false); });
    }, 400);
  }, []);

  // Restores search state (query, category, filters, sort, scroll
  // position) after coming back from a listing opened from here -- see
  // handleResultNavigate's saveSearchState() and the Browse/Search ->
  // Listing Details pop-up spec's "restore the user's previous search...
  // do not reload Browse/Search from the top". One-shot (consumeSearchState
  // clears it immediately), so this never fires on a fresh /search visit
  // that didn't come from a listing's back button.
  useEffect(() => {
    const saved = consumeSearchState();
    if (!saved) return;
    setActiveTab(saved.activeTab as TabId);
    setFilters(saved.filters as SearchFilters);
    setSort(saved.sort as SortBy);
    if (saved.q) { setQ(saved.q); runSearch(saved.q); }
    requestAnimationFrame(() => { resultsRef.current?.scrollTo({ top: saved.scrollY }); });
  }, []); // eslint-disable-line

  const hasTyped = q.trim().length > 0;

  // Category browse -- a tapped category must show its own results even
  // before any text is typed (spec). runSearch above only ever fires on a
  // non-empty query, so this covers the complementary case: whenever the
  // active tab isn't 'all' and there's no query text, fetch that category's
  // newest items directly. Switching tabs while a query IS typed does NOT
  // refetch here (hasTyped guards it) -- rawListings/rawUsers already hold
  // every category's matches from runSearch, and the visible* filters below
  // just change which slice of that same data is shown, keeping the typed
  // search text exactly as the user left it.
  useEffect(() => {
    if (hasTyped) return;
    if (activeTab === 'all') { setRawUsers([]); setRawListings([]); setRawCourses([]); setResultsReady(false); return; }
    // Connect's own empty-query state is always the landing page now (see
    // showConnectLanding), which is fetched entirely by its own effect
    // above -- this generic newest-profiles browse query has no consumer
    // left for 'connect' and would just be wasted work. `loading` must
    // still be explicitly cleared here (not just left alone) -- if it was
    // `true` from an in-flight search/tab-switch at the moment this
    // branch runs, nothing else ever resets it, and the render's
    // `loading ? <spinner> : ...` check has no earlier bypass for
    // Connect the way it does for the 'all' tab -- the whole landing page
    // got stuck behind a permanent "Searching…" spinner.
    if (activeTab === 'connect') { setRawUsers([]); setRawListings([]); setRawCourses([]); setResultsReady(true); setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setResultsReady(false);
    fetchCategoryBrowse(activeTab).then(({ users, listings, courses }) => {
      if (cancelled) return;
      setRawUsers(users); setRawListings(listings); setRawCourses(courses);
      // Browsing a mode with no query typed has no Portfolio/Posts/
      // Hashtags equivalent yet (those only ever come from a typed
      // search) -- cleared here so switching from a typed Connect search
      // to tapping Connect fresh doesn't leave stale matches showing.
      setRawPortfolio([]); setRawPosts([]); setRawHashtags([]);
      setResultsReady(true); setLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeTab, hasTyped]);

  // Marketplace landing page's "Because you're a {role}" row -- fires
  // only for that exact case (marketplace tab, empty query, viewer has a
  // real saved primaryRole). Hidden entirely (never a guessed role) when
  // primaryRole is empty -- see the row's own `user?.primaryRole &&` gate
  // further down.
  useEffect(() => {
    if (!(activeTab === 'marketplace' && !hasTyped) || !user?.primaryRole) { setRoleListings([]); return; }
    let cancelled = false;
    searchMatchingListings(user.primaryRole).then(rows => {
      if (cancelled) return;
      const mapped = (rows as unknown as ListingRow[])
        .filter(l => !(!!l.is_emergency && !!l.emergency_expires_at && new Date(l.emergency_expires_at) > new Date()));
      setRoleListings(mapped.slice(0, PREVIEW_LIMIT));
    });
    return () => { cancelled = true; };
  }, [activeTab, hasTyped, user?.primaryRole]);

  // Connect landing page's 5 sections -- one combined fetch, same
  // condition-inlined-in-the-effect pattern as roleListings above (rather
  // than depending on the showConnectLanding const, which is computed
  // later in this function body, after every hook). getSuggestedCreators
  // requires a real userId (it's not guest-safe -- see its own comments),
  // so "People you may know" is simply left empty for a guest rather than
  // falling back to a weaker/fabricated list.
  useEffect(() => {
    if (!(activeTab === 'connect' && !hasTyped)) return;
    let cancelled = false;
    Promise.all([
      user?.id ? getSuggestedCreators(user.id, { limit: 10 }).catch(() => []) : Promise.resolve([]),
      postsApi.getTopPosts(10).catch(() => []),
      getPortfolioFeed({ limit: 10, viewerId: user?.id }).catch(() => []),
      getTopHashtags(12).catch(() => []),
      getActivityFeed({ tab: 'foryou', limit: 10 }).catch(() => ({ entries: [] as ActivityEntry[] })),
    ]).then(([creators, posts, portfolio, hashtags, activity]) => {
      if (cancelled) return;
      setConnectSuggested(creators);
      setConnectTrendingPosts(posts);
      setConnectFeaturedPortfolio(portfolio);
      setConnectPopularHashtags(hashtags);
      setConnectActivity(activity.entries);
    });
    return () => { cancelled = true; };
  }, [activeTab, hasTyped, user?.id]);

  // Creator Activity row's click target -- same targetType switch
  // ActivityFeedCard.tsx's openResource uses, inlined here since that
  // logic isn't exported standalone.
  const openActivityResource = useCallback((entry: ActivityEntry) => {
    switch (entry.targetType) {
      case 'portfolio_item':
      case 'portfolio_album':
        handleClose(); openPortfolioPreview(entry.actor.id); return;
      case 'listing':
        handleResultNavigate(`/listing/${entry.targetId}`); return;
      case 'post':
        handleResultNavigate(`/post/${entry.targetId}`); return;
      case 'connection':
        if (entry.otherUser) handleResultNavigate(`/host/${entry.otherUser.id}`);
        return;
      default:
        handleResultNavigate(`/host/${entry.actor.id}`);
    }
  }, [handleClose, openPortfolioPreview, handleResultNavigate]);

  const handleQueryChange = (val: string) => {
    // activeTab is deliberately left untouched -- switching from typed
    // search back to an empty box while a category tab is selected should
    // fall into that category's browse mode above, not reset to 'all'.
    setQ(val); setResultsReady(false);
    if (!val.trim()) {
      setSuggestions([]); clearTimeout(suggRef.current); clearTimeout(debounceRef.current);
      setRawUsers([]); setRawListings([]); setRawPortfolio([]); setRawPosts([]); setRawHashtags([]); setRawCourses([]);
      setLoading(false); setSuggLoading(false); return;
    }
    setSuggLoading(true);
    clearTimeout(suggRef.current);
    suggRef.current = setTimeout(() => {
      fetchSuggestions(val)
        .then(setSuggestions)
        .catch(() => setSuggestions(generateSmartSuggestions(val)))
        .finally(() => setSuggLoading(false));
    }, 120);
    runSearch(val);
  };

  const handleSelectSuggestion = (s: Suggestion) => {
    if (s.kind === 'hashtag') { setSuggestions([]); handleResultNavigate(`/hashtag/${s.action}`); return; }
    if (s.kind === 'location-real') { setSuggestions([]); handleResultNavigate(`/search/location/${encodeURIComponent(s.action)}`); return; }
    setQ(s.action); setSuggestions([]); runSearch(s.action);
  };

  // Enter/Search submit -- recognizes a leading category keyword
  // ("opportunity", "rental canon", ...) and switches the active tab to
  // match, same as tapping that tab directly. A bare category keyword with
  // nothing after it clears the box entirely so the existing tab-switch
  // browse effect above takes over (identical to tapping the tab with an
  // empty search box); a category + keyword sets the box to just the
  // remainder and runs a normal search restricted to that tab. An
  // unrecognized first word falls back to the existing all-category search,
  // leaving whatever tab is already active untouched.
  // Both entry points into the Opportunities tab -- tapping the chip
  // directly, and typing "opportunity"/"opportunities" as a category
  // keyword and hitting Enter (parseCategoryKeyword below) -- are always
  // allowed now; a limited tier just sees its capped daily allowance
  // (oppAllowanceRows above) instead of the full category.
  const trySetTab = (tab: TabId) => {
    setActiveTab(tab);
  };

  const handleSubmitSearch = () => {
    if (!q.trim()) return;
    setSuggestions([]);
    // Cancel any live-typing debounce still pending from the keystrokes that
    // just typed this category keyword -- without this, that stale literal-
    // text search (e.g. title ILIKE '%opportunity%') can still fire ~400ms
    // later and stomp the correct category results with an empty state, if
    // Enter happens to land before the debounce window elapses. The
    // category+keyword and fallback branches below both call runSearch,
    // which already clears this same timer itself before setting a new one
    // -- only the bare-category branch (no runSearch call at all) needed
    // this explicitly.
    clearTimeout(suggRef.current);
    clearTimeout(debounceRef.current);
    const parsed = parseCategoryKeyword(q);
    if (parsed) {
      trySetTab(parsed.tab);
      setQ(parsed.rest);
      if (parsed.rest) runSearch(parsed.rest);
      return;
    }
    runSearch(q);
  };

  // Apply filters + sort to raw results
  const { listings: filteredListings, users: filteredUsers } = applyFilters(rawListings, rawUsers, filters, sort);

  // Same classifiers used by fetchCategoryBrowse and the marketplace Filter
  // Sheet's own Type facet -- a listing lands in a category tab's section
  // here for exactly the same reason it would if that category were
  // DB-fetched directly, so switching between typed-search and browse mode
  // never changes what counts as, say, a Studio.
  const rentalListings      = filteredListings.filter(l => isRentalListing(l));
  const saleListings        = filteredListings.filter(l => isSaleListing(l));
  const serviceListingsOnly = filteredListings.filter(l => isServiceListing(l));
  const studioListings      = filteredListings.filter(l => isStudioListing(l));
  // Newest-first regardless of the active sort mode ("best_match" for a
  // typed search otherwise ranks by relevance, not recency) -- "the 5
  // latest" needs a real recency order underneath it, not whatever the
  // general result ranking happens to produce.
  // Exclude Opportunity listings beyond their own host's tier entitlement
  // (see lib/entitlements.ts's getLockedOpportunityIds/
  // filterOutLockedOpportunities) -- a locked listing stays visible on the
  // host's own management view, but never in Browse Search. Grouped by
  // owner since "locked" is relative to that owner's other concurrent
  // Opportunity posts, using oppOwnerTypes (fetched below) for whichever
  // owners it covers; an owner not yet in the map is treated as
  // unrestricted for this render rather than hiding their listing over a
  // fetch that just hasn't resolved yet.
  const rawOpportunityListings = filteredListings.filter(l => isOpportunityListing(l))
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const opportunityListings = (() => {
    const byOwner = new Map<string, ListingRow[]>();
    for (const l of rawOpportunityListings) {
      if (!l.user_id) continue;
      if (!byOwner.has(l.user_id)) byOwner.set(l.user_id, []);
      byOwner.get(l.user_id)!.push(l);
    }
    const lockedIds = new Set<string>();
    for (const [ownerId, ownerListings] of byOwner) {
      if (!oppOwnerTypes.has(ownerId)) continue;
      const ids = getLockedOpportunityIds(oppOwnerTypes.get(ownerId), ownerListings.map(l => ({
        id: l.id, listingType: l.listing_type, isActive: l.is_active ?? true, createdAt: l.created_at ?? undefined,
      })));
      for (const id of ids) lockedIds.add(id);
    }
    return lockedIds.size === 0 ? rawOpportunityListings : rawOpportunityListings.filter(l => !lockedIds.has(l.id));
  })();
  // Cross-cutting flag, not a mutually-exclusive category like the others
  // above (an Emergency listing is still also a Rental/Sale/Service) --
  // its own tab/section regardless of what underlying type it is.
  const emergencyListings = filteredListings.filter(l => !!l.is_emergency && !!l.emergency_expires_at && new Date(l.emergency_expires_at) > new Date())
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  // Which product is most likely relevant FIRST for this query -- drives
  // the 'all' tab's Marketplace/Connect/Learning section order below (e.g.
  // "sony fx3" -> Marketplace first, "cinematographer" -> Connect first,
  // "lighting course" -> Learning first). Purely an ordering decision;
  // retrieval itself (what each section actually contains) is unchanged.
  const recognition = useMemo(() => recognizeQuery(q), [q]);

  // Four top-level modes, All a universal layer over the other three (per
  // spec section 15, "All is not a fourth product") -- Marketplace =
  // Rental/Sale/Services/Studios/Opportunities/Emergency, Connect =
  // Creators/Portfolio/Posts/Hashtags/Locations, Learning = Courses.
  const showMarketplace = activeTab === 'all' || activeTab === 'marketplace';
  const showConnect     = activeTab === 'all' || activeTab === 'connect';
  const showLearning    = activeTab === 'all' || activeTab === 'learning';

  const visibleUsers        = showConnect     ? filteredUsers        : [];
  const rawVisibleRental    = showMarketplace ? rentalListings       : [];
  const rawVisibleSale      = showMarketplace ? saleListings         : [];
  const rawVisibleServices  = showMarketplace ? serviceListingsOnly  : [];
  const rawVisibleStudios   = showMarketplace ? studioListings       : [];
  const visibleOpportunities= showMarketplace ? opportunityListings  : [];
  const visibleEmergency    = showMarketplace ? emergencyListings    : [];
  const visiblePortfolio    = showConnect     ? rawPortfolio         : [];
  const visiblePosts        = showConnect     ? rawPosts             : [];
  const visibleHashtags     = showConnect     ? rawHashtags          : [];
  const visibleCourses      = showLearning    ? rawCourses           : [];

  // Emergency-flagged items within each of these four categories are
  // separately capped at emergencyLimit for a restricted tier -- non-
  // emergency items in the same list are untouched (see
  // capEmergencyInCategory above).
  const { visible: visibleRental,   hiddenCount: hiddenEmergencyRental }   = capEmergencyInCategory(rawVisibleRental, emergencyLimit);
  const { visible: visibleSale,     hiddenCount: hiddenEmergencySale }     = capEmergencyInCategory(rawVisibleSale, emergencyLimit);
  const { visible: visibleServices, hiddenCount: hiddenEmergencyServices } = capEmergencyInCategory(rawVisibleServices, emergencyLimit);
  const { visible: visibleStudios,  hiddenCount: hiddenEmergencyStudios }  = capEmergencyInCategory(rawVisibleStudios, emergencyLimit);

  // Marketplace landing page (Search -> Marketplace, empty query) -- Top/
  // Latest/Listings nearby, mixing every type together rather than one
  // section per category. Built from the SAME already-fetched/classified
  // pool as the per-category sections above (rawVisibleX, pre-emergency-
  // cap) rather than a second query -- Emergency itself is excluded here
  // (it's a separate, permission-gated surface with its own dedicated
  // section/badge already), matching how CategoryResults.tsx's own Top/
  // Latest discovery rows treat it.
  const isActiveEmergency = (l: ListingRow) => !!l.is_emergency && !!l.emergency_expires_at && new Date(l.emergency_expires_at) > new Date();
  const marketplaceMixedPool = showMarketplace
    ? [...rawVisibleRental, ...rawVisibleSale, ...rawVisibleServices, ...rawVisibleStudios, ...visibleOpportunities].filter(l => !isActiveEmergency(l))
    : [];
  const topListings = [...marketplaceMixedPool]
    .sort((a, b) => (Number(!!b.boosted) - Number(!!a.boosted)) || (new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()))
    .slice(0, PREVIEW_LIMIT);
  const latestListings = [...marketplaceMixedPool]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, PREVIEW_LIMIT);
  // Hidden entirely (not a fake/empty section) when the viewer has no
  // saved city -- guests and profiles that never filled this in have
  // nothing real to match "nearby" against.
  const nearbyListings = user?.city
    ? [...marketplaceMixedPool]
        .filter(l => l.city && l.city.toLowerCase().includes(user.city!.toLowerCase()))
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, PREVIEW_LIMIT)
    : [];
  // All Results (activeTab 'all', typed query) -- per spec, groups into
  // exactly 3 product sections (Marketplace/Connect/Learning) capped at 6
  // each in a 2-column grid, instead of the granular per-category
  // sections the Marketplace/Connect/Learning tabs keep showing on their
  // own typed search (unchanged below). Built from the SAME already-
  // fetched/classified visibleX arrays as those granular sections -- no
  // second query -- so "View more {product} results (N)" can report the
  // real total match count even though only 6 render here.
  const allMarketplaceCombined = activeTab === 'all'
    ? [...visibleRental, ...visibleSale, ...visibleStudios, ...visibleServices, ...visibleOpportunities]
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    : [];
  const allConnectCombined: AllResultsConnectItem[] = activeTab === 'all'
    ? interleave3(
        visibleUsers.map(row => ({ kind: 'creator' as const, row })),
        visiblePortfolio.map(row => ({ kind: 'portfolio' as const, row })),
        shownPosts.map(post => ({ kind: 'post' as const, post })),
      )
    : [];
  const allConnectTotal = visibleUsers.length + visiblePortfolio.length + visiblePosts.length;

  const showMarketplaceLanding = activeTab === 'marketplace' && !hasTyped;
  // Search -> Connect, empty query: the 5-section discovery landing page
  // (People you may know/Trending/Featured Portfolio/Popular Hashtags/
  // Creator Activity) -- same "own empty-query landing state, untouched
  // typed-search/'all'-tab behavior" pattern as showMarketplaceLanding.
  const showConnectLanding = activeTab === 'connect' && !hasTyped;

  const noResults  = hasTyped && resultsReady && !loading && filteredUsers.length === 0 && filteredListings.length === 0
    && rawPortfolio.length === 0 && rawPosts.length === 0 && rawHashtags.length === 0 && rawCourses.length === 0;
  const hasResults = filteredUsers.length > 0 || filteredListings.length > 0
    || rawPortfolio.length > 0 || rawPosts.length > 0 || rawHashtags.length > 0 || rawCourses.length > 0;
  const hasVisible = visibleUsers.length > 0 || visibleRental.length > 0 || visibleSale.length > 0
    || visibleServices.length > 0 || visibleStudios.length > 0 || visibleOpportunities.length > 0 || visibleEmergency.length > 0
    || visiblePortfolio.length > 0 || visiblePosts.length > 0 || visibleHashtags.length > 0 || visibleCourses.length > 0;
  const showSuggestions = hasTyped && !resultsReady && !loading && (suggestions.length > 0 || suggLoading);

  const activeFilterCount = countActiveFilters(filters);
  const anim = closing ? 'exit' : 'visible';

  return (
    <>
      <motion.div variants={backdropV} initial="hidden" animate={anim} transition={{ duration:0.25 }}
        className="fixed inset-0 z-[90] bg-black/[0.15] backdrop-blur-[12px]"
        onClick={handleClose}/>

      <motion.div variants={panelV} initial="hidden" animate={anim}
        transition={{ type:'spring', damping:32, stiffness:320, mass:0.8 }}
        className="fixed inset-0 z-[100] bg-white flex flex-col overflow-hidden"
        style={{ paddingBottom:'env(safe-area-inset-bottom)' }}>

        {/* ── Search header ── */}
        <div className="shrink-0 flex items-center gap-2.5 px-4 border-b border-gray-100"
          style={{ paddingTop:'max(16px, env(safe-area-inset-top))', paddingBottom:'12px' }}>
          <button onClick={handleClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors shrink-0 active:scale-90">
            <ArrowLeft className="w-5 h-5 text-gray-700"/>
          </button>
          <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-2xl px-3.5 py-2.5">
            <Search className="w-4 h-4 text-blue-500 shrink-0"/>
            <input ref={inputRef} value={q}
              onChange={e => handleQueryChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmitSearch(); }}
              placeholder="Search creators, gear, studios, services…"
              className="flex-1 text-[15px] text-gray-900 placeholder-gray-400 outline-none bg-transparent"
              autoComplete="off" autoCorrect="off" spellCheck={false}/>
            {(loading || suggLoading)
              ? <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0"/>
              : q && (
                  <button onClick={() => handleQueryChange('')} className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
                    <X className="w-4 h-4"/>
                  </button>
                )
            }
          </div>
        </div>

        {/* ── Category tabs — always visible, not gated on typing, so tapping
             one fetches that category immediately with no query typed yet.
             The Emergency tab itself is Professional/Business only --
             Guest/Creator/Creator+ still see emergency-flagged listings,
             just inside each one's real category (Rental, Services, ...)
             with an EMERGENCY badge, capped per category. ── */}
        <div className="pop-in shrink-0 flex gap-1.5 px-4 py-2.5 overflow-x-auto no-scrollbar border-b border-gray-100">
          {TABS.filter(tab => tab.id !== 'emergency' || canBrowseEmergency).map(tab => (
            <button key={tab.id} onClick={() => trySetTab(tab.id)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 whitespace-nowrap ${
                activeTab === tab.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Filter + Sort bar ── */}
        {hasTyped && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-gray-50 overflow-x-auto no-scrollbar">
            {/* Filters button */}
            <button onClick={() => setShowFilterSheet(true)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95 ${
                activeFilterCount > 0
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}>
              <SlidersHorizontal className="w-3.5 h-3.5"/>
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 min-w-[16px] h-4 rounded-full bg-white text-gray-900 text-[10px] font-black flex items-center justify-center px-0.5">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Sort button */}
            <button onClick={() => setShowSortSheet(true)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95 ${
                sort !== 'best_match'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}>
              <ArrowUpDown className="w-3.5 h-3.5"/>
              {SORT_LABELS[sort]}
            </button>

            {/* Active filter chips */}
            {filters.listingType !== 'all' && (
              <ActiveChip label={TYPE_LABELS[filters.listingType]} onRemove={() => setFilters(f => ({ ...f, listingType: 'all' }))}/>
            )}
            {filters.priceRange && (
              <ActiveChip label={PRICE_LABELS[filters.priceRange]} onRemove={() => setFilters(f => ({ ...f, priceRange: null }))}/>
            )}
            {filters.deliveryAvailable && (
              <ActiveChip label="Delivery" onRemove={() => setFilters(f => ({ ...f, deliveryAvailable: false }))}/>
            )}
            {filters.pickupOnly && (
              <ActiveChip label="Pickup" onRemove={() => setFilters(f => ({ ...f, pickupOnly: false }))}/>
            )}
            {filters.availableForHire && (
              <ActiveChip label="For Hire" onRemove={() => setFilters(f => ({ ...f, availableForHire: false }))}/>
            )}
            {filters.availableRemotely && (
              <ActiveChip label="Remote" onRemove={() => setFilters(f => ({ ...f, availableRemotely: false }))}/>
            )}
            {filters.availableToTravel && (
              <ActiveChip label="Travel" onRemove={() => setFilters(f => ({ ...f, availableToTravel: false }))}/>
            )}
          </div>
        )}

        {/* ── Scrollable body ── */}
        <div ref={resultsRef} className="flex-1 overflow-y-auto overscroll-contain">
          {!hasTyped && activeTab === 'all' ? (
            <PreSearch onSelect={val => { setQ(val); runSearch(val); }}/>
          ) : showSuggestions ? (
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4 pt-4 pb-2">Suggestions</p>
              <SuggestionList suggestions={suggestions} onSelect={handleSelectSuggestion} loading={suggLoading}/>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin"/>
              <span className="text-sm">Searching…</span>
            </div>
          ) : noResults ? (
            <EmptyState q={q} tab={activeTab}/>
          ) : (
            <div className="py-2">
              {/* Browse Search is always a preview experience -- every
                  regular category caps at PREVIEW_LIMIT (5) for guest and
                  logged-in alike, whether the user is just browsing or has
                  typed a search/applied a filter (this page never dumps a
                  full result set, typed or not). "View More" either
                  prompts signup (guest) or opens the full, uncapped
                  /search/category/:tab page (logged in, any tier alike),
                  carrying the current query/filters/sort along with it.
                  On the 'all' tab, everything below is grouped under its
                  product (Marketplace/Connect/Learning) per spec -- All is
                  a universal layer over the other three, never a fourth
                  product of its own. */}
              {/* All Results (typed query, activeTab 'all') -- exactly 3
                  product-labeled sections (Marketplace/Connect/Learning),
                  each capped at 6 in a 2-column grid with its own "View
                  all ->" header link and, when the real total exceeds 6,
                  a "View more {product} results (N)" footer. This
                  replaces the granular per-category sections ONLY for
                  this tab -- the Marketplace/Connect/Learning tabs' own
                  typed search below is completely untouched, still the
                  full per-category breakdown. */}
              {activeTab === 'all' && (() => {
                const sections: Partial<Record<SearchSource, ReactNode>> = {
                  marketplace: allMarketplaceCombined.length > 0 && (
                    <AllResultsSection key="marketplace" title="Marketplace" totalCount={allMarketplaceCombined.length}
                      moreLabel="Marketplace"
                      onViewAll={() => handleViewMoreCategory('marketplace')}
                      onViewMore={() => handleViewMoreCategory('marketplace')}>
                      <div className="grid grid-cols-2 gap-2.5 px-4">
                        {allMarketplaceCombined.slice(0, 6).map(l => (
                          <DiscoveryListingCard key={l.id} l={l} onNavigate={handleResultNavigate} gridMode/>
                        ))}
                      </div>
                    </AllResultsSection>
                  ),
                  connect: allConnectCombined.length > 0 && (
                    <AllResultsSection key="connect" title="Connect" totalCount={allConnectTotal}
                      moreLabel="Connect"
                      onViewAll={() => handleViewMoreCategory('connect')}
                      onViewMore={() => handleViewMoreCategory('connect')}>
                      <div className="grid grid-cols-2 gap-2.5 px-4 items-start">
                        {allConnectCombined.slice(0, 6).map(item => (
                          <AllResultsConnectCard
                            key={item.kind === 'creator' ? `c-${item.row.id}` : item.kind === 'portfolio' ? `p-${item.row.type}-${item.row.id}` : `post-${item.post.id}`}
                            item={item} onNavigate={handleResultNavigate}
                            onOpenPortfolio={(userId, albumId) => { handleClose(); openPortfolioPreview(userId, albumId); }}
                          />
                        ))}
                      </div>
                    </AllResultsSection>
                  ),
                  learning: visibleCourses.length > 0 && (
                    <AllResultsSection key="learning" title="FILMONS Learning" totalCount={visibleCourses.length}
                      moreLabel="Learning"
                      onViewAll={() => handleViewMoreCategory('courses')}
                      onViewMore={() => handleViewMoreCategory('courses')}>
                      <div className="grid grid-cols-2 gap-2.5 px-4">
                        {visibleCourses.slice(0, 6).map(c => <CourseCard key={c.id} course={c}/>)}
                      </div>
                    </AllResultsSection>
                  ),
                };
                // Rendered in recognition.sourcePriority order (e.g. "sony
                // fx3" -> Marketplace first, "cinematographer" -> Connect
                // first, "lighting course" -> Learning first) instead of a
                // fixed Marketplace/Connect/Learning order every time.
                return <>{recognition.sourcePriority.map(src => sections[src] || null)}</>;
              })()}
              {/* Search -> Marketplace, empty query: a discovery landing
                  page (Top/Latest/Nearby, mixed types + badges), NOT the
                  per-category preview list below -- that stays exactly as
                  it was for the 'all' tab and for Marketplace once the
                  viewer actually types something. */}
              {activeTab !== 'all' && (showMarketplaceLanding ? (
                <>
                  <MarketplaceDiscoveryRow title="Top listings" listings={topListings}
                    onNavigate={handleResultNavigate} onViewAll={() => handleViewAllDiscovery('top')}/>
                  <MarketplaceDiscoveryRow title="Latest listings" listings={latestListings}
                    onNavigate={handleResultNavigate} onViewAll={() => handleViewAllDiscovery('latest')}/>
                  <MarketplaceDiscoveryRow title="Listings nearby" listings={nearbyListings}
                    onNavigate={handleResultNavigate} onViewAll={() => handleViewAllDiscovery('nearby')}/>
                  {/* Always the viewer's real saved primaryRole, never a
                      guessed one -- MarketplaceDiscoveryRow already hides
                      itself when `listings` is empty, and roleListings is
                      forced to [] by the fetch effect above whenever
                      primaryRole is unset, so no extra gate is needed here. */}
                  {user?.primaryRole && (
                    <MarketplaceDiscoveryRow title={`Because you're a ${user.primaryRole}`} listings={roleListings}
                      onNavigate={handleResultNavigate} onViewAll={handleViewAllRole}/>
                  )}
                </>
              ) : (
                <>
                  {/* Rental/Sale/Studios/Services: a signed-in Creator-tier
                      account (below Professional/Business) sees the same 5-
                      result preview as everyone else, but "View more" opens
                      the upgrade gate instead of the full unrestricted
                      category page -- same treatment Opportunities already
                      had, now applied uniformly across Marketplace search
                      results. Guests keep their existing sign-up prompt
                      (handleGuestSeeMore) -- a guest isn't an account yet,
                      so "upgrade" doesn't apply the same way. */}
                  {visibleRental.length > 0 && (
                    <ResultSection label="📦 Rental" count={Math.min(visibleRental.length, PREVIEW_LIMIT)} grid
                      footer={visibleRental.length > PREVIEW_LIMIT
                        ? <ViewMoreButton onClick={() => !user ? handleGuestSeeMore('rental') : !canBrowseOpportunities ? setShowMarketplaceGate(true) : handleViewMoreCategory('rental')}/>
                        : hiddenEmergencyRental > 0 ? <EmergencyCategoryGateButton onClick={() => setShowEmergencyCategoryGate(true)}/> : undefined}>
                      {visibleRental.slice(0, PREVIEW_LIMIT).map(l => <MarketplaceCard key={l.id} l={l} onNavigate={handleResultNavigate}/>)}
                    </ResultSection>
                  )}
                  {visibleSale.length > 0 && (
                    <ResultSection label="🏷️ Sales" count={Math.min(visibleSale.length, PREVIEW_LIMIT)} grid
                      footer={visibleSale.length > PREVIEW_LIMIT
                        ? <ViewMoreButton onClick={() => !user ? handleGuestSeeMore('sale') : !canBrowseOpportunities ? setShowMarketplaceGate(true) : handleViewMoreCategory('sale')}/>
                        : hiddenEmergencySale > 0 ? <EmergencyCategoryGateButton onClick={() => setShowEmergencyCategoryGate(true)}/> : undefined}>
                      {visibleSale.slice(0, PREVIEW_LIMIT).map(l => <MarketplaceCard key={l.id} l={l} onNavigate={handleResultNavigate}/>)}
                    </ResultSection>
                  )}
                  {visibleStudios.length > 0 && (
                    <ResultSection label="🏢 Studios" count={Math.min(visibleStudios.length, PREVIEW_LIMIT)} grid
                      footer={visibleStudios.length > PREVIEW_LIMIT
                        ? <ViewMoreButton onClick={() => !user ? handleGuestSeeMore('studios') : !canBrowseOpportunities ? setShowMarketplaceGate(true) : handleViewMoreCategory('studios')}/>
                        : hiddenEmergencyStudios > 0 ? <EmergencyCategoryGateButton onClick={() => setShowEmergencyCategoryGate(true)}/> : undefined}>
                      {visibleStudios.slice(0, PREVIEW_LIMIT).map(l => <MarketplaceCard key={l.id} l={l} onNavigate={handleResultNavigate}/>)}
                    </ResultSection>
                  )}
                  {visibleServices.length > 0 && (
                    <ResultSection label="🛠️ Services" count={Math.min(visibleServices.length, PREVIEW_LIMIT)}
                      footer={visibleServices.length > PREVIEW_LIMIT
                        ? <ViewMoreButton onClick={() => !user ? handleGuestSeeMore('services') : !canBrowseOpportunities ? setShowMarketplaceGate(true) : handleViewMoreCategory('services')}/>
                        : hiddenEmergencyServices > 0 ? <EmergencyCategoryGateButton onClick={() => setShowEmergencyCategoryGate(true)}/> : undefined}>
                      {visibleServices.slice(0, PREVIEW_LIMIT).map(l => <ServiceCard key={l.id} l={l} onNavigate={handleResultNavigate}/>)}
                    </ResultSection>
                  )}
                  {visibleOpportunities.length > 0 && (
                    <ResultSection label="💼 Opportunities" count={Math.min(visibleOpportunities.length, canBrowseOpportunities ? PREVIEW_LIMIT : OPPORTUNITY_LOCKED_LIMIT)}
                      footer={canBrowseOpportunities
                        ? (visibleOpportunities.length > PREVIEW_LIMIT ? <ViewMoreButton onClick={() => handleViewMoreCategory('opportunities')}/> : undefined)
                        : (visibleOpportunities.length > OPPORTUNITY_LOCKED_LIMIT ? <MarketplaceLockedNotice label="opportunities" onClick={() => setShowMarketplaceGate(true)}/> : undefined)}>
                      {/* Opportunities has its own, stricter permanent cap for
                          Guest/Creator/Creator+ (!canBrowseOpportunities, which
                          covers a guest too since isProfessional(undefined) is
                          false) -- OPPORTUNITY_LOCKED_LIMIT (5), never exposed
                          further via View More, search, or filters. Professional/
                          Business get the same PREVIEW_LIMIT (5) as every other
                          category, with a real View More to the full page. */}
                      {visibleOpportunities.slice(0, canBrowseOpportunities ? PREVIEW_LIMIT : OPPORTUNITY_LOCKED_LIMIT).map(l => <OpportunityCard key={l.id} l={l} onNavigate={handleResultNavigate}/>)}
                    </ResultSection>
                  )}
                  {/* Dedicated Emergency section is Professional/Business only
                      now -- Guest/Creator/Creator+ never see it at all (not
                      even a preview), since Emergency isn't a browsable
                      category for them anymore. They still see emergency-
                      flagged listings inside Rental/Sales/Studios below, each
                      capped at EMERGENCY_LIMIT_RESTRICTED (2) with its own
                      badge. */}
                  {canBrowseEmergency && visibleEmergency.length > 0 && (
                    <ResultSection label="🚨 Emergency" count={visibleEmergency.length} grid>
                      {visibleEmergency.slice(0, 12).map(l => <MarketplaceCard key={l.id} l={l} onNavigate={handleResultNavigate}/>)}
                    </ResultSection>
                  )}
                </>
              ))}
              {/* Search -> Connect, empty query: the 5-section discovery
                  landing page -- People you may know/Trending in Connect/
                  Featured Portfolio/Popular Hashtags/Creator Activity, NOT
                  the generic Creators/Portfolio/Posts/Hashtags preview list
                  below. That list stays exactly as it was for the 'all' tab
                  and for Connect once the viewer actually types something. */}
              {activeTab !== 'all' && (showConnectLanding ? (
                <>
                  {connectSuggested.length > 0 && (
                    <ConnectDiscoveryRow title="People you may know" onViewAll={() => closeAndNavigate('/connections/suggested')}>
                      {connectSuggested.map(c => (
                        <SuggestedConnectionCard key={c.id} creator={c} showMenu
                          widthClassName="w-[172px] shrink-0 snap-start"
                          onConnected={() => {}}
                          onDismiss={() => {
                            setConnectSuggested(prev => prev.filter(x => x.id !== c.id));
                            if (user) dismissSuggestion(user.id, c.id);
                          }}
                        />
                      ))}
                    </ConnectDiscoveryRow>
                  )}
                  {/* Real, full Home-style post cards -- the exact same
                      PostCard/PortfolioProjectCard/PortfolioAlbumCard
                      components Home's Connect feed uses (Like/Comment/
                      Repost/Share/Save/•••, portfolio & listing
                      attachments, repost embeds, all included), stacked
                      vertically like a feed, not a horizontal row of
                      compact cards -- per spec, a Connect post must look
                      the same everywhere in FILMONS. */}
                  {connectTrendingPosts.length > 0 && (
                    <section className="mb-4">
                      <div className="flex items-center justify-between px-4 py-2">
                        <p className="text-[13px] font-black text-gray-900">Trending in Connect</p>
                        <ViewAllLink onClick={() => handleViewMoreCategory('posts')}/>
                      </div>
                      <div className="px-4 space-y-3">
                        {connectTrendingPosts.map(p => <PostCard key={p.id} post={p}/>)}
                      </div>
                    </section>
                  )}
                  {connectFeaturedPortfolio.length > 0 && (
                    <section className="mb-4">
                      <div className="flex items-center justify-between px-4 py-2">
                        <p className="text-[13px] font-black text-gray-900">Featured Portfolio</p>
                        <ViewAllLink onClick={() => handleViewMoreCategory('portfolio')}/>
                      </div>
                      <div className="px-4 space-y-3">
                        {connectFeaturedPortfolio.map(entry => entry.type === 'item'
                          ? <PortfolioProjectCard key={`item-${entry.id}`} entry={entry as Extract<PortfolioFeedEntry, { type: 'item' }>}/>
                          : <PortfolioAlbumCard key={`album-${entry.id}`} entry={entry as Extract<PortfolioFeedEntry, { type: 'album' }>}/>)}
                      </div>
                    </section>
                  )}
                  {connectPopularHashtags.length > 0 && (
                    <section className="mb-4">
                      <div className="flex items-center justify-between px-4 py-2">
                        <p className="text-[13px] font-black text-gray-900">Popular Hashtags</p>
                        <ViewAllLink onClick={() => handleViewMoreCategory('hashtags')}/>
                      </div>
                      <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pb-1 snap-x snap-mandatory scroll-pl-4">
                        {connectPopularHashtags.map(h => (
                          <button key={h.id} onClick={() => handleResultNavigate(`/hashtag/${h.tag}`)}
                            className="shrink-0 snap-start flex flex-col items-start gap-0.5 px-3.5 py-2 rounded-2xl bg-white border border-gray-100 shadow-sm">
                            <span className="text-sm font-black text-blue-600">#{h.tag}</span>
                            <span className="text-[10px] text-gray-400 font-bold">{h.post_count} post{h.post_count === 1 ? '' : 's'}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  {connectActivity.length > 0 && (
                    // No dedicated "everyone's activity" full page exists
                    // yet -- /connections/activity is scoped to the
                    // viewer's own connections, narrower than this row's
                    // broad public feed, but it's the closest real
                    // destination with the same compact-row format rather
                    // than building a whole new page for this one link.
                    <ConnectDiscoveryRow title="Creator Activity" onViewAll={() => closeAndNavigate('/connections/activity')}>
                      {connectActivity.map(entry => (
                        <CreatorActivityRow key={entry.id} entry={entry} onOpen={() => openActivityResource(entry)}/>
                      ))}
                    </ConnectDiscoveryRow>
                  )}
                </>
              ) : (
                <>
                  {visibleUsers.length > 0 && (
                    <ResultSection label="👤 Creators" count={Math.min(visibleUsers.length, PREVIEW_LIMIT)}
                      footer={visibleUsers.length > PREVIEW_LIMIT
                        ? <ViewMoreButton onClick={() => !user ? handleGuestSeeMore('creators') : handleViewMoreCategory('creators')}/> : undefined}>
                      {visibleUsers.slice(0, PREVIEW_LIMIT).map(u => <CreatorCard key={u.id} u={u} onNavigate={handleResultNavigate}/>)}
                    </ResultSection>
                  )}
                  {visiblePortfolio.length > 0 && (
                    <ResultSection label="🎬 Portfolio" count={Math.min(visiblePortfolio.length, PREVIEW_LIMIT)} grid
                      footer={visiblePortfolio.length > PREVIEW_LIMIT
                        ? <ViewMoreButton onClick={() => handleViewMoreCategory('portfolio')}/> : undefined}>
                      {visiblePortfolio.slice(0, PREVIEW_LIMIT).map(r => (
                        <button
                          key={`${r.type}-${r.id}`}
                          onClick={() => { handleClose(); openPortfolioPreview(r.user_id, r.type === 'album' ? r.id : undefined); }}
                          className="relative rounded-xl overflow-hidden bg-gray-100"
                          style={{ aspectRatio: 4 / 5 }}
                        >
                          {(r.thumbnail_url || r.media_url || r.cover_url) ? (
                            <img src={r.thumbnail_url || r.media_url || r.cover_url || ''} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">🎬</div>
                          )}
                          <span className="absolute bottom-1.5 left-1.5 right-1.5 text-[11px] font-bold text-white drop-shadow truncate text-left">{r.title}</span>
                        </button>
                      ))}
                    </ResultSection>
                  )}
                  {visiblePosts.length > 0 && (
                    <ResultSection label="📝 Posts" count={Math.min(visiblePosts.length, PREVIEW_LIMIT)}
                      footer={visiblePosts.length > PREVIEW_LIMIT
                        ? <ViewMoreButton onClick={() => handleViewMoreCategory('posts')}/> : undefined}>
                      <div className="px-4 space-y-3 py-1">
                        {shownPosts.map(p => <PostCard key={p.id} post={p} />)}
                      </div>
                    </ResultSection>
                  )}
                  {visibleHashtags.length > 0 && (
                    <section className="mb-1">
                      <div className="flex items-center justify-between px-4 py-2 mt-1">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest"># Hashtags</p>
                        {visibleHashtags.length > PREVIEW_LIMIT ? (
                          <button onClick={() => handleViewMoreCategory('hashtags')} className="text-[10px] font-bold text-blue-600">View all</button>
                        ) : (
                          <span className="text-[10px] text-gray-400">{visibleHashtags.length}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 px-4">
                        {visibleHashtags.slice(0, PREVIEW_LIMIT).map(h => (
                          <button key={h.tag} onClick={() => handleResultNavigate(`/hashtag/${h.tag}`)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-sm font-bold text-gray-700 hover:border-blue-300">
                            #{h.tag}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              ))}
              {activeTab !== 'all' && visibleCourses.length > 0 && (
                <ResultSection label="🎓 Courses" count={Math.min(visibleCourses.length, PREVIEW_LIMIT)} grid
                  footer={visibleCourses.length > PREVIEW_LIMIT
                    ? <ViewMoreButton onClick={() => handleViewMoreCategory('courses')}/> : undefined}>
                  {visibleCourses.slice(0, PREVIEW_LIMIT).map(c => <CourseCard key={c.id} course={c} />)}
                </ResultSection>
              )}
              {resultsReady && !loading && !hasVisible && !showConnectLanding && (
                <EmptyState q={q} tab={activeTab}/>
              )}
              {/* One final action below every section, opening the
                  combined, uncapped results page for whichever of the
                  four modes is active -- /search/category/all,
                  /marketplace, /connect, or /learning. Not shown on the
                  Marketplace landing page itself -- Top/Latest/Nearby/
                  "Because you're a {role}" already each have their own
                  "View all", and this page is deliberately organized as
                  independent discovery sections with no single global
                  "view everything" action. Not shown on the 'all' tab
                  either -- its 3 product sections (Marketplace/Connect/
                  Learning) already each carry their own "View all"/"View
                  more", and a single button here couldn't meaningfully
                  say which one it'd go to. */}
              {hasVisible && !showMarketplaceLanding && !showConnectLanding && activeTab !== 'all' && (
                <div className="px-4 pt-2 pb-4">
                  <button
                    onClick={() => !user ? handleGuestSeeMore(activeTab) : handleViewMoreCategory(activeTab)}
                    className="w-full py-3.5 rounded-2xl bg-gray-900 text-white text-sm font-bold text-center hover:bg-gray-800 transition-colors"
                  >
                    View all results
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Result count bar ── */}
        {resultsReady && hasResults && (
          <div className="shrink-0 border-t border-gray-100 px-4 py-2.5">
            <p className="text-xs text-gray-400">
              <span className="font-semibold text-gray-700">{filteredUsers.length + filteredListings.length}</span> results
              {filteredUsers.length    > 0 && ` · ${filteredUsers.length} creator${filteredUsers.length !== 1 ? 's' : ''}`}
              {filteredListings.length > 0 && ` · ${filteredListings.length} listing${filteredListings.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        )}
      </motion.div>

      {/* ── Filter + Sort sheets ── */}
      <AnimatePresence>
        {showFilterSheet && (
          <FilterSheet
            filters={filters}
            onApply={setFilters}
            onClose={() => setShowFilterSheet(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showSortSheet && (
          <SortSheet
            sort={sort}
            onSelect={setSort}
            onClose={() => setShowSortSheet(false)}
          />
        )}
      </AnimatePresence>

      {/* ── "Upgrade account" past the 5-result Marketplace search preview
           (Rental/Sale/Service/Studios/Opportunities alike) -- Professional
           or Business required for the rest, for Guest/Creator/Creator+
           alike. Never fetches or reveals anything further, just explains
           why and offers real next steps directly. Rental/Sale/Service/
           Studios route a guest to handleGuestSeeMore's own sign-up prompt
           instead of this gate (isProfessional(undefined) is false, so a
           guest simply never satisfies canBrowseOpportunities for those,
           same as a Creator-tier account); Opportunities' own permanent cap
           has no separate guest branch and sends a guest here directly --
           hence this modal still needs the !isAuthenticated "Sign up"
           button and "Explore" (not "Upgrade") wording on the plan
           buttons, both routing through the same login-first flow either
           way (setPendingReturnUrl to the auto-checkout URL, then /login,
           which itself bridges to signup for someone with no account). ── */}
      <AnimatePresence>
        {showMarketplaceGate && (
          <>
            <motion.div variants={backdropV} initial="hidden" animate="visible" exit="exit"
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[120] bg-black/50"
              onClick={() => setShowMarketplaceGate(false)}/>
            <motion.div variants={sheetV} initial="hidden" animate="visible" exit="exit"
              transition={{ type: 'spring', damping: 32, stiffness: 320, mass: 0.8 }}
              className="fixed inset-x-0 bottom-0 z-[125] bg-white rounded-t-3xl shadow-2xl px-5 pt-6"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
              <div className="text-center space-y-2 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto">
                  <Lock className="w-6 h-6 text-indigo-600"/>
                </div>
                <p className="text-base font-black text-gray-900">Unlock all Marketplace results</p>
                <p className="text-sm text-gray-500">
                  You're seeing the first {OPPORTUNITY_LOCKED_LIMIT} results.{' '}
                  {isAuthenticated ? 'Upgrade to a Professional or Business account to browse all Marketplace listings.'
                                    : 'Sign up and upgrade to a Professional or Business account to browse all Marketplace listings.'}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {!isAuthenticated && (
                  <button
                    onClick={() => { setShowMarketplaceGate(false); navigate('/create-account'); }}
                    className="w-full py-3.5 rounded-2xl bg-indigo-600 text-white font-bold text-sm active:opacity-80">
                    Sign up
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowMarketplaceGate(false);
                    if (!isAuthenticated) { setPendingReturnUrl('/account/upgrade?auto=professional'); navigate('/login'); return; }
                    navigate('/account/upgrade?auto=professional');
                  }}
                  className={`w-full py-3.5 rounded-2xl font-bold text-sm active:opacity-80 ${isAuthenticated ? 'bg-indigo-600 text-white' : 'border border-gray-200 text-gray-700'}`}>
                  {isAuthenticated ? 'Upgrade to Professional' : 'Explore Professional'}
                </button>
                <button
                  onClick={() => {
                    setShowMarketplaceGate(false);
                    if (!isAuthenticated) { setPendingReturnUrl('/account/upgrade?auto=business'); navigate('/login'); return; }
                    navigate('/account/upgrade?auto=business');
                  }}
                  className={`w-full py-3.5 rounded-2xl font-bold text-sm active:opacity-80 ${isAuthenticated ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-700'}`}>
                  {isAuthenticated ? 'Upgrade to Business' : 'Explore Business'}
                </button>
                <button onClick={() => setShowMarketplaceGate(false)}
                  className="w-full py-3 text-gray-500 font-semibold text-sm">
                  Not Now
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* "See more emergency listings" -- shared by every category section
          (Rental/Sales/Services/Studios) whose emergency items were capped
          at EMERGENCY_LIMIT_RESTRICTED (2). Reuses the same modal Home.tsx's
          dedicated Emergency tab (Professional/Business only now) and its
          own per-category gate both use. */}
      {showEmergencyCategoryGate && (
        <EmergencyUpgradeModal onClose={() => setShowEmergencyCategoryGate(false)} isAuthenticated={isAuthenticated}/>
      )}
    </>
  );
}
