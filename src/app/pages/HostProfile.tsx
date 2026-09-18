import { useParams, useNavigate } from 'react-router';
import { useState, useEffect, useRef } from 'react';
import { authApi, listingsApi, reviewsApi, postsApi } from '../lib/api';
import { getPortfolioItems, type PortfolioItem } from '../lib/portfolioApi';
import { getPortfolioMediaAspectRatio } from '../components/PortfolioMedia';
import { captureSnapshot } from '../lib/smartAnimate';
import { useAuth } from '../context/AuthContext';
import { useFollow } from '../context/FollowContext';
import { useFollowCounts } from '../lib/useFollowCounts';
import { useMobileScrollChrome } from '../lib/useMobileScrollChrome';
import { logProfileEngagement, logProfileView, getProfileInteractionStats, type ProfileInteractionStats } from '../lib/profileEngagement';
import { User, Listing, Review, Post } from '../types';
import {
  ArrowLeft, Star, MapPin, ShieldCheck, MessageCircle, Loader2,
  UserPlus, UserCheck, Share2, Package, Grid3X3, List, LayoutGrid, Globe, X,
  Video, Music, Image as ImageIcon,
  User as UserIcon, FileText,
} from 'lucide-react';
import { AccountTypeBadge } from '../components/AccountTypeBadge';
import { ListingCard } from '../components/ListingCard';
import { PostCard } from '../components/PostCard';
import { toast } from 'sonner';
import { FollowersModal } from '../components/FollowersModal';
import { supabase } from '../../lib/supabase';
import { isServiceListing } from '../lib/listingHelpers';
import { getRecommendations, getRecommendationCount, type Recommendation } from '../lib/recommendationsApi';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { ProfileTabNav, PROFILE_TABS, type ProfileTab } from '../components/profile/ProfileTabNav';
import { ProfileAllTab } from '../components/profile/ProfileAllTab';
import { ProfileViewerActions } from '../components/profile/ProfileViewerActions';
import { RecommendationComposeSheet } from '../components/profile/RecommendationComposeSheet';
import { socialLinksFromUser } from '../components/profile/SocialLinksSection';
import { toStringArray } from '../lib/normalizeList';
import { getTrustProfile, type TrustProfile } from '../lib/trustApi';
import { TrustDetailsSheet } from '../components/trust/TrustDetailsSheet';
import { TrustProfileOverlay } from '../components/trust/TrustProfileOverlay';
import {
  getConnectionStatus, sendConnectionRequest, respondToConnectionRequest, removeConnection,
  getMutualConnectionCount, getConnectionDegree, getPendingNote,
  type ConnectionStatus, type ConnectionDegree,
} from '../lib/connectionsApi';
import { ConnectFlowSheet } from '../components/ConnectFlowSheet';
import { ConnectionActionsSheet } from '../components/ConnectionActionsSheet';
import * as notifs from '../lib/notifications';

type Tab = ProfileTab;
const TABS = PROFILE_TABS;

const PORTFOLIO_FILTERS = ['All', 'Photos', 'Videos', 'Audio', 'Completed', 'BTS'];

function matchesPortfolioFilter(item: PortfolioItem, filter: string): boolean {
  if (filter === 'All') return true;
  if (filter === 'Photos')    return item.media_type === 'image';
  if (filter === 'Videos')    return item.media_type === 'video';
  if (filter === 'Audio')     return item.media_type === 'audio';
  if (filter === 'Completed') return (item.category ?? '').toLowerCase().includes('film') || (item.category ?? '').toLowerCase().includes('production');
  if (filter === 'BTS')       return (item.category ?? '').toLowerCase().includes('behind') || (item.title ?? '').toLowerCase().includes('bts');
  return true;
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= Math.round(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`}/>
      ))}
    </div>
  );
}

function ListingRow({ l }: { l: Listing }) {
  const navigate = useNavigate();
  const cover = l.image || l.images?.[0];
  const price = `$${(l.price ?? 0).toLocaleString()}${l.listingMode !== 'sale' ? '/day' : ''}`;
  return (
    <button
      onClick={() => { captureSnapshot(); navigate(`/listing/${l.id}`); }}
      className="w-full flex items-center gap-3 bg-white rounded-2xl p-3 shadow-sm border border-gray-100 hover:shadow-md active:scale-[0.99] transition-all text-left"
    >
      <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
        {cover
          ? <img src={cover} alt={l.title} className="w-full h-full object-cover"/>
          : <div className="w-full h-full flex items-center justify-center text-gray-300"><Package className="w-6 h-6"/></div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 truncate">{l.title}</p>
        {l.city && <p className="text-xs text-gray-400 flex items-center gap-0.5 mt-0.5"><MapPin className="w-2.5 h-2.5 shrink-0"/>{l.city}</p>}
      </div>
      <p className="text-sm font-black text-blue-600 shrink-0">{price}</p>
    </button>
  );
}

export function HostProfile() {
  const params     = useParams<{ userId?: string; username?: string }>();
  const navigate   = useNavigate();
  const { user: me } = useAuth();

  const [resolvedId,       setResolvedId]       = useState<string | null>(null);
  const [host,             setHost]             = useState<User | null>(null);
  const [listings,         setListings]         = useState<Listing[]>([]);
  const [reviews,          setReviews]          = useState<Review[]>([]);
  const [portfolioItems,   setPortfolioItems]   = useState<PortfolioItem[]>([]);
  const [trust, setTrust] = useState<TrustProfile | null>(null);
  const [showTrustDetails, setShowTrustDetails] = useState(false);
  const [trustProfileOpen, setTrustProfileOpen] = useState(false);
  const [trustProfileClosing, setTrustProfileClosing] = useState(false);
  const closeTrustProfile = () => {
    setTrustProfileClosing(true);
    setTimeout(() => { setTrustProfileOpen(false); setTrustProfileClosing(false); }, 260);
  };
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('none');
  const { isFollowing, isPending, follow, unfollow } = useFollow();
  const { followerCount, followingCount } = useFollowCounts(resolvedId ?? undefined);
  // Same immersive scroll-to-hide chrome as Home -> Portfolios (window mode
  // -- this page has no bounded scroll container of its own). Dispatches
  // straight to the existing TopBar/MobileBottomNav/Root.tsx listeners (no
  // changes needed there); `chromeHidden` here ONLY additionally collapses
  // this page's own extra clearance for the GLOBAL bottom nav, since
  // Root.tsx's <main> only collapses its own reserved space, not a page's
  // separate pb-* on top. Message/Follow (ProfileViewerActions, rendered
  // in normal flow right after ProfileHeader below) are profile-specific
  // actions, not global nav chrome -- they must never be wired to this.
  const { hidden: chromeHidden } = useMobileScrollChrome();
  const [confirmUnfollow,  setConfirmUnfollow]  = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [loading,          setLoading]          = useState(true);
  const [tab,              setTab]              = useState<Tab>('all');
  const [listView,         setListView]         = useState(false);
  const [portfolioFilter,  setPortfolioFilter]  = useState('All');
  const [showFollowers,    setShowFollowers]    = useState<'followers'|'following'|null>(null);
  const [followerUsers,    setFollowerUsers]    = useState<any[]>([]);
  const [followingUsers,   setFollowingUsers]   = useState<any[]>([]);
  const [showRecommend,    setShowRecommend]    = useState(false);
  const [recommendations,     setRecommendations]     = useState<Recommendation[]>([]);
  const [recommendationCount, setRecommendationCount] = useState(0);
  // Fetched once here and shared with both the header stats row and the
  // fuller All-tab section, so the two never show two independently-
  // fetched numbers for the same metric.
  const [interactionStats, setInteractionStats] = useState<ProfileInteractionStats | null>(null);
  const [posts,            setPosts]            = useState<Post[]>([]);

  // Reached either via the legacy /host/:userId link or the canonical
  // /:username one — resolve whichever param is present down to a raw id,
  // then loadProfile() (below) runs exactly like it always did. Own-profile
  // visits redirect to /profile instead of rendering the public view.
  useEffect(() => {
    let cancelled = false;
    if (params.username) {
      if (me && me.username === params.username) { navigate('/profile', { replace: true }); return; }
      authApi.getUserByUsername(params.username).then(found => {
        if (cancelled) return;
        if (!found) { setLoading(false); return; } // host stays null -> "Profile not found"
        if (me?.id === found.id) { navigate('/profile', { replace: true }); return; }
        setResolvedId(found.id);
      });
    } else if (params.userId) {
      if (me?.id === params.userId) { navigate('/profile', { replace: true }); return; }
      setResolvedId(params.userId);
    } else {
      setLoading(false);
    }
    return () => { cancelled = true; };
  }, [params.username, params.userId, me?.id, me?.username]); // eslint-disable-line

  useEffect(() => {
    if (resolvedId) loadProfile(resolvedId);
  }, [resolvedId]); // eslint-disable-line

  // The dedicated Recommendations tab needs the full list -- loadProfile
  // above only fetches a 2-item preview for the All tab's section.
  useEffect(() => {
    if (tab === 'recommendations' && resolvedId) getRecommendations(resolvedId).then(setRecommendations);
  }, [tab, resolvedId]);

  const loadProfile = async (uid: string) => {
    setLoading(true);
    try {
      // Kick off every independent query at once — none of these actually
      // depend on each other's results (only "profiles for these follower/
      // following ids" below depends on something, and that something is
      // the id-list queries also started here), so staging them one Promise.all
      // after another was pure serial wait for no reason.
      const hostPromise          = authApi.getUserById(uid);
      const listingsPromise      = listingsApi.getUserListings(uid).catch(() => []);
      // Received reviews (about this host), not reviews they wrote about others.
      const reviewsPromise       = reviewsApi.getReceivedReviews(uid).catch(() => []);
      const portfolioPromise     = getPortfolioItems(uid).catch(() => []);
      const repScorePromise      = supabase.from('reputation_scores').select('reliability_level, reliability_score').eq('user_id', uid).single();
      const followerRowsPromise  = supabase.from('follows').select('follower_id').eq('following_id', uid).limit(50);
      const followingRowsPromise = supabase.from('follows').select('following_id').eq('follower_id', uid).limit(50);
      const recommendationsPromise      = getRecommendations(uid, { limit: 2 }).catch(() => []);
      const recommendationCountPromise  = getRecommendationCount(uid).catch(() => 0);
      const postsPromise                = postsApi.getUserPosts(uid).catch(() => []);

      // Paint the header as soon as the host resolves, without waiting on the rest.
      const hostData = await hostPromise;
      // Bust browser image cache for avatar/cover — same Storage path is reused on each upload
      if (hostData?.avatar) {
        const base = hostData.avatar.split('?')[0];
        hostData.avatar = `${base}?t=${Date.now()}`;
      }
      setHost(hostData);
      setLoading(false);
      // Passive impression -- deliberately NOT part of Profile Interaction
      // (see profile_engagement.ts's comment). Own dedup window so a
      // refresh/rerender of this same page load doesn't double-count.
      if (hostData?.id) {
        logProfileView(hostData.id, me?.id);
        getProfileInteractionStats(hostData.id).then(setInteractionStats).catch(() => {});
        getTrustProfile(hostData.id).then(setTrust).catch(() => {});
        if (me?.id) getConnectionStatus(me.id, hostData.id).then(setConnectionStatus).catch(() => {});
      }
      // Landed here via the legacy /host/:id link but this profile has a
      // username -- silently upgrade the address bar to the clean canonical
      // URL, same as OAuthCallback-style post-auth redirects elsewhere.
      if (hostData?.username && window.location.pathname !== `/${hostData.username}`) {
        navigate(`/${hostData.username}`, { replace: true });
      }

      const [hostListings, hostReviews, hostPortfolio, repScore, followerRows, followingRows, hostRecommendations, hostRecommendationCount, hostPosts] =
        await Promise.all([
          listingsPromise, reviewsPromise, portfolioPromise, repScorePromise, followerRowsPromise, followingRowsPromise,
          recommendationsPromise, recommendationCountPromise, postsPromise,
        ]);
      setRecommendations(hostRecommendations);
      setRecommendationCount(hostRecommendationCount);
      setPosts(hostPosts);

      setListings(hostListings);
      setReviews(hostReviews);
      setPortfolioItems(hostPortfolio);

      const followerIds  = (followerRows.data  || []).map((r: any) => r.follower_id).filter(Boolean);
      const followingIds = (followingRows.data || []).map((r: any) => r.following_id).filter(Boolean);

      if (followerIds.length) {
        supabase.from('profiles')
          .select('id, name, username, avatar_url, account_type, is_verified, bio')
          .in('id', followerIds)
          .then(({ data }) => {
            setFollowerUsers((data || []).map((r: any) => ({
              id: r.id, name: r.name, username: r.username,
              avatar: r.avatar_url, accountType: r.account_type,
              isVerified: r.is_verified, bio: r.bio,
            })));
          }, () => {});
      }
      if (followingIds.length) {
        supabase.from('profiles')
          .select('id, name, username, avatar_url, account_type, is_verified, bio')
          .in('id', followingIds)
          .then(({ data }) => {
            setFollowingUsers((data || []).map((r: any) => ({
              id: r.id, name: r.name, username: r.username,
              avatar: r.avatar_url, accountType: r.account_type,
              isVerified: r.is_verified, bio: r.bio,
            })));
          }, () => {});
      }
    } catch {
      toast.error('Could not load profile');
      setLoading(false);
    }
  };

  const handleFollow = () => {
    if (!me) { navigate('/login'); return; }
    if (isFollowing(host!.id)) unfollow(host!.id);
    else follow(host!.id);
  };

  const handleFollowClick = () => {
    if (!me) { navigate('/login'); return; }
    if (isFollowing(host!.id) && !confirmUnfollow) {
      setConfirmUnfollow(true);
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmUnfollow(false), 3000);
      return;
    }
    setConfirmUnfollow(false);
    clearTimeout(confirmTimerRef.current);
    handleFollow();
  };

  const handleMessage = () => {
    if (!me) { navigate('/login'); return; }
    // Profile Interaction: logged at the moment the viewer taps Message on
    // the profile -- the clearest profile-attributable signal, without
    // hooking into Inbox.tsx's more involved conversation-resolution logic
    // (?with= there finds-or-creates depending on prior history). Dedup
    // (profileEngagement.ts) keeps repeated taps this session from
    // inflating the count.
    if (host?.id) logProfileEngagement(host.id, 'message', me.id);
    navigate(`/inbox?with=${host?.id}`);
  };

  const handleShare = () => {
    navigate(`/share-card?userId=${resolvedId}`);
  };

  // A real, accepted Professional Connection -- distinct from Follow. The
  // button itself never mutates anything directly anymore -- every status
  // opens a sheet (Connect-with-a-note, or the relevant relationship
  // actions) so a single mis-tap can't send/accept/remove a connection.
  const [showConnectFlow, setShowConnectFlow] = useState(false);
  const [showConnectionActions, setShowConnectionActions] = useState(false);
  const [connectionMutualCount, setConnectionMutualCount] = useState(0);
  const [connectionDegree, setConnectionDegree] = useState<ConnectionDegree>(3);
  const [connectionNote, setConnectionNote] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!me || !host) { navigate('/login'); return; }
    if (connectionStatus === 'none') { setShowConnectFlow(true); return; }
    // Any other status -- fetch the network context the sheet needs, then show it.
    const [mutual, degree, note] = await Promise.all([
      getMutualConnectionCount(me.id, host.id),
      getConnectionDegree(me.id, host.id),
      connectionStatus === 'pending_received' ? getPendingNote(me.id, host.id) : Promise.resolve(null),
    ]);
    setConnectionMutualCount(mutual);
    setConnectionDegree(degree);
    setConnectionNote(note);
    setShowConnectionActions(true);
  };

  const sendConnect = async (note?: string) => {
    if (!me || !host) return;
    setShowConnectFlow(false);
    const ok = await sendConnectionRequest(me.id, host.id, note);
    if (!ok) { toast.error('Could not send connection request'); return; }
    setConnectionStatus('pending_sent');
    toast.success('Connection request sent.');
    notifs.push(host.id, {
      type: 'connection_request' as any,
      fromUserId: me.id, fromUserName: me.name || me.username || '', fromUserAvatar: me.avatar || undefined,
    });
  };

  const withdrawConnect = async () => {
    if (!me || !host) return;
    setShowConnectionActions(false);
    const ok = await removeConnection(me.id, host.id);
    if (ok) { setConnectionStatus('none'); toast.success('Request withdrawn.'); }
  };

  const acceptConnect = async () => {
    if (!me || !host) return;
    setShowConnectionActions(false);
    const ok = await respondToConnectionRequest(me.id, host.id, true);
    if (!ok) { toast.error('Could not accept request'); return; }
    setConnectionStatus('connected');
    toast.success(`You're now connected with ${host.name}.`);
    notifs.push(host.id, {
      type: 'connection_accepted' as any,
      fromUserId: me.id, fromUserName: me.name || me.username || '', fromUserAvatar: me.avatar || undefined,
    });
  };

  const ignoreConnect = async () => {
    if (!me || !host) return;
    setShowConnectionActions(false);
    // Ignoring is private -- the sender is never told, per spec ("Never
    // publicly show Maya ignored Gabriel's request"). declined just stops
    // it from showing as pending on either side.
    const ok = await respondToConnectionRequest(me.id, host.id, false);
    if (ok) setConnectionStatus('none');
  };

  const [showRemoveConnectionConfirm, setShowRemoveConnectionConfirm] = useState(false);
  const removeConnectionConfirmed = async () => {
    if (!me || !host) return;
    setShowRemoveConnectionConfirm(false);
    const ok = await removeConnection(me.id, host.id);
    if (ok) { setConnectionStatus('none'); toast.success('Connection removed.'); }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  );
  if (!host) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-500 mb-3">Profile not found</p>
        <button onClick={() => { captureSnapshot(); navigate(-1); }} className="text-blue-600 font-semibold text-sm">← Go back</button>
      </div>
    </div>
  );

  const meta        = (host as any).profileMeta || {};
  const avgRating   = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const isVerified  = host.isVerified;
  const primaryRole = meta.primaryRole || (host as any).primaryRole || '';
  const location    = (host as any).location || [host.city, (host as any).province].filter(Boolean).join(', ');
  const ig  = meta.instagram  || (host as any).instagram;
  const yt  = meta.youtube    || (host as any).youtube;
  const tt  = meta.tiktok     || (host as any).tiktok;
  const vm  = meta.vimeo      || (host as any).vimeo;
  const li  = meta.linkedin   || (host as any).linkedin;
  const web = (host as any).website;

  const filteredPortfolio = portfolioItems.filter(item => matchesPortfolioFilter(item, portfolioFilter));

  return (
    <div className="min-h-screen bg-gray-100">

      {/* ── Back button — sits a bit below the h-14 TopBar so it doesn't crowd it ── */}
      <div className="fixed top-20 left-3 z-30">
        <button onClick={() => { captureSnapshot(); navigate(-1); }}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-sm text-white active:scale-90 transition-transform">
          <ArrowLeft className="w-4 h-4" />
        </button>
      </div>

      <ProfileHeader
        coverPhoto={(host as any).coverPhoto}
        avatar={host.avatar}
        name={host.name}
        username={host.username}
        isVerified={isVerified}
        accountType={host.accountType}
        primaryRole={primaryRole}
        bio={host.bio}
        location={location}
        trustLevel={trust?.trustLevel}
        onTapTrustBadge={() => setShowTrustDetails(true)}
        isOwner={false}
        onShare={() => navigate(`/share-card?userId=${resolvedId}`)}
        isFollowing={isFollowing(host.id)}
        isPending={isPending(host.id)}
        onFollow={handleFollowClick}
        onMessage={handleMessage}
        connectionStatus={me && me.id !== host.id ? connectionStatus : undefined}
        onConnect={handleConnect}
        followerCount={followerCount}
        followingCount={followingCount}
        interactionCount={interactionStats?.total ?? null}
        onTapFollowers={() => setShowFollowers('followers')}
        onTapFollowing={() => setShowFollowers('following')}
      />

      {/* Mobile-only (ProfileHeader's own Message/Follow above cover this
          for md: and up) -- normal in-flow content, never tied to
          chromeHidden/useMobileScrollChrome: these are profile-specific
          actions, not global nav chrome, so they must stay visible and
          simply scroll away naturally with the rest of the profile. */}
      <ProfileViewerActions
        isFollowing={isFollowing(host.id)}
        isPending={isPending(host.id)}
        confirmUnfollow={confirmUnfollow}
        onFollow={handleFollowClick}
        onMessage={handleMessage}
        onMore={() => setShowActionSheet(true)}
        connectionStatus={me && me.id !== host.id ? connectionStatus : undefined}
        onConnect={handleConnect}
      />

      <ProfileTabNav tab={tab} onChange={setTab} />

      {/* px-3 -- the single horizontal gutter for every tab's content
          below (ProfileAllTab and the other tab bodies carry no px-* of
          their own, on purpose -- stacking two gutters needlessly narrowed
          every card on mobile). */}
      <div className="max-w-4xl lg:max-w-5xl mx-auto px-3">

        {/* ── Tab content ── */}
        {/* pb-24 -- clears the global MobileBottomNav (md:hidden, so
            desktop doesn't need this extra clearance, but the padding is
            harmless there either way). ProfileViewerActions above is
            normal in-flow content now, not a fixed bar, so this no longer
            needs to clear it too. Collapses with the bottom nav itself
            while scrolling -- see chromeHidden above. */}
        <div className="pb-24 space-y-3" style={{ paddingBottom: chromeHidden ? 0 : undefined, transition: 'padding-bottom 280ms ease-out' }}>

          {/* ─── ALL — full vertical overview ────────────────────────────── */}
          {tab === 'all' && (
            <ProfileAllTab
              userId={host.id}
              isOwner={false}
              viewerId={me?.id}
              accountType={host.accountType}
              isVerified={isVerified}
              bio={host.bio}
              primaryRole={primaryRole}
              secondaryRoles={toStringArray(meta.secondaryRoles || (host as any).secondaryRoles)}
              location={location}
              openTo={toStringArray(meta.collabPrefs || meta.collab || (host as any).collabPrefs)}
              languages={toStringArray(meta.languages || (host as any).languages)}
              skills={toStringArray(meta.skills || (host as any).skills)}
              education={(host as any).education}
              portfolioItems={portfolioItems}
              onOpenPortfolioItem={() => navigate(`/portfolio/${host.id}`)}
              onViewAllPortfolio={() => navigate(`/portfolio/${host.id}`)}
              services={listings.filter(isServiceListing)}
              listings={listings.filter(l => !isServiceListing(l))}
              onViewServices={() => setTab('services')}
              onViewListings={() => setTab('listings')}
              gear={toStringArray(meta.gear || (host as any).gear)}
              recommendations={recommendations}
              recommendationCount={recommendationCount}
              onViewAllRecommendations={() => setTab('recommendations')}
              onRecommend={me && me.id !== host.id ? () => setShowRecommend(true) : undefined}
              socialLinks={socialLinksFromUser(host)}
              interactionStats={interactionStats}
              trust={trust}
              onOpenTrustDetails={() => setTrustProfileOpen(true)}
            />
          )}

          {/* ─── SERVICES ─────────────────────────────────────────────── */}
          {tab === 'services' && (
            <div>
              <p className="text-xs text-gray-400 mb-3">
                {listings.filter(isServiceListing).length} service{listings.filter(isServiceListing).length !== 1 ? 's' : ''}
              </p>
              {listings.filter(isServiceListing).length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
                  <Package className="w-10 h-10 text-gray-200 mx-auto mb-3"/>
                  <p className="text-gray-500 font-medium">No services listed yet</p>
                </div>
              ) : (
                <div className="pop-stagger grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {listings.filter(isServiceListing).map(l => <ListingCard key={l.id} listing={l}/>)}
                </div>
              )}
            </div>
          )}

          {/* ─── ACTIVITY ─────────────────────────────────────────────── */}
          {tab === 'activity' && (
            <div className="md:max-w-2xl md:mx-auto space-y-4">
              {posts.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
                  <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3"/>
                  <p className="text-gray-500 font-medium">No activity yet</p>
                </div>
              ) : posts.map(p => <PostCard key={p.id} post={p} />)}
            </div>
          )}

          {/* ─── RECOMMENDATIONS ──────────────────────────────────────── */}
          {tab === 'recommendations' && (
            <div className="md:max-w-2xl md:mx-auto">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-400">{recommendationCount} recommendation{recommendationCount !== 1 ? 's' : ''}</p>
                {me && me.id !== host.id && (
                  <button onClick={() => setShowRecommend(true)} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
                    Recommend
                  </button>
                )}
              </div>
              {recommendations.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
                  <p className="text-gray-500 font-medium">No recommendations yet.</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                  {recommendations.map(r => (
                    <div key={r.id} className="border-t border-gray-50 pt-3 first:border-t-0 first:pt-0">
                      <p className="text-sm font-bold text-gray-900">{r.recommender?.name ?? 'Filmons member'}</p>
                      <p className="text-xs text-gray-400">{[r.role_snapshot, r.recommender?.city].filter(Boolean).join(' · ')}</p>
                      <p className="text-sm text-gray-700 leading-relaxed mt-2">"{r.body}"</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── LISTINGS — gear rentals/sales/opportunities only, Services
              is its own tab now ─────────────────────────────────────────── */}
          {tab === 'listings' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-400">{listings.filter(l => !isServiceListing(l)).length} listing{listings.filter(l => !isServiceListing(l)).length !== 1 ? 's' : ''}</p>
                <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                  <button onClick={() => setListView(false)}
                    className={`p-1.5 rounded-lg transition-colors ${!listView ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400'}`}>
                    <LayoutGrid className="w-3.5 h-3.5"/>
                  </button>
                  <button onClick={() => setListView(true)}
                    className={`p-1.5 rounded-lg transition-colors ${listView ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400'}`}>
                    <List className="w-3.5 h-3.5"/>
                  </button>
                </div>
              </div>

              {listings.filter(l => !isServiceListing(l)).length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
                  <Package className="w-10 h-10 text-gray-200 mx-auto mb-3"/>
                  <p className="text-gray-500 font-medium">No listings yet</p>
                </div>
              ) : listView ? (
                <div className="space-y-2">
                  {listings.filter(l => !isServiceListing(l)).map(l => <ListingRow key={l.id} l={l}/>)}
                </div>
              ) : (
                <div className="pop-stagger grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {listings.filter(l => !isServiceListing(l)).map(l => <ListingCard key={l.id} listing={l}/>)}
                </div>
              )}
            </div>
          )}

          {/* ─── PORTFOLIO ────────────────────────────────────────────── */}
          {tab === 'portfolio' && (
            <div>
              {/* "View Full Portfolio" CTA */}
              <button
                onClick={() => navigate(`/portfolio/${host!.id}`)}
                className="w-full flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl px-5 py-4 mb-4 shadow-md active:scale-[0.98] transition-all"
              >
                <div className="text-left">
                  <p className="font-black text-sm">View Full Portfolio</p>
                  <p className="text-xs text-blue-200 mt-0.5">
                    {portfolioItems.length} work{portfolioItems.length !== 1 ? 's' : ''} · Photos, Videos, Projects & more
                  </p>
                </div>
                <svg className="w-5 h-5 text-blue-200 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6"/>
                </svg>
              </button>

              {/* Preview grid (first 6 items) */}
              {portfolioItems.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
                  <Grid3X3 className="w-10 h-10 text-gray-200 mx-auto mb-3"/>
                  <p className="text-gray-500 font-medium">No portfolio items yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 items-start">
                  {portfolioItems.slice(0, 6).map(item => (
                    <div
                      key={item.id}
                      className="relative rounded-2xl overflow-hidden bg-gray-100 shadow-sm cursor-pointer"
                      style={{ aspectRatio: getPortfolioMediaAspectRatio(item) }}
                      onClick={() => navigate(`/portfolio/${host!.id}`)}
                    >
                      {(item.thumbnail_url || item.media_url) ? (
                        <img src={item.thumbnail_url || item.media_url!} alt={item.title} className="w-full h-full object-contain"/>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {item.media_type === 'video' ? <Video className="w-8 h-8 text-gray-300"/> : item.media_type === 'audio' ? <Music className="w-8 h-8 text-gray-300"/> : <ImageIcon className="w-8 h-8 text-gray-300"/>}
                        </div>
                      )}
                      {item.is_featured && (
                        <div className="absolute top-1.5 right-1.5 bg-amber-400 text-[8px] font-black text-white px-1.5 py-0.5 rounded-full">★</div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/65 to-transparent p-2">
                        <p className="text-white text-[10px] font-semibold truncate">{item.title}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {portfolioItems.length > 6 && (
                <button
                  onClick={() => navigate(`/portfolio/${host!.id}`)}
                  className="w-full mt-3 py-3 rounded-2xl border border-gray-200 bg-white text-gray-600 text-sm font-bold hover:bg-gray-50 active:scale-[0.98] transition-all"
                >
                  See all {portfolioItems.length} works →
                </button>
              )}
            </div>
          )}

          {/* ─── REVIEWS ──────────────────────────────────────────────── */}
          {tab === 'reviews' && (
            <div className="space-y-3">
              {reviews.length > 0 && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-4xl font-black text-gray-900">{avgRating.toFixed(1)}</p>
                      <Stars rating={avgRating}/>
                      <p className="text-xs text-gray-400 mt-1">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex-1 space-y-1">
                      {[5,4,3,2,1].map(n => {
                        const count = reviews.filter(r => Math.round(r.rating) === n).length;
                        const pct = reviews.length ? Math.round((count / reviews.length) * 100) : 0;
                        return (
                          <div key={n} className="flex items-center gap-2 text-xs">
                            <span className="text-gray-500 w-2">{n}</span>
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${pct}%` }}/>
                            </div>
                            <span className="text-gray-400 w-5 text-right">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {reviews.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
                  <Star className="w-10 h-10 text-gray-200 mx-auto mb-3"/>
                  <p className="text-gray-500 font-medium">No reviews yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {reviews.map(r => (
                    <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5">
                          {r.userAvatar
                            ? <img src={r.userAvatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0"/>
                            : <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><UserIcon className="w-4 h-4 text-gray-400"/></div>
                          }
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{r.userName || 'Anonymous'}</p>
                            {(r as any).createdAt && (
                              <p className="text-[11px] text-gray-400">
                                {new Date((r as any).createdAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short' })}
                              </p>
                            )}
                          </div>
                        </div>
                        <Stars rating={r.rating}/>
                      </div>
                      {r.comment && <p className="text-sm text-gray-600 leading-relaxed">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {showFollowers && host && (
        <FollowersModal
          tab={showFollowers}
          followers={followerUsers}
          following={followingUsers}
          onClose={() => setShowFollowers(null)}
          onTabChange={t => setShowFollowers(t)}
          currentUserId={host.id}
        />
      )}

      {showTrustDetails && (
        <TrustDetailsSheet
          userId={host.id}
          onClose={() => setShowTrustDetails(false)}
          onViewFullProfile={() => { setShowTrustDetails(false); setTrustProfileOpen(true); }}
        />
      )}
      {(trustProfileOpen || trustProfileClosing) && (
        <TrustProfileOverlay userId={host.id} closing={trustProfileClosing} onClose={closeTrustProfile} />
      )}

      {showConnectFlow && (
        <ConnectFlowSheet
          name={host.name}
          avatar={host.avatar}
          onSend={sendConnect}
          onClose={() => setShowConnectFlow(false)}
        />
      )}

      {showConnectionActions && (
        <ConnectionActionsSheet
          status={connectionStatus as 'connected' | 'pending_sent' | 'pending_received'}
          name={host.name}
          avatar={host.avatar}
          degree={connectionDegree}
          mutualCount={connectionMutualCount}
          note={connectionNote}
          isFollowing={isFollowing(host.id)}
          onMessage={() => { setShowConnectionActions(false); handleMessage(); }}
          onToggleFollow={() => { setShowConnectionActions(false); handleFollowClick(); }}
          onRemoveConnection={() => { setShowConnectionActions(false); setShowRemoveConnectionConfirm(true); }}
          onWithdraw={withdrawConnect}
          onAccept={acceptConnect}
          onIgnore={ignoreConnect}
          onClose={() => setShowConnectionActions(false)}
        />
      )}

      {showRemoveConnectionConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-8">
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-xl overflow-hidden">
            <div className="px-5 py-5 text-center border-b border-gray-100">
              <p className="font-bold text-gray-900 text-base">Remove connection?</p>
              <p className="text-sm text-gray-500 mt-1">{host.name} will no longer be a Professional Connection. Messages and recommendations aren't affected.</p>
            </div>
            <button onClick={removeConnectionConfirmed}
              className="w-full py-3.5 text-sm font-bold text-red-500 border-b border-gray-100 hover:bg-red-50">
              Remove
            </button>
            <button onClick={() => setShowRemoveConnectionConfirm(false)}
              className="w-full py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {showRecommend && me && (
        <RecommendationComposeSheet
          recommenderId={me.id}
          recommenderRole={(me as any).primaryRole || (me as any).profileMeta?.primaryRole}
          recipientId={host.id}
          recipientName={host.name}
          onClose={() => setShowRecommend(false)}
          onSaved={() => {
            getRecommendations(host.id, { limit: 2 }).then(setRecommendations);
            getRecommendationCount(host.id).then(setRecommendationCount);
            if (tab === 'recommendations') getRecommendations(host.id).then(setRecommendations);
          }}
        />
      )}

    </div>
  );
}
