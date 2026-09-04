import { useNavigate } from 'react-router';
import { X, Search, UserCheck, UserPlus } from 'lucide-react';
import { UserAvatar, AccountTypeBadge } from './AccountTypeBadge';
import { useFollow } from '../context/FollowContext';
import { useState, useEffect, useRef } from 'react';

interface FollowerUser {
  id: string; name: string; username?: string;
  avatar?: string; accountType?: string; bio?: string;
}

interface FollowersModalProps {
  tab: 'followers' | 'following';
  followers: FollowerUser[];
  following: FollowerUser[];
  onClose: () => void;
  onTabChange: (t: 'followers' | 'following') => void;
  currentUserId: string;
}

export function FollowersModal({ tab, followers, following, onClose, onTabChange, currentUserId }: FollowersModalProps) {
  const navigate  = useNavigate();
  const { isFollowing, isPending, follow, unfollow } = useFollow();
  const [search,  setSearch]  = useState('');

  // Slide-in animation state
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 280);
  };

  // Swipe-down-to-dismiss (mobile handle only -- same drag gesture as the
  // shared BottomSheet.tsx and ListingCard.tsx's BottomMenuSheet).
  const [dragY, setDragY] = useState(0);
  const dragging = useRef(false);
  const dragStartY = useRef(0);
  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    dragStartY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const delta = e.clientY - dragStartY.current;
    if (delta > 0) setDragY(delta);
  };
  const endHandleDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragY > 100) { handleClose(); return; }
    setDragY(0);
  };

  const list = tab === 'followers' ? followers : following;
  const filtered = list.filter(u =>
    !search || u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.username?.toLowerCase().includes(search.toLowerCase())
  );

  const handleFollow = (targetId: string) => {
    if (isFollowing(targetId)) unfollow(targetId);
    else follow(targetId);
  };

  // Shared header/search/list content -- rendered inside two different
  // container shells below (mobile bottom sheet vs. desktop right panel)
  // so the two layouts don't duplicate this JSX.
  const content = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="w-8" />
        <div className="flex gap-0">
          {(['followers','following'] as const).map(t => (
            <button key={t} onClick={() => onTabChange(t)}
              className={`px-5 py-2 text-sm font-bold border-b-2 transition-colors capitalize ${
                tab === t ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'
              }`}>
              {t}
            </button>
          ))}
        </div>
        <button onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-gray-50 shrink-0">
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search" className="flex-1 bg-transparent text-sm outline-none text-gray-900" />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            {search ? `No results for "${search}"` : `No ${tab} yet`}
          </div>
        ) : (
          filtered.map(u => {
            const isMe = u.id === currentUserId;
            const following = isFollowing(u.id);
            return (
              <div key={u.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                <button onClick={() => { navigate(`/host/${u.id}`); handleClose(); }}
                  className="shrink-0">
                  <UserAvatar user={u} size={44} />
                </button>
                <button onClick={() => { navigate(`/host/${u.id}`); handleClose(); }}
                  className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-semibold text-sm text-gray-900 truncate">{u.name}</p>
                    <AccountTypeBadge type={u.accountType} size="sm" />
                  </div>
                  {u.username && <p className="text-xs text-gray-400">@{u.username}</p>}
                  {u.bio && <p className="text-xs text-gray-500 truncate mt-0.5">{u.bio}</p>}
                </button>
                {!isMe && (
                  <button onClick={() => handleFollow(u.id)} disabled={isPending(u.id)}
                    className={`shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full transition-all disabled:opacity-60 ${
                      following
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}>
                    {following
                      ? <><UserCheck className="w-3 h-3" /> Following</>
                      : <><UserPlus className="w-3 h-3" /> Follow</>
                    }
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />

      {/* Mobile: bottom sheet sliding up, rounded top corners + drag handle */}
      <div className="lg:hidden fixed inset-0 z-50 flex items-end justify-center pointer-events-none">
        <div
          className="bg-white w-full rounded-t-3xl shadow-2xl flex flex-col pointer-events-auto"
          style={{
            maxHeight: '80vh',
            transform: visible ? `translateY(${dragY}px)` : 'translateY(100%)',
            transition: dragging.current ? 'none' : 'transform 300ms ease-out',
          }}
        >
          {/* Handle -- swipe down to dismiss */}
          <div
            className="flex justify-center pt-3 pb-1 shrink-0 touch-none cursor-grab active:cursor-grabbing"
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={endHandleDrag}
            onPointerCancel={endHandleDrag}
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full" />
          </div>
          {content}
        </div>
      </div>

      {/* Desktop: right side panel, sliding in from the right -- more room
          for usernames/avatars/follow buttons/search than a centered
          modal, per the FILMONS desktop panel spec. */}
      <div className="hidden lg:flex fixed inset-y-0 right-0 z-50 pointer-events-none">
        <div
          className="bg-white w-full max-w-sm h-full shadow-2xl flex flex-col pointer-events-auto"
          style={{
            transform: visible ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 260ms ease-out',
          }}
        >
          {content}
        </div>
      </div>
    </>
  );
}
