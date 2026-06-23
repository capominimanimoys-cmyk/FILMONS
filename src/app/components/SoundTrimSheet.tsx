/**
 * Filmons — SoundTrimSheet
 * Waveform trim editor for user_sounds — slides up from bottom.
 * Saves snippet_start + snippet_end to user_sounds table.
 * src/app/components/SoundTrimSheet.tsx
 */
import { useState, useRef, useEffect } from 'react';
import { X, Play, Pause, Scissors, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';

interface Props {
  sound: {
    id:             string;
    title:          string;
    file_url?:      string;
    duration_sec?:  number;
    snippet_start?: number;
    snippet_end?:   number;
  };
  onClose:  () => void;
  onSaved:  (snippetStart: number, snippetEnd: number) => void;
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function SoundTrimSheet({ sound, onClose, onSaved }: Props) {
  const dur = sound.duration_sec ?? 60;
  const [start,   setStart]   = useState(sound.snippet_start ?? 0);
  const [end,     setEnd]     = useState(sound.snippet_end   ?? Math.min(30, dur));
  const [playing, setPlaying] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [progress,setProgress]= useState(0);
  const audioRef = useRef<HTMLAudioElement|null>(null);
  const barRef   = useRef<HTMLDivElement>(null);
  const animRef  = useRef<number>(0);

  useEffect(() => {
    if (!sound.file_url) return;
    const a = new Audio(sound.file_url);
    a.preload = 'metadata';
    a.ontimeupdate = () => {
      setProgress(a.currentTime);
      if (a.currentTime >= end) { a.pause(); setPlaying(false); }
    };
    a.onended = () => setPlaying(false);
    audioRef.current = a;
    return () => { a.pause(); cancelAnimationFrame(animRef.current); };
  }, [sound.file_url]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) { toast.info('No audio preview available'); return; }
    if (playing) { a.pause(); setPlaying(false); }
    else {
      a.currentTime = start;
      a.play().catch(() => toast.info('Preview unavailable'));
      setPlaying(true);
    }
  };

  const pct = (v: number) => Math.min(100, Math.max(0, (v / dur) * 100));

  const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const t = Math.round(((e.clientX - rect.left) / rect.width) * dur);
    const newStart = Math.max(0, t);
    const newEnd   = Math.min(dur, t + Math.max(5, end - start));
    setStart(newStart);
    setEnd(Math.min(dur, newEnd));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Save to user_sounds
      const { error } = await supabase
        .from('user_sounds')
        .update({ snippet_start: start, snippet_end: end, updated_at: new Date().toISOString() })
        .eq('id', sound.id);
      if (error) throw error;

      // 2. Sync to audio_tracks if this sound is published there
      const { data: atRow } = await supabase
        .from('audio_tracks')
        .select('id')
        .eq('file_url', (sound as any).file_url)
        .single();
      if (atRow?.id) {
        await supabase
          .from('audio_tracks')
          .update({ snippet_start: start, snippet_end: end })
          .eq('id', atRow.id)
          .catch(() => {});
      }

      // 3. Sync to post_audio for all posts using this sound
      await supabase
        .from('post_audio')
        .update({ snippet_start: start, snippet_end: end })
        .eq('track_id', sound.id)
        .catch(() => {});

      toast.success('Trim segment saved');
      onSaved(start, end);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const selectedDur = end - start;

  return (
    <div className="fixed inset-0 z-[85] flex flex-col justify-end">
      <style>{`@keyframes trimSheetIn{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>

      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}/>

      {/* Sheet — dark cinema style */}
      <div className="relative bg-gray-950 rounded-t-3xl flex flex-col"
        style={{
          maxHeight: '85vh',
          animation: 'trimSheetIn 0.32s cubic-bezier(0.32,0.72,0,1)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-9 h-1 rounded-full bg-white/20"/>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-4 shrink-0">
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4 text-white"/>
          </button>
          <div className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-blue-400"/>
            <p className="text-sm font-black text-white">Trim Sound</p>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-1.5 rounded-full text-sm font-black text-white disabled:opacity-50 flex items-center gap-1.5"
            style={{background:'#51A2FF'}}>
            <Check className="w-3.5 h-3.5"/>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-6">

          {/* Track name */}
          <p className="text-sm font-black text-white text-center truncate px-4">{sound.title}</p>

          {/* Waveform timeline */}
          <div>
            <div
              ref={barRef}
              className="w-full relative rounded-2xl overflow-hidden cursor-pointer"
              style={{
                height: 72,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
              onClick={handleBarClick}>

              {/* Waveform bars */}
              <div className="absolute inset-0 flex items-center px-2 gap-px">
                {[...Array(64)].map((_, i) => {
                  const pos = i / 64;
                  const inSel = pos >= pct(start)/100 && pos <= pct(end)/100;
                  const isPast = playing && pos <= pct(progress)/100 && inSel;
                  return (
                    <div key={i} className="flex-1 rounded-full transition-colors"
                      style={{
                        height: `${22 + Math.sin(i * 0.7) * 36 + Math.cos(i * 0.3) * 18}%`,
                        background: isPast ? '#fff' : inSel ? '#51A2FF' : 'rgba(255,255,255,0.12)',
                      }}/>
                  );
                })}
              </div>

              {/* Selection window */}
              <div className="absolute top-0 bottom-0 pointer-events-none rounded-xl"
                style={{
                  left:   `${pct(start)}%`,
                  width:  `${pct(end) - pct(start)}%`,
                  border: '2px solid #51A2FF',
                  background: 'rgba(81,162,255,0.07)',
                  boxShadow: '0 0 12px rgba(81,162,255,0.3)',
                }}/>

              {/* Playhead */}
              {playing && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none"
                  style={{left:`${pct(progress)}%`, transition:'left 0.1s linear'}}/>
              )}
            </div>

            {/* Time labels */}
            <div className="flex justify-between mt-2 px-0.5">
              <span className="text-[11px] text-white/30 tabular-nums">{fmt(start)}</span>
              <span className="text-[11px] font-black tabular-nums" style={{color:'#51A2FF'}}>
                {fmt(selectedDur)} selected
              </span>
              <span className="text-[11px] text-white/30 tabular-nums">{fmt(end)}</span>
            </div>
          </div>

          {/* Sliders */}
          <div className="space-y-4">
            {[
              { label:'Start', val:start, set:(v:number)=>setStart(Math.min(v, end-5)), max:dur-5 },
              { label:'End',   val:end,   set:(v:number)=>setEnd(Math.max(v, start+5)), max:dur   },
            ].map(sl => (
              <div key={sl.label} className="flex items-center gap-3">
                <p className="text-[11px] text-white/40 w-8 shrink-0">{sl.label}</p>
                <input
                  type="range" min={0} max={sl.max} value={sl.val}
                  onChange={e => sl.set(Number(e.target.value))}
                  className="flex-1 accent-blue-400"
                />
                <p className="text-[11px] text-white/60 w-12 text-right tabular-nums shrink-0">
                  {fmt(sl.val)}
                </p>
              </div>
            ))}
          </div>

          {/* Play button */}
          <div className="flex flex-col items-center gap-3">
            <button onClick={togglePlay}
              className="w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95"
              style={{
                background: playing ? 'rgba(81,162,255,0.2)' : '#51A2FF',
                border: '2px solid #51A2FF',
                boxShadow: playing ? 'none' : '0 0 20px rgba(81,162,255,0.35)',
              }}>
              {playing
                ? <Pause className="w-6 h-6 text-white"/>
                : <Play  className="w-6 h-6 text-white ml-1"/>}
            </button>
            <p className="text-[11px] text-white/30">
              {playing ? 'Playing preview…' : 'Preview selected segment'}
            </p>
          </div>

          {/* Current segment info */}
          <div className="rounded-2xl p-4 space-y-1"
            style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)'}}>
            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Segment</p>
            <p className="text-sm font-black text-white">
              {fmt(start)} → {fmt(end)}
              <span className="ml-2 text-xs font-normal text-white/40">({fmt(selectedDur)})</span>
            </p>
            {(sound.snippet_start !== undefined || sound.snippet_end !== undefined) && (
              <p className="text-[10px] text-white/25">
                Previously: {fmt(sound.snippet_start ?? 0)} → {fmt(sound.snippet_end ?? dur)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}