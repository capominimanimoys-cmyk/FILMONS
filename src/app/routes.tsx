import { createBrowserRouter } from 'react-router';
import { Root } from './pages/Root';
import { Home } from './pages/Home';
import { Marketplace } from './pages/Marketplace';
import { Login }         from './pages/Login';
import { CreateAccount }  from './pages/CreateAccount';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword }  from './pages/ResetPassword';
import { PhoneSignup } from './pages/PhoneSignup';
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
import { Feed } from './pages/Feed';
import { Inbox } from './pages/Inbox';
import { Checkout } from './pages/Checkout';
import { HostDashboard } from './pages/HostDashboard';
import { FPWallet } from './pages/FPWallet';
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
import { CreatorPlusAccountSteps }   from './pages/CreatorPlusAccountSteps';
import { ProfessionalAccountSteps }  from './pages/ProfessionalAccountSteps';
import { BusinessAccountSteps }      from './pages/BusinessAccountSteps';
import { VerificationStatusPage }    from './pages/VerificationStatusPage';
import { HelpCenter }              from './pages/HelpCenter';
import { Settings } from './pages/Settings';
import { LanguageSettings } from './pages/LanguageSettings';
import { SecuritySettings } from './pages/SecuritySettings';
import { PortfolioSettings } from './pages/PortfolioSettings';
import { DiscoverySettings } from './pages/DiscoverySettings';
import { CreatorPreferencesSettings } from './pages/CreatorPreferencesSettings';
import { PostDetail } from './pages/PostDetail';
import { ReelFeed } from './pages/ReelFeed';
import MyOrders from './pages/MyOrders';
import { SearchPage } from './pages/SearchPage';
import { OAuthCallback } from './pages/OAuthCallback';
import { GoogleSignup }  from './pages/GoogleSignup';
import { Onboarding }    from './pages/Onboarding';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Root,
    children: [
      { index: true, Component: Home },
      { path: 'marketplace', Component: Marketplace },
      { path: 'feed', Component: Feed },
      { path: 'inbox', Component: Inbox },
      { path: 'checkout', Component: Checkout },
      { path: 'dashboard', Component: HostDashboard },
      { path: 'wallet', Component: FPWallet },
      { path: 'notifications', Component: Notifications },
      { path: 'settings/notifications',  Component: NotificationSettings  },
      { path: 'settings/messages',       Component: MessageSettings        },
      { path: 'settings/verification',   Component: VerificationSettings   },
      { path: 'settings/privacy',        Component: PrivacySettings        },
      { path: 'settings/reviews',        Component: ReviewsSettings        },
      { path: 'settings/devices',        Component: DeviceSettings         },
      { path: 'account/upgrade',          Component: AccountUpgrade         },
      { path: 'creator-plus-required',    Component: CreatorPlusRequired        },
      { path: 'creator-plus-steps',       Component: CreatorPlusAccountSteps    },
      { path: 'professional-account-steps',Component: ProfessionalAccountSteps  },
      { path: 'business-account-steps',   Component: BusinessAccountSteps       },
      { path: 'verification-status',       Component: VerificationStatusPage      },
      { path: 'help',                    Component: HelpCenter             },
      { path: 'settings',                      Component: Settings                    },
      { path: 'settings/language',             Component: LanguageSettings              },
      { path: 'settings/security',             Component: SecuritySettings              },
      { path: 'settings/portfolio',            Component: PortfolioSettings             },
      { path: 'settings/discovery',            Component: DiscoverySettings             },
      { path: 'settings/creator-preferences',  Component: CreatorPreferencesSettings    },
      { path: 'post/:id', Component: PostDetail },
      { path: 'audio/search', Component: AudioPage },
      { path: 'audio/:id',    Component: AudioPage },
      { path: 'reels/:postId', Component: ReelFeed },
      { path: 'phone-signup', Component: PhoneSignup },
      { path: 'phone-login', Component: PhoneLogin },
      { path: 'create-listing', Component: CreateListing },
      { path: 'edit-listing/:id', Component: EditListing },
      { path: 'my-listings', Component: MyListings },
      { path: 'my-orders', Component: MyOrders },
      { path: 'listing/:id', Component: ListingDetail },
      { path: 'search', Component: SearchPage },
      { path: 'profile', Component: Profile },
      { path: 'verification', Component: Verification },
      { path: 'refund-policy', Component: RefundPolicy },
      { path: 'privacy-policy', Component: PrivacyPolicy },
      { path: 'terms-conditions', Component: TermsConditions },
      { path: 'host/:userId', Component: HostProfile },
      { path: 'admin-verifications', Component: AdminVerifications },
    ],
  },
  // ── Auth routes — outside Root layout (no navbar/shell) ──────────────────
  { path: '/login',          Component: Login          },
  { path: '/create-account',   Component: CreateAccount  },
  { path: '/forgot-password',  Component: ForgotPassword },
  { path: '/reset-password',    Component: ResetPassword  },
  { path: '/auth/callback',    Component: OAuthCallback  },
  { path: '/google-signup',    Component: GoogleSignup   },
  { path: '/onboarding',       Component: Onboarding     },
]);