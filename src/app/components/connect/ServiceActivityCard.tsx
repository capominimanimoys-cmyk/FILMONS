// Desktop Connect feed's compact LinkedIn-style card for a Service (or
// generic rental/sale) listing activity event. No Comment action -- there
// is no comment system for listings anywhere in this app, and the spec's
// "don't build a second comments system" rule means this card simply omits
// Comment rather than inventing one.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { Heart, Share2, Bookmark, BadgeCheck, MoreHorizontal, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { UserAvatar } from '../AccountTypeBadge';
import { TrustBadge } from '../trust/TrustBadge';
import { TrustDetailsSheet } from '../trust/TrustDetailsSheet';
import { TrustProfileOverlay } from '../trust/TrustProfileOverlay';
import { getActivitySentence, type ActivityEntry } from '../../lib/activityApi';
import { savedListingsApi } from '../../lib/api';
import type { TrustLevel } from '../../lib/trustApi';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

export function ServiceActivityCard({ entry, trustLevel }: { entry: ActivityEntry; trustLevel?: TrustLevel }) {
  const { user, showGuestPrompt } = useAuth();
  const navigate = useNavigate();
  const { actor, metadata } = entry;

  const [saved, setSaved] = useState(false);
  const [showTrustDetails, setShowTrustDetails] = useState(false);
  const [trustProfileOpen, setTrustProfileOpen] = useState(false);
  const [trustProfileClosing, setTrustProfileClosing] = useState(false);
  const closeTrustProfile = () => {
    setTrustProfileClosing(true);
    setTimeout(() => { setTrustProfileOpen(false); setTrustProfileClosing(false); }, 260);
  };

  useEffect(() => {
    if (user && entry.targetId) savedListingsApi.isSaved(user.id, entry.targetId).then(setSaved).catch(() => {});
  }, [entry.targetId, user?.id]);

  const openListing = () => entry.targetId && navigate(`/listing/${entry.targetId}`);

  const handleToggleSave = async () => {
    if (!user) { showGuestPrompt('Create your Filmons account to save listings.', 'Sign up to save'); return; }
    if (!entry.targetId) return;
    const next = !saved;
    setSaved(next);
    const ok = await savedListingsApi.toggle(user.id, entry.targetId, { title: entry.title, userId: actor.id });
    if (!ok) { setSaved(!next); toast.error('Could not update save'); }
  };

  const handleShare = async () => {
    if (!entry.targetId) return;
    const url = `${window.location.origin}/listing/${entry.targetId}`;
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); } catch { toast.error('Could not copy link'); }
  };

  const priceLine = metadata?.price != null
    ? `From $${metadata.price}${metadata.listingMode === 'rent' ? '/day' : ''}`
    : null;
  const tagsLine = [metadata?.serviceCategory, ...(metadata?.tags ?? [])].filter(Boolean).slice(0, 4).join(' · ');

  return (
    <article className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-start gap-3">
        <button onClick={() => navigate(`/host/${actor.id}`)} className="shrink-0">
          <UserAvatar user={{ id: actor.id, name: actor.name, avatar: actor.avatar_url }} size={40} />
        </button>
        <div className="min-w-0 flex-1">
          <button onClick={() => navigate(`/host/${actor.id}`)} className="flex items-center gap-1">
            <p className="text-sm font-bold text-gray-900">{actor.name}</p>
            {actor.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 fill-blue-100 shrink-0" />}
            {trustLevel && <span className="ml-1"><TrustBadge level={trustLevel} size="sm" onClick={() => setShowTrustDetails(true)} /></span>}
          </button>
          <p className="text-xs text-gray-400 mt-0.5">{timeAgo(entry.createdAt)}</p>
        </div>
        <button className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      <p className="text-sm text-gray-800 mt-2.5">{getActivitySentence(entry)}</p>
      {metadata?.descriptionExcerpt && <p className="text-sm text-gray-600 mt-1 leading-relaxed line-clamp-2">{metadata.descriptionExcerpt}</p>}

      <button onClick={openListing} className="w-full flex items-stretch gap-3 mt-3 border border-gray-100 rounded-xl overflow-hidden hover:bg-gray-50 transition-colors">
        <div className="w-24 shrink-0 bg-gray-100 flex items-center justify-center">
          <Briefcase className="w-6 h-6 text-gray-300" />
        </div>
        <div className="flex-1 min-w-0 py-2.5 pr-3 text-left">
          <p className="text-sm font-bold text-gray-900 truncate">{entry.title}</p>
          {priceLine && <p className="text-xs text-gray-600 font-semibold mt-0.5">{priceLine}</p>}
          {metadata?.city && <p className="text-[11px] text-gray-400 mt-0.5">{metadata.city}{metadata.workArrangement ? ` · ${metadata.workArrangement}` : ''}</p>}
          {tagsLine && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{tagsLine}</p>}
        </div>
      </button>

      <div className="flex items-center gap-5 mt-3.5 pt-3 border-t border-gray-50">
        <button className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <Heart className="w-5 h-5 text-gray-400" /> Like
        </button>
        <button onClick={handleShare} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <Share2 className="w-5 h-5 text-gray-400" /> Share
        </button>
        <button onClick={handleToggleSave} className="ml-auto flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <Bookmark className={`w-5 h-5 ${saved ? 'text-gray-900 fill-gray-900' : 'text-gray-400'}`} /> Save
        </button>
      </div>

      {showTrustDetails && createPortal(
        <TrustDetailsSheet
          userId={actor.id}
          onClose={() => setShowTrustDetails(false)}
          onViewFullProfile={() => { setShowTrustDetails(false); setTrustProfileOpen(true); }}
        />,
        document.body,
      )}
      {(trustProfileOpen || trustProfileClosing) && createPortal(
        <TrustProfileOverlay userId={actor.id} closing={trustProfileClosing} onClose={closeTrustProfile} />,
        document.body,
      )}
    </article>
  );
}
