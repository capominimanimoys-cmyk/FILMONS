/**
 * Filmons — ListingTagSheet
 * Bottom sheet preview when user taps a listing tag on media.
 * src/app/components/ListingTagSheet.tsx
 */
import { useState } from 'react';
import { X, MapPin, ExternalLink, Bookmark, Share2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { Listing } from '../types';

interface Props {
  listing: Listing;
  onClose: () => void;
}

export function ListingTagSheet({ listing, onClose }: Props) {
  const navigate  = useNavigate();
  const img       = listing.images?.[0] ?? listing.image;
  const price     = listing.pricingPackages?.[0]?.price ?? listing.price;
  const unit      = listing.listingMode === 'rent' ? '/day' : '';
  const [saved, setSaved] = useState(false);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end">
      <style>{`@keyframes tagSheetIn{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-t-3xl overflow-hidden"
        style={{animation:'tagSheetIn 0.28s cubic-bezier(0.32,0.72,0,1)', paddingBottom:'env(safe-area-inset-bottom)'}}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-gray-200"/>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100">
          <p className="text-sm font-black text-gray-900">Linked Listing</p>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-3.5 h-3.5 text-gray-500"/>
          </button>
        </div>

        {/* Cover */}
        {img && <img src={img} className="w-full h-48 object-cover"/>}

        {/* Info */}
        <div className="px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-base font-black text-gray-900">{listing.title}</p>
              {price && (
                <p className="text-lg font-black mt-1" style={{color:'#51A2FF'}}>
                  ${Number(price).toLocaleString()}{unit}
                </p>
              )}
              {listing.city && (
                <p className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                  <MapPin className="w-3 h-3"/> {listing.city}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1 capitalize">
                {listing.listingType === 'service'
                  ? listing.serviceCategory?.replace(/-/g,' ') || 'Service'
                  : listing.listingMode === 'sale' ? 'For Sale' : 'Rental'}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={()=>setSaved(s=>!s)}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${saved?'bg-blue-50 text-blue-500':'bg-gray-100 text-gray-500'}`}>
                <Bookmark className={`w-4 h-4 ${saved?'fill-blue-500':''}`}/>
              </button>
              <button className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                <Share2 className="w-4 h-4"/>
              </button>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="px-4 pb-4">
          <button
            onClick={()=>{ navigate(`/listing/${listing.id}`); onClose(); }}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black text-white transition-all active:scale-[0.98]"
            style={{background:'#51A2FF', boxShadow:'0 4px 16px rgba(81,162,255,0.35)'}}>
            <ExternalLink className="w-4 h-4"/>
            {listing.listingMode === 'rent' ? 'Rent Now' : listing.listingType === 'service' ? 'Book Service' : 'View Listing'}
          </button>
        </div>
      </div>
    </div>
  );
}