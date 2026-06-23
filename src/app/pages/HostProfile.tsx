import { useParams, useNavigate } from 'react-router';
import { useState, useEffect, useRef } from 'react';
import { authApi, listingsApi, reviewsApi, socialApi } from '../lib/api';
import { getPortfolioItems, type PortfolioItem } from '../lib/portfolioApi';
import { captureSnapshot } from '../lib/smartAnimate';
import { useAuth } from '../context/AuthContext';
import { User, Listing, Review } from '../types';
import {
  ArrowLeft, Star, MapPin, ShieldCheck, MessageCircle, Loader2,
  UserPlus, UserCheck, Share2, Package, Grid3X3, List, LayoutGrid, Globe, X,
} from 'lucide-react';
import { AccountTypeBadge } from '../components/AccountTypeBadge';
import { ReliabilityBadge } from '../components/ReliabilityScore';
import { ListingCard } from '../components/ListingCard';
import { toast } from 'sonner';
import { FollowersModal } from '../components/FollowersModal';
import { supabase } from '../../lib/supabase';

type Tab = 'listings' | 'portfolio' | 'reviews' | 'about';
const TABS: { id: Tab; label: string }[] = [
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'listings',  label: 'Listings'  },
  { id: 'reviews',   label: 'Reviews'   },
  { id: 'about',     label: 'About'     },
];

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
  emoji: string;
  badgeCls: string;   // Tailwind classes for the pill
  barCls: string;     // Tailwind class for progress bar fill
  nextHint?: string;
  signals: { label: string; met: boolean }[];
}

const TRUST_LEVELS: { level: TrustLevel; label: string; emoji: string }[] = [
  { level: 1, label: 'New Member',   emoji: '🌱' },
  { level: 2, label: 'Community',    emoji: '💼' },
  { level: 3, label: 'Trusted',      emoji: '✅' },
  { level: 4, label: 'Top Creator',  emoji: '🏆' },
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
      emoji: '🌱',
      badgeCls: 'bg-gray-100 text-gray-500 border-gray-200',
      barCls:   'bg-gray-400',
      nextHint: 'Add a photo, bio, and your first listing to reach Community level.',
    },
    2: {
      label: 'Community',
      description: 'Active member with a complete profile and at least one listing.',
      emoji: '💼',
      badgeCls: 'bg-blue-50 text-blue-600 border-blue-200',
      barCls:   'bg-blue-500',
      nextHint: 'Get Filmons Verified and receive your first review to reach Trusted.',
    },
    3: {
      label: 'Trusted',
      description: 'Filmons Verified with real client reviews. Clients can book with confidence.',
      emoji: '✅',
      badgeCls: 'bg-green-50 text-green-700 border-green-200',
      barCls:   'bg-green-500',
      nextHint: 'Maintain 4.5+ stars across 5+ reviews to reach Top Creator.',
    },
    4: {
      label: 'Top Creator',
      description: 'Elite verified professional with outstanding reviews and a strong portfolio.',
      emoji: '🏆',
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
            <span className="text-4xl">{trust.emoji}</span>
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
              {TRUST_LEVELS.map(({ level: l, label, emoji }) => (
                <div key={l} className={`flex items-center gap-3 p-3.5 rounded-xl border transition-colors ${
                  l === trust.level
                    ? `${trust.badgeCls.split(' ')[0]} ${trust.badgeCls.split(' ')[2]}`
                    : 'bg-white border-gray-100'
                }`}>
                  <span className="text-xl shrink-0">{emoji}</span>
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
  const { userId } = useParams<{ userId: string }>();
  const navigate   = useNavigate();
  const { user: me } = useAuth();

  const [host,             setHost]             = useState<User | null>(null);
  const [listings,         setListings]         = useState<Listing[]>([]);
  const [reviews,          setReviews]          = useState<Review[]>([]);
  const [portfolioItems,   setPortfolioItems]   = useState<PortfolioItem[]>([]);
  const [reliabilityLevel, setReliabilityLevel] = useState<string>('new_user');
  const [reliabilityScore, setReliabilityScore] = useState<number>(0);
  const [following,      setFollowing]      = useState(false);
  const [confirmUnfollow,setConfirmUnfollow]= useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [followLoading,  setFollowLoading]  = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [tab,            setTab]            = useState<Tab>('portfolio');
  const [listView,       setListView]       = useState(false);
  const [portfolioFilter,setPortfolioFilter]= useState('All');
  const [showFollowers,  setShowFollowers]  = useState<'followers'|'following'|null>(null);
  const [followerUsers,  setFollowerUsers]  = useState<any[]>([]);
  const [followingUsers, setFollowingUsers] = useState<any[]>([]);
  const [showTrustSheet, setShowTrustSheet] = useState(false);

  const isOwn = me?.id === userId;

  useEffect(() => {
    if (isOwn) { navigate('/profile', { replace: true }); return; }
    if (userId) loadProfile(userId);
  }, [userId, isOwn]);

  useEffect(() => {
    if (me && host) setFollowing((me.following || []).includes(host.id));
  }, [me, host]);

  const loadProfile = async (uid: string) => {
    setLoading(true);
    try {
      const hostData = await authApi.getUserById(uid);
      setHost(hostData);
      setLoading(false);

      const [hostListings, hostReviews, hostPortfolio, repScore] = await Promise.all([
        listingsApi.getUserListings(uid).catch(() => []),
        reviewsApi.getUserReviews(uid).catch(() => []),
        getPortfolioItems(uid).catch(() => []),
        supabase.from('reputation_scores').select('reliability_level, reliability_score').eq('user_id', uid).single(),
      ]);
      if (repScore.data?.reliability_level) setReliabilityLevel(repScore.data.reliability_level);
      if (repScore.data?.reliability_score != null) setReliabilityScore(repScore.data.reliability_score);
      setListings(hostListings);
      setReviews(hostReviews);
      setPortfolioItems(hostPortfolio);

      const { data: freshProfile } = await supabase
        .from('profiles').select('followers, following').eq('id', uid).single();
      if (freshProfile) {
        const freshFollowers = freshProfile.followers || hostData?.followers || [];
        const freshFollowing = freshProfile.following || hostData?.following || [];
        setHost(h => h ? { ...h, followers: freshFollowers, following: freshFollowing } : h);

        if (freshFollowers.length) {
          supabase.from('profiles')
            .select('id, name, username, avatar_url, account_type, is_verified, bio')
            .in('id', freshFollowers.slice(0, 50))
            .then(({ data }) => {
              setFollowerUsers((data || []).map((r: any) => ({
                id: r.id, name: r.name, username: r.username,
                avatar: r.avatar_url, accountType: r.account_type,
                isVerified: r.is_verified, bio: r.bio,
              })));
            }, () => {});
        }
        if (freshFollowing.length) {
          supabase.from('profiles')
            .select('id, name, username, avatar_url, account_type, is_verified, bio')
            .in('id', freshFollowing.slice(0, 50))
            .then(({ data }) => {
              setFollowingUsers((data || []).map((r: any) => ({
                id: r.id, name: r.name, username: r.username,
                avatar: r.avatar_url, accountType: r.account_type,
                isVerified: r.is_verified, bio: r.bio,
              })));
            }, () => {});
        }
      }
    } catch {
      toast.error('Could not load profile');
      setLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!me) { navigate('/login'); return; }
    setFollowLoading(true);
    try {
      if (following) {
        await socialApi.unfollow(host!.id);
        setFollowing(false);
        setHost(prev => prev ? { ...prev, followers: (prev.followers || []).filter(id => id !== me.id) } : prev);
      } else {
        await socialApi.follow(host!.id);
        setFollowing(true);
        setHost(prev => prev ? { ...prev, followers: [...(prev.followers || []), me.id] } : prev);
      }
    } catch { toast.error('Could not update follow status'); }
    setFollowLoading(false);
  };

  const handleFollowClick = () => {
    if (!me) { navigate('/login'); return; }
    if (following && !confirmUnfollow) {
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
    navigate(`/inbox?userId=${host?.id}`);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/host/${userId}`;
    if (navigator.share) {
      try { await navigator.share({ title: host?.name || 'Filmons profile', url }); return; } catch {}
    }
    await navigator.clipboard.writeText(url);
    toast.success('Profile link copied!');
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

  return (
    <div className="min-h-screen bg-gray-100">

      {/* ── Back button ── */}
      <div className="fixed top-14 left-3 z-30">
        <button onClick={() => { captureSnapshot(); navigate(-1); }}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-sm text-white active:scale-90 transition-transform">
          <ArrowLeft className="w-4 h-4" />
        </button>
      </div>

      {/* ── Cover Photo — matches Profile.tsx ── */}
      <div className="relative h-48 md:h-64 overflow-hidden">
        {(host as any).coverPhoto
          ? <img src={(host as any).coverPhoto} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700" />
        }
      </div>

      <div className="max-w-4xl mx-auto px-4">

        {/* ── Profile identity card — same structure as Profile.tsx ── */}
        <div className="relative bg-white rounded-b-2xl shadow-sm pb-4 mb-3 border border-gray-100">

          {/* Avatar — matches Profile: w-24 h-24, -top-12, left-4 */}
          <div className="absolute -top-12 left-4 z-20">
            <div className="w-24 h-24 rounded-full border-4 border-white overflow-hidden bg-gray-200 shadow-lg">
              {host.avatar
                ? <img src={host.avatar} alt={host.name} className="w-full h-full object-cover"/>
                : <div className="w-full h-full flex items-center justify-center text-2xl font-black text-gray-400">
                    {host.name?.[0]?.toUpperCase() || '?'}
                  </div>
              }
            </div>
          </div>

          {/* Action buttons row — matches Profile: justify-end, pt-3 pr-3 pl-28 */}
          <div className="flex justify-end items-center gap-1.5 pt-3 pr-3 pl-28">
            {/* Share */}
            <button onClick={handleShare}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors shrink-0"
              title="Share">
              <Share2 className="w-3.5 h-3.5" />
            </button>

            {/* Follow */}
            <button onClick={handleFollowClick} disabled={followLoading}
              className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors shrink-0 ${
                confirmUnfollow
                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                  : following
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}>
              {followLoading ? <Loader2 className="w-3 h-3 animate-spin"/>
                : confirmUnfollow ? 'Unfollow?'
                : following ? <><UserCheck className="w-3 h-3"/> Following</>
                : <><UserPlus className="w-3 h-3"/> Follow</>
              }
            </button>

            {/* Message */}
            <button onClick={handleMessage}
              className="flex items-center gap-1 text-[11px] font-bold text-white bg-gray-900 hover:bg-gray-800 px-2.5 py-1.5 rounded-lg transition-colors shrink-0">
              <MessageCircle className="w-3 h-3"/> Message
            </button>
          </div>

          {/* Name & info — matches Profile: mt-12 px-4 */}
          <div className="mt-12 px-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-gray-900">{host.name}</h1>
              {(host as any).accountType === 'business' && <AccountTypeBadge type="business" size="sm"/>}
              {isVerified && (
                <span className="flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="w-3 h-3"/> Verified
                </span>
              )}
              <button onClick={() => setShowTrustSheet(true)} className="flex-shrink-0">
                <ReliabilityBadge score={reliabilityScore} level={reliabilityLevel} accountType={host.accountType} size="sm"/>
              </button>
            </div>
            {host.username && <p className="text-sm text-gray-400 mt-0.5">@{host.username}</p>}
            {primaryRole && <p className="text-xs font-semibold text-blue-600 mt-0.5">{primaryRole}</p>}
            {host.bio && <p className="text-sm text-gray-600 mt-1 max-w-lg leading-relaxed">{host.bio}</p>}

            {/* Stats row — matches Profile pattern */}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
              {location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5"/>{location}
                </span>
              )}
              {reviews.length > 0 && (
                <span className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400"/>
                  {avgRating.toFixed(1)} ({reviews.length})
                </span>
              )}
              <span>
                <span className="font-semibold text-gray-700">{listings.length}</span>{' '}
                <span className="text-gray-500">listings</span>
              </span>
              <button onClick={() => setShowFollowers('followers')}
                className="font-semibold text-gray-700 hover:text-blue-600 transition-colors">
                {followerUsers.length || (host.followers||[]).length}{' '}
                <span className="font-normal text-gray-500">followers</span>
              </button>
              <button onClick={() => setShowFollowers('following')}
                className="font-semibold text-gray-700 hover:text-blue-600 transition-colors">
                {followingUsers.length || (host.following||[]).length}{' '}
                <span className="font-normal text-gray-500">following</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
          <div className="flex overflow-x-auto no-scrollbar">
            {TABS.map(({ id, label }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`px-4 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-all flex-shrink-0 ${
                  tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ── */}
        <div className="pb-28 space-y-3">

          {/* ─── LISTINGS ─────────────────────────────────────────────── */}
          {tab === 'listings' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-400">{listings.length} listing{listings.length !== 1 ? 's' : ''}</p>
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

              {listings.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
                  <Package className="w-10 h-10 text-gray-200 mx-auto mb-3"/>
                  <p className="text-gray-500 font-medium">No listings yet</p>
                </div>
              ) : listView ? (
                <div className="space-y-2">
                  {listings.map(l => <ListingRow key={l.id} l={l}/>)}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {listings.map(l => <ListingCard key={l.id} listing={l}/>)}
                </div>
              )}
            </div>
          )}

          {/* ─── PORTFOLIO ────────────────────────────────────────────── */}
          {tab === 'portfolio' && (
            <div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-3">
                {PORTFOLIO_FILTERS.map(f => (
                  <button key={f} onClick={() => setPortfolioFilter(f)}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
                      portfolioFilter === f ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                    }`}>
                    {f}
                  </button>
                ))}
              </div>

              {filteredPortfolio.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
                  <Grid3X3 className="w-10 h-10 text-gray-200 mx-auto mb-3"/>
                  <p className="text-gray-500 font-medium">
                    {portfolioFilter === 'All' ? 'No portfolio items yet' : `No ${portfolioFilter.toLowerCase()} yet`}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {filteredPortfolio.map(item => (
                    <div key={item.id} className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 shadow-sm">
                      {(item.thumbnail_url || item.media_url) ? (
                        <img src={item.thumbnail_url || item.media_url!} alt={item.title} className="w-full h-full object-cover"/>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">
                          {item.media_type === 'video' ? '🎬' : item.media_type === 'audio' ? '🎵' : '🖼️'}
                        </div>
                      )}
                      {item.is_featured && (
                        <div className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-[9px] font-black px-1.5 py-0.5 rounded-full">★</div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2.5">
                        <p className="text-white text-[11px] font-semibold truncate">{item.title}</p>
                        {item.category && <p className="text-white/60 text-[10px]">{item.category}</p>}
                      </div>
                    </div>
                  ))}
                </div>
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
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{r.userName || 'Anonymous'}</p>
                          {(r as any).createdAt && (
                            <p className="text-[11px] text-gray-400">
                              {new Date((r as any).createdAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short' })}
                            </p>
                          )}
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

          {/* ─── ABOUT ────────────────────────────────────────────────── */}
          {tab === 'about' && (
            <div className="space-y-3">

              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Overview</h3>
                <p className="text-sm text-gray-700 leading-relaxed">{host.bio || 'No bio added yet.'}</p>
                {(meta.yearsExp || (host as any).years_exp) && (
                  <p className="text-xs text-gray-500 mt-2 font-medium">
                    {meta.yearsExp || (host as any).years_exp} years of experience
                  </p>
                )}
              </div>

              {(primaryRole || (meta.secondaryRoles || []).length > 0) && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Professional Identity</h3>
                  <div className="flex flex-wrap gap-2">
                    {primaryRole && (
                      <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full font-semibold">{primaryRole}</span>
                    )}
                    {(meta.secondaryRoles || (host as any).secondaryRoles || []).map((r: string) => (
                      <span key={r} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">{r}</span>
                    ))}
                  </div>
                </div>
              )}

              {(meta.skills || (host as any).skills || []).filter(Boolean).length > 0 && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Skills & Specialties</h3>
                  <div className="flex flex-wrap gap-2">
                    {(meta.skills || (host as any).skills || []).map((s: string) => (
                      <span key={s} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full font-medium">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {(meta.gear || (host as any).gear || []).filter(Boolean).length > 0 && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Gear & Tools</h3>
                  <div className="flex flex-wrap gap-2">
                    {(meta.gear || (host as any).gear || []).map((g: string) => (
                      <span key={g} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">{g}</span>
                    ))}
                  </div>
                </div>
              )}

              {location && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Location</h3>
                  <p className="flex items-center gap-1.5 text-sm text-gray-700">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0"/>{location}
                  </p>
                </div>
              )}

              {(meta.collabPrefs || meta.collab || (host as any).collabPrefs || []).filter(Boolean).length > 0 && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Collaboration Preferences</h3>
                  <div className="flex flex-wrap gap-2">
                    {(meta.collabPrefs || meta.collab || (host as any).collabPrefs || []).map((c: string) => (
                      <span key={c} className="text-xs bg-green-50 text-green-700 border border-green-100 px-2.5 py-1 rounded-full">{c}</span>
                    ))}
                  </div>
                </div>
              )}

              {(web || ig || yt || tt || vm || li) && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Social & External Links</h3>
                  <div className="flex flex-wrap gap-2">
                    {web && (
                      <a href={web.startsWith('http') ? web : `https://${web}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1.5 rounded-full font-medium hover:bg-blue-100 transition-colors">
                        <Globe className="w-3 h-3"/> {web.replace(/https?:\/\//, '').split('/')[0]}
                      </a>
                    )}
                    {ig && (
                      <a href={`https://instagram.com/${ig.replace('@', '')}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs text-white px-2.5 py-1.5 rounded-full font-medium hover:opacity-90 transition-opacity"
                        style={{ background: 'radial-gradient(circle at 30% 107%,#fdf497 0%,#fd5949 45%,#d6249f 60%,#285AEB 90%)' }}>
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="white"/><rect x="2" y="2" width="20" height="20" rx="6" stroke="white" strokeWidth="2" fill="none"/></svg>
                        @{ig.replace('@', '')}
                      </a>
                    )}
                    {yt && (
                      <a href={yt.startsWith('http') ? yt : `https://youtube.com/${yt}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs text-white bg-red-600 hover:bg-red-700 px-2.5 py-1.5 rounded-full font-medium transition-colors">
                        <svg className="w-3 h-3" viewBox="0 0 24 24"><polygon points="9,7 17,12 9,17" fill="white"/></svg>
                        YouTube
                      </a>
                    )}
                    {vm && (
                      <a href={vm.startsWith('http') ? vm : `https://vimeo.com/${vm}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs text-white bg-[#1ab7ea] hover:opacity-90 px-2.5 py-1.5 rounded-full font-medium transition-opacity">
                        Vimeo
                      </a>
                    )}
                    {tt && (
                      <a href={`https://tiktok.com/${tt.startsWith('@') ? tt : '@' + tt}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs text-white bg-black hover:bg-gray-900 px-2.5 py-1.5 rounded-full font-medium transition-colors">
                        TikTok
                      </a>
                    )}
                    {li && (
                      <a href={li.startsWith('http') ? li : `https://linkedin.com/in/${li}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs text-white bg-[#0077B5] hover:opacity-90 px-2.5 py-1.5 rounded-full font-medium transition-opacity">
                        LinkedIn
                      </a>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Details</h3>
                <div className="space-y-2 text-sm text-gray-700">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Name</span>
                    <span className="font-medium">{host.name}</span>
                  </div>
                  {host.username && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Username</span>
                      <span className="font-medium">@{host.username}</span>
                    </div>
                  )}
                </div>
              </div>

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
    </div>
  );
}
