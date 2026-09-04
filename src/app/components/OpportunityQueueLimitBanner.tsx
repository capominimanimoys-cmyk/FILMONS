/**
 * Shown wherever a viewer's daily Home swipe-queue Opportunity budget
 * (ENTITLEMENTS.opportunityQueueDaily / GUEST_OPPORTUNITY_QUEUE_DAILY --
 * see supabase/functions/_shared/entitlements.ts) is exhausted: Home.tsx
 * when the deck runs out, and ListingDetail.tsx when a restricted
 * Opportunity is reached directly (an old link, a share, a bookmark)
 * rather than through the queue. Same component either place so the
 * copy/behavior can never drift between the two.
 */
import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { AccountTier } from '../lib/reliabilityApi';

export function OpportunityQueueLimitBanner({ tier, isAuthenticated }: {
  /** Pass 'creator' for a guest too (the copy branches on isAuthenticated
   *  first) -- AccountTier has no separate 'guest' member. */
  tier: AccountTier;
  isAuthenticated: boolean;
}) {
  const navigate = useNavigate();

  let title: string;
  let body: string;
  let buttons: { label: string; onClick: () => void }[];

  if (!isAuthenticated) {
    title = 'Sign up to see more';
    body = 'Create an account or upgrade to access more Opportunity listings.';
    buttons = [
      { label: 'Sign up', onClick: () => navigate('/create-account') },
      { label: 'View plans', onClick: () => navigate('/account/upgrade') },
    ];
  } else if (tier === 'creator') {
    title = 'Upgrade to see more';
    body = 'Your Creator account includes up to 2 Opportunity listings in the Home swipe queue each day. Upgrade to Creator+ for more access, or choose Professional or Business for greater access.';
    buttons = [
      { label: 'Upgrade account', onClick: () => navigate('/account/upgrade') },
      { label: 'View plans', onClick: () => navigate('/account/upgrade') },
    ];
  } else if (tier === 'creator_plus') {
    title = 'You reached today’s limit';
    body = 'Creator+ includes up to 5 Opportunity listings in the Home swipe queue each day. Upgrade to Professional or Business to unlock more access.';
    buttons = [
      { label: 'Upgrade to Professional', onClick: () => navigate('/account/upgrade?auto=professional') },
      { label: 'Upgrade to Business', onClick: () => navigate('/account/upgrade?auto=business') },
    ];
  } else {
    // Professional/Business are unlimited and should never actually reach
    // this component -- rendered only as a safe fallback, never assumed.
    title = 'More listings are available';
    body = 'You have reached the number of Opportunity listings available for your account today. Upgrade your account to unlock more listings.';
    buttons = [{ label: 'View plans', onClick: () => navigate('/account/upgrade') }];
  }

  return (
    <div className="flex flex-col items-center text-center py-16 px-6 pop-in-card">
      <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
        <Lock className="w-7 h-7 text-amber-500" />
      </div>
      <p className="font-black text-gray-900 text-lg mb-1.5">{title}</p>
      <p className="text-sm text-gray-500 mb-6 max-w-xs">{body}</p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {buttons.map((b, i) => (
          <button key={b.label} onClick={b.onClick}
            className={`w-full py-3 text-sm font-bold rounded-2xl active:opacity-80 ${
              i === 0 ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-700'
            }`}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
