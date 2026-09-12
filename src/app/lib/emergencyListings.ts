// Client wrapper for the server-gated get-emergency-listings edge
// function. Every Emergency-listing read in the app must go through this
// (never a direct supabase.from('listings') query) -- see that function's
// own comment for why a plain RLS policy can't do this job here.
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { Listing } from '../types';
import { mapListingRow } from './api';

export async function fetchEmergencyListings(params: {
  userId?: string; query?: string; priceMin?: number; priceMax?: number; location?: string; from?: number; to?: number;
}): Promise<{ listings: Listing[]; total: number; blocked: boolean }> {
  try {
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/get-emergency-listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // 403 professional_required is the expected, common case for every
      // Guest/Creator/Creator+ caller -- not an error to log or surface as
      // one, just "you don't get any rows."
      return { listings: [], total: 0, blocked: true };
    }
    return { listings: (data.listings || []).map(mapListingRow), total: data.total || 0, blocked: false };
  } catch {
    return { listings: [], total: 0, blocked: true };
  }
}
