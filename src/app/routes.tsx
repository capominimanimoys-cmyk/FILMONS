import { createBrowserRouter } from 'react-router';
import { Root } from './pages/Root';
import { Home } from './pages/Home';
import { Login }         from './pages/Login';
import { CreateAccount }  from './pages/CreateAccount';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword }  from './pages/ResetPassword';
import { PhoneLogin } from './pages/PhoneLogin';
import { CreateListing } from './pages/CreateListing';
import { EditListing } from './pages/EditListing';
import { MyListings } from './pages/MyListings';
import { ListingDetail } from './pages/ListingDetail';
import { Profile } from './pages/Profile';
import { RefundPolicy } from './pages/RefundPolicy';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsConditions } from './pages/TermsConditions';
import { HostProfile } from './pages/HostProfile';
import { Verification } from './pages/Verification';
import { AdminVerifications } from './pages/AdminVerifications';
import { ContactSupport } from './pages/ContactSupport';
import { MySupportCases } from './pages/MySupportCases';
import { SupportCaseDetail } from './pages/SupportCaseDetail';
import { AdminSupport } from './pages/AdminSupport';
import { AdminBoosts } from './pages/AdminBoosts';
import { Feed } from './pages/Feed';
import { Inbox } from './pages/Inbox';
import { Checkout } from './pages/Checkout';
import { HostDashboard } from './pages/HostDashboard';
import { Wallet } from './pages/Wallet';
import { PayoutMethodSetup } from './pages/PayoutMethodSetup';
import AudioPage from './pages/AudioPage';
import { Notifications } from './pages/Notifications';
import { NotificationSettings }  from './pages/NotificationSettings';
import { MessageSettings }        from './pages/MessageSettings';
import { VerificationSettings }   from './pages/VerificationSettings';
import { PrivacySettings }        from './pages/PrivacySettings';
import { ReviewsSettings }        from './pages/ReviewsSettings';
import { DeviceSettings }         from './pages/DeviceSettings';
import { AccountUpgrade }          from './pages/AccountUpgrade';
import { CreatorPlusRequired }       from './pages/CreatorPlusRequired';
import { ProfessionalAccountSteps }  from './pages/ProfessionalAccountSteps';
import { BusinessAccountSteps }      from './pages/BusinessAccountSteps';
import { VerificationStatusPage }    from './pages/VerificationStatusPage';
import { HelpCenter }              from './pages/HelpCenter';
import { Settings } from './pages/Settings';
import { LanguageSettings } from './pages/LanguageSettings';
import { SecuritySettings } from './pages/SecuritySettings';
import { ActiveDevices } from './pages/ActiveDevices';
import { PortfolioSettings } from './pages/PortfolioSettings';
import { DiscoverySettings } from './pages/DiscoverySettings';
import { CreatorPreferencesSettings } from './pages/CreatorPreferencesSettings';
import { PostDetail } from './pages/PostDetail';
import { ReelFeed } from './pages/ReelFeed';
import MyOrders from './pages/MyOrders';
import { SearchPage } from './pages/SearchPage';
import { OAuthCallback } from './pages/OAuthCallback';
import { GoogleSignup }  from './pages/GoogleSignup';
import { CompleteProfile } from './pages/Onboarding';
import { Portfolio } from './pages/Portfolio';
import { VerifyEmail } from './pages/VerifyEmail';
import { VerifyDevice } from './pages/VerifyDevice';
import { EmailAlreadyExists } from './pages/EmailAlreadyExists';
import { SignupPhone }        from './pages/SignupPhone';
import { PhoneAlreadyExists } from './pages/PhoneAlreadyExists';
import { ShareCard }          from './pages/ShareCard';
import { BoostListingFlow } from './pages/BoostListingFlow';
import { BoostInsights } from './pages/BoostInsights';
import { EmergencyListingFlow } from './pages/EmergencyListingFlow';
import { CreateOpportunity } from './pages/CreateOpportunity';
import { OpportunityApplicants } from './pages/OpportunityApplicants';
import { LikedItems } from './pages/LikedItems';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Root,
    children: [
      { index: true, Component: Home },
      { path: 'feed', Component: Feed },
      { path: 'inbox', Component: Inbox },
      { path: 'checkout', Component: Checkout },
      { path: 'dashboard', Component: HostDashboard },
      { path: 'wallet', Component: Wallet },
      { path: 'liked-listings', element: <LikedItems type="listing" /> },
      { path: 'liked-creators', element: <LikedItems type="creator" /> },
      { path: 'wallet/payout-method', Component: PayoutMethodSetup },
      { path: 'notifications', Component: Notifications },
      { path: 'settings/notifications',  Component: NotificationSettings  },
      { path: 'settings/messages',       Component: MessageSettings        },
      { path: 'settings/verification',   Component: VerificationSettings   },
      { path: 'settings/privacy',        Component: PrivacySettings        },
      { path: 'settings/reviews',        Component: ReviewsSettings        },
      { path: 'settings/devices',        Component: DeviceSettings         },
      { path: 'account/upgrade',          Component: AccountUpgrade         },
      { path: 'creator-plus-required',    Component: CreatorPlusRequired        },
      { path: 'professional-account-steps',Component: ProfessionalAccountSteps  },
      { path: 'business-account-steps',   Component: BusinessAccountSteps       },
      { path: 'verification-status',       Component: VerificationStatusPage      },
      { path: 'help',                    Component: HelpCenter             },
      { path: 'settings',                      Component: Settings                    },
      { path: 'settings/language',             Component: LanguageSettings              },
      { path: 'settings/security',             Component: SecuritySettings              },
      { path: 'settings/security/active-devices', Component: ActiveDevices              },
      { path: 'settings/portfolio',            Component: PortfolioSettings             },
      { path: 'settings/discovery',            Component: DiscoverySettings             },
      { path: 'settings/creator-preferences',  Component: CreatorPreferencesSettings    },
      { path: 'post/:id', Component: PostDetail },
      { path: 'audio/search', Component: AudioPage },
      { path: 'audio/:id',    Component: AudioPage },
      { path: 'reels/:postId', Component: ReelFeed },
      { path: 'phone-signup', Component: SignupPhone },
      { path: 'phone-login', Component: PhoneLogin },
      { path: 'create-listing', Component: CreateListing },
      { path: 'create-opportunity', Component: CreateOpportunity },
      { path: 'edit-listing/:id', Component: EditListing },
      { path: 'my-listings', Component: MyListings },
      { path: 'my-orders', Component: MyOrders },
      { path: 'listing/:id', Component: ListingDetail },
      { path: 'listing/:id/applicants', Component: OpportunityApplicants },
      { path: 'listing/:id/emergency', Component: EmergencyListingFlow },
      { path: 'boost/:listingId', Component: BoostListingFlow },
      { path: 'boost/:listingId/insights', Component: BoostInsights },
      { path: 'search', Component: SearchPage },
      { path: 'portfolio', Component: Portfolio },
      { path: 'portfolio/:userId', Component: Portfolio },
      { path: 'profile', Component: Profile },
      { path: 'share-card', Component: ShareCard },
      { path: 'verification', Component: Verification },
      { path: 'refund-policy', Component: RefundPolicy },
      { path: 'privacy-policy', Component: PrivacyPolicy },
      { path: 'terms-conditions', Component: TermsConditions },
      { path: 'host/:userId', Component: HostProfile },
      { path: 'admin-verifications', Component: AdminVerifications },
      { path: 'support', Component: ContactSupport },
      { path: 'support/cases', Component: MySupportCases },
      { path: 'support/cases/:id', Component: SupportCaseDetail },
      { path: 'admin-support', Component: AdminSupport },
      { path: 'admin-boosts', Component: AdminBoosts },
      // Canonical public-profile URL (filmons.app/username). Kept last —
      // React Router v6 ranks static segments (marketplace, wallet, etc.)
      // above a dynamic one regardless of declaration order, so this can
      // never shadow any route above it; it only matches when nothing
      // else does. HostProfile resolves the username itself and redirects
      // legacy /host/:userId links here once it knows the host's handle.
      { path: ':username', Component: HostProfile },
    ],
  },
  // ── Auth routes — outside Root layout (no navbar/shell) ──────────────────
  { path: '/login',          Component: Login          },
  { path: '/signin',         Component: Login          }, // alias
  { path: '/create-account',   Component: CreateAccount  },
  { path: '/forgot-password',  Component: ForgotPassword },
  { path: '/reset-password',    Component: ResetPassword  },
  { path: '/auth/callback',    Component: OAuthCallback  },
  { path: '/google-signup',    Component: GoogleSignup   },
  { path: '/onboarding',           Component: CompleteProfile    },
  { path: '/verify-email',         Component: VerifyEmail        },
  { path: '/verify-device',        Component: VerifyDevice       },
  { path: '/email-already-exists', Component: EmailAlreadyExists },
  { path: '/signup/phone',         Component: SignupPhone        },
  { path: '/phone-already-exists', Component: PhoneAlreadyExists },
]);