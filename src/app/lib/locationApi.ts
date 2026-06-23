/**
 * Filmons — Location API
 * Detects + searches locations in Canada only.
 * src/app/lib/locationApi.ts
 */
import { supabase } from '../../lib/supabase';

export interface LocationResult {
  id?:          string;     // set when result comes from DB
  name:         string;     // full display name
  city?:        string;
  province?:    string;
  postal_code?: string;
  lat?:         number;
  lng?:         number;
  uses?:        number;     // post count from DB
  source:       'db' | 'nominatim';
}

// ── Nominatim — free OSM geocoder, Canada only ────────────────────────────────
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

function shortName(display: string): string {
  const parts = display.split(', ');
  const seen  = new Set<string>();
  return parts
    .filter(p => { if (seen.has(p)) return false; seen.add(p); return true; })
    .slice(0, 4)
    .join(', ');
}

function parseNominatim(raw: any[]): LocationResult[] {
  return raw.map(r => {
    const parts = r.display_name?.split(', ') ?? [];
    // Try to extract postal code (Canadian format: A1A 1A1 or A1A1A1)
    const postal = parts.find((p: string) => /^[A-Z]\d[A-Z][\s-]?\d[A-Z]\d$/i.test(p));
    // Province: second-to-last before "Canada"
    const caIdx     = parts.lastIndexOf('Canada');
    const province  = caIdx > 0 ? parts[caIdx - 1] : undefined;
    const city      = parts[0];
    return {
      name:         shortName(r.display_name),
      city,
      province,
      postal_code:  postal,
      lat:          parseFloat(r.lat),
      lng:          parseFloat(r.lon),
      uses:         0,
      source:       'nominatim' as const,
    };
  });
}

export async function searchNominatim(query: string): Promise<LocationResult[]> {
  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&countrycodes=ca&format=json&addressdetails=0&limit=10&accept-language=en`;
    const res  = await fetch(url, { headers: { 'User-Agent': 'Filmons/1.0', 'Accept-Language': 'en' } });
    const data = await res.json();
    return parseNominatim(data);
  } catch { return []; }
}

// ── DB search (post_locations table) ─────────────────────────────────────────
export async function searchDbLocations(query: string, limit = 15): Promise<LocationResult[]> {
  const { data, error } = await supabase.rpc('search_post_locations', {
    p_query: query.trim(),
    p_limit: limit,
  });
  if (error || !data) return [];
  return (data as any[]).map(r => ({
    id:           r.id,
    name:         r.name,
    city:         r.city,
    province:     r.province,
    postal_code:  r.postal_code,
    uses:         r.uses ?? 0,
    source:       'db' as const,
  }));
}

// ── Combined search: DB first (has post counts), then Nominatim ───────────────
export async function searchLocations(query: string): Promise<LocationResult[]> {
  const q = query.trim();
  if (!q) return getPopularLocations();

  const [dbResults, osmResults] = await Promise.all([
    searchDbLocations(q),
    searchNominatim(q),
  ]);

  // Merge: DB results first, then OSM results not already in DB (dedup by name)
  const dbNames = new Set(dbResults.map(r => r.name.toLowerCase()));
  const unique  = osmResults.filter(r => !dbNames.has(r.name.toLowerCase()));
  return [...dbResults, ...unique].slice(0, 20);
}

// ── Top locations by usage ────────────────────────────────────────────────────
export async function getPopularLocations(limit = 20): Promise<LocationResult[]> {
  const { data } = await supabase
    .from('locations')
    .select('id, name, city, province, postal_code, uses')
    .order('uses', { ascending: false })
    .limit(limit);
  if (data?.length) {
    return (data as any[]).map(r => ({ ...r, source: 'db' as const }));
  }
  // Fallback: top Canadian cities
  return TOP_CITIES;
}

// ── Upsert location to DB and return id ──────────────────────────────────────
export async function upsertLocation(loc: LocationResult): Promise<string | null> {
  const { data, error } = await supabase.rpc('upsert_location', {
    p_name:        loc.name,
    p_city:        loc.city        ?? null,
    p_province:    loc.province    ?? null,
    p_postal_code: loc.postal_code ?? null,
    p_country:     'Canada',
    p_lat:         loc.lat ?? null,
    p_lng:         loc.lng ?? null,
  });
  if (error) { console.error(error); return null; }
  return data as string;
}

// ── Attach location to post ───────────────────────────────────────────────────
export async function attachLocationToPost(postId: string, loc: LocationResult): Promise<void> {
  const locId = loc.id ?? await upsertLocation(loc);
  if (!locId) return;
  await supabase.from('post_locations').upsert(
    { post_id: postId, location_id: locId },
    { onConflict: 'post_id,location_id', ignoreDuplicates: true }
  );
}

// ── GPS: reverse-geocode device position ─────────────────────────────────────
export function detectGpsLocation(): Promise<LocationResult | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const { latitude: lat, longitude: lng } = pos.coords;
          const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`;
          const res  = await fetch(url, { headers: { 'User-Agent': 'Filmons/1.0' } });
          const data = await res.json();
          if (data?.display_name) {
            const results = parseNominatim([{ ...data, lat: String(lat), lon: String(lng) }]);
            resolve(results[0] ?? null);
          } else { resolve(null); }
        } catch { resolve(null); }
      },
      () => resolve(null),
      { timeout: 8000, maximumAge: 60000 }
    );
  });
}

// ── Fallback top cities ───────────────────────────────────────────────────────
const TOP_CITIES: LocationResult[] = [
  { name:'Vancouver, BC, Canada',     city:'Vancouver',    province:'BC', uses:0, source:'nominatim', lat:49.2827, lng:-123.1207 },
  { name:'Toronto, ON, Canada',       city:'Toronto',      province:'ON', uses:0, source:'nominatim', lat:43.6532, lng:-79.3832  },
  { name:'Montréal, QC, Canada',      city:'Montréal',     province:'QC', uses:0, source:'nominatim', lat:45.5017, lng:-73.5673  },
  { name:'Calgary, AB, Canada',       city:'Calgary',      province:'AB', uses:0, source:'nominatim', lat:51.0447, lng:-114.0719 },
  { name:'Edmonton, AB, Canada',      city:'Edmonton',     province:'AB', uses:0, source:'nominatim', lat:53.5461, lng:-113.4938 },
  { name:'Ottawa, ON, Canada',        city:'Ottawa',       province:'ON', uses:0, source:'nominatim', lat:45.4215, lng:-75.6972  },
  { name:'Winnipeg, MB, Canada',      city:'Winnipeg',     province:'MB', uses:0, source:'nominatim', lat:49.8951, lng:-97.1384  },
  { name:'Québec City, QC, Canada',   city:'Québec City',  province:'QC', uses:0, source:'nominatim', lat:46.8139, lng:-71.2080  },
  { name:'Hamilton, ON, Canada',      city:'Hamilton',     province:'ON', uses:0, source:'nominatim', lat:43.2557, lng:-79.8711  },
  { name:'Surrey, BC, Canada',        city:'Surrey',       province:'BC', uses:0, source:'nominatim', lat:49.1913, lng:-122.8490 },
  { name:'Halifax, NS, Canada',       city:'Halifax',      province:'NS', uses:0, source:'nominatim', lat:44.6488, lng:-63.5752  },
  { name:'Saskatoon, SK, Canada',     city:'Saskatoon',    province:'SK', uses:0, source:'nominatim', lat:52.1332, lng:-106.6700 },
  { name:'Regina, SK, Canada',        city:'Regina',       province:'SK', uses:0, source:'nominatim', lat:50.4452, lng:-104.6189 },
  { name:'Kelowna, BC, Canada',       city:'Kelowna',      province:'BC', uses:0, source:'nominatim', lat:49.8880, lng:-119.4960 },
  { name:'Victoria, BC, Canada',      city:'Victoria',     province:'BC', uses:0, source:'nominatim', lat:48.4284, lng:-123.3656 },
];