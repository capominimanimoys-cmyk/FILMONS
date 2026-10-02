// FILMONS -- /search/hashtags/:tag. Real content across every content
// type that actually supports hashtags today: posts, Portfolio items/
// albums, courses, listings, and the creators behind them (People).
//
// IMPORTANT CARD RULE (per spec): this page never invents its own card.
// Every section renders through the EXACT SAME components Home/Connect
// already use -- PostCard, PortfolioProjectCard/PortfolioAlbumCard,
// CourseCard, ListingCard, SuggestedConnectionCard -- with the same
// media/engagement/navigation behavior those components already have.
// Search (hashtagsApi) decides WHAT is shown; those components decide HOW.
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Share2, Plus, Check } from 'lucide-react';
import { toast } from 'sonner';
import { getHashtagContent, getHashtagCreators, getRelatedHashtags, getTopHashtags, isHashtagFollowed, followHashtag, unfollowHashtag, type HashtagContent, type RelatedHashtag, type Hashtag } from '../lib/hashtagsApi';
import type { Post, Listing } from '../types';
import type { PortfolioFeedEntry, SuggestedCreator } from '../lib/portfolioApi';
import { PostCard } from '../components/PostCard';
import { PortfolioProjectCard } from '../components/connect/PortfolioProjectCard';
import { PortfolioAlbumCard } from '../components/connect/PortfolioAlbumCard';
import { SuggestedConnectionCard } from '../components/connect/SuggestedConnectionCard';
import { CourseCard } from '../components/courses/CourseCard';
import { ListingCard } from '../components/ListingCard';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';
import { useSearchChromeVisibility } from '../lib/useSearchChromeVisibility';
import { SlideHeader } from '../components/SlideHeader';
import { useAuth } from '../context/AuthContext';
import { marketplaceTypeBadgeForListing, type MarketplaceBadge } from './CategoryResults';

type TabId = 'all' | 'posts' | 'portfolio' | 'marketplace' | 'courses' | 'people';
const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'posts', label: 'Posts' }, { id: 'portfolio', label: 'Portfolio' },
  { id: 'marketplace', label: 'Marketplace' }, { id: 'courses', label: 'Courses' }, { id: 'people', label: 'People' },
];
const MARKETPLACE_SUBFILTERS: { id: MarketplaceBadge | 'all'; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'RENTAL', label: 'Rental' }, { id: 'SALE', label: 'Sale' },
  { id: 'SERVICE', label: 'Services' }, { id: 'OPPORTUNITY', label: 'Opportunities' },
];
const PREVIEW_CAP = 5;

// Preserves each card's own real height instead of a plain grid forcing
// every row to match its tallest cell -- same technique PostsCategoryResults/
// PortfolioCategoryResults already use for their 2-column layouts.
function splitTwoColumns<T>(items: T[]): [T[], T[]] {
  return [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)];
}

// "Top" sort -- real engagement/quality signals each content type already
// has, never a fabricated composite score. "Latest" (the default fetch
// order from getHashtagContent) is mention recency.
function postEngagement(p: Post): number {
  return (p.likesCount ?? 0) + (p.commentCount ?? 0) * 2 + (p.repostCount ?? 0) * 2;
}
function portfolioEngagement(e: PortfolioFeedEntry): number {
  const base = e.type === 'item' ? e.item : e.album;
  return (base.likes_count ?? 0) + (base.comments_count ?? 0) * 2 + (base.reposts_count ?? 0) * 2;
}
function listingTopCompare(a: Listing, b: Listing): number {
  return (b.boosted ? 1 : 0) - (a.boosted ? 1 : 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

type SortMode = 'top' | 'latest';
function SortToggle({ mode, onChange }: { mode: SortMode; onChange: (m: SortMode) => void }) {
  return (
    <div className="flex gap-2">
      {(['top', 'latest'] as SortMode[]).map(m => (
        <button key={m} onClick={() => onChange(m)}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold capitalize transition-colors ${mode === m ? 'bg-gray-900 text-white' : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
          {m}
        </button>
      ))}
    </div>
  );
}

function PortfolioEntryCard({ entry }: { entry: PortfolioFeedEntry }) {
  return entry.type === 'item'
    ? <PortfolioProjectCard entry={entry as Extract<PortfolioFeedEntry, { type: 'item' }>} />
    : <PortfolioAlbumCard entry={entry as Extract<PortfolioFeedEntry, { type: 'album' }>} />;
}

function SectionHeader({ label, count, onViewAll }: { label: string; count: number; onViewAll?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm font-black text-gray-900">{label} <span className="text-gray-400 font-semibold">· {count}</span></p>
      {onViewAll && <button onClick={onViewAll} className="text-xs font-bold text-blue-600 hover:text-blue-700">View all →</button>}
    </div>
  );
}

function EmptyTab({ label }: { label: string }) {
  return <p className="text-center text-sm text-gray-400 py-16">No {label} for this hashtag yet.</p>;
}

export function HashtagPage() {
  const { tag } = useParams();
  const navigate = useNavigate();
  const { user, showGuestPrompt } = useAuth();
  const [content, setContent] = useState<HashtagContent | null>(null);
  const [creators, setCreators] = useState<SuggestedCreator[] | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [marketplaceFilter, setMarketplaceFilter] = useState<MarketplaceBadge | 'all'>('all');
  const [followed, setFollowed] = useState(false);
  const [related, setRelated] = useState<RelatedHashtag[] | null>(null);
  const [popularHashtags, setPopularHashtags] = useState<Hashtag[] | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('top');
  const { headerVisible } = useSearchChromeVisibility();

  useEffect(() => {
    if (!tag) return;
    setContent(null); setCreators(null); setActiveTab('all'); setMarketplaceFilter('all'); setFollowed(false); setRelated(null); setSortMode('top');
    getHashtagContent(tag, 30, user?.id).then(setContent);
    getHashtagCreators(tag, user?.id, 20).then(setCreators);
    getRelatedHashtags(tag, 10).then(setRelated);
    getTopHashtags(10).then(hs => setPopularHashtags(hs.filter(h => h.tag !== tag)));
    if (user) isHashtagFollowed(user.id, tag).then(setFollowed);
  }, [tag, user?.id]);

  const toggleFollow = async () => {
    if (!user) { showGuestPrompt('Create an account to follow hashtags'); return; }
    if (!tag) return;
    const next = !followed;
    setFollowed(next);
    if (next) await followHashtag(user.id, tag); else await unfollowHashtag(user.id, tag);
  };

  // hashtags.post_count only ever counts post mentions despite the name,
  // so it's never used as "the" count here -- this sums the actual
  // sections rendered below (creators included, since People is a real
  // section on this page now too).
  const totalCount = content ? content.posts.length + content.portfolio.length + content.courses.length + content.listings.length + (creators?.length ?? 0) : null;
  const nothingYet = content !== null && creators !== null
    && !content.posts.length && !content.portfolio.length && !content.courses.length && !content.listings.length && !creators.length;

  // "Top" previews (used for All's capped sections unconditionally, per
  // spec: "default Top results should NOT be date-only") -- real
  // engagement signals, computed once per content fetch.
  const topPosts = useMemo(() => content ? [...content.posts].sort((a, b) => postEngagement(b) - postEngagement(a)) : [], [content]);
  const topPortfolio = useMemo(() => content ? [...content.portfolio].sort((a, b) => portfolioEngagement(b) - portfolioEngagement(a)) : [], [content]);
  const topListings = useMemo(() => content ? [...content.listings].sort(listingTopCompare) : [], [content]);
  const topCourses = useMemo(() => content ? [...content.courses].sort((a, b) => b.studentCount - a.studentCount) : [], [content]);

  const filteredListings = useMemo(() => {
    if (!content) return [];
    const base = sortMode === 'top' ? topListings : content.listings;
    if (marketplaceFilter === 'all') return base;
    return base.filter(l => marketplaceTypeBadgeForListing(l) === marketplaceFilter);
  }, [content, topListings, sortMode, marketplaceFilter]);

  const dismissCreator = (id: string) => setCreators(cs => cs ? cs.filter(c => c.id !== id) : cs);

  const share = async () => {
    const url = `${window.location.origin}/search/hashtags/${tag}`;
    try {
      if (navigator.share) { await navigator.share({ title: `#${tag} on FILMONS`, url }); return; }
    } catch { return; }
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); } catch {}
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Same header shape as /search/category/:tab's CategoryHeader --
          "← (category)" IS the page's own header, no separate FILMONS
          chrome underneath it (see Root.tsx's hideTopBar). z-40 (not z-20)
          for the same reason ConnectCategoryHeader uses it -- PostCard's
          own-post menu button sits at z-30. */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <SlideHeader visible={headerVisible}>
          <div className="max-w-5xl mx-auto flex items-center gap-3 px-4" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: '12px' }}>
            <button onClick={() => navigate(-1)} aria-label="Back" className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors shrink-0 active:scale-90">
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-base md:text-xl font-black text-gray-900 truncate">#{tag}</p>
              <p className="text-sm text-gray-400 mt-0.5">{totalCount === null ? '…' : `${totalCount} result${totalCount === 1 ? '' : 's'}`}</p>
            </div>
            <button onClick={toggleFollow}
              className={`shrink-0 inline-flex items-center gap-1 px-3.5 h-9 rounded-full text-xs font-bold transition-colors active:scale-95 ${
                followed ? 'bg-gray-100 text-gray-700' : 'bg-gray-900 text-white'
              }`}>
              {followed ? <><Check className="w-3.5 h-3.5"/> Following</> : <><Plus className="w-3.5 h-3.5"/> Follow</>}
            </button>
            <button onClick={share} aria-label="Share" className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors shrink-0 active:scale-90">
              <Share2 className="w-5 h-5 text-gray-700" />
            </button>
          </div>

          <div className="max-w-5xl mx-auto px-4 flex gap-5 overflow-x-auto no-scrollbar">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`shrink-0 pb-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === t.id ? 'font-semibold text-gray-900 border-blue-600' : 'font-medium text-gray-400 border-transparent hover:text-gray-600'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </SlideHeader>
      </div>

      <div className="lg:max-w-3xl lg:mx-auto px-4 py-5 space-y-6">
        {content === null ? (
          <div className="flex justify-center py-16"><FilmonsBrandLoader size="md" label="Loading" /></div>
        ) : nothingYet ? (
          <div className="space-y-6">
            <p className="text-center text-sm text-gray-400 py-8">No results for #{tag} yet.</p>
            {!!related?.length && (
              <div className="space-y-2.5">
                <p className="text-sm font-black text-gray-900">Related hashtags</p>
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {related.map(r => (
                    <button key={r.tag} onClick={() => navigate(`/search/hashtags/${r.tag}`)}
                      className="shrink-0 px-3.5 py-2 rounded-full bg-white border border-gray-200 text-xs font-bold text-gray-700 hover:border-gray-300 transition-colors">
                      #{r.tag} <span className="text-gray-400 font-semibold">· {r.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!!popularHashtags?.length && (
              <div className="space-y-2.5">
                <p className="text-sm font-black text-gray-900">Popular hashtags</p>
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {popularHashtags.map(h => (
                    <button key={h.id} onClick={() => navigate(`/search/hashtags/${h.tag}`)}
                      className="shrink-0 px-3.5 py-2 rounded-full bg-white border border-gray-200 text-xs font-bold text-gray-700 hover:border-gray-300 transition-colors">
                      #{h.tag} <span className="text-gray-400 font-semibold">· {h.post_count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'all' ? (
          <>
            {content.posts.length > 0 && (
              <div className="space-y-2.5">
                <SectionHeader label="Posts" count={content.posts.length} onViewAll={content.posts.length > PREVIEW_CAP ? () => setActiveTab('posts') : undefined} />
                <div className="space-y-3">{topPosts.slice(0, PREVIEW_CAP).map(p => <PostCard key={p.id} post={p} />)}</div>
              </div>
            )}

            {content.portfolio.length > 0 && (() => {
              const [left, right] = splitTwoColumns(topPortfolio.slice(0, PREVIEW_CAP));
              return (
                <div className="space-y-2.5">
                  <SectionHeader label="Portfolio" count={content.portfolio.length} onViewAll={content.portfolio.length > PREVIEW_CAP ? () => setActiveTab('portfolio') : undefined} />
                  <div className="grid grid-cols-2 gap-3 items-start">
                    <div className="space-y-3">{left.map(e => <PortfolioEntryCard key={`${e.type}-${e.id}`} entry={e} />)}</div>
                    <div className="space-y-3">{right.map(e => <PortfolioEntryCard key={`${e.type}-${e.id}`} entry={e} />)}</div>
                  </div>
                </div>
              );
            })()}

            {content.listings.length > 0 && (
              <div className="space-y-2.5">
                <SectionHeader label="Marketplace" count={content.listings.length} onViewAll={content.listings.length > PREVIEW_CAP ? () => setActiveTab('marketplace') : undefined} />
                <div className="grid grid-cols-2 gap-3">{topListings.slice(0, PREVIEW_CAP).map(l => <ListingCard key={l.id} listing={l} />)}</div>
              </div>
            )}

            {content.courses.length > 0 && (
              <div className="space-y-2.5">
                <SectionHeader label="Courses" count={content.courses.length} onViewAll={content.courses.length > PREVIEW_CAP ? () => setActiveTab('courses') : undefined} />
                <div className="flex gap-3 overflow-x-auto no-scrollbar">
                  {topCourses.slice(0, PREVIEW_CAP).map(c => <div key={c.id} className="shrink-0 w-56"><CourseCard course={c} /></div>)}
                </div>
              </div>
            )}

            {!!creators?.length && (
              <div className="space-y-2.5">
                <SectionHeader label="People" count={creators.length} onViewAll={creators.length > PREVIEW_CAP ? () => setActiveTab('people') : undefined} />
                <div className="flex gap-3 overflow-x-auto no-scrollbar">
                  {creators.slice(0, PREVIEW_CAP).map(c => (
                    <SuggestedConnectionCard key={c.id} creator={c} onConnected={() => {}} onDismiss={() => dismissCreator(c.id)} />
                  ))}
                </div>
              </div>
            )}

            {!!related?.length && (
              <div className="space-y-2.5">
                <p className="text-sm font-black text-gray-900">Related hashtags</p>
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {related.map(r => (
                    <button key={r.tag} onClick={() => navigate(`/search/hashtags/${r.tag}`)}
                      className="shrink-0 px-3.5 py-2 rounded-full bg-white border border-gray-200 text-xs font-bold text-gray-700 hover:border-gray-300 transition-colors">
                      #{r.tag} <span className="text-gray-400 font-semibold">· {r.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : activeTab === 'posts' ? (
          <div className="space-y-3">
            {content.posts.length > 1 && <SortToggle mode={sortMode} onChange={setSortMode} />}
            {content.posts.length === 0 ? <EmptyTab label="posts" /> : (
              <div className="space-y-3">{(sortMode === 'top' ? topPosts : content.posts).map(p => <PostCard key={p.id} post={p} />)}</div>
            )}
          </div>
        ) : activeTab === 'portfolio' ? (
          <div className="space-y-3">
            {content.portfolio.length > 1 && <SortToggle mode={sortMode} onChange={setSortMode} />}
            {content.portfolio.length === 0 ? <EmptyTab label="portfolio work" /> : (() => {
              const [left, right] = splitTwoColumns(sortMode === 'top' ? topPortfolio : content.portfolio);
              return (
                <div className="grid grid-cols-2 gap-3 items-start">
                  <div className="space-y-3">{left.map(e => <PortfolioEntryCard key={`${e.type}-${e.id}`} entry={e} />)}</div>
                  <div className="space-y-3">{right.map(e => <PortfolioEntryCard key={`${e.type}-${e.id}`} entry={e} />)}</div>
                </div>
              );
            })()}
          </div>
        ) : activeTab === 'marketplace' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {MARKETPLACE_SUBFILTERS.map(f => (
                  <button key={f.id} onClick={() => setMarketplaceFilter(f.id)}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${marketplaceFilter === f.id ? 'bg-gray-900 text-white' : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
              {content.listings.length > 1 && <SortToggle mode={sortMode} onChange={setSortMode} />}
            </div>
            {filteredListings.length === 0 ? <EmptyTab label="marketplace listings" /> : (
              <div className="grid grid-cols-2 gap-3">{filteredListings.map(l => <ListingCard key={l.id} listing={l} />)}</div>
            )}
          </div>
        ) : activeTab === 'courses' ? (
          <div className="space-y-3">
            {content.courses.length > 1 && <SortToggle mode={sortMode} onChange={setSortMode} />}
            {content.courses.length === 0 ? <EmptyTab label="courses" /> : (
              <div className="grid grid-cols-2 gap-3">{(sortMode === 'top' ? topCourses : content.courses).map(c => <CourseCard key={c.id} course={c} />)}</div>
            )}
          </div>
        ) : (
          creators === null ? (
            <div className="flex justify-center py-16"><FilmonsBrandLoader size="md" label="Loading" /></div>
          ) : creators.length === 0 ? <EmptyTab label="people" /> : (
            <div className="space-y-3">
              {creators.map(c => <SuggestedConnectionCard key={c.id} creator={c} widthClassName="w-full" onConnected={() => {}} onDismiss={() => dismissCreator(c.id)} />)}
            </div>
          )
        )}
      </div>
    </div>
  );
}
