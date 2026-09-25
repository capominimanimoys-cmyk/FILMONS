/**
 * Filmons — Universal Search Utilities
 * Alias expansion, accent-insensitive matching, location detection,
 * Supabase OR filter building, and client-side ranking.
 * Apply to: SearchOverlay, Marketplace, MyListings, SavedListings.
 */
import type { Listing } from '../types';

// ── Text normalization ────────────────────────────────────────────────────────
/** Lowercase + strip accents (é→e, ü→u, etc.) for accent-insensitive compare. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['']/g, "'");
}

// ── Known Canadian cities (for location detection) ────────────────────────────
export const KNOWN_CITIES: string[] = [
  'Vancouver', 'Surrey', 'Burnaby', 'Richmond', 'White Rock',
  'Kelowna', 'Victoria', 'Nanaimo', 'Abbotsford', 'Langley',
  'Coquitlam', 'Delta', 'Maple Ridge', 'Prince George', 'Kamloops',
  'Toronto', 'Mississauga', 'Brampton', 'Ottawa', 'Hamilton',
  'London', 'Markham', 'Vaughan', 'Kitchener', 'Windsor', 'Kingston',
  'Montreal', 'Laval', 'Quebec City', 'Longueuil', 'Sherbrooke',
  'Calgary', 'Edmonton', 'Red Deer', 'Lethbridge',
  'Winnipeg', 'Halifax', 'Saskatoon', 'Regina', 'Fredericton',
];

const PROVINCE_MAP: Record<string, string[]> = {
  'BC': ['bc', 'british columbia'],
  'ON': ['on', 'ontario'],
  'QC': ['qc', 'quebec'],
  'AB': ['ab', 'alberta'],
  'MB': ['mb', 'manitoba'],
  'SK': ['sk', 'saskatchewan'],
  'NS': ['ns', 'nova scotia'],
  'NB': ['nb', 'new brunswick'],
  'NL': ['nl', 'newfoundland'],
};

/** Detects city/province/near-me signals from a raw query string. */
export function extractLocation(rawQ: string): { city?: string; province?: string; nearMe?: boolean } {
  const q = normalize(rawQ);
  const words = q.split(/\s+/);

  const nearMe = q.includes('near me') || q.includes('nearby') || q.includes('close by');

  let city: string | undefined;
  for (const c of KNOWN_CITIES) {
    if (q.includes(normalize(c))) { city = c; break; }
  }

  let province: string | undefined;
  for (const [abbr, variants] of Object.entries(PROVINCE_MAP)) {
    if (variants.some(v => words.includes(v))) { province = abbr; break; }
  }

  return { city, province, nearMe: nearMe || undefined };
}

// ── Marketplace intent detection ─────────────────────────────────────────────
// Rental/Sale/Service/Opportunity words behave as search INTENT, not
// ordinary keywords -- "camera rental" means "Rental listings about
// cameras", not "listings whose title/description literally contains the
// word rental". Tokenized (never substring-matched, so "workshop"/
// "artwork"/"workflow"/"workstation"/"network"/"serviceable" never false-
// positive on containing "work"/"service") and checked at ANY token
// position, not just the first word.
export type MarketplaceIntentType = 'rental' | 'sale' | 'service' | 'opportunity';

// Multi-word phrases matched as whole phrases (so "for sale"/"hire
// someone"/"second hand"/"professional service" consume their full
// phrase, never just a fragment); single words matched as whole tokens.
// "hire" is deliberately NOT listed under any type here -- it's ambiguous
// on its own ("hire camera" vs "hire a photographer" vs "hiring a
// photographer" all mean different things) and gets special-cased below.
const MARKETPLACE_INTENT_PHRASES: Record<MarketplaceIntentType, string[]> = {
  rental:      ['rental', 'rentals', 'rent', 'renting'],
  sale:        ['sale', 'sales', 'for sale', 'buy', 'buying', 'purchase', 'used', 'second hand'],
  service:     ['service', 'services', 'freelancer', 'freelancers', 'professional service', 'hire someone'],
  opportunity: ['opportunity', 'opportunities', 'job', 'jobs', 'work', 'works'],
};

// Equipment/gear nouns -- used only to disambiguate a bare "hire" (see
// detectMarketplaceIntent below): "hire camera" means Rental (the OBJECT
// of "hire" is equipment), "hire a photographer" means Service (the
// object is a person/role).
const EQUIPMENT_TERMS = new Set([
  'camera', 'cameras', 'lens', 'lenses', 'gimbal', 'stabilizer', 'tripod',
  'light', 'lights', 'lighting', 'led', 'drone', 'drones', 'mic', 'microphone',
  'audio', 'recorder', 'monitor', 'grip', 'slider', 'dolly', 'jib', 'crane',
  'softbox', 'strobe', 'flash', 'reflector', 'cstand', 'gear', 'equipment', 'kit', 'rig',
]);

const MARKETPLACE_STOP_WORDS = new Set(['a', 'an', 'the']);

/**
 * "camera rental"        -> { intents: ['rental'], remainder: "camera" }
 * "Sony FX3 for sale"    -> { intents: ['sale'], remainder: "sony fx3" }
 * "editing services"     -> { intents: ['service'], remainder: "editing" }
 * "cinematographer jobs" -> { intents: ['opportunity'], remainder: "cinematographer" }
 * "hire camera"          -> { intents: ['rental'], remainder: "camera" }
 * "hire a photographer"  -> { intents: ['service'], remainder: "photographer" }
 * "hiring a photographer"-> { intents: ['opportunity'], remainder: "photographer" }
 * "rental or sale camera"-> { intents: ['rental','sale'], remainder: "camera" }
 * "workshop"              -> { intents: [], remainder: "workshop" }
 * Every matching phrase/token is stripped from the remainder, and more
 * than one intent can be detected at once (e.g. "rental or sale camera").
 */
export function detectMarketplaceIntent(rawQ: string): { intents: MarketplaceIntentType[]; remainder: string } {
  let text = ` ${normalize(rawQ).trim()} `;
  if (text.trim().length === 0) return { intents: [], remainder: rawQ.trim() };

  const found = new Set<MarketplaceIntentType>();

  // Multi-word phrases first, so they consume their full phrase before
  // single-word matching below could otherwise pick off a component word
  // out of context (e.g. "for" alone means nothing, but must not leave a
  // dangling "for" in the remainder once "for sale" is removed).
  for (const type of Object.keys(MARKETPLACE_INTENT_PHRASES) as MarketplaceIntentType[]) {
    for (const phrase of MARKETPLACE_INTENT_PHRASES[type].filter(p => p.includes(' '))) {
      const needle = ` ${phrase} `;
      if (text.includes(needle)) { found.add(type); text = text.split(needle).join(' '); }
    }
  }

  const singleWordMap = new Map<string, MarketplaceIntentType>();
  for (const type of Object.keys(MARKETPLACE_INTENT_PHRASES) as MarketplaceIntentType[]) {
    for (const phrase of MARKETPLACE_INTENT_PHRASES[type].filter(p => !p.includes(' '))) singleWordMap.set(phrase, type);
  }

  const kept: string[] = [];
  let pendingHire: 'hire' | 'hiring' | null = null;
  for (const w of text.trim().split(/\s+/).filter(Boolean)) {
    if (w === 'hire' || w === 'hiring') { pendingHire = w; continue; }
    const mapped = singleWordMap.get(w);
    if (mapped) { found.add(mapped); continue; }
    kept.push(w);
  }

  if (pendingHire === 'hiring') {
    found.add('opportunity');
  } else if (pendingHire === 'hire') {
    found.add(kept.some(w => EQUIPMENT_TERMS.has(w)) ? 'rental' : 'service');
  }

  const remainder = kept.filter(w => !MARKETPLACE_STOP_WORDS.has(w)).join(' ');
  return { intents: Array.from(found), remainder };
}

/** Back-compat single-intent view for callers that only care about
 * Opportunity specifically. */
export function detectOpportunityIntent(rawQ: string): { isOpportunity: boolean; remainder: string } {
  const { intents, remainder } = detectMarketplaceIntent(rawQ);
  return { isOpportunity: intents.includes('opportunity'), remainder };
}

// ── Alias groups ──────────────────────────────────────────────────────────────
// Any term in a group matches all others in that group bidirectionally.
const ALIAS_GROUPS: string[][] = [
  // DJI & Drones
  [
    'dji', 'drone', 'drones', 'fpv', 'mavic', 'phantom', 'inspire',
    'aerial', 'aerials', 'air2s', 'mini3', 'rs4', 'rs3',
    'drone pilot', 'drone operator', 'drone service', 'aerial filming',
    'aerial photography', 'aerial video',
  ],
  // Cameras — general
  ['camera', 'cam', 'dslr', 'mirrorless', 'cinemagear', 'digicam'],
  // Sony
  ['sony', 'fx3', 'fx6', 'fx9', 'a7siii', 'a7s', 'a7iii', 'a7', 'a1', 'a6400', 'a6600', 'zv'],
  // Canon
  ['canon', 'eos', 'c70', 'c300', 'c500', 'c70', 'r5', 'r6', '5d', '6d', 'rebel'],
  // Blackmagic
  ['blackmagic', 'bmpcc', 'ursa', 'braw', 'pocket cinema', 'resolve'],
  // RED
  ['red', 'komodo', 'monstro', 'helium', 'raven', 'v-raptor', 'gemini'],
  // Fujifilm
  ['fuji', 'fujifilm', 'xt4', 'xt5', 'gfx', 'xh2'],
  // Arri
  ['arri', 'alexa', 'amira', 'mini lf', 'alexa mini'],
  // Gimbal / Stabilizer
  ['gimbal', 'stabilizer', 'ronin', 'zhiyun', 'crane', 'weebill', 'smooth', 'handheld rig'],
  // Lenses
  ['lens', 'lenses', 'prime', 'anamorphic', 'sigma', 'zeiss', 'rokinon', 'samyang', 'voigtlander', 'cooke'],
  // Grip / Support
  ['grip', 'tripod', 'monopod', 'cstand', 'slider', 'jib', 'dolly', 'track', 'rig', 'follow focus'],
  // Lighting
  [
    'light', 'lighting', 'led', 'aputure', 'godox', 'nanlite', 'nanlux',
    'strobe', 'flash', 'softbox', 'reflector', 'tungsten', 'hmi', 'rgblight',
    'aperture', 'profoto',
  ],
  // Audio / Sound
  [
    'audio', 'sound', 'mic', 'microphone', 'recorder', 'boom', 'lavalier', 'lav',
    'rode', 'sennheiser', 'shure', 'zoom', 'tascam', 'xlr', 'podcast',
    'voiceover', 'shotgun', 'wireless mic', 'audio engineer', 'sound design',
  ],
  // Music Production
  [
    'music', 'producer', 'beat', 'beats', 'mixing', 'mastering', 'daw',
    'ableton', 'logic', 'flstudio', 'protools', 'musician', 'composer',
    'soundtrack', 'score', 'session musician',
  ],
  // Streaming / Broadcast
  ['stream', 'streaming', 'broadcast', 'live', 'elgato', 'capturecard', 'obs', 'twitch', 'youtube live'],
  // Videography / Film
  [
    'video', 'videographer', 'videography', 'filming', 'film', 'filmmaker',
    'cinematographer', 'cinematography', 'dp', 'dop', 'director of photography',
    'camera operator', 'camop', 'shoot', 'production',
  ],
  // Photography
  [
    'photo', 'photography', 'photographer', 'photoshoot', 'portrait',
    'headshot', 'boudoir', 'event photography', 'wedding photo', 'product photo',
    'fashion photo', 'real estate photo',
  ],
  // Editing / Post Production
  [
    'editor', 'editing', 'post', 'postproduction', 'colorist', 'colorgrade',
    'colourgrade', 'davinci', 'premiere', 'finalcut', 'avid', 'motiondesign',
    'motiongraphics', 'vfx', 'visualeffects', 'animation', '3d', 'cgi',
  ],
  // Studio / Space
  [
    'studio', 'soundstage', 'greenscreen', 'cycwall', 'shootingspace',
    'photostudio', 'filmstudio', 'productionspace', 'creative space',
  ],
  // Services / Weddings / Events
  [
    'wedding', 'weddings', 'event', 'events', 'corporate', 'commercial',
    'interview', 'documentary', 'musicvideo', 'advert', 'advertisement', 'promo',
  ],
  // Streaming / Podcast
  [
    'podcast', 'podcasting', 'podcaststudio', 'podcastsetup', 'podcastproduction',
    'interview setup', 'talk show',
  ],
  // Gaming / Esports
  ['gaming', 'game', 'gamer', 'esport', 'esports', 'twitch', 'streamer', 'fps', 'speedrun'],
  // Fashion / Wardrobe / Talent
  ['model', 'talent', 'actor', 'actress', 'influencer', 'ugc', 'brand deal', 'content creator'],
  // Props / Set Design
  ['prop', 'props', 'costume', 'wardrobe', 'setdressing', 'setdesign', 'art director'],
  // Real Estate
  ['real estate', 'property', 'realestate', 'matterport', 'virtual tour', 'floor plan'],
  // Aerial / Location scouting
  ['location', 'scout', 'locationscout', 'permit', 'permit scout'],
];

// ── Core expansion ────────────────────────────────────────────────────────────
function termMatchesAlias(word: string, alias: string): boolean {
  if (word.length < 2) return false;
  // Strip spaces for comparison
  const w = word.replace(/\s+/g, '');
  const a = alias.replace(/\s+/g, '');
  if (a === w) return true;
  if (w.length >= 3 && a.startsWith(w)) return true;
  if (a.length >= 3 && w.startsWith(a)) return true;
  if (w.length >= 3 && a.length >= 3 && (a.includes(w) || w.includes(a))) return true;
  return false;
}

// Single-slot memo -- scoreResult (below) calls expandQuery(rawQuery) fresh
// on EVERY comparison inside a results .sort() in filmSearch.ts, and a
// sort of n results makes O(n log n) comparisons, each calling scoreResult
// twice (once per side). That was re-running this whole 26-group alias
// scan from scratch tens of thousands of times per search for no reason --
// every one of those calls shares the exact same rawQuery for the entire
// sort (a single JS .sort() call is synchronous/atomic, so there's no risk
// of a different in-flight query invalidating this mid-sort). Caching the
// last input/output pair turns all of those into a cache hit after the
// first call.
let lastExpandInput: string | null = null;
let lastExpandResult: string[] = [];

/**
 * Expands a raw query into all alias terms.
 * "dji" → ["dji", "drone", "aerial", "fpv", "mavic", ...]
 * "sony camera" → ["sony", "fx3", "a7siii", ..., "camera", "cam", ...]
 */
export function expandQuery(rawQ: string): string[] {
  if (rawQ === lastExpandInput) return lastExpandResult;

  const q = normalize(rawQ).trim();
  if (!q) return (lastExpandInput = rawQ), (lastExpandResult = []);

  const words = q.split(/\s+/).filter(w => w.length >= 2);
  const expanded = new Set<string>([q, ...words]);

  for (const group of ALIAS_GROUPS) {
    for (const word of words) {
      if (group.some(alias => termMatchesAlias(word, normalize(alias)))) {
        group.forEach(term => expanded.add(normalize(term)));
        // don't break — a query can match multiple groups (e.g. "sony camera")
      }
    }
  }

  const result = Array.from(expanded).slice(0, 16);
  lastExpandInput = rawQ;
  lastExpandResult = result;
  return result;
}

// ── Client-side matching ──────────────────────────────────────────────────────
/** Returns true if a listing matches the search query (client-side, full alias expansion). */
export function matchesListing(listing: Listing, rawQ: string): boolean {
  if (!rawQ.trim()) return true;
  const haystack = normalize([
    listing.title,
    listing.description ?? '',
    listing.city ?? '',
    listing.province ?? '',
    listing.listingType,
    listing.serviceCategory ?? '',
    listing.listingMode ?? '',
    ...(listing.tags ?? []),
  ].join(' '));
  return expandQuery(rawQ).some(term => haystack.includes(term));
}

/**
 * Score a result for ranking (higher = more relevant).
 * Pass normalized haystack fields individually for best accuracy.
 */
export function scoreResult(rawQ: string, title: string, secondary = '', tertiary = ''): number {
  const q = normalize(rawQ).trim();
  const t = normalize(title);
  const s = normalize(secondary);
  const r = normalize(tertiary);
  let score = 0;
  if (t === q) score += 100;
  else if (t.startsWith(q)) score += 80;
  else if (t.includes(q)) score += 60;
  if (s.includes(q)) score += 30;
  if (r.includes(q)) score += 15;
  // Alias-term bonus
  for (const term of expandQuery(rawQ).slice(0, 5)) {
    if (t.includes(term)) { score += 10; break; }
  }
  return score;
}

// ── Supabase OR filter builders ───────────────────────────────────────────────
function safe(term: string): string {
  return term.replace(/[%_\\,]/g, '');
}

/**
 * Returns only single-word terms safe for PostgREST OR filter strings.
 * Multi-word phrases with spaces break PostgREST's OR parser.
 * Since every multi-word alias has component words listed separately, this loses no power.
 */
function safeTerms(rawQ: string): string[] {
  return expandQuery(rawQ)
    .filter(t => !t.includes(' '))
    .map(safe)
    .filter(t => t.length >= 2)
    .slice(0, 10);
}

/** Supabase OR filters for searching listings (title + description + city). */
export function buildListingFilters(rawQ: string): string[] {
  const terms = safeTerms(rawQ);
  const filters: string[] = [];
  for (const t of terms) {
    filters.push(`title.ilike.%${t}%`, `description.ilike.%${t}%`, `city.ilike.%${t}%`);
  }
  // Raw words as direct fallback
  for (const w of normalize(rawQ).split(/\s+/).filter(w => w.length >= 2)) {
    const t = safe(w);
    if (t && !terms.includes(t)) filters.push(`title.ilike.%${t}%`, `city.ilike.%${t}%`);
  }
  return filters;
}

/** Supabase OR filters for searching creator profiles. */
export function buildProfileFilters(rawQ: string): string[] {
  const terms = safeTerms(rawQ);
  const filters: string[] = [];
  for (const t of terms) {
    filters.push(
      `name.ilike.%${t}%`,
      `username.ilike.%${t}%`,
      `bio.ilike.%${t}%`,
      `primary_role.ilike.%${t}%`,
      `city.ilike.%${t}%`,
      `location.ilike.%${t}%`,
    );
  }
  for (const w of normalize(rawQ).split(/\s+/).filter(w => w.length >= 2)) {
    const t = safe(w);
    if (t && !terms.includes(t)) filters.push(`name.ilike.%${t}%`, `city.ilike.%${t}%`);
  }
  return filters;
}

/** Supabase OR filters for searching portfolio_items. */
export function buildPortfolioFilters(rawQ: string): string[] {
  const terms = safeTerms(rawQ);
  const filters: string[] = [];
  for (const t of terms) {
    filters.push(`title.ilike.%${t}%`, `description.ilike.%${t}%`, `category.ilike.%${t}%`);
  }
  for (const w of normalize(rawQ).split(/\s+/).filter(w => w.length >= 2)) {
    const t = safe(w);
    if (t && !terms.includes(t)) filters.push(`title.ilike.%${t}%`);
  }
  return filters;
}
