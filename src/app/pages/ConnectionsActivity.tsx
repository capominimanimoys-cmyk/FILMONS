// /connections/activity -- dedicated full-screen subpage. "Recent activity
// from your connections" per spec (posts, portfolio work, rentals, for-sale
// listings, services, opportunities) as compact rows, not full cards --
// deliberately reuses the SAME feed plumbing Connect's own feed already
// uses (getConnectFeed/getActivityFeed) by passing the viewer's Professional
// Connection ids in as `followingIds` on the 'following' tab, rather than
// building a second parallel activity-fetching system for a different
// relationship graph. Courses aren't included -- course_published isn't
// logged into activity_events (only a notification), so there's no real
// data to back a "Courses when relevant" row yet.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { FileText, Image as ImageIcon, Briefcase, Tag, Repeat2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listConnections } from '../lib/connectionsApi';
import { getConnectFeed, type ConnectFeedItem } from '../lib/connectFeed';
import { getActivitySentence } from '../lib/activityApi';
import { usePortfolioPreview } from '../context/PortfolioPreviewContext';
import { ConnectionsPageHeader } from '../components/connect/ConnectionsPageHeader';
import { ConnectionsSlideIn } from '../components/connect/ConnectionsSlideIn';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

function CompactActivityRow({ item }: { item: ConnectFeedItem }) {
  const navigate = useNavigate();
  const { openPortfolioPreview } = usePortfolioPreview();

  if (item.kind === 'portfolio') {
    const { entry } = item;
    const title = entry.type === 'item' ? entry.item.title : entry.album.title;
    const thumb = entry.type === 'item' ? (entry.item.thumbnail_url || entry.item.media_url) : entry.coverUrl;
    return (
      <button
        onClick={() => openPortfolioPreview(entry.creator.id, entry.type === 'album' ? entry.id : undefined)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <Avatar url={entry.creator.avatar_url} name={entry.creator.name} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-900 truncate"><span className="font-bold">{entry.creator.name}</span> added new portfolio work</p>
          <p className="text-xs text-gray-400 truncate">{title} · {timeAgo(entry.created_at)}</p>
        </div>
        <Thumb url={thumb} fallback={ImageIcon} />
      </button>
    );
  }

  const { entry } = item;
  const openTarget = () => {
    if (entry.activityType === 'content_reposted' || entry.activityType === 'post_published') {
      if (entry.targetType === 'post' && entry.targetId) { navigate(`/post/${entry.targetId}`); return; }
      if ((entry.targetType === 'portfolio_item' || entry.targetType === 'portfolio_album') && entry.targetId) {
        // entry.actor is whoever performed this activity -- for a plain
        // repost that's the RESPOSTER, not the portfolio's real owner, so
        // the original creator only ever comes from the batch-fetched
        // portfolioEntry (content_reposted) itself, never entry.actor.
        const ownerId = entry.portfolioEntry?.creator.id ?? entry.actor.id;
        openPortfolioPreview(ownerId, entry.targetType === 'portfolio_album' ? entry.targetId : undefined);
        return;
      }
    }
    if ((entry.activityType === 'service_published' || entry.activityType === 'listing_published' || entry.activityType === 'opportunity_published') && entry.targetId) {
      navigate(`/listing/${entry.targetId}`);
      return;
    }
    navigate(`/host/${entry.actor.id}`);
  };

  const Icon = entry.activityType === 'opportunity_published' ? Briefcase
    : entry.activityType === 'service_published' || entry.activityType === 'listing_published' ? Tag
    : entry.activityType === 'content_reposted' ? Repeat2
    : FileText;
  const thumb = entry.post?.images?.[0] || entry.post?.thumbnailUrl;

  return (
    <button onClick={openTarget} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
      <Avatar url={entry.actor.avatar_url} name={entry.actor.name} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 truncate"><span className="font-bold">{entry.actor.name}</span> {getActivitySentence(entry)}</p>
        {entry.title && <p className="text-xs text-gray-400 truncate">{entry.title} · {timeAgo(entry.createdAt)}</p>}
        {!entry.title && <p className="text-xs text-gray-400 truncate">{timeAgo(entry.createdAt)}</p>}
      </div>
      {thumb ? <Thumb url={thumb} fallback={Icon} /> : <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0 text-gray-300"><Icon className="w-4 h-4" /></div>}
    </button>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  return (
    <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-200 shrink-0">
      {url ? <img src={url} alt={name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-400">{name?.[0]?.toUpperCase() || '?'}</div>}
    </div>
  );
}

function Thumb({ url, fallback: Fallback }: { url?: string | null; fallback: any }) {
  return (
    <div className="w-9 h-9 rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center shrink-0">
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <Fallback className="w-4 h-4 text-gray-300" />}
    </div>
  );
}

export function ConnectionsActivity() {
  const { user: me } = useAuth();
  const [items, setItems] = useState<ConnectFeedItem[] | null>(null);

  useEffect(() => {
    if (!me?.id) return;
    listConnections(me.id).then(async conns => {
      const connectionIds = conns.map(c => c.otherUser.id);
      if (!connectionIds.length) { setItems([]); return; }
      const page = await getConnectFeed({ tab: 'following', viewerId: me.id, followingIds: connectionIds, sort: 'recent', limit: 40 });
      setItems(page.items);
    });
  }, [me?.id]);

  return (
    <ConnectionsSlideIn>
      <ConnectionsPageHeader title="Activity" />
      <div className="max-w-lg mx-auto py-4">
        <p className="px-4 mb-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Recent activity from your connections</p>
        <div className="bg-white divide-y divide-gray-50 border-y border-gray-100">
          {items === null ? (
            <p className="text-sm text-gray-400 text-center py-10">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No recent activity from your connections yet.</p>
          ) : (
            items.map(item => <CompactActivityRow key={`${item.kind}-${item.entry.id}`} item={item} />)
          )}
        </div>
      </div>
    </ConnectionsSlideIn>
  );
}
