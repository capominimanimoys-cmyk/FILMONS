/**
 * Shown in place of the Emergency Listing deck/results for any account
 * that isn't Professional or Business (Guest, Creator, Creator+) -- the
 * category itself stays visible/enterable for everyone, only the actual
 * listings are gated. Shared by Home.tsx and SearchOverlay.tsx so the two
 * surfaces never drift.
 */
import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';

export function EmergencyLockedState() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isGuest = !user;

  return (
    <div className="flex flex-col items-center text-center py-16 px-6">
      <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-red-500" />
      </div>
      <p className="font-black text-gray-900 text-lg mb-1">Emergency Listings</p>
      <p className="text-sm font-bold text-gray-700 mb-2 max-w-xs">
        Unlock Professional or Business account to see all emergency listings
      </p>
      <p className="text-xs text-gray-400 mb-6 max-w-xs leading-relaxed">
        Emergency Listings give eligible accounts access to urgent opportunities and requests posted by the FILMONS community.
      </p>
      <div className="flex gap-2 w-full max-w-xs">
        <button
          onClick={() => navigate(isGuest ? '/login' : '/account/upgrade')}
          className="flex-1 py-3 bg-gray-900 text-white text-sm font-bold rounded-2xl active:opacity-80"
        >
          {isGuest ? 'Unlock access' : 'Upgrade account'}
        </button>
        {isGuest && (
          <button
            onClick={() => navigate('/create-account')}
            className="flex-1 py-3 border border-gray-200 text-gray-700 text-sm font-bold rounded-2xl active:opacity-80"
          >
            Sign up
          </button>
        )}
      </div>
    </div>
  );
}
