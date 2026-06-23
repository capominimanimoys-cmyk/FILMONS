import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Star, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { captureSnapshot } from '../lib/smartAnimate';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';

const STEPS = [
  { id: 1, label: 'Confirm Creator+',       sub: 'Verify your active Creator+ status'       },
  { id: 2, label: 'Review Fee',             sub: 'Pay the professional review fee'           },
  { id: 3, label: 'Submit Portfolio',       sub: 'Share your best work for review'           },
  { id: 4, label: 'Meet Requirements',      sub: 'Reliability score ≥ 50'                   },
  { id: 5, label: 'Professional Review',    sub: 'Filmons team reviews your application'     },
];

export function ProfessionalAccountSteps() {
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const [step, setStep] = useState(1);
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!user?.id) return;
    setSubmitting(true);
    try {
      await supabase.from('account_upgrades').upsert({
        user_id: user.id,
        from_tier: 'creator_plus',
        to_tier: 'professional',
        status: 'pending',
        portfolio_url: portfolioUrl,
        applied_at: new Date().toISOString(),
      }, { onConflict: 'user_id,to_tier,status' });
      toast.success('Application submitted — we\'ll review your portfolio within 3–5 days');
      captureSnapshot(); navigate('/settings/verification');
    } catch { toast.error('Failed to submit — try again'); }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => { captureSnapshot(); navigate(-1); }}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-700"/>
        </button>
        <div>
          <h1 className="text-base font-black text-gray-900">Apply for Professional</h1>
          <p className="text-[11px] text-gray-400">Step {step} of {STEPS.length}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100">
        <div className="h-full bg-purple-600 transition-all duration-500"
          style={{ width: `${(step / STEPS.length) * 100}%` }}/>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Steps overview */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {STEPS.map((s, i) => {
            const done = step > s.id;
            const current = step === s.id;
            return (
              <div key={s.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-50' : ''} ${current ? 'bg-purple-50' : ''}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                  done ? 'bg-green-500 text-white' : current ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                  {done ? <Check className="w-3.5 h-3.5"/> : s.id}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold ${current ? 'text-purple-700' : done ? 'text-gray-600' : 'text-gray-400'}`}>{s.label}</p>
                  <p className="text-[10px] text-gray-400">{s.sub}</p>
                </div>
                {current && <div className="w-2 h-2 bg-purple-500 rounded-full shrink-0"/>}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm font-black text-gray-900">✓ Creator+ Account Confirmed</p>
              <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 space-y-1">
                {['Identity verified','Payout account verified','Marketplace access active'].map(f => (
                  <div key={f} className="flex items-center gap-2 text-xs text-purple-700">
                    <Check className="w-3 h-3 text-purple-500 shrink-0"/>{f}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">Your Creator+ account meets the base requirement. Continue to apply for Professional verification.</p>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm font-black text-gray-900">Professional Review Fee</p>
              <p className="text-xs text-gray-500 leading-relaxed">A one-time review fee covers portfolio evaluation, professional review, and marketplace trust assessment.</p>
              <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-4 text-center">
                <p className="text-3xl font-black text-purple-700">$29</p>
                <p className="text-xs text-gray-500 mt-1">One-time professional review fee</p>
              </div>
              <button onClick={() => toast.info('Payment flow coming soon')}
                className="w-full py-3 bg-purple-600 text-white font-bold text-sm rounded-xl hover:bg-purple-700 transition-colors">
                Pay Review Fee
              </button>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm font-black text-gray-900">Submit Your Portfolio</p>
              <p className="text-xs text-gray-500">Share your best work — reels, projects, client work, or your Filmons portfolio URL.</p>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Portfolio / Reel URL</label>
                <input value={portfolioUrl} onChange={e => setPortfolioUrl(e.target.value)}
                  placeholder="https://filmons.com/@you or vimeo.com/..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400"/>
              </div>
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-purple-300 transition-colors cursor-pointer">
                <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2"/>
                <p className="text-xs text-gray-400">Upload work samples (optional)</p>
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm font-black text-gray-900">Reliability Requirement</p>
              <p className="text-xs text-gray-500">Your reliability score must be 50 or above to qualify for Professional verification.</p>
              <div className={`rounded-xl border px-4 py-4 text-center ${(user as any)?.reliabilityScore >= 50 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <p className="text-3xl font-black text-gray-900">50+</p>
                <p className="text-xs text-gray-500 mt-1">Required reliability score</p>
                {(user as any)?.reliabilityScore >= 50
                  ? <p className="text-xs text-green-600 font-bold mt-2">✓ Your score meets the requirement</p>
                  : <p className="text-xs text-amber-600 font-bold mt-2">Complete more activities to reach this threshold</p>
                }
              </div>
            </div>
          )}
          {step === 5 && (
            <div className="space-y-4">
              <p className="text-sm font-black text-gray-900">Professional Review</p>
              <p className="text-xs text-gray-500 leading-relaxed">Our team reviews your portfolio quality, professional consistency, and marketplace reputation. This takes 3–5 business days.</p>
              <div className="space-y-2">
                {['Portfolio quality & creative consistency','Verified professional work history','Marketplace reliability record','Creator reputation assessment'].map(c => (
                  <div key={c} className="flex items-center gap-2 text-xs text-gray-600">
                    <Star className="w-3 h-3 text-purple-400 shrink-0"/>{c}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Nav buttons */}
        <div className="flex gap-3">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)}
              className="flex-1 py-3 border border-gray-200 text-gray-700 font-bold text-sm rounded-xl hover:bg-gray-50 transition-colors">
              Back
            </button>
          )}
          {step < STEPS.length ? (
            <button onClick={() => setStep(s => s + 1)}
              className="flex-1 py-3 bg-purple-600 text-white font-bold text-sm rounded-xl hover:bg-purple-700 transition-colors">
              Continue
            </button>
          ) : (
            <button onClick={submit} disabled={submitting}
              className="flex-1 py-3 bg-purple-600 text-white font-bold text-sm rounded-xl hover:bg-purple-700 disabled:opacity-60 transition-colors">
              {submitting ? 'Submitting…' : 'Submit Application'}
            </button>
          )}
        </div>

        {/* Downgrade options */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Change Account Tier</p>
          <div className="space-y-2">
            {[
              { label:'Stay on Creator+', sub:'Keep your marketplace access', action: () => { captureSnapshot(); navigate('/settings/verification'); } },
              { label:'Downgrade to Creator', sub:'Remove marketplace hosting access', color:'text-red-500', action: () => toast.info('Contact support to downgrade: support@filmons.ca') },
            ].map(opt => (
              <button key={opt.label} onClick={opt.action}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 text-left transition-colors">
                <div>
                  <p className={`text-xs font-semibold ${opt.color ?? 'text-gray-700'}`}>{opt.label}</p>
                  <p className="text-[10px] text-gray-400">{opt.sub}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}