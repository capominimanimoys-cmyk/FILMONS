/**
 * Filmons — CollaboratorSheet
 * Slides up from bottom: search creators, invite collaborators.
 * src/app/components/CollaboratorSheet.tsx
 */
import { useState, useEffect, useRef } from 'react';
import { X, Search, Check, Users, UserPlus, ShieldCheck } from 'lucide-react';
import { searchProfiles, type ProfileResult } from '../lib/mentionsApi';
import { inviteCollaborator } from '../lib/collabApi';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

interface Props {
  postId:      string;   // must be a saved post id to send invite
  onClose:     () => void;
  initialCollabs?: ProfileResult[];
}

export function CollaboratorSheet({ postId, onClose, initialCollabs = [] }: Props) {
  const { user } = useAuth();
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string|null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null);

  // Pre-mark already invited collabs
  useEffect(() => {
    setInvited(new Set(initialCollabs.map(c => c.id)));
    // Load all users on mount
    searchProfiles('').then(setResults);
  }, []);

  const handleSearch = (q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(async () => {
      const r = await searchProfiles(q);
      setResults(r);
      setLoading(false);
    }, 250);
  };

  const handleInvite = async (profile: ProfileResult) => {
    if (!user?.id || !postId) {
      toast.error('Post must be published before inviting collaborators');
      return;
    }
    if (profile.id === user.id) {
      toast.error("You can't invite yourself");
      return;
    }
    setSending(profile.id);
    try {
      await inviteCollaborator(postId, user.id, profile.id);
      setInvited(prev => new Set([...prev, profile.id]));
      toast.success(`🤝 Invite sent to @${profile.username}`);
    } catch (e: any) {
      if (e?.message?.includes('unique')) {
        toast.info('Invite already sent');
        setInvited(prev => new Set([...prev, profile.id]));
      } else {
        toast.error(e?.message || 'Failed to send invite');
      }
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[96] flex flex-col justify-end">
      <style>{`@keyframes collabSheetIn{from{transform:translateY(100%);opacity:0.6}to{transform:translateY(0);opacity:1}}`}</style>

      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>

      {/* Sheet */}
      <div className="relative bg-white rounded-t-3xl flex flex-col"
        style={{
          height: '75vh',
          animation: 'collabSheetIn 0.32s cubic-bezier(0.32,0.72,0,1)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-9 h-1 rounded-full bg-gray-200"/>
        </div>

        {/* Header */}
        <div className="px-4 pb-3 shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                <UserPlus className="w-4 h-4 text-blue-500"/>
              </div>
              <div>
                <p className="text-sm font-black text-gray-900">Invite Collaborator</p>
                <p className="text-[10px] text-gray-400">Post appears on both profiles</p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
              <X className="w-3.5 h-3.5 text-gray-500"/>
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
            <input
              autoFocus
              value={query}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search by name or @username…"
              className="w-full bg-gray-100 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-200 transition-colors"
            />
            {loading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
            )}
          </div>
        </div>

        {/* How it works banner */}
        <div className="mx-4 mt-3 mb-1 px-3 py-2.5 rounded-2xl flex items-start gap-2.5 shrink-0"
          style={{background:'rgba(81,162,255,0.06)', border:'1px solid rgba(81,162,255,0.15)'}}>
          <Users className="w-4 h-4 text-blue-500 shrink-0 mt-0.5"/>
          <p className="text-[11px] text-blue-700 leading-relaxed">
            Collaborator receives an invite notification. If they accept, the post appears on both profiles with shared likes, comments and views.
          </p>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto mt-1">
          {results.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Users className="w-9 h-9 text-gray-200"/>
              <p className="text-sm text-gray-400">No creators found</p>
            </div>
          ) : results.map((profile, i) => {
            const isInvited = invited.has(profile.id);
            const isSelf    = profile.id === user?.id;
            const isSending = sending === profile.id;
            return (
              <div key={profile.id}
                className="flex items-center gap-3 px-4 py-3"
                style={{borderTop: i === 0 ? 'none' : '1px solid #f3f4f6'}}>
                {/* Avatar */}
                <div className="w-11 h-11 rounded-full bg-gray-100 overflow-hidden shrink-0">
                  {profile.avatar_url
                    ? <img src={profile.avatar_url} className="w-full h-full object-cover"/>
                    : <div className="w-full h-full flex items-center justify-center font-black text-gray-400 text-base">
                        {(profile.display_name || profile.username || '?')[0].toUpperCase()}
                      </div>}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-black text-gray-900 truncate">
                      {profile.display_name || profile.username}
                    </p>
                    {profile.account_type && !['creator','renter'].includes(profile.account_type) && (
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-500 shrink-0"/>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">@{profile.username}</p>
                </div>

                {/* Action */}
                {isSelf ? (
                  <span className="text-xs text-gray-300 shrink-0">You</span>
                ) : isInvited ? (
                  <div className="flex items-center gap-1 shrink-0 px-3 py-1.5 rounded-xl bg-green-50 border border-green-100">
                    <Check className="w-3.5 h-3.5 text-green-500"/>
                    <span className="text-xs font-bold text-green-600">Invited</span>
                  </div>
                ) : (
                  <button
                    onClick={() => handleInvite(profile)}
                    disabled={!!isSending}
                    className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-xl text-xs font-black text-white disabled:opacity-60 transition-all active:scale-95"
                    style={{background:'#51A2FF'}}>
                    {isSending
                      ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                      : <><UserPlus className="w-3.5 h-3.5"/> Invite</>}
                  </button>
                )}
              </div>
            );
          })}
          <div className="h-6"/>
        </div>
      </div>
    </div>
  );
}