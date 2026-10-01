// Settings/Support as navigable Search destinations -- not content,
// never a fabricated route. Seeded only from routes.tsx's real paths
// (confirmed by reading that file directly). Keyword/substring matching
// reuses searchUtils.ts's normalize() + suggestCorrection() for the same
// typo tolerance the rest of Search already gets, rather than a second
// matcher. AI/semantic routing ("I don't receive notifications" -> exact
// intent) is deliberately out of scope -- no AI infra exists; this
// handles the explicit, literal keyword cases.
import { normalize, suggestCorrection } from './searchUtils';
import { normalizeTier, type AccountTier } from './reliabilityApi';

export interface SearchDestination {
  type: 'settings' | 'support';
  title: string;
  description: string;
  route: string;
  keywords: string[];
  /** Omit = visible to every account tier. */
  minTier?: AccountTier;
}

export const SEARCH_DESTINATIONS: SearchDestination[] = [
  {
    type: 'settings', title: 'Notifications', description: 'Push, email and in-app alert preferences',
    route: '/settings/notifications',
    keywords: ['notification', 'notifications', 'alerts', 'push', 'email alerts', 'turn off notifications'],
  },
  {
    type: 'settings', title: 'Message Settings', description: 'Who can message you, read receipts',
    route: '/settings/messages',
    keywords: ['messages', 'messaging', 'chat settings', 'read receipts', 'dm settings'],
  },
  {
    type: 'settings', title: 'Verification', description: 'Identity verification and your badge',
    route: '/settings/verification',
    keywords: ['verification', 'verify', 'id verification', 'kyc', 'badge', 'verified'],
  },
  {
    type: 'settings', title: 'Privacy', description: 'Who can see your profile and activity',
    route: '/settings/privacy',
    keywords: ['privacy', 'who can see', 'blocked', 'block list', 'blocked users'],
  },
  {
    type: 'settings', title: 'Review Settings', description: 'Ratings and review visibility',
    route: '/settings/reviews',
    keywords: ['reviews', 'ratings', 'review settings'],
  },
  {
    type: 'settings', title: 'Device Management', description: 'Devices connected to your account',
    route: '/settings/devices',
    keywords: ['devices', 'device management', 'connected devices'],
  },
  {
    type: 'settings', title: 'Upgrade Account', description: 'Change your Filmons account tier',
    route: '/account/upgrade',
    keywords: ['upgrade', 'plan', 'subscription', 'go pro', 'professional account', 'creator plus', 'business account'],
  },
  {
    type: 'settings', title: 'Settings', description: 'Your account settings',
    route: '/settings',
    keywords: ['settings', 'account settings', 'preferences'],
  },
  {
    type: 'settings', title: 'Language', description: 'App language preference',
    route: '/settings/language',
    keywords: ['language', 'locale', 'change language'],
  },
  {
    type: 'settings', title: 'Password & Security', description: 'Password, login and security options',
    route: '/settings/security',
    keywords: ['password', 'security', 'login security', 'change password', 'two factor', '2fa'],
  },
  {
    type: 'settings', title: 'Active Devices', description: 'Devices currently signed in',
    route: '/settings/security/active-devices',
    keywords: ['active devices', 'sessions', 'logged in devices', 'sign out other devices', 'log out everywhere'],
  },
  {
    type: 'settings', title: 'Portfolio Settings', description: 'Portfolio visibility and defaults',
    route: '/settings/portfolio',
    keywords: ['portfolio settings', 'portfolio visibility', 'portfolio privacy'],
  },
  {
    type: 'settings', title: 'Discovery Settings', description: 'Control who can find your profile in search',
    route: '/settings/discovery',
    keywords: ['discovery', 'discoverability', 'searchable', 'hide profile', 'hide my profile'],
  },
  {
    type: 'settings', title: 'Creator Preferences', description: 'Collaboration and availability preferences',
    route: '/settings/creator-preferences',
    keywords: ['creator preferences', 'collab preferences', 'availability', 'open to collab'],
  },
  {
    type: 'settings', title: 'Wallet', description: 'Balance, earnings and transaction history',
    route: '/wallet',
    keywords: ['wallet', 'balance', 'earnings', 'payout', 'payouts', 'money'],
  },
  {
    type: 'settings', title: 'Payout Method', description: 'Bank account and payout setup',
    route: '/wallet/payout-method',
    keywords: ['payout method', 'bank account', 'direct deposit', 'payout setup', 'payout failed', 'add bank account'],
  },
  {
    type: 'support', title: 'Contact Support', description: 'Report a problem or ask for help',
    route: '/support',
    keywords: ['support', 'help', 'contact', 'problem', 'issue', 'not working', 'bug', 'broken', 'contact support'],
  },
  {
    type: 'support', title: 'My Support Cases', description: 'Track the status of your support requests',
    route: '/support/cases',
    keywords: ['support cases', 'my tickets', 'ticket status', 'support ticket', 'my cases'],
  },
];

function meetsTier(accountType: string | undefined, minTier?: AccountTier): boolean {
  if (!minTier) return true;
  const order: AccountTier[] = ['creator', 'creator_plus', 'professional', 'business'];
  return order.indexOf(normalizeTier(accountType)) >= order.indexOf(minTier);
}

/** A query word "matches" a keyword if either contains the other (substring,
 *  not exact-length), or a typo-corrected form of the word does -- same
 *  tolerance expandQuery() already gives the rest of Search. */
function wordMatchesKeyword(word: string, keyword: string): boolean {
  if (keyword.includes(word) || word.includes(keyword)) return true;
  const corrected = suggestCorrection(word);
  return corrected ? keyword.includes(corrected) : false;
}

export function matchDestinations(rawQ: string, accountType?: string): SearchDestination[] {
  const q = normalize(rawQ).trim();
  if (!q) return [];
  const words = q.split(/\s+/).filter(w => w.length >= 2);
  if (!words.length) return [];

  const seen = new Set<string>();
  const results: SearchDestination[] = [];
  for (const dest of SEARCH_DESTINATIONS) {
    if (!meetsTier(accountType, dest.minTier)) continue;
    const title = normalize(dest.title);
    const keywordPool = [title, ...dest.keywords.map(normalize)];
    const matched = title.includes(q) || keywordPool.some(k => k.includes(q))
      || words.some(w => keywordPool.some(k => wordMatchesKeyword(w, k)));
    if (matched && !seen.has(dest.route)) {
      seen.add(dest.route);
      results.push(dest);
    }
  }
  return results;
}
