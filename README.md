# Filmons — Film Gear & Creative Services Marketplace

> Canada's marketplace for renting film gear, booking creative services, and building a filmmaker community.

[![React](https://img.shields.io/badge/React-18-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-backend-3ecf8e?logo=supabase)](https://supabase.com)

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **pnpm** ≥ 8 (`npm install -g pnpm`)
- A **Supabase** project (free tier works fine)
- A **Twilio** account for SMS OTP
- A **Google Cloud** project with the Places & Geocoding APIs enabled
- An **EmailJS** account for transactional emails

### 1 — Clone & install

```bash
git clone https://github.com/your-username/filmons.git
cd filmons
pnpm install
```

### 2 — Configure frontend

The frontend reads two public values from `utils/supabase/info.tsx`.  
Open that file and replace the placeholders with your Supabase project details:

```ts
export const projectId   = "your-supabase-project-id"
export const publicAnonKey = "your-supabase-anon-key"
```

Update `src/app/lib/emailjs-config.ts` with your EmailJS credentials:

```ts
export const EMAILJS_CONFIG = {
  serviceId:  'your_service_id',
  publicKey:  'your_public_key',
  templates: {
    emailVerification:     'template_xxxxxx',   // 6-digit OTP
    verificationSubmission: 'template_xxxxxx',  // welcome email
  },
  filmons: { email: 'your@email.com', teamName: 'Your Team' },
};
```

### 3 — Configure backend secrets

All secrets are consumed by the Supabase Edge Function and must **never** be in frontend code.

Copy the example file and fill it in:

```bash
cp .env.example .env.local
```

Then push them to Supabase:

```bash
# Install Supabase CLI if you haven't already
npm install -g supabase

supabase login
supabase link --project-ref your-project-id

supabase secrets set SUPABASE_URL=https://your-project-id.supabase.co
supabase secrets set SUPABASE_ANON_KEY=your-anon-key
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
supabase secrets set SUPABASE_DB_URL=postgresql://postgres:password@db.your-project-id.supabase.co:5432/postgres
supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
supabase secrets set TWILIO_AUTH_TOKEN=your-auth-token
supabase secrets set TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
supabase secrets set GOOGLE_API_KEY=your-google-api-key
```

Alternatively, set them through **Supabase Dashboard → Project Settings → Edge Functions → Secrets**.

### 4 — Deploy the Edge Function

```bash
supabase functions deploy server --project-ref your-project-id
```

### 5 — Run locally

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

### 6 — Build for production

```bash
pnpm build       # outputs to /dist
pnpm preview     # preview the production build locally
```

---

## Project Structure

```
filmons/
├── public/                          # Static assets (favicon, og-image, etc.)
│
├── src/
│   ├── app/
│   │   ├── App.tsx                  # Root — RouterProvider + AuthProvider + Toaster
│   │   ├── routes.tsx               # All React Router routes
│   │   │
│   │   ├── components/              # ── Reusable UI components ──────────────────
│   │   │   ├── ui/                  # shadcn/ui primitives (Button, Card, Badge…)
│   │   │   │
│   │   │   │── Core / layout
│   │   │   ├── Header.tsx           # Sticky top nav — logo, links, user avatar
│   │   │   ├── Footer.tsx           # 4-column footer with platform / legal links
│   │   │   ├── PageWrapper.tsx      # Consistent page container
│   │   │   ├── SectionHeader.tsx    # Section title + optional "See all" CTA
│   │   │   │
│   │   │   │── Data display
│   │   │   ├── ListingCard.tsx      # Gear/service card (image, price, tags)
│   │   │   ├── StatsCard.tsx        # Metric/KPI card + StatsGrid layout helper
│   │   │   ├── EmptyState.tsx       # Zero-data placeholder with optional CTA
│   │   │   ├── AccountTypeBadge.tsx # Creator / Creator+ / Service badge + UserAvatar
│   │   │   ├── FPBadge.tsx          # FP balance chip for the header
│   │   │   ├── PostCard.tsx         # Social feed post card
│   │   │   ├── AudioPlayer.tsx      # In-post audio playback widget
│   │   │   │
│   │   │   │── Modals / overlays
│   │   │   ├── EditProfileModal.tsx # Full profile-editing drawer
│   │   │   ├── RentRequestModal.tsx # Rental-request sheet
│   │   │   ├── ShareListingModal.tsx# Share listing via DM / copy-link
│   │   │   ├── SharePostModal.tsx   # Share post via DM / copy-link
│   │   │   ├── BoostModal.tsx       # FP Boost picker modal
│   │   │   ├── GifPicker.tsx        # Tenor GIF picker
│   │   │   ├── CameraCapture.tsx    # Native camera capture for posts
│   │   │   │
│   │   │   └── Utility
│   │   │       ├── FilterPanel.tsx               # Listing filter drawer
│   │   │       ├── FeedSearch.tsx                # Debounced feed search
│   │   │       ├── PostComposer.tsx              # Rich post creation
│   │   │       └── LocationPermissionDialog.tsx  # Geolocation prompt
│   │   │
│   │   ├── pages/                   # ── Route-level page components ─────────────
│   │   │   ├── Root.tsx             # Layout shell — Header + <Outlet> + Footer
│   │   │   ├── Home.tsx             # Landing page
│   │   │   ├── Marketplace.tsx      # Full listing browser
│   │   │   ├── Feed.tsx             # Social feed
│   │   │   ├── ListingDetail.tsx    # Single listing view
│   │   │   ├── CreateListing.tsx    # Multi-step listing creation
│   │   │   ├── EditListing.tsx      # Edit an existing listing
│   │   │   ├── MyListings.tsx       # User's own listings manager
│   │   │   ├── Profile.tsx          # Auth'd user profile
│   │   │   ├── HostProfile.tsx      # Public host profile
│   │   │   ├── HostDashboard.tsx    # Creator analytics dashboard
│   │   │   ├── FPWallet.tsx         # FP balance, packs, send, withdraw
│   │   │   ├── Inbox.tsx            # DM inbox with rental/payment requests
│   │   │   ├── Checkout.tsx         # Booking checkout flow
│   │   │   ├── Verification.tsx     # Identity verification request
│   │   │   ├── AdminVerifications.tsx # Internal admin tool (pw-protected)
│   │   │   ├── Login.tsx / PhoneSignup.tsx / PhoneLogin.tsx
│   │   │   ├── RefundPolicy.tsx / PrivacyPolicy.tsx / TermsConditions.tsx
│   │   │   └── ...
│   │   │
│   │   ├── context/
│   │   │   └── AuthContext.tsx      # Global auth state
│   │   │
│   │   ├── lib/
│   │   │   ├── api.ts               # Server API client
│   │   │   ├── fpSystem.ts          # FP economy helpers
│   │   │   ├── sms.ts               # Twilio OTP helpers
│   │   │   ├── emailjs-config.ts    # EmailJS constants
│   │   │   └── initializeData.ts    # Demo-data seeder
│   │   │
│   │   ├── data/
│   │   │   └── mockListings.ts      # Static placeholder listings
│   │   │
│   │   ├── types/
│   │   │   └── index.ts             # TypeScript interfaces
│   │   │
│   │   └── templates/               # EmailJS HTML templates (preview only)
│   │
│   ├── lib/
│   │   └── supabase.ts              # Supabase client singleton
│   │
│   └── styles/
│       ├── fonts.css                # Neue Montreal @font-face
│       ├── index.css                # Tailwind base / reset
│       ├── tailwind.css             # @import "tailwindcss"
│       └── theme.css                # CSS variables — colours, radius, spacing
│
├── supabase/
│   └── functions/
│       └── server/
│           ├── index.tsx            # Hono edge function — all REST endpoints
│           ├── kv.tsx               # KV helper using direct Postgres
│           └── kv_store.tsx         # Built-in KV interface (do not edit)
│
├── utils/
│   └── supabase/
│       └── info.tsx                 # projectId + publicAnonKey (update after cloning)
│
├── .env.example                     # Template for required secrets
├── .gitignore
├── package.json
├── vite.config.ts
└── README.md
```

---

## Pages

| Route | Component | Description |
|---|---|---|
| `/` | `Home` | Landing page — hero, categories, featured listings |
| `/marketplace` | `Marketplace` | Listing browser with search, filters, geolocation sort |
| `/listing/:id` | `ListingDetail` | Single listing — images, reviews, rent/book CTA |
| `/feed` | `Feed` | Social feed — posts, likes, comments |
| `/inbox` | `Inbox` | DM inbox with rental & payment request cards |
| `/profile` | `Profile` | Auth'd user profile, settings, posts |
| `/host/:userId` | `HostProfile` | Public host page — listings, follow, reviews |
| `/dashboard` | `HostDashboard` | Creator/host analytics dashboard |
| `/wallet` | `FPWallet` | FP balance, buy packs, send FP, boost, withdraw |
| `/checkout` | `Checkout` | Booking checkout flow |
| `/create-listing` | `CreateListing` | Multi-step listing creation |
| `/edit-listing/:id` | `EditListing` | Edit existing listing |
| `/my-listings` | `MyListings` | Manage own listings |
| `/verification` | `Verification` | Identity verification request |
| `/admin-verifications` | `AdminVerifications` | Internal admin tool (pw: see owner) |

---

## Data Layer

All server calls go through `src/app/lib/api.ts`, which points to the Supabase Edge Function:

```
https://<projectId>.supabase.co/functions/v1/make-server-ec8fe879/<route>
```

| Export | Description |
|---|---|
| `authApi` | signup / signin / phone OTP / getMe / updateUser |
| `listingsApi` | CRUD + image/video upload, localStorage fallback |
| `reviewsApi` | Get / create / delete reviews |
| `postsApi` | Create / like / delete posts |
| `commentsApi` | Add / delete post comments |
| `socialApi` | follow / unfollow / isFollowing |
| `savedPostsApi` | Save / unsave posts |
| `savedListingsApi` | Save / unsave listings |
| `chatApi` | Conversations / messages (dual-write localStorage + server) |

FP economy lives in `lib/fpSystem.ts` (`fpApi`):

| Method | Description |
|---|---|
| `credit / debit` | Modify FP balance |
| `purchasePack` | Buy an FP pack |
| `sendFP` | Peer-to-peer FP transfer |
| `boostContent` | Boost a listing or post |
| `requestWithdrawal` | Cash-out request |

---

## Environment & Secrets

| Secret | Location | Used by |
|---|---|---|
| `SUPABASE_URL` | Supabase vault | Server |
| `SUPABASE_ANON_KEY` | Supabase vault | Server + frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase vault | **Server only** — never expose |
| `SUPABASE_DB_URL` | Supabase vault | `kv.tsx` (direct Postgres) |
| `TWILIO_ACCOUNT_SID` | Supabase vault | Server SMS routes |
| `TWILIO_AUTH_TOKEN` | Supabase vault | Server SMS routes |
| `TWILIO_PHONE_NUMBER` | Supabase vault | Server SMS routes |
| `GOOGLE_API_KEY` | Supabase vault | Address autocomplete proxy |

> EmailJS keys are public-safe and live in `src/app/lib/emailjs-config.ts`.  
> Supabase `projectId` and `publicAnonKey` live in `utils/supabase/info.tsx`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite 6 |
| Routing | React Router v7 (Data mode) |
| Styling | Tailwind CSS v4 + Neue Montreal font |
| UI Primitives | shadcn/ui (Radix UI) |
| Icons | Lucide React |
| Auth / SMS | Supabase Auth + Twilio |
| Backend | Deno / Hono edge function on Supabase |
| Database | Supabase Postgres (KV table) |
| Email | EmailJS (OTP, welcome, admin alerts) |
| Payments | FP (Filmons Points) — in-app economy |
| Animation | Motion (formerly Framer Motion) |

---

## FP (Filmons Points) Economy

| Parameter | Value |
|---|---|
| Buy rate | $0.04 CAD / FP |
| Payout rate | $0.027 CAD / FP |
| Platform fee | 15% |
| Withdrawal fee | 5% |
| Minimum withdrawal | 186 FP (~$5 CAD) |
| Daily view earn cap | 20 FP |

**Packs:** Starter (100 FP / $3.99) · Creator (500 FP / $20.99) · Pro (750 FP / $30.99) · Power (1000 FP / $38.99)

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -m "feat: add my feature"`
4. Push to the branch: `git push origin feat/my-feature`
5. Open a Pull Request

---

*© 2026 Filmons. Built for Canadian filmmakers.*
