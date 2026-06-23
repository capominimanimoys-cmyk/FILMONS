import { Listing, User } from '../types';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879`;
const H    = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` };

const SEED_KEY = 'filmons_seed_v3'; // bump version to re-seed after schema changes

async function serverGet(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: H, signal: AbortSignal.timeout(8000) });
  return res.json();
}
async function serverPost(path: string, body: any) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: H, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  return res.json();
}

// ── Demo user ──────────────────────────────────────────────────────────────
const DEMO_USER: User = {
  id: 'demo-user-1',
  email: 'demo@filmons.com',
  name: 'Demo User',
  username: 'demouser',
  bio: 'Your go-to demo account for testing Filmons features. 🎬',
  location: 'Los Angeles, CA',
  avatar: undefined,
  isVerified: true,
  accountMode: 'business',
  accountType: 'business',
  accountCategory: 'Filmmaker',
  followers: [],
  following: [],
  contactPublic: true,
  createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
};

const DEMO_GEAR_LISTING: Listing = {
  id: 'demo-listing-gear-1',
  userId: 'demo-user-1',
  title: 'Sony FX3 Cinema Line Camera',
  description: 'Full-frame cinema camera perfect for short films, documentaries, and commercial work.',
  tags: ['Sony', 'FX3', 'Cinema', 'Full-Frame', 'Camera'],
  price: 150,
  city: 'Los Angeles, CA',
  image: 'https://images.unsplash.com/photo-1616458441859-5c92fcaa6699?w=800&q=80',
  images: ['https://images.unsplash.com/photo-1616458441859-5c92fcaa6699?w=800&q=80'],
  videos: [],
  contactMethods: [],
  createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  listingType: 'gear',
  listingMode: 'rent',
};

const DEMO_SERVICE_LISTING: Listing = {
  id: 'demo-listing-service-1',
  userId: 'demo-user-1',
  title: 'Professional Videography & Cinematography',
  description: 'Award-winning cinematographer with 8 years of experience.',
  tags: ['Videography', 'Cinematography', 'DP'],
  price: 300,
  city: 'Los Angeles, CA',
  image: 'https://images.unsplash.com/photo-1605810230434-7631ac76ec81?w=800&q=80',
  images: ['https://images.unsplash.com/photo-1605810230434-7631ac76ec81?w=800&q=80'],
  videos: [],
  contactMethods: [],
  createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  listingType: 'service',
  serviceCategory: 'videographer',
  pricingPackages: [
    { tier: 'standard',     name: 'Half Day', price: 300, description: 'Up to 5 hours.' },
    { tier: 'intermediate', name: 'Full Day',  price: 550, description: 'Up to 10 hours.' },
  ],
};

// ── Seed demo data to server (runs once per browser, delayed so it doesn't
//    race with initial page load requests) ──────────────────────────────────
export async function initializeSampleData() {
  // Already seeded this session — skip entirely
  if (sessionStorage.getItem(SEED_KEY)) return;

  // Delay 4s so page load completes first
  await new Promise(r => setTimeout(r, 4000));

  try {
    const { user: existingUser } = await serverGet(`/users/${DEMO_USER.id}`);
    if (!existingUser) {
      await serverPost('/users', DEMO_USER);
      console.log('✅ Demo user seeded to server');
    }

    const { listing: existingGear } = await serverGet(`/listings/${DEMO_GEAR_LISTING.id}`);
    if (!existingGear) await serverPost('/listings', DEMO_GEAR_LISTING);

    const { listing: existingService } = await serverGet(`/listings/${DEMO_SERVICE_LISTING.id}`);
    if (!existingService) await serverPost('/listings', DEMO_SERVICE_LISTING);

    sessionStorage.setItem(SEED_KEY, '1');
  } catch (e) {
    console.warn('Demo seed failed (server may be unavailable), using localStorage fallback:', e);
    _seedLocalFallback();
    sessionStorage.setItem(SEED_KEY, '1'); // don't retry on next render
  }
}

function _seedLocalFallback() {
  const users: User[] = JSON.parse(localStorage.getItem('filmons_users') || '[]');
  if (!users.find(u => u.id === DEMO_USER.id)) {
    users.push(DEMO_USER);
    localStorage.setItem('filmons_users', JSON.stringify(users));
  }
  const listings: Listing[] = JSON.parse(localStorage.getItem('filmons_listings') || '[]');
  let changed = false;
  if (!listings.find(l => l.id === DEMO_GEAR_LISTING.id))    { listings.push(DEMO_GEAR_LISTING);    changed = true; }
  if (!listings.find(l => l.id === DEMO_SERVICE_LISTING.id)) { listings.push(DEMO_SERVICE_LISTING); changed = true; }
  if (changed) localStorage.setItem('filmons_listings', JSON.stringify(listings));
}

export function cleanupListings() {}

export async function seedDemoData(currentUserId: string) {
  if (currentUserId === 'demo-user-1') return;
  await initializeSampleData();
  await seedDemoInboxRequest(currentUserId);
}

export async function seedDemoInboxRequest(currentUserId: string) {
  if (currentUserId === 'demo-user-1') return;
  const CONV_KEY = 'filmons_conversations';
  const CONV_ID  = `demo-conv-${currentUserId}`;

  // Check localStorage first — avoid server call if already seeded
  const existing: any[] = JSON.parse(localStorage.getItem(CONV_KEY) || '[]');
  if (existing.find((c: any) => c.id === CONV_ID)) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 3);
  const startDate = tomorrow.toISOString().split('T')[0];

  const demoConv = {
    id: CONV_ID,
    participantIds: ['demo-user-1', currentUserId],
    messages: [{
      id: `demo-msg-${Date.now()}`,
      senderId: 'demo-user-1', senderName: 'Demo User', senderAvatar: undefined,
      type: 'rental_request',
      rentalRequest: {
        listingId: 'demo-listing-service-1',
        listingTitle: 'Professional Videography & Cinematography',
        listingType: 'service', startDate, duration: 8, durationType: 'hours',
        message: "Hey! I'd love to book you for a brand-film shoot. Full day, two DTLA locations.",
        selectedPackage: { tier: 'intermediate', name: 'Full Day', price: 550, description: 'Up to 10 hours.' },
        status: 'pending',
      },
      createdAt: new Date().toISOString(), read: false,
    }],
    updatedAt: new Date().toISOString(),
  };

  // Seed to localStorage immediately (no server call needed for demo data)
  existing.push(demoConv);
  localStorage.setItem(CONV_KEY, JSON.stringify(existing));
  console.log('✅ Demo inbox request seeded to localStorage');
}