import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, Play, Pause, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { captureVideoFrameBlob, seekVideoTo, formatTimestamp } from '../lib/videoFrame';

type Step = 'scrub' | 'adjust';

interface Props {
  videoUrl: string;
  /** Already-uploaded (remote) video — needs crossOrigin so canvas capture isn't tainted by CORS. */
  isRemote?: boolean;
  onCancel: () => void;
  onConfirm: (frameBlob: Blob, timestamp: number, positionY: number) => void;
}

/**
 * Full-screen "choose a cover from this video" sheet: scrub a native range
 * input to a moment, capture that frame, then reposition it in a live
 * aspect-[4/3] preview (matching ListingCard's cover) before confirming.
 * No text inputs anywhere in this flow — scrubbing is a range slider, so it
 * never triggers the mobile keyboard or the iOS input-zoom behavior.
 */
export function VideoCoverPicker({ videoUrl, isRemote, onCancel, onConfirm }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [step, setStep] = useState<Step>('scrub');
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [framePreview, setFramePreview] = useState<string | null>(null);
  const [frameBlob, setFrameBlob] = useState<Blob | null>(null);
  const [positionY, setPositionY] = useState(50);

  useEffect(() => () => { if (framePreview) URL.revokeObjectURL(framePreview); }, [framePreview]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
  };

  const scrub = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = t;
    setCurrentTime(t);
  };

  const stepTime = (delta: number) => scrub(Math.max(0, Math.min(duration, currentTime + delta)));

  const handleUseFrame = async () => {
    const v = videoRef.current;
    if (!v) return;
    setCapturing(true);
    try {
      await seekVideoTo(v, currentTime);
      const blob = await captureVideoFrameBlob(v);
      setFrameBlob(blob);
      setFramePreview(URL.createObjectURL(blob));
      setStep('adjust');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not capture this frame');
    } finally {
      setCapturing(false);
    }
  };

  const handleConfirm = () => {
    if (!frameBlob) return;
    onConfirm(frameBlob, currentTime, positionY);
  };

  return (
    <>
      <style>{`@keyframes vcpUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div
        className="fixed inset-0 z-[91] bg-black flex flex-col"
        style={{ animation: 'vcpUp 0.25s cubic-bezier(0.32,0.72,0,1)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0">
          <button
            onClick={step === 'adjust' ? () => setStep('scrub') : onCancel}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white"
          >
            {step === 'adjust' ? <ChevronLeft className="w-4 h-4" /> : <X className="w-4 h-4" />}
          </button>
          <p className="text-white text-sm font-black">{step === 'scrub' ? 'Choose your cover' : 'Adjust cover'}</p>
          <div className="w-9" />
        </div>

        {step === 'scrub' ? (
          <>
            <p className="text-white/50 text-xs text-center px-6 -mt-1 mb-2">
              Move through the video and select the moment you want to use as your listing cover.
            </p>
            <div className="flex-1 flex items-center justify-center px-4 min-h-0">
              <video
                key={videoUrl}
                ref={videoRef}
                crossOrigin={isRemote ? 'anonymous' : undefined}
                src={videoUrl}
                muted
                playsInline
                preload="metadata"
                onLoadedMetadata={e => setDuration(e.currentTarget.duration || 0)}
                onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                className="max-w-full max-h-full rounded-xl"
              />
            </div>
            <div className="shrink-0 px-5 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
              <div className="flex items-center justify-center mb-2">
                <span className="text-white/70 text-xs font-mono tabular-nums">
                  {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.01}
                value={currentTime}
                onChange={e => scrub(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex items-center justify-center gap-6 mt-4">
                <button onClick={() => stepTime(-0.5)} className="text-white/70 text-xs font-bold px-3 py-2">−0.5s</button>
                <button onClick={togglePlay} className="w-12 h-12 rounded-full bg-white flex items-center justify-center shrink-0">
                  {playing ? <Pause className="w-5 h-5 text-black fill-black" /> : <Play className="w-5 h-5 text-black fill-black ml-0.5" />}
                </button>
                <button onClick={() => stepTime(0.5)} className="text-white/70 text-xs font-bold px-3 py-2">+0.5s</button>
              </div>
              <button
                onClick={handleUseFrame}
                disabled={capturing || duration === 0}
                className="w-full mt-5 py-4 rounded-2xl bg-blue-600 text-white text-sm font-black disabled:opacity-40 active:scale-[0.98] transition-all"
              >
                {capturing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Use this frame'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0">
              <div className="w-full max-w-sm rounded-2xl overflow-hidden bg-gray-900" style={{ aspectRatio: '4 / 3' }}>
                {framePreview && (
                  <img
                    src={framePreview}
                    alt="Cover preview"
                    className="w-full h-full object-cover"
                    style={{ objectPosition: `50% ${positionY}%` }}
                  />
                )}
              </div>
              <p className="text-white/40 text-[11px] mt-3">Preview — how this appears on the marketplace</p>
            </div>
            <div className="shrink-0 px-5 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5 block">Reposition</label>
              <input
                type="range"
                min={0}
                max={100}
                value={positionY}
                onChange={e => setPositionY(Number(e.target.value))}
                className="w-full accent-blue-500 mb-5"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setStep('scrub')}
                  className="flex-1 py-3.5 rounded-2xl border border-white/20 text-white text-sm font-bold"
                >
                  Choose another frame
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-3.5 rounded-2xl bg-blue-600 text-white text-sm font-black flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" /> Use as cover
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
