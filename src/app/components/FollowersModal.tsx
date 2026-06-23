import { useNavigate } from 'react-router';
import { X, Search, UserCheck, UserPlus } from 'lucide-react';
import { UserAvatar } from './AccountTypeBadge';
import { socialApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';
import { toast } from 'sonner';

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
  const { user }  = useAuth();
  const [search,  setSearch]  = useState('');
  const [followed, setFollowed] = useState<Set<string>>(
    new Set(user?.following || [])
  );

  const list = tab === 'followers' ? followers : following;
  const filtered = list.filter(u =>
    !search || u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.username?.toLowerCase().includes(search.toLowerCase())
  );

  const handleFollow = async (targetId: string) => {
    try {
      if (followed.has(targetId)) {
        await socialApi.unfollow(targetId);
        setFollowed(prev => { const s = new Set(prev); s.delete(targetId); return s; });
      } else {
        await socialApi.follow(targetId);
        setFollowed(prev => new Set([...prev, targetId]));
      }
    } catch { toast.error('Could not update follow'); }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
        <div className="bg-white w-full md:max-w-sm md:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col"
          style={{ maxHeight: '80vh' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="w-8" />
            {/* Tabs */}
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
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Search */}
          <div className="px-4 py-3 border-b border-gray-50">
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
                const isFollowing = followed.has(u.id);
                return (
                  <div key={u.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                    {/* Avatar */}
                    <button onClick={() => { navigate(`/host/${u.id}`); onClose(); }}
                      className="shrink-0">
                      <UserAvatar user={u} size={44} />
                    </button>

                    {/* Info */}
                    <button onClick={() => { navigate(`/host/${u.id}`); onClose(); }}
                      className="flex-1 text-left min-w-0">
                      <p className="font-semibold text-sm text-gray-900 truncate">{u.name}</p>
                      {u.username && <p className="text-xs text-gray-400">@{u.username}</p>}
                      {u.bio && <p className="text-xs text-gray-500 truncate mt-0.5">{u.bio}</p>}
                    </button>

                    {/* Follow button — not for yourself */}
                    {!isMe && (
                      <button onClick={() => handleFollow(u.id)}
                        className={`shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full transition-all ${
                          isFollowing
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}>
                        {isFollowing
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
        </div>
      </div>
    </>
  );
}