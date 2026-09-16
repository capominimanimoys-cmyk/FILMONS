// Expanded Connections detail inside Settings -> Trust & Verification.
// Deliberately framed as "professional relationship strength", never as
// points to farm -- per spec: "Describe Connections as professional
// relationships, not points to collect."
import { useNavigate } from 'react-router';
import type { TrustProfile } from '../../lib/trustApi';

export function ConnectionStrengthDetails({ trust }: { trust: TrustProfile }) {
  const navigate = useNavigate();
  const strength = [
    { label: 'Elite', value: trust.connectionsByStrength.elite, color: 'bg-purple-500' },
    { label: 'Trusted', value: trust.connectionsByStrength.trusted, color: 'bg-emerald-500' },
    { label: 'Reliable', value: trust.connectionsByStrength.reliable, color: 'bg-blue-500' },
    { label: 'Building / New', value: trust.connectionsByStrength.buildingNew, color: 'bg-gray-400' },
  ];
  const types = [
    { label: 'Professional', value: trust.connectionsByType.professional },
    { label: 'Business', value: trust.connectionsByType.business },
    { label: 'Creator+', value: trust.connectionsByType.creatorPlus },
    { label: 'Creator', value: trust.connectionsByType.creator },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">{trust.validConnections} valid professional connections</p>

      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Connection Strength</p>
        <div className="space-y-1.5">
          {strength.map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${s.color}`} />
              <p className="text-xs text-gray-700 flex-1">{s.label}</p>
              <p className="text-xs font-bold text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Account Types</p>
        <div className="space-y-1.5">
          {types.map(t => (
            <div key={t.label} className="flex items-center justify-between">
              <p className="text-xs text-gray-700">{t.label}</p>
              <p className="text-xs font-bold text-gray-900">{t.value}</p>
            </div>
          ))}
        </div>
      </div>

      <button onClick={() => navigate('/connections')} className="text-xs font-bold text-blue-600 hover:underline">
        View My Connections →
      </button>
    </div>
  );
}
