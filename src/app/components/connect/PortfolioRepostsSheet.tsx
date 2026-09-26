// "Reposts" list for a Portfolio item/album -- same shape as PostCard's
// own RepostsSheet.tsx (relevance-ordered: connections, then people the
// viewer follows, then everyone else; role/location per row), backed by
// getPortfolioReposts instead of postsApi.getReposts. Didn't exist at all
// before this -- the repost count on Portfolio cards was static text with
// no tap target.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Repeat2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { getPortfolioReposts, type PortfolioRepostListEntry, type PortfolioSaveTargetType } from '../../lib/portfolioApi';
import { getDisplayIdentity } from '../../lib/displayIdentity';
import { useAuth } from '../../context/AuthContext';
import { UserAvatar } from '../AccountTypeBadge';

const RELATION_LABEL: Record<PortfolioRepostListEntry['viewerRelation'], string | null> = {
  connection: 'Connection', following: 'Following', none: null,
};

export function PortfolioRepostsSheet({ targetId, targetType, onClose }: {
  targetId: string; targetType: PortfolioSaveTargetType; onClose: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [entries, setEntries] = useState<PortfolioRepostListEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPortfolioReposts(targetId, targetType, user?.id).then(r => { setEntries(r); setLoading(false); });
  }, [targetId, targetType, user?.id]);

  const openEntry = (e: PortfolioRepostListEntry) => {
    onClose();
    if (e.type === 'thoughts' && e.quotePostId) navigate(`/post/${e.quotePostId}`);
    else navigate(e.userUsername ? `/${e.userUsername}` : `/host/${e.userId}`);
  };

  // Portaled to document.body -- same containing-block bug already fixed
  // for RepostMenuSheet/RepostComposer/the delete confirm/RepostsSheet
  // this session.
  return createPortal((
    <div className="fixed inset-0 z-[80] flex items-end" onClick={onClose}>
      <div
        className="w-full bg-white rounded-t-2xl shadow-xl flex flex-col"
        style={{ maxHeight: '80vh', animation: 'portfolioRepostsSlideUp 0.28s cubic-bezier(0.4,0,0.2,1)' }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`@keyframes portfolioRepostsSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>

        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1 shrink-0" />

        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 shrink-0">
          <p className="text-sm font-bold text-gray-900">
            {loading ? '…' : entries.length.toLocaleString()} {entries.length === 1 ? 'repost' : 'reposts'}
          </p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-12">No reposts yet</p>
          ) : (
            entries.map((e, i) => (
              <button
                key={`${e.type}-${e.userId}-${i}`}
                onClick={() => openEntry(e)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0"
              >
                <UserAvatar user={{ id: e.userId, name: e.userName, avatar: e.userAvatar }} size={44} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{e.userName}</p>
                  {(getDisplayIdentity({ accountType: e.accountType, primaryRole: e.primaryRole, businessIndustry: e.businessIndustry }) || e.city) && (
                    <p className="text-xs text-gray-500 truncate">
                      {[getDisplayIdentity({ accountType: e.accountType, primaryRole: e.primaryRole, businessIndustry: e.businessIndustry }), e.city].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <Repeat2 className="w-3 h-3 text-green-500" />
                    {e.type === 'thoughts' ? 'Reposted with thoughts' : 'Reposted'}
                    {RELATION_LABEL[e.viewerRelation] && <span> · {RELATION_LABEL[e.viewerRelation]}</span>}
                  </p>
                </div>
                <span className="text-xs font-bold text-blue-600 shrink-0">View</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  ), document.body);
}
