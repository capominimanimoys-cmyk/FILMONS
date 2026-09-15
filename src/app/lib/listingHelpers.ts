// Service-listing predicate for the mapped, camelCase `Listing` type (see
// src/app/types) -- NOT the same shape as filmSearch.ts's isServiceListing,
// which checks `listing_type` (snake_case) on the raw SearchListingRow rows
// used by search/category browsing. Profile.tsx and HostProfile.tsx used to
// import filmSearch.ts's version against listingsApi.getUserListings()'s
// camelCase Listing[] -- `l.listing_type` is always undefined on that
// shape, so it silently never matched anything: the Services section was
// permanently empty (every real Service listing fell into the "Listings"
// section instead, since the negation of an always-false check is
// always-true).
import { Listing } from '../types';

export function isServiceListing(l: Pick<Listing, 'listingType'>): boolean {
  return l.listingType === 'service';
}
