import { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { socialApi } from '../lib/api';
import { UserAvatar } from './AccountTypeBadge';

interface LikeUser {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
  accountType?: string;
}

interface Props {
  postId:   string;
  likeIds:  string[];   // user IDs who liked
  onClose:  () => void;
}

export function LikesSheet({ postId, likeIds, onClose }: Props) {
  const navigate         = useNavigate();
  const { user }         = useAuth();
  const [users,  setUsers]  = useState<LikeUser[]>([]);
  const [query,  setQuery]  = useState('');
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState<Set<string>>(new Set(user?.following || []));

  useEffect(() => {
    const load = async () => {
      try {
        const idSet = new Set<string>(likeIds);

        // Also fetch from post_likes table (authoritative)
        const { data: plRows } = await supabase
          .from('post_likes').select('user_id').eq('post_id', postId);
        (plRows ?? []).forEach((r: any) => idSet.add(r.user_id));

        // Fallback: metadata.likes on posts table
        if (idSet.size === 0) {
          const { data: postRow } = await supabase
            .from('posts').select('metadata').eq('id', postId).single();
          const meta = postRow?.metadata ?? {};
          const ml: string[] = Array.isArray(meta.likes) ? meta.likes : [];
          ml.forEach((id: string) => idSet.add(id));
        }

        const ids = [...idSet].filter(Boolean).slice(0, 100);
        if (!ids.length) return;

        const { data } = await supabase
          .from('profiles')
          .select('id, name, username, avatar_url, account_type')
          .in('id', ids);
        setUsers((data || []).map((p: any) => ({
          id:          p.id,
          name:        p.name || p.username || 'User',
          username:    p.username,
          avatar:      p.avatar_url,
          accountType: p.account_type,
        })));
      } catch {}
      setLoading(false);
    };
    load();
  }, [postId]);  // eslint-disable-line

  const filtered = query.trim()
    ? users.filter(u =>
        u.name.toLowerCase().includes(query.toLowerCase()) ||
        u.username?.toLowerCase().includes(query.toLowerCase())
      )
    : users;

  const handleFollow = async (targetId: string) => {
    try {
      await socialApi.follow(targetId);
      setFollowing(prev => new Set([...prev, targetId]));
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end" onClick={onClose}>
      <div
        className="w-full bg-white rounded-t-2xl shadow-xl flex flex-col"
        style={{ maxHeight: '80vh', animation: 'likesSlideUp 0.28s cubic-bezier(0.4,0,0.2,1)' }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`@keyframes likesSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>

        {/* Handle */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1 shrink-0"/>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 shrink-0">
          <p className="text-sm font-bold text-gray-900">
            {loading ? '…' : users.length.toLocaleString()} {users.length === 1 ? 'like' : 'likes'}
          </p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500"/>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-gray-50 shrink-0">
          <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-gray-400 shrink-0"/>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search"
              className="flex-1 text-sm bg-transparent outline-none text-gray-900 placeholder-gray-400"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-12">
              {query ? 'No results' : 'No likes yet'}
            </p>
          ) : (
            filtered.map(u => {
              const isMe        = u.id === user?.id;
              const isFollowing = following.has(u.id);
              return (
                <div key={u.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0"
                  onClick={() => { onClose(); navigate(`/host/${u.id}`); }}
                >
                  <UserAvatar user={u as any} size={44}/>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{u.name}</p>
                    {u.username && <p className="text-xs text-gray-400 truncate">@{u.username}</p>}
                  </div>
                  {!isMe && (
                    <button
                      onClick={e => { e.stopPropagation(); if (!isFollowing) handleFollow(u.id); }}
                      className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full transition-all ${
                        isFollowing
                          ? 'bg-gray-100 text-gray-500'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {isFollowing ? 'Following' : 'Follow'}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
