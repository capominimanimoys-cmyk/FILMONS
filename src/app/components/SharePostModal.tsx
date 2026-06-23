import { useState, useMemo, useEffect } from 'react';
import { X, Search, Send, Check, Copy, Link2, Share2 } from 'lucide-react';
import { Post, User } from '../types';
import { authApi, chatApi } from '../lib/api';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { UserAvatar } from './AccountTypeBadge';
import { toast } from 'sonner';

const PLATFORMS = [
  { id: 'whatsapp', label: 'WhatsApp', bg: 'bg-[#25D366]', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>, getUrl: (u: string, t: string) => `https://wa.me/?text=${encodeURIComponent(t+'\n'+u)}` },
  { id: 'telegram', label: 'Telegram', bg: 'bg-[#2AABEE]', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>, getUrl: (u: string, t: string) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { id: 'twitter', label: 'X', bg: 'bg-black', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>, getUrl: (u: string, t: string) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { id: 'facebook', label: 'Facebook', bg: 'bg-[#1877F2]', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>, getUrl: (u: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { id: 'linkedin', label: 'LinkedIn', bg: 'bg-[#0A66C2]', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>, getUrl: (u: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}` },
  { id: 'gmail', label: 'Gmail', bg: 'bg-[#EA4335]', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.907 1.528-1.147C21.69 2.28 24 3.434 24 5.457z"/></svg>, getUrl: (u: string, t: string) => `https://mail.google.com/mail/?view=cm&su=${encodeURIComponent('Check this out on Filmons')}&body=${encodeURIComponent(t+'\n\n'+u)}` },
  { id: 'messenger', label: 'Messenger', bg: 'bg-[#0084FF]', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.654V24l4.088-2.242c1.092.3 2.246.464 3.443.464 6.627 0 12-4.975 12-11.111S18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8.1l3.131 3.26L19.752 8.1l-6.561 6.863z"/></svg>, getUrl: (u: string) => `https://www.facebook.com/dialog/send?link=${encodeURIComponent(u)}&redirect_uri=${encodeURIComponent(u)}` },
  { id: 'instagram', label: 'Instagram', bg: 'bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737]', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>, getUrl: () => 'https://www.instagram.com/', note: 'Copy link then share' },
  { id: 'snapchat', label: 'Snapchat', bg: 'bg-[#FFFC00]', icon: <svg viewBox="0 0 24 24" className="w-5 h-5 fill-black"><path d="M12.065.025c.88-.006 3.812.258 5.265 3.117.442.867.374 2.34.327 3.375l-.007.132c-.007.15-.007.293-.007.432a.4.4 0 00.22.046c.283-.045.627-.154 1.073-.302.193-.064.4-.134.626-.196.155-.041.315-.06.468-.052.338.018.653.14.884.345.226.2.343.455.327.713a.785.785 0 01-.286.556c-.143.128-.316.224-.507.32-.042.022-.087.045-.134.067-.252.127-.641.323-.82.656a.68.68 0 00-.05.5c.07.26.282.43.4.522.047.036.084.065.113.09.604.547 1.583 1.435 1.563 2.566-.01.66-.357 1.282-.992 1.758-.386.29-.83.5-1.388.68-.161.052-.26.146-.305.292-.057.188-.035.45.055.815.107.443.29.889.508 1.207.094.14.198.258.302.367.052.054.104.107.154.164.17.194.253.429.23.663-.059.591-.633.898-1.174 1.022-.288.066-.6.1-.928.1-.265 0-.52-.02-.775-.04a4.58 4.58 0 00-.57-.027c-.18 0-.352.016-.508.031-.192.02-.392.041-.6.04-.49-.008-.95-.132-1.363-.368-.375-.215-.698-.512-1.023-.81-.123-.112-.248-.226-.377-.337a.963.963 0 00-.614-.232.955.955 0 00-.614.232c-.129.111-.254.225-.377.337-.325.298-.648.595-1.023.81-.413.236-.873.36-1.363.368-.208.001-.408-.02-.6-.04-.156-.015-.328-.031-.508-.031-.19 0-.385.01-.57.027-.255.02-.51.04-.775.04-.328 0-.64-.034-.928-.1-.541-.124-1.115-.43-1.174-1.022a.836.836 0 01.23-.663c.05-.057.102-.11.154-.164.104-.109.208-.227.302-.367.218-.318.401-.764.508-1.207.09-.365.112-.627.055-.815-.045-.146-.144-.24-.305-.292-.558-.18-1.002-.39-1.388-.68-.635-.476-.982-1.098-.992-1.758-.02-1.131.959-2.019 1.563-2.566.029-.025.066-.054.113-.09.118-.092.33-.262.4-.522a.68.68 0 00-.05-.5c-.179-.333-.568-.529-.82-.656-.047-.022-.092-.045-.134-.067-.191-.096-.364-.192-.507-.32a.785.785 0 01-.286-.556c-.016-.258.101-.513.327-.713.231-.205.546-.327.884-.345.153-.008.313.011.468.052.226.062.433.132.626.196.446.148.79.257 1.073.302a.4.4 0 00.22-.046c0-.139 0-.282-.007-.432l-.007-.132c-.047-1.035-.115-2.508.327-3.375C8.253.283 11.185.031 12.065.025z"/></svg>, getUrl: (u: string) => `https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(u)}` },
];

interface Props { post: Post; onClose: () => void; }

export function SharePostModal({ post: rawPost, onClose }: Props) {
  const { user } = useAuth();
  // Normalize media fields — Supabase may return PG array strings instead of JS arrays
  const _a = (v: any): string[] => Array.isArray(v) ? v : (typeof v === 'string' && v ? [v] : []);
  const post: Post = { ...rawPost, images: _a(rawPost.images) as any, videos: _a(rawPost.videos) as any };

  // ── State ──────────────────────────────────────────────────────────────────
  const [visible, setVisible]               = useState(false);
  const [tab, setTab]                       = useState<'share' | 'dm'>('share');
  const [search, setSearch]                 = useState('');
  const [caption, setCaption]               = useState('');
  const [sending, setSending]               = useState(false);
  const [sent, setSent]                     = useState(false);
  const [copied, setCopied]                 = useState(false);
  const [extraUsers, setExtraUsers]         = useState<User[]>([]);
  const [selectedIds, setSelectedIds]       = useState<Set<string>>(new Set());

  // ── Slide-in animation ─────────────────────────────────────────────────────
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  // ── Fetch following users not in cache ────────────────────────────────────
  useEffect(() => {
    if (!user?.following) return;
    // Guard: following may be a Postgres array string if session was saved before fix
    const followingIds: string[] = Array.isArray(user.following)
      ? user.following
      : typeof user.following === 'string' && (user.following as string).startsWith('{')
        ? (user.following as string).slice(1, -1).split(',').map((s: string) => s.trim()).filter(Boolean)
        : [];
    if (!followingIds.length) return;
    const cache: Record<string, User> = (() => {
      try { return JSON.parse(localStorage.getItem('filmons_users_cache') || '{}'); } catch { return {}; }
    })();
    const missing = followingIds.filter(id => !cache[id]);
    if (!missing.length) return;
    Promise.allSettled(missing.map(id => authApi.getUserById(id)))
      .then(results => {
        const fetched = results
          .filter((r): r is PromiseFulfilledResult<User> => r.status === 'fulfilled' && !!r.value)
          .map(r => r.value);
        if (fetched.length) {
          const updated = { ...cache };
          fetched.forEach(u => { updated[u.id] = u; });
          localStorage.setItem('filmons_users_cache', JSON.stringify(updated));
          setExtraUsers(fetched);
        }
      });
  }, [user?.id]);

  // ── User list (following first) ───────────────────────────────────────────
  const allUsers = useMemo<User[]>(() => {
    const cache: Record<string, User> = (() => {
      try { return JSON.parse(localStorage.getItem('filmons_users_cache') || '{}'); } catch { return {}; }
    })();
    const merged: Record<string, User> = { ...cache };
    extraUsers.forEach(u => { merged[u.id] = u; });
    const all = Object.values(merged).filter(u => u.id !== user?.id);
    const followingSet = new Set(user?.following || []);
    return [
      ...all.filter(u => followingSet.has(u.id)),
      ...all.filter(u => !followingSet.has(u.id)),
    ];
  }, [user?.id, user?.following, extraUsers]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return allUsers;
    const q = search.toLowerCase();
    return allUsers.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q)
    );
  }, [allUsers, search]);

  // ── Share helpers ─────────────────────────────────────────────────────────
  const postUrl   = `${window.location.origin}/post/${post.id}`;
  const shareText = post.content
    ? `${post.content.slice(0, 100)}${post.content.length > 100 ? '…' : ''} — posted on Filmons`
    : 'Check out this post on Filmons';

  const handleCopyLink = async () => {
    try { await navigator.clipboard.writeText(postUrl); setCopied(true); toast.success('Link copied!'); setTimeout(() => setCopied(false), 2000); }
    catch { toast.error('Could not copy link'); }
  };

  const handlePlatformShare = (p: typeof PLATFORMS[0]) => {
    window.open(p.getUrl(postUrl, shareText), '_blank', 'noopener,noreferrer,width=600,height=500');
    if (p.note) toast.info(p.note);
  };

  // ── Send DM ───────────────────────────────────────────────────────────────
  const toggleUser = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleSendDM = () => {
    if (!user || selectedIds.size === 0) return;
    setSending(true);
    setSent(true);
    toast.success(
      selectedIds.size > 1 ? `Post shared with ${selectedIds.size} people!` : 'Post shared!',
      { description: 'Check your inbox.' }
    );
    setTimeout(handleClose, 1200);

    Promise.allSettled(
      [...selectedIds].map(async recipientId => {
        const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        // Use RPC — fastest path, single DB call
        const { data: convId, error: rpcErr } = await supabase.rpc(
          'get_or_create_direct_conversation',
          { p_user1_id: user.id, p_user2_id: recipientId }
        );
        if (rpcErr || !convId) throw new Error(rpcErr?.message || 'No conv ID');

        const finalConvId = String(convId);
        console.log('[share] conv:', finalConvId);

        // Insert message
        const { error: msgErr } = await supabase.from('messages').insert({
          id:              msgId,
          conversation_id: finalConvId,
          sender_id:       user.id,
          sender_name:     user.name || null,
          sender_avatar:   user.avatar || null,
          content:         caption.trim() || null,
          type:            'post',
          metadata: {
            senderName:   user.name   || null,
            senderAvatar: user.avatar || null,
            sharedPost:   post,
            read:         false,
          },
          is_deleted: false,
          is_pinned:  false,
        });

        if (msgErr) { console.error('[share] msg error:', msgErr.code, msgErr.message); throw new Error(msgErr.message); }
        console.log('[share] saved:', msgId);
      })
    ).then(results => {
      const failed = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
      if (failed.length > 0) {
        const errMsg = (failed[0] as PromiseRejectedResult).reason?.message || 'unknown';
        console.error('[share] failed:', errMsg);
        toast.error(`Share failed: ${errMsg}`);
      }
    }).finally(() => setSending(false));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-white rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out"
        style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-bold text-gray-900">Share Post</h2>
          <button onClick={handleClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Post preview */}
        <div className="mx-5 mt-3 p-3 bg-gray-50 rounded-xl border border-gray-100 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <UserAvatar user={{ name: post.userName, avatar: post.userAvatar, id: post.userId }} size={20} />
            <span className="text-xs font-semibold text-gray-700">{post.userName}</span>
          </div>
          {post.content && <p className="text-xs text-gray-600 line-clamp-2">{post.content}</p>}
          {post.images?.[0] && <img src={post.images[0]} alt="" className="mt-1.5 w-full h-12 object-cover rounded-lg" />}
        </div>

        {/* Tabs */}
        <div className="flex mx-5 mt-3 bg-gray-100 rounded-xl p-1 gap-1 shrink-0">
          {[{ key: 'share', label: 'Share' }, { key: 'dm', label: 'Send as DM' }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Share tab ── */}
        {tab === 'share' && (
          <div className="overflow-y-auto flex-1 px-5 pb-8">
            <div className="mt-3 flex gap-2">
              <button onClick={handleCopyLink}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${copied ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50'}`}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
              {navigator.share && (
                <button onClick={() => navigator.share({ title: 'Filmons Post', text: shareText, url: postUrl }).catch(() => {})}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-blue-500 bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 transition-all">
                  <Share2 className="w-4 h-4" /> Share
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl">
              <Link2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="text-xs text-gray-400 truncate">{postUrl}</span>
            </div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mt-4 mb-3">Share to</p>
            <div className="grid grid-cols-5 gap-3">
              {PLATFORMS.map(p => (
                <button key={p.id} onClick={() => handlePlatformShare(p)} className="flex flex-col items-center gap-1.5 group">
                  <div className={`w-11 h-11 rounded-2xl ${p.bg} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform`}>{p.icon}</div>
                  <span className="text-[10px] font-medium text-gray-500 text-center leading-tight">{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── DM tab ── */}
        {tab === 'dm' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-5 pt-3 shrink-0">
              <input type="text" placeholder="Add a message… (optional)" value={caption} onChange={e => setCaption(e.target.value)}
                className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-400 transition-colors" />
            </div>
            <div className="px-5 mt-2 shrink-0 relative">
              <Search className="absolute left-8 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search people…" value={search} onChange={e => setSearch(e.target.value)}
                className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:border-blue-400 transition-colors" />
            </div>

            {/* Selected count */}
            {selectedIds.size > 0 && (
              <div className="px-5 mt-2 shrink-0">
                <p className="text-xs text-blue-600 font-semibold">{selectedIds.size} selected</p>
              </div>
            )}

            {/* User list */}
            <div className="flex-1 overflow-y-auto px-5 mt-2 pb-2">
              {filteredUsers.length === 0
                ? <p className="text-sm text-gray-400 text-center py-6">
                    {!user?.following?.length ? 'Follow people to send them posts' : 'No users found'}
                  </p>
                : filteredUsers.map(u => (
                  <button key={u.id} onClick={() => toggleUser(u.id)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all mb-1 ${selectedIds.has(u.id) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}>
                    <UserAvatar user={u} size={38} />
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{u.name || u.username}</p>
                      {u.username && <p className="text-xs text-gray-400">@{u.username}</p>}
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedIds.has(u.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                      {selectedIds.has(u.id) && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                ))
              }
            </div>

            {/* Send button */}
            <div className="px-5 py-4 border-t border-gray-100 shrink-0">
              <button onClick={handleSendDM} disabled={selectedIds.size === 0 || sending || sent}
                className={`w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                  sent            ? 'bg-green-500 text-white' :
                  selectedIds.size > 0 ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm' :
                  'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}>
                {sent
                  ? <><Check className="w-4 h-4" /> Sent!</>
                  : sending
                  ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
                  : <><Send className="w-4 h-4" /> {selectedIds.size > 1 ? `Send to ${selectedIds.size} people` : 'Send'}</>
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}