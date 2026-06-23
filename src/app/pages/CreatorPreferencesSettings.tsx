import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Zap, Calendar, DollarSign, MapPin, Briefcase, MessageSquare } from 'lucide-react';
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

type AvailStatus = 'available' | 'busy' | 'unavailable';
type BookingType = 'dms' | 'form' | 'calendar';
type RateDisplay = 'show' | 'hide' | 'on_request';

const STATUS_OPTIONS: { id: AvailStatus; label: string; sub: string; color: string }[] = [
  { id: 'available',   label: 'Available',    sub: 'Open to new projects and bookings',     color: 'bg-green-500'  },
  { id: 'busy',        label: 'Busy',         sub: 'Limited availability — may take longer', color: 'bg-amber-500'  },
  { id: 'unavailable', label: 'Unavailable',  sub: 'Not accepting new work right now',       color: 'bg-gray-400'   },
];

const BOOKING_OPTIONS: { id: BookingType; label: string; sub: string }[] = [
  { id: 'dms',      label: 'Direct Messages', sub: 'Clients contact you via Filmons inbox' },
  { id: 'form',     label: 'Contact Form',    sub: 'Clients fill a form on your profile'   },
  { id: 'calendar', label: 'Calendar Link',   sub: 'Clients book directly from your calendar' },
];

const RATE_OPTIONS: { id: RateDisplay; label: string; sub: string }[] = [
  { id: 'show',       label: 'Show Rates',     sub: 'Display starting rates on your profile and listings' },
  { id: 'hide',       label: 'Hide Rates',     sub: 'Rates hidden — clients must contact you'             },
  { id: 'on_request', label: 'On Request',     sub: 'Show "Rates available on request"'                   },
];

const WORK_STYLES = ['Remote', 'On-location', 'Studio', 'Travel', 'Hybrid'];
const INDUSTRIES  = ['Film', 'Photography', 'Music', 'Events', 'Commercial', 'Fashion', 'Corporate', 'Social Media', 'Documentary', 'Wedding'];

export function CreatorPreferencesSettings() {
  const navigate = useNavigate();

  const [status,        setStatus]       = useState<AvailStatus>('available');
  const [bookingType,   setBookingType]  = useState<BookingType>('dms');
  const [rateDisplay,   setRateDisplay]  = useState<RateDisplay>('show');
  const [workStyles,    setWorkStyles]   = useState<string[]>(['Remote', 'On-location']);
  const [industries,    setIndustries]   = useState<string[]>(['Film', 'Photography']);
  const [autoReply,     setAutoReply]    = useState(false);
  const [autoMsg,       setAutoMsg]      = useState('Thanks for reaching out! I\'ll get back to you within 24 hours.');
  const [openToCollabs, setOpenToCollabs] = useState(true);
  const [travelAvail,   setTravelAvail]  = useState(false);

  const toggleSet = (set: string[], item: string, setter: (v: string[]) => void) => {
    setter(set.includes(item) ? set.filter(s => s !== item) : [...set, item]);
  };

  const handleSave = () => {
    toast.success('Creator preferences saved');
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
        <h1 className="text-base font-black text-gray-900">Creator Preferences</h1>
      </div>

      <div className="pt-4 space-y-5">

        {/* Availability */}
        <Section title="Availability" icon={<Zap className="w-4 h-4"/>}>
          <div className="p-3 space-y-2">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => setStatus(opt.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                  status === opt.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white hover:border-gray-200'
                }`}>
                <span className={`w-3 h-3 rounded-full shrink-0 ${opt.color}`}/>
                <div className="flex-1">
                  <p className={`text-sm font-bold ${status === opt.id ? 'text-blue-700' : 'text-gray-900'}`}>{opt.label}</p>
                  <p className="text-xs text-gray-400">{opt.sub}</p>
                </div>
                {status === opt.id && (
                  <span className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-white text-[9px] font-black">✓</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </Section>

        {/* Booking */}
        <Section title="Booking" icon={<Calendar className="w-4 h-4"/>}>
          <div className="p-3 space-y-2">
            {BOOKING_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => setBookingType(opt.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                  bookingType === opt.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white hover:border-gray-200'
                }`}>
                <div className="flex-1">
                  <p className={`text-sm font-bold ${bookingType === opt.id ? 'text-blue-700' : 'text-gray-900'}`}>{opt.label}</p>
                  <p className="text-xs text-gray-400">{opt.sub}</p>
                </div>
                {bookingType === opt.id && (
                  <span className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-white text-[9px] font-black">✓</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </Section>

        {/* Rate Display */}
        <Section title="Rate Display" icon={<DollarSign className="w-4 h-4"/>}>
          <div className="p-3 space-y-2">
            {RATE_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => setRateDisplay(opt.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                  rateDisplay === opt.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white hover:border-gray-200'
                }`}>
                <div className="flex-1">
                  <p className={`text-sm font-bold ${rateDisplay === opt.id ? 'text-blue-700' : 'text-gray-900'}`}>{opt.label}</p>
                  <p className="text-xs text-gray-400">{opt.sub}</p>
                </div>
                {rateDisplay === opt.id && (
                  <span className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-white text-[9px] font-black">✓</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </Section>

        {/* Work Style */}
        <Section title="Work Style" icon={<MapPin className="w-4 h-4"/>}>
          <div className="px-4 py-3">
            <p className="text-xs text-gray-400 mb-3">Select all that apply</p>
            <div className="flex flex-wrap gap-2">
              {WORK_STYLES.map(style => {
                const active = workStyles.includes(style);
                return (
                  <button
                    key={style}
                    onClick={() => toggleSet(workStyles, style, setWorkStyles)}
                    className={`px-3.5 py-2 rounded-full text-xs font-bold transition-all active:scale-95 ${
                      active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}>
                    {style}
                  </button>
                );
              })}
            </div>
          </div>
          <Toggle
            on={travelAvail}
            onChange={() => setTravelAvail(v => !v)}
            label="Available to travel"
            sub="Clients can book you for out-of-city or international projects"
          />
        </Section>

        {/* Industries */}
        <Section title="Industries" icon={<Briefcase className="w-4 h-4"/>}>
          <div className="px-4 py-3">
            <p className="text-xs text-gray-400 mb-3">Industries you work in</p>
            <div className="flex flex-wrap gap-2">
              {INDUSTRIES.map(ind => {
                const active = industries.includes(ind);
                return (
                  <button
                    key={ind}
                    onClick={() => toggleSet(industries, ind, setIndustries)}
                    className={`px-3.5 py-2 rounded-full text-xs font-bold transition-all active:scale-95 ${
                      active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}>
                    {ind}
                  </button>
                );
              })}
            </div>
          </div>
        </Section>

        {/* Collaboration & Auto-reply */}
        <Section title="Communication" icon={<MessageSquare className="w-4 h-4"/>}>
          <Toggle
            on={openToCollabs}
            onChange={() => setOpenToCollabs(v => !v)}
            label="Open to collaborations"
            sub="Let other creators know you're available to co-create"
          />
          <Toggle
            on={autoReply}
            onChange={() => setAutoReply(v => !v)}
            label="Auto-reply to new messages"
            sub="Send an automatic response when someone messages you"
          />
          {autoReply && (
            <div className="px-4 pb-4">
              <textarea
                value={autoMsg}
                onChange={e => setAutoMsg(e.target.value)}
                rows={3}
                maxLength={200}
                className="w-full text-sm text-gray-900 border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-blue-400 bg-gray-50"
              />
              <p className="text-[10px] text-gray-400 text-right mt-1">{autoMsg.length}/200</p>
            </div>
          )}
        </Section>

        {/* Save */}
        <div className="px-4 pt-2">
          <button
            onClick={handleSave}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-sm transition-colors">
            Save Preferences
          </button>
        </div>

      </div>
    </div>
  );
}
