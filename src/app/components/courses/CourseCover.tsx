// A course's cover: the image, or -- when the instructor added one -- a
// silent looping cover video with the image as its poster. The video only
// loads and plays while it's on screen (and never autoplays with Reduce
// Motion on), so a page full of cards doesn't download every video.
import { useEffect, useRef, type ReactNode } from 'react';

export function CourseCover({ imageUrl, videoUrl, play = true, fallback, className = 'h-full w-full object-cover' }: {
  imageUrl: string | null | undefined;
  videoUrl?: string | null;
  /** false for tiny thumbnails: show the image (or the video's first frame) without playing. */
  play?: boolean;
  fallback?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const animate = !!videoUrl && play;

  useEffect(() => {
    const v = ref.current;
    if (!v || !animate || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { v.preload = 'auto'; v.play().catch(() => {}); }
      else v.pause();
    }, { threshold: 0.35 });
    io.observe(v);
    return () => { io.disconnect(); v.pause(); };
  }, [animate, videoUrl]);

  if (videoUrl && (play || !imageUrl)) {
    return (
      <video ref={ref} src={videoUrl} poster={imageUrl || undefined} muted loop playsInline
        preload={play && imageUrl ? 'none' : 'metadata'} aria-hidden="true" className={className} />
    );
  }
  if (imageUrl) return <img src={imageUrl} alt="" loading="lazy" className={className} />;
  return <>{fallback ?? null}</>;
}
