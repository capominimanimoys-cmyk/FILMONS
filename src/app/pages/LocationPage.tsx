// FILMONS -- /search/location/:key. Real content across every content
// type that actually supports locations today (posts, Portfolio items/
// albums, listings/services/opportunities -- all one `listings` table).
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, MapPin, BadgeCheck } from 'lucide-react';
import { getLocation, getLocationContent, type LocationContent } from '../lib/locationsApi';
import { UserAvatar } from '../components/AccountTypeBadge';
import { usePortfolioPreview } from '../context/PortfolioPreviewContext';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';

export function LocationPage() {
  const { key } = useParams();
  const navigate = useNavigate();
  const { openPortfolioPreview } = usePortfolioPreview();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [mentionCount, setMentionCount] = useState<number | null>(null);
  const [content, setContent] = useState<LocationContent | null>(null);

  useEffect(() => {
    if (!key) return;
    getLocation(key).then(l => { setDisplayName(l?.displayName ?? key); setMentionCount(l?.mentionCount ?? 0); });
    getLocationContent(key).then(setContent);
  }, [key]);

  const nothingYet = content && !content.posts.length && !content.portfolio.length && !content.listings.length;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <p className="text-sm font-bold text-gray-900 truncate">{displayName ?? '…'}</p>
      </div>

      <div className="lg:max-w-3xl lg:mx-auto px-4 py-5 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
            <MapPin className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <p className="text-xl font-black text-gray-900">{displayName ?? '…'}</p>
            <p className="text-sm text-gray-400">{mentionCount === null ? '…' : `${mentionCount} result${mentionCount === 1 ? '' : 's'}`}</p>
          </div>
        </div>

        {content === null ? (
          <div className="flex justify-center py-16"><FilmonsBrandLoader size="md" label="Loading" /></div>
        ) : nothingYet ? (
          <p className="text-center text-sm text-gray-400 py-16">No content found for {displayName} yet.</p>
        ) : (
          <>
            {content.posts.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-sm font-black text-gray-900">Posts <span className="text-gray-400 font-semibold">· {content.posts.length}</span></p>
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
                <p className="text-sm font-black text-gray-900">Portfolio <span className="text-gray-400 font-semibold">· {content.portfolio.length}</span></p>
                <div className="grid grid-cols-3 gap-1.5">
                  {content.portfolio.map(entry => (
                    <button
                      key={`${entry.type}-${entry.id}`}
                      onClick={() => openPortfolioPreview(entry.creatorId, entry.type === 'album' ? entry.id : undefined)}
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

            {content.listings.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-sm font-black text-gray-900">Listings <span className="text-gray-400 font-semibold">· {content.listings.length}</span></p>
                <div className="grid grid-cols-2 gap-2">
                  {content.listings.map(l => (
                    <button key={l.id} onClick={() => navigate(`/listing/${l.id}`)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden text-left">
                      <div className="w-full bg-gray-100" style={{ aspectRatio: 4 / 3 }}>
                        {l.image ? <img src={l.image} alt="" className="w-full h-full object-cover" /> : (
                          <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">📦</div>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="text-xs font-bold text-gray-900 truncate">{l.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">${l.price}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
