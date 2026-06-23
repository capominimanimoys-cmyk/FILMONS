/**
 * Filmons — Music Browser
 * Full-screen audio picker with all categories and audio edit screen
 * src/app/components/MusicBrowser.tsx
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronLeft, Search, Music, Play, Pause, Upload,
  Bookmark, Clock, TrendingUp, Star, X, Mic, Wand2,
  Volume2, RefreshCw, Trash2, Check, Plus, Globe, Lock, Eye,
} from 'lucide-react';
import {
  searchAudio, getSavedSounds, toggleSaveSound,
  fmtDuration, type AudioTrack,
} from '../lib/audioApi';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { SoundTrimSheet } from './SoundTrimSheet';
import { CopyrightScanModal } from './CopyrightScanModal';
import { supabase } from '../../lib/supabase';
import { createAudioFromPost } from '../lib/audioApi';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type MusicTab = 'featured' | 'favorites' | 'playlists' | 'foryou' | 'recents' | 'trending' | 'mysounds';

interface SelectedAudio {
  track:         AudioTrack;
  snippetStart:  number;
  snippetEnd:    number;
  audioVolume:   number;
  videoVolume:   number;
  fadeIn:        boolean;
  fadeOut:       boolean;
}

interface MusicBrowserProps {
  onSelect:  (audio: SelectedAudio) => void;
  onClose:   () => void;
  mediaUrl?: string;
  initialTab?: MusicTab;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const TABS: { id: MusicTab; label: string; Icon: any }[] = [
  { id:'featured',  label:'Featured',    Icon: Star       },
  { id:'favorites', label:'My Favorites',Icon: Bookmark   },
  { id:'playlists', label:'Playlists',   Icon: Music      },
  { id:'foryou',    label:'For You',     Icon: Wand2      },
  { id:'recents',   label:'Recents',     Icon: Clock      },
  { id:'trending',  label:'Trending',    Icon: TrendingUp },
  { id:'mysounds',  label:'My Sounds',   Icon: Mic        },
];

const PLAYLISTS = [
  'Cinematic Trailers','Afrobeats Hits','Wedding Vibes',
  'Documentary Music','Travel Sounds','Motivational Tracks',
];

const GENRE_PILLS = ['All','Cinematic','Afrobeat','Ambient','Hip-Hop','Podcast','Soundtrack','Electronic','Jazz'];

const RECENTS_KEY = 'filmons_audio_recents';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function getRecents(): AudioTrack[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); } catch { return []; }
}
function addRecent(track: AudioTrack) {
  try {
    const prev = getRecents().filter(t => t.id !== track.id);
    localStorage.setItem(RECENTS_KEY, JSON.stringify([track, ...prev].slice(0, 20)));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Waveform visualiser
// ─────────────────────────────────────────────────────────────────────────────
function Waveform({ playing }: { playing: boolean }) {
  return (
    <div className="flex items-center gap-px h-5">
      {[...Array(18)].map((_, i) => (
        <div key={i} className="rounded-full flex-1" style={{
          background: '#51A2FF',
          opacity: playing ? 0.9 : 0.3,
          height: `${25 + Math.sin(i * 0.7) * 50}%`,
          animation: playing ? `wb ${0.55 + i * 0.04}s ease-in-out infinite alternate` : 'none',
          animationDelay: `${i * 0.03}s`,
        }}/>
      ))}
      <style>{`@keyframes wb{from{transform:scaleY(0.3)}to{transform:scaleY(1)}}`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Track row
// ─────────────────────────────────────────────────────────────────────────────
function TrackRow({ track, playing, saved, onPlay, onSave, onSelect }: {
  track: AudioTrack; playing: boolean; saved: boolean;
  onPlay: ()=>void; onSave: ()=>void; onSelect: ()=>void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 active:bg-white/8 transition-colors border-b border-white/5">
      {/* Artwork / Play */}
      <button onClick={onPlay} className="relative shrink-0">
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center">
          {track.artwork_url
            ? <img src={track.artwork_url} className="w-full h-full object-cover" loading="lazy"/>
            : <Music className="w-5 h-5 text-white/30"/>}
        </div>
        <div className="absolute inset-0 rounded-xl flex items-center justify-center"
          style={{background: playing ? 'rgba(0,0,0,0.55)' : 'transparent'}}>
          {playing
            ? <Waveform playing={true}/>
            : <Play className="w-4 h-4 text-white opacity-0 group-hover:opacity-100"/>}
        </div>
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onSelect}>
        <div className="flex items-center gap-1.5">
          {track.is_trending && <TrendingUp className="w-3 h-3 text-blue-400 shrink-0"/>}
          <p className="text-sm font-bold text-white truncate">{track.title}</p>
        </div>
        <p className="text-xs text-white/40 truncate">
          {track.artist ?? 'Filmons'}
          {track.use_count > 0 && (
            <span className="ml-1.5 text-white/20">· {track.use_count.toLocaleString()} posts</span>
          )}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-white/25 tabular-nums">{fmtDuration(track.duration_sec)}</span>
        <button onClick={onSave}
          className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{background: saved ? 'rgba(81,162,255,0.2)' : 'rgba(255,255,255,0.07)'}}>
          <Bookmark className="w-3.5 h-3.5" style={{color: saved ? '#51A2FF' : 'rgba(255,255,255,0.4)', fill: saved ? '#51A2FF' : 'none'}}/>
        </button>
        <button onClick={onSelect}
          className="px-3 py-1.5 rounded-xl text-xs font-black"
          style={{background:'rgba(81,162,255,0.15)', color:'#51A2FF', border:'1px solid rgba(81,162,255,0.3)'}}>
          Use
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio Edit Screen (segment + volume + fade)
// ─────────────────────────────────────────────────────────────────────────────
function AudioEditScreen({ track, onConfirm, onBack, onReplace }: {
  track: AudioTrack;
  onConfirm: (s: number, e: number, av: number, fi: boolean, fo: boolean) => void;
  onBack: () => void;
  onReplace: () => void;
}) {
  const dur = track.duration_sec ?? 60;
  const [start,       setStart]  = useState(0);
  const [end,         setEnd]    = useState(Math.min(30, dur));
  const [audioVol,    setAVol]   = useState(80);
  const [fadeIn,      setFadeIn] = useState(false);
  const [fadeOut,     setFadeOut]= useState(true);
  const [playing,     setPlaying]= useState(false);
  const audioRef = useRef<HTMLAudioElement|null>(null);
  const barRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!track.file_url) return;
    const a = new Audio(track.file_url);
    audioRef.current = a;
    a.volume = audioVol / 100;
    a.ontimeupdate = () => { if (a.currentTime >= end) { a.pause(); setPlaying(false); } };
    a.onended = () => setPlaying(false);
    return () => { a.pause(); };
  }, [track.file_url]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = audioVol / 100;
  }, [audioVol]);

  const togglePlay = () => {
    if (!audioRef.current) { toast.info('Preview not available'); return; }
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.currentTime = start; audioRef.current.play().catch(()=>{}); setPlaying(true); }
  };

  const pct = (v: number) => (v / dur) * 100;

  const handleBarClick = (e: React.MouseEvent) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const t = Math.round((e.clientX - rect.left) / rect.width * dur);
    setStart(Math.max(0, t));
    setEnd(Math.min(dur, t + 30));
  };

  return (
    <div className="fixed inset-0 z-[100] bg-gray-950 flex flex-col" style={{paddingBottom:'env(safe-area-inset-bottom)'}}>
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Nav */}
      <div className="shrink-0 flex items-center justify-between px-4 pt-12 pb-4">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
          <ChevronLeft className="w-5 h-5 text-white"/>
        </button>
        <p className="text-sm font-black text-white">Edit Audio</p>
        <button onClick={()=>onConfirm(start,end,audioVol,fadeIn,fadeOut)}
          className="px-4 py-1.5 rounded-full text-sm font-black text-white"
          style={{background:'#51A2FF'}}>
          Done
        </button>
      </div>

      {/* Track info */}
      <div className="flex items-center gap-4 px-6 pb-4 shrink-0" style={{animation:'slideUp 0.25s ease'}}>
        {track.artwork_url
          ? <img src={track.artwork_url} className="w-14 h-14 rounded-2xl object-cover shrink-0"/>
          : <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
              <Music className="w-6 h-6 text-white/40"/>
            </div>}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white truncate">{track.title}</p>
          <p className="text-xs text-white/50 truncate">{track.artist ?? 'Filmons'}</p>
          <p className="text-[10px] text-white/25 mt-0.5">{fmtDuration(track.duration_sec)}</p>
        </div>
        {/* Play button */}
        <button onClick={togglePlay}
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
          style={{background: playing ? 'rgba(81,162,255,0.2)' : '#51A2FF', border:'2px solid #51A2FF'}}>
          {playing ? <Pause className="w-5 h-5 text-white"/> : <Play className="w-5 h-5 text-white ml-0.5"/>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 space-y-6 pb-6">

        {/* ── Waveform / segment ── */}
        <div>
          <p className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-3">Choose Segment</p>
          <div ref={barRef}
            className="w-full relative rounded-2xl overflow-hidden cursor-pointer"
            style={{height:68, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)'}}
            onClick={handleBarClick}>
            <div className="absolute inset-0 flex items-center px-2 gap-px">
              {[...Array(60)].map((_,i)=>(
                <div key={i} className="flex-1 rounded-full"
                  style={{
                    height:`${22+Math.sin(i*0.7)*38+Math.cos(i*0.3)*18}%`,
                    background: i/60 >= pct(start)/100 && i/60 <= pct(end)/100
                      ? '#51A2FF' : 'rgba(255,255,255,0.12)',
                    transition:'background 0.1s',
                  }}/>
              ))}
            </div>
            <div className="absolute top-0 bottom-0 pointer-events-none rounded-xl"
              style={{
                left:`${pct(start)}%`, width:`${pct(end)-pct(start)}%`,
                border:'2px solid #51A2FF', background:'rgba(81,162,255,0.07)',
                boxShadow:'0 0 10px rgba(81,162,255,0.3)',
              }}/>
          </div>
          <div className="flex justify-between mt-2 text-[11px] text-white/30">
            <span>{fmtDuration(start)}</span>
            <span className="font-black" style={{color:'#51A2FF'}}>{fmtDuration(end-start)} selected</span>
            <span>{fmtDuration(end)}</span>
          </div>
          {/* Start/End sliders */}
          <div className="mt-3 space-y-3">
            {[
              {label:'Start', val:start, set:(v:number)=>setStart(Math.min(v,end-5)), max:dur-5},
              {label:'End',   val:end,   set:(v:number)=>setEnd(Math.max(v,start+5)), max:dur},
            ].map(sl=>(
              <div key={sl.label} className="flex items-center gap-3">
                <p className="text-[11px] text-white/30 w-8">{sl.label}</p>
                <input type="range" min={0} max={sl.max} value={sl.val}
                  onChange={e=>sl.set(Number(e.target.value))}
                  className="flex-1 accent-blue-400"/>
                <p className="text-[11px] text-white/50 w-10 text-right tabular-nums">{fmtDuration(sl.val)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Volume controls ── */}
        <div>
          <p className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-3">Volume</p>
          <div className="space-y-4">
            {[
              {label:'Audio Volume', icon:'🎵', val:audioVol, set:setAVol},
            ].map(ctrl=>(
              <div key={ctrl.label} className="flex items-center gap-3">
                <span className="text-base w-6 shrink-0">{ctrl.icon}</span>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <p className="text-xs text-white/50">{ctrl.label}</p>
                    <p className="text-xs font-black" style={{color:'#51A2FF'}}>{ctrl.val}%</p>
                  </div>
                  <input type="range" min={0} max={100} value={ctrl.val}
                    onChange={e=>ctrl.set(Number(e.target.value))}
                    className="w-full accent-blue-400"/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Fade effects ── */}
        <div>
          <p className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-3">Fade Effects</p>
          <div className="flex gap-3">
            {[
              {label:'Fade In',  val:fadeIn,  set:setFadeIn},
              {label:'Fade Out', val:fadeOut, set:setFadeOut},
            ].map(f=>(
              <button key={f.label} onClick={()=>f.set(!f.val)}
                className="flex-1 flex items-center justify-between px-4 py-3 rounded-2xl transition-all"
                style={f.val
                  ? {background:'rgba(81,162,255,0.15)', border:'1.5px solid #51A2FF'}
                  : {background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.1)'}}>
                <p className="text-xs font-bold" style={{color: f.val ? '#51A2FF' : 'rgba(255,255,255,0.5)'}}>{f.label}</p>
                {f.val && <Check className="w-4 h-4 text-blue-400"/>}
              </button>
            ))}
          </div>
        </div>

        {/* ── Replace / Remove ── */}
        <div className="flex gap-3 pt-2">
          <button onClick={onReplace}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white/60"
            style={{background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)'}}>
            <RefreshCw className="w-4 h-4"/> Replace Audio
          </button>
          <button onClick={onBack}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold text-red-400"
            style={{background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)'}}>
            <Trash2 className="w-4 h-4"/> Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main MusicBrowser
// ─────────────────────────────────────────────────────────────────────────────
export function MusicBrowser({ onSelect, onClose, mediaUrl, initialTab }: MusicBrowserProps) {
  const { user } = useAuth();
  const [tab,       setTab]      = useState<MusicTab>(initialTab ?? 'featured');
  const [query,     setQuery]    = useState('');
  const [genre,     setGenre]    = useState('All');
  const [playlist,  setPlaylist] = useState<string|null>(null);
  const [tracks,    setTracks]   = useState<AudioTrack[]>([]);
  const [loading,   setLoading]  = useState(true);
  const [playingId, setPlayingId]= useState<string|null>(null);
  const [savedIds,  setSavedIds] = useState<Set<string>>(new Set());
  const [editing,   setEditing]  = useState<AudioTrack|null>(null);  // audio edit screen
  const audioRef    = useRef<HTMLAudioElement|null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const fileInputRef = useRef<HTMLInputElement|null>(null);
  const [uploading,    setUploading]    = useState(false);
  const [scanBlob,     setScanBlob]     = useState<Blob|null>(null);
  const [scanTrackId,  setScanTrackId]  = useState<string|null>(null);
  const [scanTitle,    setScanTitle]    = useState('');
  const [scanTrack,    setScanTrack]    = useState<AudioTrack|null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadFile,   setUploadFile]   = useState<File|null>(null);
  const [uploadName,   setUploadName]   = useState('');
  const [uploadDesc,   setUploadDesc]   = useState('');
  const [uploadCat,    setUploadCat]    = useState('Original Audio');
  const [uploadVis,    setUploadVis]    = useState('public');
  const [mySounds,     setMySounds]     = useState<AudioTrack[]>([]);
  const [trimmingSound, setTrimmingSound] = useState<any|null>(null);
  const [loadingMy,    setLoadingMy]    = useState(false);

  const load = useCallback(async (q='', g='All', t: MusicTab = tab) => {
    setLoading(true);
    try {
      let data: AudioTrack[] = [];
      if (t === 'favorites' && user) {
        data = await getSavedSounds(user.id);
      } else if (t === 'recents') {
        data = getRecents();
        setLoading(false);
        setTracks(data);
        return;
      } else if (t === 'mysounds') {
        if (user) {
          setLoadingMy(true);
          const { data: myData } = await supabase
            .from('user_sounds')
            .select('id, title, description, category, file_url, artwork_url, duration_sec, use_count, fp_earned, copyright_status, visibility, is_original')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
          setMySounds((myData ?? []) as any[]);
          setLoadingMy(false);
        }
      } else {
        const catParam = g === 'All' ? '' : g.toLowerCase();
        data = await searchAudio(q, catParam, 40);
        if (t === 'trending') data = data.filter(a => a.is_trending || a.use_count > 0).slice(0, 20);
        if (t === 'featured') data = data.slice(0, 15);
      }
      setTracks(data);
    } finally { setLoading(false); }
  }, [user, tab]);

  useEffect(() => {
    load('', 'All', initialTab ?? 'featured');
    // Auto-open file picker when launched directly for upload
    if (initialTab === 'mysounds') {
      setTimeout(() => fileInputRef.current?.click(), 400);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    getSavedSounds(user.id).then(s => setSavedIds(new Set(s.map(t => t.id))));
  }, [user]);

  const handleSearch = (q: string) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(q, genre), 300);
  };

  const handleTab = (t: MusicTab) => {
    setTab(t); setQuery(''); setGenre('All'); setPlaylist(null); load('', 'All', t);
  };

  const playTrack = (track: AudioTrack) => {
    audioRef.current?.pause();
    if (playingId === track.id) { setPlayingId(null); audioRef.current = null; return; }
    if (!track.file_url) { toast.info('Preview not available'); setPlayingId(track.id); return; }
    const a = new Audio(track.file_url);
    a.play().catch(()=>{});
    a.onended = () => setPlayingId(null);
    audioRef.current = a;
    setPlayingId(track.id);
  };

  const saveTrack = async (track: AudioTrack) => {
    if (!user) { toast.error('Sign in to save sounds'); return; }
    const isSaved = await toggleSaveSound(user.id, track.id);
    setSavedIds(prev => { const n = new Set(prev); isSaved ? n.add(track.id) : n.delete(track.id); return n; });
    toast.success(isSaved ? '🔖 Saved' : 'Removed from saved');
  };

  const selectTrack = (track: AudioTrack) => {
    audioRef.current?.pause();
    setPlayingId(null);
    addRecent(track);
    setEditing(track);
  };

  // Handle file upload → copyright scan
  const handleUpload = async () => {
    if (!user || !uploadFile) return;
    setUploading(true);
    try {
      const safeName = uploadFile.name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // remove accents
        .replace(/[^a-zA-Z0-9._-]/g, '_')                  // replace spaces/special chars
        .replace(/_+/g, '_');                               // collapse multiple underscores
      const path = `audio/${user.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('audio').upload(path, uploadFile, { upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('audio').getPublicUrl(path);
      const fileUrl = urlData.publicUrl;

      const { data: trackRow } = await supabase.from('user_sounds').insert({
        title:            uploadName || uploadFile.name.replace(/\.[^/.]+$/, ''),
        user_id:          user.id,
        file_url:         fileUrl,
        category:         uploadCat.toLowerCase().replace(/ /g, '_'),
        description:      uploadDesc || null,
        visibility:       uploadVis,
        is_original:      false,
        copyright_status: 'pending',
      }).select('id, title, file_url').single();

      setShowUploadForm(false);
      if (trackRow) {
        setScanTrackId(trackRow.id);
        setScanTitle(trackRow.title);
        setScanTrack({ id: trackRow.id, title: trackRow.title, use_count: 0, is_trending: false, file_url: trackRow.file_url });
        const blob = new Blob([await uploadFile.arrayBuffer()], { type: uploadFile.type });
        setScanBlob(blob);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    if (file.size > 200 * 1024 * 1024) { toast.error('File must be under 200MB'); return; }
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv)$/i.test(file.name);
    if (!file.type.match(/audio/) && !isVideo) { toast.error('Please select an audio or video file'); return; }

    if (isVideo) {
      // Extract audio from video using Web Audio API
      toast.info('Extracting audio from video…');
      try {
        const audioCtx = new AudioContext();
        const arrayBuf = await file.arrayBuffer();
        const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
        // Encode to WAV blob
        const wavBlob  = audioBufferToWav(audioBuf);
        const wavFile  = new File([wavBlob], file.name.replace(/\.[^/.]+$/, '') + '.wav', { type: 'audio/wav' });
        setUploadFile(wavFile);
        setUploadName(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
        toast.success('Audio extracted from video');
      } catch (e) {
        // Fallback: use original file (some videos carry audio that browsers can play)
        toast.info('Using original file audio track');
        setUploadFile(file);
        setUploadName(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
      }
    } else {
      setUploadFile(file);
      setUploadName(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
    }
    setShowUploadForm(true);
  };

  // Convert AudioBuffer to WAV Blob
  function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numCh  = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * numCh * 2 + 44;
    const out    = new ArrayBuffer(length);
    const view   = new DataView(out);
    const write  = (o: number, s: string) => { for (let i=0;i<s.length;i++) view.setUint8(o+i, s.charCodeAt(i)); };
    write(0,'RIFF'); view.setUint32(4,length-8,true); write(8,'WAVE');
    write(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true);
    view.setUint16(22,numCh,true); view.setUint32(24,sampleRate,true);
    view.setUint32(28,sampleRate*numCh*2,true); view.setUint16(32,numCh*2,true);
    view.setUint16(34,16,true); write(36,'data');
    view.setUint32(40,buffer.length*numCh*2,true);
    let offset = 44;
    for (let i=0;i<buffer.length;i++) {
      for (let ch=0;ch<numCh;ch++) {
        const s = Math.max(-1,Math.min(1,buffer.getChannelData(ch)[i]));
        view.setInt16(offset, s<0?s*0x8000:s*0x7FFF, true);
        offset += 2;
      }
    }
    return new Blob([out], { type:'audio/wav' });
  }

  // Upload details form
  if (showUploadForm && uploadFile) {
    const CATS = ['Original Audio','Voiceover','Music','Sound Effect','Ambient','Podcast','Cinematic'];
    const VIS  = [
      {id:'public',   label:'Public',   icon: Globe, sub:'Anyone can use this sound'},
      {id:'unlisted', label:'Unlisted', icon: Eye,   sub:'Only people with link'},
      {id:'private',  label:'Private',  icon: Lock,  sub:'Only you can see and use'},
    ];
    return (
      <div className="fixed inset-0 z-[95] bg-gray-950 flex flex-col" style={{paddingBottom:'env(safe-area-inset-bottom)'}}>
        <style>{`@keyframes uploadFormIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
        <div className="flex flex-col h-full" style={{animation:'uploadFormIn 0.28s cubic-bezier(0.32,0.72,0,1)'}}>
          {/* Nav */}
          <div className="shrink-0 flex items-center justify-between px-4 pt-12 pb-4">
            <button onClick={()=>setShowUploadForm(false)}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
              <ChevronLeft className="w-5 h-5 text-white"/>
            </button>
            <p className="text-sm font-black text-white">Upload Sound</p>
            <button onClick={handleUpload} disabled={uploading}
              className="px-4 py-1.5 rounded-full text-sm font-black text-white disabled:opacity-50"
              style={{background:'#51A2FF'}}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 space-y-5 pb-8">
            {/* File preview */}
            <div className="flex items-center gap-3 p-3 rounded-2xl"
              style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)'}}>
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                <Music className="w-6 h-6 text-blue-400"/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{uploadFile.name}</p>
                <p className="text-xs text-white/40">{(uploadFile.size/1024/1024).toFixed(1)} MB · {uploadFile.type.split('/')[1]?.toUpperCase()}</p>
              </div>
              <button onClick={()=>fileInputRef.current?.click()} className="text-xs text-blue-400 font-bold">Change</button>
            </div>

            {/* Sound Name */}
            <div>
              <p className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-2">Sound Name</p>
              <input value={uploadName} onChange={e=>setUploadName(e.target.value)}
                placeholder="Epic Trailer Intro"
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none"
                style={{background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)'}}/>
            </div>

            {/* Description */}
            <div>
              <p className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-2">Description <span className="text-white/20 font-normal normal-case">(optional)</span></p>
              <textarea value={uploadDesc} onChange={e=>setUploadDesc(e.target.value)}
                placeholder="Original cinematic soundtrack…"
                rows={2}
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none resize-none"
                style={{background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)'}}/>
            </div>

            {/* Category */}
            <div>
              <p className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-2">Category</p>
              <div className="flex flex-wrap gap-2">
                {CATS.map(c=>(
                  <button key={c} onClick={()=>setUploadCat(c)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                    style={uploadCat===c
                      ? {background:'#51A2FF', color:'#fff'}
                      : {background:'rgba(255,255,255,0.07)', color:'rgba(255,255,255,0.5)'}}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Visibility */}
            <div>
              <p className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-2">Visibility</p>
              <div className="space-y-2">
                {VIS.map(v=>(
                  <button key={v.id} onClick={()=>setUploadVis(v.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                    style={uploadVis===v.id
                      ? {background:'rgba(81,162,255,0.15)', border:'1.5px solid #51A2FF'}
                      : {background:'rgba(255,255,255,0.05)', border:'1.5px solid rgba(255,255,255,0.08)'}}>
                    <v.icon className="w-4 h-4 shrink-0" style={{color: uploadVis===v.id ? '#51A2FF' : 'rgba(255,255,255,0.4)'}}/>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black" style={{color: uploadVis===v.id ? '#51A2FF' : '#fff'}}>{v.label}</p>
                      <p className="text-[10px] text-white/30">{v.sub}</p>
                    </div>
                    {uploadVis===v.id && <Check className="w-4 h-4 text-blue-400 shrink-0"/>}
                  </button>
                ))}
              </div>
            </div>

            {/* Copyright note */}
            <div className="p-3 rounded-xl flex items-start gap-2.5"
              style={{background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.2)'}}>
              <span className="text-yellow-400 text-base shrink-0">🛡️</span>
              <div>
                <p className="text-xs font-bold text-yellow-400">Copyright Scan</p>
                <p className="text-[11px] text-white/40 leading-relaxed mt-0.5">
                  After uploading, we'll scan your audio for copyright matches. Original sounds earn FP rewards when others use them.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (trimmingSound) {
    return (
      <SoundTrimSheet
        sound={{
          id:            trimmingSound.id,
          title:         trimmingSound.title,
          file_url:      trimmingSound.file_url,
          duration_sec:  trimmingSound.duration_sec,
          snippet_start: trimmingSound.snippet_start ?? 0,
          snippet_end:   trimmingSound.snippet_end,
        }}
        onClose={() => setTrimmingSound(null)}
        onSaved={(start, end) => {
          setMySounds(prev => prev.map((s:any) =>
            s.id === trimmingSound.id ? {...s, snippet_start: start, snippet_end: end} : s
          ));
          setTrimmingSound(null);
        }}
      />
    );
  }

  if (scanBlob && scanTrack) {
    return (
      <CopyrightScanModal
        audioBlob={scanBlob}
        trackId={scanTrackId ?? undefined}
        trackTitle={scanTitle}
        onApproved={async () => {
          // Update user_sounds to approved+original
          if (scanTrackId) {
            await supabase.from('user_sounds')
              .update({ copyright_status: 'approved', is_original: true, visibility: uploadVis })
              .eq('id', scanTrackId)
              .catch(console.error);
          }
          // Promote to audio_tracks library if public
          if (scanTrackId && scanTrack && uploadVis === 'public') {
            const { error: atErr } = await supabase.from('audio_tracks').insert({
              title:            scanTitle || scanTrack.title,
              creator_id:       user?.id || null,
              file_url:         scanTrack.file_url || null,
              source:           'upload',
              is_original:      true,
              copyright_status: 'approved',
              category:         uploadCat.toLowerCase().replace(/ /g, '_'),
              artist:           user?.name || user?.username || null,
              duration_sec:     scanTrack.duration_sec || null,
              use_count:        0,
              trending_score:   0,
            });
            if (atErr) { console.error('[audio_tracks insert]', atErr.message, atErr.details); } else { console.log('[audio_tracks] ✅ public sound added'); }
            if (atErr) console.error('[MusicBrowser] audio_tracks insert error:', atErr);
            else console.log('[MusicBrowser] ✅ Sound added to audio_tracks library');
          }
          setScanBlob(null);
          if (scanTrack) selectTrack(scanTrack);
          else { setScanTrack(null); setScanTrackId(null); }
        }}
        onReplace={() => { setScanBlob(null); setScanTrack(null); fileInputRef.current?.click(); }}
        onRemove={()  => { setScanBlob(null); setScanTrack(null); setScanTrackId(null); }}
      />
    );
  }

  // Audio edit screen
  if (editing) {
    return (
      <AudioEditScreen
        track={editing}
        onConfirm={(start, end, audioVol, fadeIn, fadeOut) => {
          onSelect({ track: editing, snippetStart: start, snippetEnd: end, audioVolume: audioVol, videoVolume: 100, fadeIn, fadeOut });
        }}
        onBack={() => setEditing(null)}
        onReplace={() => setEditing(null)}
      />
    );
  }

  const showGenrePills = ['featured','foryou','trending','playlists'].includes(tab);

  return (
    <div className="fixed inset-0 z-[90] bg-gray-950 flex flex-col"
      style={{paddingBottom:'env(safe-area-inset-bottom)'}}>
      <style>{`@keyframes musicIn{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div className="flex flex-col h-full" style={{animation:'musicIn 0.3s cubic-bezier(0.32,0.72,0,1)'}}>

        {/* Nav */}
        <div className="shrink-0 flex items-center justify-between px-4 pt-12 pb-3">
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
            <ChevronLeft className="w-5 h-5 text-white"/>
          </button>
          <p className="text-sm font-black text-white">Add Audio</p>
          <button onClick={onClose} className="text-sm font-semibold text-white/40">Cancel</button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30"/>
            <input value={query} onChange={e=>handleSearch(e.target.value)}
              placeholder="Search songs, artists, playlists, sounds…"
              className="w-full rounded-2xl pl-9 pr-4 py-3 text-sm text-white placeholder-white/30 outline-none"
              style={{background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)'}}/>
            {query && (
              <button onClick={()=>handleSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                <X className="w-3 h-3 text-white"/>
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="shrink-0 overflow-x-auto scrollbar-hide px-4 pb-2">
          <div className="flex gap-2">
            {TABS.map(t => (
              <button key={t.id} onClick={()=>handleTab(t.id)}
                className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all"
                style={tab===t.id
                  ? {background:'#51A2FF', color:'#fff'}
                  : {background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.5)'}}>
                <t.Icon className="w-3 h-3"/>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Genre pills */}
        {showGenrePills && !playlist && (
          <div className="shrink-0 overflow-x-auto scrollbar-hide px-4 pb-2">
            <div className="flex gap-2">
              {GENRE_PILLS.map(g => (
                <button key={g} onClick={()=>{ setGenre(g); load(query, g==='All'?'':g.toLowerCase()); }}
                  className="shrink-0 px-3 py-1 rounded-full text-[11px] font-bold transition-all"
                  style={genre===g
                    ? {background:'rgba(81,162,255,0.2)', color:'#51A2FF', border:'1px solid rgba(81,162,255,0.4)'}
                    : {background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.4)'}}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Playlists grid */}
        {tab === 'playlists' && !playlist && (
          <div className="shrink-0 px-4 pb-3 grid grid-cols-2 gap-2">
            {PLAYLISTS.map((pl, i) => (
              <button key={pl} onClick={()=>{ setPlaylist(pl); load(pl, 'All', 'playlists'); }}
                className="flex items-center gap-2 px-3 py-3 rounded-2xl text-left transition-all hover:bg-white/10"
                style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)'}}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{background:`hsl(${i*50},60%,35%)`}}>
                  <Music className="w-4 h-4 text-white/80"/>
                </div>
                <p className="text-xs font-bold text-white/70 leading-tight">{pl}</p>
              </button>
            ))}
          </div>
        )}

        {/* Playlist back pill */}
        {tab === 'playlists' && playlist && (
          <button onClick={()=>setPlaylist(null)}
            className="shrink-0 mx-4 mb-2 flex items-center gap-2 px-3 py-1.5 rounded-full self-start"
            style={{background:'rgba(81,162,255,0.15)', border:'1px solid rgba(81,162,255,0.3)'}}>
            <ChevronLeft className="w-3.5 h-3.5 text-blue-400"/>
            <p className="text-xs font-bold text-blue-400">{playlist}</p>
          </button>
        )}

        {/* My Sounds tab */}
        {tab === 'mysounds' && (
          <div className="flex-1 overflow-y-auto">
            {/* Hidden file input */}
            <input ref={fileInputRef} type="file" accept="audio/*,video/*,.mp3,.wav,.aac,.m4a,.flac,.mp4,.mov,.webm" className="hidden"
              onChange={e=>{ const f=e.target.files?.[0]; if(f) handleFileSelect(f); e.target.value=''; }}/>

            {/* Upload Sound CTA */}
            <div className="px-4 pt-3 pb-2">
              <button onClick={()=>fileInputRef.current?.click()}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all active:scale-[0.98]"
                style={{background:'rgba(81,162,255,0.1)', border:'1.5px dashed rgba(81,162,255,0.4)'}}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{background:'rgba(81,162,255,0.2)'}}>
                  <Plus className="w-5 h-5 text-blue-400"/>
                </div>
                <div className="text-left">
                  <p className="text-sm font-black text-white">Upload Sound</p>
                  <p className="text-xs text-white/40">MP3, WAV, AAC, M4A, FLAC · Max 50MB</p>
                </div>
              </button>
            </div>

            {/* Sound sections */}
            {loadingMy ? (
              <div className="flex items-center justify-center py-10 gap-2">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
                <p className="text-sm text-white/40">Loading sounds…</p>
              </div>
            ) : mySounds.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 px-8">
                <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
                  <Mic className="w-7 h-7 text-white/30"/>
                </div>
                <p className="text-sm font-black text-white text-center">No sounds yet</p>
                <p className="text-xs text-white/40 text-center">Upload original audio to earn FP when others use your sounds</p>
                {/* FP tiers */}
                <div className="w-full mt-2 rounded-2xl p-3 space-y-1.5"
                  style={{background:'rgba(255,215,0,0.06)', border:'1px solid rgba(255,215,0,0.15)'}}>
                  <p className="text-[10px] font-black text-yellow-400 uppercase tracking-widest mb-2">🪙 Earn FP Coins</p>
                  {[['100 uses','+50 FP'],['1K uses','+700 FP'],['10K uses','+10,000 FP + 🔥']].map(([u,f])=>(
                    <div key={u} className="flex justify-between">
                      <p className="text-[11px] text-white/40">{u}</p>
                      <p className="text-[11px] font-black text-yellow-400">{f}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Group by status */}
                {(['approved','pending','rejected'] as const).map(status => {
                  const group = mySounds.filter((s:any) => (s.copyright_status ?? 'pending') === status);
                  if (!group.length) return null;
                  const label = status === 'approved' ? 'Public Sounds' : status === 'pending' ? 'Under Review' : 'Rejected';
                  const color = status === 'approved' ? '#22c55e' : status === 'pending' ? '#f59e0b' : '#ef4444';
                  return (
                    <div key={status}>
                      <p className="px-4 py-2 text-[10px] font-black uppercase tracking-widest"
                        style={{color}}>{label}</p>
                      {group.map((track: AudioTrack) => (
                        <div key={track.id} className="relative">
                        <TrackRow track={track}
                          playing={playingId === track.id}
                          saved={savedIds.has(track.id)}
                          onPlay={()=>playTrack(track)}
                          onSave={()=>saveTrack(track)}
                          onSelect={()=>selectTrack(track)}
                        />
                      </div>
                      ))}
                    </div>
                  );
                })}
              </>
            )}
            <div className="h-8"/>
          </div>
        )}

        {/* Track list */}
        {tab !== 'mysounds' && (tab !== 'playlists' || playlist) && (
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-2">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
                <p className="text-sm text-white/40">Loading…</p>
              </div>
            ) : tracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Music className="w-10 h-10 text-white/10"/>
                <p className="text-sm text-white/30">
                  {tab === 'favorites' ? 'No saved sounds yet'
                   : tab === 'recents'  ? 'No recently played audio'
                   : 'No tracks found'}
                </p>
              </div>
            ) : tracks.map(track => (
              <TrackRow key={track.id} track={track}
                playing={playingId === track.id}
                saved={savedIds.has(track.id)}
                onPlay={()=>playTrack(track)}
                onSave={()=>saveTrack(track)}
                onSelect={()=>selectTrack(track)}
              />
            ))}
            <div className="h-8"/>
          </div>
        )}
      </div>
    </div>
  );
}