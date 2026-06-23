/**
 * Filmons — AudioPostComposer
 * Dedicated SoundCloud-inspired audio upload flow.
 * Steps: Select → Details → Publish
 */
import { useState, useRef, useEffect } from 'react';
import {
  X, ChevronLeft, Upload, Mic, Music2, Play, Pause,
  Image as ImageIcon, Sparkles, Globe, Users, Lock,
  MessageCircle, Download, Check, Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { postsApi } from '../lib/api';
import { createAudioFromPost } from '../lib/audioApi';
import * as notifs from '../lib/notifications';
import { toast } from 'sonner';

type Step       = 'select' | 'details' | 'publish';
type Visibility = 'public' | 'followers' | 'private';

const GENRES = ['Music', 'Podcast', 'Spoken Word', 'Worship', 'Motivation', 'Education', 'Comedy', 'News'];
const MOODS  = ['Inspirational', 'Chill', 'Energetic', 'Romantic', 'Melancholic', 'Happy', 'Peaceful'];

// ── Normalize non-standard audio MIME types ────────────────────────────────
function normalizeAudioMime(raw: string): { ext: string; contentType: string; bucket: 'audio' | 'posts' } {
  const m = raw.toLowerCase().trim();
  if (m === 'audio/mpeg'   || m === 'audio/mp3')    return { ext: 'mp3',  contentType: 'audio/mpeg',  bucket: 'audio' };
  if (m === 'audio/mp4'    || m === 'audio/x-m4a'
                            || m === 'audio/m4a')    return { ext: 'm4a',  contentType: 'audio/mp4',   bucket: 'audio' };
  if (m === 'audio/wav'    || m === 'audio/x-wav'
                            || m === 'audio/wave')   return { ext: 'wav',  contentType: 'audio/wav',   bucket: 'audio' };
  if (m === 'audio/ogg'    || m === 'audio/vorbis')  return { ext: 'ogg',  contentType: 'audio/ogg',   bucket: 'audio' };
  if (m === 'audio/aac')                             return { ext: 'aac',  contentType: 'audio/aac',   bucket: 'audio' };
  if (m === 'audio/webm')                            return { ext: 'webm', contentType: 'audio/webm',  bucket: 'audio' };
  if (m === 'audio/flac'   || m === 'audio/x-flac') return { ext: 'flac', contentType: 'audio/flac',  bucket: 'audio' };
  // Video files — posts bucket accepts video/* and browsers play audio from video URLs
  if (m === 'video/mp4'    || m === 'video/quicktime'
                            || m === 'video/x-m4v')  return { ext: 'mp4',  contentType: 'video/mp4',   bucket: 'posts' };
  if (m === 'video/webm')                            return { ext: 'webm', contentType: 'video/webm',  bucket: 'posts' };
  if (m === 'video/x-matroska' || m === 'video/mkv') return { ext: 'mkv',  contentType: 'video/mp4',   bucket: 'posts' };
  return { ext: 'mp3', contentType: 'audio/mpeg', bucket: 'audio' };
}

// ── Extract a thumbnail frame from a video file ────────────────────────────
function extractVideoThumbnail(videoFile: File): Promise<string> {
  return new Promise((resolve) => {
    const url   = URL.createObjectURL(videoFile);
    const video = document.createElement('video');
    video.src     = url;
    video.muted   = true;
    video.preload = 'metadata';
    const capture = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = Math.min(video.videoWidth,  1080);
      canvas.height = Math.min(video.videoHeight, 1080);
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    video.onseeked      = capture;
    video.onloadeddata  = () => { video.currentTime = Math.min(1, video.duration * 0.1 || 0); };
    video.onerror       = () => { URL.revokeObjectURL(url); resolve(''); };
  });
}

// ── Simulated waveform bars (deterministic from index) ────────────────────────
function makeWaveBars(count = 40) {
  return Array.from({ length: count }, (_, i) => ({
    height: 20 + Math.sin(i * 0.7) * 14 + Math.cos(i * 1.3) * 8 + (i % 3 === 0 ? 10 : 0),
  }));
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${on ? 'bg-indigo-500' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

// ── Waveform bar visualization ────────────────────────────────────────────────
function WaveBars({
  bars, progress, playing, onSeek, height = 40, barCount = 40,
}: {
  bars: { height: number }[];
  progress: number;
  playing: boolean;
  onSeek: (pct: number) => void;
  height?: number;
  barCount?: number;
}) {
  return (
    <div
      className="flex items-end gap-px cursor-pointer w-full"
      style={{ height }}
      onClick={e => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek(((e.clientX - rect.left) / rect.width) * 100);
      }}
    >
      {bars.map((bar, i) => {
        const filled = progress > (i / barCount) * 100;
        return (
          <div
            key={i}
            className="flex-1 rounded-full transition-colors"
            style={{
              height: Math.min(bar.height, height - 4),
              background: filled
                ? (playing ? '#818cf8' : '#6366f1')
                : 'rgba(99,102,241,0.2)',
            }}
          />
        );
      })}
    </div>
  );
}

// ── Publish-step preview player ───────────────────────────────────────────────
function PreviewPlayer({
  src, name, artist, artworkUrl,
}: {
  src: string; name: string; artist: string; artworkUrl?: string;
}) {
  const audioRef    = useRef<HTMLAudioElement>(null);
  const [playing,   setPlaying]   = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [curTime,   setCurTime]   = useState(0);
  const [duration,  setDuration]  = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onMeta  = () => setDuration(a.duration || 0);
    const onTime  = () => {
      setCurTime(a.currentTime);
      setProgress(a.duration ? (a.currentTime / a.duration) * 100 : 0);
    };
    const onEnded = () => { setPlaying(false); setProgress(0); };
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onEnded);
    return () => {
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('ended', onEnded);
    };
  }, [src]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().catch(() => {}); setPlaying(true); }
  };

  const seek = (pct: number) => {
    const a = audioRef.current;
    if (a?.duration) a.currentTime = (pct / 100) * a.duration;
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  const bars = makeWaveBars(40);

  return (
    <div
      className="rounded-3xl overflow-hidden"
      style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81,#1e293b)', padding: 20 }}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Cover + info */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-14 h-14 rounded-2xl overflow-hidden shrink-0"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
        >
          {artworkUrl
            ? <img src={artworkUrl} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-2xl">🎵</div>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-black text-white truncate">{name || 'Untitled'}</p>
          <p className="text-xs text-white/50 truncate mt-0.5">{artist}</p>
        </div>
      </div>

      {/* Waveform */}
      <WaveBars bars={bars} progress={progress} playing={playing} onSeek={seek} height={40} barCount={40} />

      {/* Controls */}
      <div className="flex items-center justify-between mt-3">
        <span className="text-[11px] font-mono text-white/40">{fmt(curTime)}</span>
        <button
          onClick={toggle}
          className="w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95"
          style={{ background: '#6366f1' }}
        >
          {playing
            ? <Pause className="w-4 h-4 text-white" />
            : <Play  className="w-4 h-4 text-white ml-0.5" />}
        </button>
        <span className="text-[11px] font-mono text-white/25">{fmt(duration)}</span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
interface Props {
  onClose: () => void;
  onPost?: (post?: any) => void;
}

export function AudioPostComposer({ onClose, onPost }: Props) {
  const { user }   = useAuth();
  const fileRef    = useRef<HTMLInputElement>(null);
  const coverRef   = useRef<HTMLInputElement>(null);

  const [step,       setStep]       = useState<Step>('select');
  const [publishing, setPublishing] = useState(false);

  // Audio / video file
  const [audioFile,      setAudioFile]      = useState<File | null>(null);
  const [audioUrl,       setAudioUrl]       = useState('');
  const [duration,       setDuration]       = useState(0);
  const [fileSize,       setFileSize]       = useState('');
  const [isVideoSource,  setIsVideoSource]  = useState(false);
  const [extracting,     setExtracting]     = useState(false); // processing video thumbnail

  // Details
  const [title,          setTitle]          = useState('');
  const [description,    setDesc]           = useState('');
  const [genre,          setGenre]          = useState('');
  const [mood,           setMood]           = useState('');
  const [coverFile,      setCoverFile]      = useState<File | null>(null);
  const [coverUrl,       setCoverUrl]       = useState('');
  const [visibility,     setVisibility]     = useState<Visibility>('public');
  const [allowComments,  setAllowComments]  = useState(true);
  const [allowDownloads, setAllowDownloads] = useState(false);

  // AI
  const [aiLoading,     setAiLoading]     = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{
    genre?: string;
    mood?:  string;
  } | null>(null);

  const bars   = makeWaveBars(40);
  const fmtDur = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  const fmtBytes = (b: number) =>
    b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

  // ── Audio / video file selection ──────────────────────────────────────────
  const handleAudioFile = async (file: File) => {
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    if (!isAudio && !isVideo) { toast.error('Please select an audio or video file'); return; }
    if (file.size > 500 * 1024 * 1024) { toast.error('File too large (max 500 MB)'); return; }

    const { contentType } = normalizeAudioMime(file.type);
    const normalizedBlob  = new Blob([file], { type: contentType });
    const url = URL.createObjectURL(normalizedBlob);

    setAudioFile(file);
    setAudioUrl(url);
    setFileSize(fmtBytes(file.size));
    setIsVideoSource(isVideo);

    const cleaned = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    setTitle(cleaned);

    // Duration from the media element (works for both audio and video)
    const a = new Audio(url);
    a.onloadedmetadata = () => setDuration(a.duration || 0);

    // For video: auto-extract thumbnail as cover art
    if (isVideo && !coverUrl) {
      setExtracting(true);
      try {
        const thumb = await extractVideoThumbnail(file);
        if (thumb) {
          setCoverUrl(thumb);
          // Keep coverFile null — we'll convert the data URL at publish time
        }
      } catch {}
      setExtracting(false);
    }

    triggerAI(cleaned);
  };

  // ── AI auto-metadata (keyword heuristics until a real audio-analysis API exists) ──
  const triggerAI = (name: string) => {
    setAiLoading(true);
    setAiSuggestions(null);
    setTimeout(() => {
      const lower = name.toLowerCase();
      let g = 'Spoken Word', m = 'Chill';
      if (/worship|praise|gospel|hymn/.test(lower))          { g = 'Worship';     m = 'Inspirational'; }
      else if (/podcast|talk|interview|show/.test(lower))    { g = 'Podcast';     m = 'Chill'; }
      else if (/motivat|inspire|hustle/.test(lower))         { g = 'Motivation';  m = 'Inspirational'; }
      else if (/music|beat|song|track|mix/.test(lower))      { g = 'Music';       m = 'Energetic'; }
      else if (/edu|learn|class|lesson|course/.test(lower))  { g = 'Education';   m = 'Chill'; }
      else if (/comedy|funny|laugh/.test(lower))             { g = 'Comedy';      m = 'Happy'; }
      setAiSuggestions({ genre: g, mood: m });
      setAiLoading(false);
    }, 1800);
  };

  // ── Cover art ─────────────────────────────────────────────────────────────
  const handleCoverFile = (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Please select an image'); return; }
    setCoverFile(file);
    setCoverUrl(URL.createObjectURL(file));
  };

  // ── Validate before advancing steps ───────────────────────────────────────
  const goToDetails = () => {
    if (!audioUrl) return;
    setStep('details');
  };

  const goToPublish = () => {
    if (!title.trim()) { toast.error('Add a title first'); return; }
    setStep('publish');
  };

  // ── Publish ───────────────────────────────────────────────────────────────
  const publish = async () => {
    if (!user || !audioFile || !audioUrl) return;
    if (!title.trim()) { toast.error('Please add a title'); return; }
    setPublishing(true);
    try {
      // 1. Upload audio/video — route to the right bucket.
      //    Audio files → 'audio' bucket (audio/* MIME types).
      //    Video files → 'posts' bucket (accepts video/*); browser plays audio from video URLs.
      const { ext: audioExt, contentType: audioContentType, bucket: audioBucket } = normalizeAudioMime(audioFile.type);
      const audioBlob = new Blob([audioFile], { type: audioContentType });
      const audioPath = isVideoSource
        ? `videos/${user.id}/${Date.now()}.${audioExt}`
        : `${user.id}/${Date.now()}.${audioExt}`;
      const { error: audioErr } = await supabase.storage
        .from(audioBucket)
        .upload(audioPath, audioBlob, { contentType: audioContentType });
      if (audioErr) throw new Error(`Upload failed: ${audioErr.message}`);
      const remoteAudio = supabase.storage.from(audioBucket).getPublicUrl(audioPath).data.publicUrl;

      // 2. Upload cover art.
      //    For video uploads, coverUrl may be a data: URL (extracted thumbnail) — upload it.
      //    For audio uploads, coverFile drives the upload.
      let remoteCover = '';
      const hasCoverDataUrl = coverUrl.startsWith('data:');
      if (hasCoverDataUrl || (coverFile && coverUrl)) {
        const coverBlob = await fetch(coverUrl).then(r => r.blob());
        const coverExt  = hasCoverDataUrl ? 'jpg' : (coverBlob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg');
        const coverType = hasCoverDataUrl ? 'image/jpeg' : coverBlob.type;
        const coverPath = `covers/${user.id}/${Date.now()}.${coverExt}`;
        const { error: coverErr } = await supabase.storage
          .from('posts')
          .upload(coverPath, coverBlob, { contentType: coverType });
        if (!coverErr)
          remoteCover = supabase.storage.from('posts').getPublicUrl(coverPath).data.publicUrl;
      }

      // 3. Create post row
      const postContent = [description, genre && `#${genre.toLowerCase()}`, mood && `#${mood.toLowerCase()}`]
        .filter(Boolean).join(' ') || title;

      const newPost = await postsApi.create(
        postContent,
        remoteCover ? [remoteCover] : [],
        [],
        [],
        [],
        allowComments,
        [remoteAudio],
        [title],
        allowDownloads,
        undefined,
        undefined,
        {
          audioTitle:  title,
          audioArtist: user.name || user.username || '',
          postType:    'audio',
        },
      );

      if (!newPost?.id) throw new Error('Post creation failed');

      // 4. Register in audio_tracks
      await createAudioFromPost(
        newPost.id,
        title,
        user.name || user.username || '',
        user.id,
        (genre || 'music').toLowerCase().replace(/ /g, '_'),
        remoteCover || undefined,
        remoteAudio,
      ).catch(() => {});

      toast.success('Audio published!');

      // Notify followers — fire-and-forget, cap at 100
      const followers: string[] = (user as any).followers || [];
      if (followers.length > 0) {
        followers.slice(0, 100).forEach(fid => {
          notifs.push(fid, {
            type:           'new_post' as any,
            fromUserId:     user.id,
            fromUserName:   user.name || user.username || '',
            fromUserAvatar: user.avatar || undefined,
            postId:         newPost.id,
            postContent:    title || undefined,
            postImage:      remoteCover || undefined,
          });
        });
      }

      onPost?.(newPost);
      onClose();
    } catch (e: any) {
      console.error('Audio publish error:', e);
      toast.error(e?.message || 'Publish failed');
      setPublishing(false);
    }
  };

  // ── Back navigation ────────────────────────────────────────────────────────
  const handleBack = () => {
    if (step === 'select')  onClose();
    if (step === 'details') setStep('select');
    if (step === 'publish') setStep('details');
  };

  // ── Header ─────────────────────────────────────────────────────────────────
  const TITLES: Record<Step, string> = {
    select:  'Upload Audio',
    details: 'Details',
    publish: 'Publish',
  };

  // ── Publishing overlay ─────────────────────────────────────────────────────
  if (publishing) return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6"
      style={{ background: 'linear-gradient(160deg,#0a0a0a,#111827)' }}>
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full" style={{ background: '#6366f1', opacity: 0.2, filter: 'blur(24px)', transform: 'scale(1.4)' }} />
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-12 h-12 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-lg font-black text-white">Publishing…</p>
        <p className="text-sm text-white/40 mt-1">Uploading and processing your audio</p>
      </div>
    </div>
  );

  return (
    <>
      {/* Hidden inputs */}
      <input
        ref={fileRef} type="file" accept="audio/*,video/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleAudioFile(f); e.target.value = ''; }}
      />
      <input
        ref={coverRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverFile(f); e.target.value = ''; }}
      />

      <style>{`
        @keyframes apcWaveBar {
          from { transform: scaleY(0.35); }
          to   { transform: scaleY(1);    }
        }
        @keyframes apcSlideUp {
          from { transform: translateY(100%); opacity: 0.7; }
          to   { transform: translateY(0);    opacity: 1;   }
        }
      `}</style>

      <div
        className="fixed inset-0 z-[60] bg-white flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', animation: 'apcSlideUp 0.32s cubic-bezier(0.32,0.72,0,1)' }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          className="shrink-0 flex items-center justify-between px-4 pt-12 pb-3"
          style={{ borderBottom: '1px solid #f3f4f6' }}
        >
          <button onClick={handleBack} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
            {step === 'select'
              ? <X className="w-5 h-5 text-gray-600" />
              : <ChevronLeft className="w-5 h-5 text-gray-600" />}
          </button>
          <p className="text-sm font-black text-gray-900">{TITLES[step]}</p>
          {/* Right action */}
          {step === 'select' && audioUrl && (
            <button onClick={goToDetails} className="text-sm font-black text-indigo-600">Next</button>
          )}
          {step === 'details' && (
            <button onClick={goToPublish} className="text-sm font-black text-indigo-600">Next</button>
          )}
          {step === 'publish' && (
            <button onClick={publish} className="text-sm font-black text-indigo-600">Publish</button>
          )}
          {(step === 'select' && !audioUrl) && <div className="w-9" />}
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ══ SELECT ═══════════════════════════════════════════════════════ */}
          {step === 'select' && (
            <>
              {!audioUrl ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 px-6">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full"
                      style={{ background: '#6366f1', opacity: 0.1, filter: 'blur(50px)', transform: 'scale(1.6)' }} />
                    <div className="w-24 h-24 rounded-3xl flex items-center justify-center relative"
                      style={{
                        background: 'linear-gradient(135deg,rgba(99,102,241,.14),rgba(139,92,246,.08))',
                        border: '1.5px solid rgba(99,102,241,.2)',
                      }}>
                      <Music2 className="w-10 h-10" style={{ color: '#6366f1' }} />
                    </div>
                  </div>

                  <div className="text-center">
                    <p className="text-xl font-black text-gray-900">Share your audio</p>
                    <p className="text-sm text-gray-400 mt-1">Music, podcasts, voice notes and more</p>
                  </div>

                  <div className="w-full space-y-3">
                    {/* Upload file */}
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left transition-all active:scale-[0.98]"
                      style={{ background: '#f9fafb', border: '1px solid #f0f0f0' }}
                    >
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                        <Upload className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-black text-gray-900">Upload Audio or Video</p>
                        <p className="text-xs text-gray-400 mt-0.5">MP3, WAV, M4A · MP4, MOV, WebM (max 500 MB)</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                      </svg>
                    </button>

                    {/* Record audio */}
                    <button
                      onClick={() => toast.info('Recording — coming soon')}
                      className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left transition-all active:scale-[0.98]"
                      style={{ background: '#f9fafb', border: '1px solid #f0f0f0' }}
                    >
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-pink-50 border border-pink-100">
                        <Mic className="w-5 h-5 text-pink-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-black text-gray-900">Record Audio</p>
                        <p className="text-xs text-gray-400 mt-0.5">Use your microphone</p>
                      </div>
                      <span className="text-[10px] font-black text-white bg-gradient-to-r from-pink-500 to-rose-500 px-2 py-0.5 rounded-full shrink-0">
                        Soon
                      </span>
                    </button>
                  </div>

                  <p className="text-[11px] text-gray-300 text-center px-4">
                    By uploading you confirm you have rights to share this audio
                  </p>
                </div>
              ) : (
                /* Audio selected — preview */
                <div className="px-4 pt-4 space-y-4 pb-10">

                  {/* Dark waveform card */}
                  <div
                    className="rounded-3xl overflow-hidden"
                    style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81,#1e293b)', padding: 20 }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                        {isVideoSource && (
                          <span className="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
                            VIDEO
                          </span>
                        )}
                        <p className="text-sm font-black text-white truncate">{title || (isVideoSource ? 'Video File' : 'Audio File')}</p>
                      </div>
                      <button
                        onClick={() => { setAudioUrl(''); setAudioFile(null); setTitle(''); setDuration(0); setFileSize(''); setAiSuggestions(null); setIsVideoSource(false); setCoverUrl(''); setCoverFile(null); }}
                        className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0"
                      >
                        <X className="w-3.5 h-3.5 text-white/60" />
                      </button>
                    </div>

                    {/* Extracting video thumbnail indicator */}
                    {extracting && (
                      <div className="flex items-center gap-2 mb-3 px-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400 shrink-0" />
                        <p className="text-[11px] text-white/50">Extracting cover from video…</p>
                      </div>
                    )}

                    {/* Animated waveform */}
                    <div className="flex items-end gap-px mb-3" style={{ height: 44 }}>
                      {bars.map((bar, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-full"
                          style={{
                            height: `${Math.min(bar.height, 40)}px`,
                            background: 'rgba(129,140,248,0.55)',
                            animation: `apcWaveBar ${0.5 + i * 0.025}s ease-in-out ${i * 0.018}s infinite alternate`,
                          }}
                        />
                      ))}
                    </div>

                    {/* File stats */}
                    <div className="flex items-center gap-3">
                      {duration > 0 && (
                        <>
                          <span className="text-[11px] font-mono text-white/40">{fmtDur(duration)}</span>
                          <div className="w-px h-3 bg-white/20" />
                        </>
                      )}
                      {fileSize && <span className="text-[11px] text-white/40">{fileSize}</span>}
                      {audioFile?.type && (
                        <>
                          <div className="w-px h-3 bg-white/20" />
                          <span className="text-[11px] text-white/40">
                            {isVideoSource ? 'VIDEO→AUDIO' : (audioFile.type.split('/')[1]?.toUpperCase().replace('MPEG', 'MP3') || 'AUDIO')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* AI suggestions banner */}
                  {aiLoading && (
                    <div
                      className="flex items-center gap-3 px-4 py-3.5 rounded-2xl"
                      style={{
                        background: 'linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.05))',
                        border: '1px solid rgba(99,102,241,0.15)',
                      }}
                    >
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: '#6366f1' }} />
                      <div>
                        <p className="text-xs font-black" style={{ color: '#6366f1' }}>AI analyzing your audio…</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Detecting genre, mood, and generating metadata</p>
                      </div>
                    </div>
                  )}

                  {aiSuggestions && !aiLoading && (
                    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(99,102,241,0.2)' }}>
                      <div
                        className="flex items-center gap-2 px-4 py-2.5"
                        style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.07))' }}
                      >
                        <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: '#6366f1' }} />
                        <p className="text-xs font-black" style={{ color: '#6366f1' }}>AI Metadata Detected</p>
                      </div>
                      <div className="px-4 py-3 space-y-2.5 bg-white">
                        {aiSuggestions.genre && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Genre</span>
                            <button
                              onClick={() => setGenre(g => g === aiSuggestions.genre ? '' : aiSuggestions.genre!)}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all active:scale-95"
                              style={genre === aiSuggestions.genre
                                ? { background: '#6366f1', color: '#fff' }
                                : { background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}
                            >
                              {genre === aiSuggestions.genre && <Check className="w-3 h-3" />}
                              {aiSuggestions.genre}
                            </button>
                          </div>
                        )}
                        {aiSuggestions.mood && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Mood</span>
                            <button
                              onClick={() => setMood(m => m === aiSuggestions.mood ? '' : aiSuggestions.mood!)}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all active:scale-95"
                              style={mood === aiSuggestions.mood
                                ? { background: '#8b5cf6', color: '#fff' }
                                : { background: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}
                            >
                              {mood === aiSuggestions.mood && <Check className="w-3 h-3" />}
                              {aiSuggestions.mood}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={goToDetails}
                    className="w-full py-4 rounded-2xl font-black text-sm text-white transition-all active:scale-[0.98]"
                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.3)' }}
                  >
                    Add Details
                  </button>
                </div>
              )}
            </>
          )}

          {/* ══ DETAILS ══════════════════════════════════════════════════════ */}
          {step === 'details' && (
            <div className="px-4 pt-4 pb-10 space-y-5">

              {/* Title */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">
                  Title *
                </label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Name your audio"
                  maxLength={120}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400 focus:bg-white transition-colors"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="What's this about?"
                  rows={3}
                  maxLength={500}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400 focus:bg-white transition-colors resize-none"
                />
              </div>

              {/* Genre */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5 block">
                  Genre
                </label>
                <div className="flex flex-wrap gap-2">
                  {GENRES.map(g => (
                    <button
                      key={g}
                      onClick={() => setGenre(genre === g ? '' : g)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
                      style={genre === g
                        ? { background: '#6366f1', color: '#fff' }
                        : { background: '#f3f4f6', color: '#6b7280' }}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mood */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5 block">
                  Mood
                </label>
                <div className="flex flex-wrap gap-2">
                  {MOODS.map(m => (
                    <button
                      key={m}
                      onClick={() => setMood(mood === m ? '' : m)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
                      style={mood === m
                        ? { background: '#8b5cf6', color: '#fff' }
                        : { background: '#f3f4f6', color: '#6b7280' }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cover art */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5 block">
                  Cover Art
                </label>
                <div className="flex gap-3 items-start">
                  <button
                    onClick={() => coverRef.current?.click()}
                    className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 transition-all active:scale-95"
                    style={{
                      background: coverUrl
                        ? 'transparent'
                        : 'linear-gradient(135deg,rgba(99,102,241,.1),rgba(139,92,246,.06))',
                      border: '1.5px dashed rgba(99,102,241,0.3)',
                    }}
                  >
                    {coverUrl
                      ? <img src={coverUrl} className="w-full h-full object-cover rounded-2xl" />
                      : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                          <ImageIcon className="w-5 h-5" style={{ color: '#6366f1' }} />
                          <span className="text-[9px] font-semibold" style={{ color: '#6366f1' }}>Add Cover</span>
                        </div>
                      )}
                  </button>

                  <div className="flex flex-col gap-2 pt-0.5">
                    <button
                      onClick={() => coverRef.current?.click()}
                      className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl text-left transition-colors hover:bg-indigo-100"
                    >
                      Upload Image
                    </button>
                    {coverUrl && (
                      <button
                        onClick={() => { setCoverUrl(''); setCoverFile(null); }}
                        className="text-xs font-semibold text-gray-400 bg-gray-100 px-3 py-1.5 rounded-xl text-left"
                      >
                        Remove
                      </button>
                    )}
                    <p className="text-[10px] text-gray-400 max-w-[130px]">
                      {coverUrl ? 'Tap to change' : 'Square image recommended'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* Visibility */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5 block">
                  Visibility
                </label>
                <div className="space-y-2">
                  {([
                    { id: 'public'    as Visibility, icon: Globe,  label: 'Public',          sub: 'Anyone can listen'     },
                    { id: 'followers' as Visibility, icon: Users,  label: 'Followers Only',   sub: 'Only your followers'   },
                    { id: 'private'   as Visibility, icon: Lock,   label: 'Private',          sub: 'Only you'              },
                  ] as const).map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setVisibility(opt.id)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-all active:scale-[0.98]"
                      style={{
                        background: visibility === opt.id ? 'rgba(99,102,241,0.07)' : '#f9fafb',
                        border:     visibility === opt.id ? '1.5px solid rgba(99,102,241,0.3)' : '1px solid #f0f0f0',
                      }}
                    >
                      <opt.icon
                        className="w-4 h-4 shrink-0"
                        style={{ color: visibility === opt.id ? '#6366f1' : '#9ca3af' }}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-semibold" style={{ color: visibility === opt.id ? '#4f46e5' : '#111827' }}>
                          {opt.label}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{opt.sub}</p>
                      </div>
                      {visibility === opt.id && (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: '#6366f1' }}>
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Permission toggles */}
              <div className="rounded-2xl border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <MessageCircle className="w-4 h-4 text-gray-400" />
                    <p className="text-sm text-gray-700 font-medium">Allow Comments</p>
                  </div>
                  <Toggle on={allowComments} onChange={() => setAllowComments(v => !v)} />
                </div>
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <Download className="w-4 h-4 text-gray-400" />
                    <p className="text-sm text-gray-700 font-medium">Allow Downloads</p>
                  </div>
                  <Toggle on={allowDownloads} onChange={() => setAllowDownloads(v => !v)} />
                </div>
              </div>

              {/* Shortcut to publish */}
              <button
                onClick={goToPublish}
                className="w-full py-4 rounded-2xl font-black text-sm text-white transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.28)' }}
              >
                Preview &amp; Publish
              </button>
            </div>
          )}

          {/* ══ PUBLISH ══════════════════════════════════════════════════════ */}
          {step === 'publish' && (
            <div className="px-4 pt-4 pb-10 space-y-4">

              {/* Publish-step player preview */}
              <PreviewPlayer
                src={audioUrl}
                name={title}
                artist={user?.name || user?.username || 'You'}
                artworkUrl={coverUrl || undefined}
              />

              {/* Metadata summary */}
              <div className="rounded-2xl border border-gray-100 overflow-hidden">
                {[
                  { label: 'Title',      value: title                                         },
                  description && { label: 'Description', value: description.slice(0, 60) + (description.length > 60 ? '…' : '') },
                  genre       && { label: 'Genre',       value: genre                         },
                  mood        && { label: 'Mood',        value: mood                          },
                  { label: 'Visibility', value: { public: 'Public', followers: 'Followers Only', private: 'Private' }[visibility] },
                  { label: 'Comments',   value: allowComments  ? 'On' : 'Off'                 },
                  { label: 'Downloads',  value: allowDownloads ? 'On' : 'Off'                 },
                ].filter(Boolean).map((row: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-4 py-3"
                    style={{ borderTop: i === 0 ? 'none' : '1px solid #f3f4f6' }}
                  >
                    <span className="text-xs text-gray-400">{row.label}</span>
                    <span className="text-xs font-semibold text-gray-900 max-w-[60%] text-right truncate">{row.value}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep('details')}
                className="w-full py-3 rounded-2xl text-sm font-semibold text-gray-500 bg-gray-100 transition-all active:scale-[0.98]"
              >
                Edit Details
              </button>

              {/* Primary CTA */}
              <button
                onClick={publish}
                className="w-full py-4 rounded-2xl font-black text-white text-base transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 12px 32px rgba(99,102,241,0.35)' }}
              >
                Publish Audio
              </button>

              <p className="text-center text-[11px] text-gray-300 px-6">
                Your audio will be visible to{' '}
                {visibility === 'public' ? 'everyone' : visibility === 'followers' ? 'your followers' : 'only you'}{' '}
                on Filmons
              </p>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
