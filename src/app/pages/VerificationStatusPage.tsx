import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, CheckCircle, Clock, XCircle, Shield, CreditCard, Briefcase, Building2, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { captureSnapshot } from '../lib/smartAnimate';
import { supabase } from '../../lib/supabase';

interface VerifData {
  identity_verified:            boolean;
  identity_verified_at:         string | null;
  payment_verified:             boolean;
  payment_verified_at:          string | null;
  professional_verified:        boolean;
  professional_verified_at:     string | null;
  professional_review_fee_paid: boolean;
  business_verified:            boolean;
  business_verified_at:         string | null;
  business_name:                string | null;
}

function StatusChip({ ok, pending }: { ok: boolean; pending?: boolean }) {
  if (ok) return (
    <span className="flex items-center gap-1 text-[10px] font-black text-green-700 bg-green-100 border border-green-200 px-2 py-0.5 rounded-full">
      <CheckCircle className="w-3 h-3"/> Verified
    </span>
  );
  if (pending) return (
    <span className="flex items-center gap-1 text-[10px] font-black text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
      <Clock className="w-3 h-3"/> Pending
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] font-black text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
      <XCircle className="w-3 h-3"/> Not started
    </span>
  );
}

export function VerificationStatusPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData]     = useState<VerifData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from('account_verifications').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data: d }) => { setData(d as any); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user?.id]);

  const fmt = (s: string | null) => s ? new Date(s).toLocaleDateString('en-CA', { year:'numeric', month:'short', day:'numeric' }) : null;

  const items = [
    {
      icon: <Shield className="w-5 h-5"/>,
      label: 'Identity Verification',
      sub: 'Government ID + selfie liveness check',
      ok: data?.identity_verified ?? false,
      date: fmt(data?.identity_verified_at ?? null),
      color: 'blue',
    },
    {
      icon: <CreditCard className="w-5 h-5"/>,
      label: 'Payment Verification',
      sub: 'Bank account for payouts & withdrawals',
      ok: data?.payment_verified ?? false,
      date: fmt(data?.payment_verified_at ?? null),
      color: 'green',
    },
    {
      icon: <Briefcase className="w-5 h-5"/>,
      label: 'Professional Verification',
      sub: 'Portfolio review & professional credibility',
      ok: data?.professional_verified ?? false,
      date: fmt(data?.professional_verified_at ?? null),
      color: 'purple',
    },
    {
      icon: <Building2 className="w-5 h-5"/>,
      label: 'Business Verification',
      sub: data?.business_name ?? 'Company registration & documents',
      ok: data?.business_verified ?? false,
      date: fmt(data?.business_verified_at ?? null),
      color: 'amber',
    },
  ];

  const colorMap: Record<string, string> = {
    blue:'bg-blue-100 text-blue-600', green:'bg-green-100 text-green-600',
    purple:'bg-purple-100 text-purple-600', amber:'bg-amber-100 text-amber-600',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => { captureSnapshot(); navigate(-1); }}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-700"/>
        </button>
        <h1 className="text-base font-black text-gray-900">Verification Status</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {loading ? (
          <div className="space-y-3">{[1,2,3,4].map(i=><div key={i} className="h-16 bg-white rounded-2xl animate-pulse"/>)}</div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
            {items.map(item => (
              <div key={item.label} className="flex items-center gap-4 px-4 py-4">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${colorMap[item.color]}`}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-400 truncate">{item.sub}</p>
                  {item.ok && item.date && <p className="text-[10px] text-gray-400 mt-0.5">Verified {item.date}</p>}
                </div>
                <StatusChip ok={item.ok}/>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => { captureSnapshot(); navigate('/settings/verification'); }}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-white rounded-2xl shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors">
          <p className="text-sm font-semibold text-gray-900">Manage Verifications</p>
          <ChevronRight className="w-4 h-4 text-gray-300"/>
        </button>

        <div className="pb-24"/>
      </div>
    </div>
  );
}