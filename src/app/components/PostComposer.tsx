/**
 * Filmons PostComposer
 * Mode: post | story | reel
 * Post flow: typeSelect → gallery → edit → caption → advanced → share
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, ChevronLeft, ChevronRight, Image, Video, Music, Type, Tag, UserPlus,
  Play, Plus, Minus, Check, Globe, Users, Lock, UserCheck, Trash2, Save,
  Hash, MapPin, Camera, Mic, DollarSign, AlignLeft, AlignCenter,
  AlignRight, Download, RefreshCw, Heart, MessageCircle,
  Share2, Bookmark, ToggleLeft, Undo2, Redo2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { postsApi } from '../lib/api';
import { getDrafts, saveDraft, deleteDraft, draftThumbnail, draftAge, type PostDraft } from '../lib/draftsApi';
import { searchLocations, detectGpsLocation, attachLocationToPost, upsertLocation, type LocationResult } from '../lib/locationApi';
import { searchHashtags, attachHashtagsToPost, type Hashtag } from '../lib/hashtagsApi';
import { searchProfiles, attachMentionsToPost, type ProfileResult } from '../lib/mentionsApi';
import { supabase } from '../../lib/supabase';
import { attachAudioToPost } from '../lib/audioApi';
import { MusicBrowser } from './MusicBrowser';
import { AIStudio } from './AIStudio';
import { TextLayerEditor, TextLayerRenderer, type TextLayer } from './TextLayerEditor';
import { SoundTrimSheet } from './SoundTrimSheet';
import { PostSuccessScreen } from './PostSuccessScreen';
import { CollaboratorSheet } from './CollaboratorSheet';
import { ListingTagger, type ListingPin } from './ListingTagger';
import { inviteCollaborator } from '../lib/collabApi';
import { ListingBrowser } from './ListingBrowser';
import { AudioPostComposer } from './AudioPostComposer';
import * as notifs from '../lib/notifications';
import { toast } from 'sonner';
import type { PostType, Visibility } from '../types';

type PostKind   = PostType | 'reel' | 'story';
type FlowStep   = 'typeSelect' | 'gallery' | 'edit' | 'caption' | 'advanced' | 'share';

interface GalleryFile { url: string; type: 'photo'|'video'|'audio'; name: string; duration?: number; }

const FILTERS = [
  { id:'none',    name:'Original', css:'' },
  { id:'cinema',  name:'Cinematic', css:'contrast(1.1) saturate(0.85) brightness(0.95) sepia(0.1)' },
  { id:'soft',    name:'Soft Film', css:'brightness(1.05) contrast(0.92) saturate(0.9) blur(0.3px)' },
  { id:'night',   name:'Night Fade', css:'brightness(0.85) contrast(1.1) saturate(0.7) hue-rotate(200deg)' },
  { id:'warm',    name:'Warm Glow', css:'brightness(1.05) sepia(0.3) saturate(1.2) contrast(0.95)' },
  { id:'noir',    name:'Noir', css:'grayscale(0.9) contrast(1.3) brightness(0.9)' },
  { id:'silver',  name:'Silver Grain', css:'grayscale(0.5) contrast(1.1) brightness(1.05) saturate(0.6)' },
];

const EDIT_TOOLS = [
  { id:'brightness', label:'Brightness', min:-100, max:100 },
  { id:'contrast',   label:'Contrast',   min:-100, max:100 },
  { id:'warmth',     label:'Warmth',     min:-100, max:100 },
  { id:'saturation', label:'Saturation', min:-100, max:100 },
  { id:'fade',       label:'Fade',       min:0,    max:100 },
  { id:'highlights', label:'Highlights', min:-100, max:100 },
  { id:'shadows',    label:'Shadows',    min:-100, max:100 },
  { id:'vignette',   label:'Vignette',   min:0,    max:100 },
  { id:'sharpen',    label:'Sharpen',    min:0,    max:100 },
  { id:'grain',      label:'Film Grain', min:0,    max:100 },
  { id:'blur',       label:'Lens Blur',  min:0,    max:20  },
];

const POST_TYPES: { id: PostKind; emoji: string; label: string; accept: string; sub: string }[] = [
  { id:'photo', emoji:'🎞️', label:'Photos & Videos', accept:'image/*,video/*', sub:'Photos, videos, carousel — mix freely' },
  { id:'audio', emoji:'🎵', label:'Audio',           accept:'audio/*',        sub:'Music, podcasts and voice notes'        },
  { id:'text',  emoji:'✍️', label:'Text',             accept:'',              sub:'Announcements and creative writing'      },
];

const TEXT_BGS = [
  { id:'dark',      cls:'bg-gray-950 text-white',                                              label:'Dark'      },
  { id:'cinematic', cls:'bg-gradient-to-br from-slate-900 via-blue-950 to-gray-900 text-white', label:'Cinema'    },
  { id:'minimal',   cls:'bg-white text-gray-900',                                              label:'White'     },
  { id:'gradient',  cls:'bg-gradient-to-br from-blue-600 to-purple-700 text-white',            label:'Gradient'  },
];

const CREDIT_ROLES = ['Directed by','Shot by','Edited by','Music by','Styled by','Produced by'];
const RATIOS       = ['1:1','4:5','16:9','9:16','original'];

// Ratio → padding-top % for the aspect ratio box trick
const ratioPad: Record<string, string> = {
  '1:1':  '100%',
  '4:5':  '125%',
  '16:9': '56.25%',
  '9:16': '177.78%',
};


// ── Permission intro screen ──────────────────────────────────────────────────
function PermissionIntro({ fileRef, pendingAccept, onGranted, onDeny }: {
  fileRef: React.RefObject<HTMLInputElement>;
  pendingAccept: string;
  onGranted: (multiple: boolean) => void;
  onDeny: () => void;
}) {
  const triggerPicker = (multiple: boolean) => {
    // Must click synchronously inside the button handler for iOS to allow it
    if (fileRef.current) {
      fileRef.current.accept   = pendingAccept;
      fileRef.current.multiple = multiple;
      fileRef.current.value    = '';
      fileRef.current.click();
    }
    onGranted(multiple);
  };
  return (
    <div className="fixed inset-0 z-[80] flex flex-col overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950"/>
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full"
        style={{ background:'#51A2FF', opacity:.12, filter:'blur(90px)' }}/>
      <div className="absolute bottom-1/3 right-1/4 w-48 h-48 rounded-full"
        style={{ background:'#51A2FF', opacity:.07, filter:'blur(60px)' }}/>
      {[...Array(3)].map((_,i)=>(
        <div key={i} className="absolute rounded-full"
          style={{ width:`${80+i*40}px`, height:`${80+i*40}px`, left:`${10+i*30}%`, top:`${20+i*20}%`,
            background:'#51A2FF', opacity:.04+i*.01, filter:'blur(40px)',
            animation:`leak ${4+i}s ease-in-out infinite alternate`, animationDelay:`${i*.8}s` }}/>
      ))}
      <style>{`@keyframes leak{from{transform:translateY(0) scale(1)}to{transform:translateY(-20px) scale(1.1)}}`}</style>

      <div className="relative z-10 flex flex-col h-full px-6">
        <div className="flex justify-end pt-14">
          <button onClick={onDeny} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4 text-white/60"/>
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          {/* Icon cluster */}
          <div className="relative w-40 h-40">
            <div className="absolute inset-0 rounded-full" style={{background:'#51A2FF',opacity:.15,filter:'blur(30px)'}}/>
            <div className="absolute inset-5 rounded-3xl flex items-center justify-center"
              style={{background:'linear-gradient(135deg,rgba(81,162,255,.25),rgba(81,162,255,.08))',border:'1px solid rgba(81,162,255,.3)',backdropFilter:'blur(20px)'}}>
              <Image className="w-14 h-14" style={{color:'#51A2FF'}}/>
            </div>
            {[
              {emoji:'📸',top:'-10px',left:'50%',tr:'translateX(-50%)'},
              {emoji:'🎬',top:'50%',right:'-18px',tr:'translateY(-50%)'},
              {emoji:'🎵',bottom:'-10px',left:'50%',tr:'translateX(-50%)'},
              {emoji:'📁',top:'50%',left:'-18px',tr:'translateY(-50%)'},
            ].map(p=>(
              <div key={p.emoji} className="absolute"
                style={{top:p.top,right:p.right,bottom:p.bottom,left:p.left,transform:p.tr}}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.12)',backdropFilter:'blur(10px)'}}>
                  {p.emoji}
                </div>
              </div>
            ))}
          </div>

          <div className="text-center space-y-3 max-w-xs">
            <h1 className="text-2xl font-black text-white leading-tight">Allow access to your creative library</h1>
            <p className="text-sm text-white/50 leading-relaxed">
                Filmons uses your media to help you create and share cinematic content.
              </p>
              <p className="text-xs text-white/30 leading-relaxed mt-1">
                Make sure gallery access is enabled in your device Settings if prompted by your OS.
              </p>
          </div>

          <div className="flex gap-2 flex-wrap justify-center">
            {['📸 Photos','🎬 Videos','🎵 Audio','📁 Projects'].map(t=>(
              <div key={t} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{background:'rgba(81,162,255,0.12)',border:'1px solid rgba(81,162,255,0.2)'}}>
                <span className="text-xs font-semibold" style={{color:'#51A2FF'}}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* iOS-style action sheet */}
        <div className="space-y-2.5 pb-12">
          {/* Filmons branded header label */}
          <p className="text-center text-xs text-white/30 font-semibold pb-1">
            "FILMONS" Would Like to Access Your Gallery
          </p>

          {/* Allow Full Access */}
          <button onClick={() => triggerPicker(true)}
            className="w-full py-4 rounded-2xl font-black text-sm text-white transition-all active:scale-[0.98]"
            style={{ background:'linear-gradient(135deg,#51A2FF,#3b82f6)', boxShadow:'0 8px 32px rgba(81,162,255,0.35)' }}>
            Allow Full Access
          </button>

          {/* Select photos */}
          <button onClick={() => triggerPicker(false)}
            className="w-full py-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]"
            style={{ background:'rgba(81,162,255,0.15)', color:'#51A2FF', border:'1px solid rgba(81,162,255,0.3)' }}>
            Select…
          </button>

          {/* Don't Allow */}
          <p className="text-center text-[10px] text-white/20 px-4">
            You can change this later in your device Settings → Privacy → Photos
          </p>
          <button onClick={onDeny}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm transition-colors"
            style={{ color:'rgba(255,255,255,0.35)' }}>
            Don't Allow
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Publishing animation ─────────────────────────────────────────────────────
function PublishAnim({ onDone }: { onDone:()=>void }) {
  const [p, setP]   = useState(0);
  const [done, setDone] = useState(false);
  const fired = useRef(false);
  if (!fired.current) {
    fired.current = true;
    const iv = setInterval(()=>setP(v=>{
      const n=Math.min(v+Math.random()*12+8,100);
      if(n>=100){clearInterval(iv);setTimeout(()=>{setDone(true);setTimeout(onDone,800);},200);}
      return n;
    }),80);
  }
  const r=44,cx=50,cy=50,C=2*Math.PI*r;
  return (
    <div className="fixed inset-0 z-[60] bg-gray-950 flex flex-col items-center justify-center space-y-8 overflow-hidden">
      {[...Array(14)].map((_,i)=>(
        <div key={i} className="absolute rounded-full bg-blue-400"
          style={{width:2+Math.random()*3,height:2+Math.random()*3,left:`${5+i*6.5}%`,top:`${10+Math.sin(i)*35}%`,
            opacity:.15+Math.random()*.2,animation:`pfloat ${3+i*.4}s ease-in-out infinite alternate`,animationDelay:`${i*.25}s`}}/>
      ))}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-80 h-80 rounded-full bg-blue-600" style={{opacity:.06,filter:'blur(80px)',animation:'gpulse 2s ease-in-out infinite'}}/>
      </div>
      <style>{`
        @keyframes pfloat{from{transform:translateY(0) scale(1)}to{transform:translateY(-24px) scale(1.2)}}
        @keyframes gpulse{0%,100%{opacity:.06}50%{opacity:.18}}
        @keyframes bdot{0%,100%{transform:scale(.6);opacity:.3}50%{transform:scale(1.3);opacity:1}}
      `}</style>
      <div className="relative w-36 h-36">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7"/>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={done?'#22c55e':'#3b82f6'} strokeWidth="7"
            strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
            strokeDasharray={`${(p/100)*C} ${C}`}
            style={{filter:`drop-shadow(0 0 12px ${done?'#22c55e88':'#3b82f688'})`,transition:'stroke-dasharray 0.12s ease,stroke 0.4s ease'}}/>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {done?<span className="text-4xl">✅</span>
               :<span className="text-2xl font-black tabular-nums text-blue-400">{Math.round(p)}%</span>}
        </div>
      </div>
      <div className="text-center space-y-2 px-8">
        <p className="text-xl font-black text-white">{done?'Your creation is now live':'Publishing…'}</p>
        <p className="text-sm text-white/40">{done?'Visible to your audience now':'Uploading and processing your content'}</p>
      </div>
      {!done&&<div className="flex gap-2">{[0,1,2].map(i=><div key={i} className="w-2 h-2 rounded-full bg-blue-500" style={{animation:'bdot 1s ease infinite',animationDelay:`${i*.18}s`}}/>)}</div>}
    </div>
  );
}

// ── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({on,onChange}:{on:boolean;onChange:()=>void}) {
  return (
    <button onClick={onChange} className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${on?'bg-blue-600':'bg-gray-200'}`}>
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${on?'left-[22px]':'left-0.5'}`}/>
    </button>
  );
}

// ── Gallery grid ─────────────────────────────────────────────────────────────
function GalleryGrid({items,selected,multiSelect,onToggle}:{
  items:GalleryFile[];selected:Set<number>;multiSelect:boolean;onToggle:(i:number)=>void;
}) {
  return (
    <div className="grid grid-cols-3 gap-0.5">
      {items.map((item,i)=>{
        const sel=selected.has(i), selIdx=Array.from(selected).indexOf(i);
        return (
          <button key={i} onClick={()=>onToggle(i)}
            className="aspect-square relative overflow-hidden bg-gray-900 active:opacity-80">
            {item.type==='video'
              ? <><video src={item.url} className="w-full h-full object-cover" muted playsInline preload="metadata"/>
                  <div className="absolute bottom-1.5 right-1.5 bg-black/60 rounded-md px-1.5 py-0.5 flex items-center gap-0.5">
                    <Play className="w-2.5 h-2.5 text-white fill-white"/>
                  </div></>
              : <img src={item.url} className="w-full h-full object-cover"/>}

            {/* Selection badge */}
            <div className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all
              ${sel ? 'border-transparent' : 'bg-transparent border-white/80'}`}
              style={sel ? {background:'#51A2FF'} : {}}>
              {sel && multiSelect && <span className="text-[9px] font-black text-white leading-none">{selIdx+1}</span>}
              {sel && !multiSelect && <Check className="w-3.5 h-3.5 text-white"/>}
            </div>

            {/* Selected overlay */}
            {sel && <div className="absolute inset-0" style={{border:'2.5px solid #51A2FF',background:'rgba(81,162,255,0.12)'}}/>}
          </button>
        );
      })}
    </div>
  );
}

// ── TagPeopleSheet ─────────────────────────────────────────────────────────────
// Full-screen bottom sheet: photo preview + tap to place pin + search_profiles
function TagPeopleSheet({ photo, editedPhoto, tagPins, setTagPins, collabs, setCollabs,
  mentionedUsers, setMentionedUsers, onClose, postId }: any) {

  const [pendingPin,   setPendingPin]   = useState<{x:number;y:number}|null>(null);
  const [showCollab,   setShowCollab]   = useState(false);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [searchResults,setSearchResults]= useState<ProfileResult[]>([]);
  const [searching,    setSearching]    = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(() => {
    searchProfiles('').then(setSearchResults);
  }, []);

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const r = await searchProfiles(q);
      setSearchResults(r);
      setSearching(false);
    }, 250);
  };

  const placePin = (e: React.MouseEvent<HTMLDivElement>) => {
    if (pendingPin) { setPendingPin(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left)  / rect.width)  * 100;
    const y = ((e.clientY - rect.top)   / rect.height) * 100;
    setPendingPin({ x, y });
    setSearchQuery('');
    searchProfiles('').then(setSearchResults);
  };

  const confirmTag = (profile: ProfileResult) => {
    if (!pendingPin) return;
    setTagPins((p: any[]) => [...p, { x: pendingPin.x, y: pendingPin.y, userId: profile.id, name: profile.username, displayName: profile.display_name, avatar: profile.avatar_url }]);
    setCollabs((p: string[]) => [...new Set([...p, profile.username])]);
    setMentionedUsers?.((p: ProfileResult[]) => p.find((u: ProfileResult) => u.id === profile.id) ? p : [...p, profile]);
    setPendingPin(null);
    setSearchQuery('');
  };

  const removePin = (i: number) => {
    setTagPins((p: any[]) => {
      const removed = p[i];
      if (removed) {
        setCollabs((c: string[]) => c.filter((u: string) => u !== removed.name));
        setMentionedUsers?.((m: ProfileResult[]) => m.filter((u: ProfileResult) => u.username !== removed.name));
      }
      return p.filter((_: any, idx: number) => idx !== i);
    });
  };

  return (
    <div className="fixed inset-0 z-[98] flex flex-col bg-white"
      style={{paddingBottom:'env(safe-area-inset-bottom)'}}>
      <style>{`
        @keyframes tagSheetIn { from { transform:translateY(100%); opacity:0.5 } to { transform:translateY(0); opacity:1 } }
        @keyframes pinPop     { from { transform:translate(-50%,-50%) scale(0.5); opacity:0 } to { transform:translate(-50%,-50%) scale(1); opacity:1 } }
      `}</style>
      <div className="flex flex-col h-full" style={{animation:'tagSheetIn 0.32s cubic-bezier(0.32,0.72,0,1)'}}>
        {/* Nav */}
        <div className="shrink-0 flex items-center justify-between px-4 pt-12 pb-3 z-10">
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
            <X className="w-5 h-5 text-gray-600"/>
          </button>
          <p className="text-sm font-black text-gray-900">Tag People</p>
          <button onClick={onClose} className="px-4 py-1.5 rounded-full text-sm font-black text-white" style={{background:'#51A2FF'}}>Done</button>
        </div>
        {/* Photo */}
        <div className="relative w-full shrink-0 overflow-hidden cursor-crosshair"
          style={{aspectRatio:'4/5', maxHeight:'55vh'}}
          onClick={placePin}>
          <img src={photo} className="absolute inset-0 w-full h-full object-cover"
            style={{filter: editedPhoto?.filter||'none', transform: editedPhoto?.transform||'', transformOrigin:'center'}}/>
          {tagPins.map((pin: any, i: number) => (
            <button key={i}
              onClick={e=>{e.stopPropagation(); removePin(i);}}
              style={{position:'absolute',left:`${pin.x}%`,top:`${pin.y}%`,transform:'translate(-50%,-50%)',animation:'pinPop 0.2s ease',zIndex:5}}
              className="flex flex-col items-center gap-1">
              <div className="w-8 h-8 rounded-full border-2 border-white shadow-lg overflow-hidden bg-gray-300">
                {pin.avatar
                  ? <img src={pin.avatar} className="w-full h-full object-cover"/>
                  : <div className="w-full h-full flex items-center justify-center text-white text-xs font-black bg-blue-500">{(pin.displayName||pin.name||'?')[0].toUpperCase()}</div>}
              </div>
              <div className="bg-black/75 backdrop-blur-sm rounded-full px-2 py-0.5 flex items-center gap-1">
                <p className="text-[10px] font-black text-white">@{pin.name}</p>
                <X className="w-2.5 h-2.5 text-white/60"/>
              </div>
            </button>
          ))}
          {pendingPin && (
            <div style={{position:'absolute',left:`${pendingPin.x}%`,top:`${pendingPin.y}%`,transform:'translate(-50%,-50%)',zIndex:10}}>
              <div className="w-4 h-4 rounded-full border-2 border-white bg-blue-500 shadow-lg" style={{animation:'pinPop 0.15s ease',boxShadow:'0 0 12px rgba(81,162,255,0.6)'}}/>
            </div>
          )}
          {tagPins.length===0&&!pendingPin&&(
            <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none">
              <div className="bg-black/50 backdrop-blur-sm rounded-full px-4 py-2">
                <p className="text-white/80 text-xs font-semibold">Tap anywhere to tag someone</p>
              </div>
            </div>
          )}
        </div>
        {/* User search (when pin placed) */}
        {pendingPin && (
          <div className="flex-1 flex flex-col bg-white rounded-t-3xl" style={{animation:'tagSheetIn 0.22s cubic-bezier(0.32,0.72,0,1)'}}>
            <div className="flex justify-center pt-3 pb-2 shrink-0"><div className="w-9 h-1 rounded-full bg-gray-200"/></div>
            <div className="px-4 pb-3 shrink-0">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input autoFocus value={searchQuery} onChange={e=>handleSearch(e.target.value)}
                  placeholder="Search by name or @username…"
                  className="w-full bg-gray-100 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-200 transition-colors"/>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {searching ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
                  <p className="text-sm text-gray-400">Searching…</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Users className="w-8 h-8 text-gray-200"/>
                  <p className="text-sm text-gray-400">No users found</p>
                </div>
              ) : searchResults.map((profile: ProfileResult, i: number) => (
                <button key={profile.id} onClick={()=>confirmTag(profile)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  style={{borderTop: i===0?'none':'1px solid #f3f4f6'}}>
                  <div className="w-11 h-11 rounded-full bg-gray-200 overflow-hidden shrink-0">
                    {profile.avatar_url
                      ? <img src={profile.avatar_url} className="w-full h-full object-cover"/>
                      : <div className="w-full h-full flex items-center justify-center font-black text-gray-400 text-base">{(profile.display_name||profile.username||'?')[0].toUpperCase()}</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-gray-900 truncate">{profile.display_name||profile.username}</p>
                    <p className="text-xs text-gray-400">@{profile.username}</p>
                  </div>
                  {tagPins.find((p: any)=>p.name===profile.username) && <Check className="w-4 h-4 text-blue-500 shrink-0"/>}
                </button>
              ))}
              <div className="h-6"/>
            </div>
            <div className="px-4 pt-2 pb-4 shrink-0 border-t border-gray-100">
              <button onClick={()=>setPendingPin(null)} className="w-full py-3 rounded-2xl bg-gray-100 text-gray-600 text-sm font-semibold">Cancel</button>
            </div>
          </div>
        )}
        {/* Tagged list (no pending pin) */}
        {!pendingPin && (
          <div className="flex-1 bg-gray-50 overflow-y-auto flex flex-col">
            {/* ── Invite Collaborator — always visible ── */}
            <div className="px-4 pt-3 pb-2 shrink-0">
              <button onClick={()=>setShowCollab(true)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all active:scale-[0.98]"
                style={{background:'rgba(81,162,255,0.08)', border:'1.5px solid rgba(81,162,255,0.25)'}}>
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <UserPlus className="w-4 h-4 text-blue-500"/>
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-black text-blue-700">Invite Collaborator</p>
                  <p className="text-[10px] text-blue-400">Post appears on both profiles when accepted</p>
                </div>
                <ChevronRight className="w-4 h-4 text-blue-300"/>
              </button>
            </div>

            {tagPins.length > 0 ? (
              <div className="divide-y divide-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4 pt-4 pb-2">Tagged</p>
                {tagPins.map((pin: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 bg-white">
                    <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden shrink-0">
                      {pin.avatar ? <img src={pin.avatar} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center font-black text-gray-400">{(pin.displayName||pin.name||'?')[0].toUpperCase()}</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-gray-900">{pin.displayName||pin.name}</p>
                      <p className="text-xs text-gray-400">@{pin.name}</p>
                    </div>
                    <button onClick={()=>removePin(i)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                      <X className="w-3.5 h-3.5 text-gray-400"/>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Users className="w-10 h-10 text-gray-200"/>
                <p className="text-sm font-semibold text-gray-400">Tap the photo above to tag someone</p>
              </div>
            )}
          </div>
        )}

        {/* Collaborator sheet */}
        {showCollab && (
          <CollaboratorSheet
            postId={postId ?? ''}
            onClose={() => setShowCollab(false)}
          />
        )}
      </div>
    </div>
  );
}

// ── RichCaptionBox ────────────────────────────────────────────────────────────
function RichCaptionBox({ caption, setCaption, tags, setTags, collabs, setCollabs, mentionedUsers, setMentionedUsers, photos, editedPhotos, isPhoto, isCreatorPlus, selectedListings, setSelectedListings, onOpenListingBrowser, onOpenListingTagger, listingPins, onOpenCollabSheet, onOpenTrimSheet, publishedPostId, tagPins, setTagPins }: any) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showTagPeople,setShowTagPeople]= useState(false);
  const [pendingPin,   setPendingPin]   = useState<{x:number;y:number}|null>(null);
  const [pinInput,     setPinInput]     = useState('');

  // Hashtag suggestion state
  const [hashQuery,    setHashQuery]    = useState('');
  const [hashResults,  setHashResults]  = useState<Hashtag[]>([]);
  const [showHashSheet,setShowHashSheet]= useState(false);
  const hashTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  // Mention suggestion state
  const [mentionQuery,   setMentionQuery]   = useState('');
  const [mentionResults, setMentionResults] = useState<ProfileResult[]>([]);
  const [showMentionSheet, setShowMentionSheet] = useState(false);
  const mentionTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  // Auto-resize textarea
  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  // Detect #hashtag being typed at cursor
  const detectHashAtCursor = (val: string, cursorPos: number) => {
    const textBefore = val.slice(0, cursorPos);
    const match = textBefore.match(/#(\w*)$/);
    if (match) {
      const q = match[1];
      setHashQuery(q);
      setShowHashSheet(true);
      if (hashTimer.current) clearTimeout(hashTimer.current);
      hashTimer.current = setTimeout(async () => {
        const results = await searchHashtags(q);
        setHashResults(results);
      }, 200);
    } else {
      setShowHashSheet(false);
      setHashQuery('');
    }
  };

  // Insert selected hashtag into caption
  const selectHashtag = (tag: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? caption.length;
    const textBefore = caption.slice(0, cursor);
    const textAfter  = caption.slice(cursor);
    // Replace the partial #query with the full #tag
    const replaced = textBefore.replace(/#\w*$/, `#${tag} `);
    const newVal = replaced + textAfter;
    setCaption(newVal);
    // Add to tags array
    if (!tags.includes(tag)) setTags((p:string[]) => [...p, tag]);
    setShowHashSheet(false);
    setHashQuery('');
    setTimeout(() => {
      el.focus();
      const newPos = replaced.length;
      el.setSelectionRange(newPos, newPos);
      autoResize();
    }, 10);
  };

  // Detect @mention being typed at cursor
  const detectMentionAtCursor = (val: string, cursorPos: number) => {
    const textBefore = val.slice(0, cursorPos);
    const match = textBefore.match(/@(\w*)$/);
    if (match) {
      const q = match[1];
      setMentionQuery(q);
      setShowMentionSheet(true);
      setShowHashSheet(false);
      if (mentionTimer.current) clearTimeout(mentionTimer.current);
      mentionTimer.current = setTimeout(async () => {
        const results = await searchProfiles(q);
        setMentionResults(results);
      }, 200);
    } else {
      if (showMentionSheet) setShowMentionSheet(false);
    }
  };

  // Insert selected user into caption
  const selectMention = (profile: ProfileResult) => {
    const el = textareaRef.current;
    if (!el) return;
    const cursor   = el.selectionStart ?? caption.length;
    const before   = caption.slice(0, cursor);
    const after    = caption.slice(cursor);
    const replaced = before.replace(/@\w*$/, `@${profile.username} `);
    const newVal   = replaced + after;
    setCaption(newVal);
    // Store username for display chips
    const handle = profile.username;
    if (!collabs.includes(handle))
      setCollabs((p:string[]) => [...p, handle]);
    // Store full profile for DB attachment on publish
    if (!mentionedUsers?.find((u:ProfileResult) => u.id === profile.id))
      setMentionedUsers?.((p:ProfileResult[]) => [...p, { ...profile, username: profile.username }]);
    setShowMentionSheet(false);
    setMentionQuery('');
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(replaced.length, replaced.length);
      autoResize();
    }, 10);
  };

  // Handle caption change — detect @mentions, #hashtags, trigger suggestions
  const handleCaptionChange = (val: string) => {
    setCaption(val);
    const cursor = textareaRef.current?.selectionStart ?? val.length;
    detectHashAtCursor(val, cursor);
    detectMentionAtCursor(val, cursor);
    autoResize();
  };

  const charCount   = caption.length;
  const isNearLimit = charCount > 1800;
  const isAtLimit   = charCount >= 2200;

  return (
    <div className="bg-white">
      {/* ── Main caption textarea ── */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2.5" style={{minHeight:80}}>
          <textarea
            ref={textareaRef}
            value={caption}
            onChange={e => handleCaptionChange(e.target.value)}
            onKeyDown={e => {
              // Auto-confirm hashtag on Space or Enter
              if ((e.key === ' ' || e.key === 'Enter') && showHashSheet && hashQuery.trim()) {
                e.preventDefault();
                selectHashtag(hashQuery.trim());
                if (e.key === 'Enter') return;
                // For space: insert space after the tag
                const el = textareaRef.current;
                if (el) {
                  const pos = el.selectionStart;
                  const val = caption.replace(/#\w*$/, `#${hashQuery.trim()} `);
                  setCaption(val);
                  setTimeout(() => el.setSelectionRange(val.length, val.length), 0);
                }
                return;
              }
              // Auto-create hashtag from typed #word on Space/Enter
              if (e.key === ' ' || e.key === 'Enter') {
                const el = e.target as HTMLTextAreaElement;
                const cursor = el.selectionStart;
                const before = el.value.slice(0, cursor);
                const match  = before.match(/#(\w+)$/);
                if (match) {
                  const tag = match[1].toLowerCase();
                  if (tag && !tags.includes(tag)) {
                    setTags((p: string[]) => [...p, tag]);
                  }
                  setShowHashSheet(false);
                }
              }
            }}
            onKeyUp={e => {
              const el = e.target as HTMLTextAreaElement;
              detectHashAtCursor(el.value, el.selectionStart);
              detectMentionAtCursor(el.value, el.selectionStart);
            }}
            onInput={autoResize}
            placeholder="Write a caption…"
            maxLength={2200}
            rows={3}
            className="w-full bg-transparent text-sm text-gray-900 placeholder-gray-400 resize-none outline-none leading-relaxed"
            style={{minHeight:64}}
          />
          {charCount > 0 && (
            <p className="text-right text-[10px] mt-1"
              style={{color: isAtLimit?'#ef4444': isNearLimit?'#f59e0b':'#9ca3af'}}>
              {charCount}/2200
            </p>
          )}
        </div>
      </div>

      {/* ── Quick-action bar (no emoji button) ── */}
      <div className="flex items-center gap-1 px-4 pb-2">
        {/* @ mention */}
        <button
          onClick={async ()=>{
            const el = textareaRef.current;
            if (!el) return;
            const pos = el.selectionStart ?? caption.length;
            const newVal = caption.slice(0,pos) + '@' + caption.slice(pos);
            setCaption(newVal);
            const results = await searchProfiles('');
            setMentionResults(results);
            setShowMentionSheet(true);
            setTimeout(()=>{ el.focus(); el.setSelectionRange(pos+1,pos+1); }, 10);
          }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
          @ Mention
        </button>
        {/* # hashtag */}
        <button
          onClick={async ()=>{
            const el = textareaRef.current;
            if (!el) return;
            const pos = el.selectionStart ?? caption.length;
            const before = caption.slice(0,pos);
            const newVal = before + (before.endsWith(' ')||before==='' ? '#' : ' #') + caption.slice(pos);
            setCaption(newVal);
            // Open hashtag suggestions immediately
            const results = await searchHashtags('');
            setHashResults(results);
            setShowHashSheet(true);
            setTimeout(()=>{ el.focus(); el.setSelectionRange(newVal.length - caption.slice(pos).length, newVal.length - caption.slice(pos).length); }, 10);
          }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-500 bg-blue-50 hover:bg-blue-100 transition-colors">
          # Hashtag
        </button>
      </div>

      {/* ── Tags & mentions chips ── */}
      {(tags.length > 0 || collabs.length > 0) && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {tags.map((t:string) => (
            <button key={t}
              onClick={()=>setTags((p:string[])=>p.filter((x:string)=>x!==t))}
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
              #{t}<X className="w-3 h-3 ml-0.5 opacity-60"/>
            </button>
          ))}
          {collabs.map((c:string) => (
            <button key={c}
              onClick={()=>{
                setCollabs((p:string[])=>p.filter((x:string)=>x!==c));
                setMentionedUsers?.((p:ProfileResult[])=>p.filter(u=>u.username!==c));
              }}
              className="flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
              @{c}<X className="w-3 h-3 ml-0.5 opacity-60"/>
            </button>
          ))}
        </div>
      )}

      {/* ── Tag People row ── */}
      {isPhoto && photos?.[0] && (
        <div className="border-t border-gray-100">
          <button
            onClick={()=>setShowTagPeople(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors">
            <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-gray-500"/>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Tag People</p>
              {tagPins.length > 0
                ? <p className="text-xs text-blue-500">{tagPins.map((p: any) => p.name).join(', ')}</p>
                : <p className="text-xs text-gray-400">Tap anywhere on photo to tag</p>}
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300"/>
          </button>
        </div>
      )}

      {/* ── Link Listing row (below Tag People) ── */}
      <div className="border-t border-gray-100">
        {isCreatorPlus ? (
          <div>
            {/* Attached listings */}
            {/* Show tagged pins from ListingTagger */}
            {listingPins?.length > 0 && (
              <div className="px-4 pt-3 space-y-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tagged on photo</p>
                {listingPins.map((pin: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2 border border-blue-100">
                    <Tag className="w-3.5 h-3.5 text-blue-500 shrink-0"/>
                    <p className="text-xs font-semibold text-gray-900 flex-1 truncate">{pin.title}</p>
                    {pin.price && <p className="text-xs text-blue-500 shrink-0">${pin.price}{pin.mode==='rent'?'/day':''}</p>}
                  </div>
                ))}
              </div>
            )}
            {/* Show manually selected listings */}
            {selectedListings?.length > 0 && (
              <div className="px-4 pt-2 space-y-2">
                {listingPins?.length === 0 && <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Linked listings</p>}
                {selectedListings.map((listing: any) => (
                  <div key={listing.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                    <Tag className="w-3.5 h-3.5 text-blue-500 shrink-0"/>
                    <p className="text-xs font-semibold text-gray-900 flex-1 truncate">{listing.title}</p>
                    <p className="text-xs text-blue-500 shrink-0">${listing.pricingPackages?.[0]?.price ?? listing.price}{listing.listingMode==='rent'?'/day':''}</p>
                    <button onClick={()=>setSelectedListings((p:any[])=>p.filter((l:any)=>l.id!==listing.id))}
                      className="w-4 h-4 rounded-full bg-gray-300 flex items-center justify-center shrink-0">
                      <X className="w-2.5 h-2.5 text-gray-600"/>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={()=>{ photos?.[0] ? onOpenListingTagger() : onOpenListingBrowser(); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                <Tag className="w-4 h-4 text-gray-500"/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  {(listingPins?.length > 0 || selectedListings?.length > 0) ? 'Add Another Listing' : 'Link Listing'}
                </p>
                <p className="text-xs text-gray-400">
                  {listingPins?.length > 0 ? `${listingPins.length} tagged on photo${selectedListings?.length > 0 ? ` · ${selectedListings.length} linked` : ''}` : selectedListings?.length > 0 ? `${selectedListings.length} listing${selectedListings.length>1?'s':''} attached` : photos?.[0] ? 'Tag listings on your photo' : 'Attach a product, rental or service'}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>
            </button>
          </div>
        ) : (
          <div className="w-full flex items-center gap-3 px-4 py-3.5">
            <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 opacity-50">
              <Tag className="w-4 h-4 text-gray-400"/>
            </div>
            <div className="flex-1 min-w-0 opacity-60">
              <p className="text-sm font-semibold text-gray-500">Link Listing</p>
              <p className="text-xs text-gray-400">Attach a product, rental or service</p>
            </div>
            <span className="text-[10px] font-black text-white bg-gradient-to-r from-blue-500 to-indigo-600 px-2 py-0.5 rounded-full shrink-0">
              Creator+
            </span>
          </div>
        )}
      </div>

      {/* ── Tag People fullscreen sheet ── */}
      {showTagPeople && isPhoto && photos?.[0] && (
        <TagPeopleSheet
          photo={photos[0]}
          editedPhoto={editedPhotos?.[0]}
          tagPins={tagPins}
          setTagPins={setTagPins}
          collabs={collabs}
          setCollabs={setCollabs}
          mentionedUsers={mentionedUsers}
          setMentionedUsers={setMentionedUsers}
          onClose={()=>setShowTagPeople(false)}
          postId={publishedPostId}
        />
      )}

      {/* ── Mention suggestion sheet — slides up from bottom ── */}
      {showMentionSheet && (
        <div className="fixed inset-0 z-[95] flex flex-col justify-end">
          <style>{`
            @keyframes mentionBackdropIn { from { opacity:0 } to { opacity:1 } }
            @keyframes mentionSheetIn    { from { transform:translateY(100%) } to { transform:translateY(0) } }
          `}</style>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            style={{animation:'mentionBackdropIn 0.22s ease forwards'}}
            onClick={()=>setShowMentionSheet(false)}/>
          {/* Sheet */}
          <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col"
            style={{
              maxHeight:'65vh',
              animation:'mentionSheetIn 0.32s cubic-bezier(0.32,0.72,0,1) forwards',
              paddingBottom:'env(safe-area-inset-bottom)',
            }}>
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-9 h-1 rounded-full bg-gray-200"/>
            </div>
            {/* Header */}
            <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center">
                  <span className="text-blue-500 font-black text-sm">@</span>
                </div>
                <p className="text-sm font-black text-gray-900">
                  {mentionQuery ? `@${mentionQuery}` : 'Mention someone'}
                </p>
              </div>
              <button onClick={()=>setShowMentionSheet(false)}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-gray-500"/>
              </button>
            </div>
            {/* Live search input inside sheet */}
            <div className="px-4 py-2.5 border-b border-gray-100 shrink-0">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">@</span>
                <input
                  autoFocus
                  value={mentionQuery}
                  onChange={async e => {
                    const q = e.target.value.replace(/^@/,'');
                    setMentionQuery(q);
                    if (mentionTimer.current) clearTimeout(mentionTimer.current);
                    mentionTimer.current = setTimeout(async () => {
                      const r = await searchProfiles(q);
                      setMentionResults(r);
                    }, 200);
                  }}
                  placeholder="Search by name or username…"
                  className="w-full bg-gray-100 rounded-xl pl-8 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-200 transition-colors"
                />
              </div>
            </div>
            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {mentionResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Users className="w-9 h-9 text-gray-200"/>
                  <p className="text-sm text-gray-400">
                    {mentionQuery ? `No users matching "@${mentionQuery}"` : 'Start typing to search users'}
                  </p>
                </div>
              ) : mentionResults.map((profile, i) => (
                <button key={profile.id} onClick={()=>selectMention(profile)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  style={{borderTop: i===0?'none':'1px solid #f3f4f6'}}>
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-full bg-gray-200 overflow-hidden shrink-0 relative">
                    {profile.avatar_url
                      ? <img src={profile.avatar_url} className="w-full h-full object-cover"/>
                      : <div className="w-full h-full flex items-center justify-center font-black text-gray-400 text-base">
                          {(profile.display_name||profile.username||'?')[0].toUpperCase()}
                        </div>}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-gray-900 truncate">{profile.display_name || profile.username}</p>
                    <p className="text-xs text-gray-400 truncate">
                      @{profile.username}
                      {profile.account_type && !['creator','renter'].includes(profile.account_type) && (
                        <span className="ml-1.5 text-blue-400 font-semibold capitalize">
                          · {profile.account_type.replace(/_/g,' ')}
                        </span>
                      )}
                    </p>
                  </div>
                  {/* Already mentioned */}
                  {collabs.includes(profile.username) && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Check className="w-4 h-4 text-blue-500"/>
                    </div>
                  )}
                </button>
              ))}
              <div className="h-4"/>
            </div>
          </div>
        </div>
      )}

      {/* ── Hashtag suggestion sheet — slides up from bottom ── */}
      {showHashSheet && (
        <div className="fixed inset-0 z-[95] flex flex-col justify-end">
          <style>{`@keyframes hashSheetIn{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
          {/* Backdrop — tap to dismiss */}
          <div className="absolute inset-0" onClick={()=>setShowHashSheet(false)}/>
          {/* Sheet */}
          <div className="relative bg-white rounded-t-3xl shadow-2xl"
            style={{maxHeight:'60vh',animation:'hashSheetIn 0.28s cubic-bezier(0.32,0.72,0,1) forwards',paddingBottom:'env(safe-area-inset-bottom)'}}>
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full bg-gray-200"/>
            </div>
            {/* Header */}
            <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-black text-gray-900">
                {hashQuery ? `#${hashQuery}` : 'Trending hashtags'}
              </p>
              <button onClick={()=>setShowHashSheet(false)}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-gray-500"/>
              </button>
            </div>
            {/* Results */}
            <div className="overflow-y-auto" style={{maxHeight:'calc(60vh - 80px)'}}>
              {hashResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Hash className="w-8 h-8 text-gray-200"/>
                  <p className="text-sm text-gray-400">No hashtags found</p>
                  {hashQuery && (
                    <button
                      onClick={()=>selectHashtag(hashQuery)}
                      className="mt-1 px-4 py-1.5 rounded-full bg-blue-50 text-blue-600 text-xs font-black border border-blue-100">
                      Create #{hashQuery}
                    </button>
                  )}
                </div>
              ) : hashResults.map((h, i) => (
                <button key={h.id} onClick={()=>selectHashtag(h.tag)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  style={{borderTop: i===0?'none':'1px solid #f3f4f6'}}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                      <Hash className="w-4 h-4 text-blue-500"/>
                    </div>
                    <div>
                      <p className="text-sm font-black text-gray-900">#{h.tag}</p>
                      <p className="text-xs text-gray-400">
                        {h.post_count === 0 ? 'New hashtag'
                          : h.post_count === 1 ? '1 post'
                          : `${h.post_count.toLocaleString()} posts`}
                      </p>
                    </div>
                  </div>
                  {tags.includes(h.tag) && <Check className="w-4 h-4 text-blue-500 shrink-0"/>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Caption Step component ────────────────────────────────────────────────────
const CANADA_LOCATIONS_GEO = [
  // British Columbia
  { city:'Vancouver',    province:'BC', full:'Vancouver, BC, Canada',     lat:49.2827, lng:-123.1207 },
  { city:'Surrey',       province:'BC', full:'Surrey, BC, Canada',        lat:49.1913, lng:-122.8490 },
  { city:'Burnaby',      province:'BC', full:'Burnaby, BC, Canada',       lat:49.2488, lng:-122.9805 },
  { city:'Richmond',     province:'BC', full:'Richmond, BC, Canada',      lat:49.1666, lng:-123.1336 },
  { city:'Kelowna',      province:'BC', full:'Kelowna, BC, Canada',       lat:49.8880, lng:-119.4960 },
  { city:'Victoria',     province:'BC', full:'Victoria, BC, Canada',      lat:48.4284, lng:-123.3656 },
  { city:'Abbotsford',   province:'BC', full:'Abbotsford, BC, Canada',    lat:49.0504, lng:-122.3045 },
  { city:'Coquitlam',    province:'BC', full:'Coquitlam, BC, Canada',     lat:49.2838, lng:-122.7932 },
  { city:'Langley',      province:'BC', full:'Langley, BC, Canada',       lat:49.1044, lng:-122.6600 },
  { city:'Kamloops',     province:'BC', full:'Kamloops, BC, Canada',      lat:50.6745, lng:-120.3273 },
  { city:'Prince George',province:'BC', full:'Prince George, BC, Canada', lat:53.9171, lng:-122.7497 },
  { city:'Nanaimo',      province:'BC', full:'Nanaimo, BC, Canada',       lat:49.1659, lng:-123.9401 },
  { city:'North Vancouver',province:'BC',full:'North Vancouver, BC, Canada',lat:49.3198,lng:-123.0724 },
  { city:'Chilliwack',   province:'BC', full:'Chilliwack, BC, Canada',    lat:49.1577, lng:-121.9509 },
  // Ontario
  { city:'Toronto',      province:'ON', full:'Toronto, ON, Canada',       lat:43.6532, lng:-79.3832  },
  { city:'Ottawa',       province:'ON', full:'Ottawa, ON, Canada',        lat:45.4215, lng:-75.6972  },
  { city:'Mississauga',  province:'ON', full:'Mississauga, ON, Canada',   lat:43.5890, lng:-79.6441  },
  { city:'Brampton',     province:'ON', full:'Brampton, ON, Canada',      lat:43.7315, lng:-79.7624  },
  { city:'Hamilton',     province:'ON', full:'Hamilton, ON, Canada',      lat:43.2557, lng:-79.8711  },
  { city:'London',       province:'ON', full:'London, ON, Canada',        lat:42.9849, lng:-81.2453  },
  { city:'Markham',      province:'ON', full:'Markham, ON, Canada',       lat:43.8561, lng:-79.3370  },
  { city:'Vaughan',      province:'ON', full:'Vaughan, ON, Canada',       lat:43.8361, lng:-79.4985  },
  { city:'Kitchener',    province:'ON', full:'Kitchener, ON, Canada',     lat:43.4516, lng:-80.4925  },
  { city:'Windsor',      province:'ON', full:'Windsor, ON, Canada',       lat:42.3149, lng:-83.0364  },
  { city:'Barrie',       province:'ON', full:'Barrie, ON, Canada',        lat:44.3894, lng:-79.6903  },
  { city:'Sudbury',      province:'ON', full:'Sudbury, ON, Canada',       lat:46.4917, lng:-80.9930  },
  { city:'Kingston',     province:'ON', full:'Kingston, ON, Canada',      lat:44.2312, lng:-76.4860  },
  { city:'Thunder Bay',  province:'ON', full:'Thunder Bay, ON, Canada',   lat:48.3809, lng:-89.2477  },
  // Quebec
  { city:'Montréal',     province:'QC', full:'Montréal, QC, Canada',      lat:45.5017, lng:-73.5673  },
  { city:'Québec City',  province:'QC', full:'Québec City, QC, Canada',   lat:46.8139, lng:-71.2080  },
  { city:'Laval',        province:'QC', full:'Laval, QC, Canada',         lat:45.5753, lng:-73.6926  },
  { city:'Gatineau',     province:'QC', full:'Gatineau, QC, Canada',      lat:45.4765, lng:-75.7013  },
  { city:'Longueuil',    province:'QC', full:'Longueuil, QC, Canada',     lat:45.5312, lng:-73.5185  },
  { city:'Sherbrooke',   province:'QC', full:'Sherbrooke, QC, Canada',    lat:45.4042, lng:-71.8929  },
  { city:'Saguenay',     province:'QC', full:'Saguenay, QC, Canada',      lat:48.4266, lng:-71.0549  },
  { city:'Trois-Rivières',province:'QC',full:'Trois-Rivières, QC, Canada',lat:46.3432,lng:-72.5418  },
  // Alberta
  { city:'Calgary',      province:'AB', full:'Calgary, AB, Canada',       lat:51.0447, lng:-114.0719 },
  { city:'Edmonton',     province:'AB', full:'Edmonton, AB, Canada',      lat:53.5461, lng:-113.4938 },
  { city:'Red Deer',     province:'AB', full:'Red Deer, AB, Canada',      lat:52.2681, lng:-113.8112 },
  { city:'Lethbridge',   province:'AB', full:'Lethbridge, AB, Canada',    lat:49.6942, lng:-112.8328 },
  { city:'Medicine Hat', province:'AB', full:'Medicine Hat, AB, Canada',  lat:50.0405, lng:-110.6764 },
  { city:'Fort McMurray',province:'AB', full:'Fort McMurray, AB, Canada', lat:56.7265, lng:-111.3803 },
  // Manitoba
  { city:'Winnipeg',     province:'MB', full:'Winnipeg, MB, Canada',      lat:49.8951, lng:-97.1384  },
  { city:'Brandon',      province:'MB', full:'Brandon, MB, Canada',       lat:49.8485, lng:-99.9500  },
  // Saskatchewan
  { city:'Saskatoon',    province:'SK', full:'Saskatoon, SK, Canada',     lat:52.1332, lng:-106.6700 },
  { city:'Regina',       province:'SK', full:'Regina, SK, Canada',        lat:50.4452, lng:-104.6189 },
  { city:'Prince Albert',province:'SK', full:'Prince Albert, SK, Canada', lat:53.2033, lng:-105.7531 },
  // Nova Scotia
  { city:'Halifax',      province:'NS', full:'Halifax, NS, Canada',       lat:44.6488, lng:-63.5752  },
  { city:'Dartmouth',    province:'NS', full:'Dartmouth, NS, Canada',     lat:44.6717, lng:-63.5774  },
  { city:'Sydney',       province:'NS', full:'Sydney, NS, Canada',        lat:46.1368, lng:-60.1942  },
  // New Brunswick
  { city:'Moncton',      province:'NB', full:'Moncton, NB, Canada',       lat:46.0878, lng:-64.7782  },
  { city:'Saint John',   province:'NB', full:'Saint John, NB, Canada',    lat:45.2733, lng:-66.0633  },
  { city:'Fredericton',  province:'NB', full:'Fredericton, NB, Canada',   lat:45.9636, lng:-66.6431  },
  // Others
  { city:"St. John's",   province:'NL', full:"St. John's, NL, Canada",    lat:47.5615, lng:-52.7126  },
  { city:'Charlottetown',province:'PE', full:'Charlottetown, PE, Canada', lat:46.2382, lng:-63.1311  },
  { city:'Whitehorse',   province:'YT', full:'Whitehorse, YT, Canada',    lat:60.7212, lng:-135.0568 },
  { city:'Yellowknife',  province:'NT', full:'Yellowknife, NT, Canada',   lat:62.4540, lng:-114.3718 },
  { city:'Iqaluit',      province:'NU', full:'Iqaluit, NU, Canada',       lat:63.7467, lng:-68.5170  },
];

// Alias without geo for simple use
const CANADA_LOCATIONS = CANADA_LOCATIONS_GEO;

function CaptionStep({ photos,editedPhotos,videoUrl,audioUrl,textContent,textBg,textAlign,kind,ratio,audioTitle,audioArtist,caption,setCaption,tags,setTags,collabs,setCollabs,mentionedUsers,setMentionedUsers,location,setLoc,credits,setCredits,selectedMusic,setSelectedMusic,onOpenMusicBrowser,onOpenTrimSheet,selectedListings,setSelectedListings,onOpenListingBrowser,onOpenListingTagger,listingPins,tagPins,setTagPins,isCreatorPlus,onOpenCollabSheet,publishedPostId,ic,isPhoto,isVideo }: any) {
  const [showLocSheet, setShowLocSheet] = useState(false);
  const [locSearch,    setLocSearch]    = useState('');
  const [locResults,   setLocResults]   = useState<LocationResult[]>([]);
  const [locLoading,   setLocLoading]   = useState(false);
  const [gpsLoading,   setGpsLoading]   = useState(false);
  const locTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  // Open sheet and load popular locations immediately
  const openLocSheet = async () => {
    setLocSearch('');
    setShowLocSheet(true);
    setLocLoading(true);
    const popular = await searchLocations('');
    setLocResults(popular);
    setLocLoading(false);
  };

  // Debounced combined search: DB + Nominatim
  const handleLocSearch = (q: string) => {
    setLocSearch(q);
    if (locTimer.current) clearTimeout(locTimer.current);
    if (!q.trim()) {
      setLocLoading(true);
      searchLocations('').then(r => { setLocResults(r); setLocLoading(false); });
      return;
    }
    setLocLoading(true);
    locTimer.current = setTimeout(async () => {
      const results = await searchLocations(q);
      setLocResults(results);
      setLocLoading(false);
    }, 300);
  };

  // Select a location: save to DB and set in form
  const selectLocation = async (loc: LocationResult) => {
    setLoc(loc.name);
    setShowLocSheet(false);
    setLocSearch('');
    // Upsert to DB so it appears in future searches with count
    upsertLocation(loc).catch(() => {});
  };

  // GPS detect
  const handleGps = async () => {
    setGpsLoading(true);
    const result = await detectGpsLocation();
    setGpsLoading(false);
    if (result) {
      selectLocation(result);
      toast.success('📍 ' + result.name.split(',')[0]);
    } else {
      toast.error('Could not detect location');
    }
  };

  return (
    <div className="flex flex-col pb-28">
      {/* ── Media preview row ── */}
      <div className="flex gap-2.5 p-4 border-b border-gray-100">
        {/* Thumbnail */}
        <div className="shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-gray-100">
          {isPhoto && photos[0] && (
            <div className="w-full h-full overflow-hidden relative">
              <img src={photos[0]} className="absolute inset-0 w-full h-full object-cover"
                style={{
                  filter: editedPhotos?.[0]?.filter || 'none',
                  transform: editedPhotos?.[0]?.transform || '',
                  transformOrigin: 'center',
                }}/>
            </div>
          )}
          {isVideo && videoUrl   && <video src={videoUrl} className="w-full h-full object-cover" muted playsInline preload="metadata"/>}
          {kind==='audio'        && <div className="w-full h-full bg-gray-900 flex items-center justify-center"><Music className="w-6 h-6 text-blue-400"/></div>}
          {kind==='text'         && <div className={`w-full h-full flex items-center justify-center ${TEXT_BGS.find(b=>b.id===textBg)?.cls}`}><p className="text-[8px] font-bold truncate px-1">{textContent?.slice(0,20)}</p></div>}
        </div>
        {/* Multi-photo indicator */}
        {isPhoto && photos.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto">
            {photos.slice(1).map((url:string,i:number)=>(
              <div key={i} className="shrink-0 w-16 h-16 rounded-xl overflow-hidden relative">
                <img src={url} className="w-full h-full object-cover opacity-70"
                  style={{
                    filter: editedPhotos?.[i+1]?.filter || 'none',
                    transform: editedPhotos?.[i+1]?.transform || '',
                    transformOrigin: 'center',
                  }}/>
                <div className="absolute bottom-0.5 right-0.5 text-[9px] font-black text-white bg-black/50 px-1 rounded">{i+2}</div>
              </div>
            ))}
          </div>
        )}
        {/* Caption input — full width below thumb row */}
      </div>

      {/* ── Rich caption area ── */}
      <RichCaptionBox
        caption={caption}
        setCaption={setCaption}
        tags={tags}
        setTags={setTags}
        collabs={collabs}
        setCollabs={setCollabs}
        mentionedUsers={mentionedUsers}
        setMentionedUsers={setMentionedUsers}
        photos={photos}
        editedPhotos={editedPhotos}
        isPhoto={isPhoto}
        isCreatorPlus={isCreatorPlus}
        selectedListings={selectedListings}
        setSelectedListings={setSelectedListings}
        onOpenListingBrowser={onOpenListingBrowser}
        onOpenListingTagger={onOpenListingTagger}
        listingPins={listingPins}
        tagPins={tagPins}
        setTagPins={setTagPins}
        onOpenCollabSheet={onOpenCollabSheet}
        onOpenTrimSheet={onOpenTrimSheet}
        publishedPostId={publishedPostId}
      />

      {/* ── Options list (Instagram-style rows) ── */}
      <div className="divide-y divide-gray-100">

        {/* Location */}
        <button onClick={openLocSheet}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors">
          <MapPin className="w-4 h-4 text-gray-400 shrink-0"/>
          <span className={`flex-1 text-sm ${location?'text-gray-900 font-medium':'text-gray-400'}`}>
            {location || 'Add location'}
          </span>
          {location && <button onClick={e=>{e.stopPropagation();setLoc('');}} className="text-gray-300 hover:text-gray-500 text-xs">×</button>}
        </button>

        {/* Add music */}
        <button onClick={onOpenMusicBrowser}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors">
          <Music className="w-4 h-4 text-gray-400 shrink-0"/>
          {selectedMusic
            ? <div className="flex-1 flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900 truncate">♫ {selectedMusic.title}</span>
                {selectedMusic.artist && <span className="text-xs text-gray-400 truncate">— {selectedMusic.artist}</span>}
              </div>
            : <span className="flex-1 text-sm text-gray-400">Add music</span>}
          <div className="flex items-center gap-1">
            {selectedMusic && (
              <button onClick={e=>{e.stopPropagation();setSelectedMusic(null);}}
                className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center">
                <X className="w-3 h-3 text-gray-500"/>
              </button>
            )}
            <ChevronRight className="w-4 h-4 text-gray-300"/>
          </div>
        </button>

        {/* Creator credits */}
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                <span className="text-gray-400 font-bold text-xs">©</span>
              </div>
              <span className="text-sm text-gray-700 font-medium">Creator Credits</span>
            </div>
            <button onClick={()=>setCredits((p:any[])=>[...p,{role:'Directed by',name:''}])}
              className="text-xs text-blue-600 font-bold flex items-center gap-1">
              <Plus className="w-3 h-3"/> Add
            </button>
          </div>
          {credits.length===0 && <p className="text-xs text-gray-400 pl-7">Director, editor, music, styling…</p>}
          {credits.map((cr:any,i:number)=>(
            <div key={i} className="flex gap-2 pl-7">
              <select value={cr.role} onChange={(e:any)=>setCredits((p:any[])=>{const a=[...p];a[i]={...a[i],role:e.target.value};return a;})}
                className="border border-gray-200 rounded-xl px-2 py-2 text-xs bg-white outline-none w-28 shrink-0 text-gray-800">
                {['Directed by','Shot by','Edited by','Music by','Styled by','Produced by'].map(r=><option key={r}>{r}</option>)}
              </select>
              <input value={cr.name} onChange={(e:any)=>setCredits((p:any[])=>{const a=[...p];a[i]={...a[i],name:e.target.value};return a;})}
                placeholder="Name or @username"
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-white"/>
              <button onClick={()=>setCredits((p:any[])=>p.filter((_:any,idx:number)=>idx!==i))}
                className="w-7 flex items-center justify-center text-gray-300 hover:text-red-400">
                <X className="w-3.5 h-3.5"/>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Location search sheet — slides up ── */}
      {showLocSheet && (
        <div className="fixed inset-0 z-[90] flex flex-col justify-end">
          <style>{`@keyframes locSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={()=>{ setShowLocSheet(false); setLocSearch(''); }}/>
          <div className="relative bg-white rounded-t-3xl flex flex-col"
            style={{height:'78vh',animation:'locSlideUp 0.3s cubic-bezier(0.32,0.72,0,1)',paddingBottom:'env(safe-area-inset-bottom)'}}>

            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200"/>
            </div>

            {/* Header */}
            <div className="px-4 pb-3 shrink-0 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-base font-black text-gray-900">Add Location</p>
                <button onClick={()=>{ setShowLocSheet(false); setLocSearch(''); }}
                  className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                  <X className="w-3.5 h-3.5 text-gray-500"/>
                </button>
              </div>
              <div className="flex gap-2 items-center">
                {/* Search input */}
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  <input
                    value={locSearch}
                    onChange={e => handleLocSearch(e.target.value)}
                    placeholder="City, province, street address, postal code…"
                    autoFocus
                    className="w-full bg-gray-100 rounded-xl pl-9 pr-8 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-gray-200 transition-colors"/>
                  {locSearch.length > 0 && (
                    <button onClick={()=>handleLocSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-gray-400 flex items-center justify-center">
                      <X className="w-2.5 h-2.5 text-white"/>
                    </button>
                  )}
                </div>
                {/* GPS button */}
                <button onClick={handleGps} disabled={gpsLoading}
                  className="w-10 h-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center shrink-0 active:bg-blue-50 transition-colors">
                  {gpsLoading
                    ? <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
                    : <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
                        <circle cx="12" cy="12" r="9" strokeOpacity=".25"/>
                      </svg>}
                </button>
              </div>
            </div>

            {/* Result label */}
            <div className="px-4 pt-2 pb-1 shrink-0">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                {locLoading ? 'Searching…' : locSearch ? `${locResults.length} result${locResults.length!==1?'s':''} in Canada` : 'Popular locations'}
              </p>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {locLoading ? (
                <div className="flex items-center justify-center py-10 gap-2">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
                  <p className="text-sm text-gray-400">Searching…</p>
                </div>
              ) : locResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <MapPin className="w-10 h-10 text-gray-200"/>
                  <p className="text-sm font-semibold text-gray-400">No locations found</p>
                  <p className="text-xs text-gray-300">Try a city, street, or postal code</p>
                </div>
              ) : locResults.map((loc, i) => {
                const parts  = loc.name.split(', ');
                const main   = parts[0];
                const sub    = parts.slice(1).join(', ');
                const isUsed = location === loc.name;
                return (
                  <button key={loc.id ?? i}
                    onClick={()=>selectLocation(loc)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50 transition-colors"
                    style={{borderTop: i===0?'none':'1px solid #f3f4f6'}}>
                    <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                      {loc.source === 'db'
                        ? <MapPin className="w-4 h-4 text-blue-500"/>
                        : <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{main}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {sub}
                        {loc.uses && loc.uses > 0
                          ? <span className="ml-1 text-blue-400 font-semibold">· {loc.uses.toLocaleString()} {loc.uses === 1 ? 'post' : 'posts'}</span>
                          : null}
                      </p>
                    </div>
                    {isUsed && <Check className="w-4 h-4 text-blue-500 shrink-0"/>}
                  </button>
                );
              })}
              <div className="h-6"/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




// ── GalleryPreview ────────────────────────────────────────────────────────────
// Big preview area with pinch+drag support and ratio crop
function GalleryPreview({ photo, video, ratio, setRatio, originalRatioCss, hasSelection, isMediaPost, photosCount, videoUrl, onClear }: any) {
  const [showRatioPicker, setShowRatioPicker] = useState(false);
  const [scale,    setScale]    = useState(1);
  const [offset,   setOffset]   = useState({ x:0, y:0 });
  const [lastDist, setLastDist] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [lastPos,  setLastPos]  = useState({ x:0, y:0 });

  // Reset transform when media changes
  const prevMedia = useRef<string|null>(null);
  if ((photo||video) !== prevMedia.current) {
    prevMedia.current = photo||video||null;
    if (scale !== 1 || offset.x !== 0 || offset.y !== 0) {
      setScale(1); setOffset({x:0,y:0});
    }
  }

  // Pinch-to-zoom
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setLastDist(Math.sqrt(dx*dx + dy*dy));
    } else if (e.touches.length === 1) {
      setDragging(true);
      setLastPos({ x:e.touches[0].clientX, y:e.touches[0].clientY });
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (lastDist > 0) {
        const delta = dist / lastDist;
        setScale(s => Math.max(1, Math.min(4, s * delta)));
      }
      setLastDist(dist);
    } else if (e.touches.length === 1 && dragging && scale > 1) {
      const dx = e.touches[0].clientX - lastPos.x;
      const dy = e.touches[0].clientY - lastPos.y;
      setOffset(o => ({ x: o.x + dx, y: o.y + dy }));
      setLastPos({ x:e.touches[0].clientX, y:e.touches[0].clientY });
    }
  };
  const onTouchEnd = () => { setDragging(false); setLastDist(0); };

  const aspectCss = ratio === 'original'
    ? (originalRatioCss || '4/5')
    : ratio.replace(':', '/');

  return (
    <div className="bg-black w-full shrink-0 relative flex items-center justify-center"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}>

      {/* Crop frame — clip-path keeps the ratio frame visible but image can extend beyond */}
      <div className="relative w-full"
        style={{
          aspectRatio: aspectCss,
          maxHeight: '45vh',
          clipPath: 'inset(0)',       /* clips visually but image is NOT overflow:hidden */
          isolation: 'isolate',
        }}>
        {hasSelection ? (
          <>
            {photo && (
              <img src={photo}
                className="absolute inset-0 w-full h-full"
                draggable={false}
                style={{
                  objectFit: 'cover',
                  transform: `scale(${scale}) translate(${offset.x/scale}px,${offset.y/scale}px)`,
                  transformOrigin: 'center',
                  transition: dragging ? 'none' : 'transform 0.1s ease',
                  willChange: 'transform',
                  touchAction: 'none',
                }}/>
            )}
            {video && !photo && (
              <video src={video}
                className="absolute inset-0 w-full h-full"
                style={{
                  objectFit: 'cover',
                  transform: `scale(${scale}) translate(${offset.x/scale}px,${offset.y/scale}px)`,
                  transformOrigin: 'center',
                  touchAction: 'none',
                }}
                muted playsInline preload="metadata"/>
            )}
            {photosCount > 1 && (
              <div className="absolute top-3 right-3 bg-black/60 px-2.5 py-1 rounded-full text-white text-[11px] font-bold z-10">
                {photosCount}{videoUrl ? ' + video' : ''} selected
              </div>
            )}
            {scale > 1 && (
              <button onClick={()=>{ setScale(1); setOffset({x:0,y:0}); }}
                className="absolute top-3 left-3 bg-black/60 px-2 py-1 rounded-lg text-white text-[10px] font-bold z-10">
                Reset
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 w-full h-full">
            <Image className="w-10 h-10 text-white/30"/>
            <p className="text-sm text-white/30 font-medium">
              {isMediaPost ? 'Tap a photo or video below' : 'Select media below'}
            </p>
          </div>
        )}
      </div>

      {/* Bottom bar: Ratio icon + Clear */}
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-3 py-2.5 z-10"
        style={{background:'linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 100%)'}}>

        {/* Ratio button — bottom left, expand icon style */}
        <div className="relative">
          <button
            onClick={()=>setShowRatioPicker(v=>!v)}
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 transition-all active:scale-95"
            style={{background:'rgba(0,0,0,0.55)',border:'1px solid rgba(255,255,255,0.25)',backdropFilter:'blur(8px)'}}>
            {/* Expand/crop icon */}
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"/>
            </svg>
            <span className="text-[11px] font-black text-white">
              {ratio === 'original' ? 'Original' : ratio}
            </span>
          </button>

          {/* Ratio picker dropdown */}
          {showRatioPicker && (
            <div className="absolute bottom-full left-0 mb-2 bg-gray-950 rounded-2xl overflow-hidden shadow-2xl"
              style={{minWidth:160,border:'1px solid rgba(255,255,255,0.12)',animation:'fadeDown 0.15s ease'}}>
              {[
                {id:'1:1',     label:'1:1',      sub:'Square'},
                {id:'4:5',     label:'4:5',      sub:'Portrait'},
                {id:'16:9',    label:'16:9',     sub:'Landscape'},
                {id:'9:16',    label:'9:16',     sub:'Vertical'},
                {id:'original',label:'Original', sub:'Full size'},
              ].map(r=>(
                <button key={r.id} onClick={()=>{setRatio(r.id);setShowRatioPicker(false);}}
                  className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/10 active:bg-white/15">
                  <div>
                    <p className="text-sm font-black" style={{color:ratio===r.id?'#51A2FF':'#fff'}}>{r.label}</p>
                    <p className="text-[10px] text-white/40">{r.sub}</p>
                  </div>
                  {ratio===r.id && (
                    <div className="w-2 h-2 rounded-full bg-blue-400"/>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {hasSelection && (
          <button onClick={onClear}
            className="text-[10px] font-bold text-white/60 border border-white/20 px-2 py-1 rounded-lg"
            style={{background:'rgba(0,0,0,0.45)'}}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

// ── GallerySourceBar ──────────────────────────────────────────────────────────
const GAL_TABS = [
  { id:'recents',   label:'Recents'   },
  { id:'drafts',    label:'Drafts'    },
  { id:'videos',    label:'Videos'    },
  { id:'favorites', label:'Favorites' },
  { id:'albums',    label:'Albums'    },
] as const;

function GallerySourceBar({ kind, galTab, setGalTab, showTabDrop, setShowTabDrop, onCamera, onAudio }: any) {
  const currentLabel = GAL_TABS.find(t=>t.id===galTab)?.label || 'Recents';
  return (
    <div className="shrink-0 bg-white border-b border-gray-100">
      <div className="flex items-center justify-between px-4 py-2.5">
        {/* Dropdown trigger */}
        <div className="relative">
          <button
            onClick={()=>setShowTabDrop((v:boolean)=>!v)}
            className="flex items-center gap-1.5 py-1 -ml-1 px-2 rounded-xl hover:bg-gray-100 active:bg-gray-100 transition-colors">
            <p className="text-sm font-black text-gray-900">{currentLabel}</p>
            <svg className="w-4 h-4 text-gray-500 transition-transform" style={{transform:showTabDrop?'rotate(180deg)':'rotate(0deg)'}}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7"/>
            </svg>
          </button>

          {/* Dropdown menu */}
          {showTabDrop && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50"
              style={{minWidth:160,animation:'fadeDown 0.15s ease'}}>
              <style>{`@keyframes fadeDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>
              {GAL_TABS.map(tab=>(
                <button key={tab.id}
                  onClick={()=>{ setGalTab(tab.id); setShowTabDrop(false); }}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left transition-colors">
                  <span className={`text-sm font-semibold ${galTab===tab.id?'text-blue-600':'text-gray-800'}`}>{tab.label}</span>
                  {galTab===tab.id && (
                    <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {kind==='audio' && (
            <button onClick={onAudio}
              className="flex items-center gap-1.5 text-xs font-semibold text-pink-600 bg-pink-50 px-3 py-1.5 rounded-xl">
              <Music className="w-3.5 h-3.5"/> Audio
            </button>
          )}
          <button onClick={onCamera}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-xl hover:bg-gray-200 transition-colors">
            <Camera className="w-3.5 h-3.5"/> Camera
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RatioButton ──────────────────────────────────────────────────────────────
function RatioButton({ ratio, setRatio }: { ratio: string; setRatio: (r: string) => void }) {
  const [open, setOpen] = useState(false);
  const RATIO_OPTIONS = [
    { id:'1:1',      label:'1:1',      sub:'Square'    },
    { id:'4:5',      label:'4:5',      sub:'Portrait'  },
    { id:'16:9',     label:'16:9',     sub:'Landscape' },
    { id:'9:16',     label:'9:16',     sub:'Vertical'  },
    { id:'original', label:'Original', sub:'No crop'   },
  ];
  return (
    <div className="relative">
      <button onClick={()=>setOpen(v=>!v)}
        className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 active:scale-95 transition-all"
        style={{background:'rgba(0,0,0,0.5)',border:'1px solid rgba(255,255,255,0.2)',backdropFilter:'blur(8px)'}}>
        {/* Crop/expand icon */}
        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"/>
        </svg>
        <span className="text-[11px] font-black text-white">{ratio === 'original' ? 'Original' : ratio}</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-2 bg-gray-950 rounded-2xl overflow-hidden shadow-2xl z-50"
          style={{minWidth:155,border:'1px solid rgba(255,255,255,0.12)'}}>
          {RATIO_OPTIONS.map(r=>(
            <button key={r.id} onClick={()=>{setRatio(r.id);setOpen(false);}}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/10 transition-colors">
              <div>
                <p className="text-sm font-black leading-tight" style={{color:ratio===r.id?'#51A2FF':'#fff'}}>{r.label}</p>
                <p className="text-[10px] text-white/40">{r.sub}</p>
              </div>
              {ratio===r.id && <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0"/>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── RatioCropPreview ──────────────────────────────────────────────────────────
// Uses a full-screen black wrapper. The crop box is sized via CSS aspect-ratio
// on a block element (not a flex child) so it always works.
function RatioCropPreview({ ratio, img, videoUrl, isPhoto, isVideo, scale, offset,
  currentFilter, panelOpen, activeTool, setActiveTool, setPanelOpen,
  onTouchStart, onTouchMove, onTouchEnd, originalRatioCss: props_originalRatioCss,
  videoRef, isPlaying, setIsPlaying, onFrameSize }: any) {

  const cropRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!cropRef.current || !onFrameSize) return;
    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) onFrameSize(e.contentRect.width, e.contentRect.height);
    });
    ro.observe(cropRef.current);
    // Report initial size
    onFrameSize(cropRef.current.clientWidth, cropRef.current.clientHeight);
    return () => ro.disconnect();
  }, [ratio]);

  // Map ratio string to [w, h] numbers
  const aspectCss = ratio === 'original'
    ? (props_originalRatioCss || '4/5')
    : `${ratio.split(':')[0]} / ${ratio.split(':')[1]}`;

  const handleClick = () => {
    if (panelOpen && activeTool) setActiveTool(null);
    else if (panelOpen) setPanelOpen(false);
    else setPanelOpen(true);
  };

  return (
    <div
      className="w-full shrink-0 bg-black flex items-center justify-center"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={handleClick}>

      {/* Crop frame — clipPath creates the visible boundary; image can extend beyond when zoomed/dragged */}
      <div
        ref={cropRef}
        className="relative bg-black"
        style={{
          width: '100%',
          aspectRatio: aspectCss,
          maxHeight: '78vh',
          clipPath: 'inset(0)',
          isolation: 'isolate',
        }}>


        {isPhoto && img && (
          <img
            src={img}
            className="absolute w-full h-full object-cover"
            draggable={false}
            style={{
              inset: 0,
              filter: currentFilter,
              transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
              transformOrigin: 'center',
              touchAction: 'none',
              willChange: 'transform',
              // Allow image to render outside its container when scaled
              overflow: 'visible',
            }}
          />
        )}

        {isVideo && videoUrl && (
          <div className="absolute inset-0 w-full h-full"
            style={{ transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`, transformOrigin:'center', overflow:'visible' }}>
            <video
              ref={videoRef}
              src={videoUrl}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: currentFilter, touchAction: 'none' }}
              playsInline
              muted
              preload="auto"
              loop
              onClick={e=>{
                e.stopPropagation();
                if (!videoRef.current) return;
                if (videoRef.current.paused) {
                  videoRef.current.play().then(()=>setIsPlaying(true)).catch(()=>{});
                } else {
                  videoRef.current.pause();
                  setIsPlaying(false);
                }
              }}
            />
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
              </div>
            )}
          </div>
        )}

        {!img && !videoUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-white/30 text-sm">No media selected</p>
          </div>
        )}
      </div>

      {!panelOpen && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 rounded-full px-4 py-1.5 pointer-events-none">
          <p className="text-white/50 text-xs font-semibold">Tap to show tools</p>
        </div>
      )}
    </div>
  );
}

// ── EditMediaStep ─────────────────────────────────────────────────────────────
type EditToolTab = 'ai'|'audio'|'text'|'overlay'|'filter'|'edit'|'video';
const TOOLBAR_TABS_PHOTO: { id: EditToolTab; label: string; icon: string }[] = [
  { id:'ai',      label:'AI',      icon:'✨' },
  { id:'filter',  label:'Filter',  icon:'◑'  },
  { id:'edit',    label:'Adjust',  icon:'⊙'  },
  { id:'text',    label:'Text',    icon:'𝐓'  },
  { id:'audio',   label:'Audio',   icon:'🎵' },
  { id:'overlay', label:'Overlay', icon:'✦'  },
];
const TOOLBAR_TABS_VIDEO: { id: EditToolTab; label: string; icon: string }[] = [
  { id:'ai',      label:'AI',      icon:'✨' },
  { id:'video',   label:'Video',   icon:'✂️' },
  { id:'filter',  label:'Filter',  icon:'◑'  },
  { id:'edit',    label:'Adjust',  icon:'⊙'  },
  { id:'audio',   label:'Audio',   icon:'🎵' },
  { id:'overlay', label:'Overlay', icon:'✦'  },
];
const ratioPadEdit: Record<string,string> = {'1:1':'100%','4:5':'125%','16:9':'56.25%','9:16':'177.78%'};

function EditMediaStep({
  photos, setPhotos, videoUrl, setVideo,
  isPhoto, isVideo, ratio, setRatio, originalRatioCss,
  activePhoto, setActivePhoto,
  filterIdx, setFilterIdx, filterIntensity, setFI,
  adjustments, setAdj, activeTool, setActiveTool,
  buildFilter, perPhotoEdits, perPhotoTransform, onNext, onBack,
  selectedMusic, setSelectedMusic, onOpenMusicBrowser, onOpenTrimSheet,
  caption, setCaption, tags, setTags, selectedListings, listingPins, audioTitle, location, publishedPostId,
  showTextEditor, setShowTextEditor, textLayers, setTextLayers, textOverlays, setTextOverlays,
  onPushHistory, onUndo, onRedo, canUndo, canRedo,
}: any) {
  const TOOLBAR_TABS = isVideo ? TOOLBAR_TABS_VIDEO : TOOLBAR_TABS_PHOTO;
  const [tab, setTab] = useState<EditToolTab>(isVideo ? 'ai' : 'ai');
  const [panelOpen, setPanelOpen] = useState(true);
  const [showAIStudio, setShowAIStudio] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [scale,     setScale]  = useState(1);
  const [offset,    setOffset] = useState({x:0, y:0});
  const lastDist    = useRef(0);
  const lastPos     = useRef({x:0,y:0});
  const isPinching  = useRef(false);
  const isDragging  = useRef(false);
  // Swipe to next/prev photo
  const swipeStart  = useRef(0);
  const swipeStartY = useRef(0);

  // Save + load transform when switching photos
  const switchPhoto = (i: number) => {
    // Save current
    perPhotoEdits.current.set(activePhoto, {adj:{...adjustments}, filterIdx, intensity:filterIntensity});
    perPhotoTransform.current.set(activePhoto, {scale, offset:{...offset}});
    // Load target
    const saved  = perPhotoEdits.current.get(i);
    const savedT = perPhotoTransform.current.get(i);
    setAdj(saved?.adj ?? {brightness:0,contrast:0,warmth:0,saturation:0,fade:0,highlights:0,shadows:0,vignette:0,sharpen:0,grain:0,blur:0});
    setFilterIdx(saved?.filterIdx ?? 0);
    setFI(saved?.intensity ?? 100);
    setScale(savedT?.scale ?? 1);
    setOffset(savedT?.offset ?? {x:0,y:0});
    setActivePhoto(i);
    setActiveTool(null);
  };

  // Refs for video playback
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Helper: compute max offset so image edge never goes inside the frame
  const clampOffset = (newOffset: {x:number;y:number}, newScale: number, frameW: number, frameH: number) => {
    // At scale 1 the image exactly fills the frame → max offset = 0
    // At scale N the image is N× bigger → can pan up to (N-1)/2 × frame dimension
    const maxX = frameW  * (newScale - 1) / 2;
    const maxY = frameH * (newScale - 1) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, newOffset.x)),
      y: Math.max(-maxY, Math.min(maxY, newOffset.y)),
    };
  };

  // Frame size ref (updated by RatioCropPreview via a callback)
  const frameSize = useRef({w: window.innerWidth, h: window.innerWidth * (16/9)});

  // Touch: pinch zoom + bounded drag + swipe between photos
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      isPinching.current = true;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDist.current = Math.sqrt(dx*dx + dy*dy);
    } else {
      isDragging.current = true;
      swipeStart.current  = e.touches[0].clientX;
      swipeStartY.current = e.touches[0].clientY;
      lastPos.current = {x:e.touches[0].clientX, y:e.touches[0].clientY};
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    // Only prevent default when pinching or dragging (not on video tap)
    if (e.touches.length >= 2 || (isDragging.current && scale > 1)) {
      e.preventDefault();
    }
    if (e.touches.length === 2 && isPinching.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (lastDist.current > 0) {
        setScale(s => {
          const next = Math.max(0.5, Math.min(5, s * (dist / lastDist.current)));
          return next;
        });
      }
      lastDist.current = dist;
    } else if (e.touches.length === 1 && isDragging.current) {
      const dx = e.touches[0].clientX - lastPos.current.x;
      const dy = e.touches[0].clientY - lastPos.current.y;
      setOffset(o => {
        const raw = {x: o.x + dx, y: o.y + dy};
        // Only clamp when scale >= 1 (filling frame); at scale < 1 allow free move
        return scale >= 1
          ? clampOffset(raw, scale, frameSize.current.w, frameSize.current.h)
          : raw;
      });
      lastPos.current = {x:e.touches[0].clientX, y:e.touches[0].clientY};
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (isPinching.current) { isPinching.current = false; lastDist.current = 0; return; }
    if (!isDragging.current) return;
    isDragging.current = false;

    const endX = e.changedTouches[0]?.clientX ?? swipeStart.current;
    const endY = e.changedTouches[0]?.clientY ?? swipeStartY.current;
    const dx = endX - swipeStart.current;
    const dy = Math.abs(endY - swipeStartY.current);

    // If scale < 1 (zoomed out) → snap back to center + scale 1
    if (scale < 1) {
      setScale(1);
      setOffset({x:0, y:0});
      return;
    }

    // Horizontal swipe at scale 1 → navigate photos
    if (isPhoto && photos.length > 1 && Math.abs(dx) > 50 && dy < 40 && scale <= 1.05) {
      if (dx < 0 && activePhoto < photos.length - 1) switchPhoto(activePhoto + 1);
      if (dx > 0 && activePhoto > 0)                 switchPhoto(activePhoto - 1);
    }
  };

  const currentFilter = buildFilter(adjustments, filterIdx, filterIntensity);
  const img = photos?.[activePhoto];
  const totalMedia = photos.length + (videoUrl ? 1 : 0);

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-black"
      style={{paddingBottom:'env(safe-area-inset-bottom)'}}>
      <style>{`@keyframes panelSlide{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

      {/* Text Layer Editor */}
      {showTextEditor && (
        <TextLayerEditor
          mediaUrl={photos[activePhoto] || videoUrl || ''}
          postId={publishedPostId ?? undefined}
          initial={textLayers}
          onSave={layers => { setTextLayers(layers); setShowTextEditor(false); }}
          onClose={() => setShowTextEditor(false)}
        />
      )}

      {/* AI Studio overlay */}
      {showAIStudio && (
        <AIStudio
          mediaUrl={img || videoUrl || ''}
          mediaType={isVideo ? 'video' : 'photo'}
          caption={caption}
          location={location}
          audioTitle={(selectedMusic as any)?.title || audioTitle}
          listingId={selectedListings?.[0]?.id || listingPins?.[0]?.listingId}
          onApply={(resultUrl, editType, params) => {
            onPushHistory();
            if (resultUrl && resultUrl !== (img || videoUrl)) {
              if (isPhoto && img) {
                // Replace the active photo with the AI-processed version
                setPhotos(prev => {
                  const next = [...prev];
                  next[activePhoto] = resultUrl;
                  return next;
                });
              } else if (isVideo && videoUrl) {
                setVideo(resultUrl);
              }
            }
            // Apply text results to caption/hashtags
            if (editType === 'gen_caption' && params?.caption) {
              setCaption(params.caption);
              toast.success('Caption applied to your post!');
            }
            if (editType === 'gen_hashtags' && params?.hashtags?.length) {
              setTags((prev: string[]) => [...new Set([...prev, ...params.hashtags])]);
              toast.success(`${params.hashtags.length} hashtags added!`);
            }
            setShowAIStudio(false);
          }}
          onClose={() => setShowAIStudio(false)}
        />
      )}

      {/* ── Nav ── */}
      <div className="shrink-0 flex items-center justify-between px-4 pt-12 pb-2 z-10">
        <button onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40">
          <ChevronLeft className="w-5 h-5 text-white"/>
        </button>
        {/* Undo / Redo */}
        <div className="flex items-center gap-1">
          <button onClick={onUndo} disabled={!canUndo}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 disabled:opacity-30">
            <Undo2 className="w-4 h-4 text-white"/>
          </button>
          <button onClick={onRedo} disabled={!canRedo}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 disabled:opacity-30">
            <Redo2 className="w-4 h-4 text-white"/>
          </button>
        </div>
        <div className="flex items-center gap-3">
          {/* Ratio selector button */}
          <RatioButton ratio={ratio} setRatio={setRatio}/>
          {/* Photo indicator dots */}
          {isPhoto && photos.length > 1 && (
            <div className="flex gap-1">
              {photos.map((_:any,i:number)=>(
                <div key={i} className="rounded-full transition-all"
                  style={{width: activePhoto===i?16:5, height:5,
                    background: activePhoto===i?'#51A2FF':'rgba(255,255,255,0.3)'}}/>
              ))}
            </div>
          )}
          {(scale > 1 || offset.x !== 0 || offset.y !== 0) && (
            <button onClick={()=>{setScale(1);setOffset({x:0,y:0});}}
              className="px-3 py-1.5 rounded-full bg-black/40 text-white text-xs font-bold">
              Reset
            </button>
          )}
          <button onClick={()=>{
            // Save current photo transform before leaving
            perPhotoEdits.current.set(activePhoto, {adj:{...adjustments}, filterIdx, intensity:filterIntensity});
            perPhotoTransform.current.set(activePhoto, {scale, offset:{...offset}});
            onNext();
          }}
            className="px-4 py-1.5 rounded-full text-white text-sm font-black"
            style={{background:'#51A2FF'}}>
            Next
          </button>
        </div>
      </div>

      {/* ── Fullscreen preview overlay ── */}
      {showFullscreen && (
        <div className="fixed inset-0 z-[80] bg-black flex flex-col">
          {/* Back button */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center px-4 pt-12 pb-4"
            style={{background:'linear-gradient(to bottom,rgba(0,0,0,0.6),transparent)'}}>
            <button onClick={() => setShowFullscreen(false)}
              className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
            </button>
            {isPhoto && photos.length > 1 && (
              <div className="flex gap-1.5 ml-auto">
                {photos.map((_:any, i:number) => (
                  <button key={i} onClick={() => switchPhoto(i)}
                    className="rounded-full transition-all"
                    style={{width: activePhoto===i?18:6, height:6,
                      background: activePhoto===i?'white':'rgba(255,255,255,0.35)'}}/>
                ))}
              </div>
            )}
          </div>
          {/* Full-screen image */}
          <div className="flex-1 flex items-center justify-center">
            {isPhoto && img && (
              <img src={img} alt=""
                className="max-w-full max-h-full object-contain"
                style={{filter: currentFilter}}/>
            )}
            {isVideo && videoUrl && (
              <video src={videoUrl} className="max-w-full max-h-full object-contain"
                controls autoPlay muted playsInline style={{filter: currentFilter}}/>
            )}
          </div>
        </div>
      )}

      {/* ── Scrollable middle: preview + photo strip ── */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col justify-center bg-black relative">
        <RatioCropPreview
          ratio={ratio}
          originalRatioCss={originalRatioCss}
          img={img}
          videoUrl={videoUrl}
          isPhoto={isPhoto}
          isVideo={isVideo}
          scale={scale}
          offset={offset}
          currentFilter={currentFilter}
          panelOpen={panelOpen}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          setPanelOpen={setPanelOpen}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          videoRef={videoRef}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          onFrameSize={(w:number,h:number)=>{ frameSize.current = {w,h}; }}
        />
        {/* Expand-to-fullscreen button */}
        <button
          onClick={e => { e.stopPropagation(); setShowFullscreen(true); }}
          className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
          style={{background:'rgba(0,0,0,0.45)',backdropFilter:'blur(4px)'}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>
          </svg>
        </button>

      </div>{/* end scrollable middle */}

      {/* ── Bottom toolbar (collapsible) ── */}
      {panelOpen && (
        <div className="shrink-0" style={{background:'#050816',animation:'panelSlide 0.18s ease'}}>

          {/* Tool panels */}

          {/* AI tab */}
          {tab==='ai' && (            <div onClick={e=>e.stopPropagation()} className="pb-1">
              <div className="flex flex-col items-center gap-2 py-3">
                <div className="flex gap-[5px]">
                  {[0,1,2].map(i=>(
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400"
                      style={{animation:`aiDot 1.2s ease-in-out ${i*0.2}s infinite alternate`}}/>
                  ))}
                </div>
                <p className="text-[11px] text-white/50">Tap to open full AI Studio</p>
              </div>
              <style>{`@keyframes aiDot{0%{transform:scaleY(0.4);opacity:.3}100%{transform:scaleY(1.4);opacity:1}}`}</style>
              <button
                onClick={()=>setShowAIStudio(true)}
                className="mx-4 w-[calc(100%-32px)] flex items-center gap-3 px-4 py-4 rounded-2xl transition-all active:scale-[0.98]"
                style={{background:'linear-gradient(135deg,#3b82f6,#8b5cf6)',boxShadow:'0 8px 24px rgba(99,102,241,0.4)'}}>
                <span className="text-2xl">✨</span>
                <div className="flex-1 text-left">
                  <p className="text-sm font-black text-white">Filmons AI Editor</p>
                  <p className="text-[10px] text-white/70">Enhance · Remove · Captions · Crop · Insights</p>
                </div>
              </button>
            </div>
          )}

          {/* FILTER */}
          {tab==='filter' && (
            <div>
              <div className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-hide" onClick={e=>e.stopPropagation()}>
                {FILTERS.map((f:any,i:number)=>(
                  <button key={f.id} onClick={()=>{onPushHistory();setFilterIdx(i);}}
                    className="shrink-0 flex flex-col items-center gap-1.5 active:scale-[0.95] transition-transform">
                    <div className="relative rounded-xl overflow-hidden" style={{width:68,height:68}}>
                      {img
                        ? <img src={img} className="w-full h-full object-cover" style={{filter:f.css||''}}/>
                        : videoUrl ? <video src={videoUrl} className="w-full h-full object-cover" style={{filter:f.css||''}} muted preload="metadata"/>
                        : <div className="w-full h-full bg-gray-800"/>}
                      {filterIdx===i && <div className="absolute inset-0 rounded-xl" style={{border:'2.5px solid #51A2FF',boxShadow:'0 0 10px rgba(81,162,255,0.5)'}}/>}
                    </div>
                    <p className="text-[10px] font-semibold" style={{color:filterIdx===i?'#51A2FF':'rgba(255,255,255,0.4)'}}>{f.name}</p>
                  </button>
                ))}
              </div>
              {filterIdx > 0 && (
                <div className="px-4 pb-3" onClick={e=>e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Intensity</p>
                    <p className="text-[11px] font-black tabular-nums" style={{color:'#51A2FF'}}>{filterIntensity}%</p>
                  </div>
                  <div className="relative h-9 rounded-2xl flex items-center cursor-ew-resize select-none"
                    style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)'}}
                    onPointerDown={e=>{(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);const r=e.currentTarget.getBoundingClientRect();setFI(Math.max(0,Math.min(100,Math.round(((e.clientX-r.left)/r.width)*100))));}}
                    onPointerMove={e=>{if(e.buttons!==1)return;const r=e.currentTarget.getBoundingClientRect();setFI(Math.max(0,Math.min(100,Math.round(((e.clientX-r.left)/r.width)*100))));}}
                  >
                    <div className="absolute inset-y-0 left-0 rounded-2xl pointer-events-none" style={{width:`${filterIntensity}%`,background:'rgba(81,162,255,0.22)'}}/>
                    <div className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full pointer-events-none" style={{left:`calc(${filterIntensity}% - 10px)`,background:'#51A2FF',boxShadow:'0 0 8px rgba(81,162,255,0.6)'}}/>
                    <p className="w-full text-center text-[10px] text-white/20 font-semibold pointer-events-none z-10">← slide →</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* EDIT */}
          {tab==='edit' && (
            <div onClick={e=>e.stopPropagation()}>
              {activeTool && (
                <div className="px-4 py-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold">{EDIT_TOOLS.find((t:any)=>t.id===activeTool)?.label}</p>
                    <p className="text-[11px] font-black tabular-nums" style={{color:'#51A2FF'}}>
                      {adjustments[activeTool as keyof typeof adjustments] > 0 ? '+' : ''}{adjustments[activeTool as keyof typeof adjustments]}
                    </p>
                  </div>
                  <div className="relative h-9 rounded-2xl flex items-center cursor-ew-resize select-none"
                    style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(81,162,255,0.3)'}}
                    onPointerDown={e=>{
                      onPushHistory();
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      const r=e.currentTarget.getBoundingClientRect();
                      const tool=EDIT_TOOLS.find((t:any)=>t.id===activeTool)!;
                      const val=Math.round(tool.min+(tool.max-tool.min)*((e.clientX-r.left)/r.width));
                      setAdj((p:any)=>({...p,[activeTool]:Math.max(tool.min,Math.min(tool.max,val))}));
                    }}
                    onPointerMove={e=>{
                      if(e.buttons!==1)return;
                      const r=e.currentTarget.getBoundingClientRect();
                      const tool=EDIT_TOOLS.find((t:any)=>t.id===activeTool)!;
                      const val=Math.round(tool.min+(tool.max-tool.min)*((e.clientX-r.left)/r.width));
                      setAdj((p:any)=>({...p,[activeTool]:Math.max(tool.min,Math.min(tool.max,val))}));
                    }}>
                    <div className="absolute inset-y-0 left-1/2 w-px bg-white/15"/>
                    {(()=>{const tool=EDIT_TOOLS.find((t:any)=>t.id===activeTool)!;const v=adjustments[activeTool as keyof typeof adjustments];const neutral=(0-tool.min)/(tool.max-tool.min);const cur=(v-tool.min)/(tool.max-tool.min);const left=Math.min(neutral,cur)*100;const width=Math.abs(cur-neutral)*100;return <div className="absolute inset-y-0 pointer-events-none rounded" style={{left:`${left}%`,width:`${width}%`,background:'rgba(81,162,255,0.3)'}}/>;})()}
                    {(()=>{const tool=EDIT_TOOLS.find((t:any)=>t.id===activeTool)!;const v=adjustments[activeTool as keyof typeof adjustments];const pct=((v-tool.min)/(tool.max-tool.min))*100;return <div className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full pointer-events-none" style={{left:`calc(${pct}% - 10px)`,background:'#51A2FF',boxShadow:'0 0 8px rgba(81,162,255,0.7)'}}/>;})()}
                    <p className="w-full text-center text-[10px] text-white/20 font-semibold pointer-events-none z-10">← drag →</p>
                  </div>
                </div>
              )}
              <div className="flex gap-4 overflow-x-auto px-4 py-3 scrollbar-hide">
                {EDIT_TOOLS.map((tool:any)=>{
                  const val=adjustments[tool.id as keyof typeof adjustments];
                  const active=activeTool===tool.id;
                  return (
                    <button key={tool.id} onClick={()=>setActiveTool(active?null:tool.id)}
                      className="shrink-0 flex flex-col items-center gap-1.5 active:scale-[0.95] transition-transform">
                      <div className="w-14 h-14 rounded-full flex items-center justify-center"
                        style={{background:active?'rgba(81,162,255,0.15)':'rgba(255,255,255,0.06)',border:active?'2px solid #51A2FF':'2px solid rgba(255,255,255,0.12)',boxShadow:active?'0 0 12px rgba(81,162,255,0.4)':'none'}}>
                        <span className="text-xs font-black tabular-nums" style={{color:val!==0?'#51A2FF':'rgba(255,255,255,0.55)'}}>{val>0?`+${val}`:val}</span>
                      </div>
                      <p className="text-[10px] font-semibold" style={{color:active?'#51A2FF':'rgba(255,255,255,0.4)'}}>{tool.label}</p>
                    </button>
                  );
                })}
                <button onClick={()=>{onPushHistory();setAdj({brightness:0,contrast:0,warmth:0,saturation:0,fade:0,highlights:0,shadows:0,vignette:0,sharpen:0,grain:0,blur:0});}}
                  className="shrink-0 flex flex-col items-center gap-1.5">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{background:'rgba(255,255,255,0.04)',border:'2px solid rgba(255,255,255,0.08)'}}>
                    <span className="text-[10px] font-black text-white/30">Reset</span>
                  </div>
                  <p className="text-[10px] font-semibold text-white/30">Reset</p>
                </button>
              </div>
            </div>
          )}

          {/* VIDEO */}
          {tab==='video' && (
            <div onClick={e=>e.stopPropagation()}>
              <div className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-hide">
                {[
                  {icon:'✂️', label:'Trim',         sub:'Cut start/end'},
                  {icon:'🔇', label:'Mute',          sub:'Remove audio'},
                  {icon:'🖼️', label:'Cover',         sub:'Choose thumbnail'},
                  {icon:'⚡', label:'Speed',          sub:'0.5× to 2×'},
                  {icon:'↔️', label:'Split',          sub:'Split clip'},
                  {icon:'🔄', label:'Transitions',    sub:'Between clips'},
                  {icon:'📐', label:'Flip',           sub:'Mirror video'},
                ].map(item=>(
                  <button key={item.label}
                    onClick={()=>toast.info(`${item.label} — coming soon`)}
                    className="shrink-0 flex flex-col items-center gap-1.5 active:scale-[0.95] transition-transform">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl"
                      style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)'}}>
                      {item.icon}
                    </div>
                    <p className="text-[10px] font-semibold text-white/50 text-center leading-tight w-14">{item.label}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* AUDIO */}
          {tab==='audio' && (
            <div onClick={e=>e.stopPropagation()} className="px-4 py-3 space-y-3">
              {selectedMusic ? (
                <>
                  {/* Audio card */}
                  <div className="flex items-center gap-3 rounded-2xl p-3"
                    style={{background:'rgba(81,162,255,0.1)',border:'1px solid rgba(81,162,255,0.25)'}}>
                    {/* Cover art */}
                    {selectedMusic.artwork_url
                      ? <img src={selectedMusic.artwork_url} className="w-12 h-12 rounded-xl object-cover shrink-0"/>
                      : <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                          <span className="text-xl">🎵</span>
                        </div>}
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-white truncate">♫ {selectedMusic.title}</p>
                      {selectedMusic.artist && (
                        <p className="text-xs text-white/50 truncate">{selectedMusic.artist}</p>
                      )}
                      <p className="text-[10px] text-white/30 mt-0.5">
                        {selectedMusic.snippetStart !== undefined
                          ? `${Math.floor(selectedMusic.snippetStart/60)}:${String(selectedMusic.snippetStart%60).padStart(2,'0')} – ${Math.floor((selectedMusic.snippetEnd||30)/60)}:${String((selectedMusic.snippetEnd||30)%60).padStart(2,'0')}`
                          : 'Full track'}
                      </p>
                    </div>
                    {/* Remove */}
                    <button onClick={()=>setSelectedMusic(null)}
                      className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                      <X className="w-3.5 h-3.5 text-white/60"/>
                    </button>
                  </div>
                  {/* Actions */}
                  <div className="flex gap-2">
                    <button onClick={onOpenMusicBrowser}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white/60 transition-colors"
                      style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)'}}>
                      Replace Audio
                    </button>
                    <button onClick={onOpenTrimSheet}
                      className="flex-1 py-2.5 rounded-xl text-xs font-black text-white transition-colors"
                      style={{background:'#51A2FF'}}>
                      ✂️ Edit Segment
                    </button>
                  </div>
                  {/* Volume indicators */}
                  {(selectedMusic.audioVolume !== undefined || selectedMusic.videoVolume !== undefined) && (
                    <div className="flex gap-3 text-xs text-white/40">
                      <span>🎵 Audio {selectedMusic.audioVolume ?? 80}%</span>
                      <span>🎬 Video {selectedMusic.videoVolume ?? 100}%</span>
                      {selectedMusic.fadeIn  && <span>Fade In ✓</span>}
                      {selectedMusic.fadeOut && <span>Fade Out ✓</span>}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* No audio — prompt */}
                  <button onClick={onOpenMusicBrowser}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl transition-all active:scale-[0.98]"
                    style={{background:'rgba(81,162,255,0.1)',border:'1.5px dashed rgba(81,162,255,0.4)'}}>
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                      style={{background:'rgba(81,162,255,0.2)'}}>
                      <span className="text-2xl">🎵</span>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black text-white">Add Music</p>
                      <p className="text-xs text-white/40">Browse sounds, trending audio & playlists</p>
                    </div>
                    <div className="ml-auto">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{background:'#51A2FF'}}>
                        <span className="text-white text-lg font-black leading-none">+</span>
                      </div>
                    </div>
                  </button>
                  {/* Quick actions removed */}
                </>
              )}
            </div>
          )}

          {/* TEXT */}
          {tab==='text' && (
            <div onClick={e=>e.stopPropagation()}>
              <div className="flex flex-col items-center gap-2 py-3">
                <p className="text-[11px] text-white/50">Editable text overlays — stored in DB</p>
              </div>
              <button
                onClick={()=>setShowTextEditor(true)}
                className="mx-4 w-[calc(100%-32px)] flex items-center gap-3 px-4 py-4 rounded-2xl transition-all active:scale-[0.98]"
                style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.15)'}}>
                <span className="text-2xl">📝</span>
                <div className="flex-1 text-left">
                  <p className="text-sm font-black text-white">
                    {textOverlays.length > 0
                      ? `Text Overlays (${textOverlays.length})`
                      : 'Add Text Overlays'}
                  </p>
                  <p className="text-[10px] text-white/40">
                    {textOverlays.length > 0
                      ? textOverlays.map((o: TextLayer) => o.text.slice(0,20)).join(' · ')
                      : 'Drag, style, animate — editable anytime'}
                  </p>
                </div>
                <span className="text-white/30 text-sm">›</span>
              </button>
            </div>
          )}

          {/* OVERLAY */}
          {tab==='overlay' && (
            <div onClick={e=>e.stopPropagation()}>
              <div className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-hide">
                {[
                  {icon:'✦',  label:'Light Leak',    sub:'Cinematic glow'},
                  {icon:'◫',  label:'Film Grain',     sub:'Add texture'},
                  {icon:'🏷️', label:'Creator Tag',   sub:'Watermark'},
                  {icon:'🖼️', label:'Image',          sub:'Overlay image'},
                  {icon:'🎭', label:'Stickers',        sub:'Graphics'},
                  {icon:'▣',  label:'Logo',            sub:'Brand logo'},
                  {icon:'📁', label:'Project Name',   sub:'Credit overlay'},
                ].map(item=>(
                  <button key={item.label}
                    onClick={()=>toast.info(`${item.label} — coming soon`)}
                    className="shrink-0 flex flex-col items-center gap-1.5 active:scale-[0.95] transition-transform">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl"
                      style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)'}}>
                      {item.icon}
                    </div>
                    <p className="text-[10px] font-semibold text-white/50 text-center leading-tight w-14">{item.label}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── 5-tab bar ── */}
          <div className="flex border-t border-white/10" onClick={e=>e.stopPropagation()}>
            {TOOLBAR_TABS.map(t=>(
              <button key={t.id} onClick={()=>{setTab(t.id);setActiveTool(null);setPanelOpen(true);}}
                className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 relative transition-colors"
                style={{color:tab===t.id?'#fff':'rgba(255,255,255,0.4)'}}>
                <span className="text-base leading-none" style={{opacity:tab===t.id?1:0.5}}>{t.icon}</span>
                <span className="text-[10px] font-bold tracking-wide">{t.label}</span>
                {tab===t.id && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full" style={{background:'#51A2FF'}}/>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Collapsed state: just tab bar */}
      {!panelOpen && (
        <div className="shrink-0 flex border-t border-white/10" style={{background:'#050816'}} onClick={e=>e.stopPropagation()}>
          {TOOLBAR_TABS.map(t=>(
            <button key={t.id} onClick={()=>{setTab(t.id);setPanelOpen(true);}}
              className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 relative"
              style={{color:tab===t.id?'#fff':'rgba(255,255,255,0.35)'}}>
              <span className="text-base leading-none" style={{opacity:tab===t.id?1:0.45}}>{t.icon}</span>
              <span className="text-[10px] font-bold tracking-wide">{t.label}</span>
              {tab===t.id && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full" style={{background:'#51A2FF'}}/>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export function PostComposer({onClose,onPost,currentUser,mode='post',initialAudio}:{
  onClose:()=>void; onPost?:(p?:any)=>void; currentUser?:any; mode?:'post'|'story'|'reel'; initialAudio?:any;
}) {
  const {user:authUser}=useAuth();
  const user=currentUser||authUser;
  const isCreatorPlus = ['creator_plus','professional','business'].includes(user?.accountType||'') ||
                        ['creator_plus','professional','business'].includes(user?.accountMode||'');

  const [step,       setStep]    = useState<FlowStep>(mode==='reel'?'gallery':'typeSelect');
  const [kind,       setKind]    = useState<PostKind>(mode==='reel'?'reel':'photo');
  const [publishing, setPub]     = useState(false);
  const [showAudioComposer, setShowAudioComposer] = useState(false);

  // Permission
  const [galTab,      setGalTab]      = useState<'recents'|'videos'|'favorites'|'albums'|'drafts'>('recents');
  const [showTabDrop, setShowTabDrop]  = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [drafts,      setDrafts]       = useState<PostDraft[]>([]);
  const [draftsLoading,setDraftsLoad]  = useState(false);
  const [currentDraftId,setDraftId]    = useState<string|undefined>(undefined);
  const [galPerm, setGalPerm] = useState<'idle'|'prompt'|'granted'>(() => {
    try { return localStorage.getItem('fm_gallery_perm') === 'granted' ? 'granted' : 'idle'; }
    catch { return 'idle'; }
  });
  const [galItems,   setGalItems]= useState<GalleryFile[]>([]);
  const [galSel,     setGalSel] = useState<Set<number>>(new Set());
  const fileRef                  = useRef<HTMLInputElement>(null);
  const pendingAccept            = useRef('image/*');

  // Media
  const [photos,     setPhotos]  = useState<string[]>([]);
  const [videoUrl,   setVideo]   = useState('');
  const [audioUrl,   setAudio]   = useState('');
  const [textContent,setText]    = useState('');
  const [textBg,     setTextBg]  = useState('dark');
  const [textFont,   setFont]    = useState('sans');
  const [textAlign,  setAlign]   = useState<'left'|'center'|'right'>('center');
  const [ratio,      setRatio]   = useState('9:16');
  // Natural dimensions of the selected media for "Original" ratio
  const [originalRatioCss, setOriginalRatio] = useState('9/16');
  const [editTab,    setEditTab] = useState<'filter'|'edit'>('filter');
  const [activePhoto,setActivePhoto] = useState(0);
  const [filterIdx,  setFilterIdx]= useState(0);
  const [filterIntensity,setFI]   = useState(100);
  const [adjustments, setAdj]     = useState({
    brightness:0, contrast:0, warmth:0, saturation:0,
    fade:0, highlights:0, shadows:0, vignette:0, sharpen:0,
    grain:0, blur:0,
  });
  const [activeTool, setActiveTool] = useState<string|null>(null);
  const [dragging, setDragging]    = useState(false);
  const [dragStart, setDragStart]  = useState(0);
  // Store edits per photo index so switching photos saves the previous ones
  const perPhotoEdits = useRef<Map<number,{adj:typeof adjustments;filterIdx:number;intensity:number}>>(new Map());
  // Persist pinch/pan per photo
  const perPhotoTransform = useRef<Map<number,{scale:number;offset:{x:number;y:number}}>>(new Map());

  // ── Undo / Redo ───────────────────────────────────────────────────────────────
  type HistEntry = {
    photos: string[];
    adjustments: { brightness:number;contrast:number;warmth:number;saturation:number;fade:number;highlights:number;shadows:number;vignette:number;sharpen:number;grain:number;blur:number };
    filterIdx: number;
    filterIntensity: number;
    editMap: [number, { adj: HistEntry['adjustments']; filterIdx: number; intensity: number }][];
  };
  const historyStack = useRef<HistEntry[]>([]);
  const historyIdx   = useRef(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // Stable refs so callbacks don't go stale
  const photosRef    = useRef(photos);
  const adjRef       = useRef(adjustments);
  const filterIdxRef = useRef(filterIdx);
  const filterIntRef = useRef(filterIntensity);

  // Keep refs in sync
  photosRef.current    = photos;
  adjRef.current       = adjustments;
  filterIdxRef.current = filterIdx;
  filterIntRef.current = filterIntensity;

  const pushHistory = useCallback(() => {
    const entry: HistEntry = {
      photos:          [...photosRef.current],
      adjustments:     { ...adjRef.current },
      filterIdx:       filterIdxRef.current,
      filterIntensity: filterIntRef.current,
      editMap:         [...perPhotoEdits.current.entries()],
    };
    historyStack.current.splice(historyIdx.current + 1);
    historyStack.current.push(entry);
    historyIdx.current = historyStack.current.length - 1;
    setCanUndo(historyIdx.current > 0);
    setCanRedo(false);
  }, []);

  const undoEdit = useCallback(() => {
    if (historyIdx.current <= 0) return;
    historyIdx.current--;
    const e = historyStack.current[historyIdx.current];
    setPhotos([...e.photos]);
    setAdj({ ...e.adjustments });
    setFilterIdx(e.filterIdx);
    setFI(e.filterIntensity);
    perPhotoEdits.current = new Map(e.editMap);
    setCanUndo(historyIdx.current > 0);
    setCanRedo(true);
  }, []);

  const redoEdit = useCallback(() => {
    if (historyIdx.current >= historyStack.current.length - 1) return;
    historyIdx.current++;
    const e = historyStack.current[historyIdx.current];
    setPhotos([...e.photos]);
    setAdj({ ...e.adjustments });
    setFilterIdx(e.filterIdx);
    setFI(e.filterIntensity);
    perPhotoEdits.current = new Map(e.editMap);
    setCanUndo(historyIdx.current > 0);
    setCanRedo(historyIdx.current < historyStack.current.length - 1);
  }, []);

  const [showMusicBrowser,  setShowMusicBrowser]  = useState(false);
  const [showCollabSheet,   setShowCollabSheet]  = useState(false);
  const [showTrimSheet,     setShowTrimSheet]    = useState(false);
  const [publishedPostId,   setPublishedPostId]  = useState<string|null>(null);
  const [showListingBrowser, setShowListingBrowser] = useState(false);
  const [textOverlays,       setTextOverlays]       = useState<TextLayer[]>([]);
  const [showTextEditor,     setShowTextEditor]     = useState(false);
  const [textLayers,         setTextLayers]         = useState<TextLayer[]>([]);

  // Pre-select audio from AudioPage if provided
  useEffect(() => {
    if (initialAudio?.title) {
      setSelectedMusic({
        track_id:     initialAudio.track_id,
        title:        initialAudio.title,
        artist:       initialAudio.artist || '',
        artwork_url:  initialAudio.artwork_url || '',
        snippetStart: initialAudio.snippetStart ?? 0,
        snippetEnd:   initialAudio.snippetEnd,
        audioVolume:  0.8,
      });
    }
  }, [initialAudio?.title]); // eslint-disable-line
  const [publishedPost,      setPublishedPost]      = useState<any|null>(null);
  const [tagPins,            setTagPins]            = useState<any[]>([]);
  const [showListingTagger,  setShowListingTagger]  = useState(false);
  const [listingPins,        setListingPins]        = useState<ListingPin[]>([]);
  const [selectedListings, setSelectedListings]     = useState<any[]>([]);
  const [selectedMusic, setSelectedMusic] = useState<{title:string;artist?:string;artwork_url?:string;track_id?:string;file_url?:string;snippetStart:number;snippetEnd?:number;audioVolume?:number;videoVolume?:number;fadeIn?:boolean;fadeOut?:boolean}|null>(null);
  const [audioTitle, setATitle]  = useState('');
  const [audioArtist,setAArtist] = useState('');
  const [audioGenre, setAGenre]  = useState('');

  // Caption
  const [caption,    setCaption] = useState('');
  const [roles,      setRoles]   = useState<string[]>([]);
  const [credits,    setCredits] = useState<{role:string;name:string}[]>([]);
  const [collabs,    setCollabs] = useState<string[]>([]);  // usernames for display/caption
  const [mentionedUsers, setMentionedUsers] = useState<ProfileResult[]>([]); // full profile objects for DB
  const [collabIn,   setCollabIn]= useState('');
  const [location,   setLoc]     = useState('');
  const [tags,       setTags]    = useState<string[]>([]);
  const [tagIn,      setTagIn]   = useState('');

  // Advanced
  const [visibility, setVis]     = useState<Visibility>('public');
  const [hideLikes,  setHL]      = useState(false);
  const [allowComments,setAC]    = useState(true);
  const [projectType,setPType]   = useState('');
  const [allowSharing, setSh]    = useState(true);
  const [allowRemix, setAR]      = useState(false);
  const [allowDownload,setAD]    = useState(false);
  const [hqUpload,   setHQ]      = useState(true);
  const [monetize,   setMon]     = useState(false);

  const isPlus      = ['creator_plus','professional','business'].includes(user?.accountType||'');
  const isMediaPost = kind==='photo'; // combined Photos & Videos post type
  const isPhoto     = kind==='photo'; // alias kept for compat
  const isVideo     = kind==='video'||kind==='reel'||kind==='story';
  const postType = (kind==='reel'||kind==='story') ? 'video' : kind as PostType;

  // Gallery helpers
  const requestGallery = (accept:string) => {
    pendingAccept.current=accept;
    if(galPerm==='granted'){launchPicker(accept);}
    else setGalPerm('prompt');
  };
  const launchPicker = (accept:string) => {
    if(!fileRef.current)return;
    fileRef.current.accept=accept;
    fileRef.current.multiple = accept.includes('image');
    fileRef.current.value='';
    fileRef.current.click();
  };
  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const items: GalleryFile[] = files.map(f => ({
      url:  URL.createObjectURL(f),
      type: f.type.startsWith('video') ? 'video' : f.type.startsWith('audio') ? 'audio' : 'photo',
      name: f.name,
    }));
    setGalItems(items);
    setGalSel(new Set());
    setPhotos([]);
    setVideo('');
    // Pre-detect ratio from first item so preview looks right immediately
    if (items.length > 0) detectRatio(items[0].url, items[0].type as 'photo'|'video');
    setGalPerm('granted');
    try { localStorage.setItem('fm_gallery_perm', 'granted'); } catch {}
  };

  // Auto-detect ratio from media natural dimensions
  const detectRatio = (url: string, type: 'photo'|'video') => {
    if (type === 'photo') {
      const img = document.createElement('img') as HTMLImageElement;
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight;
        setOriginalRatio(`${w}/${h}`);  // save exact natural ratio
        const r = w / h;
        if      (r > 1.6)   setRatio('16:9');
        else if (r > 0.9)   setRatio('1:1');
        else if (r > 0.6)   setRatio('4:5');
        else                setRatio('9:16');
      };
      img.src = url;
    } else {
      const vid = document.createElement('video');
      vid.onloadedmetadata = () => {
        const w = vid.videoWidth, h = vid.videoHeight;
        if (!w || !h) return;
        setOriginalRatio(`${w}/${h}`);
        const r = w / h;
        if      (r > 1.6)   setRatio('16:9');
        else if (r > 0.9)   setRatio('1:1');
        else if (r > 0.6)   setRatio('4:5');
        else                setRatio('9:16');
      };
      vid.src = url;
    }
  };

  const toggleGal = (i: number) => {
    const item = galItems[i];
    if (!item) return;

    if (multiSelectMode) {
      // Multi-select: numbered selection order
      if (item.type === 'video') {
        if (videoUrl === item.url) { setVideo(''); setGalSel(prev=>{ const n=new Set(prev); n.delete(i); return n; }); }
        else { setVideo(item.url); setGalSel(prev=>{ const n=new Set(prev); n.add(i); return n; }); }
      } else {
        setGalSel(prev => {
          const n = new Set(prev);
          if (n.has(i)) {
            n.delete(i);
            setPhotos(galItems.filter((_,idx) => n.has(idx) && galItems[idx].type==='photo').map(g=>g.url));
          } else if (n.size < 10) {
            n.add(i);
            setPhotos(p => {
              const next = [...p.filter(u => u!==item.url), item.url];
              if (next.length === 1) detectRatio(item.url, 'photo'); // first photo sets ratio
              return next;
            });
          }
          return n;
        });
      }
    } else {
      // Single select — tap replaces current selection, shows in preview instantly
      setGalSel(new Set([i]));
      if (item.type === 'video') { setVideo(item.url); setPhotos([]); detectRatio(item.url, 'video'); }
      else if (item.type === 'photo') { setPhotos([item.url]); setVideo(''); detectRatio(item.url, 'photo'); }
    }
  };
  const confirmGal = () => {
    // photos/videoUrl are already set live by toggleGal — just advance
    if (kind === 'audio') {
      const sel = Array.from(galSel).map(i => galItems[i]);
      const a = sel.find(s => s.type === 'audio');
      if (a) { setAudio(a.url); setATitle(a.name.replace(/\.[^.]+$/, '')); }
    }
    setGalSel(new Set());
    setStep('edit');
  };

  // Build CSS filter string from adjustments + selected filter
  const buildFilter = (adj: typeof adjustments, filterIdx: number, intensity: number = 100) => {
    const f   = FILTERS[filterIdx];
    const pct = intensity / 100;
    const parts: string[] = [];
    // Apply preset filter blended with intensity
    if (f.css && pct > 0) {
      // Interpolate: at pct=0 no filter, at pct=1 full filter
      // We approximate by scaling individual values
      if (f.id === 'noir')    parts.push(`grayscale(${0.9*pct}) contrast(${1+0.3*pct}) brightness(${1-0.1*pct})`);
      else if (f.id === 'cinema')  parts.push(`contrast(${1+0.1*pct}) saturate(${1-0.15*pct}) brightness(${1-0.05*pct}) sepia(${0.1*pct})`);
      else if (f.id === 'soft')    parts.push(`brightness(${1+0.05*pct}) contrast(${1-0.08*pct}) saturate(${1-0.1*pct})`);
      else if (f.id === 'night')   parts.push(`brightness(${1-0.15*pct}) contrast(${1+0.1*pct}) saturate(${1-0.3*pct}) hue-rotate(${200*pct}deg)`);
      else if (f.id === 'warm')    parts.push(`brightness(${1+0.05*pct}) sepia(${0.3*pct}) saturate(${1+0.2*pct}) contrast(${1-0.05*pct})`);
      else if (f.id === 'silver')  parts.push(`grayscale(${0.5*pct}) contrast(${1+0.1*pct}) brightness(${1+0.05*pct}) saturate(${1-0.4*pct})`);
      else parts.push(f.css);
    }
    // Apply manual adjustments
    if (adj.brightness) parts.push(`brightness(${1 + adj.brightness/100})`);
    if (adj.contrast)   parts.push(`contrast(${1 + adj.contrast/100})`);
    if (adj.saturation) parts.push(`saturate(${1 + adj.saturation/100})`);
    if (adj.warmth)     parts.push(`sepia(${Math.max(0, adj.warmth)/200})`);
    if (adj.sharpen)    parts.push(`contrast(${1 + adj.sharpen/500})`);
    if (adj.blur)       parts.push(`blur(${adj.blur/10}px)`);
    return parts.join(' ') || 'none';
  };

  // Slider drag handling
  const handleSliderStart = (e: React.TouchEvent|React.MouseEvent) => {
    setDragging(true);
    const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
    setDragStart(x);
  };
  const handleSliderMove = (e: React.TouchEvent|React.MouseEvent) => {
    if (!dragging || !activeTool) return;
    const x = 'touches' in e ? e.touches[0].clientX : (e as any).clientX;
    const delta = Math.round((x - dragStart) / 3);
    if (delta === 0) return;
    setDragStart(x);
    const tool = EDIT_TOOLS.find(t=>t.id===activeTool);
    if (!tool) return;
    setAdj(prev => {
      const cur = prev[activeTool as keyof typeof prev];
      const next = Math.max(tool.min, Math.min(tool.max, cur + delta));
      return { ...prev, [activeTool]: next };
    });
  };
  const handleSliderEnd = () => setDragging(false);

  const deleteSelected = () => {
    if (isPhoto) {
      setPhotos([]);
      setActivePhoto(0);
    } else if (isVideo) {
      setVideo('');
    } else if (kind === 'audio') {
      setAudio(''); setATitle(''); setAArtist(''); setAGenre('');
    }
    setGalItems([]); setGalSel(new Set());
    setStep('gallery');
  };

  const [editedPhotos,  setEditedPhotos]  = useState<{url:string;filter:string;transform:string}[]>([]);

  const saveEditState = () => {
    // NOTE: EditMediaStep calls perPhotoEdits.current.set and perPhotoTransform.current.set
    // before calling onNext(), so transforms are already saved at that point.
    // Build edited photos list for caption preview (filter + transform)
    const built = photos.map((url,i) => {
      const e = perPhotoEdits.current.get(i);
      const t = perPhotoTransform.current.get(i);
      const f = e ? buildFilter(e.adj, e.filterIdx, e.intensity) : 'none';
      const tr = t && (t.scale !== 1 || t.offset.x !== 0 || t.offset.y !== 0)
        ? `scale(${t.scale}) translate(${t.offset.x / t.scale}px, ${t.offset.y / t.scale}px)`
        : '';
      return { url, filter: f, transform: tr };
    });
    setEditedPhotos(built);
    setStep('caption');
  };

  const loadDrafts = async () => {
    if (!user) return;
    setDraftsLoad(true);
    try { setDrafts(await getDrafts()); }
    catch (e) { console.error(e); }
    finally { setDraftsLoad(false); }
  };

  const saveDraftNow = async (goToStep?: string) => {
    if (!user) return;
    try {
      const d = await saveDraft(user.id, {
        kind, photos, video_url: videoUrl, audio_url: audioUrl,
        text_content: textContent, ratio, text_bg: textBg, text_font: textFont,
        text_align: textAlign, filter_idx: filterIdx, filter_intensity: filterIntensity,
        adjustments, caption, tags, mentions: collabs, location, credits, roles,
        project_type: projectType, audio_title: audioTitle, audio_artist: audioArtist,
        audio_genre: audioGenre, visibility, allow_comments: allowComments,
        allow_sharing: allowSharing, allow_remix: allowRemix, allow_download: allowDownload,
        monetize, step: goToStep || step,
        thumbnail_url: photos[0] || undefined,
      } as any, currentDraftId);
      setDraftId(d.id);
      toast.success('Draft saved');
    } catch (e: any) { toast.error('Could not save draft'); }
  };

  const loadDraftIntoComposer = (draft: PostDraft) => {
    setKind(draft.kind as any);
    setPhotos(draft.photos || []);
    setVideo(draft.video_url || '');
    setAudio(draft.audio_url || '');
    setText(draft.text_content || '');
    setRatio(draft.ratio || '4:5');
    setTextBg(draft.text_bg || 'dark');
    setFont(draft.text_font || 'sans');
    setAlign((draft.text_align || 'center') as any);
    setFilterIdx(draft.filter_idx || 0);
    setFI(draft.filter_intensity || 100);
    setAdj(draft.adjustments || {brightness:0,contrast:0,warmth:0,saturation:0,fade:0,highlights:0,shadows:0,vignette:0,sharpen:0,grain:0,blur:0});
    setCaption(draft.caption || '');
    setTags(draft.tags || []);
    setCollabs(draft.mentions || []);
    setLoc(draft.location || '');
    setCredits(draft.credits || []);
    setRoles(draft.roles || []);
    setPType(draft.project_type || '');
    setATitle(draft.audio_title || '');
    setAArtist(draft.audio_artist || '');
    setAGenre(draft.audio_genre || '');
    setVis(draft.visibility as any || 'public');
    setAC(draft.allow_comments ?? true);
    setSh(draft.allow_sharing ?? true);
    setAR(draft.allow_remix ?? false);
    setAD(draft.allow_download ?? false);
    setMon(draft.monetize ?? false);
    setDraftId(draft.id);
    setStep((draft.step as any) || 'gallery');
  };

  const addTag    = ()=>{const t=tagIn.replace(/^#/,'').trim().toLowerCase();if(t&&!tags.includes(t))setTags(p=>[...p,t]);setTagIn('');};
  const addCollab = ()=>{const c=collabIn.replace(/^@/,'').trim();if(c&&!collabs.includes(c))setCollabs(p=>[...p,c]);setCollabIn('');};

  const publish = async()=>{
    if(!user)return;
    setPub(true);
    try{
      // Upload photos to Supabase Storage first
      const uploadMedia = async (urls: string[], folder: string): Promise<string[]> => {
        const uploaded: string[] = [];
        for (const url of urls) {
          if (url.startsWith('blob:') || url.startsWith('data:')) {
            try {
              const res  = await fetch(url);
              const blob = await res.blob();
              const ext  = blob.type.split('/')[1]?.replace('jpeg','jpg') || 'jpg';
              const path = `${folder}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2,7)}.${ext}`;
              const { data, error } = await supabase.storage
                .from('posts')
                .upload(path, blob, { upsert: false, contentType: blob.type });
              if (error) { console.error('Upload error:', error); uploaded.push(url); continue; }
              const { data: urlData } = supabase.storage.from('posts').getPublicUrl(path);
              uploaded.push(urlData.publicUrl);
            } catch(e) { console.error('Upload failed:', e); uploaded.push(url); }
          } else {
            uploaded.push(url); // already a remote URL
          }
        }
        return uploaded;
      };

      const rawImgs = isPhoto ? photos : [];
      const rawVids = isVideo && videoUrl ? [videoUrl] : [];
      console.log('[publish] rawImgs:', rawImgs.length, 'rawVids:', rawVids.length);
      const imgs = rawImgs.length ? await uploadMedia(rawImgs, 'images') : [];
      const vids = rawVids.length ? await uploadMedia(rawVids, 'videos') : [];
      console.log('[publish] uploaded imgs:', imgs, 'vids:', vids);
      const auds  = kind==='audio' && audioUrl ? [audioUrl] : [];

      // UUID validation — skip fake/local IDs like "listing-xxx"
      const isUUID = (v: any): boolean => {
        if (!v) return false;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v));
      };

      // Build extra metadata for the single insert
      const firstListing = selectedListings?.[0] ?? (listingPins?.[0] ? {
        id: listingPins[0].listingId, title: listingPins[0].title,
        price: listingPins[0].price, listingMode: listingPins[0].mode,
        city: listingPins[0].city, images: listingPins[0].image ? [listingPins[0].image] : [],
      } : null);

      const newPost = await postsApi.create(
        caption || textContent || '',  // content
        imgs,                          // images
        vids,                          // videos
        [],                            // gifs
        collabs,                       // taggedUserIds
        allowComments,                 // allowComments
        auds,                          // audios
        [],                            // audioNames
        allowDownload,                 // allowDownload
        undefined,                     // link
        undefined,                     // repostOf
        {
          audioTitle:   selectedMusic?.title   || audioTitle   || undefined,
          audioArtist:  selectedMusic?.artist  || audioArtist  || user?.name || undefined,
          audioId:      selectedMusic?.track_id || undefined,
          audioFileUrl: (selectedMusic as any)?.file_url || undefined,
          snippetStart: selectedMusic?.snippetStart,
          snippetEnd:   selectedMusic?.snippetEnd,
          location:     location || undefined,
          // Non-destructive crop: store transform metadata, keep original file
          cropMeta: isPhoto && perPhotoEdits.current.size > 0
            ? Array.from({ length: photos.length }, (_, i) => {
                const t = perPhotoTransform.current.get(i) ?? { scale: 1, offset: { x: 0, y: 0 } };
                const e = perPhotoEdits.current.get(i);
                return {
                  index:       i,
                  ratio:       ratio,
                  zoom_scale:  t.scale,
                  offset_x:    t.offset.x,
                  offset_y:    t.offset.y,
                  filter_id:   e?.filterIdx ?? 0,
                  filter_intensity: e?.intensity ?? 100,
                  adjustments: e?.adj ?? null,
                };
              })
            : undefined,
          listingId:    firstListing && isUUID(firstListing.id) ? String(firstListing.id) : undefined,
          listingTitle: firstListing?.title,
          listingPrice: firstListing?.pricingPackages?.[0]?.price ?? firstListing?.price,
          listingMode:  firstListing?.listingMode ?? firstListing?.mode,
          listingCity:  firstListing?.city,
          listingImage: firstListing?.images?.[0],
          listingPins:  listingPins?.length ? listingPins : undefined,
          tagPins:      tagPins?.length ? tagPins : undefined,
        }
      );

      if (newPost?.id) {
        const mentionIds = mentionedUsers.map((u:ProfileResult) => u.id).filter(Boolean);
        if (mentionIds.length) attachMentionsToPost(newPost.id, mentionIds).catch(()=>{});
        if (tags.length)       attachHashtagsToPost(newPost.id, tags).catch(()=>{});
        // Save text overlays
        if (textOverlays.length > 0) {
          supabase.from('text_overlays').insert(textOverlays.map(o => ({
            post_id: newPost.id, user_id: user.id,
            text: o.text, x: o.x, y: o.y, font: o.font, size: o.size,
            color: o.color, bg_color: o.bg_color||null, opacity: o.opacity,
            bold: o.bold, italic: o.italic, align: o.align,
            animation: o.animation, rotation: o.rotation, layer_order: o.layer_order,
          }))).catch(() => {});
        }
        // Save text layers
        if (textLayers.length) {
          supabase.from('post_text_layers').insert(
            textLayers.map(l => ({ ...l, post_id: newPost.id }))
          ).then(()=>
            supabase.from('posts').update({ text_layers: textLayers }).eq('id', newPost.id)
          ).catch(()=>{});
        }
        if (selectedMusic) {
          attachAudioToPost(newPost.id, {
            track_id: selectedMusic.track_id, title: selectedMusic.title,
            artist: selectedMusic.artist, artwork_url: selectedMusic.artwork_url,
            snippet_start: selectedMusic.snippetStart, snippet_end: selectedMusic.snippetEnd,
          }).catch(()=>{});
        }
        // Save tagged people — await so data is in DB before closing
        if (tagPins?.length && newPost?.id) {
          try {
            // Update tag_pins jsonb on the post row
            await supabase.from('posts').update({ tag_pins: tagPins }).eq('id', newPost.id);
            // Insert into post_user_tags for each pin that has a userId
            const tagRows = tagPins
              .filter((p:any) => p.userId)
              .map((p:any) => ({ post_id: newPost.id, user_id: p.userId, x: p.x, y: p.y }));
            if (tagRows.length) {
              await supabase.from('post_user_tags').upsert(tagRows, { onConflict: 'post_id,user_id', ignoreDuplicates: true });
            }
          } catch(e) { console.error('tag_pins save:', e); }
        }

        if (firstListing) {
          const listingsToSave = selectedListings?.length ? selectedListings
            : listingPins.map((p:ListingPin)=>({id:p.listingId}));
          (async()=>{ try {
            await supabase.from('post_listings').upsert(
              listingsToSave.filter((l:any)=>isUUID(l.id||l.listingId)).map((l:any)=>({post_id:newPost.id,listing_id:String(l.id||l.listingId)})),
              {onConflict:'post_id,listing_id',ignoreDuplicates:true}
            );
          } catch {} })();
        }
        onPost?.(newPost);
        setPub(false);
        setPublishedPost(newPost);  // Show success screen

        // Notify followers — fire-and-forget, cap at 100 to avoid Supabase overload
        const followers: string[] = (user as any).followers || [];
        if (followers.length > 0 && newPost?.id) {
          const preview = imgs[0] || vids[0] || undefined;
          followers.slice(0, 100).forEach(fid => {
            notifs.push(fid, {
              type:           'new_post' as any,
              fromUserId:     user.id,
              fromUserName:   user.name || user.username || '',
              fromUserAvatar: user.avatar || undefined,
              postId:         newPost.id,
              postContent:    (caption || textContent || '').slice(0, 100) || undefined,
              postImage:      preview,
            });
          });
        }
      } else {
        throw new Error('Post creation failed');
      }
    }catch(e:any){
      console.error('Publish error:', e);
      toast.error(e?.message||'Publish failed');
      setPub(false);
      setStep('caption');
    }
  };

  const _attachLocToPost = async (postId: string) => {
    if (!location) return;
    try {
      const results = await searchLocations(location);
      const match = results.find(r => r.name === location) ?? { name: location, source: 'nominatim' as const };
      await attachLocationToPost(postId, match);
    } catch {}
  };

  // Called after successful publish to attach hashtags to the new post
  const attachTags = async (postId: string) => {
    if (tags.length > 0) { try { await attachHashtagsToPost(postId, tags); } catch {} }
  };

  if(publishing) return (
    <div className="fixed inset-0 z-[60] bg-gray-950 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-3 border-blue-400 border-t-transparent rounded-full animate-spin"/>
      <p className="text-sm font-bold text-white/60">Publishing…</p>
    </div>
  );

  const goBack = ()=>{
    const flow:FlowStep[]=['typeSelect','gallery','edit','caption','advanced','share'];
    const idx=flow.indexOf(step);
    if(idx<=0){onClose();return;}
    setStep(flow[idx-1]);
  };

  const ic="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 bg-white text-gray-900 placeholder-gray-400";

  const STEP_LABELS:Record<FlowStep,string>={
    typeSelect:'New Post',gallery:'Select',edit:'Edit',
    caption:'Caption',advanced:'Advanced',share:'Share',
  };

  return (
    <>
      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles}/>

      {/* Permission intro */}
      {/* ListingTagger — tap photo to place listing pins */}
      {showListingTagger && photos?.[0] && (
        <ListingTagger
          photoUrl={photos[0]}
          pins={listingPins}
          setPins={setListingPins}
          onClose={()=>setShowListingTagger(false)}
        />
      )}

      {/* Post Success Screen */}
      {publishedPost && (
        <PostSuccessScreen
          post={publishedPost}
          onClose={() => { setPublishedPost(null); onClose(); }}
        />
      )}

      {/* SoundTrimSheet — edit audio segment */}
      {showTrimSheet && selectedMusic && (
        <SoundTrimSheet
          sound={{
            id: selectedMusic.track_id ?? 'preview',
            title: selectedMusic.title,
            file_url: (selectedMusic as any).file_url,
            duration_sec: (selectedMusic as any).duration_sec ?? 60,
            snippet_start: selectedMusic.snippetStart,
            snippet_end: selectedMusic.snippetEnd,
          }}
          onClose={() => setShowTrimSheet(false)}
          onSaved={(start, end) => {
            setSelectedMusic(prev => prev ? { ...prev, snippetStart: start, snippetEnd: end } : prev);
            setShowTrimSheet(false);
          }}
        />
      )}

      {/* Collaborator Sheet — opens after post is published or inline */}
      {showCollabSheet && (
        <CollaboratorSheet
          postId={publishedPostId ?? ''}
          onClose={()=>setShowCollabSheet(false)}
        />
      )}

      {/* Listing Browser */}
      {showListingBrowser && (
        <ListingBrowser
          selectedIds={new Set((selectedListings||[]).map((l:any)=>l.id))}
          onToggle={(listing:any)=>{
            setSelectedListings((prev:any[])=>{
              const exists = prev.find((l:any)=>l.id===listing.id);
              return exists ? prev.filter((l:any)=>l.id!==listing.id) : [...prev, listing];
            });
          }}
          onClose={()=>setShowListingBrowser(false)}
        />
      )}

      {/* Audio Post Composer — dedicated flow for standalone audio posts */}
      {showAudioComposer && (
        <AudioPostComposer
          onClose={() => { setShowAudioComposer(false); onClose(); }}
          onPost={p => { setShowAudioComposer(false); onPost?.(p); onClose(); }}
        />
      )}

      {/* Music Browser */}
      {showMusicBrowser && (
        <MusicBrowser
          onClose={()=>setShowMusicBrowser(false)}
          onSelect={({track, snippetStart, snippetEnd, audioVolume, videoVolume, fadeIn, fadeOut})=>{
            setSelectedMusic({
              title: track.title,
              artist: track.artist,
              artwork_url: track.artwork_url,
              track_id: track.id,
              file_url: track.file_url,
              snippetStart,
              snippetEnd,
              audioVolume,
              videoVolume,
              fadeIn,
              fadeOut,
            });
            setShowMusicBrowser(false);
            toast.success(`♫ ${track.title} added`);
          }}
        />
      )}

      {galPerm==='prompt'&&(
        <PermissionIntro
          fileRef={fileRef}
          pendingAccept={pendingAccept.current}
          onGranted={(multiple) => {
            setGalPerm('granted');
            try { localStorage.setItem('fm_gallery_perm', 'granted'); } catch {}
          }}
          onDeny={() => setGalPerm('idle')}
        />
      )}

      <div className="fixed inset-0 z-50 bg-white flex flex-col">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 pt-12 pb-3 border-b border-gray-100 shrink-0">
          <button onClick={goBack} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            {step==='typeSelect' ? <X className="w-5 h-5 text-gray-700"/> : <ChevronLeft className="w-5 h-5 text-gray-700"/>}
          </button>
          <p className="text-sm font-black text-gray-900">{STEP_LABELS[step]}</p>
          {/* Right action */}
          {step==='gallery' && galSel.size>0 && (
            <button onClick={confirmGal} className="text-sm font-black text-blue-600">Next</button>
          )}
          {step==='edit' && (
            <button onClick={saveEditState}
              className="text-sm font-black text-blue-600 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors">
              Next
            </button>
          )}
          {step==='caption' && (
            <button onClick={()=>setStep('advanced')} className="text-sm font-black text-blue-600">Next</button>
          )}
          {step==='advanced' && (
            <button onClick={()=>setStep('share')} className="text-sm font-black text-blue-600">Next</button>
          )}
          {step==='share' && (
            <button onClick={publish} className="text-sm font-black text-blue-600">Share</button>
          )}
          {step==='typeSelect' && <div className="w-8"/>}
          {step==='gallery' && galSel.size===0 && (
            <button onClick={saveDraftNow}
              className="text-xs font-bold text-gray-400 px-2 py-1.5 rounded-xl hover:bg-gray-100">
              Save Draft
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ══ TYPE SELECT ═══════════════════════════════════════════════ */}
          {step==='typeSelect' && (
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-400 text-center pb-1">What are you sharing today?</p>
              {POST_TYPES.map(t=>(
                <button key={t.id}
                  onClick={()=>{
                    setKind(t.id);
                    if(t.id==='audio'){setShowAudioComposer(true);}
                    else if(t.id==='text'){setStep('edit');}
                    else{setStep('gallery'); requestGallery(t.accept);}
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:bg-gray-100 active:scale-[0.98] transition-all text-left">
                  <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 flex items-center justify-center text-3xl shrink-0 shadow-sm">{t.emoji}</div>
                  <div className="flex-1">
                    <p className="text-base font-black text-gray-900">{t.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t.sub}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 shrink-0"/>
                </button>
              ))}
            </div>
          )}

          {/* ══ GALLERY ═══════════════════════════════════════════════════ */}
          {step==='gallery' && (() => {
            const selectedPhoto = photos.length > 0 ? photos[0] : null;
            const selectedVideo = videoUrl || null;
            const hasSelection  = !!(selectedPhoto || selectedVideo);
            const totalSelected = photos.length + (videoUrl ? 1 : 0);
            return (
              <div className="flex flex-col bg-black" style={{minHeight:'calc(100vh - 3.5rem)'}}>

                {/* ── Large preview ── */}
                <GalleryPreview
                  photo={selectedPhoto}
                  video={selectedVideo}
                  ratio={ratio}
                  setRatio={setRatio}
                  originalRatioCss={originalRatioCss}
                  hasSelection={hasSelection}
                  isMediaPost={isMediaPost}
                  photosCount={photos.length}
                  videoUrl={videoUrl}
                  onClear={()=>{ setPhotos([]); setVideo(''); setGalSel(new Set()); }}
                />

                {/* ── Folder dropdown + Select Multiple ── */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-black shrink-0">
                  {/* Folder dropdown */}
                  <div className="relative">
                    <button
                      onClick={()=>setShowTabDrop(v=>!v)}
                      className="flex items-center gap-1.5 py-1 px-2 rounded-xl active:bg-white/10">
                      <p className="text-sm font-black text-white">
                        {GAL_TABS.find(t=>t.id===galTab)?.label || 'Recents'}
                      </p>
                      <svg className="w-4 h-4 text-white/60 transition-transform"
                        style={{transform:showTabDrop?'rotate(180deg)':'rotate(0deg)'}}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7"/>
                      </svg>
                    </button>
                    {showTabDrop && (
                      <div className="absolute top-full left-0 mt-1 bg-gray-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden z-50"
                        style={{minWidth:170,animation:'fadeDown 0.15s ease'}}>
                        <style>{`@keyframes fadeDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>
                        {GAL_TABS.map(tab=>(
                          <button key={tab.id}
                            onClick={()=>{
                              setGalTab(tab.id); setShowTabDrop(false);
                              if(tab.id==='drafts') loadDrafts();
                            }}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/10 text-left transition-colors">
                            <span className="text-sm font-semibold" style={{color:galTab===tab.id?'#51A2FF':'rgba(255,255,255,0.8)'}}>{tab.label}</span>
                            {galTab===tab.id && (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#51A2FF" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7"/>
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right controls */}
                  <div className="flex items-center gap-2">
                    {/* Select Multiple toggle */}
                    {isMediaPost && (
                      <button
                        onClick={()=>{
                          setMultiSelectMode(v=>!v);
                          if(multiSelectMode){ setGalSel(new Set()); setPhotos([]); setVideo(''); }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                        style={multiSelectMode
                          ? {background:'rgba(81,162,255,0.2)',color:'#51A2FF',border:'1px solid rgba(81,162,255,0.4)'}
                          : {background:'rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.7)'}}>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                          <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                        </svg>
                        {multiSelectMode ? `${totalSelected} selected` : 'Select Multiple'}
                      </button>
                    )}
                    {/* Camera */}
                    {kind==='audio'
                      ? <button onClick={()=>requestGallery('audio/*')} className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-semibold text-white/70"><Music className="w-3.5 h-3.5 inline mr-1"/>Audio</button>
                      : <button onClick={()=>toast.info('Camera coming soon')} className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-semibold text-white/70"><Camera className="w-3.5 h-3.5 inline mr-1"/>Camera</button>}
                  </div>
                </div>

                {/* ── Grid ─────────────────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto bg-black">
                  {galTab === 'drafts' ? (
                    <div>
                      {draftsLoading ? (
                        <div className="flex items-center justify-center py-12 gap-2">
                          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
                          <p className="text-sm text-gray-400">Loading drafts…</p>
                        </div>
                      ) : drafts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                            <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>
                            </svg>
                          </div>
                          <p className="text-sm font-semibold text-gray-400">No drafts yet</p>
                          <p className="text-xs text-gray-300">Your unfinished posts will appear here</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-0.5 p-0.5">
                          {drafts.map(draft => {
                            const thumb = draftThumbnail(draft);
                            const age   = draftAge(draft);
                            const emoji = {photo:'📸',video:'🎬',audio:'🎵',text:'✍️',reel:'⚡',story:'⭕'}[draft.kind as string] || '📝';
                            return (
                              <div key={draft.id} className="aspect-square relative overflow-hidden bg-gray-100">
                                {/* Thumbnail */}
                                {thumb
                                  ? <img src={thumb} className="w-full h-full object-cover"/>
                                  : <div className="w-full h-full flex items-center justify-center text-3xl bg-gray-100">{emoji}</div>}

                                {/* Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent"/>

                                {/* Info */}
                                <div className="absolute bottom-1.5 left-1.5 right-1.5">
                                  <p className="text-[9px] text-white/80 font-semibold truncate">{draft.caption?.slice(0,30) || `${emoji} ${draft.kind}`}</p>
                                  <p className="text-[8px] text-white/50">{age}</p>
                                </div>

                                {/* Action buttons */}
                                <div className="absolute top-1.5 right-1.5 flex gap-1">
                                  {/* Continue editing */}
                                  <button
                                    onClick={()=>loadDraftIntoComposer(draft)}
                                    className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shadow-md">
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/>
                                    </svg>
                                  </button>
                                  {/* Delete */}
                                  <button
                                    onClick={async()=>{
                                      await deleteDraft(draft.id);
                                      setDrafts(p=>p.filter(d=>d.id!==draft.id));
                                      toast.success('Draft deleted');
                                    }}
                                    className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                                    <X className="w-3 h-3 text-white"/>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : galItems.length > 0 ? (
                    <GalleryGrid items={galItems} selected={galSel} multiSelect={multiSelectMode} onToggle={toggleGal}/>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                        <Image className="w-8 h-8 text-gray-300"/>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-gray-400">Your library will appear here</p>
                        <p className="text-xs text-gray-300 mt-1">Allow access to get started</p>
                        {galPerm !== 'granted' && (
                          <button onClick={()=>requestGallery('image/*,video/*')}
                            className="mt-4 px-5 py-2.5 rounded-2xl text-sm font-bold text-white"
                            style={{background:'#51A2FF'}}>
                            Allow Gallery Access
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}


          {/* ══ EDIT ══════════════════════════════════════════════════════ */}
          {step==='edit' && (isPhoto||isVideo) && (
            <EditMediaStep
              photos={photos} setPhotos={setPhotos}
              videoUrl={videoUrl} setVideo={setVideo}
              isPhoto={isPhoto} isVideo={isVideo}
              ratio={ratio}
              originalRatioCss={originalRatioCss}
              setRatio={setRatio}
              activePhoto={activePhoto} setActivePhoto={setActivePhoto}
              filterIdx={filterIdx} setFilterIdx={setFilterIdx}
              filterIntensity={filterIntensity} setFI={setFI}
              adjustments={adjustments} setAdj={setAdj}
              activeTool={activeTool} setActiveTool={setActiveTool}
              buildFilter={buildFilter}
              perPhotoEdits={perPhotoEdits}
              perPhotoTransform={perPhotoTransform}
              onNext={saveEditState}
              onBack={goBack}
              selectedMusic={selectedMusic}
              setSelectedMusic={setSelectedMusic}
              onOpenMusicBrowser={()=>setShowMusicBrowser(true)}
              onOpenTrimSheet={()=>setShowTrimSheet(true)}
              caption={caption}
              setCaption={setCaption}
              tags={tags}
              setTags={setTags}
              selectedListings={selectedListings}
              listingPins={listingPins}
              audioTitle={audioTitle}
              location={location}
              publishedPostId={publishedPostId}
              showTextEditor={showTextEditor}
              setShowTextEditor={setShowTextEditor}
              textLayers={textLayers}
              setTextLayers={setTextLayers}
              textOverlays={textOverlays}
              setTextOverlays={setTextOverlays}
              onPushHistory={pushHistory}
              onUndo={undoEdit}
              onRedo={redoEdit}
              canUndo={canUndo}
              canRedo={canRedo}
            />
          )}

          {/* ══ EDIT — Text ═════════════════════════════════════════════════ */}
          {step==='edit' && kind==='text' && (
            <div className="flex flex-col">
              <div className={`flex items-center justify-center p-8 min-h-[260px] ${TEXT_BGS.find(b=>b.id===textBg)?.cls}`}>
                <textarea value={textContent} onChange={e=>setText(e.target.value)} placeholder="Share your thoughts…" rows={5}
                  className={`w-full bg-transparent text-xl font-semibold resize-none outline-none placeholder-current opacity-40 text-${textAlign}`}
                  style={{fontFamily:textFont==='serif'?'Georgia':textFont==='mono'?'monospace':'system-ui'}}/>
              </div>
              <div className="p-4 space-y-3 bg-gray-950">
                <div className="flex gap-2 overflow-x-auto">
                  {TEXT_BGS.map(b=><button key={b.id} onClick={()=>setTextBg(b.id)} className="shrink-0 flex flex-col items-center gap-1">
                    <div className={`w-10 h-10 rounded-xl ${b.cls.split(' ')[0]} border-2 ${textBg===b.id?'border-blue-400':'border-transparent'}`}/>
                    <span className="text-[9px] text-white/40">{b.label}</span>
                  </button>)}
                </div>
                <div className="flex gap-2">
                  {['sans','serif','mono'].map(f=><button key={f} onClick={()=>setFont(f)} className={`flex-1 py-1.5 rounded-xl text-xs font-bold capitalize ${textFont===f?'bg-white text-black':'bg-white/10 text-white/60'}`}>{f}</button>)}
                  <button onClick={()=>setAlign('left')} className={`w-9 h-8 rounded-xl flex items-center justify-center ${textAlign==='left'?'bg-white text-black':'bg-white/10 text-white/60'}`}><AlignLeft className="w-3.5 h-3.5"/></button>
                  <button onClick={()=>setAlign('center')} className={`w-9 h-8 rounded-xl flex items-center justify-center ${textAlign==='center'?'bg-white text-black':'bg-white/10 text-white/60'}`}><AlignCenter className="w-3.5 h-3.5"/></button>
                  <button onClick={()=>setAlign('right')} className={`w-9 h-8 rounded-xl flex items-center justify-center ${textAlign==='right'?'bg-white text-black':'bg-white/10 text-white/60'}`}><AlignRight className="w-3.5 h-3.5"/></button>
                </div>
              </div>
            </div>
          )}

          {/* ══ EDIT — Audio ════════════════════════════════════════════════ */}
          {step==='edit' && kind==='audio' && (
            <div className="p-4 space-y-4">
              <div className="bg-gray-900 p-5 space-y-4 rounded-3xl">
                <div className="flex items-center gap-4">
                  <button onClick={()=>toast.info('Cover coming soon')} className="w-20 h-20 rounded-2xl bg-gray-800 border-2 border-dashed border-gray-700 flex flex-col items-center justify-center gap-1 shrink-0">
                    <Image className="w-6 h-6 text-gray-600"/><span className="text-[9px] text-gray-600">Cover</span>
                  </button>
                  <div className="flex-1 space-y-2">
                    <input value={audioTitle} onChange={e=>setATitle(e.target.value)} placeholder="Track name" className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-600 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500"/>
                    <input value={audioArtist} onChange={e=>setAArtist(e.target.value)} placeholder="Artist credits" className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-600 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500"/>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 h-10 px-1">
                  {[...Array(40)].map((_,i)=><div key={i} className="flex-1 rounded-full bg-blue-500/50" style={{height:`${18+Math.sin(i*.9)*12+i%3*4}%`}}/>)}
                </div>
                <select value={audioGenre} onChange={e=>setAGenre(e.target.value)} className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2 text-sm outline-none">
                  <option value="">Genre</option>
                  {['Cinematic','Music Video','Hip-Hop','Electronic','Jazz','Classical','Podcast'].map(g=><option key={g}>{g}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* ══ CAPTION ═══════════════════════════════════════════════════ */}
          {step==='caption' && (
            <CaptionStep
              photos={photos} editedPhotos={editedPhotos} videoUrl={videoUrl} audioUrl={audioUrl}
              textContent={textContent} textBg={textBg} textAlign={textAlign}
              kind={kind} ratio={ratio} audioTitle={audioTitle} audioArtist={audioArtist}
              caption={caption} setCaption={setCaption}
              tags={tags} setTags={setTags} tagIn={tagIn} setTagIn={setTagIn} addTag={addTag}
              collabs={collabs} setCollabs={setCollabs}
              mentionedUsers={mentionedUsers} setMentionedUsers={setMentionedUsers}
              location={location} setLoc={setLoc}
              credits={credits} setCredits={setCredits}
              selectedMusic={selectedMusic}
              setSelectedMusic={setSelectedMusic}
              onOpenMusicBrowser={()=>setShowMusicBrowser(true)}
              onOpenTrimSheet={()=>setShowTrimSheet(true)}
              selectedListings={selectedListings}
              setSelectedListings={setSelectedListings}
              onOpenListingBrowser={()=>setShowListingBrowser(true)}
              onOpenListingTagger={()=>setShowListingTagger(true)}
              listingPins={listingPins}
              tagPins={tagPins}
              setTagPins={setTagPins}
              isCreatorPlus={isCreatorPlus}
              onOpenCollabSheet={()=>setShowCollabSheet(true)}
              publishedPostId={publishedPostId}
              ic={ic}
              isPhoto={isPhoto} isVideo={isVideo}
            />
          )}

          {/* ══ ADVANCED ══════════════════════════════════════════════════ */}
          {step==='advanced' && (
            <div className="p-4 space-y-4 pb-28">
              {/* Visibility */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4 pt-3 pb-1">Visibility</p>
                {([
                  {id:'public',    icon:<Globe className="w-4 h-4"/>,    label:'Public',     sub:'Anyone on Filmons'},
                  {id:'followers', icon:<Users className="w-4 h-4"/>,    label:'Followers',  sub:'People who follow you'},
                  {id:'private',   icon:<Lock className="w-4 h-4"/>,     label:'Private',    sub:'Only you'},
                ] as {id:Visibility;icon:React.ReactNode;label:string;sub:string}[]).map(opt=>(
                  <button key={opt.id} onClick={()=>setVis(opt.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${visibility===opt.id?'bg-blue-100 text-blue-600':'bg-gray-100 text-gray-400'}`}>{opt.icon}</div>
                    <div className="flex-1"><p className="text-sm font-semibold text-gray-900">{opt.label}</p><p className="text-xs text-gray-400">{opt.sub}</p></div>
                    {visibility===opt.id&&<Check className="w-4 h-4 text-blue-500 shrink-0"/>}
                  </button>
                ))}
              </div>

              {/* Standard settings */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                {[
                  {label:'Turn off comments',  val:!allowComments, set:()=>setAC(p=>!p)},
                  {label:'Hide like count',     val:hideLikes,      set:()=>setHL(p=>!p)},
                  {label:'High quality upload', val:hqUpload,       set:()=>setHQ(p=>!p)},
                ].map(item=>(
                  <div key={item.label} className="flex items-center justify-between px-4 py-3.5">
                    <p className="text-sm font-medium text-gray-800">{item.label}</p>
                    <Toggle on={item.val} onChange={item.set}/>
                  </div>
                ))}
              </div>

              {/* Filmons extras */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4 pt-3 pb-1">Filmons Settings</p>
                {[
                  {label:'Allow remix',    val:allowRemix,    set:()=>setAR(p=>!p)},
                  {label:'Allow download', val:allowDownload,  set:()=>setAD(p=>!p)},
                ].map(item=>(
                  <div key={item.label} className="flex items-center justify-between px-4 py-3.5">
                    <p className="text-sm font-medium text-gray-800">{item.label}</p>
                    <Toggle on={item.val} onChange={item.set}/>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ SHARE ═════════════════════════════════════════════════════ */}
          {step==='share' && (
            <div className="p-4 space-y-4 pb-28">
              {/* Preview card */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 p-3.5">
                  <div className="w-9 h-9 rounded-full bg-gray-200 overflow-hidden shrink-0">{user?.avatar&&<img src={user.avatar} className="w-full h-full object-cover"/>}</div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-bold text-gray-900">{user?.name}</p><p className="text-xs text-gray-400">{location||'Now'}</p></div>
                </div>
                {isPhoto&&photos[0]&&<img src={photos[0]} className="w-full" style={{aspectRatio:ratio.replace(':','/')}} />}
                {isVideo&&videoUrl&&<video src={videoUrl} className="w-full aspect-video bg-black object-contain" muted playsInline preload="metadata"/>}
                {kind==='text'&&<div className={`px-6 py-8 flex items-center justify-center min-h-[120px] ${TEXT_BGS.find(b=>b.id===textBg)?.cls}`}><p className={`text-lg font-semibold text-${textAlign}`}>{textContent}</p></div>}
                {kind==='audio'&&<div className="bg-gray-900 mx-3.5 mb-1 rounded-xl p-3 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center shrink-0"><Music className="w-5 h-5 text-white"/></div><div><p className="text-sm font-bold text-white">{audioTitle||'Audio'}</p><p className="text-xs text-gray-400">{audioArtist}</p></div></div>}
                <div className="px-3.5 py-2.5">
                  {caption&&<p className="text-sm text-gray-900 mb-1">{caption}</p>}
                  {tags.length>0&&<p className="text-xs text-blue-500">{tags.map(t=>`#${t}`).join(' ')}</p>}
                  {credits.filter(c=>c.name).length>0&&<div className="mt-1.5 space-y-0.5">{credits.filter(c=>c.name).map((c,i)=><p key={i} className="text-[11px] text-gray-400">{c.role}: {c.name}</p>)}</div>}
                </div>
                <div className="flex items-center gap-4 px-3.5 py-3 border-t border-gray-50">
                  <Heart className="w-5 h-5 text-gray-400"/><MessageCircle className="w-5 h-5 text-gray-400"/><Share2 className="w-5 h-5 text-gray-400"/>
                  <div className="flex-1"/><Bookmark className="w-5 h-5 text-gray-400"/>
                </div>
              </div>
              <div className="text-xs text-gray-400 text-center">
                {visibility==='public'?'Visible to everyone':'Visible to ' + visibility} · {allowComments?'Comments on':'Comments off'}
              </div>
              <button onClick={publish}
                className="w-full py-4 bg-blue-600 text-white font-black text-sm rounded-2xl hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-900/20">
                Share Now ⚡
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}