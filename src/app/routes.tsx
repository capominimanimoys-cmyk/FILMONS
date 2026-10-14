import { createBrowserRouter } from 'react-router';
import { Root } from './pages/Root';
import { FilmonsBrandLoader } from './components/FilmonsLoader';
import { HardRedirect } from './components/HardRedirect';
import { LearningReturn } from './components/LearningReturn';
import { LegacyHashtagRedirect, LegacyLocationRedirect } from './components/LegacyEntityRedirects';
import { Home } from './pages/Home';
import { Login }         from './pages/Login';


// Pages load on demand (one small chunk each) instead of all being in the first download. The app's
// first paint no longer waits for the code of ~70 pages it may never open.
const page = (load: () => Promise<any>, pick?: string) => ({
  lazy: async () => { const m = await load(); return { Component: pick ? m[pick] : m.default }; },
});

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Root,
    HydrateFallback: () => <FilmonsBrandLoader fullscreen label="Loading" />,
    children: [
      { index: true, Component: Home },
      { path: 'feed', ...page(() => import('./pages/Feed'), 'Feed') },
      { path: 'inbox', ...page(() => import('./pages/Inbox'), 'Inbox') },
      { path: 'checkout', ...page(() => import('./pages/Checkout'), 'Checkout') },
      { path: 'dashboard', ...page(() => import('./pages/HostDashboard'), 'HostDashboard') },
      { path: 'wallet', ...page(() => import('./pages/Wallet'), 'Wallet') },
      { path: 'liked-listings', lazy: async () => { const m = await import('./pages/LikedItems'); const C = m.LikedItems; return { element: <C type="listing"  /> }; } },
      { path: 'liked-creators', lazy: async () => { const m = await import('./pages/LikedItems'); const C = m.LikedItems; return { element: <C type="creator"  /> }; } },
      { path: 'saved-posts', lazy: async () => { const m = await import('./pages/SavedLikedPosts'); const C = m.SavedLikedPosts; return { element: <C type="saved"  /> }; } },
      { path: 'liked-posts', lazy: async () => { const m = await import('./pages/SavedLikedPosts'); const C = m.SavedLikedPosts; return { element: <C type="liked"  /> }; } },
      { path: 'wallet/payout-method', ...page(() => import('./pages/PayoutMethodSetup'), 'PayoutMethodSetup') },
      { path: 'notifications', ...page(() => import('./pages/Notifications'), 'Notifications') },
      { path: 'settings/notifications',  ...page(() => import('./pages/NotificationSettings'), 'NotificationSettings')  },
      { path: 'settings/messages',       ...page(() => import('./pages/MessageSettings'), 'MessageSettings')        },
      { path: 'settings/verification',   ...page(() => import('./pages/VerificationSettings'), 'VerificationSettings')   },
      { path: 'settings/privacy',        ...page(() => import('./pages/PrivacySettings'), 'PrivacySettings')        },
      { path: 'settings/reviews',        ...page(() => import('./pages/ReviewsSettings'), 'ReviewsSettings')        },
      { path: 'settings/devices',        ...page(() => import('./pages/DeviceSettings'), 'DeviceSettings')         },
      { path: 'account/upgrade',          ...page(() => import('./pages/AccountUpgrade'), 'AccountUpgrade')         },
      { path: 'creator-plus-required',    ...page(() => import('./pages/CreatorPlusRequired'), 'CreatorPlusRequired')        },
      { path: 'professional-account-steps',...page(() => import('./pages/ProfessionalAccountSteps'), 'ProfessionalAccountSteps')  },
      { path: 'business-account-steps',   ...page(() => import('./pages/BusinessAccountSteps'), 'BusinessAccountSteps')       },
      { path: 'verification-status',       ...page(() => import('./pages/VerificationStatusPage'), 'VerificationStatusPage')      },
      { path: 'help',                    ...page(() => import('./pages/HelpCenter'), 'HelpCenter')             },
      { path: 'settings',                      ...page(() => import('./pages/Settings'), 'Settings')                    },
      { path: 'settings/language',             ...page(() => import('./pages/LanguageSettings'), 'LanguageSettings')              },
      { path: 'settings/security',             ...page(() => import('./pages/SecuritySettings'), 'SecuritySettings')              },
      { path: 'settings/security/active-devices', ...page(() => import('./pages/ActiveDevices'), 'ActiveDevices')              },
      { path: 'settings/portfolio',            ...page(() => import('./pages/PortfolioSettings'), 'PortfolioSettings')             },
      { path: 'settings/discovery',            ...page(() => import('./pages/DiscoverySettings'), 'DiscoverySettings')             },
      { path: 'settings/creator-preferences',  ...page(() => import('./pages/CreatorPreferencesSettings'), 'CreatorPreferencesSettings')    },
      { path: 'post/:id', ...page(() => import('./pages/PostDetail'), 'PostDetail') },
      { path: 'audio/search', ...page(() => import('./pages/AudioPage')) },
      { path: 'audio/:id',    ...page(() => import('./pages/AudioPage')) },
      { path: 'reels', ...page(() => import('./pages/ReelFeed'), 'ReelFeed') },
      { path: 'reels/:postId', ...page(() => import('./pages/ReelFeed'), 'ReelFeed') },
      { path: 'phone-signup', ...page(() => import('./pages/SignupPhone'), 'SignupPhone') },
      { path: 'phone-login', ...page(() => import('./pages/PhoneLogin'), 'PhoneLogin') },
      { path: 'create-listing', ...page(() => import('./pages/CreateListing'), 'CreateListing') },
      { path: 'create-opportunity', ...page(() => import('./pages/CreateOpportunity'), 'CreateOpportunity') },
      { path: 'edit-listing/:id', ...page(() => import('./pages/EditListing'), 'EditListing') },
      { path: 'my-listings', ...page(() => import('./pages/MyListings'), 'MyListings') },
      { path: 'my-orders', ...page(() => import('./pages/MyOrders')) },
      { path: 'calendar', ...page(() => import('./pages/Calendar'), 'Calendar') },
      { path: 'listing/:id', ...page(() => import('./pages/ListingDetail'), 'ListingDetail') },
      { path: 'listing/:id/share-card', ...page(() => import('./pages/ListingShareCard'), 'ListingShareCard') },
      { path: 'listing/:id/applicants', ...page(() => import('./pages/OpportunityApplicants'), 'OpportunityApplicants') },
      { path: 'listing/:id/emergency', ...page(() => import('./pages/EmergencyListingFlow'), 'EmergencyListingFlow') },
      // Boost Listing routes temporarily removed (feature disabled, not
      // deleted — BoostListingFlow.tsx/BoostInsights.tsx still exist,
      // just unreachable from the active app until this is re-enabled).
      // NOTE: FILMONS Learning is NOT a route in this router at all -- it's
      // a true separate product/Rollup bundle (learning.html, built from
      // src/app/learningRoutes.tsx + LearningApp.tsx), never imported by
      // this app's JS. It's served at filmons.app/learning today (a
      // Vercel path rewrite to learning.html, see vercel.json -- that's
      // the one actually in use for now) and will ALSO be reachable at
      // learning.filmons.app once that domain's DNS is added; both point
      // at this exact same bundle. Crossing into it is always a real
      // cross-origin/full-page navigation via useLearningTransition()'s
      // enterLearning() (see learningOrigin.ts), never a route in this
      // tree.
      { path: 'search', ...page(() => import('./pages/SearchPage'), 'SearchPage') },
      { path: 'search/category/:tab', ...page(() => import('./pages/CategoryResults'), 'CategoryResults') },
      // Posts/Portfolio/Profiles nested under Connect in the URL (per
      // spec: they're Connect content, not top-level Search products) --
      // same CategoryResults component, which reads the extra :subTab
      // segment via useParams and only ever acts on it when tab==='connect'.
      { path: 'search/category/:tab/:subTab', ...page(() => import('./pages/CategoryResults'), 'CategoryResults') },
      // Locations/Hashtags are global, cross-product entities -- the ONLY
      // valid route for one is /search/hashtags/:tag or
      // /search/locations/:slug. The old bare /hashtag/:tag and singular
      // /search/location/:key paths redirect here instead of 404ing.
      { path: 'search/hashtags/:tag', ...page(() => import('./pages/HashtagPage'), 'HashtagPage') },
      { path: 'search/locations/:slug', ...page(() => import('./pages/LocationPage'), 'LocationPage') },
      { path: 'hashtag/:tag', Component: LegacyHashtagRedirect },
      { path: 'search/location/:key', Component: LegacyLocationRedirect },
      { path: 'portfolio', ...page(() => import('./pages/Portfolio'), 'Portfolio') },
      { path: 'portfolio/:userId', ...page(() => import('./pages/Portfolio'), 'Portfolio') },
      { path: 'edit-portfolio-item/:itemId', ...page(() => import('./pages/EditPortfolioItem'), 'EditPortfolioItem') },
      { path: 'profile', ...page(() => import('./pages/Profile'), 'Profile') },
      { path: 'profile/complete', ...page(() => import('./pages/CompleteProfilePage'), 'CompleteProfilePage') },
      { path: 'share-card', ...page(() => import('./pages/ShareCard'), 'ShareCard') },
      { path: 'verification', ...page(() => import('./pages/Verification'), 'Verification') },
      { path: 'connections', ...page(() => import('./pages/MyConnections'), 'MyConnections') },
      { path: 'connections/requests', ...page(() => import('./pages/ConnectionRequests'), 'ConnectionRequests') },
      { path: 'connections/all', ...page(() => import('./pages/AllConnections'), 'AllConnections') },
      { path: 'connections/suggested', ...page(() => import('./pages/SuggestedConnections'), 'SuggestedConnections') },
      { path: 'connections/activity', ...page(() => import('./pages/ConnectionsActivity'), 'ConnectionsActivity') },
      { path: 'refund-policy', ...page(() => import('./pages/RefundPolicy'), 'RefundPolicy') },
      { path: 'privacy-policy', ...page(() => import('./pages/PrivacyPolicy'), 'PrivacyPolicy') },
      { path: 'terms-conditions', ...page(() => import('./pages/TermsConditions'), 'TermsConditions') },
      { path: 'cookie-policy', ...page(() => import('./pages/CookiePolicy'), 'CookiePolicy') },
      { path: 'host/:userId', ...page(() => import('./pages/HostProfile'), 'HostProfile') },
      // Old flat admin URLs -- kept as redirects (not removed) for any
      // existing bookmark or already-sent email link (the support-case
      // admin-notification email template links to /admin-support). The
      // real admin area is a genuinely separate bundle now (admin.html /
      // src/app/adminRoutes.tsx, served by Vercel for any /admin/* path —
      // see vercel.json), not a route inside this router, so these must
      // be full page-loads (HardRedirect), not a client-side <Navigate>
      // which would just fail to match anything in this router.
      { path: 'admin-verifications', element: <HardRedirect to="/admin/verifications" /> },
      { path: 'admin-support', element: <HardRedirect to="/admin/support-chats" /> },
      { path: 'admin-boosts', element: <HardRedirect to="/admin/boosts" /> },
      { path: 'support', ...page(() => import('./pages/ContactSupport'), 'ContactSupport') },
      { path: 'support/cases', ...page(() => import('./pages/MySupportCases'), 'MySupportCases') },
      { path: 'support/cases/:id', ...page(() => import('./pages/SupportCaseDetail'), 'SupportCaseDetail') },
      // Canonical public-profile URL (filmons.app/username). Kept last —
      // React Router v6 ranks static segments (marketplace, wallet, etc.)
      // above a dynamic one regardless of declaration order, so this can
      // never shadow any route above it; it only matches when nothing
      // else does. HostProfile resolves the username itself and redirects
      // legacy /host/:userId links here once it knows the host's handle.
      { path: ':username', ...page(() => import('./pages/HostProfile'), 'HostProfile') },
    ],
  },
  // NOTE: FILMONS Admin (/admin/*) is NOT a route in this router — it is
  // an entirely separate Vite/Rollup bundle (admin.html, built from
  // src/app/adminRoutes.tsx + AdminApp.tsx). This app's JS never imports
  // any Admin* page/component, so a normal user's browser never fetches
  // Admin code at all. Vercel rewrites any /admin/* request straight to
  // admin.html instead of this app's index.html — see vercel.json.
  // ── Auth routes — outside Root layout (no navbar/shell) ──────────────────
  { path: '/login',          Component: Login          },
  { path: '/signin',         Component: Login          }, // alias
  { path: '/create-account',   ...page(() => import('./pages/CreateAccount'), 'CreateAccount')  },
  { path: '/forgot-password',  ...page(() => import('./pages/ForgotPassword'), 'ForgotPassword') },
  { path: '/reset-password',    ...page(() => import('./pages/ResetPassword'), 'ResetPassword')  },
  { path: '/auth/callback',    ...page(() => import('./pages/OAuthCallback'), 'OAuthCallback')  },
  { path: '/google-signup',    ...page(() => import('./pages/GoogleSignup'), 'GoogleSignup')   },
  { path: '/onboarding',           ...page(() => import('./pages/Onboarding'), 'CompleteProfile')    },
  { path: '/verify-email',         ...page(() => import('./pages/VerifyEmail'), 'VerifyEmail')        },
  { path: '/verify-device',        ...page(() => import('./pages/VerifyDevice'), 'VerifyDevice')       },
  { path: '/email-already-exists', ...page(() => import('./pages/EmailAlreadyExists'), 'EmailAlreadyExists') },
  { path: '/signup/phone',         ...page(() => import('./pages/SignupPhone'), 'SignupPhone')        },
  { path: '/phone-already-exists', ...page(() => import('./pages/PhoneAlreadyExists'), 'PhoneAlreadyExists') },
  // FILMONS Learning is its own bundle (see the NOTE above) -- this only
  // catches a client-side navigate() into it (e.g. an auth flow finishing
  // with a Learning return URL) and turns it into a real page load.
  { path: '/learning/*', Component: LearningReturn },
]);
// Warm the pages people open most, once the first screen is up and the browser is idle, so moving
// around the app doesn't wait on a code download.
if (typeof window !== 'undefined') {
  const warm = () => {
    [
      () => import('./pages/Feed'), () => import('./pages/Inbox'), () => import('./pages/ListingDetail'),
      () => import('./pages/Profile'), () => import('./pages/HostProfile'), () => import('./pages/SearchPage'),
      () => import('./pages/CategoryResults'), () => import('./pages/Notifications'), () => import('./pages/PostDetail'),
    ].forEach(load => { load().catch(() => {}); });
  };
  const idle = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: { timeout: number }) => void);
  window.addEventListener('load', () => (idle ? idle(warm, { timeout: 4000 }) : setTimeout(warm, 2500)));
}
