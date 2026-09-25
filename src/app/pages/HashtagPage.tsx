// FILMONS -- /hashtag/:tag. Real content across every content type that
// actually supports hashtags today: posts, Portfolio items/albums,
// courses, and listings.
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, BadgeCheck, Star, Users } from 'lucide-react';
import { getHashtag, getHashtagContent, type HashtagContent } from '../lib/hashtagsApi';
import { UserAvatar } from '../components/AccountTypeBadge';
import { DraggablePortfolioPage } from '../components/connect/DraggablePortfolioPage';
import { CourseCard } from '../components/courses/CourseCard';
import { ListingCard } from '../components/ListingCard';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
}

export function HashtagPage() {
  const { tag } = useParams();
  const navigate = useNavigate();
  const [usageCount, setUsageCount] = useState<number | null>(null);
  const [content, setContent] = useState<HashtagContent | null>(null);
  const [openPortfolio, setOpenPortfolio] = useState<{ creatorId: string; albumId?: string } | null>(null);

  useEffect(() => {
    if (!tag) return;
    getHashtag(tag).then(h => setUsageCount(h?.usageCount ?? 0));
    getHashtagContent(tag).then(setContent);
  }, [tag]);

  const nothingYet = content && !content.posts.length && !content.portfolio.length && !content.courses.length && !content.listings.length;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Same header shape as /search/category/:tab's CategoryHeader --
          "← (category)" IS the page's own header, no separate FILMONS
          chrome underneath it (see Root.tsx's hideTopBar, which now also
          matches on /hashtag/). */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto flex items-center gap-3 px-4" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: '12px' }}>
          <button onClick={() => navigate(-1)} aria-label="Back" className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors shrink-0 active:scale-90">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="min-w-0">
            <p className="text-base md:text-xl font-black text-gray-900 truncate">#{tag}</p>
            <p className="text-sm text-gray-400 mt-0.5">{usageCount === null ? '…' : `${formatCount(usageCount)} post${usageCount === 1 ? '' : 's'}`}</p>
          </div>
        </div>
      </div>

      <div className="lg:max-w-3xl lg:mx-auto px-4 py-5 space-y-6">
        {content === null ? (
          <div className="flex justify-center py-16"><FilmonsBrandLoader size="md" label="Loading" /></div>
        ) : nothingYet ? (
          <p className="text-center text-sm text-gray-400 py-16">No content found for #{tag} yet.</p>
        ) : (
          <>
            {content.posts.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-sm font-black text-gray-900">Posts</p>
                <div className="space-y-2">
                  {content.posts.map(p => (
                    <button key={p.id} onClick={() => navigate(`/post/${p.id}`)} className="w-full flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-3 text-left">
                      {p.thumbnailUrl && <img src={p.thumbnailUrl} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <UserAvatar user={{ id: p.authorId, name: p.authorName, avatar: p.authorAvatar ?? undefined }} size={20} />
                          <p className="text-xs font-bold text-gray-900 truncate">{p.authorName}</p>
                          {p.authorVerified && <BadgeCheck className="w-3 h-3 text-blue-500 shrink-0" />}
                        </div>
                        <p className="text-xs text-gray-600 truncate mt-0.5">{p.content}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {content.portfolio.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-sm font-black text-gray-900">Portfolio</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {content.portfolio.map(entry => (
                    <button
                      key={`${entry.type}-${entry.id}`}
                      onClick={() => setOpenPortfolio({ creatorId: entry.creatorId, albumId: entry.type === 'album' ? entry.id : undefined })}
                      className="relative rounded-xl overflow-hidden bg-gray-100"
                      style={{ aspectRatio: 4 / 5 }}
                    >
                      {entry.thumbnailUrl ? <img src={entry.thumbnailUrl} alt="" className="w-full h-full object-cover" /> : (
                        <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">🎬</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {content.courses.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-sm font-black text-gray-900">Courses</p>
                <div className="flex gap-3 overflow-x-auto no-scrollbar">
                  {content.courses.map(c => <div key={c.id} className="shrink-0 w-56"><CourseCard course={c} /></div>)}
                </div>
              </div>
            )}

            {content.listings.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-sm font-black text-gray-900">Listings</p>
                <div className="grid grid-cols-2 gap-3">
                  {content.listings.map(l => (
                    <ListingCard key={l.id} listing={l} onClick={() => navigate(`/listing/${l.id}`)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {openPortfolio && (
        <DraggablePortfolioPage creatorId={openPortfolio.creatorId} initialAlbumId={openPortfolio.albumId} onClose={() => setOpenPortfolio(null)} />
      )}
    </div>
  );
}
