/**
 * /reset-password
 * Supabase sends: your-site.com/reset-password#access_token=...&type=recovery
 * supabase-js v2 auto-exchanges the hash into a session via onAuthStateChange.
 * We wait for that, then apply the pending password.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Eye, EyeOff, Check } from 'lucide-react';
import { captureSnapshot } from '../lib/smartAnimate';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';

type Status = 'waiting' | 'enter_password' | 'updating' | 'done' | 'error';

const PW_RULES = [
  { label: '8+ characters',     test: (p: string) => p.length >= 8 },
  { label: 'Uppercase letter',  test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Number',            test: (p: string) => /[0-9]/.test(p) },
  { label: 'Special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function Bg() {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-blue-950"/>
      <div className="absolute top-1/3 left-1/4 w-80 h-80 rounded-full bg-blue-600 opacity-[0.07] blur-[120px]"/>
    </div>
  );
}

export function ResetPassword() {
  const navigate = useNavigate();
  const [status,   setStatus]   = useState<Status>('waiting');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const pwValid = PW_RULES.every(r => r.test(password));

  useEffect(() => {
    // supabase-js v2 automatically handles the #access_token hash
    // and fires onAuthStateChange with event='PASSWORD_RECOVERY'
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        // Session is active — show password entry form
        setStatus('enter_password');
      }
    });

    // Also check if session already exists (page reload after hash exchange)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && status === 'waiting') {
        setStatus('enter_password');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Timeout — if no session after 8s, show error
  useEffect(() => {
    const t = setTimeout(() => {
      setStatus(s => s === 'waiting' ? 'error' : s);
      setErrorMsg('Recovery link expired or already used. Please request a new one.');
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  const applyPassword = async () => {
    if (!pwValid)             { setErrorMsg('Password does not meet requirements'); return; }
    if (password !== confirm) { setErrorMsg('Passwords do not match'); return; }
    setStatus('updating');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErrorMsg(error.message);
      setStatus('enter_password');
      return;
    }
    setStatus('done');
    toast.success('Password updated successfully!');
    setTimeout(() => { captureSnapshot(); navigate('/'); }, 2000);
  };

  const inputCls = "w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-blue-400 focus:bg-white/15 transition-all";

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden">
      <Bg/>
      <div className="relative z-10 w-full max-w-sm px-6 space-y-6">

        {/* Waiting for Supabase to exchange the hash */}
        {status === 'waiting' && (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"/>
            <p className="text-white font-semibold text-sm">Verifying recovery link…</p>
          </div>
        )}

        {/* Enter new password */}
        {(status === 'enter_password' || status === 'updating') && (
          <>
            <div>
              <h1 className="text-2xl font-black text-white">Create new password</h1>
              <p className="text-white/50 text-sm mt-1">Choose a strong, unique password.</p>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <input value={password} onChange={e => { setPassword(e.target.value); setErrorMsg(''); }}
                  type={showPw ? 'text' : 'password'} placeholder="New password"
                  className={inputCls + ' pr-12'}/>
                <button onClick={() => setShowPw(p => !p)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                  {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                </button>
              </div>

              {/* Strength bar */}
              {password && (
                <div className="space-y-2">
                  <div className="flex gap-1">
                    {[1,2,3,4].map(i => {
                      const score = PW_RULES.filter(r => r.test(password)).length;
                      const colors = ['','#ef4444','#f59e0b','#22c55e','#3b82f6'];
                      return <div key={i} className="flex-1 h-1 rounded-full transition-all duration-300"
                        style={{ background: score >= i ? colors[score] : 'rgba(255,255,255,0.1)' }}/>;
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {PW_RULES.map(r => (
                      <div key={r.label} className={`flex items-center gap-1.5 text-[11px] ${r.test(password) ? 'text-green-400' : 'text-white/25'}`}>
                        <Check className="w-2.5 h-2.5 shrink-0"/> {r.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <input value={confirm} onChange={e => { setConfirm(e.target.value); setErrorMsg(''); }}
                type="password" placeholder="Confirm new password"
                className={inputCls + (confirm && confirm !== password ? ' border-red-400' : '')}/>
              {confirm && confirm !== password && <p className="text-red-400 text-xs">Passwords don't match</p>}
              {errorMsg && <p className="text-red-400 text-xs">{errorMsg}</p>}
            </div>
            <button onClick={applyPassword}
              disabled={!pwValid || password !== confirm || status === 'updating'}
              className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl disabled:opacity-40 hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/30">
              {status === 'updating' ? 'Updating…' : 'Set New Password'}
            </button>
          </>
        )}

        {/* Success */}
        {status === 'done' && (
          <div className="text-center space-y-3">
            <div className="text-5xl">✅</div>
            <h2 className="text-xl font-black text-white">Password updated!</h2>
            <p className="text-white/50 text-sm">Signing you in…</p>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="text-center space-y-4">
            <div className="text-5xl">⚠️</div>
            <h2 className="text-lg font-black text-white">Link expired</h2>
            <p className="text-white/50 text-sm">{errorMsg}</p>
            <button onClick={() => { captureSnapshot(); navigate('/forgot-password'); }}
              className="w-full py-3 bg-blue-600 text-white font-bold text-sm rounded-2xl hover:bg-blue-700 transition-colors">
              Request New Link
            </button>
          </div>
        )}
      </div>
    </div>
  );
}