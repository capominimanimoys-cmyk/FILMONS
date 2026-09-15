import { useParams, useNavigate } from 'react-router';
import { useState, useEffect, useRef } from 'react';
import { authApi, listingsApi, reviewsApi, postsApi } from '../lib/api';
import { getPortfolioItems, type PortfolioItem } from '../lib/portfolioApi';
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
  Video, Music, Image as ImageIcon, Sprout, Briefcase, Trophy,
  User as UserIcon, FileText,
} from 'lucide-react';

type LucideIcon = React.ComponentType<{ className?: string }>;
import { AccountTypeBadge } from '../components/AccountTypeBadge';
import { ReliabilityBadge } from '../components/ReliabilityScore';
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
import { ProfileActionSheet } from '../components/profile/ProfileActionSheet';
import { ProfileViewerActions } from '../components/profile/ProfileViewerActions';
import { RecommendationComposeSheet } from '../components/profile/RecommendationComposeSheet';
import { socialLinksFromUser } from '../components/profile/SocialLinksSection';
import { toStringArray } from '../lib/normalizeList';

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

// ── Trust Level System ────────────────────────────────────────────────────────
type TrustLevel = 1 | 2 | 3 | 4;

interface TrustResult {
  level: TrustLevel;
  label: string;
  description: string;
  icon: LucideIcon;
  badgeCls: string;   // Tailwind classes for the pill
  barCls: string;     // Tailwind class for progress bar fill
  nextHint?: string;
  signals: { label: string; met: boolean }[];
}

const TRUST_LEVELS: { level: TrustLevel; label: string; icon: LucideIcon }[] = [
  { level: 1, label: 'New Member',   icon: Sprout },
  { level: 2, label: 'Community',    icon: Briefcase },
  { level: 3, label: 'Trusted',      icon: ShieldCheck },
  { level: 4, label: 'Top Creator',  icon: Trophy },
];

const RELIABILITY_LEVEL_MAP: Record<string, TrustLevel> = {
  new_user:         1,
  building_trust:   2,
  reliable_creator: 3,
  trusted_creator:  3,
  elite_creator:    4,
};

function computeTrustLevel(
  host: User,
  listings: Listing[],
  reviews: Review[],
  portfolioItems: PortfolioItem[],
  reliabilityLevel = 'new_user',
): TrustResult {
  const hasAvatar    = !!(host.avatar);
  const hasBio       = (host.bio ?? '').trim().length > 10;
  const isVerified   = !!host.isVerified;
  const hasListing   = listings.length >= 1;
  const hasReview    = reviews.length >= 1;
  const hasManyRev   = reviews.length >= 5;
  const avgRating    = reviews.length > 0
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const highRating   = avgRating >= 4.5;
  const hasPortfolio = portfolioItems.length >= 1;
  const accountType  = (host as any).accountType as string | undefined;
  const isPro        = ['creator_plus', 'professional', 'business'].includes(accountType ?? '');
  const hasFollowers = ((host.followers ?? []).length) >= 5;

  const signals: TrustResult['signals'] = [
    { label: 'Profile photo added',       met: hasAvatar },
    { label: 'Bio written',               met: hasBio },
    { label: 'At least 1 listing',        met: hasListing },
    { label: 'Filmons Verified',           met: isVerified },
    { label: 'Portfolio work added',      met: hasPortfolio },
    { label: 'Received a review',         met: hasReview },
    { label: '5+ reviews',                met: hasManyRev },
    { label: '4.5★ average rating',       met: highRating && hasManyRev },
    { label: 'Pro / Business account',    met: isPro },
    { label: '5+ followers',              met: hasFollowers },
  ];

  let level: TrustLevel = 1;
  if (hasAvatar && hasBio && hasListing) level = 2;
  if (level >= 2 && isVerified && hasReview) level = 3;
  if (level >= 3 && highRating && hasManyRev && (hasPortfolio || isPro)) level = 4;
  // Never show lower than what the DB reliability_level says
  const dbFloor = RELIABILITY_LEVEL_MAP[reliabilityLevel] ?? 1;
  if (dbFloor > level) level = dbFloor;

  type Config = Omit<TrustResult, 'level' | 'signals'>;
  const configs: Record<TrustLevel, Config> = {
    1: {
      label: 'New Member',
      description: 'Just getting started. Complete your profile to build trust with clients.',
      icon: Sprout,
      badgeCls: 'bg-gray-100 text-gray-500 border-gray-200',
      barCls:   'bg-gray-400',
      nextHint: 'Add a photo, bio, and your first listing to reach Community level.',
    },
    2: {
      label: 'Community',
      description: 'Active member with a complete profile and at least one listing.',
      icon: Briefcase,
      badgeCls: 'bg-blue-50 text-blue-600 border-blue-200',
      barCls:   'bg-blue-500',
      nextHint: 'Get Filmons Verified and receive your first review to reach Trusted.',
    },
    3: {
      label: 'Trusted',
      description: 'Filmons Verified with real client reviews. Clients can book with confidence.',
      icon: ShieldCheck,
      badgeCls: 'bg-green-50 text-green-700 border-green-200',
      barCls:   'bg-green-500',
      nextHint: 'Maintain 4.5+ stars across 5+ reviews to reach Top Creator.',
    },
    4: {
      label: 'Top Creator',
      description: 'Elite verified professional with outstanding reviews and a strong portfolio.',
      icon: Trophy,
      badgeCls: 'bg-amber-50 text-amber-700 border-amber-200',
      barCls:   'bg-amber-400',
    },
  };

  return { level, signals, ...configs[level] };
}

// ── Trust Info Sheet (bottom sheet) ──────────────────────────────────────────
function TrustInfoSheet({ trust, onClose }: { trust: TrustResult; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[105] bg-black/40" onClick={onClose}/>
      <div
        className="fixed inset-x-0 bottom-0 z-[110] bg-white rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '85vh', paddingBottom: 'env(safe-area-inset-bottom)' }}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200"/>
        </div>

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <p className="text-sm font-black text-gray-900">Trust & Safety</p>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200">
            <X className="w-4 h-4 text-gray-600"/>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-8">

          {/* Level hero card */}
          <div className={`mt-5 p-5 rounded-2xl border ${trust.badgeCls}`}>
            {(() => { const Icon = trust.icon; return <Icon className="w-10 h-10"/>; })()}
            <p className="text-lg font-black text-gray-900 mt-2">{trust.label}</p>
            <p className="text-sm text-gray-600 mt-1 leading-relaxed">{trust.description}</p>
          </div>

          {/* Progress bar */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Trust Level</p>
              <p className="text-[10px] text-gray-400">{trust.level} of 4</p>
            </div>
            <div className="flex gap-1.5">
              {([1, 2, 3, 4] as TrustLevel[]).map(l => (
                <div key={l}
                  className={`flex-1 h-2 rounded-full transition-colors ${l <= trust.level ? trust.barCls : 'bg-gray-100'}`}/>
              ))}
            </div>
            {trust.nextHint && (
              <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">{trust.nextHint}</p>
            )}
          </div>

          {/* Signals checklist */}
          <div className="mt-6">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Trust Signals</p>
            <div className="space-y-3">
              {trust.signals.map(s => (
                <div key={s.label} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${s.met ? 'bg-green-500' : 'bg-gray-100'}`}>
                    {s.met
                      ? <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                      : <div className="w-2 h-2 rounded-full bg-gray-300"/>
                    }
                  </div>
                  <span className={`text-sm ${s.met ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Level ladder */}
          <div className="mt-6">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Level Ladder</p>
            <div className="space-y-2">
              {TRUST_LEVELS.map(({ level: l, label, icon: LevelIcon }) => (
                <div key={l} className={`flex items-center gap-3 p-3.5 rounded-xl border transition-colors ${
                  l === trust.level
                    ? `${trust.badgeCls.split(' ')[0]} ${trust.badgeCls.split(' ')[2]}`
                    : 'bg-white border-gray-100'
                }`}>
                  <LevelIcon className="w-5 h-5 shrink-0"/>
                  <span className={`text-sm flex-1 ${l === trust.level ? 'font-bold text-gray-900' : l < trust.level ? 'text-gray-400 line-through' : 'text-gray-500'}`}>
                    {label}
                  </span>
                  {l === trust.level && (
                    <span className="text-[10px] font-black text-gray-500 shrink-0">Current</span>
                  )}
                  {l < trust.level && (
                    <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
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
  const [reliabilityLevel, setReliabilityLevel] = useState<string>('new_user');
  const [reliabilityScore, setReliabilityScore] = useState<number>(0);
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
  const [showTrustSheet,   setShowTrustSheet]   = useState(false);
  const [showActionSheet,  setShowActionSheet]  = useState(false);
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

      if (repScore.data?.reliability_level) setReliabilityLevel(repScore.data.reliability_level);
      if (repScore.data?.reliability_score != null) setReliabilityScore(repScore.data.reliability_score);
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
  const trust       = computeTrustLevel(host, listings, reviews, portfolioItems, reliabilityLevel);
  const primaryRole = meta.primaryRole || (host as any).primaryRole || '';
  const location    = (host as any).location || [host.city, (host as any).province].filter(Boolean).join(', ');
  const ig  = meta.instagram  || (host as any).instagram;
  const yt  = meta.youtube    || (host as any).youtube;
  const tt  = meta.tiktok     || (host as any).tiktok;
  const vm  = meta.vimeo      || (host as any).vimeo;
  const li  = meta.linkedin   || (host as any).linkedin;
  const web = (host as any).website;

  const filteredPortfolio = portfolioItems.filter(item => matchesPortfolioFilter(item, portfolioFilter));
  const profileUrl = `${window.location.origin}/${host.username || host.id}`;

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
        reliabilityScore={reliabilityScore}
        reliabilityLevel={reliabilityLevel}
        isOwner={false}
        onShare={() => navigate(`/share-card?userId=${resolvedId}`)}
        onMenu={() => setShowActionSheet(true)}
        isFollowing={isFollowing(host.id)}
        isPending={isPending(host.id)}
        onFollow={handleFollowClick}
        onMessage={handleMessage}
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
                <div className="grid grid-cols-3 gap-2">
                  {portfolioItems.slice(0, 6).map(item => (
                    <div
                      key={item.id}
                      className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 shadow-sm cursor-pointer"
                      onClick={() => navigate(`/portfolio/${host!.id}`)}
                    >
                      {(item.thumbnail_url || item.media_url) ? (
                        <img src={item.thumbnail_url || item.media_url!} alt={item.title} className="w-full h-full object-cover"/>
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

      {showTrustSheet && (
        <TrustInfoSheet trust={trust} onClose={() => setShowTrustSheet(false)}/>
      )}

      {showActionSheet && (
        <ProfileActionSheet
          isOwner={false}
          profileUrl={profileUrl}
          targetUserId={host.id}
          reporterId={me?.id}
          onClose={() => setShowActionSheet(false)}
        />
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
