import { useState, useMemo } from 'react';
import { X, Search, Send, Check, Link2, Users } from 'lucide-react';
import { Listing, User } from '../types';
import { authApi, chatApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { UserAvatar, AccountTypeBadge } from './AccountTypeBadge';
import { toast } from 'sonner';

interface ShareListingModalProps {
  listing: Listing;
  onClose: () => void;
}

export function ShareListingModal({ listing, onClose }: ShareListingModalProps) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Build mutual-follow list (people you follow AND who follow you back)
  const mutualFriends = useMemo((): User[] => {
    if (!user) return [];
    const myFollowing: string[] = user.following || [];
    const myFollowers: string[] = user.followers || [];
    const mutualIds = myFollowing.filter(id => myFollowers.includes(id));

    const allUsers: User[] = (() => {
      try { return JSON.parse(localStorage.getItem('filmons_users') || '[]'); } catch { return []; }
    })();

    return allUsers.filter(u => mutualIds.includes(u.id));
  }, [user]);

  const filtered = useMemo(() => {
    if (!search.trim()) return mutualFriends;
    const q = search.toLowerCase();
    return mutualFriends.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q)
    );
  }, [mutualFriends, search]);

  const listingUrl = `${window.location.origin}/listing/${listing.id}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(listingUrl);
      setLinkCopied(true);
      toast.success('Link copied!');
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  };

  const handleSend = async () => {
    if (!user || !selectedUserId) return;
    setSending(true);
    try {
      const conv = await chatApi.getOrCreateDB(user.id, selectedUserId);
      const thumb = listing.image || listing.images?.[0];
      const priceLabel = listing.listingType === 'service'
        ? `$${listing.price}/hr`
        : listing.listingMode === 'sale'
          ? `$${listing.price}`
          : `$${listing.price}/day`;
      const message = [
        caption.trim() || '👀 Check out this listing on Filmons:',
        '',
        `**${listing.title}**`,
        `${priceLabel} CAD · ${listing.city}`,
        listingUrl,
      ].join('\n');
      const sentMsg = chatApi.sendMessage(conv.id, user.id, user.name, user.avatar, message);
      await chatApi.sendMessageToDB(
        conv.id, sentMsg,
        conv.participantIds,
        conv.isRequest ?? false,
        conv.requestedBy ?? null,
      );
      setSent(true);
      toast.success('Listing shared!', { description: 'Check your inbox for the conversation.' });
      setTimeout(onClose, 1200);
    } catch (err) {
      console.error('Share error:', err);
      toast.error('Failed to share listing');
    } finally {
      setSending(false);
    }
  };

  const selectedUser = mutualFriends.find(u => u.id === selectedUserId);
  const thumb = listing.image || listing.images?.[0];
  const typeLabel = listing.listingType === 'service' ? 'Service' : listing.listingMode === 'sale' ? 'For Sale' : 'For Rent';
  const typeColor = listing.listingType === 'service' ? 'bg-purple-100 text-purple-700' : listing.listingMode === 'sale' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div className="sm:hidden w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-1 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Share Listing</h2>
            <p className="text-xs text-gray-400 mt-0.5">Send to friends or copy link</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Listing preview */}
        <div className="px-5 py-3 border-b border-gray-50 shrink-0">
          <div className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3">
            {thumb ? (
              <img src={thumb} alt={listing.title} className="w-14 h-14 rounded-xl object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-gray-200 flex items-center justify-center shrink-0">
                <span className="text-2xl">📦</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${typeColor}`}>{typeLabel}</span>
              </div>
              <p className="text-sm font-bold text-gray-900 truncate">{listing.title}</p>
              <p className="text-xs text-gray-500">
                ${listing.price}{listing.listingType === 'service' ? '/hr' : listing.listingMode !== 'sale' ? '/day' : ''} CAD
                {listing.city ? ` · ${listing.city}` : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Copy link */}
          <div className="px-5 py-3 border-b border-gray-50">
            <button onClick={handleCopyLink}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${linkCopied ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'}`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${linkCopied ? 'bg-green-100' : 'bg-gray-100'}`}>
                {linkCopied ? <Check className="w-4 h-4 text-green-600" /> : <Link2 className="w-4 h-4 text-gray-600" />}
              </div>
              <div className="flex-1 text-left">
                <p className={`text-sm font-semibold ${linkCopied ? 'text-green-700' : 'text-gray-800'}`}>
                  {linkCopied ? 'Link copied!' : 'Copy listing link'}
                </p>
                <p className="text-xs text-gray-400 truncate">{listingUrl}</p>
              </div>
            </button>
          </div>

          {/* Send to a friend */}
          <div className="px-5 py-3">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-gray-400" />
              <p className="text-sm font-bold text-gray-700">Send to a friend</p>
              {mutualFriends.length > 0 && (
                <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                  {mutualFriends.length} mutual
                </span>
              )}
            </div>

            {mutualFriends.length === 0 ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Users className="w-6 h-6 text-gray-300" />
                </div>
                <p className="text-sm font-semibold text-gray-600">No mutual follows yet</p>
                <p className="text-xs text-gray-400 mt-1">Follow people and follow back to share listings with friends</p>
              </div>
            ) : (
              <>
                {/* Search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" placeholder="Search friends…" value={search} onChange={e => setSearch(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
                </div>

                {/* Friend list */}
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No results</p>
                  ) : filtered.map(u => (
                    <button key={u.id} onClick={() => setSelectedUserId(u.id === selectedUserId ? null : u.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                        selectedUserId === u.id ? 'bg-blue-50 border-2 border-blue-300' : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                      }`}>
                      <UserAvatar user={u} size={36} />
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{u.name}</p>
                        {u.username && <p className="text-xs text-gray-400">@{u.username}</p>}
                      </div>
                      <AccountTypeBadge type={u.accountType} size="sm" />
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        selectedUserId === u.id ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                      }`}>
                        {selectedUserId === u.id && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Caption */}
                {selectedUserId && (
                  <div className="mt-3">
                    <input type="text" placeholder="Add a message (optional)…" value={caption} onChange={e => setCaption(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 transition-all" />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        {selectedUserId && (
          <div className="px-5 py-4 border-t border-gray-100 bg-white shrink-0">
            <button onClick={handleSend} disabled={sending || sent}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-sm rounded-2xl py-3.5 transition-colors">
              {sent ? (
                <><Check className="w-4 h-4" /> Sent!</>
              ) : sending ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending…</>
              ) : (
                <><Send className="w-4 h-4" /> Send to {selectedUser?.name?.split(' ')[0]}</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}