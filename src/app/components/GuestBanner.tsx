import { useState } from 'react';
import { Link } from 'react-router';
import { X } from 'lucide-react';

export function GuestBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="w-full bg-gray-900 border-b border-white/10 px-4 py-2.5 flex items-center gap-3 z-50 relative">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/70 leading-snug">
          <span className="text-white font-semibold">You're browsing as a guest.</span>
          {' '}
          <span className="hidden sm:inline">Create an account to message, rent, save, and build your portfolio. </span>
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          to="/create-account"
          className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors whitespace-nowrap"
        >
          Create Account
        </Link>
        <Link
          to="/login"
          className="text-xs font-semibold text-white/50 hover:text-white transition-colors whitespace-nowrap"
        >
          Sign In
        </Link>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss guest banner"
          className="w-6 h-6 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors"
        >
          <X className="w-3.5 h-3.5"/>
        </button>
      </div>
    </div>
  );
}
