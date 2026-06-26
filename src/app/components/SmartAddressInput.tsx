/**
 * SmartAddressInput — reusable Canadian address autocomplete widget.
 *
 * mode="city"  → typed text becomes "City, Province" on selection (for profiles, signup)
 * mode="full"  → typed text stays as the full address string; onAddressSelect gives
 *               all parsed components (for listings, checkout, etc.)
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { MapPin, Navigation, Loader2, X } from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { toast } from 'sonner';

const EDGE = `https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879`;

export interface AddressComponents {
  formatted:     string;
  streetAddress: string;
  city:          string;
  province:      string;
  postalCode:    string;
  country?:      string; // ISO short code, e.g. 'CA' or 'US'
  lat?:          number;
  lng?:          number;
}

interface Prediction {
  place_id: string;
  description: string;
  structured_formatting?: { main_text: string; secondary_text?: string };
  /** Pre-parsed components from Nominatim fallback — skip details fetch when present */
  _parts?: AddressComponents;
}

export interface SmartAddressInputProps {
  /** Controlled text in the input box */
  value: string;
  /** Raw text changes (typing) */
  onInputChange: (val: string) => void;
  /**
   * Fired when the user picks a suggestion or GPS detects.
   * @param display  The cleaned display string (e.g. "Toronto, ON")
   * @param parts    Full address breakdown (city/province/postal/street)
   */
  onAddressSelect?: (display: string, parts: AddressComponents) => void;
  mode?:          'city' | 'full';
  placeholder?:   string;
  label?:         string;
  className?:     string;
  showGPS?:       boolean;
  canadaOnly?:    boolean;
  /** ISO country code to restrict results. Overrides canadaOnly when set. */
  countryCode?:   'CA' | 'US';
  disabled?:      boolean;
  variant?:       'light' | 'dark';
}

function parseComps(comps: any[], mode: 'city' | 'full', geometry?: any): AddressComponents {
  let streetNum = '', route = '', city = '', province = '', postalCode = '', country = '';
  for (const c of comps) {
    if (c.types.includes('street_number'))               streetNum  = c.long_name;
    if (c.types.includes('route'))                       route      = c.long_name;
    if (c.types.includes('locality') ||
        c.types.includes('sublocality_level_1'))         city       = city || c.long_name;
    if (c.types.includes('administrative_area_level_1')) province   = c.short_name;
    if (c.types.includes('postal_code'))                 postalCode = c.long_name;
    if (c.types.includes('country'))                     country    = c.short_name;
  }
  const streetAddress = [streetNum, route].filter(Boolean).join(' ');
  const formatted = mode === 'city'
    ? [city, province].filter(Boolean).join(', ')
    : [streetAddress, city, province, postalCode].filter(Boolean).join(', ');
  const lat = geometry?.location?.lat;
  const lng = geometry?.location?.lng;
  return { formatted, streetAddress, city, province, postalCode, country, lat, lng };
}

export function SmartAddressInput({
  value,
  onInputChange,
  onAddressSelect,
  mode        = 'city',
  placeholder,
  label,
  className   = '',
  showGPS     = true,
  canadaOnly  = true,
  countryCode,
  disabled    = false,
  variant     = 'light',
}: SmartAddressInputProps) {
  // Effective country: explicit countryCode wins, else fall back to canadaOnly
  const effectiveCountry = countryCode ?? (canadaOnly ? 'CA' : null);
  const dark = variant === 'dark';
  const [predictions,   setPredictions]   = useState<Prediction[]>([]);
  const [showDrop,      setShowDrop]      = useState(false);
  const [isSearching,   setIsSearching]   = useState(false);
  const [isDetecting,   setIsDetecting]   = useState(false);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setShowDrop(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Abort any in-flight request on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Keep a ref to the current in-flight request so we can abort it on new input
  const abortRef = useRef<AbortController | null>(null);

  const fetchPredictions = useCallback(async (text: string) => {
    if (!text.trim() || text.length < 3) { setPredictions([]); setShowDrop(false); return; }

    // Cancel any previous in-flight request
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setIsSearching(true);
    let usedFallback = false;
    try {
      const countryParam = effectiveCountry ? `&country=${effectiveCountry.toLowerCase()}` : '';
      const typeParam    = mode === 'city' ? '&type=city' : '&type=address';
      const res = await fetch(
        `${EDGE}/geocode/autocomplete?input=${encodeURIComponent(text)}${countryParam}${typeParam}`,
        { headers: { Authorization: `Bearer ${publicAnonKey}` }, signal: ctrl.signal }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const preds: Prediction[] = data.predictions ?? [];
      if (!ctrl.signal.aborted) {
        if (preds.length > 0) {
          setPredictions(preds);
          setShowDrop(true);
        } else {
          // Edge function succeeded but returned nothing — try Nominatim
          usedFallback = true;
          throw new Error('EMPTY');
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError' && !ctrl.signal.aborted) {
        // Nominatim fallback — respects effectiveCountry for both CA and US
        try {
          const cc  = effectiveCountry?.toLowerCase() ?? 'ca';
          const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&countrycodes=${cc}&format=json&addressdetails=1&limit=8&accept-language=en`;
          const nomRes  = await fetch(url, { headers: { 'User-Agent': 'Filmons/1.0', 'Accept-Language': 'en' }, signal: ctrl.signal });
          const nomData = await nomRes.json() as any[];
          if (!ctrl.signal.aborted) {
            const preds: Prediction[] = nomData.map(r => {
              const addr     = r.address ?? {};
              const city     = addr.city || addr.town || addr.village || addr.county || r.display_name.split(', ')[0];
              const province = addr.state_code || addr.ISO3166_2_lvl4?.split('-')[1] || addr.state || '';
              const country  = (addr.country_code ?? '').toUpperCase();
              const desc     = [city, province].filter(Boolean).join(', ') || r.display_name;
              return {
                place_id:    String(r.place_id),
                description: desc,
                structured_formatting: {
                  main_text:      city || desc,
                  secondary_text: [province, addr.country].filter(Boolean).join(', '),
                },
                _parts: {
                  formatted:     desc,
                  streetAddress: '',
                  city,
                  province,
                  postalCode:    addr.postcode ?? '',
                  country,
                  lat:           parseFloat(r.lat),
                  lng:           parseFloat(r.lon),
                },
              };
            });
            setPredictions(preds);
            setShowDrop(preds.length > 0);
          }
        } catch (nomErr: any) {
          if (nomErr?.name !== 'AbortError') setPredictions([]);
        }
      }
      void usedFallback; // suppress unused-variable warning
    } finally {
      if (!ctrl.signal.aborted) setIsSearching(false);
    }
  }, [effectiveCountry, mode]);

  const handleChange = (val: string) => {
    onInputChange(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchPredictions(val), 350);
  };

  const handleSelect = useCallback(async (p: Prediction) => {
    setShowDrop(false);
    setPredictions([]);

    // ── Nominatim fallback predictions carry pre-parsed parts — no extra fetch needed
    if (p._parts) {
      const parts  = p._parts;
      const display = mode === 'city'
        ? (parts.city && parts.province ? `${parts.city}, ${parts.province}` : p.description)
        : p.description;
      onInputChange(display);
      onAddressSelect?.(display, parts);
      return;
    }

    // ── Google Places prediction — fetch full details for address components + geometry
    onInputChange(p.description);
    try {
      const res = await fetch(
        `${EDGE}/geocode/details?place_id=${encodeURIComponent(p.place_id)}`,
        { headers: { Authorization: `Bearer ${publicAnonKey}` } }
      );
      const data = await res.json();
      const result = data.results?.[0];
      const comps: any[]  = result?.address_components ?? [];
      const geometry: any = result?.geometry;

      if (effectiveCountry) {
        const inCountry = comps.some((c: any) => c.types.includes('country') && c.short_name === effectiveCountry);
        if (!inCountry) {
          const name = effectiveCountry === 'CA' ? 'Canada' : 'the United States';
          toast.error(`Please select a location in ${name}.`);
          return;
        }
      }

      const parts = parseComps(comps, mode, geometry);
      const display = mode === 'city'
        ? (parts.city && parts.province ? `${parts.city}, ${parts.province}` : p.description)
        : p.description;

      onInputChange(display);
      onAddressSelect?.(display, parts);
    } catch {
      onAddressSelect?.(p.description, { formatted: p.description, streetAddress: '', city: '', province: '', postalCode: '' });
    }
  }, [mode, effectiveCountry, onInputChange, onAddressSelect]);

  const handleGPS = () => {
    if (!navigator.geolocation) { toast.error('Geolocation not supported in your browser.'); return; }
    setIsDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude, longitude } }) => {
        try {
          const res = await fetch(
            `${EDGE}/geocode/reverse?lat=${latitude}&lng=${longitude}`,
            { headers: { Authorization: `Bearer ${publicAnonKey}` } }
          );
          const data = await res.json();
          const result = data.results?.[0];
          if (!result) { toast.error('Could not determine your location.'); return; }
          const comps: any[]  = result.address_components ?? [];
          const geometry: any = result.geometry;
          if (effectiveCountry) {
            const inCountry = comps.some((c: any) => c.types.includes('country') && c.short_name === effectiveCountry);
            if (!inCountry) {
              const name = effectiveCountry === 'CA' ? 'Canada' : 'the United States';
              toast.error(`Your GPS location is outside ${name}.`);
              return;
            }
          }
          const parts = parseComps(comps, mode, geometry);
          const display = mode === 'city'
            ? (parts.city && parts.province ? `${parts.city}, ${parts.province}` : result.formatted_address)
            : result.formatted_address;
          onInputChange(display);
          onAddressSelect?.(display, parts);
          toast.success('📍 Location detected!', { description: display });
        } catch {
          toast.error('Failed to detect location. Please enter manually.');
        } finally {
          setIsDetecting(false);
        }
      },
      (err) => {
        setIsDetecting(false);
        if (err.code === 1) toast.error('Location access denied — please enter manually.');
        else toast.error('Could not get your location. Try again or type it.');
      }
    );
  };

  // Bold-highlight matched portion of suggestion text
  const highlight = (text: string) => {
    const q = value.trim().toLowerCase();
    if (!q) return <span>{text}</span>;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return <span>{text}</span>;
    return (
      <span>
        {text.slice(0, idx)}
        <strong className="text-blue-700 font-semibold">{text.slice(idx, idx + q.length)}</strong>
        {text.slice(idx + q.length)}
      </span>
    );
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <p className={`text-xs font-semibold uppercase tracking-widest ${dark ? 'text-white/40' : 'text-gray-400'}`}>{label}</p>
      )}
      <div className="flex gap-2" ref={containerRef}>
        {/* Input + dropdown */}
        <div className="relative flex-1">
          <MapPin className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none z-10 ${dark ? 'text-white/40' : 'text-gray-400'}`} />
          <input
            type="text"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => predictions.length > 0 && setShowDrop(true)}
            placeholder={placeholder ?? (mode === 'city' ? 'e.g. Toronto, ON' : 'Start typing your address…')}
            disabled={disabled}
            className={`w-full pl-9 pr-9 py-3.5 text-sm rounded-2xl outline-none transition disabled:opacity-50 ${
              dark
                ? 'bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-blue-400'
                : 'border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-50 text-gray-900'
            }`}
          />
          {/* Right icon: spinner or clear */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {isSearching ? (
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            ) : value ? (
              <button
                type="button"
                onClick={() => { onInputChange(''); setPredictions([]); setShowDrop(false); }}
                className={dark ? 'text-white/30 hover:text-white/60' : 'text-gray-300 hover:text-gray-500'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>

          {/* Suggestions dropdown */}
          {showDrop && predictions.length > 0 && (
            <div className={`absolute z-50 top-full left-0 right-0 mt-1 rounded-2xl shadow-xl overflow-hidden ${
              dark ? 'bg-gray-900 border border-white/15' : 'bg-white border border-gray-200'
            }`}>
              {predictions.map((p) => (
                <button
                  key={p.place_id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(p); }}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors border-b last:border-0 group ${
                    dark
                      ? 'hover:bg-white/10 border-white/5 text-white/80'
                      : 'hover:bg-blue-50 border-gray-50 text-gray-800'
                  }`}
                >
                  <MapPin className={`w-4 h-4 mt-0.5 shrink-0 ${dark ? 'text-white/30 group-hover:text-blue-400' : 'text-gray-400 group-hover:text-blue-500'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {highlight(p.structured_formatting?.main_text ?? p.description)}
                    </p>
                    {p.structured_formatting?.secondary_text && (
                      <p className={`text-xs truncate ${dark ? 'text-white/40' : 'text-gray-400'}`}>{p.structured_formatting.secondary_text}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* GPS button */}
        {showGPS && (
          <button
            type="button"
            onClick={handleGPS}
            disabled={isDetecting || disabled}
            title="Use my current location"
            className={`shrink-0 w-11 h-11 flex items-center justify-center rounded-2xl border transition-colors disabled:opacity-50 ${
              dark
                ? 'border-white/20 bg-white/10 hover:bg-blue-600/20 hover:border-blue-400 text-white/50 hover:text-blue-400'
                : 'border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-300 text-gray-500 hover:text-blue-600'
            }`}
          >
            {isDetecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}