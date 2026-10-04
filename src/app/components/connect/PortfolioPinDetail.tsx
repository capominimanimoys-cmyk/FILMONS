// Pinterest-style detail page for one piece of portfolio work, opened from
// the Trending portfolios grid: the media large at the top with a back
// button over it, then like / comment / share / more and a Save button,
// the creator and title, and "More to explore" -- related work in the same
// masonry grid. Opening a related piece pushes it on top; Back steps back
// through them before closing. Same engagement primitives as
// PortfolioProjectCard (toggleItemLike, togglePortfolioSave,
// PortfolioCommentSheet, SharePostSheet), never a second system.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { BadgeCheck, ChevronLeft, ExternalLink, Flag, Heart, Link2, MessageCircle, MoreHorizontal, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { UserAvatar } from '../AccountTypeBadge';
import { PortfolioMedia } from '../PortfolioMedia';
import { PortfolioCommentSheet } from '../PortfolioCommentSheet';
import { PostMoreMenu } from './PostMoreMenu';
import { SharePostSheet } from './SharePostSheet';
import { getSharedContentDeepLink } from '../../lib/shareApi';
import { usePortfolioPreview } from '../../context/PortfolioPreviewContext';
import { getPortfolioFeed, isItemLiked, isPortfolioSaved, toggleItemLike, togglePortfolioSave, type PortfolioFeedEntry } from '../../lib/portfolioApi';
import { logPortfolioInteraction } from '../../lib/personalization';
import { getDisplayIdentity } from '../../lib/displayIdentity';
import { PortfolioPinGrid } from './PortfolioPinGrid';

export type PortfolioItemEntry = Extract<PortfolioFeedEntry, { type: 'item' }>;

export function PortfolioPinDetail({ entry: first, seed, onClose }: {
  entry: PortfolioItemEntry;
  /** What was on screen when it opened -- shown in More to explore while related work loads. */
  seed: PortfolioFeedEntry[];
  onClose: () => void;
}) {
  const [stack, setStack] = useState<PortfolioItemEntry[]>([first]);
  const [show, setShow] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const entry = stack[stack.length - 1];

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
    window.dispatchEvent(new CustomEvent('filmons:home-bars-hidden', { detail: { hidden: true } }));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') back(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.dispatchEvent(new CustomEvent('filmons:home-bars-hidden', { detail: { hidden: false } }));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [entry.id]);

  const closingRef = useRef(false);
  const back = () => {
    setStack(s => {
      if (s.length > 1) return s.slice(0, -1);
      if (!closingRef.current) { closingRef.current = true; setShow(false); setTimeout(onClose, 280); }
      return s;
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-white"
      style={{ transform: show ? 'translateY(0)' : 'translateY(6%)', opacity: show ? 1 : 0, transition: 'transform 300ms cubic-bezier(0.22,1,0.36,1), opacity 260ms ease-out' }}>
      <div ref={scroller} className="h-full overflow-y-auto overscroll-contain" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
        <PinBody key={entry.id} entry={entry} seed={seed} onBack={back} onOpenItem={e => setStack(s => [...s, e])} />
      </div>
    </div>,
    document.body,
  );
}

function PinBody({ entry, seed, onBack, onOpenItem }: {
  entry: PortfolioItemEntry; seed: PortfolioFeedEntry[];
  onBack: () => void; onOpenItem: (e: PortfolioItemEntry) => void;
}) {
  const { user, showGuestPrompt } = useAuth();
  const navigate = useNavigate();
  const { openPortfolioPreview } = usePortfolioPreview();
  const { item, creator } = entry;
  const isOwn = !!user && user.id === creator.id;
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(item.likes_count ?? 0);
  const [saved, setSaved] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [related, setRelated] = useState<PortfolioFeedEntry[] | null>(null);

  useEffect(() => {
    logPortfolioInteraction(user?.id, { category: item.category, subcategory: item.subcategory }, 'view');
    if (user) {
      isItemLiked(item.id, user.id).then(setLiked);
      isPortfolioSaved(user.id, item.id, 'portfolio_item').then(setSaved);
    }
  }, [item.id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Related: same category first, then the rest of what was on screen.
  useEffect(() => {
    let cancelled = false;
    const notThis = (e: PortfolioFeedEntry) => !(e.type === 'item' && e.id === item.id);
    getPortfolioFeed({ category: item.category || undefined, limit: 30, viewerId: user?.id })
      .catch(() => [] as PortfolioFeedEntry[])
      .then(same => {
        if (cancelled) return;
        const seen = new Set<string>();
        const out = [...same, ...seed].filter(e => notThis(e) && !seen.has(`${e.type}-${e.id}`) && !!seen.add(`${e.type}-${e.id}`));
        setRelated(out);
      });
    return () => { cancelled = true; };
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLike = async () => {
    if (!user) { showGuestPrompt('Create your Filmons account to like portfolio work.', 'Sign up to like posts'); return; }
    const next = !liked;
    setLiked(next); setLikes(c => c + (next ? 1 : -1));
    const ok = await toggleItemLike(item.id, user.id, !next, creator.id);
    if (!ok) { setLiked(!next); setLikes(c => c + (next ? -1 : 1)); toast.error('Could not update like'); return; }
    logPortfolioInteraction(user.id, { category: item.category, subcategory: item.subcategory }, next ? 'like' : 'unlike');
  };
  const toggleSave = async () => {
    if (!user) { showGuestPrompt('Create your Filmons account to save portfolio work.', 'Sign up to save'); return; }
    const next = !saved;
    setSaved(next);
    const ok = await togglePortfolioSave(user.id, item.id, 'portfolio_item', !next, creator.id);
    if (!ok) { setSaved(!next); toast.error('Could not update save'); return; }
    toast.success(next ? 'Saved' : 'Removed from saved');
    logPortfolioInteraction(user.id, { category: item.category, subcategory: item.subcategory }, next ? 'save' : 'unsave');
  };

  const shareSnapshot = {
    contentType: 'portfolio_item' as const, contentId: item.id, creatorId: creator.id, creatorName: creator.name,
    creatorAvatar: creator.avatar_url ?? undefined, creatorVerified: creator.is_verified, title: item.title,
    caption: item.description, thumbnailUrl: item.thumbnail_url || item.media_url,
    meta: [item.category, item.subcategory].filter(Boolean) as string[],
  };
  const identity = getDisplayIdentity({ accountType: creator.account_type, primaryRole: creator.primary_role, businessIndustry: creator.business_industry });

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Media, with Back over its corner */}
      <div className="relative px-3 pt-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <div className="overflow-hidden rounded-3xl bg-gray-100 [&>*]:!rounded-3xl">
          {item.media_type === 'text'
            ? <div className="p-8 text-lg font-semibold leading-relaxed text-gray-800">{item.description || item.title}</div>
            : <PortfolioMedia item={item} capHeight={false} />}
        </div>
        <button type="button" onClick={onBack} aria-label="Back"
          className="absolute left-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-md active:scale-95 transition-transform"
          style={{ top: 'calc(max(12px, env(safe-area-inset-top)) + 10px)' }}>
          <ChevronLeft className="h-7 w-7 text-gray-900" />
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 px-3 pt-3">
        <button type="button" onClick={toggleLike} aria-label={liked ? 'Unlike' : 'Like'} className="flex items-center gap-1.5 rounded-full px-2.5 py-2 active:bg-gray-100">
          <Heart className={`h-7 w-7 ${liked ? 'fill-red-500 text-red-500' : 'text-gray-900'}`} strokeWidth={1.8} />
          {likes > 0 && <span className="text-base font-bold text-gray-900">{likes}</span>}
        </button>
        <button type="button" onClick={() => setShowComments(true)} aria-label="Comments" className="flex items-center gap-1.5 rounded-full px-2.5 py-2 active:bg-gray-100">
          <MessageCircle className="h-7 w-7 text-gray-900" strokeWidth={1.8} />
          {(item.comments_count ?? 0) > 0 && <span className="text-base font-bold text-gray-900">{item.comments_count}</span>}
        </button>
        <button type="button" onClick={() => setShowShare(true)} aria-label="Share"
          className="mx-1 flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 active:bg-gray-100">
          <Send className="h-5 w-5 text-blue-600" />
        </button>
        <button type="button" onClick={() => setShowMore(true)} aria-label="More options" className="rounded-full p-2.5 active:bg-gray-100">
          <MoreHorizontal className="h-7 w-7 text-gray-900" />
        </button>
        <button type="button" onClick={toggleSave}
          className={`ml-auto rounded-full px-6 py-3 text-base font-bold transition-colors ${saved ? 'bg-gray-900 text-white' : 'bg-red-600 text-white active:bg-red-700'}`}>
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {/* Creator + title */}
      <div className="px-5 pt-3">
        <button type="button" onClick={() => navigate(`/host/${creator.id}`)} className="flex items-center gap-2 text-left">
          <UserAvatar user={{ id: creator.id, name: creator.name, avatar: creator.avatar_url ?? undefined }} size={30} />
          <span className="text-base font-bold text-gray-900">{creator.name}</span>
          {creator.is_verified && <BadgeCheck className="h-4 w-4 fill-blue-100 text-blue-600" />}
        </button>
        {identity && <p className="mt-0.5 pl-[38px] text-xs text-gray-500">{[identity, creator.city].filter(Boolean).join(' · ')}</p>}
        {item.title && <h1 className="mt-3 text-[22px] font-bold leading-snug text-gray-900">{item.title}</h1>}
        {item.description && item.media_type !== 'text' && <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-gray-600">{item.description}</p>}
        {(item.category || (item.tools?.length ?? 0) > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[item.category, item.subcategory, ...(item.tools ?? [])].filter(Boolean).map(t => (
              <span key={t} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* More to explore */}
      <div className="px-3 pt-8">
        <h2 className="px-2 pb-3 text-[22px] font-bold text-gray-900">More to explore</h2>
        {related === null
          ? <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map(i => <div key={i} className="animate-pulse rounded-2xl bg-gray-100" style={{ aspectRatio: i % 3 ? '3 / 4' : '1' }} />)}</div>
          : related.length === 0
            ? <p className="py-10 text-center text-sm text-gray-400">Nothing else to explore yet.</p>
            : <PortfolioPinGrid entries={related} onOpenItem={onOpenItem} />}
      </div>

      {showComments && createPortal(
        <PortfolioCommentSheet itemId={item.id} creatorId={creator.id} itemCategory={item.category} itemSubcategory={item.subcategory}
          canModerate={isOwn} onClose={() => setShowComments(false)} />,
        document.body,
      )}
      {showShare && <SharePostSheet snapshot={shareSnapshot} onClose={() => setShowShare(false)} />}
      {showMore && (
        <PostMoreMenu
          onClose={() => setShowMore(false)}
          actions={[
            { icon: ExternalLink, label: 'View portfolio', onClick: () => { setShowMore(false); openPortfolioPreview(creator.id); } },
            { icon: Link2, label: 'Copy link', onClick: async () => { setShowMore(false); try { await navigator.clipboard.writeText(getSharedContentDeepLink(shareSnapshot)); toast.success('Link copied'); } catch { toast.error('Could not copy link'); } } },
            { icon: Flag, label: 'Report', onClick: () => { setShowMore(false); toast.warning("Reported. We'll review it shortly."); } },
          ]}
        />
      )}
    </div>
  );
}
