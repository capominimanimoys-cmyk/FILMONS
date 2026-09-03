/**
 * Guest/Creator/Creator+ access to Emergency Listings. Emergency is a
 * status/flag on a listing, not its own category -- an emergency rental
 * stays in Rental, an emergency service stays in Services, etc, each with
 * a visible EMERGENCY badge (see ListingCard.tsx / SwipeStack.tsx /
 * SearchOverlay.tsx's per-card badges). Two different restrictions build
 * on that:
 *  - EmergencyPreviewGate: the dedicated "Emergency" tab/filter -- a
 *    3-random-item preview + gate, never a full lock-out and never the
 *    complete unrestricted list.
 *  - EmergencyUpgradeModal (exported on its own): the gate shown when a
 *    normal category queue (Rental, Services, ...) hits its own 2-item
 *    emergency-listing cap for a restricted tier -- everything else in
 *    that queue is untouched, only the emergency-flagged items beyond 2
 *    are held back.
 * Professional/Business are exempt from both entirely.
 */
import { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { setPendingReturnUrl } from '../lib/authReturnUrl';

export function EmergencyPreviewGate<T>({ items, renderCard, grid = true, isAuthenticated }: {
  items: T[];
  renderCard: (item: T, index: number) => ReactNode;
  /** Preview cards render in a 2-col grid (Home, Search's marketplace-style
   *  sections) by default; pass false for a single-column list layout. */
  grid?: boolean;
  /** Guest vs signed-in Creator/Creator+ -- decides the upgrade modal's
   *  copy/buttons (see EmergencyUpgradeModal). */
  isAuthenticated?: boolean;
}) {
  const [showModal, setShowModal] = useState(false);
  // Picked once on mount and never reshuffled on re-render (a parent
  // re-render for an unrelated reason -- a notification badge updating,
  // etc. -- must not visibly shuffle which 3 listings are shown).
  const [preview] = useState(() => [...items].sort(() => Math.random() - 0.5).slice(0, 3));

  if (items.length === 0) return null;

  return (
    <>
      <div className="flex flex-col items-center text-center py-4 px-4">
        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-2">
          <AlertTriangle className="w-5 h-5 text-red-500" />
        </div>
        <p className="text-sm font-bold text-gray-900 max-w-xs">
          Unlock Professional or Business Account to see all Emergency Listings.
        </p>
      </div>
      <div className={grid ? 'grid grid-cols-2 gap-2.5 px-4' : 'space-y-2 px-4'}>
        {preview.map((item, i) => renderCard(item, i))}
      </div>
      <div className="px-4 pt-3 pb-4">
        <button
          onClick={() => setShowModal(true)}
          className="w-full py-3 text-center text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors"
        >
          See More
        </button>
      </div>
      {showModal && <EmergencyUpgradeModal onClose={() => setShowModal(false)} isAuthenticated={isAuthenticated} />}
    </>
  );
}

// Same copy/button pattern as the Opportunity display-limit gates
// (Home.tsx / SearchOverlay.tsx): a guest gets an extra "Sign up" button
// and "Explore" (not "Upgrade") wording, since they have no account yet;
// the plan buttons still route through the same login-first flow either
// way (setPendingReturnUrl to the auto-checkout URL, then /login, which
// itself bridges to signup for someone with no account).
export function EmergencyUpgradeModal({ onClose, isAuthenticated }: { onClose: () => void; isAuthenticated?: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl sm:max-w-sm w-full p-6 text-center space-y-4" onClick={e => e.stopPropagation()}>
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>
        <div>
          <p className="text-lg font-black text-gray-900">See more emergency listings</p>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            {isAuthenticated
              ? 'Upgrade to Professional or Business to access all emergency listings.'
              : 'Sign up or choose Professional or Business to access all emergency listings.'}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {!isAuthenticated && (
            <button
              onClick={() => { onClose(); navigate('/create-account'); }}
              className="w-full py-3 bg-red-600 text-white text-sm font-bold rounded-2xl active:opacity-80"
            >
              Sign up
            </button>
          )}
          <button
            onClick={() => {
              onClose();
              if (!isAuthenticated) { setPendingReturnUrl('/account/upgrade?auto=professional'); navigate('/login'); return; }
              navigate('/account/upgrade?auto=professional');
            }}
            className={`w-full py-3 text-sm font-bold rounded-2xl active:opacity-80 ${isAuthenticated ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-700'}`}
          >
            {isAuthenticated ? 'Upgrade to Professional' : 'Explore Professional'}
          </button>
          <button
            onClick={() => {
              onClose();
              if (!isAuthenticated) { setPendingReturnUrl('/account/upgrade?auto=business'); navigate('/login'); return; }
              navigate('/account/upgrade?auto=business');
            }}
            className={`w-full py-3 text-sm font-bold rounded-2xl active:opacity-80 ${isAuthenticated ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-700'}`}
          >
            {isAuthenticated ? 'Upgrade to Business' : 'Explore Business'}
          </button>
          <button onClick={onClose} className="w-full py-2.5 text-sm font-semibold text-gray-400">
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
}
