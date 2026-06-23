import { useState } from 'react';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Slider } from './ui/slider';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from './ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Filter, X } from 'lucide-react';

export interface FilterOptions {
  listingType: string[];
  listingMode: string[];
  condition: string[];         // 'new' | 'like-new' | 'good' | 'fair'
  maxDistance: number | null;  // km radius, null = any
  priceRange: [number, number];
  cities: string[];
  sortBy: string;
}

interface FilterPanelProps {
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  availableCities: string[];
  hasLocation?: boolean;
}

const CANADIAN_CITIES = [
  'Abbotsford','Airdrie','Barrie','Brandon','Brampton','Burnaby','Burlington',
  'Calgary','Cambridge','Charlottetown','Chilliwack','Coquitlam','Corner Brook',
  'Dartmouth','Edmonton','Fort McMurray','Fredericton','Gatineau','Grande Prairie',
  'Guelph','Halifax','Hamilton','Iqaluit','Kamloops','Kelowna','Kingston',
  'Kitchener','Laval','Lethbridge','Levis','London','Longueuil','Markham',
  'Medicine Hat','Mississauga','Moncton','Montreal','Moose Jaw','Mount Pearl',
  'Nanaimo','Niagara Falls','Ottawa','Oakville','Oshawa','Penticton',
  'Prince Albert','Prince George','Quebec City','Red Deer','Regina','Richmond',
  'Saguenay','Saint John',"St. John's",'Saskatoon','Sherbrooke','Surrey',
  'Summerside','Sydney','Terrebonne','Toronto','Trois-Rivieres','Truro',
  'Vancouver','Vaughan','Vernon','Victoria','Waterloo','Whitehorse','Windsor',
  'Winnipeg','Yellowknife',
].sort();

const SORT_OPTIONS = [
  { value: 'relevance',   label: 'Relevance' },
  { value: 'price-low',   label: 'Price: Low to High' },
  { value: 'price-high',  label: 'Price: High to Low' },
  { value: 'newest',      label: 'Newest First' },
  { value: 'distance',    label: 'Distance (nearest first)' },
];

const CONDITIONS = [
  { value: 'new',      label: 'New' },
  { value: 'like-new', label: 'Like New' },
  { value: 'good',     label: 'Good' },
  { value: 'fair',     label: 'Fair' },
];

const DISTANCE_OPTIONS = [10, 25, 50, 100];

const DEFAULT_FILTERS: FilterOptions = {
  listingType: [], listingMode: [], condition: [], maxDistance: null,
  priceRange: [0, 10000], cities: [], sortBy: 'relevance',
};

export function FilterPanel({ filters, onFiltersChange, availableCities, hasLocation }: FilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [local, setLocal] = useState<FilterOptions>(filters);

  const set = <K extends keyof FilterOptions>(key: K, value: FilterOptions[K]) =>
    setLocal(prev => ({ ...prev, [key]: value }));

  const toggle = (key: 'listingType' | 'listingMode' | 'condition' | 'cities', value: string) => {
    const arr = local[key] as string[];
    set(key, (arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]) as FilterOptions[typeof key]);
  };

  const apply = () => { onFiltersChange(local); setIsOpen(false); };

  const reset = () => { setLocal(DEFAULT_FILTERS); onFiltersChange(DEFAULT_FILTERS); };

  const activeCount =
    local.listingType.length +
    local.listingMode.length +
    local.condition.length +
    (local.maxDistance !== null ? 1 : 0) +
    local.cities.length +
    (local.priceRange[0] > 0 || local.priceRange[1] < 10000 ? 1 : 0);

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => { setLocal(filters); setIsOpen(true); }}
        className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-semibold px-3 py-2 rounded-xl active:scale-95 transition-all shrink-0"
      >
        <Filter className="w-3.5 h-3.5"/>
        Filters
        {activeCount > 0 && (
          <span className="bg-blue-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none">
            {activeCount}
          </span>
        )}
      </button>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[90dvh] overflow-y-auto px-0 pb-safe">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base font-black">Filters</SheetTitle>
              {activeCount > 0 && (
                <button onClick={reset} className="text-xs text-blue-600 font-semibold">
                  Reset all
                </button>
              )}
            </div>
          </SheetHeader>

          <div className="px-5 py-5 space-y-7">

            {/* Sort */}
            <div className="space-y-2.5">
              <Label className="text-sm font-black text-gray-900">Sort by</Label>
              <Select value={local.sortBy} onValueChange={v => set('sortBy', v)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue/>
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Listing type */}
            <div className="space-y-2.5">
              <Label className="text-sm font-black text-gray-900">Type</Label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { value: 'gear',    label: 'Film Gear' },
                  { value: 'service', label: 'Services' },
                ].map(({ value, label }) => {
                  const active = local.listingType.includes(value);
                  return (
                    <button key={value} onClick={() => toggle('listingType', value)}
                      className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                        active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                      }`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Availability */}
            <div className="space-y-2.5">
              <Label className="text-sm font-black text-gray-900">Availability</Label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { value: 'rent', label: 'For Rent' },
                  { value: 'sale', label: 'For Sale' },
                ].map(({ value, label }) => {
                  const active = local.listingMode.includes(value);
                  return (
                    <button key={value} onClick={() => toggle('listingMode', value)}
                      className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                        active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                      }`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Condition */}
            <div className="space-y-2.5">
              <Label className="text-sm font-black text-gray-900">Condition</Label>
              <div className="flex gap-2 flex-wrap">
                {CONDITIONS.map(({ value, label }) => {
                  const active = local.condition.includes(value);
                  return (
                    <button key={value} onClick={() => toggle('condition', value)}
                      className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                        active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                      }`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Distance — only if location granted */}
            {hasLocation && (
              <div className="space-y-2.5">
                <Label className="text-sm font-black text-gray-900">Distance</Label>
                <div className="flex gap-2 flex-wrap">
                  {DISTANCE_OPTIONS.map(km => {
                    const active = local.maxDistance === km;
                    return (
                      <button key={km} onClick={() => set('maxDistance', active ? null : km)}
                        className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                          active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                        }`}>
                        Within {km} km
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Price range */}
            <div className="space-y-3">
              <Label className="text-sm font-black text-gray-900">
                Price: ${local.priceRange[0].toLocaleString()} – ${local.priceRange[1].toLocaleString()} CAD
              </Label>
              <Slider
                min={0} max={10000} step={50}
                value={local.priceRange}
                onValueChange={v => set('priceRange', v as [number, number])}
                className="py-3"
              />
            </div>

            {/* City */}
            <div className="space-y-2.5">
              <Label className="text-sm font-black text-gray-900">City</Label>
              <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                {(availableCities.length ? availableCities : CANADIAN_CITIES).map(city => (
                  <div key={city} className="flex items-center gap-2">
                    <Checkbox
                      id={`city-${city}`}
                      checked={local.cities.includes(city)}
                      onCheckedChange={() => toggle('cities', city)}
                    />
                    <label htmlFor={`city-${city}`}
                      className="text-sm text-gray-700 cursor-pointer leading-none">
                      {city}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex gap-3">
            <button onClick={reset}
              className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 text-gray-700 text-sm font-semibold py-3 rounded-xl active:scale-95 transition-all">
              <X className="w-3.5 h-3.5"/> Reset
            </button>
            <button onClick={apply}
              className="flex-1 bg-blue-600 text-white text-sm font-bold py-3 rounded-xl hover:bg-blue-700 active:scale-95 transition-all">
              Show results {activeCount > 0 ? `(${activeCount})` : ''}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
