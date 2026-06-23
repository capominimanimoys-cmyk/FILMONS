import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Check, ChevronRight, Building2, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { captureSnapshot } from '../lib/smartAnimate';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';

const STEPS = [
  { id:1, label:'Confirm Creator+',         sub:'Verify active Creator+ status'             },
  { id:2, label:'Business Documents',       sub:'Upload registration & tax documents'       },
  { id:3, label:'Company Information',      sub:'Business name, type, and contact details'  },
  { id:4, label:'Pay Business Subscription',sub:'Enterprise subscription fee'               },
  { id:5, label:'Business Review',          sub:'Filmons validates your company'            },
];

export function BusinessAccountSteps() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep]           = useState(1);
  const [bizName, setBizName]     = useState('');
  const [bizType, setBizType]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!user?.id) return;
    setSubmitting(true);
    try {
      await supabase.from('account_upgrades').upsert({
        user_id: user.id, from_tier: 'creator_plus', to_tier: 'business',
        status: 'pending', business_name: bizName, applied_at: new Date().toISOString(),
      }, { onConflict: 'user_id,to_tier,status' });
      toast.success('Business application submitted — review takes 5–7 business days');
      captureSnapshot(); navigate('/settings/verification');
    } catch { toast.error('Failed to submit'); }
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
          <h1 className="text-base font-black text-gray-900">Apply for Business</h1>
          <p className="text-[11px] text-gray-400">Step {step} of {STEPS.length}</p>
        </div>
      </div>

      <div className="h-1 bg-gray-100">
        <div className="h-full bg-amber-500 transition-all duration-500"
          style={{ width:`${(step/STEPS.length)*100}%` }}/>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Steps overview */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {STEPS.map((s,i) => {
            const done = step > s.id, current = step === s.id;
            return (
              <div key={s.id} className={`flex items-center gap-3 px-4 py-3 ${i>0?'border-t border-gray-50':''} ${current?'bg-amber-50':''}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${done?'bg-green-500 text-white':current?'bg-amber-500 text-white':'bg-gray-100 text-gray-400'}`}>
                  {done ? <Check className="w-3.5 h-3.5"/> : s.id}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold ${current?'text-amber-700':done?'text-gray-600':'text-gray-400'}`}>{s.label}</p>
                  <p className="text-[10px] text-gray-400">{s.sub}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm font-black text-gray-900">✓ Creator+ Account Confirmed</p>
              <p className="text-xs text-gray-500 leading-relaxed">Business accounts require an active Creator+ account as the foundation. Your Creator+ status is confirmed.</p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
                {['Identity verified','Payout account verified','Marketplace access active'].map(f=>(
                  <div key={f} className="flex items-center gap-2 text-xs text-amber-700">
                    <Check className="w-3 h-3 text-amber-500 shrink-0"/>{f}
                  </div>
                ))}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm font-black text-gray-900">Business Documents</p>
              <p className="text-xs text-gray-500">Upload your business registration, tax documents, and company ID for verification.</p>
              {['Business Registration / Certificate of Incorporation','Tax Document (GST/HST, business number)','Government-issued company ID'].map(doc => (
                <div key={doc} className="border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 hover:border-amber-300 transition-colors cursor-pointer">
                  <Upload className="w-4 h-4 text-gray-400 shrink-0"/>
                  <p className="text-xs text-gray-500">{doc}</p>
                </div>
              ))}
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm font-black text-gray-900">Company Information</p>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Business Name</label>
                <input value={bizName} onChange={e=>setBizName(e.target.value)}
                  placeholder="e.g. Filmons Productions Inc."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"/>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Business Type</label>
                <select value={bizType} onChange={e=>setBizType(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white">
                  <option value="">Select type…</option>
                  {['Production Studio','Rental House','Creative Agency','Photography Studio','Music / Sound Studio','Other'].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm font-black text-gray-900">Business Subscription</p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 text-center">
                <p className="text-3xl font-black text-amber-700">$149</p>
                <p className="text-xs text-gray-500 mt-1">/month · cancel anytime</p>
              </div>
              <button onClick={() => toast.info('Payment flow coming soon')}
                className="w-full py-3 bg-amber-500 text-white font-bold text-sm rounded-xl hover:bg-amber-600 transition-colors">
                Pay Business Subscription
              </button>
            </div>
          )}
          {step === 5 && (
            <div className="space-y-4">
              <p className="text-sm font-black text-gray-900">Business Review</p>
              <p className="text-xs text-gray-500 leading-relaxed">Our team validates your business registration, operational legitimacy, and company information. This takes 5–7 business days.</p>
              <div className="space-y-2">
                {['Business registration validation','Tax document verification','Company identity confirmation','Operational legitimacy review'].map(c=>(
                  <div key={c} className="flex items-center gap-2 text-xs text-gray-600">
                    <Building2 className="w-3 h-3 text-amber-400 shrink-0"/>{c}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          {step > 1 && (
            <button onClick={() => setStep(s=>s-1)} className="flex-1 py-3 border border-gray-200 text-gray-700 font-bold text-sm rounded-xl hover:bg-gray-50">Back</button>
          )}
          {step < STEPS.length ? (
            <button onClick={() => setStep(s=>s+1)} className="flex-1 py-3 bg-amber-500 text-white font-bold text-sm rounded-xl hover:bg-amber-600">Continue</button>
          ) : (
            <button onClick={submit} disabled={submitting} className="flex-1 py-3 bg-amber-500 text-white font-bold text-sm rounded-xl hover:bg-amber-600 disabled:opacity-60">
              {submitting ? 'Submitting…' : 'Submit Application'}
            </button>
          )}
        </div>

        {/* Downgrade */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Change Account Tier</p>
          <div className="space-y-2">
            {[
              { label:'Stay on Creator+',       sub:'Keep marketplace access', action:()=>{ captureSnapshot(); navigate('/settings/verification'); } },
              { label:'Apply for Professional', sub:'Industry-recognized creator status', action:()=>{ captureSnapshot(); navigate('/professional-account-steps'); } },
              { label:'Downgrade to Creator',   sub:'Remove marketplace hosting', color:'text-red-500', action:()=>toast.info('Contact: support@filmons.ca') },
            ].map(opt=>(
              <button key={opt.label} onClick={opt.action}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 text-left transition-colors">
                <div>
                  <p className={`text-xs font-semibold ${opt.color??'text-gray-700'}`}>{opt.label}</p>
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