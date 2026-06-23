import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { listingsApi } from '../lib/api';
import {
  X, Upload, ArrowLeft, Plus, Trash2, Video,
  MapPin, DollarSign, Clock, CheckCircle, ChevronRight,
  MessageCircle, Instagram, Facebook, Mail, Phone,
  Search, Loader2, Navigation, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { ContactMethod, Listing, PricingPackage } from '../types';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { supabase } from '../../lib/supabase';

const EDGE_FN = `https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879`;

// ── Types ──────────────────────────────────────────────────────────
interface GPlaceSuggestion {
  place_id: string;
  description: string;
  structured_formatting: { main_text: string; secondary_text: string };
}
interface GAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

// ── Canadian Provinces ─────────────────────────────────────────────
const PROVINCES = [
  { code: 'AB', name: 'Alberta' },
  { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' },
  { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland & Labrador' },
  { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' },
  { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' },
  { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Québec' },
  { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' },
];

function AvailabilityCalendar({ blockedDates, onChange }: { blockedDates: string[]; onChange: (dates: string[]) => void }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const toISO = (y: number, m: number, d: number) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const toggleDate = (iso: string) => onChange(blockedDates.includes(iso) ? blockedDates.filter(d => d !== iso) : [...blockedDates, iso]);
  const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const monthName   = new Date(viewYear, viewMonth).toLocaleString('default', { month: 'long', year: 'numeric' });
  const prevMonth = () => { if (viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1); };
  const nextMonth = () => { if (viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1); };
  return (
    <div className="mt-3 bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100"><p className="text-xs font-bold text-gray-700 mb-0.5">Unavailable Dates</p><p className="text-[11px] text-gray-400">Tap dates when your item is <span className="font-semibold text-red-500">not available</span> to rent</p></div>
      <div className="flex items-center justify-between px-4 py-3">
        <button type="button" onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors">‹</button>
        <span className="text-sm font-bold text-gray-800">{monthName}</span>
        <button type="button" onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors">›</button>
      </div>
      <div className="grid grid-cols-7 px-3 mb-1">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="text-center text-[10px] font-bold text-gray-400 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 px-3 pb-3 gap-1">
        {Array.from({length:firstDay}).map((_,i) => <div key={`e${i}`}/>)}
        {Array.from({length:daysInMonth}).map((_,i) => {
          const day=i+1, iso=toISO(viewYear,viewMonth,day), date=new Date(viewYear,viewMonth,day);
          const isPast=date<today, isBlocked=blockedDates.includes(iso);
          return <button key={day} type="button" disabled={isPast} onClick={() => toggleDate(iso)} className={['aspect-square rounded-xl text-xs font-semibold transition-all flex items-center justify-center',isPast?'text-gray-200 cursor-not-allowed':isBlocked?'bg-red-500 text-white shadow-sm':'hover:bg-gray-100 text-gray-700'].join(' ')}>{day}</button>;
        })}
      </div>
      {blockedDates.length > 0 && <div className="px-4 py-2 bg-red-50 border-t border-red-100 flex items-center justify-between"><p className="text-xs text-red-600 font-semibold">{blockedDates.length} date{blockedDates.length!==1?'s':''} marked unavailable</p><button type="button" onClick={() => onChange([])} className="text-xs text-red-400 hover:text-red-600 font-medium">Clear all</button></div>}
      <div className="px-4 py-3 border-t border-gray-100"><button type="button" onClick={() => onChange([])} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-green-300 text-green-700 text-xs font-bold hover:bg-green-50 transition-colors">✅ Item available every day — clear all blocked dates</button></div>
    </div>
  );
}

export function EditListing() {
  const { id } = useParams();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  // Type
  const [listingType, setListingType] = useState<'gear' | 'service'>('gear');
  const [listingMode, setListingMode] = useState<'rent' | 'sale'>('rent');
  const [serviceCategory, setServiceCategory] = useState<Listing['serviceCategory']>('photographer');

  // Core
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Location
  const [addressSearch, setAddressSearch] = useState('');
  const [suggestions, setSuggestions] = useState<GPlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Media
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [videoPreviews, setVideoPreviews] = useState<string[]>([]);
  const [existingVideoUrls, setExistingVideoUrls] = useState<string[]>([]);

  // Service
  const [qualification, setQualification] = useState('');
  const [pricingPackages, setPricingPackages] = useState<PricingPackage[]>([]);
  const [workingHours, setWorkingHours] = useState('');
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [availableDays, setAvailableDays] = useState<string[]>(['Mon','Tue','Wed','Thu','Fri']);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime]     = useState('18:00');
  const [requirements, setRequirements] = useState('');
  const [cancellation, setCancellation] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['Credit/Debit Card', 'FP']);
  const [deliveryOptions, setDeliveryOptions] = useState<string[]>(['pickup']);
  const [deliveryPrice, setDeliveryPrice] = useState('');

  // Contact
  const [selectedMethods, setSelectedMethods] = useState<Set<string>>(new Set());
  const [contactInputs, setContactInputs] = useState<Record<string, string>>({
    whatsapp: '', instagram: '', facebook: '', email: '', phone: '',
  });

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    // Wait for auth — user may be cached and loaded on first render
    if (!isAuthenticated && !user) {
      // Give auth context 500ms to load from localStorage before redirecting
      const t = setTimeout(() => { if (!isAuthenticated) navigate('/login'); }, 500);
      return () => clearTimeout(t);
    }
    if (id) loadListing(id);
  }, [isAuthenticated, user, navigate, id]);

  const loadListing = async (listingId: string) => {
    try {
      setIsLoading(true);
      const listing = await listingsApi.getOne(listingId);
      if (listing.userId !== user?.id) {
        toast.error('You do not have permission to edit this listing');
        navigate('/dashboard');
        return;
      }
      setTitle(listing.title);
      setDescription(listing.description);
      setPrice(listing.price.toString());
      setCity(listing.city || '');
      setStreetAddress(listing.streetAddress || '');
      setProvince(listing.province || '');
      setPostalCode(listing.postalCode || '');
      setTags(listing.tags || []);
      setListingType(listing.listingType || 'gear');
      setListingMode(listing.listingMode || 'rent');
      setServiceCategory(listing.serviceCategory || 'photographer');
      setWorkingHours(listing.workingHours || '');
      setRequirements(listing.requirements || '');
      setCancellation(listing.cancellation || '');
      if (listing.paymentMethods?.length) setPaymentMethods(listing.paymentMethods.filter((m: string) => m !== 'Cash')); else setPaymentMethods(['Credit/Debit Card', 'FP']);
      if (listing.blockedDates?.length) setBlockedDates(listing.blockedDates);
      if ((listing as any).availableDays?.length) setAvailableDays((listing as any).availableDays);
      if ((listing as any).serviceStartTime) setStartTime((listing as any).serviceStartTime);
      if ((listing as any).serviceEndTime)   setEndTime((listing as any).serviceEndTime);
      if (listing.deliveryOptions?.length) setDeliveryOptions(listing.deliveryOptions);
      if (listing.deliveryPrice != null) setDeliveryPrice(listing.deliveryPrice.toString());
      if (listing.images?.length) { setExistingImageUrls(listing.images); setImagePreviews(listing.images); }
      if (listing.videos?.length) { setExistingVideoUrls(listing.videos); setVideoPreviews(listing.videos); }
      if (listing.contactMethods?.length) {
        const methods = new Set<string>();
        const inputs: Record<string, string> = { whatsapp: '', instagram: '', facebook: '', email: '', phone: '' };
        listing.contactMethods.forEach(m => { methods.add(m.type); inputs[m.type] = m.value; });
        setSelectedMethods(methods);
        setContactInputs(inputs);
      }
      if (listing.listingType === 'service') {
        setQualification(listing.qualification || '');
        setPricingPackages(listing.pricingPackages || []);
      }
      // Pre-fill search box with existing full address
      const parts = [listing.streetAddress, listing.city, listing.province, 'Canada'].filter(Boolean);
      if (parts.length > 1) setAddressSearch(parts.join(', '));
    } catch {
      toast.error('Failed to load listing');
      navigate('/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Location Search ────────────────────────────────────────────────
  const parseAddressComponents = useCallback((components: GAddressComponent[]) => {
    let streetNum = '', route = '', localCity = '', localProvince = '', localPostal = '';
    for (const c of components) {
      if (c.types.includes('street_number')) streetNum = c.long_name;
      if (c.types.includes('route')) route = c.long_name;
      if (c.types.includes('locality') || c.types.includes('sublocality_level_1')) localCity = localCity || c.long_name;
      if (c.types.includes('administrative_area_level_1')) localProvince = c.short_name;
      if (c.types.includes('postal_code')) localPostal = c.long_name;
    }
    setStreetAddress([streetNum, route].filter(Boolean).join(' '));
    setCity(localCity);
    setProvince(localProvince);
    setPostalCode(localPostal);
  }, []);

  const handleAddressSearch = (value: string) => {
    setAddressSearch(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!value.trim() || value.length < 3) {
      setSuggestions([]); setShowSuggestions(false); return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `${EDGE_FN}/geocode/autocomplete?input=${encodeURIComponent(value)}`,
          { headers: { Authorization: `Bearer ${publicAnonKey}` } }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSuggestions(data.predictions || []);
        setShowSuggestions(true);
      } catch (err) {
        console.error('Autocomplete error:', err);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  };

  const selectSuggestion = async (s: GPlaceSuggestion) => {
    setAddressSearch(s.description);
    setShowSuggestions(false);
    setSuggestions([]);
    try {
      const res = await fetch(
        `${EDGE_FN}/geocode/details?place_id=${encodeURIComponent(s.place_id)}`,
        { headers: { Authorization: `Bearer ${publicAnonKey}` } }
      );
      const data = await res.json();
      if (data.results?.[0]) {
        parseAddressComponents(data.results[0].address_components);
        toast.success('Address filled in!', { description: s.description });
      }
    } catch (err) {
      console.error('Place details error:', err);
      toast.error('Could not fetch address details');
    }
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }
    setIsDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude, longitude } }) => {
        try {
          const res = await fetch(
            `${EDGE_FN}/geocode/reverse?lat=${latitude}&lng=${longitude}`,
            { headers: { Authorization: `Bearer ${publicAnonKey}` } }
          );
          const data = await res.json();
          if (data.results?.[0]) {
            setAddressSearch(data.results[0].formatted_address);
            parseAddressComponents(data.results[0].address_components);
            toast.success('📍 Location detected!', { description: data.results[0].formatted_address });
          } else {
            toast.error('Could not resolve your location to an address');
          }
        } catch {
          toast.error('Failed to reverse geocode your coordinates');
        } finally {
          setIsDetecting(false);
        }
      },
      (err) => {
        setIsDetecting(false);
        if (err.code === 1) toast.error('Location access denied — please enter your address manually');
        else toast.error('Could not get your location. Try again or enter manually.');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // ── Media handlers ─────────────────────────────────────────────────
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    if (existingImageUrls.length + imageFiles.length + files.length > 10) { toast.error('Maximum 10 images'); return; }
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const newFiles: File[] = [], newPreviews: string[] = [];
    let processed = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!validTypes.includes(file.type)) { toast.error('Invalid file type.'); return; }
      if (file.size > 5242880) { toast.error('Max 5MB per image.'); return; }
      newFiles.push(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        newPreviews.push(reader.result as string);
        if (++processed === files.length) {
          setImageFiles(p => [...p, ...newFiles]);
          setImagePreviews(p => [...p, ...newPreviews]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    if (existingVideoUrls.length + videoFiles.length + files.length > 10) { toast.error('Maximum 10 videos'); return; }
    const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
    const newFiles: File[] = [], newPreviews: string[] = [];
    let processed = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!validTypes.includes(file.type)) { toast.error('Invalid file type.'); return; }
      if (file.size > 52428800) { toast.error('Max 50MB per video.'); return; }
      newFiles.push(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        newPreviews.push(reader.result as string);
        if (++processed === files.length) {
          setVideoFiles(p => [...p, ...newFiles]);
          setVideoPreviews(p => [...p, ...newPreviews]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = (index: number) => {
    if (index < existingImageUrls.length) {
      setExistingImageUrls(existingImageUrls.filter((_, i) => i !== index));
      setImagePreviews(imagePreviews.filter((_, i) => i !== index));
    } else {
      const ni = index - existingImageUrls.length;
      setImageFiles(imageFiles.filter((_, i) => i !== ni));
      setImagePreviews(imagePreviews.filter((_, i) => i !== index));
    }
  };

  const handleRemoveVideo = (index: number) => {
    if (index < existingVideoUrls.length) {
      setExistingVideoUrls(existingVideoUrls.filter((_, i) => i !== index));
      setVideoPreviews(videoPreviews.filter((_, i) => i !== index));
    } else {
      const ni = index - existingVideoUrls.length;
      setVideoFiles(videoFiles.filter((_, i) => i !== ni));
      setVideoPreviews(videoPreviews.filter((_, i) => i !== index));
    }
  };

  const handleAddTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) { setTags([...tags, t]); setTagInput(''); }
  };

  const handleUpdatePricingPackage = (index: number, field: keyof PricingPackage, value: string | number) => {
    const updated = [...pricingPackages];
    updated[index] = { ...updated[index], [field]: value };
    setPricingPackages(updated);
  };

  const toggleContactMethod = (type: string, checked: boolean) => {
    const s = new Set(selectedMethods);
    checked ? s.add(type) : s.delete(type);
    setSelectedMethods(s);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isAuthenticated || !id) { toast.error('You must be logged in'); return; }

    const selectedContactMethods: ContactMethod[] = [];
    selectedMethods.forEach(method => {
      const value = contactInputs[method]?.trim();
      if (value) selectedContactMethods.push({ type: method as ContactMethod['type'], value });
    });

    // Validate
    if (!title.trim() || !description.trim() || !city.trim()) {
      toast.error('Please fill in all required fields'); return;
    }
    if (listingType === 'gear' && (isNaN(parseFloat(price)) || parseFloat(price) <= 0)) {
      toast.error('Please enter a valid price'); return;
    }

    try {
      setIsSubmitting(true);
      let imageUrls = existingImageUrls;
      let videoUrls = existingVideoUrls;

      if (imageFiles.length > 0) {
        setIsUploadingMedia(true);
        toast.info('Uploading images…');
        try {
          const results = await Promise.all(imageFiles.map(f => listingsApi.uploadImage(f)));
          imageUrls = [...existingImageUrls, ...results.map(r => r.imageUrl)];
        } catch (err) {
          toast.error(`Image upload failed: ${err instanceof Error ? err.message : 'Unknown'}`);
          setIsSubmitting(false); setIsUploadingMedia(false); return;
        }
        setIsUploadingMedia(false);
      }

      if (videoFiles.length > 0) {
        setIsUploadingMedia(true);
        toast.info('Uploading videos…');
        try {
          const results = await Promise.all(videoFiles.map(f => listingsApi.uploadVideo(f)));
          videoUrls = [...existingVideoUrls, ...results.map(r => r.videoUrl)];
        } catch (err) {
          toast.error(`Video upload failed: ${err instanceof Error ? err.message : 'Unknown'}`);
          setIsSubmitting(false); setIsUploadingMedia(false); return;
        }
        setIsUploadingMedia(false);
      }

      // Write directly to Supabase — bypasses edge function timeout
      const updatePayload: Record<string, any> = {
        title:            title.trim(),
        description:      description.trim(),
        price:            parseFloat(price) || 0,
        city:             city.trim(),
        province:         province.trim() || null,
        postal_code:      postalCode.trim() || null,
        street_address:   streetAddress.trim() || null,
        images:           imageUrls || [],
        videos:           videoUrls || [],
        tags:             tags || [],
        listing_type:     listingType,
        listing_mode:     listingMode,
        service_category: listingType === 'service' ? serviceCategory : null,
        working_hours:    workingHours || null,
        requirements:     requirements || null,
        cancellation:     cancellation || null,
        payment_methods:  paymentMethods,
        delivery_options: deliveryOptions,
        delivery_price:   deliveryOptions.includes('delivery') && deliveryPrice !== '' ? parseFloat(deliveryPrice) : null,
        blocked_dates:    blockedDates.length > 0 ? blockedDates : null,
        available_days:   listingType === 'service' ? availableDays : null,
        service_start_time: listingType === 'service' ? startTime : null,
        service_end_time:   listingType === 'service' ? endTime   : null,
        updated_at:       new Date().toISOString(),
        metadata:         JSON.stringify({
          contactMethods:  selectedContactMethods.length > 0 ? selectedContactMethods : undefined,
          pricingPackages: listingType === 'service' ? pricingPackages : undefined,
          qualification:   listingType === 'service' ? qualification : undefined,
        }),
      };

      const { error } = await supabase
        .from('listings')
        .update(updatePayload)
        .eq('id', id)
        .eq('user_id', user?.id); // safety: only update own listing

      if (error) {
        // Fallback to edge function if direct Supabase fails
        try {
          await listingsApi.update(id, {
            title: title.trim(), description: description.trim(), price: parseFloat(price),
            city: city.trim(), province: province.trim() || undefined,
            images: imageUrls, videos: videoUrls, tags,
            listingType, listingMode, serviceCategory,
            workingHours, requirements, cancellation, paymentMethods, deliveryOptions,
            contactMethods: selectedContactMethods,
            pricingPackages, qualification, blockedDates,
            availableDays, serviceStartTime: startTime, serviceEndTime: endTime,
          } as any);
        } catch (fallbackErr) {
          throw new Error(`Save failed: ${error.message}`);
        }
      }

      // Also update localStorage cache so listing card reflects changes immediately
      try {
        const cached = JSON.parse(localStorage.getItem('filmons_listings') || '[]');
        const updated = cached.map((l: any) => l.id === id ? {
          ...l,
          title: title.trim(), description: description.trim(), price: parseFloat(price),
          city: city.trim(), province: province.trim(),
          images: imageUrls, videos: videoUrls, tags,
          listingType, listingMode, workingHours,
        } : l);
        localStorage.setItem('filmons_listings', JSON.stringify(updated));
      } catch {}

      toast.success('Listing updated!', { description: 'Your changes have been saved.' });
      navigate('/dashboard');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update listing. Please try again.');
    } finally {
      setIsSubmitting(false);
      setIsUploadingMedia(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const serviceCategories = [
    { value: 'photographer',         label: 'Photographer',      emoji: '📸' },
    { value: 'videographer',         label: 'Videographer',      emoji: '🎥' },
    { value: 'editor',               label: 'Video Editor',      emoji: '✂️' },
    { value: 'colorist',             label: 'Colorist',          emoji: '🎨' },
    { value: 'sound-designer',       label: 'Sound Designer',    emoji: '🎵' },
    { value: 'drone-pilot',          label: 'Drone Pilot',       emoji: '🚁' },
    { value: 'gaffer',               label: 'Gaffer',            emoji: '💡' },
    { value: 'grip',                 label: 'Grip',              emoji: '🔧' },
    { value: 'production-assistant', label: 'Prod. Assistant',   emoji: '👤' },
    { value: 'other',                label: 'Other',             emoji: '⭐' },
  ];

  const paymentOptions = [
    { id: 'Credit/Debit Card', label: 'Credit/Debit Card',  icon: '💳' },
    { id: 'FP',                label: 'FP (Filmons Points)', icon: '⚡' },
  ];

  const contactMethodDefs = [
    { type: 'whatsapp',  label: 'WhatsApp',  icon: <MessageCircle className="w-4 h-4 text-green-600" />,  placeholder: '+1 416-555-0123' },
    { type: 'instagram', label: 'Instagram', icon: <Instagram className="w-4 h-4 text-pink-600" />,       placeholder: '@username' },
    { type: 'facebook',  label: 'Facebook',  icon: <Facebook className="w-4 h-4 text-blue-600" />,        placeholder: 'facebook.com/yourpage' },
    { type: 'email',     label: 'Email',     icon: <Mail className="w-4 h-4 text-gray-600" />,            placeholder: 'you@email.com' },
    { type: 'phone',     label: 'Phone',     icon: <Phone className="w-4 h-4 text-gray-600" />,           placeholder: '+1 416-555-0123' },
  ];

  // Highlight the matching part of the suggestion text
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return <span>{text}</span>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase().split(',')[0].trim());
    if (idx === -1) return <span>{text}</span>;
    return (
      <>
        {text.slice(0, idx)}
        <span className="font-bold text-gray-900">{text.slice(idx, idx + query.split(',')[0].trim().length)}</span>
        {text.slice(idx + query.split(',')[0].trim().length)}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Page header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-900">Edit Listing</h1>
          <p className="text-xs text-gray-400">{listingType === 'gear' ? "Creator's Gear" : 'Creative Service'}</p>
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${listingType === 'service' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
          {listingType === 'service' ? 'Service' : listingMode === 'sale' ? 'For Sale' : 'For Rent'}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-2 pb-32">

        {/* ── Service Category ── */}
        {listingType === 'service' && (
          <Section icon="🎭" title="Service Category" required>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {serviceCategories.map(cat => (
                <button key={cat.value} type="button"
                  onClick={() => setServiceCategory(cat.value as Listing['serviceCategory'])}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all ${
                    serviceCategory === cat.value ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}>
                  <span className="text-2xl">{cat.emoji}</span>
                  <span className={`text-[11px] font-semibold leading-tight ${serviceCategory === cat.value ? 'text-purple-700' : 'text-gray-600'}`}>{cat.label}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* ── Listing Mode ── */}
        {listingType === 'gear' && (
          <Section icon="🔖" title="Listing Mode" required>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'rent', emoji: '🔄', label: 'For Rent', sub: 'Daily rental rate' },
                { value: 'sale', emoji: '💰', label: 'For Sale', sub: 'One-time purchase' },
              ].map(opt => (
                <button key={opt.value} type="button" onClick={() => setListingMode(opt.value as 'rent' | 'sale')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    listingMode === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}>
                  <span className="text-2xl">{opt.emoji}</span>
                  <div>
                    <p className={`text-sm font-bold ${listingMode === opt.value ? 'text-blue-700' : 'text-gray-800'}`}>{opt.label}</p>
                    <p className={`text-xs ${listingMode === opt.value ? 'text-blue-500' : 'text-gray-400'}`}>{opt.sub}</p>
                  </div>
                  {listingMode === opt.value && <CheckCircle className="w-4 h-4 text-blue-500" />}
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* ── Title ── */}
        <Section icon="✏️" title="Title" required>
          <input type="text" placeholder="e.g. Sony A7 III Camera Body" value={title} onChange={e => setTitle(e.target.value)} required
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
        </Section>

        {/* ── Description ── */}
        <Section icon="📝" title="Description" required>
          <textarea placeholder="Describe your listing in detail…" rows={4} value={description} onChange={e => setDescription(e.target.value)} required
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all resize-none" />
        </Section>

        {/* ── Qualifications ── */}
        {listingType === 'service' && (
          <Section icon="🏆" title="Credentials & Qualifications">
            <textarea placeholder="e.g. 10+ years of experience, film school graduate…" rows={3} value={qualification} onChange={e => setQualification(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all resize-none" />
          </Section>
        )}

        {/* ── Tags ── */}
        <Section icon="🏷️" title="Tags">
          <div className="flex gap-2">
            <input type="text" placeholder="e.g. camera, sony, 4k" value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
              className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-300 outline-none focus:border-blue-400 transition-all" />
            <button type="button" onClick={handleAddTag} className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl transition-colors">Add</button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {tags.map(tag => (
                <span key={tag} className="flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-gray-100 px-3 py-1.5 rounded-full">
                  #{tag}
                  <button type="button" onClick={() => setTags(tags.filter(t => t !== tag))} className="text-gray-400 hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* ── Price ── */}
        <Section icon="💰" title={listingType === 'gear' ? (listingMode === 'sale' ? 'Sale Price (CAD)' : 'Price per Day (CAD)') : 'Hourly Rate (CAD)'} required>
          <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            <DollarSign className="w-4 h-4 text-gray-400 shrink-0" />
            <input type="number" min="0" step="0.01" placeholder="0.00" value={price} onChange={e => setPrice(e.target.value)} required
              className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-300 outline-none font-semibold" />
            <span className="text-xs text-gray-400 font-semibold shrink-0">CAD</span>
          </div>
        </Section>

        {/* ── Pricing Packages ── */}
        {listingType === 'service' && (
          <Section icon="📦" title="Pricing Packages">
            <p className="text-xs text-gray-400 mb-4">Create custom tiers — e.g. Half Day, Full Day, Weekend Bundle</p>
            {pricingPackages.length > 0 && (
              <div className="space-y-3 mb-4">
                {pricingPackages.map((pkg, index) => (
                  <div key={index} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Package {index + 1}</span>
                      <button type="button" onClick={() => setPricingPackages(pricingPackages.filter((_, i) => i !== index))}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tier</label>
                        <select value={pkg.tier} onChange={e => handleUpdatePricingPackage(index, 'tier', e.target.value as PricingPackage['tier'])}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-400 transition-all">
                          <option value="basic">Basic</option>
                          <option value="standard">Standard</option>
                          <option value="intermediate">Intermediate</option>
                          <option value="deluxe">Deluxe</option>
                          <option value="premium">Premium</option>
                          <option value="custom">Custom</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Name</label>
                        <input type="text" placeholder="e.g. Half Day" value={pkg.name} onChange={e => handleUpdatePricingPackage(index, 'name', e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 outline-none focus:border-blue-400 transition-all" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Price per Hour (CAD)</label>
                      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 focus-within:border-blue-400 transition-all">
                        <DollarSign className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <input type="number" min="0" step="0.01" placeholder="0.00" value={pkg.price || ''} onChange={e => handleUpdatePricingPackage(index, 'price', parseFloat(e.target.value) || 0)}
                          className="flex-1 bg-transparent text-sm placeholder-gray-300 outline-none font-semibold" />
                        <span className="text-xs text-gray-400 shrink-0">CAD/hr</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
                      <textarea placeholder="What's included…" rows={2} value={pkg.description} onChange={e => handleUpdatePricingPackage(index, 'description', e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 outline-none focus:border-blue-400 transition-all resize-none" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setPricingPackages([...pricingPackages, { tier: 'standard', name: '', price: 0, description: '' }])}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-500 hover:text-blue-600 rounded-xl py-3 text-sm font-semibold transition-all">
              <Plus className="w-4 h-4" /> Add Pricing Package
            </button>
          </Section>
        )}

        {/* ── Location (with smart search + detector) ── */}
        <Section icon="📍" title="Location" required>

          {/* Smart address search bar */}
          <div ref={suggestionsRef} className="relative mb-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Smart address search
            </p>
            <div className="flex gap-2">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Start typing a Canadian address…"
                  value={addressSearch}
                  onChange={e => handleAddressSearch(e.target.value)}
                  onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                  className="w-full bg-white border-2 border-gray-200 rounded-xl pl-10 pr-10 py-3 text-sm text-gray-800 placeholder-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
                )}
                {addressSearch && !isSearching && (
                  <button type="button" onClick={() => { setAddressSearch(''); setSuggestions([]); setShowSuggestions(false); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 hover:text-gray-500 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Detect my location button */}
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={isDetecting}
                title="Detect my location"
                className={`w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-xl border-2 transition-all ${
                  isDetecting
                    ? 'border-blue-300 bg-blue-50 text-blue-400'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600'
                }`}
              >
                {isDetecting
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : <Navigation className="w-5 h-5" />}
              </button>
            </div>

            {/* Autocomplete Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-12 z-50 bg-white border border-gray-200 rounded-2xl shadow-2xl mt-2 overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-50 flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-blue-500" />
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Canadian addresses</span>
                </div>
                {suggestions.map((s, i) => (
                  <button
                    key={s.place_id}
                    type="button"
                    onClick={() => selectSuggestion(s)}
                    className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-left ${
                      i < suggestions.length - 1 ? 'border-b border-gray-50' : ''
                    }`}
                  >
                    <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 leading-tight">
                        {highlightMatch(s.structured_formatting.main_text, addressSearch)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {s.structured_formatting.secondary_text}
                      </p>
                    </div>
                  </button>
                ))}
                <div className="px-3 py-1.5 bg-gray-50 flex items-center justify-end gap-1">
                  <img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google" className="h-3.5 opacity-60" />
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wide">or fill manually</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Manual fields — auto-populated after selection */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
              <input type="text" placeholder="Street address" value={streetAddress} onChange={e => setStreetAddress(e.target.value)}
                className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-300 outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <input type="text" placeholder="City *" required value={city} onChange={e => setCity(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
              <select value={province} onChange={e => setProvince(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all appearance-none cursor-pointer">
                <option value="">Province</option>
                {PROVINCES.map(p => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
              </select>
            </div>
            <input type="text" placeholder="Postal code (e.g. M5V 2T6)" value={postalCode}
              onChange={e => setPostalCode(e.target.value.toUpperCase())} maxLength={7}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all tracking-widest uppercase" />
          </div>

          {/* Filled indicator */}
          {(streetAddress || city || province || postalCode) && (
            <div className="mt-3 flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-xl">
              <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
              <span className="font-medium">
                {[streetAddress, city, province && `(${province})`, postalCode].filter(Boolean).join(' · ')}
              </span>
            </div>
          )}
        </Section>

        {/* ── Availability ── */}
        <Section icon="🕐" title="Availability">
          {listingType === 'service' ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Available Days</p>
                <div className="flex flex-wrap gap-2">
                  {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => {
                    const selected = availableDays.includes(day);
                    return (
                      <button key={day} type="button"
                        onClick={() => setAvailableDays(prev => selected ? prev.filter(d => d !== day) : [...prev, day])}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${selected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-500'}`}>
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Working Hours</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-[11px] text-gray-400 mb-1 block">Start</label>
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                      className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 transition-colors" />
                  </div>
                  <span className="text-gray-400 font-bold mt-4">→</span>
                  <div className="flex-1">
                    <label className="text-[11px] text-gray-400 mb-1 block">End</label>
                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                      className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 transition-colors" />
                  </div>
                </div>
                {startTime && endTime && <p className="text-xs text-gray-500 mt-2">Available {availableDays.join(', ')} · {startTime} – {endTime}</p>}
              </div>
              <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                <input type="text" placeholder="Additional notes e.g. 24h notice required"
                  value={workingHours} onChange={e => setWorkingHours(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-300 outline-none" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                <input type="text" placeholder="e.g. Available weekdays, 24h notice required"
                  value={workingHours} onChange={e => setWorkingHours(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-300 outline-none" />
              </div>
              {listingType === 'gear' && listingMode === 'rent' && (
                <AvailabilityCalendar blockedDates={blockedDates} onChange={setBlockedDates} />
              )}
            </>
          )}
        </Section>

        {/* ── Requirements ── */}
        <Section icon="📋" title="Requirements">
          <textarea placeholder={listingType === 'service' ? 'e.g. Client must provide specific equipment…' : 'e.g. Valid ID required, $200 deposit…'}
            rows={3} value={requirements} onChange={e => setRequirements(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all resize-none" />
        </Section>

        {/* ── Cancellation ── */}
        <Section icon="↩️" title="Cancellation Policy">
          <textarea placeholder="e.g. Free cancellation up to 24 hours before the booking…"
            rows={3} value={cancellation} onChange={e => setCancellation(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all resize-none" />
        </Section>

        {/* ── Images ── */}
        <Section icon="🖼️" title={listingType === 'gear' ? 'Equipment Photos' : 'Portfolio Images'}>
          <p className="text-xs text-gray-400 mb-3">Up to 10 images · Max 5MB each</p>
          <div className="grid grid-cols-3 gap-3">
            {imagePreviews.map((preview, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden group">
                <img src={preview} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button type="button" onClick={() => handleRemoveImage(i)} className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {i < existingImageUrls.length && (
                  <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded-full">saved</div>
                )}
              </div>
            ))}
            {imagePreviews.length < 10 && (
              <label htmlFor="img-edit" className="aspect-square rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer flex flex-col items-center justify-center gap-1 transition-all">
                <input type="file" id="img-edit" accept="image/jpeg,image/png,image/webp,image/jpg" onChange={handleImageChange} className="hidden" multiple />
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-[11px] text-gray-400 font-medium">{imagePreviews.length}/10</span>
              </label>
            )}
          </div>
        </Section>

        {/* ── Videos ── */}
        <Section icon="🎬" title={listingType === 'gear' ? 'Equipment Videos' : 'Portfolio Videos'}>
          <p className="text-xs text-gray-400 mb-3">Up to 10 videos · Max 50MB each</p>
          <div className="grid grid-cols-3 gap-3">
            {videoPreviews.map((preview, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden group">
                <video src={preview} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button type="button" onClick={() => handleRemoveVideo(i)} className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {i < existingVideoUrls.length && (
                  <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded-full">saved</div>
                )}
              </div>
            ))}
            {videoPreviews.length < 10 && (
              <label htmlFor="vid-edit" className="aspect-square rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer flex flex-col items-center justify-center gap-1 transition-all">
                <input type="file" id="vid-edit" accept="video/mp4,video/quicktime,video/x-msvideo" onChange={handleVideoChange} className="hidden" multiple />
                <Video className="w-5 h-5 text-gray-400" />
                <span className="text-[11px] text-gray-400 font-medium">{videoPreviews.length}/10</span>
              </label>
            )}
          </div>
        </Section>

        {/* ── Payment Methods ── */}
        <Section icon="💳" title="Accepted Payment Methods">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {paymentOptions.map(opt => {
              const selected = paymentMethods.includes(opt.id);
              return (
                <button key={opt.id} type="button"
                  onClick={() => setPaymentMethods(prev => selected ? prev.filter(m => m !== opt.id) : [...prev, opt.id])}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 transition-all ${selected ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                  <span className="text-base">{opt.icon}</span>
                  <span className="flex-1 text-left text-xs font-medium">{opt.label}</span>
                  {selected && <CheckCircle className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                </button>
              );
            })}
          </div>
        </Section>

        {/* ── Fulfilment ── */}
        <Section icon="🚚" title="Fulfilment Options">
          <div className="grid grid-cols-2 gap-3">
            {[{ value: 'pickup', emoji: '📍', label: 'Pickup', sub: 'Buyer collects in person' }, { value: 'delivery', emoji: '🚚', label: 'Delivery', sub: 'You deliver or ship' }].map(opt => {
              const selected = deliveryOptions.includes(opt.value);
              return (
                <button key={opt.value} type="button"
                  onClick={() => setDeliveryOptions(prev => selected ? prev.filter(o => o !== opt.value) : [...prev, opt.value])}
                  className={`flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-all ${selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                  <span className="text-2xl">{opt.emoji}</span>
                  <p className={`text-sm font-bold ${selected ? 'text-blue-700' : 'text-gray-800'}`}>{opt.label}</p>
                  <p className={`text-xs text-center ${selected ? 'text-blue-500' : 'text-gray-400'}`}>{opt.sub}</p>
                  {selected && <CheckCircle className="w-4 h-4 text-blue-500" />}
                </button>
              );
            })}
          </div>
          {deliveryOptions.includes('delivery') && (
            <div className="mt-3">
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Delivery Price (CAD)</label>
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 focus-within:border-blue-400 transition-all">
                <DollarSign className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <input type="number" min="0" step="0.01" placeholder="0.00" value={deliveryPrice} onChange={e => setDeliveryPrice(e.target.value)}
                  className="flex-1 bg-transparent text-sm placeholder-gray-300 outline-none font-semibold" />
                <span className="text-xs text-gray-400 font-semibold shrink-0">CAD</span>
              </div>
            </div>
          )}
        </Section>

        {/* ── Contact Methods ── */}
        <Section icon="📞" title="Contact Methods">
          <p className="text-xs text-gray-400 mb-4">Let buyers know how to reach you outside of Filmons</p>
          <div className="space-y-2">
            {contactMethodDefs.map(def => {
              const active = selectedMethods.has(def.type);
              return (
                <div key={def.type} className={`rounded-xl border-2 overflow-hidden transition-all ${active ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200 bg-white'}`}>
                  <button type="button" onClick={() => toggleContactMethod(def.type, !active)}
                    className="w-full flex items-center gap-3 px-4 py-3">
                    <div className="w-7 h-7 flex items-center justify-center">{def.icon}</div>
                    <span className={`flex-1 text-sm font-semibold text-left ${active ? 'text-blue-700' : 'text-gray-700'}`}>{def.label}</span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${active ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                      {active && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                  {active && (
                    <div className="px-4 pb-3">
                      <input type="text" placeholder={def.placeholder} value={contactInputs[def.type] || ''}
                        onChange={e => setContactInputs({ ...contactInputs, [def.type]: e.target.value })}
                        className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-sm text-gray-800 placeholder-gray-300 outline-none focus:border-blue-400 transition-all" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <div className="h-4" />
      </form>

      {/* Sticky submit */}
      <div className="fixed bottom-0 left-0 right-0 z-10 bg-white border-t border-gray-100 px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <button type="button" onClick={() => handleSubmit()} disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-2xl py-4 transition-colors shadow-lg">
            {isUploadingMedia ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uploading media…</>
            ) : isSubmitting ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving changes…</>
            ) : (
              <>Save Changes <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, required, children }: { icon: string; title: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-1 flex items-center gap-2.5">
        <span className="text-lg">{icon}</span>
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {required && <span className="text-red-400 text-sm font-bold">*</span>}
      </div>
      <div className="px-4 pb-4 pt-2">{children}</div>
    </div>
  );
}