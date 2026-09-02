// Dedicated full list for Profile's "Liked Listings" / "Liked Creators"
// preview sections (which only ever show the first 3 + a "See all" link).
// Same `favorites` table/row shape and card markup as those inline
// previews — just the full collection with no cap.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Film, MapPin, Package, User, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';

export function LikedItems({ type }: { type: 'listing' | 'creator' }) {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login', { replace: true }); return; }
    if (!user?.id) return;
    setLoading(true);
    supabase.from('favorites').select('id, item_id, item_data')
      .eq('user_id', user.id).eq('item_type', type).order('created_at', { ascending: false })
      .then(r => { setItems(r.data || []); setLoading(false); }, () => setLoading(false));
  }, [user?.id, isAuthenticated]); // eslint-disable-line

  if (!isAuthenticated || !user) return null;

  const isListing = type === 'listing';

  return (
    <div className="max-w-md mx-auto px-5 py-6">
      <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 -ml-2 mb-2">
        <ArrowLeft className="w-4 h-4 text-gray-500" />
      </button>
      <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
        {isListing ? <Package className="w-5 h-5" /> : <User className="w-5 h-5" />}
        {isListing ? 'Liked Listings' : 'Liked Creators'}
      </h1>
      <p className="text-sm text-gray-400 mt-1">{items.length} {items.length === 1 ? 'item' : 'items'}</p>

      <div className="mt-5 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-blue-400 animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            {isListing
              ? <><Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />Swipe right on listings to save them here.</>
              : <><User className="w-8 h-8 mx-auto mb-2 text-gray-300" />Swipe right on creators to like them here.</>}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {isListing ? items.map((fav: any) => {
              const item = fav.item_data || {};
              const price = item.price ? `$${Number(item.price).toLocaleString()}` : '';
              const suffix = item.listingMode === 'rent' ? '/day' : item.listingType === 'service' ? '/hr' : '';
              const isEmergency = !!item.isEmergency && !!item.emergencyExpiresAt && new Date(item.emergencyExpiresAt) > new Date();
              return (
                <button
                  key={fav.item_id || fav.id}
                  onClick={() => navigate(`/listing/${fav.item_id || item.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                >
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                    {item.images?.[0]
                      ? <img src={item.images[0]} className="w-full h-full object-cover" alt="" />
                      : <div className="w-full h-full flex items-center justify-center"><Film className="w-6 h-6 text-gray-300" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-gray-900 truncate">{item.title || 'Listing'}</p>
                      {isEmergency && (
                        <span className="shrink-0 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-red-500 text-white flex items-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5 fill-white" /> Emergency
                        </span>
                      )}
                    </div>
                    {item.city && <p className="text-xs text-gray-400 truncate flex items-center gap-0.5"><MapPin className="w-3 h-3 shrink-0" /> {item.city}</p>}
                  </div>
                  {price && <p className="text-sm font-black text-blue-600 shrink-0">{price}{suffix}</p>}
                </button>
              );
            }) : items.map((fav: any) => {
              const c = fav.item_data || {};
              return (
                <button
                  key={fav.item_id || fav.id}
                  onClick={() => navigate(`/host/${fav.item_id || c.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                >
                  <div className="w-11 h-11 rounded-full overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
                    {c.avatar_url
                      ? <img src={c.avatar_url} className="w-full h-full object-cover" alt="" />
                      : <div className="w-full h-full flex items-center justify-center text-gray-400 font-black text-sm">{c.name?.[0]?.toUpperCase() ?? '?'}</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.name || 'Creator'}</p>
                    {c.primary_role && <p className="text-xs text-blue-600 truncate">{c.primary_role}</p>}
                    {c.city && <p className="text-xs text-gray-400 flex items-center gap-0.5"><MapPin className="w-3 h-3 shrink-0" /> {c.city}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
