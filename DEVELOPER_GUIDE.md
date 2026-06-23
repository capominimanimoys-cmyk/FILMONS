# Developer Guide - Filmons

## Quick Start

This is a frontend-only React application. No backend setup required!

```bash
# The app is ready to use - just open it in your browser
# All data is stored in localStorage
```

## Architecture Overview

```
User Actions → React Components → API Layer (lib/api.ts) → localStorage
```

## Key Files

### Authentication
- **src/app/context/AuthContext.tsx** - Authentication context and state
- **src/app/pages/Login.tsx** - Login/signup page

### Listings
- **src/app/pages/Home.tsx** - Browse all listings
- **src/app/pages/CreateListing.tsx** - Create new listing
- **src/app/pages/MyListings.tsx** - User's listings
- **src/app/pages/ListingDetail.tsx** - Single listing view

### API Layer
- **src/app/lib/api.ts** - All data operations (localStorage-based)
- **src/app/lib/initializeData.ts** - Sample data initialization

## Data Flow

### Creating a Listing
```
CreateListing.tsx
  → listingsApi.create()
  → localStorage.setItem('filmons_listings', ...)
  → Navigate to /my-listings
```

### User Authentication
```
Login.tsx
  → authApi.signin()
  → localStorage.setItem('filmons_current_user', ...)
  → AuthContext updates
  → Navigate to /
```

## localStorage API

### Available Functions

```typescript
// Authentication
authApi.signup(email, password, name)
authApi.signin(email, password)
authApi.getMe()
authApi.getCurrentUser()

// Listings
listingsApi.getAll()
listingsApi.getOne(id)
listingsApi.getUserListings(userId)
listingsApi.create(listing)
listingsApi.update(id, updates)
listingsApi.delete(id)
listingsApi.uploadImage(file)
```

## Adding New Features

### Example: Add Rating System

1. **Update Type**
```typescript
// src/app/types/index.ts
export interface Listing {
  // ... existing fields
  rating?: number;
  ratingCount?: number;
}
```

2. **Update UI**
```tsx
// Add to ListingDetail.tsx
<div className="flex items-center">
  <Star className="w-5 h-5 text-yellow-400" />
  <span>{listing.rating || 'No ratings yet'}</span>
</div>
```

3. **Add API Function**
```typescript
// src/app/lib/api.ts
export const listingsApi = {
  // ... existing functions
  
  addRating: async (listingId: string, rating: number) => {
    const listings = getStoredListings();
    const index = listings.findIndex(l => l.id === listingId);
    
    if (index !== -1) {
      const listing = listings[index];
      const currentRating = listing.rating || 0;
      const currentCount = listing.ratingCount || 0;
      
      listings[index] = {
        ...listing,
        rating: (currentRating * currentCount + rating) / (currentCount + 1),
        ratingCount: currentCount + 1,
      };
      
      saveListings(listings);
    }
  },
};
```

## Debugging

### View localStorage Data
```javascript
// In browser console
console.log('Users:', JSON.parse(localStorage.getItem('filmons_users')));
console.log('Listings:', JSON.parse(localStorage.getItem('filmons_listings')));
console.log('Current User:', JSON.parse(localStorage.getItem('filmons_current_user')));
```

### Clear All Data
```javascript
// In browser console
localStorage.clear();
location.reload(); // Will reload sample data
```

### Inspect Specific Listing
```javascript
// In browser console
const listings = JSON.parse(localStorage.getItem('filmons_listings'));
console.log(listings.find(l => l.id === 'YOUR_LISTING_ID'));
```

## Common Tasks

### Change Sample Data
Edit `src/app/lib/initializeData.ts` and clear localStorage

### Add New Page
1. Create component in `src/app/pages/`
2. Add route in `src/app/routes.tsx`
3. Add navigation link in `src/app/components/Header.tsx`

### Modify Styling
- Global styles: `src/styles/theme.css`
- Tailwind: Use inline classes in components
- UI components: `src/app/components/ui/`

## Performance Tips

1. **Images**: Sample data uses Unsplash URLs instead of base64
2. **Search**: Client-side filtering is fast for <1000 listings
3. **Loading States**: Keep simulated delays (200-800ms) for UX

## Security Notes

⚠️ **This is a demo app**:
- Passwords are not hashed
- No input validation on auth
- Anyone can access localStorage data
- No rate limiting or security measures

**Do not use for production without proper backend!**

## Testing

### Manual Test Checklist
```
[ ] Sign up with new email
[ ] Sign in with existing user
[ ] Create listing with image
[ ] Create listing without image
[ ] Search listings
[ ] View listing details
[ ] Delete own listing
[ ] Can't delete other's listing
[ ] Profile page shows correct info
[ ] Logout clears session
[ ] Refresh preserves auth state
```

### localStorage Test
```javascript
// Should start empty, then populate
localStorage.clear();
location.reload();
// Check for 6 sample listings and 2 demo users
```

## Troubleshooting

### "No listings found"
- Check if sample data loaded
- Clear localStorage and refresh

### "Not authenticated" errors
- Check `filmons_current_user` in localStorage
- Try logging in again

### Images not showing
- Check if image URLs are accessible
- For uploaded images, check base64 encoding

### Changes not persisting
- Check browser's localStorage quota
- Try clearing old data

## Future Enhancements

Ideas for extending the app:
- Categories and filters
- User profiles with avatars
- Messaging system
- Favorite/bookmark listings
- Rating and review system
- Booking/reservation system
- Export/import data as JSON
- Multiple images per listing
- Image compression before storage
- Search by location (with map)

## Resources

- [React Documentation](https://react.dev)
- [React Router](https://reactrouter.com)
- [Tailwind CSS](https://tailwindcss.com)
- [Radix UI](https://www.radix-ui.com)
- [localStorage API](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
