/**
 * PhoneAlreadyExists — shown when a phone signup attempt hits a duplicate number.
 *
 * Entry: /phone-already-exists?phone=FORMATTED&dial=%2B1&flag=%F0%9F%87%A8%F0%9F%87%A6
 */
import { useSearchParams, useNavigate } from 'react-router';
import { ArrowLeft, Smartphone } from 'lucide-react';
import { FilmonsLogo } from '../components/FilmonsLogo';

function Bg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-blue-950"/>
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
        backgroundSize: '256px 256px',
      }}/>
      <div className="absolute top-1/4 left-1/3 w-80 h-80 rounded-full bg-blue-600 opacity-[0.08] blur-[120px]"/>
      <div className="absolute bottom-1/3 right-1/4 w-56 h-56 rounded-full bg-violet-500 opacity-[0.07] blur-[90px]"/>
    </div>
  );
}

export function PhoneAlreadyExists() {
  const [params]  = useSearchParams();
  const navigate  = useNavigate();

  const phone = params.get('phone') ?? '';
  const dial  = params.get('dial')  ?? '+1';
  const flag  = params.get('flag')  ?? '';

  const displayPhone = phone
    ? `${flag ? flag + ' ' : ''}${dial} ${phone}`
    : 'this phone number';

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <Bg/>

      {/* Header */}
      <div className="relative z-10 pt-14 px-5 flex items-center justify-between">
        <button
          onClick={() => navigate('/signup/phone')}
          aria-label="Back to phone sign up"
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4"/> Back
        </button>
        <FilmonsLogo iconSize={20} theme="dark"/>
        <div className="w-16"/>
      </div>

      {/* Body */}
      <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-12">
        <div className="pt-8 max-w-sm mx-auto space-y-6">

          {/* Illustration */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center">
                <Smartphone className="w-9 h-9 text-amber-400" strokeWidth={1.5}/>
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-blue-600 border-2 border-gray-950 flex items-center justify-center">
                <span className="text-white text-[11px] font-black leading-none">!</span>
              </div>
            </div>
          </div>

          {/* Title + message */}
          <div className="text-center space-y-3">
            <h1 className="text-2xl font-black text-white leading-snug">
              This phone number is already connected to a Filmons account
            </h1>
            <p className="text-white/55 text-sm leading-relaxed">
              An account already exists for{' '}
              <span className="text-white/85 font-semibold select-text">{displayPhone}</span>.
              {' '}Sign in to continue.
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={() => navigate('/phone-login')}
              className="w-full min-h-[52px] py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-blue-900/30"
              aria-label="Sign in with phone"
            >
              Sign In
            </button>

            <button
              onClick={() => navigate('/signup/phone')}
              className="w-full min-h-[52px] py-4 bg-white/8 hover:bg-white/12 border border-white/15 text-white font-semibold text-sm rounded-2xl transition-all active:scale-[0.98]"
              aria-label="Use a different phone number"
            >
              Use a Different Phone Number
            </button>
          </div>

          <p className="text-center text-[11px] text-white/20 leading-relaxed">
            If you don't recognize this account, you can{' '}
            <button
              onClick={() => navigate('/login')}
              className="text-blue-400/70 hover:text-blue-400 underline"
            >
              sign in another way
            </button>.
          </p>
        </div>
      </div>
    </div>
  );
}
