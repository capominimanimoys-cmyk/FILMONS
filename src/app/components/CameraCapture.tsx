import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Camera, RefreshCw, ZoomIn, ZoomOut, Check } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode]   = useState<'user' | 'environment'>('environment');
  const [captured, setCaptured]       = useState<string | null>(null);
  const [error, setError]             = useState('');
  const [starting, setStarting]       = useState(true);
  const [hasMultipleCams, setHasMultipleCams] = useState(false);
  const [flash, setFlash]             = useState(false);

  // ── Start / restart camera ──────────────────────────────────────
  const startCamera = useCallback(async (mode: 'user' | 'environment') => {
    setStarting(true);
    setError('');

    // Stop any existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Check for multiple cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      setHasMultipleCams(devices.filter(d => d.kind === 'videoinput').length > 1);
    } catch (e: any) {
      if (e.name === 'NotAllowedError') {
        setError('Camera access denied. Please allow camera permissions and try again.');
      } else if (e.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else {
        setError('Could not start camera: ' + e.message);
      }
    } finally {
      setStarting(false);
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []); // eslint-disable-line

  // ── Flip camera ─────────────────────────────────────────────────
  const flipCamera = async () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    setCaptured(null);
    await startCamera(next);
  };

  // ── Shutter ─────────────────────────────────────────────────────
  const handleShutter = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Flash effect
    setFlash(true);
    setTimeout(() => setFlash(false), 200);

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;

    // Mirror front camera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCaptured(dataUrl);

    // Pause stream while reviewing
    video.pause();
  };

  // ── Retake ──────────────────────────────────────────────────────
  const handleRetake = async () => {
    setCaptured(null);
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      await videoRef.current.play();
    }
  };

  // ── Use photo ───────────────────────────────────────────────────
  const handleUse = () => {
    if (captured) {
      onCapture(captured);
      onClose();
    }
  };

  // ── Close on Escape ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {/* Flash overlay */}
      {flash && <div className="absolute inset-0 bg-white z-50 pointer-events-none animate-ping opacity-80" />}

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ── Error state ── */}
      {error ? (
        <div className="flex flex-col items-center gap-4 p-8 text-center max-w-sm">
          <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center">
            <Camera className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-white font-medium">Camera unavailable</p>
          <p className="text-gray-400 text-sm">{error}</p>
          <button onClick={onClose} className="mt-2 px-6 py-2.5 bg-white text-gray-900 rounded-full font-medium text-sm hover:bg-gray-100">
            Close
          </button>
        </div>
      ) : (
        <>
          {/* ── Video / captured preview ── */}
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Live feed */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-opacity duration-200 ${
                facingMode === 'user' ? '-scale-x-100' : ''
              } ${captured ? 'hidden' : 'block'}`}
            />

            {/* Captured preview */}
            {captured && (
              <img src={captured} alt="Captured" className="w-full h-full object-contain bg-black" />
            )}

            {/* Starting spinner */}
            {starting && !captured && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <p className="text-white text-sm">Starting camera…</p>
                </div>
              </div>
            )}

            {/* ── Top bar ── */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
              <button onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors">
                <X className="w-5 h-5" />
              </button>
              <span className="text-white text-sm font-medium tracking-wide">
                {captured ? 'Use this photo?' : 'Take a photo'}
              </span>
              {/* Flip button (top-right, shown only if multiple cameras) */}
              {hasMultipleCams && !captured && (
                <button onClick={flipCamera}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors">
                  <RefreshCw className="w-5 h-5" />
                </button>
              )}
              {!hasMultipleCams && <div className="w-10" />}
            </div>

            {/* ── Bottom controls ── */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-8 p-8 bg-gradient-to-t from-black/70 to-transparent">
              {!captured ? (
                <>
                  {/* Spacer */}
                  <div className="w-12" />

                  {/* Shutter button */}
                  <button
                    onClick={handleShutter}
                    disabled={starting}
                    className="w-20 h-20 rounded-full border-4 border-white bg-white/20 hover:bg-white/30 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center"
                  >
                    <div className="w-14 h-14 rounded-full bg-white" />
                  </button>

                  {/* Flip (bottom row, always visible for symmetry) */}
                  {hasMultipleCams ? (
                    <button onClick={flipCamera}
                      className="w-12 h-12 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors">
                      <RefreshCw className="w-5 h-5" />
                    </button>
                  ) : <div className="w-12" />}
                </>
              ) : (
                /* ── Review controls ── */
                <>
                  <button onClick={handleRetake}
                    className="flex flex-col items-center gap-1.5 text-white">
                    <div className="w-14 h-14 rounded-full bg-black/50 border border-white/30 flex items-center justify-center hover:bg-black/70 transition-colors">
                      <RefreshCw className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-medium">Retake</span>
                  </button>

                  <button onClick={handleUse}
                    className="flex flex-col items-center gap-1.5 text-white">
                    <div className="w-16 h-16 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center hover:bg-blue-700 transition-colors shadow-lg">
                      <Check className="w-7 h-7" />
                    </div>
                    <span className="text-xs font-medium">Use Photo</span>
                  </button>
                </>
              )}
            </div>

            {/* Guide overlay — viewfinder corners */}
            {!captured && !starting && (
              <div className="absolute inset-10 pointer-events-none">
                {/* TL */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/50 rounded-tl" />
                {/* TR */}
                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/50 rounded-tr" />
                {/* BL */}
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/50 rounded-bl" />
                {/* BR */}
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/50 rounded-br" />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
