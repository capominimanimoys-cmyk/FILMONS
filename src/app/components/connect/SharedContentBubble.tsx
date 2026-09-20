// Rich chat card for a message shared via the universal FILMONS Share
// system (shareApi.ts) -- renders msg.sharedContent (a lightweight
// snapshot), never a raw pasted URL. Tapping opens the ORIGINAL content:
// Portfolio items/albums reuse the same draggable Portfolio overlay as
// everywhere else in the app; posts open their post page.
//
// Before opening a post, re-verifies it still exists (postsApi.getByIds)
// so a deleted post degrades to "no longer available" instead of a dead
// link (spec: never preserve an unauthorized permanent copy of deleted
// content). Portfolio content is checked implicitly -- DraggablePortfolioPage
// already fetches fresh from the creator's live Portfolio, so a
// since-deleted/hidden item or album simply won't be there to open.
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { CheckCircle2, Layers, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { postsApi } from '../../lib/api';
import { usePortfolioPreview } from '../../context/PortfolioPreviewContext';
import { useLearningTransition } from '../../context/LearningTransitionContext';
import type { SharedContentSnapshot } from '../../types';

export function SharedContentBubble({ content, isOwn }: { content: SharedContentSnapshot; isOwn: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { openPortfolioPreview } = usePortfolioPreview();
  const { enterLearning } = useLearningTransition();
  const [checking, setChecking] = useState(false);

  const handleTap = async () => {
    if (content.contentType === 'portfolio_item' || content.contentType === 'portfolio_album') {
      openPortfolioPreview(content.creatorId, content.contentType === 'portfolio_album' ? content.contentId : undefined);
      return;
    }
    if (content.contentType === 'post') {
      setChecking(true);
      const rows = await postsApi.getByIds([content.contentId]).catch(() => []);
      setChecking(false);
      if (!rows?.length) { toast.error('This content is no longer available'); return; }
      navigate(`/post/${content.contentId}`);
      return;
    }
    if (content.contentType === 'course') {
      enterLearning(`/course/${content.contentId}`, { route: location.pathname + location.search });
      return;
    }
    navigate(`/host/${content.creatorId}`);
  };

  return (
    <>
      <button
        onClick={handleTap}
        disabled={checking}
        className={`block w-56 rounded-2xl overflow-hidden border shadow-sm hover:opacity-90 transition-opacity text-left disabled:opacity-60 ${isOwn ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}
      >
        {content.thumbnailUrl ? (
          <img src={content.thumbnailUrl} alt="" className="w-full h-32 object-cover" />
        ) : (
          <div className="w-full h-20 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            {content.contentType === 'portfolio_album' ? <Layers className="w-6 h-6 text-gray-400" /> : <FileText className="w-6 h-6 text-gray-400" />}
          </div>
        )}
        <div className="p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-[18px] h-[18px] rounded-full bg-gray-200 overflow-hidden shrink-0">
              {content.creatorAvatar && <img src={content.creatorAvatar} alt="" className="w-full h-full object-cover" />}
            </div>
            <span className="text-xs font-semibold text-gray-700 truncate">{content.creatorName}</span>
            {content.creatorVerified && <CheckCircle2 className="w-3 h-3 text-blue-600 fill-blue-100 shrink-0" />}
          </div>
          {(content.title || content.caption) && (
            <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">{content.title || content.caption}</p>
          )}
          {!!content.meta?.length && (
            <p className="text-[10px] text-gray-400 mt-1 truncate">{content.meta.join(' · ')}</p>
          )}
        </div>
      </button>
    </>
  );
}
