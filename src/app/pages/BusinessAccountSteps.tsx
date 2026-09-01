import { useEffect } from 'react';
import { useNavigate } from 'react-router';

// Same fix as ProfessionalAccountSteps.tsx: this used to run its own
// "apply for Business" wizard (document upload, company info, a fake
// "Pay Business Subscription" button that only ever showed a "coming
// soon" toast, and a final submit that wrote to `account_upgrades` --
// a table that doesn't exist, so the write silently no-op'd while the
// page told the user their application was submitted and would be
// reviewed in 5-7 days). Business is actually granted the moment a
// real $19.99/mo Stripe subscription checkout completes, with no
// review step -- see AccountUpgrade.tsx's `upgrade('business')`, the
// one real, working path. Redirecting here instead of maintaining a
// second, contradictory story about how becoming Business works.
export function BusinessAccountSteps() {
  const navigate = useNavigate();
  useEffect(() => { navigate('/account/upgrade', { replace: true }); }, [navigate]);
  return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-yellow-200 border-t-yellow-600 rounded-full animate-spin" /></div>;
}
