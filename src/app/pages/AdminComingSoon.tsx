// Placeholder content for admin nav items that don't have a real page
// yet (Dashboard/Transactions/Users/Listings/Opportunities/Reports/
// Settings) -- keeps AdminLayout's nav fully clickable/coherent instead
// of dead-ending, without building out full moderation UIs that weren't
// asked for. Swap in a real page per section as each is built.
import { Construction } from 'lucide-react';

export function AdminComingSoon({ title }: { title: string }) {
  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="text-center">
        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Construction className="w-7 h-7 text-gray-400" />
        </div>
        <h1 className="text-lg font-black text-gray-900 mb-1">{title}</h1>
        <p className="text-sm text-gray-400">This section isn't built yet.</p>
      </div>
    </div>
  );
}
