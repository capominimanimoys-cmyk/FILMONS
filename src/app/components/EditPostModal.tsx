import { useState, useRef, useEffect } from 'react';
import {
  X, ChevronLeft, ChevronRight, MapPin, Globe, Users, Lock,
  Music, Trash2, MessageCircle, Download, Check, Loader2,
} from 'lucide-react';
import { Post } from '../types';
import { postsApi } from '../lib/api';
import { toast } from 'sonner';

// ── Helpers ───────────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none"
      style={{ background: value ? '#3b82f6' : '#d1d5db' }}
    >
      <span
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
        style={{ left: value ? '26px' : '2px' }}
      />
    </button>
  );
}

function VisibilitySheet({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (v: 'public' | 'followers' | 'private') => void;
  onClose: () => void;
}) {
  const opts: { key: 'public' | 'followers' | 'private'; icon: React.ReactNode; label: string; sub: string }[] = [
    { key: 'public',    icon: <Globe className="w-5 h-5 text-gray-500"/>,  label: 'Public',    sub: 'Anyone can see this post' },
    { key: 'followers', icon: <Users className="w-5 h-5 text-gray-500"/>,  label: 'Followers', sub: 'Only your followers' },
    { key: 'private',   icon: <Lock  className="w-5 h-5 text-gray-500"/>,  label: 'Only me',   sub: 'Only you can see this' },
  ];
  return (
    <div className="fixed inset-0 z-[70] flex items-end" onClick={onClose}>
      <div className="w-full bg-white rounded-t-2xl shadow-xl pb-6 pt-3" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4"/>
        <p className="text-center font-bold text-gray-900 text-sm mb-2">Audience</p>
        {opts.map(o => (
          <button key={o.key} onClick={() => { onChange(o.key); onClose(); }}
            className="flex items-center gap-3 w-full px-5 py-3.5 hover:bg-gray-50">
            {o.icon}
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-gray-900">{o.label}</p>
              <p className="text-xs text-gray-400">{o.sub}</p>
            </div>
            {value === o.key && <Check className="w-4 h-4 text-blue-500"/>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  post: Post;
  onSave: (updated: Post) => void;
  onClose: () => void;
}

export function EditPostModal({ post, onSave, onClose }: Props) {
  const media = [
    ...(post.images  || []).map(u => ({ type: 'image' as const, url: u })),
    ...(post.videos  || []).map(u => ({ type: 'video' as const, url: u })),
    ...(post.gifs    || []).map(u => ({ type: 'image' as const, url: u })),
  ];
  const [mediaIdx, setMediaIdx]         = useState(0);
  const [caption, setCaption]           = useState(post.content || '');
  const [location, setLocation]         = useState((post as any).location || '');
  const [visibility, setVisibility]     = useState<'public'|'followers'|'private'>((post as any).visibility || 'public');
  const [allowComments, setAllowComments] = useState(post.allowComments !== false);
  const [allowDownload, setAllowDownload] = useState(post.allowDownload !== false);
  const [hasAudio, setHasAudio]         = useState(!!(post.audioTitle || (post as any).audio_url));
  const [saving, setSaving]             = useState(false);
  const [showVisibility, setShowVisibility] = useState(false);
  const [showDiscard, setShowDiscard]   = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textRef.current) {
      textRef.current.style.height = 'auto';
      textRef.current.style.height = textRef.current.scrollHeight + 'px';
    }
  }, [caption]);

  const isDirty =
    caption       !== (post.content || '')      ||
    location      !== ((post as any).location || '') ||
    visibility    !== ((post as any).visibility || 'public') ||
    allowComments !== (post.allowComments !== false) ||
    allowDownload !== (post.allowDownload !== false) ||
    hasAudio      !== !!(post.audioTitle || (post as any).audio_url);

  const handleClose = () => {
    if (isDirty) { setShowDiscard(true); return; }
    onClose();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      if (caption       !== (post.content || ''))             { updates.content = caption; updates.caption = caption; }
      if (location      !== ((post as any).location || ''))   updates.location = location || null;
      if (visibility    !== ((post as any).visibility || 'public')) updates.visibility = visibility;
      if (allowComments !== (post.allowComments !== false))   updates.allow_comments = allowComments;
      if (allowDownload !== (post.allowDownload !== false))   updates.allow_download = allowDownload;
      if (!hasAudio && (post.audioTitle || (post as any).audio_url)) {
        updates.audio_url = null;
        updates.audio_title = null;
        updates.audio_artist = null;
        updates.audio_id = null;
      }

      if (Object.keys(updates).length) {
        await postsApi.update(post.id, updates);
      }

      const updated: Post = {
        ...post,
        content:      caption,
        allowComments,
        allowDownload,
        location,
        visibility,
        audioTitle:   hasAudio ? post.audioTitle : undefined,
        audioId:      hasAudio ? post.audioId    : undefined,
      } as any;
      (updated as any).location   = location;
      (updated as any).visibility = visibility;
      if (!hasAudio) {
        (updated as any).audio_url   = undefined;
        updated.audioTitle           = undefined;
        updated.audioId              = undefined;
      }

      onSave(updated);
      toast.success('Post updated');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save changes');
    } finally {
      setSaving(false);
    }
  };

  const visibilityIcon = visibility === 'private'
    ? <Lock className="w-3.5 h-3.5"/>
    : visibility === 'followers'
    ? <Users className="w-3.5 h-3.5"/>
    : <Globe className="w-3.5 h-3.5"/>;
  const visibilityLabel = visibility === 'private' ? 'Only me' : visibility === 'followers' ? 'Followers' : 'Public';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col"
      style={{
        backgroundColor: '#fff',
        paddingBottom: 'env(safe-area-inset-bottom)',
        animation: 'editPostSlideIn 0.28s cubic-bezier(0.4,0,0.2,1) both',
      }}>
      <style>{`@keyframes editPostSlideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between px-2 pt-12 pb-3 border-b border-gray-100">
        <button onClick={handleClose} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100">
          <X className="w-5 h-5 text-gray-700"/>
        </button>
        <p className="text-sm font-bold text-gray-900">Edit post</p>
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-1.5 rounded-full text-sm font-bold text-white disabled:opacity-60"
          style={{ background: '#3b82f6' }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Done'}
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto">

        {/* Media preview */}
        {media.length > 0 && (
          <div className="relative bg-black" style={{ aspectRatio: '1' }}>
            {media[mediaIdx].type === 'video'
              ? <video src={media[mediaIdx].url} className="w-full h-full object-contain" muted playsInline preload="metadata"/>
              : <img src={media[mediaIdx].url} className="w-full h-full object-contain" alt=""/>
            }
            {media.length > 1 && (
              <>
                {mediaIdx > 0 && (
                  <button onClick={() => setMediaIdx(i => i - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center">
                    <ChevronLeft className="w-4 h-4 text-white"/>
                  </button>
                )}
                {mediaIdx < media.length - 1 && (
                  <button onClick={() => setMediaIdx(i => i + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center">
                    <ChevronRight className="w-4 h-4 text-white"/>
                  </button>
                )}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  {media.map((_, i) => (
                    <div key={i} className="rounded-full transition-all"
                      style={{ width: i === mediaIdx ? 16 : 5, height: 5,
                        background: i === mediaIdx ? '#fff' : 'rgba(255,255,255,0.5)' }}/>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Caption */}
        <div className="px-4 py-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Caption</p>
          <textarea
            ref={textRef}
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="Write a caption…"
            className="w-full text-sm text-gray-900 placeholder-gray-400 resize-none outline-none leading-relaxed"
            style={{ minHeight: 80, maxHeight: 200 }}
            maxLength={2200}
          />
          <p className="text-xs text-gray-300 text-right mt-1">{caption.length}/2200</p>
        </div>

        {/* Location */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-400 shrink-0"/>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Add location"
              className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none"
            />
            {location && (
              <button onClick={() => setLocation('')}>
                <X className="w-4 h-4 text-gray-300"/>
              </button>
            )}
          </div>
        </div>

        {/* Audience */}
        <button onClick={() => setShowVisibility(true)}
          className="flex items-center gap-3 w-full px-4 py-4 border-b border-gray-100 text-left hover:bg-gray-50">
          <div className="flex items-center gap-2 text-gray-500">{visibilityIcon}</div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">Audience</p>
            <p className="text-xs text-gray-400">{visibilityLabel}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300"/>
        </button>

        {/* Audio */}
        {(post.audioTitle || (post as any).audio_url) && (
          <div className="px-4 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Music className="w-5 h-5 text-blue-500"/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{post.audioTitle || 'Original audio'}</p>
                {post.audioArtist && <p className="text-xs text-gray-400 truncate">{post.audioArtist}</p>}
              </div>
              <button onClick={() => setHasAudio(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  hasAudio ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
                }`}>
                {hasAudio ? <><Trash2 className="w-3 h-3"/> Remove</> : <><Check className="w-3 h-3"/> Keep</>}
              </button>
            </div>
            {!hasAudio && (
              <p className="mt-2 text-xs text-gray-400 pl-1">Audio will be removed when you save.</p>
            )}
          </div>
        )}

        {/* Settings */}
        <div className="px-4 py-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider py-2">Settings</p>

          <div className="flex items-center justify-between py-3 border-b border-gray-50">
            <div className="flex items-center gap-3">
              <MessageCircle className="w-4 h-4 text-gray-400"/>
              <div>
                <p className="text-sm font-semibold text-gray-900">Allow comments</p>
                <p className="text-xs text-gray-400">{allowComments ? 'Anyone can comment' : 'Comments turned off'}</p>
              </div>
            </div>
            <Toggle value={allowComments} onChange={setAllowComments}/>
          </div>

          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Download className="w-4 h-4 text-gray-400"/>
              <div>
                <p className="text-sm font-semibold text-gray-900">Allow downloads</p>
                <p className="text-xs text-gray-400">{allowDownload ? 'Others can download' : 'Downloads turned off'}</p>
              </div>
            </div>
            <Toggle value={allowDownload} onChange={setAllowDownload}/>
          </div>
        </div>

        <div className="h-8"/>
      </div>

      {/* ── Visibility sheet ── */}
      {showVisibility && (
        <VisibilitySheet value={visibility} onChange={setVisibility} onClose={() => setShowVisibility(false)}/>
      )}

      {/* ── Discard confirm ── */}
      {showDiscard && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-8">
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-xl overflow-hidden">
            <div className="px-5 py-5 text-center border-b border-gray-100">
              <p className="font-bold text-gray-900 text-base">Discard changes?</p>
              <p className="text-sm text-gray-500 mt-1">Your edits won't be saved.</p>
            </div>
            <button onClick={onClose}
              className="w-full py-3.5 text-sm font-bold text-red-500 border-b border-gray-100 hover:bg-red-50">
              Discard
            </button>
            <button onClick={() => setShowDiscard(false)}
              className="w-full py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Keep editing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
