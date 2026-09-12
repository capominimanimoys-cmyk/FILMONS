// Shown app-wide (see Root.tsx, next to GuestBanner) exactly once after
// fn_deactivate_subscription auto-reverts a Business/Professional account
// to Creator+/Creator because Stripe exhausted its payment retries and
// canceled the subscription (customer.subscription.deleted in
// stripe-webhook/index.ts) -- distinct from an account that was simply
// always Creator+ and never subscribed. Dismissing ("Continue with
// Creator+") or successfully renewing both clear
// subscriptionDowngradedFrom/set subscriptionDowngradeAcknowledged, so this
// never reappears for the same lapse.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { getTierLabel } from '../lib/reliabilityApi';

export function SubscriptionDowngradeBanner() {
  const { user, setUserDirectly } = useAuth();
  const navigate = useNavigate();
  const [dismissing, setDismissing] = useState(false);

  if (!user?.subscriptionDowngradedFrom || user.subscriptionDowngradeAcknowledged) return null;

  const tierLabel = getTierLabel(user.subscriptionDowngradedFrom);

  // Dismiss just flips a visibility flag -- it carries no privilege
  // (account_type/subscription_status stay server-only, set only by
  // fn_deactivate_subscription/fn_activate_subscription), so a direct
  // client write is fine here the same way other non-sensitive profile
  // fields already are elsewhere in this app.
  const dismiss = async () => {
    if (!user) return;
    setDismissing(true);
    setUserDirectly({ ...user, subscriptionDowngradeAcknowledged: true });
    await supabase.from('profiles').update({ subscription_downgrade_acknowledged: true }).eq('id', user.id);
    setDismissing(false);
  };

  return (
    <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-3 relative z-40">
      <div className="max-w-4xl mx-auto flex items-start sm:items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-gray-900">Your {tierLabel} account has expired</p>
          <p className="text-xs text-gray-600 mt-0.5 leading-snug">
            Your FILMONS {tierLabel} subscription couldn't be renewed because there is no billing method on file. Your account has been returned to Creator+.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate(`/account/upgrade?auto=${user.subscriptionDowngradedFrom}`)}
            className="text-xs font-bold px-3.5 py-2 rounded-xl text-white bg-amber-600 hover:bg-amber-700 transition-colors whitespace-nowrap"
          >
            Renew {tierLabel}
          </button>
          <button
            onClick={dismiss}
            disabled={dismissing}
            className="text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            Continue with Creator+
          </button>
          <button
            onClick={dismiss}
            disabled={dismissing}
            aria-label="Dismiss"
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
