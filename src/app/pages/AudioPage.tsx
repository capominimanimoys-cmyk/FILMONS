/**
 * Filmons — AudioPage (Light Mode, slides up from bottom)
 * Route: /audio/:id
 */
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import { ChevronLeft, Play, Pause, Users, Music, TrendingUp, Bookmark, Share2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { PostComposer } from '../components/PostComposer';

function fmtDuration(sec?: number) {
  if (!sec) return '—';
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
function fmtCount(n?: number) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function AudioPage() {
  const { id }        = useParams<{ id: string }>();
  const navigate      = useNavigate();
  const [searchParams]= useSearchParams();
  const titleQuery    = searchParams.get('title');

  const [track,   setTrack]   = useState<any>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [pendingAudio, setPendingAudio] = useState<any>(null);
  const [showModePicker, setShowModePicker] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'post'|'story'|'reel'>('post');
  const [posts,   setPosts]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [saved,   setSaved]   = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadAudio();
    return () => { audioRef.current?.pause(); };
  }, [id, titleQuery]);

  const loadAudio = async () => {
    setLoading(true);
    let audio: any = null;

    if (id && id !== 'search') {
      // Load by ID
      const [{ data: trackData }, { data: soundData }] = await Promise.all([
        supabase.from('audio_tracks').select('*').eq('id', id).single(),
        supabase.from('user_sounds').select('*').eq('id', id).single(),
      ]);
      audio = trackData || soundData;
    }

    if (!audio && titleQuery) {
      // Fallback: search by title
      const { data: byTitle } = await supabase
        .from('audio_tracks').select('*').ilike('title', titleQuery).limit(1).single();
      if (!byTitle) {
        const { data: byUserSound } = await supabase
          .from('user_sounds').select('*').ilike('title', titleQuery).limit(1).single();
        audio = byUserSound;
      } else {
        audio = byTitle;
      }
    }
    setTrack(audio);

    if (audio) {
      // Run two separate queries and merge — avoids .or() syntax issues
      const [{ data: byId }, { data: byTitle }] = await Promise.all([
        audio.id
          ? supabase
              .from('posts')
              .select('*, profiles!author_id(id,name,username,avatar_url,account_type)')
              .eq('audio_id', String(audio.id))
              .order('created_at', { ascending: false })
              .limit(50)
          : Promise.resolve({ data: [] }),
        audio.title
          ? supabase
              .from('posts')
              .select('*, profiles!author_id(id,name,username,avatar_url,account_type)')
              .eq('audio_title', audio.title)
              .order('created_at', { ascending: false })
              .limit(50)
          : Promise.resolve({ data: [] }),
      ]);
      // Merge and deduplicate by id
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const row of [...(byId ?? []), ...(byTitle ?? [])]) {
        if (!seen.has(row.id)) { seen.add(row.id); merged.push(row); }
      }
      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      console.log('[AudioPage] posts found:', merged.length, 'audio title:', audio.title);
      setPosts(merged);
    }
    setLoading(false);
  };

  const togglePlay = () => {
    const url = track?.file_url;
    if (!url) { toast.info('Preview not available'); return; }
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      // Seek to snippet_start if set
      if (track.snippet_start) audioRef.current.currentTime = track.snippet_start;
      // Auto-stop at snippet_end if set
      if (track.snippet_end) {
        const endTime = track.snippet_end;
        const checkEnd = () => {
          if (audioRef.current && audioRef.current.currentTime >= endTime) {
            audioRef.current.pause();
            audioRef.current.currentTime = track.snippet_start ?? 0;
            setPlaying(false);
            audioRef.current.removeEventListener('timeupdate', checkEnd);
          }
        };
        audioRef.current.addEventListener('timeupdate', checkEnd);
      }
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
  };

  const handleUseAudio = () => {
    if (!track) return;
    const audioData = {
      track_id:    track.id,
      title:       track.title,
      artist:      track.artist || '',
      artwork_url: track.artwork_url || '',
      file_url:    track.file_url,
      duration_sec:track.duration_sec,
      snippetStart: track.snippet_start ?? 0,
      snippetEnd:   track.snippet_end,
    };
    setPendingAudio(audioData);
    setShowModePicker(true);
  };

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!track) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
      <Music className="w-12 h-12 text-gray-200" />
      <p className="text-gray-400">Audio not found</p>
      <button onClick={() => navigate(-1)} className="text-blue-500 text-sm">Go back</button>
    </div>
  );

  return (
    <>
      {/* ── Mode Picker sheet ── */}
      {showModePicker && !showComposer && (
        <>
          <style>{`@keyframes modePickerIn{from{transform:translateY(100%);opacity:0.5}to{transform:translateY(0);opacity:1}}`}</style>
          <div className="fixed inset-0 z-[110] flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={()=>setShowModePicker(false)}/>
            <div className="relative bg-white rounded-t-3xl overflow-hidden"
              style={{animation:'modePickerIn 0.32s cubic-bezier(0.32,0.72,0,1)', paddingBottom:'env(safe-area-inset-bottom)'}}>
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-4">
                <div className="w-10 h-1 rounded-full bg-gray-200"/>
              </div>
              {/* Header */}
              <div className="px-5 pb-4 border-b border-gray-100">
                <p className="text-base font-black text-gray-900">Create with this audio</p>
                <p className="text-sm text-gray-400 mt-0.5">
                  ♫ {track?.title} · {track?.artist || 'Original Audio'}
                </p>
              </div>
              {/* Options */}
              <div className="px-4 py-3 space-y-2">
                {[
                  { id:'post'  as const, emoji:'🖼️', label:'Post',  sub:'Photo or video with audio' },
                  { id:'reel'  as const, emoji:'🎬', label:'Reel',  sub:'Short vertical video'       },
                  { id:'story' as const, emoji:'⭕', label:'Story', sub:'Disappears after 24h'       },
                ].map(opt => (
                  <button key={opt.id}
                    onClick={()=>{
                      setSelectedMode(opt.id);
                      setShowModePicker(false);
                      setShowComposer(true);
                    }}
                    className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left transition-all active:scale-[0.98]"
                    style={{background:'#f9fafb', border:'1px solid #f0f0f0'}}>
                    <div className="w-12 h-12 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-2xl shadow-sm shrink-0">
                      {opt.emoji}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-black text-gray-900">{opt.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{opt.sub}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6"/>
                    </svg>
                  </button>
                ))}
              </div>
              <div className="px-4 pb-4">
                <button onClick={()=>setShowModePicker(false)}
                  className="w-full py-3 rounded-2xl text-sm font-semibold text-gray-400 bg-gray-100">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {showComposer && (
        <PostComposer
          initialAudio={pendingAudio}
          mode={selectedMode}
          onPost={() => { setShowComposer(false); toast.success('Post published!'); }}
          onClose={() => setShowComposer(false)}
        />
      )}

      <style>{`
        @keyframes audioSlideUp {
          from { transform: translateY(100%); opacity: 0.7; }
          to   { transform: translateY(0);    opacity: 1;   }
        }
        @keyframes waveBar {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1);   }
        }
      `}</style>

      <div
        className="min-h-screen bg-white"
        style={{ animation: 'audioSlideUp 0.38s cubic-bezier(0.32,0.72,0,1)' }}
      >
        {/* ── Sticky header ── */}
        <div
          className="sticky top-0 z-10 flex items-center gap-3 px-4 pt-12 pb-3"
          style={{ background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #f3f4f6' }}
        >
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
          <p className="flex-1 text-sm font-black text-gray-900 truncate">{track.title}</p>
          <button
            onClick={() => {
              navigator.share?.({ title: track.title, url: window.location.href })
                .catch(() => { navigator.clipboard.writeText(window.location.href); toast.success('Link copied'); });
            }}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <Share2 className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* ── Audio hero card (dark gradient — media card) ── */}
        <div className="px-4 pt-4 pb-5">
          <div className="rounded-3xl overflow-hidden"
            style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81,#1e293b)', padding: 24 }}>

            {/* Artwork + info */}
            <div className="flex items-center gap-4 mb-5">
              <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                {track.artwork_url
                  ? <img src={track.artwork_url} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-3xl">🎵</div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-black text-white truncate">{track.title}</p>
                <p className="text-sm text-white/50 truncate mt-0.5">
                  {track.artist || 'Original Audio'} · {fmtDuration(track.duration_sec)}
                </p>
                {track.is_original && (
                  <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-black text-green-400"
                    style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}>
                    ✓ Original Audio
                  </span>
                )}
              </div>
            </div>

            {/* Waveform */}
            <div className="flex items-center gap-px h-10 mb-5 cursor-pointer" onClick={togglePlay}>
              {[...Array(50)].map((_, i) => (
                <div key={i} className="flex-1 rounded-full"
                  style={{
                    height: `${20 + Math.sin(i * 0.7) * 40 + Math.cos(i * 0.3) * 20}%`,
                    background: playing ? '#818cf8' : 'rgba(255,255,255,0.2)',
                    animation: playing ? `waveBar ${0.5 + i * 0.03}s ease-in-out ${i * 0.02}s infinite alternate` : 'none',
                  }} />
              ))}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 mb-5">
              {[
                { icon: Users, val: fmtCount(track.use_count || posts.length), label: 'Posts' },
                { icon: Bookmark, val: fmtCount(track.save_count), label: 'Saves' },
                { icon: TrendingUp, val: track.is_trending ? 'Trending' : '—', label: 'Status' },
              ].map(({ icon: Icon, val, label }) => (
                <div key={label} className="flex-1 text-center">
                  <p className="text-base font-black text-white">{val}</p>
                  <p className="text-[10px] text-white/40 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2.5">
              <button onClick={togglePlay}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black text-white transition-all active:scale-95"
                style={{ background: playing ? 'rgba(255,255,255,0.1)' : '#6366f1' }}>
                {playing ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4 ml-0.5" /> Play</>}
              </button>
              <button onClick={handleUseAudio}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black text-white transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.12)' }}>
                <Music className="w-4 h-4" /> Use Audio
              </button>
              <button onClick={() => setSaved(s => !s)}
                className="w-12 flex items-center justify-center rounded-2xl transition-all active:scale-95"
                style={{ background: saved ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)' }}>
                <Bookmark className={`w-4 h-4 ${saved ? 'text-indigo-400 fill-indigo-400' : 'text-white/50'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Posts section ── */}
        <div className="px-4 pb-2 flex items-center justify-between">
          <p className="text-sm font-black text-gray-900">
            Posts using this audio
            {posts.length > 0 && <span className="text-gray-400 font-normal ml-1.5">({posts.length})</span>}
          </p>
        </div>

        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Music className="w-10 h-10 text-gray-200" />
            <p className="text-sm text-gray-400">No posts using this audio yet</p>
            <button onClick={handleUseAudio}
              className="mt-2 px-5 py-2.5 rounded-2xl text-sm font-black text-white"
              style={{ background: '#6366f1' }}>
              Be the first to use it
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-px bg-gray-100">
            {posts.map((row: any) => {
              const prof  = row.profiles || {};
              const img   = Array.isArray(row.media_urls) ? row.media_urls[0] : null;
              const isVid = row.post_type === 'video' || row.video_url;
              return (
                <button key={row.id}
                  onClick={() => navigate(`/post/${row.id}`)}
                  className="relative aspect-square bg-gray-200 overflow-hidden">
                  {img
                    ? <img src={img} className="w-full h-full object-cover"/>
                    : <div className="w-full h-full flex items-center justify-center bg-gray-100">
                        <Music className="w-6 h-6 text-gray-300"/>
                      </div>}
                  {isVid && (
                    <div className="absolute top-1.5 right-1.5">
                      <svg className="w-4 h-4 text-white drop-shadow" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  )}
                  {/* Author avatar */}
                  <div className="absolute bottom-1.5 left-1.5 w-6 h-6 rounded-full border border-white overflow-hidden bg-gray-300">
                    {prof.avatar_url
                      ? <img src={prof.avatar_url} className="w-full h-full object-cover"/>
                      : <div className="w-full h-full bg-blue-400 flex items-center justify-center text-[8px] font-black text-white">
                          {(prof.name||prof.username||'?')[0].toUpperCase()}
                        </div>}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="h-24" />
      </div>
    </>
  );
}