import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Search, MapPin, Tag, Star, Globe } from 'lucide-react';
import { toast } from 'sonner';

function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: () => void; label: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-3 px-4">
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{sub}</p>}
      </div>
      <button
        onClick={onChange}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${on ? 'bg-blue-600' : 'bg-gray-200'}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-200 ${on ? 'left-5.5 translate-x-0.5' : 'left-0.5'}`}/>
      </button>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-4">
      <div className="flex items-center gap-2 mb-2 px-1">
        <div className="w-5 h-5 text-gray-400 flex items-center justify-center">{icon}</div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{title}</p>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
        {children}
      </div>
    </div>
  );
}

const LOCATION_OPTIONS = ['City only', 'City & Province', 'Full location', 'Hidden'];
const LOCATION_SUBS: Record<string, string> = {
  'City only':         'Show city name (e.g. Montreal)',
  'City & Province':   'Show city and province (e.g. Montreal, QC)',
  'Full location':     'Show full location details',
  'Hidden':            'Hide location from your profile',
};

export function DiscoverySettings() {
  const navigate = useNavigate();

  const [appearInSearch,       setAppearInSearch]       = useState(true);
  const [appearInRecs,         setAppearInRecs]         = useState(true);
  const [appearInFeatured,     setAppearInFeatured]     = useState(false);
  const [showInMarketplace,    setShowInMarketplace]    = useState(true);
  const [locationPrecision,    setLocationPrecision]    = useState('City only');
  const [locationOpen,         setLocationOpen]         = useState(false);

  const handleSave = () => {
    toast.success('Discovery settings saved');
    navigate('/settings');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/settings')}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-700"/>
        </button>
        <h1 className="text-base font-black text-gray-900">Search & Discovery</h1>
      </div>

      <div className="pt-4 space-y-5">

        {/* Discoverability */}
        <Section title="Discoverability" icon={<Search className="w-4 h-4"/>}>
          <Toggle
            on={appearInSearch}
            onChange={() => setAppearInSearch(v => !v)}
            label="Appear in search results"
            sub="Allow others to find your profile when searching by name, role, or location"
          />
          <Toggle
            on={appearInRecs}
            onChange={() => setAppearInRecs(v => !v)}
            label="Appear in recommendations"
            sub="Show up in 'Creators you might like' and home feed suggestions"
          />
          <Toggle
            on={appearInFeatured}
            onChange={() => setAppearInFeatured(v => !v)}
            label="Appear in Featured Creators"
            sub="Allow Filmons to feature your profile in curated spotlights"
          />
          <Toggle
            on={showInMarketplace}
            onChange={() => setShowInMarketplace(v => !v)}
            label="Show listings in Marketplace"
            sub="Make your gear and services visible in the public marketplace"
          />
        </Section>

        {/* Location */}
        <Section title="Location" icon={<MapPin className="w-4 h-4"/>}>
          <div>
            <button
              onClick={() => setLocationOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-900">Location precision</p>
                <p className="text-xs text-gray-400">{LOCATION_SUBS[locationPrecision]}</p>
              </div>
              <span className="text-xs font-semibold text-blue-600 shrink-0">{locationPrecision}</span>
            </button>
            {locationOpen && (
              <div className="border-t border-gray-50">
                {LOCATION_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    onClick={() => { setLocationPrecision(opt); setLocationOpen(false); }}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors ${locationPrecision === opt ? 'bg-blue-50' : ''}`}>
                    <div>
                      <p className={`text-sm font-semibold ${locationPrecision === opt ? 'text-blue-700' : 'text-gray-900'}`}>{opt}</p>
                      <p className="text-xs text-gray-400">{LOCATION_SUBS[opt]}</p>
                    </div>
                    {locationPrecision === opt && (
                      <span className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-white text-[8px] font-black">✓</span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* Profile visibility */}
        <Section title="Profile & Portfolio" icon={<Globe className="w-4 h-4"/>}>
          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-gray-900 mb-1">Profile visibility</p>
            <p className="text-xs text-gray-400 mb-3">Control who can see your full profile</p>
            {['Everyone', 'Followers only', 'Nobody'].map(opt => (
              <button
                key={opt}
                onClick={() => toast.info('Profile visibility saved')}
                className="w-full flex items-center gap-3 py-2.5 text-left">
                <span className="w-4 h-4 rounded-full border-2 border-gray-300 flex items-center justify-center shrink-0">
                  {opt === 'Everyone' && <span className="w-2 h-2 bg-blue-600 rounded-full"/>}
                </span>
                <p className="text-sm text-gray-800">{opt}</p>
              </button>
            ))}
          </div>
        </Section>

        {/* Categories */}
        <Section title="Categories" icon={<Tag className="w-4 h-4"/>}>
          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-gray-900 mb-1">Searchable categories</p>
            <p className="text-xs text-gray-400 mb-3">Tag yourself so the right clients find you</p>
            <div className="flex flex-wrap gap-2">
              {['Videographer','Photographer','Editor','Drone Pilot','Sound Designer','Colorist','Motion Graphics','Actor','Model','Influencer'].map(tag => (
                <button
                  key={tag}
                  onClick={() => toast.info('Category preferences coming soon')}
                  className="px-3 py-1.5 rounded-full border border-gray-200 text-xs font-semibold text-gray-700 hover:border-blue-400 hover:text-blue-700 transition-colors">
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* Rating */}
        <Section title="Reviews & Rating" icon={<Star className="w-4 h-4"/>}>
          <Toggle
            on={true}
            onChange={() => toast.info('Review visibility saved')}
            label="Show reviews on profile"
            sub="Display your ratings and written reviews publicly"
          />
          <Toggle
            on={true}
            onChange={() => toast.info('Rating visibility saved')}
            label="Show average rating"
            sub="Display your star rating in search results and listings"
          />
        </Section>

        {/* Save */}
        <div className="px-4 pt-2">
          <button
            onClick={handleSave}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-sm transition-colors">
            Save Changes
          </button>
        </div>

      </div>
    </div>
  );
}
