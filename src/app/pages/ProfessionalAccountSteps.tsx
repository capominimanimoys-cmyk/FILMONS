import { useEffect } from 'react';
import { useNavigate } from 'react-router';

// This used to be its own multi-step "apply for Professional" wizard --
// a fictional $29 one-time review fee, a portfolio submission, and a
// promised 3-5 day admin review that was never actually built (its
// final "Submit Application" step wrote to `account_upgrades`, a table
// that was never created, so the write silently no-op'd while the page
// told the user their application was submitted). Professional is
// actually granted the moment a real $9.99/mo Stripe subscription
// checkout completes, with no review step at all -- see
// AccountUpgrade.tsx's `upgrade('professional')`, the one real,
// working path. Redirecting here rather than duplicating that flow
// (or worse, maintaining a second, contradictory pricing/process
// story) so every entry point leads to the same real outcome.
export function ProfessionalAccountSteps() {
  const navigate = useNavigate();
  useEffect(() => { navigate('/account/upgrade', { replace: true }); }, [navigate]);
  return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" /></div>;
}
