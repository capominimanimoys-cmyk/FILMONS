// Portfolio item media renderer (image / video with tap-to-play / audio) --
// extracted out of PortfolioFeedCard.tsx so the new desktop Connect cards
// reuse the exact same aspect-ratio-preserving logic instead of a second
// implementation. Never stretches: the container's aspect-ratio comes from
// the item's own stored aspect_ratio (real width/height metadata captured
// at upload time -- see AddPortfolioItemSheet.tsx), so orientation is
// respected and the box is reserved before the asset loads (no feed layout
// shift). object-contain (not cover) is what keeps MEDIA_MAX_HEIGHT's cap
// from cropping the media instead of just letterboxing it. This is also
// what satisfies "original video ratio = poster ratio = container ratio =
// playback ratio, no layout jump on play" -- the SAME box/ratio is used for
// the poster and the <video> element, nothing swaps dimensions on tap.
import { useState } from 'react';
import { Play } from 'lucide-react';
import { PortfolioItem } from '../lib/portfolioApi';

const MEDIA_MAX_HEIGHT = 'lg:max-h-[750px]';

export function PortfolioMedia({ item, capHeight = true }: { item: PortfolioItem; capHeight?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const maxHeightClass = capHeight ? MEDIA_MAX_HEIGHT : '';
  if (item.media_type === 'video') {
    return (
      <div className={`relative w-full bg-black rounded-2xl overflow-hidden mx-auto ${maxHeightClass}`} style={{ aspectRatio: item.aspect_ratio || 16 / 9 }}>
        {playing ? (
          <video src={item.media_url} controls autoPlay muted className="w-full h-full object-contain" />
        ) : (
          <button onClick={() => setPlaying(true)} className="relative w-full h-full block">
            {item.thumbnail_url
              ? <img src={item.thumbnail_url} alt="" className="w-full h-full object-contain" />
              : <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">🎬</div>}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center">
                <Play className="w-6 h-6 text-gray-900 ml-0.5" fill="currentColor" />
              </div>
            </div>
          </button>
        )}
      </div>
    );
  }
  if (item.media_type === 'audio') {
    return (
      <div className="w-full rounded-2xl bg-gray-100 p-4">
        <audio src={item.media_url} controls className="w-full" />
      </div>
    );
  }
  // image / link -- link items still usually carry a preview thumbnail
  return (
    <div className={`w-full rounded-2xl overflow-hidden bg-gray-100 mx-auto ${maxHeightClass}`} style={{ aspectRatio: item.aspect_ratio || 4 / 5 }}>
      {(item.media_url || item.thumbnail_url)
        ? <img src={item.media_url || item.thumbnail_url} alt="" className="w-full h-full object-contain" />
        : <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">🎨</div>}
    </div>
  );
}
