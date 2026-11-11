import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Scissors, X } from 'lucide-react';
import { maxTrimSeconds, trimVideo } from '../lib/mediaCompress';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Lets the person cut a video down to the part they want when it is too large to upload.
 *  The selection can be shorter than the allowed length but never longer. */
export function VideoTrimDialog({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (trimmed: File) => void }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const vref = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const maxLen = duration ? maxTrimSeconds(file, duration) : 0;
  const len = end - start;
  const tooLong = duration > 0 && len > maxLen + 0.05;

  const onMeta = () => {
    const d = vref.current?.duration || 0;
    setDuration(d);
    setStart(0);
    setEnd(Math.min(d, maxTrimSeconds(file, d)));
  };

  const moveStart = (v: number) => {
    const s = Math.min(v, end - 0.5);
    setStart(s);
    if (end - s > maxLen) setEnd(Math.min(duration, s + maxLen));
    if (vref.current) vref.current.currentTime = s;
  };
  const moveEnd = (v: number) => {
    const e = Math.max(v, start + 0.5);
    setEnd(e);
    if (e - start > maxLen) setStart(Math.max(0, e - maxLen));
    if (vref.current) vref.current.currentTime = Math.max(0, Math.min(start, e - 0.5));
  };

  // Preview loops inside the chosen part.
  const onTime = () => {
    const v = vref.current;
    if (v && !v.paused && v.currentTime >= end) { v.currentTime = start; }
  };

  const save = async () => {
    if (tooLong || progress !== null) return;
    setError(null);
    setProgress(0);
    vref.current?.pause();
    try {
      const out = await trimVideo(file, { start, end }, setProgress);
      onDone(out);
    } catch (e: any) {
      setError(e?.message === 'video compression unsupported'
        ? 'Your browser can’t trim videos. Please trim the video in your phone’s gallery and pick it again.'
        : 'Could not trim this video. Try a shorter part, or trim it in your gallery first.');
      setProgress(null);
    }
  };

  const busy = progress !== null;
  return (
    <div className="fixed inset-0 z-[110] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={busy ? undefined : onCancel}>
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2"><Scissors className="w-4 h-4" /> Trim your video</h3>
            <p className="text-xs text-gray-500 mt-1 leading-snug">
              This video ({Math.round(file.size / 1048576)} MB) is too large to upload.
              {maxLen ? ` Keep at most ${fmt(maxLen)} — you can choose a shorter part, not a longer one.` : ''}
            </p>
          </div>
          {!busy && <button onClick={onCancel} aria-label="Close" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><X className="w-4 h-4 text-gray-500" /></button>}
        </div>

        <video ref={vref} src={url} controls playsInline onLoadedMetadata={onMeta} onTimeUpdate={onTime}
          className="w-full max-h-64 bg-black rounded-2xl" />

        {duration > 0 && (
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs font-semibold text-gray-600"><span>Start</span><span>{fmt(start)}</span></div>
              <input type="range" min={0} max={duration} step={0.1} value={start} disabled={busy} onChange={e => moveStart(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <div className="flex justify-between text-xs font-semibold text-gray-600"><span>End</span><span>{fmt(end)}</span></div>
              <input type="range" min={0} max={duration} step={0.1} value={end} disabled={busy} onChange={e => moveEnd(Number(e.target.value))} className="w-full" />
            </div>
            <p className={`text-xs font-bold ${tooLong ? 'text-red-600' : 'text-gray-700'}`}>
              Selected {fmt(len)} of {fmt(maxLen)} allowed
            </p>
          </div>
        )}

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs px-3 py-2.5">{error}</div>}

        <div className="flex gap-2">
          <button onClick={onCancel} disabled={busy} className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-bold disabled:opacity-40">Cancel</button>
          <button onClick={save} disabled={busy || tooLong || !duration}
            className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Trimming… {progress}%</> : 'Use this part'}
          </button>
        </div>
        {busy && <p className="text-[11px] text-gray-400 text-center">Trimming plays the selected part once, so it takes about as long as the clip.</p>}
      </div>
    </div>
  );
}

/** Same dialog for a video that only exists as a local blob: URL (the composer keeps those, not Files). */
export function VideoTrimFromUrl({ url, onCancel, onDone }: { url: string; onCancel: () => void; onDone: (trimmed: File) => void }) {
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    let off = false;
    fetch(url).then(r => r.blob()).then(b => { if (!off) setFile(new File([b], 'video', { type: b.type || 'video/mp4', lastModified: Date.now() })); }).catch(onCancel);
    return () => { off = true; };
  }, [url]);   // eslint-disable-line
  if (!file) return null;
  return <VideoTrimDialog file={file} onCancel={onCancel} onDone={onDone} />;
}
