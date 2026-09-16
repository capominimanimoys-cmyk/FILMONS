import { ReliabilityProgressBar } from './ReliabilityProgressBar';
import type { TrustProfile } from '../../lib/trustApi';

export function TransactionProgress({ trust }: { trust: TrustProfile }) {
  const rows = [
    { label: 'Rentals', value: trust.completedRentals, max: 25 },
    { label: 'Buy / Sell', value: trust.completedBuySell, max: 10 },
    { label: 'Paid Services', value: trust.completedPaidServices, max: 5 },
    { label: 'Paid Opportunities', value: trust.completedPaidOpportunities, max: 10 },
  ];
  return (
    <div className="space-y-3">
      {rows.map(r => (
        <div key={r.label}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-700">{r.label}</p>
            <p className="text-xs font-bold text-gray-900">{r.value} / {r.max}</p>
          </div>
          <ReliabilityProgressBar value={r.value} max={r.max} colorClass="bg-gray-700" />
        </div>
      ))}
    </div>
  );
}
