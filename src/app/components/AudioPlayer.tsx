/**
 * Filmons — AudioPlayer
 * Reusable audio player used across feed posts, audio posts, and profiles.
 * Integrates with audioApi for save/use, links to AudioPage.
 */
import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Music2, Download, Bookmark, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { toggleSaveSound } from '../lib/audioApi';
import { toast } from 'sonner';

interface AudioPlayerProps {
  src:          string;
  name?:        string;
  artist?:      string;
  artworkUrl?:  string;
  trackId?:     string;   // links to /audio/:id and enables save
  canDownload?: boolean;
  compact?:     boolean;  // smaller inline version for feed
  dark?:        boolean;  // dark mode (for post editor / audio page)
}

export function AudioPlayer({
  src, name, artist, artworkUrl, trackId,
  canDownload = false, compact = false, dark = false,
}: AudioPlayerProps) {
  const { user }     = useAuth();
  const navigate     = useNavigate();
  const audioRef     = useRef<HTMLAudioElement>(null);
  const [playing,    setPlaying]    = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [duration,   setDuration]   = useState(0);
  const [currentTime,setCurrentTime]= useState(0);
  const [saved,      setSaved]      = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onMeta    = () => setDuration(audio.duration || 0);
    const onTime    = () => {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
    };
    const onEnded   = () => { setPlaying(false); setProgress(0); };
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('timeupdate',     onTime);
    audio.addEventListener('ended',          onEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('timeupdate',     onTime);
      audio.removeEventListener('ended',          onEnded);
    };
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play().catch(()=>{}); setPlaying(true); }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio?.duration) return;
    const rect  = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !trackId) { toast.error('Sign in to save sounds'); return; }
    const isSaved = await toggleSaveSound(user.id, trackId);
    setSaved(isSaved);
    toast.success(isSaved ? '🔖 Saved to sounds' : 'Removed from saved');
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src; a.download = name || 'audio'; a.click();
  };

  const fmt = (s: number) => {
    if (!s || isNaN(s)) return '0:00';
    return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
  };

  const bars = Array.from({length: compact ? 24 : 40}, (_, i) => ({
    height: 20 + Math.sin(i*0.7)*12 + Math.cos(i*1.3)*8 + (i%3===0?10:0),
    filled: progress > (i / (compact ? 24 : 40)) * 100,
  }));

  const bg     = dark   ? 'bg-white/5 border-white/10'       : 'bg-blue-50 border-blue-100';
  const text   = dark   ? 'text-white'                        : 'text-blue-800';
  const sub    = dark   ? 'text-white/50'                     : 'text-blue-500';
  const barOn  = dark   ? '#51A2FF'                           : '#3b82f6';
  const barOff = dark   ? 'rgba(81,162,255,0.18)'             : '#bfdbfe';
  const btnBg  = dark   ? '#51A2FF'                           : '#2563eb';

  return (
    <div className={`border rounded-2xl ${bg} ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`}>
      <audio ref={audioRef} src={src} preload="metadata"/>

      <div className="flex items-center gap-3">
        {/* Artwork (non-compact only) */}
        {!compact && artworkUrl && (
          <img src={artworkUrl} className="w-10 h-10 rounded-xl object-cover shrink-0"/>
        )}

        {/* Play button */}
        <button onClick={togglePlay}
          className={`rounded-full flex items-center justify-center shrink-0 shadow-sm transition-all active:scale-95 ${compact ? 'w-8 h-8' : 'w-10 h-10'}`}
          style={{background: btnBg}}>
          {playing
            ? <Pause className={`text-white ${compact?'w-3.5 h-3.5':'w-4 h-4'}`}/>
            : <Play  className={`text-white ml-0.5 ${compact?'w-3.5 h-3.5':'w-4 h-4'}`}/>}
        </button>

        <div className="flex-1 min-w-0">
          {/* Title + artist */}
          <div className="flex items-center gap-1.5 mb-1">
            <Music2 className={`w-3.5 h-3.5 shrink-0 ${sub}`}/>
            <p className={`text-xs font-bold truncate ${text}`}>
              {name || 'Audio'}
            </p>
          </div>
          {artist && !compact && (
            <p className={`text-[10px] truncate mb-1 ${sub}`}>by {artist}</p>
          )}

          {/* Waveform */}
          <div className={`flex items-end gap-px cursor-pointer mb-1 ${compact ? 'h-6' : 'h-8'}`}
            onClick={handleSeek}>
            {bars.map((bar, i) => (
              <div key={i}
                style={{height:`${Math.min(bar.height, compact?24:32)}px`, background: bar.filled ? barOn : barOff}}
                className="w-1 rounded-full flex-1 transition-colors"/>
            ))}
          </div>

          {/* Time */}
          <div className="flex justify-between">
            <span className={`text-[10px] font-mono ${sub}`}>{fmt(currentTime)}</span>
            <span className={`text-[10px] font-mono ${dark?'text-white/25':'text-blue-300'}`}>{fmt(duration)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1.5 shrink-0">
          {trackId && (
            <button onClick={e=>{e.stopPropagation();navigate(`/audio/${trackId}`);}}
              title="View audio page"
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${dark?'bg-white/10 hover:bg-white/20':'bg-blue-100 hover:bg-blue-200'}`}>
              <ExternalLink className={`w-3.5 h-3.5 ${sub}`}/>
            </button>
          )}
          {trackId && user && (
            <button onClick={handleSave} title="Save sound"
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${saved?(dark?'bg-blue-500/20':'bg-blue-100'):(dark?'bg-white/10 hover:bg-white/20':'bg-blue-100 hover:bg-blue-200')}`}>
              <Bookmark className="w-3.5 h-3.5" style={{color: saved ? '#51A2FF' : (dark ? 'rgba(255,255,255,0.4)' : '#60a5fa'), fill: saved ? '#51A2FF' : 'none'}}/>
            </button>
          )}
          {canDownload && (
            <button onClick={handleDownload} title="Download"
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${dark?'bg-white/10 hover:bg-white/20':'hover:bg-blue-100'}`}>
              <Download className={`w-3.5 h-3.5 ${sub}`}/>
            </button>
          )}
        </div>
      </div>

      {/* ♫ Use This Audio — shown when trackId available and not compact */}
      {trackId && !compact && (
        <button
          onClick={()=>navigate(`/audio/${trackId}`)}
          className={`mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-colors ${dark?'bg-white/8 text-white/60 hover:bg-white/15':'bg-blue-100 text-blue-600 hover:bg-blue-200'}`}>
          ♫ View audio page &amp; use this sound
        </button>
      )}
    </div>
  );
}