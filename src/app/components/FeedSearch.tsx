import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router';
import Fuse from 'fuse.js';
import {
  Search, X, User, Hash, FileText, ArrowLeft,
  Loader2, TrendingUp, Sparkles,
} from 'lucide-react';
import { UserAvatar, AccountTypeBadge } from './AccountTypeBadge';
import { postsApi, authApi } from '../lib/api';
import { Post } from '../types';

type Tab = 'all' | 'profiles' | 'posts' | 'hashtags';

// ── Hashtag extraction ─────────────────────────────────────────────────────
function extractHashtags(posts: Post[]): { tag: string; count: number; posts: Post[] }[] {
  const map: Record<string, { count: number; posts: Post[] }> = {};
  posts.forEach(p => {
    const matches: string[] = (p.content || '').match(/#\w+/g) || [];
    matches.forEach((h: string) => {
      const t = h.slice(1).toLowerCase();
      if (!map[t]) map[t] = { count: 0, posts: [] };
      map[t].count++;
      map[t].posts.push(p);
    });
  });
  return Object.entries(map)
    .map(([tag, { count, posts }]) => ({ tag, count, posts }))
    .sort((a, b) => b.count - a.count);
}

// ── Highlight matching text ────────────────────────────────────────────────
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-blue-100 text-blue-800 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

interface FeedSearchProps {
  onClose: () => void;
}

export function FeedSearch({ onClose }: FeedSearchProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery]       = useState('');
  const [tab, setTab]           = useState<Tab>('all');
  const [loading, setLoading]   = useState(true);

  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allPosts, setAllPosts] = useState<Post[]>([]);

  // ── Load data from server ────────────────────────────────────────────────
  useEffect(() => {
    inputRef.current?.focus();
    document.body.style.overflow = 'hidden';

    let cancelled = false;
    (async () => {
      try {
        const [users, posts] = await Promise.all([
          authApi.getAllUsers(),
          postsApi.getAll(),
        ]);
        if (!cancelled) { setAllUsers(users); setAllPosts(posts); }
      } catch (e) {
        console.error('Search load error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      document.body.style.overflow = '';
    };
  }, []);

  const allHashtags = useMemo(() => extractHashtags(allPosts), [allPosts]);

  // ── Fuse.js instances ────────────────────────────────────────────────────
  const fuseUsers = useMemo(() => new Fuse(allUsers, {
    keys: [
      { name: 'name',           weight: 3 },
      { name: 'username',       weight: 2.5 },
      { name: 'accountCategory', weight: 1.5 },
      { name: 'bio',            weight: 1 },
      { name: 'location',       weight: 0.8 },
    ],
    threshold: 0.38,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  }), [allUsers]);

  const fusePosts = useMemo(() => new Fuse(allPosts, {
    keys: [
      { name: 'content',   weight: 3 },
      { name: 'userName',  weight: 1.5 },
    ],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  }), [allPosts]);

  const fuseTags = useMemo(() => new Fuse(allHashtags, {
    keys: [{ name: 'tag', weight: 1 }],
    threshold: 0.35,
    includeScore: true,
    minMatchCharLength: 1,
  }), [allHashtags]);

  // ── Computed results ─────────────────────────────────────────────────────
  const q = query.trim();
  const tagQuery = q.startsWith('#') ? q.slice(1) : q;

  const profiles = useMemo(() => {
    if (!q) return allUsers.slice(0, 12);
    return fuseUsers.search(q).slice(0, 20).map(r => r.item);
  }, [q, fuseUsers, allUsers]);

  const posts = useMemo(() => {
    if (!q) return allPosts.slice(0, 10);
    return fusePosts.search(q).slice(0, 15).map(r => r.item);
  }, [q, fusePosts, allPosts]);

  const hashtags = useMemo(() => {
    if (!tagQuery) return allHashtags.slice(0, 24);
    return fuseTags.search(tagQuery).slice(0, 20).map(r => r.item);
  }, [tagQuery, fuseTags, allHashtags]);

  // ── "All" tab combined results ────────────────────────────────────────────
  const topProfiles = profiles.slice(0, 4);
  const topPosts    = posts.slice(0, 3);
  const topTags     = hashtags.slice(0, 5);
  const hasAny      = topProfiles.length + topPosts.length + topTags.length > 0;

  const TABS: { key: Tab; label: string; icon: typeof Search; count: number }[] = [
    { key: 'all',      label: 'All',      icon: Sparkles, count: profiles.length + posts.length + hashtags.length },
    { key: 'profiles', label: 'People',   icon: User,     count: profiles.length  },
    { key: 'posts',    label: 'Posts',    icon: FileText, count: posts.length     },
    { key: 'hashtags', label: 'Hashtags', icon: Hash,     count: hashtags.length  },
  ];

  const goProfile = (uid: string) => { onClose(); navigate(`/host/${uid}`); };

  // ── timeAgo ───────────────────────────────────────────────────────────────
  function timeAgo(d: string) {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger slide-in on mount
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  return (
    <>
      <style>{`
        @keyframes fsSlideIn { from { transform:translateX(100%); } to { transform:translateX(0); } }
        @keyframes fsSlideOut { from { transform:translateX(0); } to { transform:translateX(100%); } }
      `}</style>
    <div className="fixed inset-0 z-50 bg-white flex flex-col"
      style={{
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: visible
          ? 'transform 0.32s cubic-bezier(0.32,0.72,0,1)'
          : 'transform 0.26s cubic-bezier(0.4,0,1,1)',
      }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0 pt-12">
        <button
          onClick={handleClose}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 flex items-center gap-2.5 bg-gray-100 rounded-2xl px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search people, posts, #hashtags…"
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
          />
          {loading && <Loader2 className="w-4 h-4 text-gray-300 animate-spin shrink-0" />}
          {query && !loading && (
            <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600 shrink-0">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-100 shrink-0 bg-white overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 min-w-[72px] flex flex-col items-center py-2.5 gap-0.5 transition-colors border-b-2 ${
              tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
            {q && <span className={`text-[10px] font-semibold ${tab === key ? 'text-blue-500' : 'text-gray-400'}`}>{count}</span>}
          </button>
        ))}
      </div>

      {/* ── Results ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <p className="text-sm text-gray-400">Loading from database…</p>
          </div>
        ) : (

          <>
            {/* ── ALL tab ── */}
            {tab === 'all' && (
              <div>
                {!hasAny && q && (
                  <EmptyState icon={Search} label="No results found" hint={`Nothing matched "${q}"`} />
                )}
                {!q && (
                  <div className="px-4 pt-4 pb-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" /> Trending on Filmons
                    </p>
                  </div>
                )}

                {/* Top people */}
                {topProfiles.length > 0 && (
                  <section className="mb-1">
                    <div className="flex items-center justify-between px-4 py-2">
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">People</p>
                      {profiles.length > 4 && (
                        <button onClick={() => setTab('profiles')} className="text-xs text-blue-500 font-semibold hover:text-blue-700">
                          See all {profiles.length}
                        </button>
                      )}
                    </div>
                    {topProfiles.map(u => <ProfileRow key={u.id} user={u} query={q} onClick={() => goProfile(u.id)} />)}
                  </section>
                )}

                {/* Top posts */}
                {topPosts.length > 0 && (
                  <section className="mb-1">
                    <div className="flex items-center justify-between px-4 py-2">
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Posts</p>
                      {posts.length > 3 && (
                        <button onClick={() => setTab('posts')} className="text-xs text-blue-500 font-semibold hover:text-blue-700">
                          See all {posts.length}
                        </button>
                      )}
                    </div>
                    {topPosts.map(p => <PostRow key={p.id} post={p} query={q} timeAgo={timeAgo} />)}
                  </section>
                )}

                {/* Top hashtags */}
                {topTags.length > 0 && (
                  <section className="mb-2">
                    <div className="flex items-center justify-between px-4 py-2">
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Hashtags</p>
                      {hashtags.length > 5 && (
                        <button onClick={() => setTab('hashtags')} className="text-xs text-blue-500 font-semibold hover:text-blue-700">
                          See all {hashtags.length}
                        </button>
                      )}
                    </div>
                    <div className="px-4 flex flex-wrap gap-2 pb-4">
                      {topTags.map(({ tag, count }, i) => (
                        <button
                          key={tag}
                          onClick={() => { setQuery(`#${tag}`); setTab('hashtags'); }}
                          className="flex items-center gap-1.5 bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-gray-700 rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
                        >
                          <Hash className="w-3.5 h-3.5" />#{tag}
                          <span className="text-[11px] text-gray-400 ml-0.5">{count}</span>
                          {i < 3 && <span className="text-[10px] font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full ml-1">🔥</span>}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* ── PROFILES tab ── */}
            {tab === 'profiles' && (
              <div>
                {profiles.length === 0 ? (
                  <EmptyState icon={User} label="No people found" hint="Try a different name or @handle" />
                ) : (
                  profiles.map(u => <ProfileRow key={u.id} user={u} query={q} onClick={() => goProfile(u.id)} />)
                )}
              </div>
            )}

            {/* ── POSTS tab ── */}
            {tab === 'posts' && (
              <div>
                {posts.length === 0 ? (
                  <EmptyState icon={FileText} label="No posts found" hint="Try different keywords" />
                ) : (
                  posts.map(p => <PostRow key={p.id} post={p} query={q} timeAgo={timeAgo} />)
                )}
              </div>
            )}

            {/* ── HASHTAGS tab ── */}
            {tab === 'hashtags' && (
              <div className="p-4 space-y-2">
                {hashtags.length === 0 ? (
                  <EmptyState icon={Hash} label="No hashtags found" hint="Hashtags appear in posts" />
                ) : (
                  hashtags.map(({ tag, count, posts: tagPosts }, i) => (
                    <button
                      key={tag}
                      onClick={() => { setQuery(`#${tag}`); }}
                      className="w-full flex items-center gap-3 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 rounded-2xl px-4 py-3 transition-all text-left"
                    >
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl flex items-center justify-center shrink-0">
                        <Hash className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900">
                          #<Highlight text={tag} query={tagQuery} />
                        </p>
                        <p className="text-xs text-gray-400">
                          {count} post{count !== 1 ? 's' : ''}
                          {tagPosts[0] && ` · Last: ${timeAgo(tagPosts[0].createdAt)}`}
                        </p>
                      </div>
                      {i < 3 && (
                        <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full shrink-0">
                          🔥 Trending
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ProfileRow({ user, query, onClick }: { user: any; query: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 text-left"
    >
      <UserAvatar user={user} size={44} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-gray-900 truncate">
            <Highlight text={user.name || ''} query={query} />
          </p>
          {user.isVerified && <span className="text-[11px] text-blue-600 font-bold shrink-0">✓</span>}
        </div>
        {user.username && (
          <p className="text-xs text-gray-400">
            @<Highlight text={user.username} query={query} />
          </p>
        )}
        {user.bio && (
          <p className="text-xs text-gray-500 truncate mt-0.5">{user.bio}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        {user.accountType && (
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
            user.accountType === 'service'  ? 'bg-purple-100 text-purple-700' :
            user.accountType === 'business' ? 'bg-emerald-100 text-emerald-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {user.accountType === 'renter' ? 'Creator' : user.accountType}
          </span>
        )}
        <p className="text-[10px] text-gray-400 mt-1">{(user.followers || []).length} followers</p>
      </div>
    </button>
  );
}

function PostRow({ post, query, timeAgo }: { post: Post; query: string; timeAgo: (d: string) => string }) {
  const safeImgs = Array.isArray(post.images) ? post.images : (typeof post.images === 'string' && post.images ? [post.images] : []);
  const hasImg = safeImgs.length > 0;
  const hasVid = (post.videos?.length ?? 0) > 0;

  return (
    <div className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-2 mb-1.5">
        <UserAvatar
          user={{ name: post.userName, avatar: post.userAvatar, id: post.userId }}
          size={26}
        />
        <div>
          <p className="text-xs font-semibold text-gray-800 leading-tight">
            <Highlight text={post.userName || 'Unknown'} query={query} />
          </p>
          <p className="text-[10px] text-gray-400">{timeAgo(post.createdAt)}</p>
        </div>
      </div>
      {post.content && (
        <p className="text-sm text-gray-700 line-clamp-2 leading-relaxed">
          <Highlight text={post.content} query={query} />
        </p>
      )}
      {hasImg && (
        <img
          src={safeImgs[0]}
          alt=""
          className="mt-2 w-full h-28 object-cover rounded-xl"
        />
      )}
      {!hasImg && hasVid && (
        <div className="mt-2 w-full h-20 bg-gray-900 rounded-xl flex items-center justify-center">
          <span className="text-white text-xs">🎬 Video</span>
        </div>
      )}
      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
        <span>❤️ {(post.likes || []).length}</span>
        {safeImgs.length > 1 && <span>📷 {safeImgs.length}</span>}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, label, hint }: { icon: typeof Search; label: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-gray-300" />
      </div>
      <p className="text-gray-400 text-sm font-medium">{label}</p>
      {hint && <p className="text-gray-300 text-xs mt-1">{hint}</p>}
    </div>
  );
}