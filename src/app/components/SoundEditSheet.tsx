/**
 * Filmons — SoundEditSheet
 * Slides up from bottom when user taps a sound in Profile.
 * Edit title, category, visibility + save to user_sounds.
 * src/app/components/SoundEditSheet.tsx
 */
import { useState, useRef, useEffect } from 'react';
import {
  X, Play, Pause, Globe, Lock, Eye, Check,
  Music, Trash2, TrendingUp,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';

const CATEGORIES = [
  'original_audio','voiceover','music','sound_effect',
  'ambient','podcast','cinematic',
];

const VISIBILITY = [
  { id:'public',   label:'Public',   icon: Globe, sub:'Anyone can find and use this sound' },
  { id:'unlisted', label:'Unlisted', icon: Eye,   sub:'Only people with the link'          },
  { id:'private',  label:'Private',  icon: Lock,  sub:'Only you can see and use this'      },
];

interface Sound {
  id:               string;
  title:            string;
  description?:     string;
  category?:        string;
  file_url?:        string;
  artwork_url?:     string;
  duration_sec?:    number;
  visibility:       string;
  copyright_status: string;
  use_count:        number;
  fp_earned:        number;
  is_original:      boolean;
}

interface Props {
  sound:    Sound;
  onClose:  () => void;
  onSaved:  (updated: Sound) => void;
  onDelete: (id: string) => void;
}

export function SoundEditSheet({ sound, onClose, onSaved, onDelete }: Props) {
  const [title,    setTitle]   = useState(sound.title);
  const [desc,     setDesc]    = useState(sound.description ?? '');
  const [category, setCategory]= useState(sound.category ?? 'original_audio');
  const [vis,      setVis]     = useState(sound.visibility ?? 'public');
  const [saving,   setSaving]  = useState(false);
  const [playing,  setPlaying] = useState(false);
  const [showDel,  setShowDel] = useState(false);
  const audioRef = useRef<HTMLAudioElement|null>(null);

  const fmt = (s?: number) => {
    if (!s) return '—';
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  };

  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  const togglePlay = () => {
    if (!sound.file_url) { toast.info('No preview available'); return; }
    if (!audioRef.current) {
      audioRef.current = new Audio(sound.file_url);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play().catch(()=>{}); setPlaying(true); }
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Sound name is required'); return; }
    setSaving(true);
    try {
      const updates = {
        title:       title.trim(),
        description: desc.trim() || null,
        category,
        visibility:  vis,
        updated_at:  new Date().toISOString(),
      };
      const { error } = await supabase
        .from('user_sounds')
        .update(updates)
        .eq('id', sound.id);

      if (error) throw error;

      // If changed to public and approved, sync to audio_tracks
      if (vis === 'public' && sound.copyright_status === 'approved') {
        await supabase.from('audio_tracks').upsert({
          title:            title.trim(),
          creator_id:       null, // will be set if we have user
          file_url:         sound.file_url,
          source:           'upload',
          is_original:      true,
          copyright_status: 'approved',
          category,
        }, { onConflict: 'file_url', ignoreDuplicates: false }).catch(()=>{});
      }

      toast.success('Sound updated');
      onSaved({ ...sound, ...updates });
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      // Delete from storage
      if (sound.file_url) {
        const path = sound.file_url.split('/audio/')[1];
        if (path) await supabase.storage.from('audio').remove([path]).catch(()=>{});
      }
      await supabase.from('user_sounds').delete().eq('id', sound.id);
      toast.success('Sound deleted');
      onDelete(sound.id);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end">
      <style>{`@keyframes soundEditIn{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>

      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>

      {/* Sheet */}
      <div className="relative bg-white rounded-t-3xl flex flex-col"
        style={{
          maxHeight: '92vh',
          animation: 'soundEditIn 0.32s cubic-bezier(0.32,0.72,0,1)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-9 h-1 rounded-full bg-gray-200"/>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 shrink-0 border-b border-gray-100">
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4 text-gray-500"/>
          </button>
          <p className="text-sm font-black text-gray-900">Edit Sound</p>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-1.5 rounded-full text-sm font-black text-white disabled:opacity-50"
            style={{background:'#51A2FF'}}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Sound preview */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-50">
            {sound.artwork_url
              ? <img src={sound.artwork_url} className="w-14 h-14 rounded-2xl object-cover shrink-0"/>
              : <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center shrink-0">
                  <Music className="w-6 h-6 text-gray-400"/>
                </div>}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-gray-900 truncate">{sound.title}</p>
              <p className="text-xs text-gray-400">{fmt(sound.duration_sec)}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {sound.use_count > 0 && (
                  <span className="text-[10px] font-bold text-blue-500">{sound.use_count.toLocaleString()} uses</span>
                )}
                {sound.fp_earned > 0 && (
                  <span className="text-[10px] font-bold text-yellow-500">🪙 {sound.fp_earned} FP</span>
                )}
                {sound.copyright_status === 'approved' && (
                  <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">✓ Approved</span>
                )}
                {sound.copyright_status === 'pending' && (
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Under Review</span>
                )}
                {sound.copyright_status === 'blocked' && (
                  <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">Blocked</span>
                )}
              </div>
            </div>
            {/* Play button */}
            <button onClick={togglePlay}
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{background: playing ? 'rgba(81,162,255,0.1)' : '#51A2FF', border:'2px solid #51A2FF'}}>
              {playing
                ? <Pause className="w-4 h-4 text-blue-500"/>
                : <Play  className="w-4 h-4 text-white ml-0.5"/>}
            </button>
          </div>

          <div className="px-4 py-4 space-y-5">

            {/* Title */}
            <div>
              <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Sound Name</p>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="My Original Sound"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none focus:border-blue-400 transition-colors"
              />
            </div>

            {/* Description */}
            <div>
              <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">
                Description <span className="text-gray-300 font-normal normal-case">(optional)</span>
              </p>
              <textarea
                value={desc}
                onChange={e => setDesc(e.target.value)}
                placeholder="Describe your sound…"
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none focus:border-blue-400 transition-colors resize-none"
              />
            </div>

            {/* Category */}
            <div>
              <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Category</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => setCategory(c)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold capitalize transition-all"
                    style={category === c
                      ? {background:'#51A2FF', color:'#fff'}
                      : {background:'#f3f4f6', color:'#6b7280'}}>
                    {c.replace(/_/g,' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Visibility */}
            <div>
              <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Visibility</p>
              <div className="space-y-2">
                {VISIBILITY.map(v => (
                  <button key={v.id} onClick={() => setVis(v.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all border"
                    style={vis === v.id
                      ? {borderColor:'#51A2FF', background:'rgba(81,162,255,0.06)'}
                      : {borderColor:'#f3f4f6', background:'#fff'}}>
                    <v.icon className="w-4 h-4 shrink-0" style={{color: vis === v.id ? '#51A2FF' : '#9ca3af'}}/>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black" style={{color: vis === v.id ? '#51A2FF' : '#111827'}}>{v.label}</p>
                      <p className="text-[10px] text-gray-400">{v.sub}</p>
                    </div>
                    {vis === v.id && <Check className="w-4 h-4 text-blue-500 shrink-0"/>}
                  </button>
                ))}
              </div>
              {vis === 'public' && sound.copyright_status === 'approved' && (
                <div className="mt-2 p-3 rounded-xl bg-green-50 border border-green-100 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-500 shrink-0"/>
                  <p className="text-[11px] text-green-600">Public approved sounds appear in the Filmons audio library and earn FP rewards</p>
                </div>
              )}
            </div>

            {/* Delete */}
            <div className="pt-2 pb-4">
              {!showDel ? (
                <button onClick={() => setShowDel(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-red-400 border border-red-100 bg-red-50">
                  <Trash2 className="w-4 h-4"/> Delete Sound
                </button>
              ) : (
                <div className="border border-red-200 rounded-xl p-4 bg-red-50 space-y-3">
                  <p className="text-sm font-bold text-red-600 text-center">Delete this sound permanently?</p>
                  <p className="text-xs text-red-400 text-center">This cannot be undone. Posts using this sound will lose the audio link.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setShowDel(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-white border border-gray-200">
                      Cancel
                    </button>
                    <button onClick={handleDelete} disabled={saving}
                      className="flex-1 py-2.5 rounded-xl text-sm font-black text-white bg-red-500 disabled:opacity-50">
                      {saving ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}