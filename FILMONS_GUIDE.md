# Filmons - Film Gear Rental Marketplace

A frontend-only web application for renting and listing film equipment, built with React, TypeScript, and localStorage.

## Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: React Router v7
- **Styling**: Tailwind CSS v4
- **UI Components**: Radix UI with custom shadcn/ui components
- **State Management**: React Context API for authentication
- **Notifications**: Sonner for toast notifications
- **Data Storage**: Browser localStorage

### Data Persistence
- **Storage**: Browser localStorage (no backend required)
- **Authentication**: Simple localStorage-based user management
- **Images**: Base64 encoded and stored in localStorage

## Database Schema

### Listing Data Structure
```typescript
{
  id: string;           // UUID
  userId: string;       // Owner's user ID
  title: string;        // Listing title
  description: string;  // Detailed description
  tags: string[];       // Array of tags
  price: number;        // Price per day
  city: string;         // Location city
  image?: string;       // Base64 image data (optional)
  createdAt: string;    // ISO timestamp
}
```

### User Data Structure
```typescript
{
  id: string;        // User ID
  email: string;     // User email
  name: string;      // Display name
}
```

## Features

### User Features
- **Authentication**: Sign up and sign in (localStorage-based)
- **Browse Listings**: View all available equipment
- **Search & Filter**: Search by title, description, city, or tags
- **Create Listings**: Add new equipment with image upload
- **Manage Listings**: View and delete your own listings
- **Listing Details**: View detailed information about equipment
- **Sample Data**: Pre-loaded with example listings

### Technical Features
- **Local Storage**: All data persisted in browser
- **Image Upload**: Images converted to base64 for storage
- **Responsive Design**: Mobile-friendly interface
- **Real-time Updates**: Instant reflection of changes
- **Error Handling**: Comprehensive error messages
- **Loading States**: User-friendly loading indicators

## Project Structure

```
/src/app/
├── components/          # Reusable components
│   ├── ui/             # UI component library
│   └── Header.tsx      # Navigation header
├── context/            # React contexts
│   └── AuthContext.tsx # Authentication context
├── lib/               # Utility libraries
│   ├── api.ts         # localStorage API functions
│   └── initializeData.ts  # Sample data initialization
├── pages/             # Route pages
│   ├── Home.tsx       # Browse listings
│   ├── Login.tsx      # Authentication
│   ├── CreateListing.tsx  # Create new listing
│   ├── MyListings.tsx     # User's listings
│   ├── ListingDetail.tsx  # Single listing view
│   ├── Profile.tsx    # User profile
│   └── Root.tsx       # Layout wrapper
├── types/             # TypeScript types
│   └── index.ts       # Type definitions
├── App.tsx            # App entry point
└── routes.tsx         # Route configuration
```

## Getting Started

### First Time Use
The app comes pre-loaded with sample listings. You can browse them immediately or create your own account to add new listings.

### Sign Up
1. Click "Sign In" in the header
2. Switch to "Sign Up" tab
3. Enter your name, email, and password (any values work)
4. You'll be automatically signed in

**Note**: This is a demo app - passwords are not validated or secured.

### Create a Listing
1. After signing in, click "List Item"
2. Fill in the listing details:
   - Title (required)
   - Description (required)
   - Tags (optional, press Enter to add)
   - Price per day (required)
   - City (required)
   - Image (optional, max 5MB, converted to base64)
3. Click "Create Listing"

### Browse and Search
1. Visit the home page
2. Use the search bar to filter listings
3. Click on any listing card to view details
4. Contact the owner through the listing detail page

### Manage Your Listings
1. Click "My Listings" in the header
2. View all your listed equipment
3. Delete listings you no longer want

### View Profile
1. Click on your name in the header
2. View your profile information

## Data Management

### localStorage Keys
- `filmons_users` - Array of user accounts
- `filmons_current_user` - Currently logged-in user
- `filmons_listings` - Array of all listings

### Clearing Data
To reset the app and remove all data:
1. Open browser developer tools (F12)
2. Go to Application/Storage tab
3. Clear localStorage for this site
4. Refresh the page to reload sample data

## Limitations

- **Data Persistence**: Data only exists in your browser and will be lost if you clear browser data
- **No Password Security**: Passwords are not hashed or validated
- **No Real Authentication**: Anyone can create any account
- **Image Storage**: Large images stored as base64 may impact performance
- **Single Browser**: Data doesn't sync across browsers or devices

## Technology Highlights

- **Type Safety**: Full TypeScript coverage
- **Modern UI**: Beautiful, accessible components with Radix UI
- **Zero Backend**: Completely frontend-only application
- **Easy Setup**: No database or API configuration needed
- **Developer Experience**: Hot reload, TypeScript, modern React patterns
