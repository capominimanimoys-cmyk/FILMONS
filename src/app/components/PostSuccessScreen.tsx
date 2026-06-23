/**
 * Filmons — PostSuccessScreen
 * Shown after a post is published — cinematic confirmation + quick actions.
 * src/app/components/PostSuccessScreen.tsx
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  Eye, Share2, Edit2, Zap, Copy, X,
  TrendingUp, MessageCircle, Heart, Bookmark, Music, Tag, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Post } from '../types';

interface Props {
  post:    Post;
  onClose: () => void;
}

export function PostSuccessScreen({ post, onClose }: Props) {
  const navigate  = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const close = () => {
    setVisible(false);
    setTimeout(onClose, 280);
  };

  const copyLink = () => {
    const url = `${window.location.origin}/post/${post.id}`;
    navigator.clipboard.writeText(url).then(()=>toast.success('Link copied!')).catch(()=>toast.error('Copy failed'));
  };

  const hasAudio   = !!(post as any).audioTitle;
  const hasListing = !!(post as any).listingId || !!(post as any).listingPins?.length;
  const hasTagged  = !!(post as any).tagPins?.length;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col"
      style={{
        background: 'linear-gradient(160deg,#0a0a0a 0%,#111827 50%,#0a0a0a 100%)',
        transition: 'opacity 0.28s ease',
        opacity: visible ? 1 : 0,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>

      <style>{`
        @keyframes checkPop  { 0%{transform:scale(0) rotate(-20deg);opacity:0} 60%{transform:scale(1.2) rotate(4deg)} 100%{transform:scale(1) rotate(0);opacity:1} }
        @keyframes ringPulse { 0%{transform:scale(0.8);opacity:0.8} 100%{transform:scale(2.2);opacity:0} }
        @keyframes slideUp   { from{transform:translateY(24px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
      `}</style>

      {/* Close */}
      <button onClick={close}
        className="absolute top-12 right-4 w-9 h-9 rounded-full flex items-center justify-center z-10"
        style={{background:'rgba(255,255,255,0.08)'}}>
        <X className="w-4.5 h-4.5 text-white/60"/>
      </button>

      {/* ── Success animation ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">

        {/* Ring + checkmark */}
        <div className="relative flex items-center justify-center" style={{width:100,height:100}}>
          {/* Pulsing rings */}
          {[0,1,2].map(i=>(
            <div key={i} className="absolute inset-0 rounded-full border border-blue-400/40"
              style={{animation:`ringPulse 2s ease-out ${i*0.4}s infinite`}}/>
          ))}
          {/* Circle */}
          <div className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{background:'linear-gradient(135deg,#3b82f6,#8b5cf6)',boxShadow:'0 0 40px rgba(99,102,241,0.4)',animation:'checkPop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.1s both'}}>
            <svg className="w-9 h-9 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
        </div>

        {/* Title */}
        <div className="text-center" style={{animation:'slideUp 0.4s ease 0.3s both'}}>
          <p className="text-2xl font-black text-white tracking-tight">Post Published</p>
          <p className="text-sm text-white/40 mt-1">Your content is now live on Filmons</p>
        </div>

        {/* Post preview strip */}
        {((post.images?.[0]) || (post.videos?.[0]) || post.content) && (
          <div className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{animation:'slideUp 0.4s ease 0.45s both', border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)'}}>
            {post.images?.[0] && (
              <img src={post.images[0]} className="w-full h-32 object-cover"/>
            )}
            {post.content && (
              <p className="px-4 py-3 text-sm text-white/70 line-clamp-2">{post.content}</p>
            )}
          </div>
        )}

        {/* Bonus cards — audio / listing / tags */}
        {(hasAudio || hasListing || hasTagged) && (
          <div className="flex gap-2 w-full max-w-sm" style={{animation:'slideUp 0.4s ease 0.55s both'}}>
            {hasAudio && (
              <div className="flex-1 rounded-2xl px-3 py-2.5 flex items-center gap-2"
                style={{background:'rgba(99,102,241,0.15)',border:'1px solid rgba(99,102,241,0.25)'}}>
                <Music className="w-4 h-4 text-indigo-400 shrink-0"/>
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Audio</p>
                  <p className="text-[11px] text-white/60 truncate">{(post as any).audioTitle}</p>
                </div>
              </div>
            )}
            {hasListing && (
              <div className="flex-1 rounded-2xl px-3 py-2.5 flex items-center gap-2"
                style={{background:'rgba(81,162,255,0.12)',border:'1px solid rgba(81,162,255,0.25)'}}>
                <Tag className="w-4 h-4 text-blue-400 shrink-0"/>
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Listing</p>
                  <p className="text-[11px] text-white/60 truncate">{(post as any).listingTitle || 'Tagged'}</p>
                </div>
              </div>
            )}
            {hasTagged && (
              <div className="flex-1 rounded-2xl px-3 py-2.5 flex items-center gap-2"
                style={{background:'rgba(168,85,247,0.12)',border:'1px solid rgba(168,85,247,0.25)'}}>
                <Users className="w-4 h-4 text-purple-400 shrink-0"/>
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Tagged</p>
                  <p className="text-[11px] text-white/60">{(post as any).tagPins.length} people</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats placeholder */}
        <div className="w-full max-w-sm grid grid-cols-4 gap-2" style={{animation:'slideUp 0.4s ease 0.6s both'}}>
          {[
            {icon:Eye,          label:'Views',    val:'—'},
            {icon:Heart,        label:'Likes',    val:'0'},
            {icon:MessageCircle,label:'Comments', val:'0'},
            {icon:Bookmark,     label:'Saves',    val:'0'},
          ].map(({icon:Icon,label,val})=>(
            <div key={label} className="flex flex-col items-center gap-1 rounded-2xl py-3"
              style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)'}}>
              <Icon className="w-4 h-4 text-white/30"/>
              <p className="text-sm font-black text-white">{val}</p>
              <p className="text-[10px] text-white/30">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div className="px-4 pb-6 space-y-3" style={{animation:'slideUp 0.4s ease 0.7s both'}}>
        {/* Primary CTAs */}
        <div className="grid grid-cols-2 gap-2.5">
          <button onClick={()=>{close(); navigate(`/post/${post.id}`);}}
            className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black text-white transition-all active:scale-[0.97]"
            style={{background:'#51A2FF',boxShadow:'0 4px 20px rgba(81,162,255,0.35)'}}>
            <Eye className="w-4 h-4"/> View Post
          </button>
          <button onClick={()=>{close(); /* open share sheet */toast.info('Share coming soon');}}
            className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black text-white/80 transition-all active:scale-[0.97]"
            style={{background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.12)'}}>
            <Share2 className="w-4 h-4"/> Share Now
          </button>
        </div>

        {/* Secondary actions */}
        <div className="grid grid-cols-3 gap-2">
          {[
            {icon:TrendingUp, label:'Boost Post',  action:()=>toast.info('Boost coming soon')},
            {icon:Edit2,      label:'Edit Post',   action:()=>{close();navigate(`/post/${post.id}`);}},
            {icon:Copy,       label:'Copy Link',   action:copyLink},
          ].map(({icon:Icon,label,action})=>(
            <button key={label} onClick={action}
              className="flex flex-col items-center gap-1.5 py-3 rounded-2xl text-white/50 text-[11px] font-semibold transition-all active:scale-95"
              style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)'}}>
              <Icon className="w-4 h-4"/>
              {label}
            </button>
          ))}
        </div>

        {/* Create another */}
        <button onClick={close}
          className="w-full py-3 text-sm text-white/30 font-semibold">
          + Create another post
        </button>
      </div>
    </div>
  );
}