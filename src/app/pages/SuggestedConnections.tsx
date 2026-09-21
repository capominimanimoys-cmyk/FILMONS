// /connections/suggested -- dedicated full-screen subpage, split out of
// what used to be MyConnections.tsx's "suggested" tab. Reuses
// getSuggestedCreators (portfolioApi.ts) -- the exact same scorer Home's
// "People you may like to connect with" row and the Connections hub's
// preview both use, per spec ("do not maintain separate recommendation
// algorithms") -- and the same SuggestedConnectionCard those surfaces use.
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { dismissSuggestion } from '../lib/connectionsApi';
import { getSuggestedCreators, type SuggestedCreator } from '../lib/portfolioApi';
import { SuggestedConnectionCard } from '../components/connect/SuggestedConnectionCard';
import { ConnectionsPageHeader } from '../components/connect/ConnectionsPageHeader';
import { ConnectionsSlideIn } from '../components/connect/ConnectionsSlideIn';

export function SuggestedConnections() {
  const { user: me } = useAuth();
  const [suggested, setSuggested] = useState<SuggestedCreator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!me?.id) return;
    setLoading(true);
    getSuggestedCreators(me.id, { limit: 60 }).then(r => { setSuggested(r); setLoading(false); });
  }, [me?.id]);

  const dismiss = (id: string) => {
    setSuggested(p => p.filter(s => s.id !== id));
    if (me?.id) dismissSuggestion(me.id, id);
  };

  return (
    <ConnectionsSlideIn>
      <ConnectionsPageHeader title="Suggested" />
      <div className="max-w-4xl mx-auto py-4">
        <p className="px-4 mb-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">People you may like to connect with</p>
        {!loading && suggested.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No suggestions right now.</p>
        ) : (
          <div className="px-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {suggested.map(c => (
              <SuggestedConnectionCard key={c.id} creator={c} widthClassName="w-full" onConnected={() => {}} onDismiss={() => dismiss(c.id)} />
            ))}
          </div>
        )}
      </div>
    </ConnectionsSlideIn>
  );
}
