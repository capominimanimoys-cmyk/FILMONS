// FILMONS "Draggable View Portfolio" experience -- built on the generic
// <DraggablePage/>. Opened from ViewPortfolioLink (Portfolio Posts, Albums,
// Connect discovery cards) and from PostCard's attached-Portfolio card, so
// browsing a creator's Portfolio never navigates away from /connect or
// resets its scroll position (spec §12).
//
// Data comes from the SAME functions Portfolio.tsx itself uses
// (authApi.getUserById / getPortfolioItems / getAlbums / getAlbumItems) --
// no separate copy of Portfolio data (spec §17). Rendering here is its own
// lightweight "discovery" presentation though -- no owner editing/selection
// affordances, since this is never opened by the Portfolio owner managing
// their own work.
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  ArrowLeft, MoreHorizontal, BadgeCheck, Heart, MessageCircle, Send,
  Music2, Link as LinkIcon, FileText, Play, Layers, Clock, ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../lib/api';
import { logProfileEngagement } from '../../lib/profileEngagement';
import { supabase } from '../../../lib/supabase';
import { UserAvatar } from '../AccountTypeBadge';
import { DraggablePage } from '../DraggablePage';
import { ConnectFlowSheet } from '../ConnectFlowSheet';
import { BottomSheet, SheetAction, SheetCancel } from '../BottomSheet';
import { getConnectionStatus, sendConnectionRequest, type ConnectionStatus } from '../../lib/connectionsApi';
import { PortfolioCommentSheet } from '../PortfolioCommentSheet';
import { getPortfolioMediaAspectRatio } from '../PortfolioMedia';
import {
  getPortfolioItems, getAlbums, getAlbumItems,
  isItemLiked, toggleItemLike, incrementItemView, logPortfolioEngagementEvent,
  isAlbumLiked, toggleAlbumLike,
  type PortfolioItem, type PortfolioAlbum,
} from '../../lib/portfolioApi';
import type { User } from '../../types';

const SNAP_POINTS = [0, 0.7, 1];
const PREVIEW_INDEX = 1;
const TOP_INDEX = 2;

type GridTab = 'all' | 'photos' | 'videos' | 'albums';
const TABS: { id: GridTab; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'photos', label: 'Photos' },
  { id: 'videos', label: 'Videos' }, { id: 'albums', label: 'Albums' },
];

function matchesTab(item: PortfolioItem, tab: GridTab): boolean {
  if (tab === 'all' || tab === 'albums') return true;
  const wt = item.work_type, mt = item.media_type;
  if (tab === 'photos') return wt === 'photo' || (!wt && mt === 'image');
  if (tab === 'videos') return wt === 'video' || wt === 'reel' || (!wt && mt === 'video');
  return true;
}

function tileVisual(item: PortfolioItem) {
  const thumb = item.thumbnail_url || item.media_url;
  const isAudio = item.work_type === 'audio' || item.media_type === 'audio';
  const isLink = item.work_type === 'link' || item.media_type === 'link';
  const isVideo = item.work_type === 'video' || item.work_type === 'reel' || item.media_type === 'video';
  return { thumb, isAudio, isLink, isVideo };
}

// Grid tile -- own item's aspect ratio (getPortfolioMediaAspectRatio), same
// source of truth as everywhere else in the app.
function Tile({ item, onTap }: { item: PortfolioItem; onTap: () => void }) {
  const { thumb, isAudio, isLink, isVideo } = tileVisual(item);
  const ratio = getPortfolioMediaAspectRatio(item);
  return (
    <button onClick={onTap} className="relative block w-full rounded-xl overflow-hidden bg-gray-100" style={{ aspectRatio: ratio }}>
      {thumb && !isAudio && !isLink ? (
        <img src={thumb} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center" style={{ background: isAudio ? 'linear-gradient(135deg,#1e1040,#312e81)' : isLink ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : 'linear-gradient(135deg,#f8fafc,#e2e8f0)' }}>
          {isAudio ? <Music2 className="w-7 h-7 text-purple-300" /> : isLink ? <LinkIcon className="w-7 h-7 text-blue-400" /> : <FileText className="w-7 h-7 text-slate-300" />}
        </div>
      )}
      {isVideo && (
        <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center">
          <Play className="w-3 h-3 text-white fill-white ml-0.5" />
        </div>
      )}
    </button>
  );
}

function AlbumTile({ album, count, onTap }: { album: PortfolioAlbum; count: number; onTap: () => void }) {
  return (
    <button onClick={onTap} className="relative block w-full rounded-xl overflow-hidden bg-gray-100" style={{ aspectRatio: 4 / 5 }}>
      {album.cover_url ? (
        <img src={album.cover_url} alt={album.title} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">🎬</div>
      )}
      <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 text-[10px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded-full">
        <Layers className="w-2.5 h-2.5" /> {count}
      </span>
      <div className="absolute inset-x-0 bottom-0 p-1.5 pointer-events-none" style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.65),transparent)' }}>
        <p className="text-white text-[10px] font-bold truncate">{album.title}</p>
      </div>
    </button>
  );
}

// ── Relationship-aware action button (spec §16) ──────────────────────────
function RelationshipAction({ creatorId, creatorName }: { creatorId: string; creatorName: string }) {
  const navigate = useNavigate();
  const { user: me, showGuestPrompt } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus | 'loading'>('loading');
  const [showFlow, setShowFlow] = useState(false);

  useEffect(() => {
    if (!me) return;
    getConnectionStatus(me.id, creatorId).then(setStatus);
  }, [me?.id, creatorId]);

  const handleMessage = () => {
    if (!me) { navigate('/login'); return; }
    logProfileEngagement(creatorId, 'message', me.id);
    navigate(`/inbox?with=${creatorId}`);
  };
  const sendConnect = async (note?: string) => {
    setShowFlow(false);
    if (!me) return;
    setStatus('pending_sent');
    const ok = await sendConnectionRequest(me.id, creatorId, note);
    if (!ok) setStatus('none');
  };

  if (!me || status === 'loading') return <div className="h-8 w-24" />;

  return (
    <>
      {status === 'connected' ? (
        <button onClick={handleMessage} className="px-4 py-1.5 rounded-full text-xs font-bold bg-gray-900 text-white">Message</button>
      ) : status === 'pending_sent' ? (
        <button disabled className="px-4 py-1.5 rounded-full text-xs font-bold bg-gray-100 text-gray-400 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> Pending
        </button>
      ) : status === 'pending_received' ? (
        <button onClick={() => navigate(`/host/${creatorId}`)} className="px-4 py-1.5 rounded-full text-xs font-bold bg-blue-50 text-blue-600 border border-blue-100">Respond</button>
      ) : (
        <button
          onClick={() => { if (!me) { showGuestPrompt('Create your Filmons account to connect with creators.', 'Sign up to connect'); return; } setShowFlow(true); }}
          className="px-4 py-1.5 rounded-full text-xs font-bold bg-blue-600 text-white"
        >
          Connect
        </button>
      )}
      {showFlow && <ConnectFlowSheet name={creatorName} onSend={sendConnect} onClose={() => setShowFlow(false)} />}
    </>
  );
}

// ── Single-item full-screen viewer (spec §10) ────────────────────────────
function ItemViewer({ items, startIndex, creator, meId, onClose }: {
  items: PortfolioItem[]; startIndex: number; creator: User; meId?: string; onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const item = items[idx];
  const [show, setShow] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const viewedRef = useRef<Set<string>>(new Set());
  const closedRef = useRef(false);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
    window.dispatchEvent(new CustomEvent('filmons:home-bars-hidden', { detail: { hidden: true } }));
    document.body.style.overflow = 'hidden';
    return () => {
      window.dispatchEvent(new CustomEvent('filmons:home-bars-hidden', { detail: { hidden: false } }));
      document.body.style.overflow = '';
    };
  }, []);

  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    setShow(false);
    setTimeout(onClose, 260);
  }, [onClose]);

  useEffect(() => {
    if (!item) return;
    setLikesCount(item.likes_count ?? 0);
    setShowComments(false);
    setLiked(false);
    if (meId) isItemLiked(item.id, meId).then(setLiked);
    if (!viewedRef.current.has(item.id)) {
      viewedRef.current.add(item.id);
      incrementItemView(item.id, item.user_id, meId);
    }
  }, [item?.id]); // eslint-disable-line

  if (!item) return null;
  const { thumb, isAudio, isLink, isVideo } = tileVisual(item);
  const ratio = getPortfolioMediaAspectRatio(item);

  const handleLike = async () => {
    if (!meId) { toast.error('Log in to like this'); return; }
    const next = !liked;
    setLiked(next);
    setLikesCount(c => Math.max(0, c + (next ? 1 : -1)));
    const ok = await toggleItemLike(item.id, meId, liked, item.user_id);
    if (!ok) { setLiked(!next); setLikesCount(c => Math.max(0, c + (next ? -1 : 1))); }
  };
  const handleShare = async () => {
    logPortfolioEngagementEvent(item.user_id, item.id, 'share', meId);
    const url = `${window.location.origin}/portfolio/${item.user_id}`;
    if (navigator.share) { navigator.share({ title: item.title, url }).catch(() => {}); }
    else { await navigator.clipboard.writeText(url); toast.success('Link copied'); }
  };

  return (
    <div
      className="fixed inset-0 z-[85] bg-white flex flex-col"
      style={{ height: '100dvh', transform: show ? 'translateX(0)' : 'translateX(100%)', opacity: show ? 1 : 0, transition: 'transform 300ms cubic-bezier(0.32,0.72,0,1), opacity 300ms ease' }}
    >
      <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-gray-100" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <button onClick={close} className="flex items-center gap-1.5 text-gray-700"><ArrowLeft className="w-5 h-5" /><span className="text-sm font-semibold">Back</span></button>
        {items.length > 1 && <span className="text-xs font-semibold text-gray-400 tabular-nums">{idx + 1} / {items.length}</span>}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Caption above media -- FILMONS universal post-layout rule. */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-2 mb-2">
            <UserAvatar user={{ id: creator.id, name: creator.name, avatar: creator.avatar }} size={32} />
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{creator.name}</p>
              {creator.primaryRole && <p className="text-xs text-gray-400 truncate">{creator.primaryRole}</p>}
            </div>
          </div>
          <h2 className="font-black text-gray-900 text-lg leading-snug">{item.title}</h2>
          {item.description && <p className="text-sm text-gray-600 leading-relaxed mt-1.5">{item.description}</p>}
        </div>

        <div className="px-4">
          {isVideo && item.media_url ? (
            <video src={item.media_url} controls playsInline className="w-full rounded-2xl bg-black" style={{ aspectRatio: ratio, maxHeight: '70vh' }} />
          ) : isAudio && item.media_url ? (
            <div className="w-full rounded-2xl flex flex-col items-center gap-4 py-8" style={{ background: 'linear-gradient(135deg,#1e1040,#312e81)' }}>
              <Music2 className="w-12 h-12 text-white/70" />
              <audio controls src={item.media_url} className="w-4/5" />
            </div>
          ) : isLink ? (
            <div className="w-full rounded-2xl bg-blue-50 flex flex-col items-center gap-3 py-10">
              <LinkIcon className="w-10 h-10 text-blue-400" />
              {item.external_link && (
                <a href={item.external_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-600">
                  Open Link <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          ) : thumb ? (
            <img src={thumb} alt={item.title} className="w-full rounded-2xl object-contain bg-gray-100" style={{ aspectRatio: ratio, maxHeight: '75vh' }} />
          ) : null}
        </div>

        <div className="flex items-center gap-5 px-4 py-4 mt-2">
          <button onClick={handleLike} className="flex items-center gap-1.5 text-sm text-gray-600">
            <Heart className={`w-5 h-5 ${liked ? 'text-red-500 fill-red-500' : 'text-gray-400'}`} /> {likesCount > 0 ? likesCount : 'Like'}
          </button>
          <button onClick={() => setShowComments(true)} className="flex items-center gap-1.5 text-sm text-gray-600">
            <MessageCircle className="w-5 h-5 text-gray-400" /> {item.comments_count ? item.comments_count : 'Comment'}
          </button>
          <button onClick={handleShare} className="flex items-center gap-1.5 text-sm text-gray-600">
            <Send className="w-5 h-5 text-gray-400" /> Share
          </button>
        </div>
      </div>

      {showComments && (
        <PortfolioCommentSheet itemId={item.id} targetType="item" creatorId={item.user_id} itemCategory={item.category} canModerate={false} onClose={() => setShowComments(false)} />
      )}
    </div>
  );
}

// ── Album full-screen viewer (spec §11) ──────────────────────────────────
function AlbumDetailViewer({ album, items, creator, meId, onOpenItem, onClose }: {
  album: PortfolioAlbum; items: PortfolioItem[]; creator: User; meId?: string;
  onOpenItem: (idx: number) => void; onClose: () => void;
}) {
  const [show, setShow] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(album.likes_count ?? 0);
  const [showComments, setShowComments] = useState(false);
  const closedRef = useRef(false);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
    window.dispatchEvent(new CustomEvent('filmons:home-bars-hidden', { detail: { hidden: true } }));
    document.body.style.overflow = 'hidden';
    if (meId) isAlbumLiked(album.id, meId).then(setLiked);
    return () => {
      window.dispatchEvent(new CustomEvent('filmons:home-bars-hidden', { detail: { hidden: false } }));
      document.body.style.overflow = '';
    };
  }, []); // eslint-disable-line

  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    setShow(false);
    setTimeout(onClose, 260);
  }, [onClose]);

  const handleLike = async () => {
    if (!meId) { toast.error('Log in to like this'); return; }
    const next = !liked;
    setLiked(next);
    setLikesCount(c => Math.max(0, c + (next ? 1 : -1)));
    const ok = await toggleAlbumLike(album.id, meId, liked);
    if (!ok) { setLiked(!next); setLikesCount(c => Math.max(0, c + (next ? -1 : 1))); }
  };
  const handleShare = async () => {
    const url = `${window.location.origin}/portfolio/${creator.id}`;
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); } catch { toast.error('Could not copy link'); }
  };

  return (
    <div
      className="fixed inset-0 z-[85] bg-white flex flex-col"
      style={{ height: '100dvh', transform: show ? 'translateX(0)' : 'translateX(100%)', opacity: show ? 1 : 0, transition: 'transform 300ms cubic-bezier(0.32,0.72,0,1), opacity 300ms ease' }}
    >
      <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-gray-100" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <button onClick={close} className="flex items-center gap-1.5 text-gray-700"><ArrowLeft className="w-5 h-5" /><span className="text-sm font-semibold">Back</span></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <UserAvatar user={{ id: creator.id, name: creator.name, avatar: creator.avatar }} size={32} />
          <p className="text-sm font-bold text-gray-900">{creator.name}</p>
        </div>
        <h2 className="font-black text-gray-900 text-xl leading-snug">{album.title}</h2>
        {album.description && <p className="text-sm text-gray-600 leading-relaxed mt-1.5">{album.description}</p>}
        <p className="text-xs text-gray-400 mt-2 flex items-center gap-1"><Layers className="w-3.5 h-3.5" /> {items.length} item{items.length === 1 ? '' : 's'}</p>

        <div className="grid grid-cols-3 gap-1.5 mt-4">
          {items.map((it, i) => <Tile key={it.id} item={it} onTap={() => onOpenItem(i)} />)}
        </div>

        <div className="flex items-center gap-5 py-5">
          <button onClick={handleLike} className="flex items-center gap-1.5 text-sm text-gray-600">
            <Heart className={`w-5 h-5 ${liked ? 'text-red-500 fill-red-500' : 'text-gray-400'}`} /> {likesCount > 0 ? likesCount : 'Like'}
          </button>
          <button onClick={() => setShowComments(true)} className="flex items-center gap-1.5 text-sm text-gray-600">
            <MessageCircle className="w-5 h-5 text-gray-400" /> {(album.comments_count ?? 0) > 0 ? album.comments_count : 'Comment'}
          </button>
          <button onClick={handleShare} className="flex items-center gap-1.5 text-sm text-gray-600">
            <Send className="w-5 h-5 text-gray-400" /> Share
          </button>
        </div>
      </div>

      {showComments && (
        <PortfolioCommentSheet itemId={album.id} targetType="album" creatorId={creator.id} canModerate={false} onClose={() => setShowComments(false)} />
      )}
    </div>
  );
}

// ── Main draggable Portfolio page ────────────────────────────────────────
export function DraggablePortfolioPage({ creatorId, initialAlbumId, onClose }: {
  creatorId: string;
  /** Jump straight to full screen and open this album -- e.g. tapping an
   * Album card's cover in /connect should open THAT album, not just land
   * on the creator's Portfolio in general. */
  initialAlbumId?: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const isOwn = me?.id === creatorId;

  const [snapIndex, setSnapIndex] = useState(PREVIEW_INDEX);
  const [profile, setProfile] = useState<User | null>(null);
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [albums, setAlbums] = useState<PortfolioAlbum[]>([]);
  const [albumCounts, setAlbumCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<GridTab>('all');
  const [menuOpen, setMenuOpen] = useState(false);

  const [openItem, setOpenItem] = useState<{ items: PortfolioItem[]; index: number } | null>(null);
  const [openAlbum, setOpenAlbum] = useState<{ album: PortfolioAlbum; items: PortfolioItem[] } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // One pushed history entry for the whole overlay (not per snap point --
  // spec §15 explicitly warns against duplicate entries from dragging
  // between 70%/100%), popped on full close so browser/hardware Back
  // collapses the Portfolio instead of leaving /connect.
  useEffect(() => {
    window.history.pushState({ filmonsPortfolioOverlay: true }, '');
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line

  const handleClose = useCallback(() => {
    if (window.history.state?.filmonsPortfolioOverlay) window.history.back();
    else onClose();
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      authApi.getUserById(creatorId),
      getPortfolioItems(creatorId, { includeHidden: isOwn }),
      getAlbums(creatorId),
    ]).then(([p, i, a]) => {
      if (cancelled) return;
      setProfile(p);
      setItems(isOwn ? i : i.filter(it => !it.visibility || it.visibility === 'public'));
      setAlbums(a);
      if (a.length) {
        supabase.from('portfolio_album_items').select('album_id').in('album_id', a.map(x => x.id)).then(({ data }) => {
          if (cancelled) return;
          const counts: Record<string, number> = {};
          (data ?? []).forEach((r: any) => { counts[r.album_id] = (counts[r.album_id] ?? 0) + 1; });
          setAlbumCounts(counts);
        });
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [creatorId, isOwn]);

  const filteredItems = items.filter(i => matchesTab(i, tab));

  const openItemAt = (list: PortfolioItem[], idx: number) => {
    const go = () => setOpenItem({ items: list, index: idx });
    if (snapIndex !== TOP_INDEX) { setSnapIndex(TOP_INDEX); setTimeout(go, 260); } else go();
  };
  const openAlbumTap = async (album: PortfolioAlbum) => {
    const go = async () => setOpenAlbum({ album, items: await getAlbumItems(album.id) });
    if (snapIndex !== TOP_INDEX) { setSnapIndex(TOP_INDEX); setTimeout(go, 260); } else await go();
  };

  const autoOpenedAlbumRef = useRef(false);
  useEffect(() => {
    if (!initialAlbumId || autoOpenedAlbumRef.current || loading) return;
    const target = albums.find(a => a.id === initialAlbumId);
    if (!target) return;
    autoOpenedAlbumRef.current = true;
    setSnapIndex(TOP_INDEX);
    getAlbumItems(target.id).then(albumItems => setOpenAlbum({ album: target, items: albumItems }));
  }, [initialAlbumId, albums, loading]);

  const creatorName = profile?.name ?? '';
  const firstName = creatorName.split(' ')[0];

  return (
    <>
      <DraggablePage
        snapIndex={snapIndex}
        onSnapIndexChange={setSnapIndex}
        onClose={handleClose}
        snapPoints={SNAP_POINTS}
        scrollRef={scrollRef}
        header={({ isTop }) => (
          <div className="px-4">
            {isTop ? (
              <div className="flex items-center justify-between pb-2">
                <button onClick={() => setSnapIndex(PREVIEW_INDEX)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100" onPointerDown={e => e.stopPropagation()}>
                  <ArrowLeft className="w-[18px] h-[18px] text-gray-700" />
                </button>
                <p className="text-sm font-black text-gray-900 truncate">{creatorName}</p>
                <button onClick={() => setMenuOpen(true)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100" onPointerDown={e => e.stopPropagation()}>
                  <MoreHorizontal className="w-[18px] h-[18px] text-gray-700" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 pb-2">
                <UserAvatar user={{ id: creatorId, name: creatorName, avatar: profile?.avatar }} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-black text-gray-900 truncate">{creatorName}</p>
                    {profile?.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 fill-blue-100 shrink-0" />}
                  </div>
                  <p className="text-xs text-gray-400 truncate">
                    {[profile?.primaryRole, profile?.city].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {!isOwn && <div onPointerDown={e => e.stopPropagation()}><RelationshipAction creatorId={creatorId} creatorName={creatorName} /></div>}
                <button onClick={() => setMenuOpen(true)} onPointerDown={e => e.stopPropagation()} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 shrink-0">
                  <MoreHorizontal className="w-[18px] h-[18px] text-gray-400" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1" onPointerDown={e => e.stopPropagation()}>
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${tab === t.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
      >
        {() => (
          <div ref={scrollRef} className="px-4 pt-3 pb-8">
            {loading ? (
              <div className="grid grid-cols-3 gap-1.5">
                {Array.from({ length: 9 }).map((_, i) => <div key={i} className="rounded-xl bg-gray-100 animate-pulse" style={{ aspectRatio: 4 / 5 }} />)}
              </div>
            ) : tab === 'albums' ? (
              albums.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-12">No albums yet</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {albums.map(a => <AlbumTile key={a.id} album={a} count={albumCounts[a.id] ?? 0} onTap={() => openAlbumTap(a)} />)}
                </div>
              )
            ) : filteredItems.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-12">
                {isOwn ? 'Nothing here yet' : `${firstName || 'This creator'} hasn't posted here yet`}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {filteredItems.map((item, i) => <Tile key={item.id} item={item} onTap={() => openItemAt(filteredItems, i)} />)}
              </div>
            )}
          </div>
        )}
      </DraggablePage>

      {profile && openItem && (
        <ItemViewer items={openItem.items} startIndex={openItem.index} creator={profile} meId={me?.id} onClose={() => setOpenItem(null)} />
      )}
      {profile && openAlbum && (
        <AlbumDetailViewer
          album={openAlbum.album} items={openAlbum.items} creator={profile} meId={me?.id}
          onOpenItem={i => setOpenItem({ items: openAlbum.items, index: i })}
          onClose={() => setOpenAlbum(null)}
        />
      )}

      {menuOpen && (
        <BottomSheet onClose={() => setMenuOpen(false)}>
          <div className="py-1">
            <SheetAction icon={ExternalLink} label="View full profile" onClick={() => { setMenuOpen(false); navigate(`/host/${creatorId}`); }} />
            <SheetAction
              icon={Send}
              label="Share this Portfolio"
              onClick={async () => {
                setMenuOpen(false);
                const url = `${window.location.origin}/portfolio/${creatorId}`;
                try { await navigator.clipboard.writeText(url); toast.success('Link copied'); } catch { toast.error('Could not copy link'); }
              }}
            />
          </div>
          <SheetCancel onClick={() => setMenuOpen(false)} />
        </BottomSheet>
      )}
    </>
  );
}
