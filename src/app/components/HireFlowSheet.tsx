import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Loader2, Check, MapPin, Video, Camera, Scissors, Music2, Sun, Sparkles, Package } from 'lucide-react';
import { User, Listing } from '../types';
import { listingsApi, chatApi } from '../lib/api';
import { hireApi } from '../lib/hireApi';
import { SmartAddressInput, AddressComponents } from './SmartAddressInput';
import { BottomSheet } from './BottomSheet';
import { useAuth } from '../context/AuthContext';

type Step = 'service' | 'details' | 'location' | 'dates' | 'budget' | 'review' | 'sent';
type WorkType = 'on_site' | 'remote' | 'hybrid';
type DateType = 'specific' | 'range' | 'flexible';
type PricingType = 'hourly' | 'daily' | 'fixed';

const GENERIC_SERVICES = [
  { label: 'Videography', icon: Video }, { label: 'Photography', icon: Camera },
  { label: 'Editing', icon: Scissors }, { label: 'Cinematography', icon: Video },
  { label: 'Music', icon: Music2 }, { label: 'Sound', icon: Music2 },
  { label: 'Lighting', icon: Sun }, { label: 'Creative Direction', icon: Sparkles },
];

export function HireFlowSheet({ host, onClose }: { host: User; onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('service');
  const [services, setServices] = useState<Listing[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Service selection
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [customService, setCustomService] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  // Project details
  const [projectTitle, setProjectTitle] = useState('');
  const [description, setDescription] = useState('');
  const [referenceLinksText, setReferenceLinksText] = useState('');

  // Location
  const [workType, setWorkType] = useState<WorkType>('on_site');
  const [addressInput, setAddressInput] = useState('');
  const [address, setAddress] = useState<AddressComponents | null>(null);

  // Dates
  const [dateType, setDateType] = useState<DateType>('specific');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // Budget
  const [useCreatorRate, setUseCreatorRate] = useState(true);
  const [pricingType, setPricingType] = useState<PricingType>('hourly');
  const [budgetAmount, setBudgetAmount] = useState('');

  useEffect(() => {
    listingsApi.getUserListings(host.id)
      .then(listings => setServices(listings.filter(l => l.listingType === 'service')))
      .catch(() => setServices([]))
      .finally(() => setLoadingServices(false));
  }, [host.id]);

  const serviceLabel = selectedListing ? selectedListing.title : customService;
  const rateAvailable = selectedListing && selectedListing.price;

  const steps: Step[] = ['service', 'details', 'location', 'dates', 'budget', 'review'];
  const stepIdx = steps.indexOf(step);
  const goBack = () => { const prev = steps[stepIdx - 1]; if (prev) setStep(prev); else onClose(); };

  const canAdvance = (): boolean => {
    switch (step) {
      case 'service': return !!(selectedListing || (isCustom && customService.trim()));
      case 'details': return !!(projectTitle.trim() && description.trim());
      case 'location': return workType !== 'on_site' || !!address;
      case 'dates': return dateType === 'flexible' || !!startDate;
      case 'budget': return useCreatorRate ? !!rateAvailable : !!budgetAmount && Number(budgetAmount) > 0;
      default: return true;
    }
  };
  const goNext = () => { if (!canAdvance()) return; const next = steps[stepIdx + 1]; if (next) setStep(next); };

  const send = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const conv = await chatApi.getOrCreateDB(user.id, host.id);
      const referenceLinks = referenceLinksText.split('\n').map(s => s.trim()).filter(Boolean);
      const amount = useCreatorRate && rateAvailable ? Number(selectedListing!.price) : Number(budgetAmount) || undefined;
      await hireApi.sendHireRequest(user.id, {
        conversationId: conv.id, hostId: host.id,
        serviceListingId: selectedListing?.id || null, serviceLabel: serviceLabel || 'Custom Project', isCustom,
        projectTitle: projectTitle.trim(), description: description.trim(),
        referenceLinks: referenceLinks.length ? referenceLinks : undefined,
        workType,
        streetAddress: address?.streetAddress, city: address?.city, province: address?.province, postalCode: address?.postalCode, country: address?.country,
        dateType, startDate: startDate || undefined, endDate: endDate || undefined, startTime: startTime || undefined, endTime: endTime || undefined,
        pricingType, useCreatorRate, budgetAmount: amount, currency: 'CAD',
      });
      setStep('sent');
    } catch (e: any) {
      toast.error(e?.message || 'Could not send hire request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      title={step === 'sent' ? 'Hire Request Sent' : `Hire ${host.name}`}
      onClose={onClose}
      footer={step === 'sent' ? undefined : (
        <div className="flex gap-2 pb-1">
          <button onClick={goBack} className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 shrink-0"><ChevronLeft className="w-4 h-4" /></button>
          {step === 'review' ? (
            <button disabled={submitting} onClick={send} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Hire Request'}
            </button>
          ) : (
            <button disabled={!canAdvance()} onClick={goNext} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-1.5">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    >
      <div className="px-5 py-4">
        {step === 'service' && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-black text-gray-900">What do you need?</p>
              <p className="text-xs text-gray-400 mt-0.5">Tell {host.name} what you need.</p>
            </div>
            {loadingServices ? (
              <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
            ) : (
              <>
                {services.length > 0 && (
                  <div className="space-y-2">
                    {services.map(l => (
                      <button key={l.id} onClick={() => { setSelectedListing(l); setIsCustom(false); }}
                        className={`w-full text-left px-4 py-3 rounded-2xl border-2 transition-colors ${selectedListing?.id === l.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-gray-900">{l.title}</span>
                          {selectedListing?.id === l.id && <Check className="w-4 h-4 text-blue-500" />}
                        </div>
                        {!!l.price && <p className="text-xs text-gray-400 mt-0.5">${l.price} CAD/hr</p>}
                      </button>
                    ))}
                  </div>
                )}
                <div>
                  <button onClick={() => { setIsCustom(true); setSelectedListing(null); }}
                    className={`w-full text-left px-4 py-3 rounded-2xl border-2 transition-colors ${isCustom ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Package className="w-3.5 h-3.5 text-gray-400" /> Custom Project</span>
                      {isCustom && <Check className="w-4 h-4 text-blue-500" />}
                    </div>
                  </button>
                  {isCustom && (
                    <div className="grid grid-cols-2 gap-2 mt-2.5">
                      {GENERIC_SERVICES.map(s => (
                        <button key={s.label} onClick={() => setCustomService(s.label)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${customService === s.label ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-600'}`}>
                          <s.icon className="w-3.5 h-3.5" /> {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {isCustom && (
                    <input value={customService} onChange={e => setCustomService(e.target.value)} placeholder="Describe what you need"
                      className="w-full mt-2.5 border-2 border-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400" />
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {step === 'details' && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-black text-gray-900">Tell us about your project</p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Project Title *</label>
              <input value={projectTitle} onChange={e => setProjectTitle(e.target.value)} placeholder="e.g. Wedding Video"
                className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Description *</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
                placeholder="Describe what you need, the style you're looking for, deliverables and any important details."
                className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-400 resize-none" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Reference Links (optional)</label>
              <textarea value={referenceLinksText} onChange={e => setReferenceLinksText(e.target.value)} rows={2}
                placeholder="One link per line" className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-400 resize-none" />
            </div>
          </div>
        )}

        {step === 'location' && (
          <div className="space-y-4">
            <p className="text-sm font-black text-gray-900">Where will the work happen?</p>
            <div className="space-y-2">
              {(['on_site', 'remote', 'hybrid'] as WorkType[]).map(t => (
                <button key={t} onClick={() => setWorkType(t)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-colors ${workType === t ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}>
                  <MapPin className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-bold text-gray-900 flex-1 text-left capitalize">{t.replace('_', '-')}</span>
                  {workType === t && <Check className="w-4 h-4 text-blue-500" />}
                </button>
              ))}
            </div>
            {workType === 'on_site' && (
              <div>
                <SmartAddressInput
                  value={addressInput} onInputChange={setAddressInput}
                  onAddressSelect={(display, parts) => { setAddressInput(display); setAddress(parts); }}
                  mode="full" placeholder="Search address…" canadaOnly
                />
                <p className="text-[11px] text-gray-400 mt-1.5">Only city-level location is shown before terms are agreed.</p>
              </div>
            )}
          </div>
        )}

        {step === 'dates' && (
          <div className="space-y-4">
            <p className="text-sm font-black text-gray-900">When do you need them?</p>
            <div className="grid grid-cols-3 gap-2">
              {(['specific', 'range', 'flexible'] as DateType[]).map(t => (
                <button key={t} onClick={() => setDateType(t)}
                  className={`py-2.5 rounded-xl border-2 text-xs font-bold capitalize transition-colors ${dateType === t ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-600'}`}>
                  {t}
                </button>
              ))}
            </div>
            {dateType !== 'flexible' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">{dateType === 'range' ? 'Start Date' : 'Date'}</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400" />
                </div>
                {dateType === 'range' && (
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">End Date</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Start Time</label>
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">End Time</label>
                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'budget' && (
          <div className="space-y-4">
            <p className="text-sm font-black text-gray-900">What's your budget?</p>
            {rateAvailable && (
              <div className="bg-gray-50 rounded-2xl p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Creator Rate</p>
                  <p className="text-sm font-black text-gray-900">${selectedListing!.price}/hour</p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {rateAvailable && (
                <button onClick={() => setUseCreatorRate(true)}
                  className={`w-full text-left px-4 py-3 rounded-2xl border-2 transition-colors ${useCreatorRate ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}>
                  <span className="text-sm font-bold text-gray-900">Use creator's rate</span>
                </button>
              )}
              <button onClick={() => setUseCreatorRate(false)}
                className={`w-full text-left px-4 py-3 rounded-2xl border-2 transition-colors ${!useCreatorRate ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}>
                <span className="text-sm font-bold text-gray-900">Offer a budget</span>
              </button>
            </div>
            {!useCreatorRate && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-2 border-gray-100 rounded-2xl px-4 py-3 focus-within:border-blue-400">
                  <span className="text-lg font-black text-gray-400">$</span>
                  <input type="number" value={budgetAmount} onChange={e => setBudgetAmount(e.target.value)} placeholder="0.00" className="flex-1 text-lg font-black text-gray-900 outline-none" />
                  <span className="text-xs font-bold text-gray-400">CAD</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['hourly', 'daily', 'fixed'] as PricingType[]).map(t => (
                    <button key={t} onClick={() => setPricingType(t)}
                      className={`py-2 rounded-xl border-2 text-xs font-bold capitalize transition-colors ${pricingType === t ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-600'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Hire Request</p>
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2.5">
              <Row label="Creator" value={host.name} />
              <Row label="Service" value={serviceLabel || '—'} />
              <Row label="Project" value={projectTitle} />
              <Row label="Location" value={workType === 'on_site' ? (address?.city || addressInput) : workType} />
              <Row label="Dates" value={dateType === 'flexible' ? 'Flexible' : startDate ? new Date(startDate).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'} />
              <Row label="Budget" value={useCreatorRate && rateAvailable ? `$${selectedListing!.price}/hr CAD` : budgetAmount ? `$${Number(budgetAmount).toFixed(2)} CAD (${pricingType})` : '—'} />
            </div>
            {description && <div className="bg-gray-50 rounded-2xl p-4"><p className="text-xs text-gray-400 mb-1">Message</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{description}</p></div>}
            <p className="text-[11px] text-gray-400 leading-relaxed">Sending a request does not charge you yet — {host.name} needs to accept the terms first.</p>
          </div>
        )}

        {step === 'sent' && (
          <div className="flex flex-col items-center text-center gap-4 py-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center"><Check className="w-8 h-8 text-green-600" /></div>
            <div>
              <p className="text-base font-black text-gray-900">Hire request sent ✓</p>
              <p className="text-sm text-gray-500 mt-1">{host.name} will respond in your conversation.</p>
            </div>
            <button onClick={() => { onClose(); navigate(`/inbox?userId=${host.id}`); }} className="w-full py-3 bg-blue-600 text-white font-black text-sm rounded-2xl">View Conversation</button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm font-bold text-gray-900 text-right">{value}</span>
    </div>
  );
}
