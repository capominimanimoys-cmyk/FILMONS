// FILMONS universal Share Post sheet -- one component behind Share on every
// eligible Connect content type (posts, Portfolio items, Portfolio
// albums). Mobile: bottom sheet, steps transition in place (no
// close-and-reopen). Desktop: centered modal (same shell, narrower).
//
// "Send in Filmons" reuses the exact chatApi.getOrCreateDB/sendMessageToDB
// path ShareListingModal.tsx already uses for listings -- just generalized
// to multiple recipients and to shareApi.ts's content-type-agnostic
// SharedContentSnapshot instead of a Listing-shaped message.
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft, Search, Check, Link2, Share2 as ShareIcon, Mail, Send, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { UserAvatar } from '../AccountTypeBadge';
import { getSharedContentDeepLink, shareContentToRecipients } from '../../lib/shareApi';
import { getShareRecipientsBrowse, searchShareRecipients, type ShareRecipient } from '../../lib/shareRecipientsApi';
import { getDisplayIdentity } from '../../lib/displayIdentity';
import type { SharedContentSnapshot } from '../../types';

// Debounce for server-side search once the user actually types -- separate
// from browse mode, which loads once on mount with no debounce needed.
const SEARCH_DEBOUNCE_MS = 300;

type Step = 'main' | 'recipients' | 'message' | 'success';

function ContentPreview({ snapshot, compact = false }: { snapshot: SharedContentSnapshot; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 bg-gray-50 rounded-2xl ${compact ? 'p-2.5' : 'p-3'}`}>
      {snapshot.thumbnailUrl ? (
        <img src={snapshot.thumbnailUrl} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-gray-200 flex items-center justify-center shrink-0 text-lg">
          {snapshot.contentType === 'portfolio_album' ? '🎬' : '📄'}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="text-xs font-bold text-gray-900 truncate">{snapshot.creatorName}</p>
          {snapshot.creatorVerified && <CheckCircle2 className="w-3 h-3 text-blue-600 fill-blue-100 shrink-0" />}
        </div>
        {(snapshot.title || snapshot.caption) && (
          <p className="text-xs text-gray-500 truncate mt-0.5">{snapshot.title || snapshot.caption}</p>
        )}
      </div>
    </div>
  );
}

export function SharePostSheet({ snapshot, onClose }: { snapshot: SharedContentSnapshot; onClose: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('main');
  const [show, setShow] = useState(false);
  const closedRef = useRef(false);

  // Browse mode (no query) -- a bounded, useful initial subset (Connections,
  // recent conversation partners, following, then other real profiles),
  // loaded once. Search mode (query typed) -- server-side, paginated,
  // debounced, replacing the browse list entirely while active.
  const [browseRecipients, setBrowseRecipients] = useState<ShareRecipient[]>([]);
  const [loadingBrowse, setLoadingBrowse] = useState(true);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<ShareRecipient[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchCursor, setSearchCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<ShareRecipient[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Guards a slow, now-stale debounced response from overwriting a newer
  // query's results (e.g. typing "sony" then quickly "sony fx3").
  const searchVersionRef = useRef(0);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
  }, []);
  useEffect(() => {
    if (!user) { setLoadingBrowse(false); return; }
    getShareRecipientsBrowse(user.id).then(rows => { setBrowseRecipients(rows); setLoadingBrowse(false); });
  }, [user?.id]);

  // Debounced server-side search -- resets to page 0 on every new query.
  useEffect(() => {
    const q = search.trim();
    if (!q || !user) { setSearchResults([]); setSearchCursor(null); setSearchLoading(false); return; }
    const myVersion = ++searchVersionRef.current;
    setSearchLoading(true);
    const t = setTimeout(() => {
      searchShareRecipients(user.id, q, 0).then(({ recipients, nextCursor }) => {
        if (searchVersionRef.current !== myVersion) return; // a newer query already superseded this one
        setSearchResults(recipients);
        setSearchCursor(nextCursor);
        setSearchLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search, user?.id]);

  const loadMoreSearchResults = () => {
    const q = search.trim();
    if (!q || !user || searchCursor == null || loadingMore) return;
    setLoadingMore(true);
    const myVersion = searchVersionRef.current;
    searchShareRecipients(user.id, q, searchCursor).then(({ recipients, nextCursor }) => {
      setLoadingMore(false);
      if (searchVersionRef.current !== myVersion) return;
      setSearchResults(prev => [...prev, ...recipients]);
      setSearchCursor(nextCursor);
    });
  };

  // Infinite scroll for search results only -- browse mode is a single
  // bounded fetch, per spec ("a useful subset," not the whole directory).
  useEffect(() => {
    if (!search.trim()) return;
    const el = sentinelRef.current;
    if (!el || searchCursor == null) return;
    const io = new IntersectionObserver(entries => { if (entries[0].isIntersecting) loadMoreSearchResults(); }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, searchCursor]);

  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    setShow(false);
    setTimeout(onClose, 260);
  };

  // Success state can self-dismiss, but a Done button is always present too
  // (spec: "must also have a Done button").
  useEffect(() => {
    if (step !== 'success') return;
    const t = setTimeout(close, 3200);
    return () => clearTimeout(t);
  }, [step]); // eslint-disable-line

  const deepLink = getSharedContentDeepLink(snapshot);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(deepLink);
      setLinkCopied(true);
      toast.success('Link copied');
      setTimeout(close, 900);
    } catch { toast.error('Could not copy link'); }
  };

  const handleShareTo = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: snapshot.title || snapshot.creatorName, text: snapshot.caption, url: deepLink }); close(); }
      catch (e: any) { if (e?.name !== 'AbortError') handleCopyLink(); }
    } else {
      handleCopyLink();
    }
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`${snapshot.creatorName} on Filmons`);
    const body = encodeURIComponent(`${snapshot.title || snapshot.caption || 'Check this out on Filmons'}\n\n${deepLink}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const visibleRecipients = search.trim() ? searchResults : browseRecipients;

  const toggleRecipient = (c: ShareRecipient) => {
    setSelected(prev => prev.some(s => s.id === c.id) ? prev.filter(s => s.id !== c.id) : [...prev, c]);
  };

  const handleSend = async () => {
    if (!user || selected.length === 0 || sending) return;
    setSending(true);
    const { sentCount, failedCount } = await shareContentToRecipients({
      snapshot, senderId: user.id, senderName: user.name, senderAvatar: user.avatar,
      recipientIds: selected.map(s => s.id), message: message.trim() || undefined,
    });
    setSending(false);
    if (sentCount === 0) { toast.error('Could not send'); return; }
    if (failedCount > 0) toast.warning(`Sent to ${sentCount}, ${failedCount} failed`);
    setStep('success');
  };

  return createPortal((
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[80]"
        style={{ opacity: show ? 1 : 0, transition: 'opacity 260ms ease' }}
        onClick={close}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[81] bg-white rounded-t-3xl shadow-2xl flex flex-col
                   lg:inset-x-auto lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:bottom-auto lg:w-full lg:max-w-md lg:rounded-3xl"
        style={{
          maxHeight: '88vh',
          transform: show ? 'translateY(0)' : 'translateY(100%)',
          opacity: show ? 1 : undefined,
          transition: 'transform 280ms cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1 lg:hidden shrink-0" />

        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          {step === 'recipients' || step === 'message' ? (
            <button onClick={() => setStep(step === 'message' ? 'recipients' : 'main')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
              <ArrowLeft className="w-4 h-4 text-gray-600" />
            </button>
          ) : <div className="w-8" />}
          <p className="text-sm font-black text-gray-900">
            {step === 'main' ? 'Share' : step === 'recipients' ? 'Share with' : step === 'message' ? 'Add a message' : 'Shared!'}
          </p>
          <button onClick={close} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {step === 'main' && (
            <div className="px-4 py-3 space-y-4">
              <ContentPreview snapshot={snapshot} />

              {!!browseRecipients.length && (
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-2">Send to people on Filmons</p>
                  <div className="flex items-center gap-3 overflow-x-auto pb-1">
                    {browseRecipients.slice(0, 8).map(c => (
                      <button key={c.id} onClick={() => { toggleRecipient(c); setStep('recipients'); }} className="flex flex-col items-center gap-1 shrink-0 w-14">
                        <UserAvatar user={{ id: c.id, name: c.name, avatar: c.avatar_url }} size={48} />
                        <span className="text-[10px] font-semibold text-gray-600 truncate w-full text-center">{c.name.split(' ')[0]}</span>
                      </button>
                    ))}
                    <button onClick={() => setStep('recipients')} className="flex flex-col items-center gap-1 shrink-0 w-14">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold">See all</div>
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1 pt-1">
                <button onClick={() => setStep('recipients')} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 text-left">
                  <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0"><Send className="w-4 h-4 text-blue-600" /></div>
                  <div className="min-w-0"><p className="text-sm font-bold text-gray-900">Send in Filmons</p><p className="text-xs text-gray-400">Share directly with anyone on Filmons</p></div>
                </button>
                <button onClick={handleCopyLink} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 text-left">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${linkCopied ? 'bg-green-50' : 'bg-gray-100'}`}>
                    {linkCopied ? <Check className="w-4 h-4 text-green-600" /> : <Link2 className="w-4 h-4 text-gray-600" />}
                  </div>
                  <div className="min-w-0"><p className="text-sm font-bold text-gray-900">{linkCopied ? 'Link copied' : 'Copy link'}</p><p className="text-xs text-gray-400">Copy a link to this post</p></div>
                </button>
                <button onClick={handleShareTo} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 text-left">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><ShareIcon className="w-4 h-4 text-gray-600" /></div>
                  <div className="min-w-0"><p className="text-sm font-bold text-gray-900">Share to...</p><p className="text-xs text-gray-400">Use your device to share</p></div>
                </button>
                <button onClick={handleEmail} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 text-left">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><Mail className="w-4 h-4 text-gray-600" /></div>
                  <div className="min-w-0"><p className="text-sm font-bold text-gray-900">Email</p><p className="text-xs text-gray-400">Share via email</p></div>
                </button>
              </div>
            </div>
          )}

          {step === 'recipients' && (
            <div className="px-4 py-3">
              {selected.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  {selected.map(s => (
                    <span key={s.id} className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">
                      {s.name.split(' ')[0]}
                      <button onClick={() => toggleRecipient(s)}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people..."
                  className="w-full bg-gray-100 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none"
                />
              </div>
              {(search.trim() ? searchLoading && searchResults.length === 0 : loadingBrowse) ? (
                <p className="text-center text-xs text-gray-400 py-8">Loading…</p>
              ) : visibleRecipients.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-8">
                  {search.trim() ? 'No results' : 'No FILMONS profiles to show yet'}
                </p>
              ) : (
                <div className="space-y-1">
                  {visibleRecipients.map(c => {
                    const isSelected = selected.some(s => s.id === c.id);
                    const identity = getDisplayIdentity(c);
                    return (
                      <button key={c.id} onClick={() => toggleRecipient(c)} className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-gray-50">
                        <UserAvatar user={{ id: c.id, name: c.name, avatar: c.avatar_url }} size={40} />
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-sm font-bold text-gray-900 truncate flex items-center gap-1">
                            {c.name}
                            {c.is_verified && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 fill-blue-100 shrink-0" />}
                          </p>
                          {identity && <p className="text-xs text-gray-400 truncate">{identity}</p>}
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </button>
                    );
                  })}
                  {search.trim() && searchCursor != null && (
                    <div ref={sentinelRef} className="flex justify-center py-3">
                      {loadingMore && <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 'message' && (
            <div className="px-4 py-3 space-y-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                {selected.map(s => (
                  <span key={s.id} className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">{s.name.split(' ')[0]}</span>
                ))}
              </div>
              <textarea
                value={message} onChange={e => setMessage(e.target.value.slice(0, 500))}
                placeholder="Add a message (optional)..." rows={3}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none resize-none"
              />
              <p className="text-[10px] text-gray-400 text-right">{message.length}/500</p>
              <ContentPreview snapshot={snapshot} compact />
            </div>
          )}

          {step === 'success' && (
            <div className="px-4 py-8 flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="w-7 h-7 text-white" />
              </div>
              <p className="text-base font-black text-gray-900">Shared!</p>
              <p className="text-sm text-gray-500">Your post has been sent to {selected.length} {selected.length === 1 ? 'person' : 'people'}.</p>
              <div className="w-full mt-2"><ContentPreview snapshot={snapshot} compact /></div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-100 px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
          {step === 'recipients' && (
            <button
              onClick={() => setStep('message')}
              disabled={selected.length === 0}
              className="w-full py-3.5 rounded-2xl font-black text-white text-sm disabled:opacity-40 bg-blue-600"
            >
              Next{selected.length > 0 ? ` (${selected.length})` : ''}
            </button>
          )}
          {step === 'message' && (
            <button
              onClick={handleSend}
              disabled={sending}
              className="w-full py-3.5 rounded-2xl font-black text-white text-sm disabled:opacity-60 bg-blue-600 flex items-center justify-center gap-2"
            >
              {sending ? 'Sending…' : `Send (${selected.length})`}
            </button>
          )}
          {step === 'success' && (
            <button onClick={close} className="w-full py-3.5 rounded-2xl font-black text-gray-900 text-sm bg-gray-100">Done</button>
          )}
          {step === 'main' && <div className="h-0" />}
        </div>
      </div>
    </>
  ), document.body);
}
