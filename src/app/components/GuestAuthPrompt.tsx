/**
 * GuestAuthPrompt — bottom sheet shown when a guest tries a protected action.
 * Rendered once in Root.tsx; triggered via AuthContext.showGuestPrompt(msg).
 */
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { X, UserPlus, LogIn } from 'lucide-react';

export function GuestAuthPrompt() {
  const { guestPromptMsg, hideGuestPrompt } = useAuth() as any;
  const navigate = useNavigate();

  if (!guestPromptMsg) return null;

  const go = (to: string) => {
    hideGuestPrompt();
    navigate(to);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[90] bg-black/60"
        style={{ backdropFilter: 'blur(4px)' }}
        onClick={hideGuestPrompt}
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[91] bg-gray-900 rounded-t-3xl px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl"
        style={{ animation: 'slideUp 0.28s cubic-bezier(0.32,0.72,0,1)' }}
      >
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to   { transform: translateY(0); }
          }
        `}</style>

        {/* Handle */}
        <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-5"/>

        {/* Dismiss */}
        <button
          onClick={hideGuestPrompt}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
        >
          <X className="w-4 h-4"/>
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <UserPlus className="w-7 h-7 text-blue-400" strokeWidth={1.5}/>
          </div>
        </div>

        {/* Copy */}
        <div className="text-center mb-6 space-y-2">
          <h2 className="text-xl font-black text-white">Create an account to continue</h2>
          <p className="text-white/55 text-sm leading-relaxed max-w-xs mx-auto">
            {guestPromptMsg}
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={() => go('/create-account')}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2"
          >
            <UserPlus className="w-4 h-4"/> Create Account
          </button>
          <button
            onClick={() => go('/login')}
            className="w-full py-3.5 bg-white/8 hover:bg-white/12 border border-white/15 text-white font-semibold text-sm rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4"/> Sign In
          </button>
          <button
            onClick={hideGuestPrompt}
            className="w-full py-3 text-white/40 hover:text-white/70 text-sm font-semibold transition-colors"
          >
            Continue Browsing
          </button>
        </div>
      </div>
    </>
  );
}
