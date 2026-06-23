/**
 * StoryCreator.tsx
 * Full Instagram-style story creator.
 * - Upload photo/video from gallery or camera
 * - Add text overlay (color, size, position)
 * - Add stickers (emoji picker)
 * - Add poll (question + 2 options)
 * - Add link sticker
 * - Publish → saves to localStorage stories store
 * - 9:16 canvas preview
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Type, Smile, BarChart2, Link2, Music, Send,
  ChevronLeft, Camera, Image as ImageIcon, Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

import { supabase } from '../../lib/supabase';

// ── Story store (localStorage + Supabase) ────────────────────────────────────
export interface StorySlide {
  id: string;
  type: 'image' | 'video';
  url: string;                     // data URL or object URL
  textOverlays: TextOverlay[];
  stickers: StickerOverlay[];
  poll?: Poll;
  link?: string;
  music?: string;
  bgColor: string;
}

export interface TextOverlay {
  id: string; text: string; color: string; size: number;
  x: number; y: number;           // percentage from top-left
  bold: boolean;
}

export interface StickerOverlay {
  id: string; emoji: string; x: number; y: number; size: number;
}

export interface Poll {
  question: string; optionA: string; optionB: string;
  votesA: number; votesB: number; voters: string[];
}

export interface Story {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  slides: StorySlide[];
  createdAt: string;
  expiresAt: string;               // 24h from now
  viewedBy: string[];
}

const STORIES_KEY = 'filmons_stories';

export function getStories(): Story[] {
  try {
    const all: Story[] = JSON.parse(localStorage.getItem(STORIES_KEY) || '[]');
    const now = Date.now();
    return all.filter(s => new Date(s.expiresAt).getTime() > now);
  } catch { return []; }
}

/** Fetch stories from Supabase (includes friends' stories) */
export async function getStoriesFromDB(): Promise<Story[]> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.warn('getStoriesFromDB error:', error.message);
      return getStories();
    }
    if (!data) return getStories();
    const dbStories: Story[] = data.map((row: any) => ({
      id:         row.id,
      userId:     row.user_id,
      userName:   row.user_name   || '',
      userAvatar: row.user_avatar || undefined,
      slides:     typeof row.slides === 'string' ? JSON.parse(row.slides) : (row.slides || []),
      createdAt:  row.created_at,
      expiresAt:  row.expires_at,
      viewedBy:   typeof row.viewed_by === 'string' ? JSON.parse(row.viewed_by) : (row.viewed_by || []),
    }));
    // Merge with local (local wins for own story)
    const local = getStories();
    const merged = [...dbStories];
    local.forEach(s => { if (!merged.find(d => d.id === s.id)) merged.push(s); });
    // Cache locally
    try { localStorage.setItem(STORIES_KEY, JSON.stringify(merged)); } catch {}
    return merged;
  } catch { return getStories(); }
}

export function saveStory(story: Story) {
  // Save to localStorage immediately
  try {
    const all = getStories().filter(s => s.userId !== story.userId);
    all.unshift(story);
    localStorage.setItem(STORIES_KEY, JSON.stringify(all));
  } catch {}

  // Save to Supabase so friends can see it
  (async () => {
    try {
      // Delete existing story for this user first
      const { error: delErr } = await supabase
        .from('stories')
        .delete()
        .eq('user_id', story.userId);
      if (delErr) console.warn('Story delete error:', delErr.message);

      // Insert new story — store slides/viewed_by as JSONB directly (not stringified)
      const { data, error } = await supabase
        .from('stories')
        .insert({
          id:          story.id,
          user_id:     story.userId,
          user_name:   story.userName  || '',
          user_avatar: story.userAvatar || null,
          slides:      story.slides,     // JSONB — no JSON.stringify needed
          viewed_by:   story.viewedBy,   // JSONB
          created_at:  story.createdAt,
          expires_at:  story.expiresAt,
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Story insert error:', error.message, error.details, error.hint);
      } else {
        console.log('✅ Story saved to DB, id:', data?.id);
      }
    } catch (e) {
      console.error('❌ Story save exception:', e);
    }
  })();
}

export function markStoryViewed(storyId: string, userId: string) {
  try {
    const all: Story[] = JSON.parse(localStorage.getItem(STORIES_KEY) || '[]');
    const updated = all.map(s => s.id === storyId && !s.viewedBy.includes(userId)
      ? { ...s, viewedBy: [...s.viewedBy, userId] } : s);
    localStorage.setItem(STORIES_KEY, JSON.stringify(updated));
    // Update DB too
    const story = updated.find(s => s.id === storyId);
    if (story) {
      supabase.from('stories').update({ viewed_by: JSON.stringify(story.viewedBy) })
        .eq('id', storyId).then(() => {}).catch(() => {});
    }
  } catch {}
}

export function voteOnPoll(storyId: string, slideId: string, option: 'A' | 'B', userId: string) {
  try {
    const all: Story[] = JSON.parse(localStorage.getItem(STORIES_KEY) || '[]');
    const updated = all.map(story => {
      if (story.id !== storyId) return story;
      return {
        ...story,
        slides: story.slides.map(slide => {
          if (slide.id !== slideId || !slide.poll) return slide;
          if (slide.poll.voters.includes(userId)) return slide;
          return {
            ...slide,
            poll: {
              ...slide.poll,
              votesA: option === 'A' ? slide.poll.votesA + 1 : slide.poll.votesA,
              votesB: option === 'B' ? slide.poll.votesB + 1 : slide.poll.votesB,
              voters: [...slide.poll.voters, userId],
            }
          };
        })
      };
    });
    localStorage.setItem(STORIES_KEY, JSON.stringify(updated));
  } catch {}
}

// ── BG gradients for text-only slides ────────────────────────────────────────
const BG_GRADIENTS = [
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#f093fb,#f5576c)',
  'linear-gradient(135deg,#4facfe,#00f2fe)',
  'linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#fa709a,#fee140)',
  'linear-gradient(135deg,#a18cd1,#fbc2eb)',
  'linear-gradient(135deg,#ffecd2,#fcb69f)',
  'linear-gradient(135deg,#1a1a2e,#16213e)',
];

const TEXT_COLORS = ['#ffffff','#000000','#ffdd00','#ff3b3b','#3bfff5','#ff8c00','#c8a2c8'];
const EMOJI_LIST  = ['🎬','🎥','🎞️','📸','🎭','🎨','✨','🔥','💫','🌟','❤️','👏','😂','🙌','💪','🎉','🎊','🌈','🦋','🌸'];

// ── Creator Modal ─────────────────────────────────────────────────────────────
interface StoryCreatorProps { onClose: () => void; onPublished: (story?: Story) => void; }

export function StoryCreator({ onClose, onPublished }: StoryCreatorProps) {
  const { user } = useAuth();
  const fileRef  = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Slide state
  const [mediaUrl, setMediaUrl]     = useState<string | null>(null);
  const [mediaType, setMediaType]   = useState<'image' | 'video'>('image');
  const [bgColor, setBgColor]       = useState(BG_GRADIENTS[0]);
  const [texts, setTexts]           = useState<TextOverlay[]>([]);
  const [stickers, setStickers]     = useState<StickerOverlay[]>([]);
  const [poll, setPoll]             = useState<Poll | null>(null);
  const [link, setLink]             = useState('');
  const [music, setMusic]           = useState('');

  // Tool panels
  const [tool, setTool] = useState<'none'|'text'|'sticker'|'poll'|'link'|'music'>('none');

  // Text tool
  const [textInput,  setTextInput]  = useState('');
  const [textColor,  setTextColor]  = useState('#ffffff');
  const [textSize,   setTextSize]   = useState(28);
  const [textBold,   setTextBold]   = useState(false);

  // Poll tool
  const [pollQ,    setPollQ]    = useState('');
  const [pollOptA, setPollOptA] = useState('Yes');
  const [pollOptB, setPollOptB] = useState('No');

  const [publishing, setPublishing] = useState(false);
  const [visible,    setVisible]    = useState(false);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  const close = () => { setVisible(false); setTimeout(onClose, 300); };

  // ── Media upload ────────────────────────────────────────────────────────────
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const reader = new FileReader();
    reader.onloadend = () => {
      setMediaUrl(reader.result as string);
      setMediaType(isVideo ? 'video' : 'image');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ── Text overlay ────────────────────────────────────────────────────────────
  const addText = () => {
    if (!textInput.trim()) return;
    setTexts(prev => [...prev, {
      id: `t-${Date.now()}`, text: textInput.trim(),
      color: textColor, size: textSize, bold: textBold,
      x: 50, y: 40,
    }]);
    setTextInput('');
    setTool('none');
  };

  // ── Poll ────────────────────────────────────────────────────────────────────
  const addPoll = () => {
    if (!pollQ.trim()) return;
    setPoll({ question: pollQ.trim(), optionA: pollOptA || 'Yes', optionB: pollOptB || 'No', votesA: 0, votesB: 0, voters: [] });
    setTool('none');
  };

  // ── Publish ─────────────────────────────────────────────────────────────────
  const publish = async () => {
    if (!user) return;
    setPublishing(true);
    const slide: StorySlide = {
      id:   `slide-${Date.now()}`,
      type: mediaType,
      url:  mediaUrl || '',
      textOverlays: texts,
      stickers,
      poll:  poll || undefined,
      link:  link.trim() || undefined,
      music: music.trim() || undefined,
      bgColor,
    };
    const story: Story = {
      id:        `story-${user.id}-${Date.now()}`,
      userId:    user.id,
      userName:  user.name,
      userAvatar:user.avatar,
      slides:    [slide],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      viewedBy:  [],
    };
    saveStory(story);
    toast.success('Story published! 🎉');
    setPublishing(false);
    onPublished(story);
    close();
  };

  const canPublish = mediaUrl || texts.length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black transition-opacity duration-300"
        style={{ opacity: visible ? 0.85 : 0 }}
        onClick={close}
      />

      {/* Sheet */}
      <div
        className="relative w-full md:w-auto flex flex-col md:flex-row gap-0 md:gap-4 items-stretch md:items-start transition-transform duration-300 ease-out"
        style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)' }}
      >
        {/* ── 9:16 Preview canvas ── */}
        <div
          className="relative mx-auto overflow-hidden rounded-t-2xl md:rounded-2xl shadow-2xl flex-shrink-0"
          style={{ width: 300, height: 533, background: mediaUrl ? '#000' : bgColor }}
        >
          {/* Media */}
          {mediaUrl && mediaType === 'image' && (
            <img src={mediaUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          {mediaUrl && mediaType === 'video' && (
            <video ref={videoRef} src={mediaUrl} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover" />
          )}

          {/* Text overlays */}
          {texts.map(t => (
            <div key={t.id}
              className="absolute select-none cursor-move"
              style={{ left: `${t.x}%`, top: `${t.y}%`, transform: 'translate(-50%,-50%)', color: t.color, fontSize: t.size, fontWeight: t.bold ? 700 : 400, textShadow: '0 1px 4px rgba(0,0,0,0.5)', maxWidth: '85%', textAlign: 'center', lineHeight: 1.2 }}
            >
              {t.text}
              <button onClick={() => setTexts(p => p.filter(x => x.id !== t.id))}
                className="absolute -top-3 -right-3 w-5 h-5 bg-black/60 rounded-full text-white text-[9px] flex items-center justify-center">✕</button>
            </div>
          ))}

          {/* Stickers */}
          {stickers.map(s => (
            <div key={s.id}
              className="absolute select-none cursor-move"
              style={{ left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%,-50%)', fontSize: s.size }}
            >
              {s.emoji}
              <button onClick={() => setStickers(p => p.filter(x => x.id !== s.id))}
                className="absolute -top-2 -right-2 w-4 h-4 bg-black/60 rounded-full text-white text-[8px] flex items-center justify-center">✕</button>
            </div>
          ))}

          {/* Poll preview */}
          {poll && (
            <div className="absolute bottom-24 left-4 right-4 bg-white/20 backdrop-blur-md rounded-2xl p-3 border border-white/30">
              <p className="text-white text-sm font-bold text-center mb-2">{poll.question}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/25 rounded-xl py-1.5 text-center text-white text-xs font-semibold">{poll.optionA}</div>
                <div className="bg-white/25 rounded-xl py-1.5 text-center text-white text-xs font-semibold">{poll.optionB}</div>
              </div>
              <button onClick={() => setPoll(null)} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full text-white text-[9px] flex items-center justify-center">✕</button>
            </div>
          )}

          {/* Link sticker preview */}
          {link && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-white rounded-full px-3 py-1 flex items-center gap-1.5 shadow-lg">
              <Link2 className="w-3 h-3 text-blue-500" />
              <span className="text-xs font-semibold text-gray-800 max-w-[140px] truncate">{link}</span>
              <button onClick={() => setLink('')} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
            </div>
          )}

          {/* Music badge */}
          {music && (
            <div className="absolute top-4 right-4 bg-black/50 rounded-full px-2 py-1 flex items-center gap-1">
              <Music className="w-3 h-3 text-white" />
              <span className="text-white text-[10px] max-w-[80px] truncate">{music}</span>
            </div>
          )}

          {/* No media prompt */}
          {!mediaUrl && texts.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <button onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center gap-2 text-white/70 hover:text-white transition-colors">
                <div className="w-16 h-16 rounded-full border-2 border-white/30 flex items-center justify-center">
                  <Camera className="w-8 h-8" />
                </div>
                <span className="text-xs">Tap to add photo or video</span>
              </button>
            </div>
          )}

          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-3">
            <button onClick={close} className="w-8 h-8 bg-black/40 rounded-full flex items-center justify-center text-white">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={() => fileRef.current?.click()}
              className="w-8 h-8 bg-black/40 rounded-full flex items-center justify-center text-white">
              <ImageIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Tool panel ── */}
        <div className="bg-gray-900 md:rounded-2xl p-4 flex flex-col gap-3 min-w-[220px] md:min-h-[533px]">
          {/* BG color picker (text-only slides) */}
          {!mediaUrl && (
            <div>
              <p className="text-xs text-gray-400 font-semibold mb-2 uppercase tracking-wide">Background</p>
              <div className="flex flex-wrap gap-1.5">
                {BG_GRADIENTS.map((g, i) => (
                  <button key={i} onClick={() => setBgColor(g)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${bgColor === g ? 'border-white scale-110' : 'border-transparent'}`}
                    style={{ background: g }} />
                ))}
              </div>
            </div>
          )}

          {/* Tool buttons */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'text' as const,    icon: Type,      label: 'Text'    },
              { id: 'sticker' as const, icon: Smile,     label: 'Sticker' },
              { id: 'poll' as const,    icon: BarChart2, label: 'Poll'    },
              { id: 'link' as const,    icon: Link2,     label: 'Link'    },
              { id: 'music' as const,   icon: Music,     label: 'Music'   },
            ].map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => setTool(tool === id ? 'none' : id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  tool === id ? 'bg-white text-gray-900' : 'bg-white/10 text-white hover:bg-white/20'
                }`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>

          {/* Text tool panel */}
          {tool === 'text' && (
            <div className="space-y-3">
              <textarea value={textInput} onChange={e => setTextInput(e.target.value)}
                placeholder="Type something…"
                rows={3}
                className="w-full bg-white/10 text-white rounded-xl px-3 py-2 text-sm focus:outline-none resize-none placeholder-white/40" />
              <div className="flex gap-1 flex-wrap">
                {TEXT_COLORS.map(c => (
                  <button key={c} onClick={() => setTextColor(c)}
                    className={`w-6 h-6 rounded-full border-2 ${textColor === c ? 'border-white' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
              <div className="flex items-center gap-3">
                <input type="range" min={16} max={48} value={textSize} onChange={e => setTextSize(+e.target.value)}
                  className="flex-1 h-1 accent-white" />
                <span className="text-white/60 text-xs w-8">{textSize}px</span>
                <button onClick={() => setTextBold(v => !v)}
                  className={`px-2 py-1 rounded text-xs font-bold border transition-all ${textBold ? 'bg-white text-black' : 'border-white/30 text-white'}`}>
                  B
                </button>
              </div>
              <button onClick={addText} disabled={!textInput.trim()}
                className="w-full py-2 bg-white text-black rounded-full text-sm font-bold disabled:opacity-40 hover:bg-gray-100 transition-colors">
                Add Text
              </button>
            </div>
          )}

          {/* Sticker panel */}
          {tool === 'sticker' && (
            <div className="grid grid-cols-5 gap-2">
              {EMOJI_LIST.map(e => (
                <button key={e} onClick={() => {
                  setStickers(prev => [...prev, { id: `s-${Date.now()}`, emoji: e, x: 50, y: 50, size: 36 }]);
                  setTool('none');
                }}
                  className="text-2xl hover:scale-125 transition-transform text-center">
                  {e}
                </button>
              ))}
            </div>
          )}

          {/* Poll panel */}
          {tool === 'poll' && (
            <div className="space-y-2">
              <input value={pollQ} onChange={e => setPollQ(e.target.value)}
                placeholder="Ask a question…"
                className="w-full bg-white/10 text-white rounded-xl px-3 py-2 text-sm focus:outline-none placeholder-white/40" />
              <input value={pollOptA} onChange={e => setPollOptA(e.target.value)}
                placeholder="Option A"
                className="w-full bg-blue-500/30 text-white rounded-xl px-3 py-2 text-sm focus:outline-none placeholder-white/40" />
              <input value={pollOptB} onChange={e => setPollOptB(e.target.value)}
                placeholder="Option B"
                className="w-full bg-pink-500/30 text-white rounded-xl px-3 py-2 text-sm focus:outline-none placeholder-white/40" />
              <button onClick={addPoll} disabled={!pollQ.trim()}
                className="w-full py-2 bg-white text-black rounded-full text-sm font-bold disabled:opacity-40">
                Add Poll
              </button>
            </div>
          )}

          {/* Link panel */}
          {tool === 'link' && (
            <div className="space-y-2">
              <input value={link} onChange={e => setLink(e.target.value)}
                placeholder="https://your-link.com"
                type="url"
                className="w-full bg-white/10 text-white rounded-xl px-3 py-2 text-sm focus:outline-none placeholder-white/40" />
              <button onClick={() => setTool('none')} disabled={!link.trim()}
                className="w-full py-2 bg-white text-black rounded-full text-sm font-bold disabled:opacity-40">
                Add Link
              </button>
            </div>
          )}

          {/* Music panel */}
          {tool === 'music' && (
            <div className="space-y-2">
              <input value={music} onChange={e => setMusic(e.target.value)}
                placeholder="Song name / artist…"
                className="w-full bg-white/10 text-white rounded-xl px-3 py-2 text-sm focus:outline-none placeholder-white/40" />
              <button onClick={() => setTool('none')} disabled={!music.trim()}
                className="w-full py-2 bg-white text-black rounded-full text-sm font-bold disabled:opacity-40">
                Add Music
              </button>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Publish */}
          <button
            onClick={publish}
            disabled={!canPublish || publishing}
            className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-full font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            <Send className="w-4 h-4" />
            {publishing ? 'Publishing…' : 'Share to Your Story'}
          </button>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />
    </div>,
    document.body
  );
}