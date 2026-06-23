/**
 * Filmons — Universal AI Search Overlay
 * Instant typeahead suggestions + ranked results + filter sheet + sort picker.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, X, ArrowLeft, MapPin, Loader2, ChevronRight,
  TrendingUp, Clock, SlidersHorizontal, ArrowUpDown,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase';
import {
  expandQuery, normalize, scoreResult, extractLocation,
} from '../lib/searchUtils';

// ── Types ─────────────────────────────────────────────────────────────────────
type TabId = 'all' | 'creators' | 'portfolio' | 'marketplace' | 'services' | 'schools';
type SortBy = 'best_match' | 'newest' | 'price_asc' | 'price_desc';

interface ProfileRow {
  id: string; name: string; username: string | null; avatar_url: string | null;
  city: string | null; location: string | null; primary_role: string | null;
  bio: string | null; is_verified: boolean | null;
  available_for_hire?: boolean | null;
  available_remotely?: boolean | null;
  available_to_travel?: boolean | null;
}
interface ListingRow {
  id: string; title: string; description: string | null; price: number;
  city: string | null; province: string | null; images: string[] | null;
  listing_type: string; listing_mode: string | null;
  delivery_options?: string[] | null;
  payment_methods?: string[] | null;
  created_at?: string | null;
}
interface PortfolioRow {
  id: string; user_id: string; title: string; description: string | null;
  category: string | null; media_type: string; thumbnail_url: string | null;
  is_featured: boolean;
}

interface Suggestion {
  id: string; text: string; subtext?: string;
  icon: string; kind: 'listing' | 'creator' | 'service' | 'smart' | 'location'; action: string;
}

// ── Filter state ───────────────────────────────────────────────────────────────
type ListingTypeFilter = 'all' | 'rental' | 'sale' | 'service' | 'talent' | 'studio';
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
  all: 'All', rental: 'Rental', sale: 'Sale', service: 'Service', talent: 'Talent', studio: 'Studio',
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

  if (filters.listingType !== 'all') {
    listings = listings.filter(l => {
      switch (filters.listingType) {
        case 'rental':  return l.listing_mode === 'rent' && l.listing_type !== 'service';
        case 'sale':    return l.listing_mode === 'sale';
        case 'service': return l.listing_type === 'service';
        case 'talent':  return /model|actor|actress|talent|ugc/i.test(l.title ?? '');
        case 'studio':  return /studio/i.test(l.title ?? '');
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

  const [lRes, uRes] = await Promise.all([
    supabase.from('listings').select('id, title, listing_type, listing_mode')
      .ilike('title', `${ql}%`).limit(5),
    supabase.from('profiles').select('id, name, username, primary_role')
      .or(`name.ilike.${ql}%,username.ilike.${ql}%`)
      .not('name','is',null).neq('name','').limit(3),
  ]);

  const results: Suggestion[] = [];
  const seen = new Set<string>();

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
    results.push({ id:`db-u-${u.id}`, text:u.name, subtext:u.primary_role||'Creator', icon:'👤', kind:'creator', action:u.name });
  }
  for (const s of generateSmartSuggestions(rawQ)) {
    if (!seen.has(s.text)) { seen.add(s.text); results.push(s); }
  }
  return results.slice(0, 8);
}

// ── Universal search ───────────────────────────────────────────────────────────
function safe(s: string) { return s.replace(/[%_\\]/g, ''); }

// Columns confirmed to exist in DB (matches api.ts getAll select — no province)
const LISTING_SELECT  = 'id, title, description, price, city, listing_type, listing_mode, service_category, tags, images, created_at';
const PROFILE_SELECT  = 'id, name, username, avatar_url, city, location, primary_role, bio, is_verified';
const PORTFOLIO_SELECT = 'id, user_id, title, description, category, media_type, thumbnail_url, is_featured';

async function searchListingsByTerm(term: string): Promise<ListingRow[]> {
  // Search: title, description, service_category, city (text fields)
  const textRes = await supabase
    .from('listings')
    .select(LISTING_SELECT)
    .or([
      `title.ilike.%${term}%`,
      `description.ilike.%${term}%`,
      `service_category.ilike.%${term}%`,
      `city.ilike.%${term}%`,
    ].join(','))
    .limit(20);

  if (textRes.error) {
    console.error(`[Search] listings text error (term="${term}"):`, textRes.error.message);
  } else {
    console.log(`[Search] listings text: ${textRes.data?.length ?? 0} rows (term="${term}")`);
  }

  // Tags array: case-insensitive contains via raw filter
  const tagRes = await supabase
    .from('listings')
    .select(LISTING_SELECT)
    .filter('tags', 'cs', `{"${term}"}`)
    .limit(10);

  if (tagRes.error) {
    console.warn(`[Search] listings tags error (term="${term}"):`, tagRes.error.message);
  } else if (tagRes.data?.length) {
    console.log(`[Search] listings tags: ${tagRes.data.length} rows (term="${term}")`);
  }

  const seen = new Set<string>();
  const combined: ListingRow[] = [];
  for (const row of [...(textRes.data ?? []), ...(tagRes.data ?? [])]) {
    if (row?.id && !seen.has(row.id)) { seen.add(row.id); combined.push(row as unknown as ListingRow); }
  }
  return combined;
}

async function searchProfilesByTerm(term: string): Promise<ProfileRow[]> {
  const res = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .or([
      `name.ilike.%${term}%`,
      `username.ilike.%${term}%`,
      `primary_role.ilike.%${term}%`,
      `bio.ilike.%${term}%`,
      `city.ilike.%${term}%`,
    ].join(','))
    .not('name', 'is', null)
    .neq('name', '')
    .limit(15);

  if (res.error) {
    console.error(`[Search] profiles error (term="${term}"):`, res.error.message);
  } else {
    console.log(`[Search] profiles: ${res.data?.length ?? 0} rows (term="${term}")`);
  }
  return (res.data ?? []) as ProfileRow[];
}

async function searchAll(rawQ: string): Promise<{ users: ProfileRow[]; listings: ListingRow[]; portfolio: PortfolioRow[] }> {
  const q = rawQ.trim();
  if (!q) return { users: [], listings: [], portfolio: [] };

  const needle = safe(normalize(q));
  if (!needle) return { users: [], listings: [], portfolio: [] };

  // Alias terms — single-word, no special chars
  const aliasTerms = Array.from(new Set(
    expandQuery(rawQ)
      .filter(t => !t.includes(' ') && t.length >= 2)
      .map(t => safe(normalize(t)))
      .filter(t => t && t !== needle)
  )).slice(0, 3);

  const allTerms = [needle, ...aliasTerms];

  console.log('[Search] ──────────────────────────────');
  console.log(`[Search] raw query    : "${q}"`);
  console.log(`[Search] needle       : "${needle}"`);
  console.log(`[Search] alias terms  : [${aliasTerms.join(', ')}]`);
  console.log(`[Search] all terms    : [${allTerms.join(', ')}]`);
  console.log('[Search] tables       : listings, profiles, portfolio_items');

  // Run all term queries in parallel
  const [listingBatches, profileBatches, portRes] = await Promise.all([
    Promise.all(allTerms.map(searchListingsByTerm)),
    Promise.all(allTerms.map(searchProfilesByTerm)),
    supabase
      .from('portfolio_items')
      .select(PORTFOLIO_SELECT)
      .or(`title.ilike.%${needle}%,category.ilike.%${needle}%,description.ilike.%${needle}%`)
      .limit(10)
      .then(r => {
        if (r.error) console.warn('[Search] portfolio error:', r.error.message);
        else console.log(`[Search] portfolio: ${r.data?.length ?? 0} rows`);
        return (r.data ?? []) as PortfolioRow[];
      }, () => [] as PortfolioRow[]),
  ]);

  // Deduplicate across term batches
  const seenL = new Set<string>();
  const listings: ListingRow[] = [];
  for (const batch of listingBatches) {
    for (const l of batch) {
      if (!seenL.has(l.id)) { seenL.add(l.id); listings.push(l); }
    }
  }

  const seenU = new Set<string>();
  const users: ProfileRow[] = [];
  for (const batch of profileBatches) {
    for (const u of batch) {
      if (!seenU.has(u.id)) { seenU.add(u.id); users.push(u); }
    }
  }

  // Sort by relevance
  listings.sort((a, b) =>
    scoreResult(q, b.title, b.description ?? '', b.city ?? '') -
    scoreResult(q, a.title, a.description ?? '', a.city ?? ''));
  users.sort((a, b) =>
    scoreResult(q, b.name, b.primary_role ?? '', b.bio ?? '') -
    scoreResult(q, a.name, a.primary_role ?? '', a.bio ?? ''));

  console.log(`[Search] TOTAL → ${listings.length} listings | ${users.length} profiles | ${portRes.length} portfolio`);

  return { users, listings, portfolio: portRes };
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
  { id:'creators',    label:'Creators'    },
  { id:'portfolio',   label:'Portfolio'   },
  { id:'marketplace', label:'Marketplace' },
  { id:'services',    label:'Services'    },
  { id:'schools',     label:'Schools'     },
];

// ── Motion variants ────────────────────────────────────────────────────────────
const panelV     = { hidden:{ y:'100%' }, visible:{ y:0 }, exit:{ y:'100%' } };
const backdropV  = { hidden:{ opacity:0 }, visible:{ opacity:1 }, exit:{ opacity:0 } };
const sheetV     = { hidden:{ y:'100%' }, visible:{ y:0 }, exit:{ y:'100%' } };
const sheetBgV   = { hidden:{ opacity:0 }, visible:{ opacity:1 }, exit:{ opacity:0 } };
const chipContainerV = { hidden:{}, visible:{ transition:{ staggerChildren:0.03, delayChildren:0.08 } } };
const chipV  = { hidden:{ opacity:0, y:10 }, visible:{ opacity:1, y:0, transition:{ duration:0.2, ease:'easeOut' as const } } };
const listV  = { hidden:{}, visible:{ transition:{ staggerChildren:0.04 } } };
const itemV  = { hidden:{ opacity:0, y:8 }, visible:{ opacity:1, y:0, transition:{ duration:0.15, ease:'easeOut' as const } } };
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
  { id:'talent', label:'Talent', emoji:'🎭' },
  { id:'studio', label:'Studio', emoji:'🏢' },
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
  const set = <K extends keyof SearchFilters>(k: K, v: SearchFilters[K]) =>
    setLocal(prev => ({ ...prev, [k]: v }));

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
        {u.primary_role && <p className="text-xs text-blue-600 font-medium truncate">{u.primary_role}</p>}
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

function MarketplaceCard({ l, onNavigate }: { l: ListingRow; onNavigate: (url: string) => void }) {
  const price = `$${Number(l.price).toLocaleString()}${l.listing_mode === 'rent' ? '/day' : ''}`;
  return (
    <motion.button variants={itemV}
      onClick={() => onNavigate(`/listing/${l.id}`)}
      className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm active:scale-[0.97] transition-transform text-left">
      <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
        {l.images?.[0]
          ? <img src={l.images[0]} className="w-full h-full object-cover" alt=""/>
          : <div className="w-full h-full flex items-center justify-center text-2xl opacity-25">🎬</div>
        }
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

function ServiceCard({ l, onNavigate }: { l: ListingRow; onNavigate: (url: string) => void }) {
  return (
    <motion.button variants={itemV}
      onClick={() => onNavigate(`/listing/${l.id}`)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
      <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
        {l.images?.[0]
          ? <img src={l.images[0]} className="w-full h-full object-cover" alt=""/>
          : <div className="w-full h-full flex items-center justify-center text-xl opacity-25">🛠️</div>
        }
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-gray-900 truncate">{l.title}</p>
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

function PortfolioCard({ item, onNavigate }: { item: PortfolioRow; onNavigate: (url: string) => void }) {
  return (
    <motion.button variants={itemV}
      onClick={() => onNavigate(`/host/${item.user_id}?tab=portfolio`)}
      className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm active:scale-[0.97] transition-transform text-left">
      <div className="aspect-square bg-gray-100 overflow-hidden">
        {item.thumbnail_url
          ? <img src={item.thumbnail_url} className="w-full h-full object-cover" alt=""/>
          : <div className="w-full h-full flex items-center justify-center text-2xl opacity-25">
              {item.media_type === 'video' ? '🎬' : item.media_type === 'audio' ? '🎵' : '🖼️'}
            </div>
        }
      </div>
      <div className="p-2.5">
        <p className="text-xs font-bold text-gray-900 truncate leading-snug">{item.title}</p>
        {item.category && <p className="text-[10px] text-blue-500 mt-0.5 truncate">{item.category}</p>}
        {item.is_featured && <p className="text-[9px] text-amber-500 font-black mt-0.5">⭐ Featured</p>}
      </div>
    </motion.button>
  );
}

function ResultSection({ label, count, grid=false, children }: { label:string; count:number; grid?:boolean; children:ReactNode }) {
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
    </section>
  );
}

function EmptyState({ q }: { q: string }) {
  return (
    <div className="flex flex-col items-center py-20 text-center px-6">
      <span className="text-5xl mb-4">🔍</span>
      <p className="font-black text-gray-900 mb-1.5 text-base">No results for "{q}"</p>
      <p className="text-sm text-gray-400 leading-relaxed">Try different keywords, a location, or browse a category.</p>
    </div>
  );
}

function SchoolsPlaceholder() {
  return (
    <div className="flex flex-col items-center py-20 text-center px-6">
      <span className="text-5xl mb-4">🏫</span>
      <p className="font-bold text-gray-700 mb-1">Schools coming soon</p>
      <p className="text-sm text-gray-400 leading-relaxed">Search for film schools, colleges, and training programs across Canada.</p>
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
  onResultNavigate?: (url: string) => void;
}

export function SearchOverlay({ onClose, onResultNavigate }: Props) {
  const [q,              setQ]              = useState('');
  const [rawUsers,       setRawUsers]       = useState<ProfileRow[]>([]);
  const [rawListings,    setRawListings]    = useState<ListingRow[]>([]);
  const [portfolio,      setPortfolio]      = useState<PortfolioRow[]>([]);
  const [suggestions,    setSuggestions]    = useState<Suggestion[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [suggLoading,    setSuggLoading]    = useState(false);
  const [resultsReady,   setResultsReady]   = useState(false);
  const [activeTab,      setActiveTab]      = useState<TabId>('all');
  const [closing,        setClosing]        = useState(false);
  const [filters,        setFilters]        = useState<SearchFilters>(DEFAULT_FILTERS);
  const [sort,           setSort]           = useState<SortBy>('best_match');
  const [showFilterSheet,setShowFilterSheet]= useState(false);
  const [showSortSheet,  setShowSortSheet]  = useState(false);

  const inputRef    = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suggRef     = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleClose = useCallback(() => { setClosing(true); setTimeout(onClose, 280); }, [onClose]);

  // For result card clicks: if caller provides onResultNavigate, use it directly
  // (avoids the delayed navigate(-1) firing AFTER we've already navigated to the result).
  // For modal usage (Root.tsx), fall back to navigate(url) + delayed onClose.
  const handleResultNavigate = useCallback((url: string) => {
    setClosing(true);
    if (onResultNavigate) {
      onResultNavigate(url);
    } else {
      navigate(url);
      setTimeout(onClose, 280);
    }
  }, [navigate, onClose, onResultNavigate]);

  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 80); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [handleClose]);

  const runSearch = useCallback((query: string) => {
    if (!query.trim()) {
      setRawUsers([]); setRawListings([]); setPortfolio([]); setResultsReady(false); return;
    }
    setLoading(true); setResultsReady(false);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchAll(query)
        .then(({ users: u, listings: l, portfolio: p }) => {
          setRawUsers(u); setRawListings(l); setPortfolio(p);
          setResultsReady(true);
          if (u.length > 0 || l.length > 0 || p.length > 0) {
            try {
              const prev: string[] = JSON.parse(localStorage.getItem('filmons_recent_searches') ?? '[]');
              const next = [query.trim(), ...prev.filter(s => s !== query.trim())].slice(0, 5);
              localStorage.setItem('filmons_recent_searches', JSON.stringify(next));
            } catch {}
          }
        })
        .catch(() => { setResultsReady(true); })
        .finally(() => setLoading(false));
    }, 400);
  }, []);

  const handleQueryChange = (val: string) => {
    setQ(val); setActiveTab('all'); setResultsReady(false);
    if (!val.trim()) {
      setSuggestions([]); clearTimeout(suggRef.current); clearTimeout(debounceRef.current);
      setRawUsers([]); setRawListings([]); setPortfolio([]);
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
    setQ(s.action); setSuggestions([]); runSearch(s.action);
  };

  // Apply filters + sort to raw results
  const { listings: filteredListings, users: filteredUsers } = applyFilters(rawListings, rawUsers, filters, sort);

  const gearListings    = filteredListings.filter(l => l.listing_type !== 'service');
  const serviceListings = filteredListings.filter(l => l.listing_type === 'service');

  const visibleUsers     = (activeTab === 'all' || activeTab === 'creators' || activeTab === 'portfolio') ? filteredUsers : [];
  const visibleGear      = (activeTab === 'all' || activeTab === 'marketplace') ? gearListings : [];
  const visibleServices  = (activeTab === 'all' || activeTab === 'services') ? serviceListings : [];
  const visiblePortfolio = (activeTab === 'all' || activeTab === 'portfolio') ? portfolio : [];

  const hasTyped   = q.trim().length > 0;
  const noResults  = hasTyped && resultsReady && !loading && filteredUsers.length === 0 && filteredListings.length === 0 && portfolio.length === 0;
  const hasResults = filteredUsers.length > 0 || filteredListings.length > 0 || portfolio.length > 0;
  const hasVisible = visibleUsers.length > 0 || visibleGear.length > 0 || visibleServices.length > 0 || visiblePortfolio.length > 0;
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
              onKeyDown={e => { if (e.key === 'Enter' && q.trim()) { setSuggestions([]); runSearch(q); } }}
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

        {/* ── Result tabs ── */}
        {hasTyped && (
          <div className="shrink-0 flex gap-1.5 px-4 py-2.5 overflow-x-auto no-scrollbar border-b border-gray-100">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 whitespace-nowrap ${
                  activeTab === tab.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
        )}

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
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {!hasTyped ? (
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
            <EmptyState q={q}/>
          ) : (
            <div className="py-2">
              {visibleUsers.length > 0 && (
                <ResultSection label={activeTab === 'portfolio' ? '🎨 Portfolio Creators' : '👤 Creators'} count={visibleUsers.length}>
                  {visibleUsers.slice(0, 10).map(u => <CreatorCard key={u.id} u={u} onNavigate={handleResultNavigate}/>)}
                </ResultSection>
              )}
              {visiblePortfolio.length > 0 && activeTab !== 'creators' && (
                <ResultSection label="🎨 Portfolio" count={visiblePortfolio.length} grid>
                  {visiblePortfolio.map(item => <PortfolioCard key={item.id} item={item} onNavigate={handleResultNavigate}/>)}
                </ResultSection>
              )}
              {visibleGear.length > 0 && (
                <ResultSection label="📦 Marketplace" count={visibleGear.length} grid>
                  {visibleGear.slice(0, 12).map(l => <MarketplaceCard key={l.id} l={l} onNavigate={handleResultNavigate}/>)}
                </ResultSection>
              )}
              {visibleServices.length > 0 && (
                <ResultSection label="🛠️ Services" count={visibleServices.length}>
                  {visibleServices.slice(0, 10).map(l => <ServiceCard key={l.id} l={l} onNavigate={handleResultNavigate}/>)}
                </ResultSection>
              )}
              {activeTab === 'schools' && <SchoolsPlaceholder/>}
              {hasTyped && resultsReady && !hasVisible && !noResults && activeTab !== 'schools' && (
                <EmptyState q={q}/>
              )}
            </div>
          )}
        </div>

        {/* ── Result count bar ── */}
        {hasTyped && resultsReady && hasResults && (
          <div className="shrink-0 border-t border-gray-100 px-4 py-2.5">
            <p className="text-xs text-gray-400">
              <span className="font-semibold text-gray-700">{filteredUsers.length + filteredListings.length + portfolio.length}</span> results
              {filteredUsers.length    > 0 && ` · ${filteredUsers.length} creator${filteredUsers.length !== 1 ? 's' : ''}`}
              {filteredListings.length > 0 && ` · ${filteredListings.length} listing${filteredListings.length !== 1 ? 's' : ''}`}
              {portfolio.length        > 0 && ` · ${portfolio.length} portfolio`}
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
    </>
  );
}
