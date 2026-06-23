import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  X, Clock, Package, Send, CheckCircle,
  ArrowLeft, BadgeCheck, ChevronRight, ChevronLeft, MapPin, CalendarDays,
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Listing, User, PricingPackage } from '../types';
import { chatApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

interface RentRequestModalProps {
  listing: Listing;
  host: User;
  onClose: () => void;
}

function formatFullAddress(listing: Listing): string {
  const parts = [listing.streetAddr, listing.city, listing.province, listing.postalCode, listing.country].filter(Boolean);
  return parts.join(', ');
}

const TIER_COLORS: Record<string, string> = {
  standard: 'border-gray-200 bg-white hover:border-blue-400',
  intermediate: 'border-blue-200 bg-blue-50/40 hover:border-blue-500',
  deluxe: 'border-amber-300 bg-amber-50/40 hover:border-amber-500',
  custom: 'border-purple-200 bg-purple-50/40 hover:border-purple-500',
};

const TIER_BADGE: Record<string, string> = {
  standard: 'bg-gray-100 text-gray-700',
  intermediate: 'bg-blue-100 text-blue-700',
  deluxe: 'bg-amber-100 text-amber-700',
  custom: 'bg-purple-100 text-purple-700',
};

export function RentRequestModal({ listing, host, onClose }: RentRequestModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const isService  = listing.listingType === 'service';
  const isSale     = listing.listingMode === 'sale';
  const hasPackages = isService && listing.pricingPackages && listing.pricingPackages.length > 0;

  const requestLabel = isService ? 'Service Request' : isSale ? 'Purchase Request' : 'Rental Request';
  const actionLabel  = isService ? 'Book Service'    : isSale ? 'Request to Buy'   : 'Request to Rent';

  // Step 1 = package selection (only for services with packages)
  // Step 2 = date / duration / message
  // Step 3 = sent confirmation
  const initialStep = hasPackages ? 1 : 2;
  const [step, setStep] = useState<1 | 2 | 3>(initialStep as 1 | 2 | 3);

  const today = new Date().toISOString().split('T')[0];
  const [selectedPkg, setSelectedPkg] = useState<PricingPackage | null>(null);
  const [startDate, setStartDate] = useState('');
  const [duration, setDuration] = useState(1);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Calendar state
  const [calendarDate, setCalendarDate] = useState(() => new Date());

  // Unavailable dates from listing metadata
  const unavailableDates = useMemo<Set<string>>(() => {
    const dates = (listing as any).unavailableDates || [];
    return new Set(Array.isArray(dates) ? dates : []);
  }, [listing]);

  // Compute which dates are selected (startDate + duration)
  const selectedDates = useMemo<Set<string>>(() => {
    if (!startDate || isSale) return new Set();
    const dates = new Set<string>();
    for (let i = 0; i < duration; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      dates.add(d.toISOString().split('T')[0]);
    }
    return dates;
  }, [startDate, duration, isSale]);

  const durationType = isService ? 'hours' : 'days';
  const durationSingular = isService ? 'hour' : 'day';

  // Compute unit price: from package if selected, else from listing
  const unitPrice = selectedPkg ? selectedPkg.price : listing.price || 0;
  const estimatedTotal = unitPrice > 0 ? unitPrice * duration : null;

  /* ── Handlers ─────────────────────────────────────────── */

  const handleSelectPackage = (pkg: PricingPackage) => {
    setSelectedPkg(pkg);
    setStep(2);
  };

  const handleSend = async () => {
    if (!user) {
      toast.error('Please log in to send a request');
      navigate('/login');
      return;
    }
    if (user.id === host.id) {
      toast.error("You can't send a request to your own listing");
      return;
    }
    // For non-sale items, require a start date
    if (!isSale && !startDate) {
      toast.error('Please choose a start date');
      return;
    }
    if (!isSale && duration < 1) {
      toast.error(`Please enter at least 1 ${durationSingular}`);
      return;
    }

    setSending(true);
    try {
      const conv = await chatApi.getOrCreateDB(user.id, host.id);
      const rentalMsg = chatApi.sendRentalRequest(conv.id, user.id, user.name, user.avatar, {
        listingId:    listing.id,
        listingTitle: listing.title,
        listingType:  listing.listingType,
        listingMode:  listing.listingMode,
        startDate:    isSale ? new Date().toISOString().split('T')[0] : startDate,
        duration:     isSale ? 1 : duration,
        durationType: isSale ? 'purchase' : durationType,
        message:      message.trim() || undefined,
        selectedPackage: selectedPkg ?? undefined,
        status:       'pending',
      });
      await chatApi.sendMessageToDB(
        conv.id, rentalMsg,
        conv.participantIds,
        conv.isRequest ?? false,
        conv.requestedBy ?? null,
      );
      setStep(3);
    } catch (err) {
      console.error('Error sending request:', err);
      toast.error('Failed to send request. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleGoToInbox = () => {
    onClose();
    navigate('/inbox');
  };

  /* ── Step indicator (only when hasPackages) ─────────────── */
  const StepDots = () =>
    hasPackages ? (
      <div className="flex items-center justify-center gap-2 mt-4">
        {[1, 2].map(s => (
          <div
            key={s}
            className={`h-1.5 rounded-full transition-all ${
              step >= s ? 'w-6 bg-white' : 'w-3 bg-white/30'
            }`}
          />
        ))}
      </div>
    ) : null;

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full sm:max-w-lg bg-white sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">

        {/* ── Header ── */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 pt-6 pb-6 shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors text-white"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Back button on step 2 when hasPackages */}
          {step === 2 && hasPackages && (
            <button
              onClick={() => setStep(1)}
              className="absolute top-4 left-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors text-white flex items-center gap-1 text-xs font-semibold"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Packages
            </button>
          )}

          <p className="text-blue-200 text-xs font-semibold uppercase tracking-widest mb-1">
            {requestLabel}
          </p>
          <h2 className="text-white text-lg font-bold leading-snug line-clamp-2 pr-8">
            {listing.title}
          </h2>
          <p className="text-blue-200 text-sm mt-0.5">to {host.name}</p>

          <StepDots />
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── STEP 1: Choose package ── */}
          {step === 1 && hasPackages && (
            <div className="p-5">
              <p className="text-sm font-semibold text-gray-700 mb-1">Choose a pricing package</p>
              <p className="text-xs text-gray-400 mb-4">Select the package that best fits your needs</p>

              <div className="space-y-3">
                {listing.pricingPackages!.map((pkg, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectPackage(pkg)}
                    className={`w-full text-left border-2 rounded-xl p-4 transition-all group ${
                      TIER_COLORS[pkg.tier] || TIER_COLORS.standard
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span
                            className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              TIER_BADGE[pkg.tier] || TIER_BADGE.standard
                            }`}
                          >
                            {pkg.tier}
                          </span>
                          {pkg.name && (
                            <span className="text-sm font-semibold text-gray-800">{pkg.name}</span>
                          )}
                        </div>
                        {pkg.description && (
                          <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{pkg.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className="text-lg font-bold text-blue-600">${pkg.price}</div>
                          <div className="text-[10px] text-gray-400 leading-none">per hour</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={() => { setSelectedPkg(null); setStep(2); }}
                className="mt-4 w-full text-center text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
              >
                Skip package selection
              </button>
            </div>
          )}

          {/* ── STEP 2: Date + Duration + Message ── */}
          {step === 2 && (
            <div className="p-5 space-y-5">

              {/* Selected package recap */}
              {selectedPkg && (
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                  <BadgeCheck className="w-5 h-5 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-blue-500 font-semibold uppercase tracking-wide">Selected Package</p>
                    <p className="text-sm font-bold text-blue-800 truncate">
                      {selectedPkg.name || selectedPkg.tier} — ${selectedPkg.price}/hr
                    </p>
                  </div>
                  {hasPackages && (
                    <button
                      onClick={() => setStep(1)}
                      className="text-xs text-blue-500 hover:text-blue-700 font-semibold underline underline-offset-2 shrink-0"
                    >
                      Change
                    </button>
                  )}
                </div>
              )}

              {/* Listing meta + location */}
              {!selectedPkg && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="text-sm text-gray-500">
                      {isService ? 'Service' : listing.listingMode === 'sale' ? 'For Sale' : 'Gear Rental'}
                    </span>
                  </div>
                  {formatFullAddress(listing) && (
                    <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                      <MapPin className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">
                          {isService ? 'Service location' : 'Item location'}
                        </p>
                        <p className="text-sm text-gray-700 leading-snug">{formatFullAddress(listing)}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedPkg && formatFullAddress(listing) && (
                <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                  <MapPin className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Location</p>
                    <p className="text-sm text-gray-700 leading-snug">{formatFullAddress(listing)}</p>
                  </div>
                </div>
              )}

              {/* Sale: show price. Non-sale: show date + duration + estimate */}
              {isSale ? (
                <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-orange-700 font-semibold">Item Price</span>
                  <span className="text-xl font-bold text-orange-700">${(listing.price || 0).toLocaleString()} <span className="text-sm font-semibold text-orange-400">CAD</span></span>
                </div>
              ) : (
                <>
                  {/* Start date — custom calendar */}
                  <div>
                    <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
                      <CalendarDays className="w-4 h-4 text-blue-500" />
                      Start Date <span className="text-red-500 ml-0.5">*</span>
                    </label>
                    {/* Calendar widget */}
                    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
                      {/* Month nav */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                        <button type="button"
                          onClick={() => setCalendarDate(d => { const nd = new Date(d); nd.setMonth(nd.getMonth() - 1); return nd; })}
                          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors">
                          <ChevronLeft className="w-4 h-4 text-gray-500" />
                        </button>
                        <span className="text-sm font-bold text-gray-800">
                          {calendarDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                        </span>
                        <button type="button"
                          onClick={() => setCalendarDate(d => { const nd = new Date(d); nd.setMonth(nd.getMonth() + 1); return nd; })}
                          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors">
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        </button>
                      </div>
                      {/* Day headers */}
                      <div className="grid grid-cols-7 px-2 pt-2">
                        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                          <div key={d} className="text-center text-[10px] font-bold text-gray-400 pb-1">{d}</div>
                        ))}
                      </div>
                      {/* Days grid */}
                      <div className="grid grid-cols-7 px-2 pb-3 gap-y-0.5">
                        {(() => {
                          const year = calendarDate.getFullYear();
                          const month = calendarDate.getMonth();
                          const firstDay = new Date(year, month, 1).getDay();
                          const daysInMonth = new Date(year, month + 1, 0).getDate();
                          const cells = [];
                          for (let i = 0; i < firstDay; i++) cells.push(<div key={`e${i}`} />);
                          for (let d = 1; d <= daysInMonth; d++) {
                            const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                            const isPast = dateStr < today;
                            const isUnavail = unavailableDates.has(dateStr);
                            const isSelected = selectedDates.has(dateStr);
                            const isStart = dateStr === startDate;
                            cells.push(
                              <button key={d} type="button"
                                disabled={isPast || isUnavail}
                                onClick={() => !isPast && !isUnavail && setStartDate(dateStr)}
                                className={`h-8 w-full flex items-center justify-center rounded-full text-xs font-semibold transition-colors
                                  ${isPast || isUnavail ? 'text-gray-300 cursor-not-allowed line-through' :
                                    isStart ? 'bg-blue-600 text-white shadow-sm' :
                                    isSelected ? 'bg-blue-100 text-blue-700' :
                                    'hover:bg-blue-50 text-gray-700'}`}
                              >
                                {d}
                                {isUnavail && <span className="sr-only">Unavailable</span>}
                              </button>
                            );
                          }
                          return cells;
                        })()}
                      </div>
                      {/* Legend */}
                      <div className="flex items-center gap-4 px-4 pb-3 text-[10px] text-gray-400">
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-600 inline-block" />Selected</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-100 inline-block" />Duration</span>
                        <span className="flex items-center gap-1 line-through">01</span>
                        <span>Unavailable</span>
                      </div>
                    </div>
                    {startDate && (
                      <p className="text-xs text-blue-600 font-semibold mt-1.5 text-center">
                        📅 {new Date(startDate + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                      </p>
                    )}
                  </div>

                  {/* Duration */}
                  <div>
                    <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
                      <Clock className="w-4 h-4 text-blue-500" />
                      Duration <span className="font-normal text-gray-400">({isService ? 'hours' : 'days'})</span>
                      <span className="text-red-500 ml-0.5">*</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setDuration(d => Math.max(1, d - 1))} className="w-10 h-10 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:border-blue-400 hover:bg-blue-50 font-bold text-xl leading-none transition-colors">−</button>
                      <input type="number" min={1} max={isService ? 24 : 365} value={duration} onChange={e => setDuration(Math.max(1, parseInt(e.target.value) || 1))} className="flex-1 text-center px-3 py-2.5 border-2 border-gray-200 rounded-xl text-base font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      <button type="button" onClick={() => setDuration(d => Math.min(isService ? 24 : 365, d + 1))} className="w-10 h-10 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:border-blue-400 hover:bg-blue-50 font-bold text-xl leading-none transition-colors">+</button>
                      <span className="text-sm text-gray-500 w-14">{duration === 1 ? durationSingular : `${durationSingular}s`}</span>
                    </div>
                  </div>

                  {/* Estimated cost */}
                  {estimatedTotal !== null && (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-blue-600 font-medium">Estimated total</span>
                        <span className="text-xl font-bold text-blue-700">${estimatedTotal.toLocaleString()} <span className="text-sm font-semibold text-blue-400">CAD</span></span>
                      </div>
                      <p className="text-[11px] text-blue-400 mt-0.5 text-right">{duration} {duration === 1 ? durationSingular : `${durationSingular}s`} × ${unitPrice} / {durationSingular}</p>
                    </div>
                  )}
                </>
              )}

              {/* Message */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Message{' '}
                  <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  placeholder={
                    isService
                      ? 'Describe your project, expectations, or any specific requirements…'
                      : 'Any questions about the item or pick-up details?'
                  }
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  maxLength={500}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1 text-right">{message.length}/500</p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose} disabled={sending}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2 rounded-xl"
                  onClick={handleSend}
                  disabled={sending}
                >
                  <Send className="w-4 h-4" />
                  {sending ? 'Sending…' : actionLabel}
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Sent ── */}
          {step === 3 && (
            <div className="p-8 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Request Sent!</h3>
              <p className="text-gray-500 text-sm mb-2">
                Your {isService ? 'service' : isSale ? 'purchase' : 'rental'} request has been sent to{' '}
                <span className="font-semibold text-gray-700">{host.name}</span>.
              </p>

              {/* Summary */}
              <div className="w-full bg-gray-50 rounded-xl p-4 text-left space-y-2 mb-6 text-sm">
                {selectedPkg && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Package</span>
                    <span className="font-semibold text-gray-800">{selectedPkg.name || selectedPkg.tier}</span>
                  </div>
                )}
                {isSale ? (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Price</span>
                    <span className="font-bold text-orange-600">${(listing.price || 0).toLocaleString()} CAD</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Start date</span>
                      <span className="font-semibold text-gray-800">
                        {new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Duration</span>
                      <span className="font-semibold text-gray-800">
                        {duration} {duration === 1 ? durationSingular : `${durationSingular}s`}
                      </span>
                    </div>
                    {estimatedTotal !== null && (
                      <div className="flex justify-between border-t pt-2 mt-2">
                        <span className="text-gray-500">Estimated total</span>
                        <span className="font-bold text-blue-600">${estimatedTotal.toLocaleString()} <span className="text-xs font-semibold text-blue-400">CAD</span></span>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex gap-3 w-full">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
                  Close
                </Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700 rounded-xl" onClick={handleGoToInbox}>
                  View in Inbox
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}