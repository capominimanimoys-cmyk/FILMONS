/**
 * StoryViewer.tsx
 * Full-screen Instagram-style story viewer.
 * - Progress bar per slide (auto-advance)
 * - Tap left/right to navigate
 * - Swipe down to close
 * - Poll voting
 * - Link tap
 * - Marks story as viewed
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Link2, Music, ChevronLeft, ChevronRight } from 'lucide-react';
import { Story, StorySlide, markStoryViewed, voteOnPoll } from './StoryCreator';
import { UserAvatar } from './AccountTypeBadge';
import { useAuth } from '../context/AuthContext';

const SLIDE_DURATION = 5000; // ms per image slide

interface StoryViewerProps {
  stories: Story[];
  initialIndex: number;
  onClose: () => void;
  onStoriesUpdate: () => void;
}

export function StoryViewer({ stories, initialIndex, onClose, onStoriesUpdate }: StoryViewerProps) {
  const { user } = useAuth();
  const [storyIdx, setStoryIdx] = useState(initialIndex);
  const [slideIdx, setSlideIdx] = useState(0);
  const [progress,  setProgress] = useState(0);
  const [paused,    setPaused]   = useState(false);
  const [visible,   setVisible]  = useState(false);

  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef    = useRef<number>(0);
  const elapsedRef  = useRef<number>(0);
  const dragStartY  = useRef<number | null>(null);

  const story = stories[storyIdx];
  const slide = story?.slides[slideIdx];

  // Animate in
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  // Mark viewed
  useEffect(() => {
    if (story && user) markStoryViewed(story.id, user.id);
  }, [story?.id, user?.id]);

  const close = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  const nextSlide = useCallback(() => {
    if (!story) return;
    if (slideIdx < story.slides.length - 1) {
      setSlideIdx(s => s + 1);
      setProgress(0);
      elapsedRef.current = 0;
    } else if (storyIdx < stories.length - 1) {
      setStoryIdx(i => i + 1);
      setSlideIdx(0);
      setProgress(0);
      elapsedRef.current = 0;
    } else {
      close();
    }
  }, [story, slideIdx, storyIdx, stories.length, close]);

  const prevSlide = useCallback(() => {
    if (slideIdx > 0) {
      setSlideIdx(s => s - 1);
    } else if (storyIdx > 0) {
      setStoryIdx(i => i - 1);
      setSlideIdx(0);
    }
    setProgress(0);
    elapsedRef.current = 0;
  }, [slideIdx, storyIdx]);

  // Progress timer
  useEffect(() => {
    if (paused || !slide) return;
    const duration = slide.type === 'video' ? 15_000 : SLIDE_DURATION;
    const tick = 50;
    startRef.current = Date.now() - elapsedRef.current;

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      elapsedRef.current = elapsed;
      const pct = Math.min((elapsed / duration) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(timerRef.current!);
        nextSlide();
      }
    }, tick);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [slide, paused, slideIdx, storyIdx, nextSlide]);

  // Pause on hold
  const handlePressStart = () => { setPaused(true); if (timerRef.current) clearInterval(timerRef.current); };
  const handlePressEnd   = () => { setPaused(false); };

  // Swipe down to close
  const onTouchStart = (e: React.TouchEvent) => { dragStartY.current = e.touches[0].clientY; };
  const onTouchEnd   = (e: React.TouchEvent) => {
    if (dragStartY.current !== null && e.changedTouches[0].clientY - dragStartY.current > 80) close();
    dragStartY.current = null;
  };

  // Poll vote
  const handleVote = (option: 'A' | 'B') => {
    if (!user || !story || !slide) return;
    voteOnPoll(story.id, slide.id, option, user.id);
    onStoriesUpdate();
  };

  const timeAgo = (iso: string) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  };

  if (!story || !slide) return null;

  const hasVoted = slide.poll && user ? slide.poll.voters.includes(user.id) : false;
  const totalVotes = slide.poll ? slide.poll.votesA + slide.poll.votesB : 0;
  const pctA = totalVotes > 0 ? Math.round((slide.poll!.votesA / totalVotes) * 100) : 50;
  const pctB = 100 - pctA;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.3s' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Story card — 9:16 */}
      <div
        className="relative overflow-hidden rounded-none md:rounded-2xl shadow-2xl"
        style={{ width: '100%', maxWidth: 420, height: '100vh', maxHeight: 750, background: slide.bgColor || '#000' }}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onTouchStart={e => { handlePressStart(); onTouchStart(e); }}
        onTouchEnd={e => { handlePressEnd(); onTouchEnd(e); }}
      >
        {/* Media */}
        {slide.url && slide.type === 'image' && (
          <img src={slide.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {slide.url && slide.type === 'video' && (
          <video src={slide.url} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover" />
        )}

        {/* Dark gradient top/bottom */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/60 to-transparent" />

        {/* Progress bars */}
        <div className="absolute top-3 left-3 right-3 flex gap-1 z-10">
          {story.slides.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-none"
                style={{ width: i < slideIdx ? '100%' : i === slideIdx ? `${progress}%` : '0%' }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-6 left-3 right-3 flex items-center gap-2.5 z-10">
          <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-white flex-shrink-0">
            {story.userAvatar
              ? <img src={story.userAvatar} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">{story.userName[0]}</div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-bold truncate">{story.userName}</p>
            <p className="text-white/60 text-[10px]">{timeAgo(story.createdAt)} ago</p>
          </div>
          {story.music && (
            <div className="flex items-center gap-1 bg-black/30 rounded-full px-2 py-0.5">
              <Music className="w-2.5 h-2.5 text-white" />
              <span className="text-white text-[9px] max-w-[60px] truncate">{story.music}</span>
            </div>
          )}
          <button onClick={close} className="w-7 h-7 flex items-center justify-center text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Text overlays */}
        {slide.textOverlays.map(t => (
          <div key={t.id}
            className="absolute select-none pointer-events-none"
            style={{ left: `${t.x}%`, top: `${t.y}%`, transform: 'translate(-50%,-50%)', color: t.color, fontSize: t.size, fontWeight: t.bold ? 700 : 400, textShadow: '0 1px 6px rgba(0,0,0,0.6)', maxWidth: '85%', textAlign: 'center', lineHeight: 1.25 }}
          >
            {t.text}
          </div>
        ))}

        {/* Stickers */}
        {slide.stickers.map(s => (
          <div key={s.id}
            className="absolute select-none pointer-events-none"
            style={{ left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%,-50%)', fontSize: s.size }}
          >
            {s.emoji}
          </div>
        ))}

        {/* Poll */}
        {slide.poll && (
          <div className="absolute bottom-28 left-4 right-4 bg-white/20 backdrop-blur-md rounded-2xl p-3 border border-white/30">
            <p className="text-white text-sm font-bold text-center mb-3">{slide.poll.question}</p>
            {hasVoted ? (
              <div className="space-y-2">
                {[{ label: slide.poll.optionA, pct: pctA, votes: slide.poll.votesA },
                  { label: slide.poll.optionB, pct: pctB, votes: slide.poll.votesB }].map(({ label, pct, votes }) => (
                  <div key={label} className="relative overflow-hidden rounded-xl">
                    <div className="absolute inset-0 bg-white/20 rounded-xl" />
                    <div className="absolute top-0 left-0 bottom-0 bg-white/40 rounded-xl transition-all" style={{ width: `${pct}%` }} />
                    <div className="relative flex items-center justify-between px-3 py-2">
                      <span className="text-white text-xs font-semibold">{label}</span>
                      <span className="text-white text-xs font-bold">{pct}%</span>
                    </div>
                  </div>
                ))}
                <p className="text-white/60 text-[10px] text-center">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => handleVote('A')}
                  className="bg-blue-500/70 rounded-xl py-2 text-white text-xs font-bold hover:bg-blue-500/90 transition-colors">
                  {slide.poll.optionA}
                </button>
                <button onClick={() => handleVote('B')}
                  className="bg-pink-500/70 rounded-xl py-2 text-white text-xs font-bold hover:bg-pink-500/90 transition-colors">
                  {slide.poll.optionB}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Link sticker */}
        {slide.link && (
          <a href={slide.link} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-white rounded-full px-4 py-2 flex items-center gap-2 shadow-lg hover:scale-105 transition-transform z-10">
            <Link2 className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs font-bold text-gray-800 max-w-[160px] truncate">{slide.link}</span>
          </a>
        )}

        {/* Tap zones */}
        <button
          className="absolute left-0 top-0 bottom-0 w-1/3 z-20"
          onClick={e => { e.stopPropagation(); prevSlide(); }}
          aria-label="Previous"
        />
        <button
          className="absolute right-0 top-0 bottom-0 w-1/3 z-20"
          onClick={e => { e.stopPropagation(); nextSlide(); }}
          aria-label="Next"
        />

        {/* Paused indicator */}
        {paused && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="w-12 h-12 bg-black/40 rounded-full flex items-center justify-center">
              <div className="flex gap-1">
                <div className="w-1 h-5 bg-white rounded-full" />
                <div className="w-1 h-5 bg-white rounded-full" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Prev/next story arrows (desktop) */}
      {storyIdx > 0 && (
        <button onClick={prevSlide}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors hidden md:flex">
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {storyIdx < stories.length - 1 && (
        <button onClick={nextSlide}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors hidden md:flex">
          <ChevronRight className="w-6 h-6" />
        </button>
      )}
    </div>,
    document.body
  );
}