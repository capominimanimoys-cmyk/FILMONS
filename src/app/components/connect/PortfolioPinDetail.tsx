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
import { BadgeCheck, ChevronLeft, ChevronRight, ExternalLink, Flag, Heart, Layers, Link2, MessageCircle, MoreHorizontal, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { UserAvatar } from '../AccountTypeBadge';
import { PortfolioMedia } from '../PortfolioMedia';
import { PortfolioCommentSheet } from '../PortfolioCommentSheet';
import { PostMoreMenu } from './PostMoreMenu';
import { SharePostSheet } from './SharePostSheet';
import { getSharedContentDeepLink } from '../../lib/shareApi';
import { usePortfolioPreview } from '../../context/PortfolioPreviewContext';
import { getPortfolioFeed, isAlbumLiked, isItemLiked, isPortfolioSaved, toggleAlbumLike, toggleItemLike, togglePortfolioSave, type PortfolioFeedEntry } from '../../lib/portfolioApi';
import { logPortfolioInteraction } from '../../lib/personalization';
import { getDisplayIdentity } from '../../lib/displayIdentity';
import { PortfolioPinGrid } from './PortfolioPinGrid';

export type PortfolioItemEntry = Extract<PortfolioFeedEntry, { type: 'item' }>;
/** Anything the page can show: one piece, or an album. */
export type PortfolioPinEntry = PortfolioFeedEntry;

type Frame = { entry: PortfolioPinEntry; list: PortfolioPinEntry[] };
const itemsOf = (es: PortfolioFeedEntry[]) => es;
const sameEntry = (a: PortfolioPinEntry, b: PortfolioPinEntry) => a.type === b.type && a.id === b.id;
const SWIPE_DISTANCE = 70;

export function PortfolioPinDetail({ entry: first, seed, onClose }: {
  entry: PortfolioPinEntry;
  /** What was on screen when it opened: swipe order, and More to explore while related work loads. */
  seed: PortfolioFeedEntry[];
  onClose: () => void;
}) {
  // Each frame is one opened piece plus the list it was opened from, which
  // is what swiping left/right walks through. Opening something from More
  // to explore pushes a new frame; Back pops frames before closing.
  const [stack, setStack] = useState<Frame[]>(() => {
    const list = itemsOf(seed);
    return [{ entry: first, list: list.some(e => sameEntry(e, first)) ? list : [first] }];
  });
  const [show, setShow] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const frame = stack[stack.length - 1];
  const entry = frame.entry;
  const idx = frame.list.findIndex(e => sameEntry(e, entry));
  const prev = idx > 0 ? frame.list[idx - 1] : null;
  const next = idx >= 0 && idx < frame.list.length - 1 ? frame.list[idx + 1] : null;

  // Horizontal slide: follows the finger while dragging, then animates out
  // and the neighbour slides in from the other side.
  const [slideX, setSlideX] = useState(0);
  const [animating, setAnimating] = useState(false);
  const busy = useRef(false);
  const go = (dir: 1 | -1) => {
    const target = dir === 1 ? next : prev;
    if (!target || busy.current) { setAnimating(true); setSlideX(0); return; }
    busy.current = true;
    const w = window.innerWidth;
    setAnimating(true); setSlideX(-dir * w);
    setTimeout(() => {
      setStack(s => [...s.slice(0, -1), { ...s[s.length - 1], entry: target }]);
      setAnimating(false); setSlideX(dir * w);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setAnimating(true); setSlideX(0);
        setTimeout(() => { busy.current = false; }, 240);
      }));
    }, 200);
  };
  const goRef = useRef(go); goRef.current = go;

  const touch = useRef<{ x: number; y: number; dir: 'h' | 'v' | null } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (busy.current || e.touches.length !== 1) return;
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dir: null };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t = touch.current; if (!t) return;
    const dx = e.touches[0].clientX - t.x, dy = e.touches[0].clientY - t.y;
    if (!t.dir) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; t.dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'; }
    if (t.dir !== 'h') return;
    const edge = (dx > 0 && !prev) || (dx < 0 && !next);
    setAnimating(false); setSlideX(edge ? dx * 0.25 : dx);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current; touch.current = null;
    if (!t || t.dir !== 'h') return;
    const dx = e.changedTouches[0].clientX - t.x;
    if (dx <= -SWIPE_DISTANCE) go(1); else if (dx >= SWIPE_DISTANCE) go(-1); else { setAnimating(true); setSlideX(0); }
  };

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
    window.dispatchEvent(new CustomEvent('filmons:home-bars-hidden', { detail: { hidden: true } }));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') back();
      else if (e.key === 'ArrowRight') goRef.current(1);
      else if (e.key === 'ArrowLeft') goRef.current(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.dispatchEvent(new CustomEvent('filmons:home-bars-hidden', { detail: { hidden: false } }));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [entry.type, entry.id]);

  const closingRef = useRef(false);
  const exit = () => { if (!closingRef.current) { closingRef.current = true; setShow(false); setTimeout(onClose, 280); } };
  const back = () => {
    setStack(s => {
      if (s.length > 1) return s.slice(0, -1);
      if (!closingRef.current) { closingRef.current = true; setShow(false); setTimeout(onClose, 280); }
      return s;
    });
  };

  // Opened on its own (no list around it): once related work loads, swiping
  // continues into it.
  const onRelated = (related: PortfolioFeedEntry[]) => {
    setStack(s => {
      const top = s[s.length - 1];
      if (top.list.length > 1 || !sameEntry(top.entry, entry)) return s;
      return [...s.slice(0, -1), { ...top, list: [top.entry, ...itemsOf(related)] }];
    });
  };

  const arrow = 'absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-md hover:bg-white md:flex';
  return createPortal(
    <div className="fixed inset-0 z-[70] overflow-hidden bg-white"
      style={{ transform: show ? 'translateY(0)' : 'translateY(6%)', opacity: show ? 1 : 0, transition: 'transform 300ms cubic-bezier(0.22,1,0.36,1), opacity 260ms ease-out' }}>
      <div ref={scroller} className="h-full overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))', touchAction: 'pan-y' }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={() => { touch.current = null; setAnimating(true); setSlideX(0); }}>
        <div style={{ transform: `translateX(${slideX}px)`, transition: animating ? 'transform 220ms cubic-bezier(0.22,1,0.36,1)' : 'none' }}>
          <PinBody key={`${entry.type}-${entry.id}`} entry={entry} seed={seed} onBack={back} onExit={exit} onRelated={onRelated}
            onOpenItem={(e, related) => setStack(s => [...s, { entry: e, list: itemsOf(related) }])} />
        </div>
      </div>
      {prev && <button type="button" onClick={() => go(-1)} aria-label="Previous" className={`${arrow} left-4`}><ChevronLeft className="h-6 w-6 text-gray-900" /></button>}
      {next && <button type="button" onClick={() => go(1)} aria-label="Next" className={`${arrow} right-4`}><ChevronRight className="h-6 w-6 text-gray-900" /></button>}
    </div>,
    document.body,
  );
}

function PinBody({ entry, seed, onBack, onExit, onOpenItem, onRelated }: {
  entry: PortfolioPinEntry; seed: PortfolioFeedEntry[];
  onBack: () => void; onExit: () => void; onOpenItem: (e: PortfolioPinEntry, related: PortfolioFeedEntry[]) => void;
  onRelated: (related: PortfolioFeedEntry[]) => void;
}) {
  const { user, showGuestPrompt } = useAuth();
  const { openPortfolioPreview } = usePortfolioPreview();
  const navigate = useNavigate();
  const { creator } = entry;
  const item = entry.type === 'item' ? entry.item : null;
  const album = entry.type === 'album' ? entry.album : null;
  const saveType = item ? 'portfolio_item' as const : 'portfolio_album' as const;
  const title = item ? item.title : album!.title;
  const description = item ? item.description : album!.description;
  const category = item ? item.category : album!.category;
  const subcategory = item ? item.subcategory : undefined;
  const commentsCount = (item ? item.comments_count : album!.comments_count) ?? 0;
  const isOwn = !!user && user.id === creator.id;
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState((item ? item.likes_count : album!.likes_count) ?? 0);
  const [saved, setSaved] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [related, setRelated] = useState<PortfolioFeedEntry[] | null>(null);
  const openAlbum = () => openPortfolioPreview(creator.id, entry.id);

  useEffect(() => {
    logPortfolioInteraction(user?.id, { category: category ?? "", subcategory }, 'view');
    if (user) {
      (item ? isItemLiked(entry.id, user.id) : isAlbumLiked(entry.id, user.id)).then(setLiked);
      isPortfolioSaved(user.id, entry.id, saveType).then(setSaved);
    }
  }, [entry.id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Related: same category first, then the rest of what was on screen.
  useEffect(() => {
    let cancelled = false;
    const notThis = (e: PortfolioFeedEntry) => !(e.type === entry.type && e.id === entry.id);
    getPortfolioFeed({ category: category || undefined, limit: 30, viewerId: user?.id })
      .catch(() => [] as PortfolioFeedEntry[])
      .then(same => {
        if (cancelled) return;
        const seen = new Set<string>();
        const out = [...same, ...seed].filter(e => notThis(e) && !seen.has(`${e.type}-${e.id}`) && !!seen.add(`${e.type}-${e.id}`));
        setRelated(out);
        onRelated(out);
      });
    return () => { cancelled = true; };
  }, [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLike = async () => {
    if (!user) { showGuestPrompt('Create your Filmons account to like portfolio work.', 'Sign up to like posts'); return; }
    const next = !liked;
    setLiked(next); setLikes(c => c + (next ? 1 : -1));
    const ok = item ? await toggleItemLike(entry.id, user.id, !next, creator.id) : await toggleAlbumLike(entry.id, user.id, !next);
    if (!ok) { setLiked(!next); setLikes(c => c + (next ? -1 : 1)); toast.error('Could not update like'); return; }
    logPortfolioInteraction(user.id, { category: category ?? "", subcategory }, next ? 'like' : 'unlike');
  };
  const toggleSave = async () => {
    if (!user) { showGuestPrompt('Create your Filmons account to save portfolio work.', 'Sign up to save'); return; }
    const next = !saved;
    setSaved(next);
    const ok = await togglePortfolioSave(user.id, entry.id, saveType, !next, creator.id);
    if (!ok) { setSaved(!next); toast.error('Could not update save'); return; }
    toast.success(next ? 'Saved' : 'Removed from saved');
    logPortfolioInteraction(user.id, { category: category ?? "", subcategory }, next ? 'save' : 'unsave');
  };

  const shareSnapshot = {
    contentType: saveType, contentId: entry.id, creatorId: creator.id, creatorName: creator.name,
    creatorAvatar: creator.avatar_url ?? undefined, creatorVerified: creator.is_verified, title,
    caption: description, thumbnailUrl: item ? (item.thumbnail_url || item.media_url) : (entry.type === 'album' ? entry.coverUrl ?? undefined : undefined),
    meta: [category, subcategory].filter(Boolean) as string[],
  };
  const identity = getDisplayIdentity({ accountType: creator.account_type, primaryRole: creator.primary_role, businessIndustry: creator.business_industry });

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Media, with Back over its corner */}
      <div className="relative px-3 pt-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <div className="overflow-hidden rounded-3xl bg-gray-100 [&>*]:!rounded-3xl">
          {entry.type === 'album' ? (
            <button type="button" onClick={openAlbum} aria-label="Open album" className="relative block w-full"
              style={{ aspectRatio: String(entry.coverAspectRatio && entry.coverAspectRatio > 0 ? Math.max(0.56, Math.min(1.8, entry.coverAspectRatio)) : 4 / 5) }}>
              {entry.coverUrl
                ? <img src={entry.coverUrl} alt="" className="h-full w-full object-cover" />
                : <div className="flex h-full w-full items-center justify-center text-5xl opacity-30">🎬</div>}
              <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white">
                <Layers className="h-3.5 w-3.5" /> {entry.itemCount} {entry.itemCount === 1 ? 'item' : 'items'}
              </span>
            </button>
          ) : item!.media_type === 'text'
            ? <div className="p-8 text-lg font-semibold leading-relaxed text-gray-800">{item!.description || item!.title}</div>
            : <PortfolioMedia item={item!} capHeight={false} />}
        </div>
        <button type="button" onClick={onBack} aria-label="Back"
          className="absolute left-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-md active:scale-95 transition-transform"
          style={{ top: 'calc(max(12px, env(safe-area-inset-top)) + 10px)' }}>
          <ChevronLeft className="h-7 w-7 text-gray-900" />
        </button>
      </div>

      {/* Album: a strip of what's inside, and a way in */}
      {entry.type === 'album' && (
        <div className="px-3 pt-3">
          {entry.previewItems.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {entry.previewItems.map(pi => (
                <button key={pi.id} type="button" onClick={openAlbum} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                  {pi.url && (pi.media_type === 'video'
                    ? <video src={`${pi.url}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                    : <img src={pi.url} alt="" loading="lazy" className="h-full w-full object-cover" />)}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={openAlbum} className="mt-2 w-full rounded-2xl bg-gray-100 py-3 text-sm font-bold text-gray-900 active:bg-gray-200">
            Open album
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 px-3 pt-3">
        <button type="button" onClick={toggleLike} aria-label={liked ? 'Unlike' : 'Like'} className="flex items-center gap-1.5 rounded-full px-2.5 py-2 active:bg-gray-100">
          <Heart className={`h-7 w-7 ${liked ? 'fill-red-500 text-red-500' : 'text-gray-900'}`} strokeWidth={1.8} />
          {likes > 0 && <span className="text-base font-bold text-gray-900">{likes}</span>}
        </button>
        <button type="button" onClick={() => setShowComments(true)} aria-label="Comments" className="flex items-center gap-1.5 rounded-full px-2.5 py-2 active:bg-gray-100">
          <MessageCircle className="h-7 w-7 text-gray-900" strokeWidth={1.8} />
          {commentsCount > 0 && <span className="text-base font-bold text-gray-900">{commentsCount}</span>}
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
        <button type="button" onClick={() => openPortfolioPreview(creator.id)} aria-label={`View ${creator.name}'s portfolio`} className="flex items-center gap-2 text-left">
          <UserAvatar user={{ id: creator.id, name: creator.name, avatar: creator.avatar_url ?? undefined }} size={30} />
          <span className="text-base font-bold text-gray-900">{creator.name}</span>
          {creator.is_verified && <BadgeCheck className="h-4 w-4 fill-blue-100 text-blue-600" />}
        </button>
        {identity && <p onClick={() => openPortfolioPreview(creator.id)} className="mt-0.5 cursor-pointer pl-[38px] text-xs text-gray-500">{[identity, creator.city].filter(Boolean).join(' · ')}</p>}
        {title && <h1 className="mt-3 text-[22px] font-bold leading-snug text-gray-900">{title}</h1>}
        {description && item?.media_type !== 'text' && <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-gray-600">{description}</p>}
        {(category || (item?.tools?.length ?? 0) > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[category, subcategory, ...(item?.tools ?? [])].filter(Boolean).map(t => (
              <span key={t} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* More to explore */}
      <div className="px-3 pt-8">
        <button type="button" onClick={() => { navigate('/search/category/connect/portfolio'); onExit(); }}
          className="flex w-full items-center gap-1 px-2 pb-3 text-left">
          <h2 className="text-[22px] font-bold text-gray-900">More to explore</h2>
          <ChevronRight className="h-6 w-6 text-gray-900" />
        </button>
        {related === null
          ? <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map(i => <div key={i} className="animate-pulse rounded-2xl bg-gray-100" style={{ aspectRatio: i % 3 ? '3 / 4' : '1' }} />)}</div>
          : related.length === 0
            ? <p className="py-10 text-center text-sm text-gray-400">Nothing else to explore yet.</p>
            : <PortfolioPinGrid entries={related} onOpenItem={e => onOpenItem(e, related)} />}
      </div>

      {showComments && createPortal(
        <PortfolioCommentSheet itemId={entry.id} targetType={item ? 'item' : 'album'} creatorId={creator.id} itemCategory={category} itemSubcategory={subcategory}
          canModerate={isOwn} onClose={() => setShowComments(false)} />,
        document.body,
      )}
      {showShare && <SharePostSheet snapshot={shareSnapshot} onClose={() => setShowShare(false)} />}
      {showMore && (
        <PostMoreMenu
          onClose={() => setShowMore(false)}
          actions={[
            ...(album ? [{ icon: Layers, label: 'Open album', onClick: () => { setShowMore(false); openAlbum(); } }] : []),
            { icon: ExternalLink, label: 'View portfolio', onClick: () => { setShowMore(false); openPortfolioPreview(creator.id); } },
            { icon: Link2, label: 'Copy link', onClick: async () => { setShowMore(false); try { await navigator.clipboard.writeText(getSharedContentDeepLink(shareSnapshot)); toast.success('Link copied'); } catch { toast.error('Could not copy link'); } } },
            { icon: Flag, label: 'Report', onClick: () => { setShowMore(false); toast.warning("Reported. We'll review it shortly."); } },
          ]}
        />
      )}
    </div>
  );
}
