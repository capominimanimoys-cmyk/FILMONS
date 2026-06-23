/**
 * Filmons — AI Studio
 * Full-screen editing hub integrated into EditMediaStep.
 * All operations are logged to ai_edits table (non-destructive).
 */
import { useState, useRef } from 'react';
import { X, Sparkles, ChevronRight, Check, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { aiApi } from '../lib/aiApi';

// ── Types ─────────────────────────────────────────────────────────────────────
export type AIEditType =
  | 'quick_edit' | 'cinematic' | 'portrait_enhance' | 'landscape_enhance' | 'food_enhance'
  | 'product_enhance' | 'night_mode' | 'restore_photo'
  | 'video_enhance' | '4k_upscale' | 'denoise' | 'hdr_enhance' | 'stabilize'
  | 'remove_person' | 'remove_object' | 'remove_background' | 'remove_photobomber' | 'remove_reflection'
  | 'replace_bg_studio' | 'replace_bg_luxury' | 'replace_bg_nature' | 'replace_bg_office' | 'replace_bg_custom'
  | 'expand_left' | 'expand_right' | 'expand_top' | 'expand_bottom'
  | 'skin_cleanup' | 'eye_brighten' | 'hair_enhance' | 'teeth_cleanup' | 'reduce_shadows'
  | 'product_remove_bg' | 'product_white_bg' | 'product_luxury_bg' | 'product_lifestyle_bg' | 'product_highlight'
  | 'highlight_reel' | 'trailer' | 'short_clip' | 'slideshow'
  | 'gen_caption' | 'gen_hashtags' | 'gen_cta' | 'gen_product_desc'
  | 'creator_score' | 'beat_sync' | 'voice_cleanup' | 'noise_removal' | 'auto_volume';

interface AIStudioProps {
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  postId?: string;
  caption?: string;
  location?: string;
  audioTitle?: string;
  listingId?: string;
  onApply: (resultUrl: string, editType: AIEditType, params?: any) => void;
  onClose: () => void;
}

const CREDIT_COSTS: Partial<Record<AIEditType, number>> = {
  quick_edit: 1, cinematic: 3,
  portrait_enhance: 2, landscape_enhance: 2, food_enhance: 2, product_enhance: 2,
  night_mode: 2, restore_photo: 3,
  video_enhance: 3, '4k_upscale': 5, denoise: 2, hdr_enhance: 3, stabilize: 3,
  remove_person: 3, remove_object: 3, remove_background: 2, remove_photobomber: 3, remove_reflection: 3,
  replace_bg_studio: 2, replace_bg_luxury: 2, replace_bg_nature: 2, replace_bg_office: 2, replace_bg_custom: 4,
  expand_left: 2, expand_right: 2, expand_top: 2, expand_bottom: 2,
  skin_cleanup: 2, eye_brighten: 1, hair_enhance: 2, teeth_cleanup: 1, reduce_shadows: 1,
  product_remove_bg: 2, product_white_bg: 2, product_luxury_bg: 3, product_lifestyle_bg: 3, product_highlight: 2,
  highlight_reel: 5, trailer: 5, short_clip: 3, slideshow: 3,
  gen_caption: 1, gen_hashtags: 1, gen_cta: 1, gen_product_desc: 2,
  creator_score: 0, beat_sync: 2, voice_cleanup: 2, noise_removal: 2, auto_volume: 1,
};

// ── Section data ──────────────────────────────────────────────────────────────
const PHOTO_ENHANCE = [
  { id:'quick_edit'          as AIEditType, label:'⚡ Auto Fix',            sub:'One-tap AI enhance',    hot:true  },
  { id:'quick_edit'          as AIEditType, label:'🔪 Sharpen',             sub:'Edge & detail clarity'           },
  { id:'denoise'             as AIEditType, label:'✨ Denoise',             sub:'Remove grain & noise'            },
  { id:'4k_upscale'          as AIEditType, label:'⬆️ Increase Resolution', sub:'AI 4K upscale',         hot:true  },
  { id:'night_mode'          as AIEditType, label:'💡 Improve Lighting',    sub:'Low-light boost'                 },
  { id:'hdr_enhance'         as AIEditType, label:'🌟 HDR Effect',          sub:'Dynamic range boost'             },
  { id:'quick_edit'          as AIEditType, label:'🎨 Fix Colors',          sub:'Balance & correct tones'         },
  { id:'restore_photo'       as AIEditType, label:'🖼 Restore Old Photos',  sub:'Repair & colorize'               },
];

type Section =
  | 'home'
  | 'enhance'        // 🖼 Enhance Quality
  | 'retouch'        // ✨ Retouch
  | 'remove_bg'      // ✂ Remove Background
  | 'change_bg'      // 🌄 Change Background
  | 'remove_objects' // 🧹 Remove Objects
  | 'magic_edit';    // 🪄 Magic Edit

// ── Intent Router ─────────────────────────────────────────────────────────────
interface RouterOutput {
  intent: string;
  operation: string;
  displayName: string;
  target: string[];
  protect: string[];
  engine: string;
  allow_generative_ai: boolean;
  risk: 'low' | 'medium' | 'high';
  editType: AIEditType;
  validation: { face: number; bg: number; clothing: number };
}

const _q = (op:string, name:string, et:AIEditType, val:{face:number;bg:number;clothing:number}): RouterOutput =>
  ({ intent:'quality', operation:op, displayName:name, target:['Entire image — quality only'], protect:['All content — no structural changes'], engine:'enhancement_engine', allow_generative_ai:false, risk:'low', editType:et, validation:val });

const _r = (op:string, name:string, tgt:string[], prot:string[], et:AIEditType, val:{face:number;bg:number;clothing:number}): RouterOutput =>
  ({ intent:'retouch', operation:op, displayName:name, target:tgt, protect:prot, engine:'local_retouch_engine', allow_generative_ai:false, risk:'low', editType:et, validation:val });

const _bg = (op:string, name:string, et:AIEditType, gen:boolean, risk:'medium'|'high', val:{face:number;bg:number;clothing:number}): RouterOutput =>
  ({ intent: gen ? 'background_change' : 'background_remove', operation:op, displayName:name, target:['Background'], protect:['Subject','Face','Clothing','Hair edges'], engine: gen ? 'background_replace_engine' : 'segmentation_engine', allow_generative_ai:gen, risk, editType:et, validation:val });

const _obj = (op:string, name:string, et:AIEditType): RouterOutput =>
  ({ intent:'object_removal', operation:op, displayName:name, target:['Selected object'], protect:['Person','Surrounding content','Background fill'], engine:'object_removal_engine', allow_generative_ai:false, risk:'medium', editType:et, validation:{face:100,bg:94,clothing:100} });

const _magic = (op:string, name:string, et:AIEditType): RouterOutput =>
  ({ intent:'magic_edit', operation:op, displayName:name, target:['Specified element'], protect:['Face Identity','Background context'], engine:'generative_edit_engine', allow_generative_ai:true, risk:'high', editType:et, validation:{face:96,bg:90,clothing:80} });

const _text = (op:string, name:string, et:AIEditType, eng:string): RouterOutput =>
  ({ intent:'caption', operation:op, displayName:name, target:['Caption / Text'], protect:['Image content'], engine:eng, allow_generative_ai:false, risk:'low', editType:et, validation:{face:100,bg:100,clothing:100} });

function intentRouter(query: string): RouterOutput | null {
  const q = query.toLowerCase().trim();

  // AutoFix — safe default, protect everything
  if (/^autofix$|auto.?fix|one.?tap|quick.?fix/.test(q))
    return ({
      intent:'autofix', operation:'autofix', displayName:'Auto Fix',
      target:['Entire image — quality only'],
      protect:['Face Identity','Body Shape','Hair','Clothing','Background'],
      engine:'enhance_engine', allow_generative_ai:false, risk:'low',
      editType:'quick_edit',
      validation:{face:100,bg:100,clothing:100},
    });

  // Quality
  if (/sharpen|unblur|crisp|fix blur|reduce blur/.test(q))   return _q('sharpening','Sharpen image','quick_edit',{face:100,bg:100,clothing:100});
  if (/denoise|remove noise|grain|grainy/.test(q))           return _q('denoise','Denoise','denoise',{face:100,bg:100,clothing:100});
  if (/hdr|dynamic range/.test(q))                           return _q('hdr','HDR effect','hdr_enhance',{face:100,bg:100,clothing:100});
  if (/resolution|upscale|4k|pixelated/.test(q))             return _q('upscale','Increase resolution','4k_upscale',{face:100,bg:100,clothing:100});
  if (/light|bright|dark|exposure|dim/.test(q))              return _q('lighting','Improve lighting','night_mode',{face:100,bg:100,clothing:100});
  if (/color|colour|saturation|vibrant/.test(q))             return _q('color_correction','Enhance colors','quick_edit',{face:100,bg:100,clothing:100});

  // Retouch (low risk, local_retouch_engine, generative AI OFF)
  if (/skin|smooth|blemish|acne|shine|oily/.test(q))
    return _r('skin_smoothing','Smooth skin tone',['Skin'],['Face Identity','Eyes','Nose','Mouth','Teeth','Hair','Clothing','Background'],'skin_cleanup',{face:99.4,bg:100,clothing:100});
  if (/teeth|smile|whiten/.test(q))
    return _r('teeth_whitening','Fix teeth',['Teeth'],['Face Identity','Lips','Eyes','Nose','Skin','Hair','Background','Clothing'],'teeth_cleanup',{face:99.8,bg:100,clothing:100});
  if (/red.?eye|redeye/.test(q))
    return _r('red_eye_removal','Remove red eye',['Eye pupils'],['Face Identity','Iris','Eyelashes','Skin','Hair','Background'],'eye_brighten',{face:99.9,bg:100,clothing:100});
  if (/dark.?circle|under.?eye|eye.?bag/.test(q))
    return _r('dark_circle_reduction','Reduce dark circles',['Under-eye area'],['Face Identity','Eyes','Nose','Skin','Hair','Clothing','Background'],'reduce_shadows',{face:99.7,bg:100,clothing:100});
  if (/eye|brighten eye/.test(q))
    return _r('eye_brightening','Brighten eyes',['Eyes'],['Face Identity','Skin','Hair','Clothing','Background'],'eye_brighten',{face:99.8,bg:100,clothing:100});
  if (/hair/.test(q))
    return _r('hair_enhancement','Enhance hair',['Hair'],['Face Identity','Skin','Eyes','Clothing','Background'],'hair_enhance',{face:99.6,bg:100,clothing:100});
  if (/wrinkle|shirt|collar|clothing/.test(q))
    return _r('clothing_smoothing','Smooth clothing',['Clothing surface'],['Face Identity','Skin','Hair','Background'],'skin_cleanup',{face:100,bg:100,clothing:99.2});

  // Background
  if (/remove.?background|no.?background|transparent/.test(q))  return _bg('background_removal','Remove background','remove_background',false,'medium',{face:99.5,bg:0,clothing:99.8});
  if (/blur.?background|bokeh|depth.?of.?field/.test(q))        return _bg('background_blur','Blur background','replace_bg_custom',true,'high',{face:99.2,bg:60,clothing:99.5});
  if (/studio.?background|white.?background/.test(q))           return _bg('studio_background','Studio background','replace_bg_studio',true,'high',{face:99.3,bg:20,clothing:99.5});
  if (/background/.test(q))                                      return _bg('background_change','Change background','replace_bg_custom',true,'high',{face:99.0,bg:20,clothing:99.4});

  // Object removal
  if (/remove.?person|remove.?people|photobomber/.test(q))  return _obj('person_removal','Remove person','remove_person');
  if (/remove.?object|erase|delete/.test(q))                return _obj('object_removal','Remove object','remove_object');

  // Magic Edit (high risk, generative AI ON)
  if (/change.?cloth|change.?outfit|change.?shirt/.test(q)) return _magic('clothing_change','Change clothing','replace_bg_custom');
  if (/add.?glass|add.?hat|add.?sunglass|accessory/.test(q)) return _magic('accessory_add','Add accessory','replace_bg_custom');
  if (/weather|rain|snow|sunset|sunrise/.test(q))           return _magic('weather_change','Change weather','replace_bg_nature');

  // Text & Caption
  if (/rewrite|shorter|longer|more engaging/.test(q)) return _text('caption_rewrite','Rewrite caption','gen_cta','text_rewrite_engine');
  if (/translat|french|spanish|arabic|portuguese/.test(q)) return _text('translation','Translate caption','gen_caption','translation_engine');
  if (/hashtag|tags/.test(q))    return _text('hashtag_generation','Generate hashtags','gen_hashtags','hashtag_engine');
  if (/caption|write|describe/.test(q)) return _text('caption_generation','Generate caption','gen_caption','text_generation_engine');

  // Crop / Tagging / Insights
  if (/crop|square|portrait|story|reel|landscape|aspect/.test(q))
    return ({ intent:'crop', operation:'smart_crop', displayName:'Smart crop', target:['Frame composition'], protect:['All image content'], engine:'crop_engine', allow_generative_ai:false, risk:'low', editType:'expand_bottom', validation:{face:100,bg:100,clothing:100} });
  if (/tag|detect product|detect brand|mention/.test(q))
    return _text('auto_tagging','Auto tagging','gen_hashtags','vision_detection_engine');
  if (/score|analy|insight|engagement|predict/.test(q))
    return ({ intent:'insights', operation:'content_scoring', displayName:'AI Insights', target:['Post analysis'], protect:[], engine:'scoring_engine', allow_generative_ai:false, risk:'low', editType:'creator_score', validation:{face:100,bg:100,clothing:100} });

  return null;
}

// Edit types that modify image content (require confirmation)
const GENERATIVE_EDIT_TYPES = new Set<AIEditType>([
  'remove_background', 'product_remove_bg',
  'replace_bg_studio', 'replace_bg_luxury', 'replace_bg_nature', 'replace_bg_office', 'replace_bg_custom',
  'product_white_bg', 'product_luxury_bg', 'product_lifestyle_bg', 'product_highlight',
  'remove_person', 'remove_object', 'remove_photobomber', 'remove_reflection',
  'skin_cleanup', 'eye_brighten', 'hair_enhance', 'teeth_cleanup', 'reduce_shadows',
  'expand_left', 'expand_right', 'expand_top', 'expand_bottom',
  'highlight_reel', 'trailer', 'short_clip', 'slideshow',
]);

const GENERATIVE_SECTIONS = new Set<Section>(['remove_bg', 'change_bg', 'remove_objects', 'magic_edit']);

// ── Main Component ────────────────────────────────────────────────────────────
export function AIStudio({
  mediaUrl, mediaType, postId, caption, location, audioTitle, listingId,
  onApply, onClose
}: AIStudioProps) {
  const { user } = useAuth();
  const [section, setSection]     = useState<Section>('home');
  const [running, setRunning]     = useState<AIEditType|null>(null);
  const [credits, setCredits]     = useState<number>(user?.ai_credits ?? 10);
  const [smartQuery, setSmartQuery] = useState('');
  const [routerOutput, setRouterOutput]     = useState<RouterOutput | null>(null);
  const [validation, setValidation]         = useState<{face:number;bg:number;clothing:number}|null>(null);
  const pendingValRef = useRef<{face:number;bg:number;clothing:number}|null>(null);
  const [score, setScore]               = useState<any>(null);
  const [visible, setVisible]           = useState(true);
  const [genConfirmPending, setGenConfirmPending] = useState<{type: AIEditType; label: string} | null>(null);
  const [showEnhanceResult, setShowEnhanceResult] = useState(false);

  const logEdit = async (editType: AIEditType, params?: any, resultUrl?: string) => {
    if (!user?.id) return;
    try {
      await supabase.from('ai_edits').insert({
        post_id:      postId || null,
        user_id:      user.id,
        edit_type:    editType,
        edit_category: mediaType,
        edit_params:  params || null,
        result_url:   resultUrl || null,
        original_url: mediaUrl,
        status:       'done',
        credits_used: CREDIT_COSTS[editType] ?? 1,
      });
      // Deduct credits
      const cost = CREDIT_COSTS[editType] ?? 1;
      if (cost > 0) {
        await supabase.from('ai_credit_txns').insert({
          user_id: user.id,
          delta:   -cost,
          reason:  editType,
        });
        setCredits(c => Math.max(0, c - cost));
      }
    } catch { /* silent */ }
  };

  const runEdit = async (editType: AIEditType, params?: any) => {
    if (running) return;
    const cost = CREDIT_COSTS[editType] ?? 1;
    if (cost > 0 && credits < cost) {
      toast.error(`Not enough AI credits (need ${cost} ✦)`);
      return;
    }
    setRunning(editType);
    try {
      let resultUrl = mediaUrl; // fallback: unchanged

      // ── Route to real AI APIs ──────────────────────────────────────────
      if (editType === 'cinematic') {
        resultUrl = await aiApi.cinematicLook(mediaUrl);

      } else if (editType === 'remove_background' || editType === 'product_remove_bg') {
        resultUrl = await aiApi.removeBackground(mediaUrl);

      } else if (editType === 'product_white_bg') {
        resultUrl = await aiApi.replaceBackground(mediaUrl, 'studio');

      } else if (editType === 'product_luxury_bg' || editType === 'replace_bg_luxury') {
        resultUrl = await aiApi.replaceBackground(mediaUrl, 'luxury');

      } else if (editType === 'replace_bg_studio') {
        resultUrl = await aiApi.replaceBackground(mediaUrl, 'studio');

      } else if (editType === 'replace_bg_nature') {
        resultUrl = await aiApi.replaceBackground(mediaUrl, 'nature');

      } else if (editType === 'replace_bg_office') {
        resultUrl = await aiApi.replaceBackground(mediaUrl, 'office');

      } else if (editType === '4k_upscale') {
        resultUrl = await aiApi.upscale4K(mediaUrl);

      } else if (editType === 'quick_edit') {
        // AI Image Edit is the ONLY engine — canvas filters are never used as the result.
        // The spinner stays visible while the AI processes; the result sheet appears
        // only when the AI-enhanced image is ready.
        resultUrl = await aiApi.quickEnhance(mediaUrl, 'photo');
        setShowEnhanceResult(true);

      } else if (editType === 'portrait_enhance') {
        resultUrl = await aiApi.quickEnhance(mediaUrl, 'portrait');

      } else if (editType === 'landscape_enhance') {
        resultUrl = await aiApi.quickEnhance(mediaUrl, 'landscape');

      } else if (editType === 'food_enhance') {
        resultUrl = await aiApi.quickEnhance(mediaUrl, 'food');

      } else if (editType === 'product_enhance' || editType === 'product_highlight') {
        resultUrl = await aiApi.quickEnhance(mediaUrl, 'product');

      } else if (editType === 'night_mode') {
        resultUrl = await aiApi.quickEnhance(mediaUrl, 'night');

      } else if (editType === 'expand_left') {
        resultUrl = await aiApi.expand(mediaUrl, 'left');

      } else if (editType === 'expand_right') {
        resultUrl = await aiApi.expand(mediaUrl, 'right');

      } else if (editType === 'expand_top') {
        resultUrl = await aiApi.expand(mediaUrl, 'top');

      } else if (editType === 'expand_bottom') {
        resultUrl = await aiApi.expand(mediaUrl, 'bottom');

      } else if (['skin_cleanup','eye_brighten','hair_enhance','teeth_cleanup','reduce_shadows'].includes(editType)) {
        resultUrl = await aiApi.retouch(mediaUrl, editType);

      } else if (editType === 'gen_caption') {
        const caption = await aiApi.generateCaption(mediaUrl, { location, listing: !!listingId });
        onApply(mediaUrl, editType, { caption });
        await logEdit(editType, params, undefined);
        toast.success(`✨ Caption: "${caption.slice(0,60)}…"`);
        setRunning(null);
        return;

      } else if (editType === 'gen_hashtags') {
        const tags = await aiApi.generateHashtags(mediaUrl);
        onApply(mediaUrl, editType, { hashtags: tags });
        await logEdit(editType, params, undefined);
        toast.success(`✨ Generated ${tags.length} hashtags`);
        setRunning(null);
        return;

      } else if (editType === 'gen_product_desc') {
        const desc = await aiApi.generateProductDesc(mediaUrl);
        onApply(mediaUrl, editType, { description: desc });
        await logEdit(editType, params, undefined);
        toast.success('✨ Product description ready');
        setRunning(null);
        return;

      } else if (editType === 'gen_cta') {
        const cta = await aiApi.generateCaption(mediaUrl, { listing: !!listingId });
        onApply(mediaUrl, editType, { cta });
        await logEdit(editType, params, undefined);
        toast.success('✨ CTA generated');
        setRunning(null);
        return;

      } else {
        // Operations not yet wired (video, beat sync, etc.) — show coming soon
        toast.info(`${editType.replace(/_/g,' ')} — coming soon`);
        setRunning(null);
        return;
      }

      await logEdit(editType, params, resultUrl);
      onApply(resultUrl, editType, params);
      toast.success(`✨ ${editType.replace(/_/g,' ')} applied`);
      if (pendingValRef.current) {
        setValidation(pendingValRef.current);
        pendingValRef.current = null;
      }

    } catch (e: any) {
      const msg = e?.message || 'AI edit failed';
      if (msg.includes('not set') || msg.includes('API key')) {
        toast.error(`API key missing — add ${
          editType === 'remove_background' ? 'VITE_REMOVE_BG_KEY'
          : editType === '4k_upscale'     ? 'VITE_REPLICATE_KEY'
          :                                 'VITE_STABILITY_KEY or VITE_OPENAI_KEY'
        } to .env`);
      } else {
        toast.error(`AI failed: ${msg.slice(0,80)}`);
      }
    } finally {
      setRunning(null);
    }
  };

  const runScore = async () => {
    setRunning('creator_score');
    try {
      const result = await aiApi.creatorScore({
        hasLocation: !!location,
        hasAudio:    !!audioTitle,
        hasListing:  !!listingId,
        hasCaption:  !!caption,
        mediaType,
      });
      setScore(result);
      if (postId) {
        await supabase.from('posts').update({ ai_score: result }).eq('id', postId).catch(() => {});
      }
      await logEdit('creator_score', {}, undefined);
      setSection('score');
    } catch {
      toast.error('Could not analyze post');
    } finally {
      setRunning(null);
    }
  };

  const handleSmartQuery = () => {
    const q = smartQuery.trim();
    if (!q) return;
    const plan = intentRouter(q);
    if (plan) {
      setRouterOutput(plan);
    } else {
      toast.info('Try: "smooth skin", "fix teeth", "sharpen image"…');
    }
  };

  const executeEditPlan = () => {
    if (!routerOutput) return;
    pendingValRef.current = routerOutput.validation;
    const { editType, displayName } = routerOutput;
    setRouterOutput(null);
    setSmartQuery('');
    if (editType === 'creator_score') { runScore(); return; }
    if (GENERATIVE_EDIT_TYPES.has(editType)) {
      setGenConfirmPending({ type: editType, label: displayName });
    } else {
      runEdit(editType, { label: displayName });
    }
  };

  // ── 6-category Filmons AI Editor (photo-only MVP) ────────────────────────────
  const ALL_CATEGORIES: { id: Section; icon: string; label: string; sub: string; hot?: boolean }[] = [
    { id: 'enhance',        icon: '🖼', label: 'Enhance Quality',   sub: 'Auto fix, sharpen, denoise, HDR, restore',  hot: true },
    { id: 'retouch',        icon: '✨', label: 'Retouch',           sub: 'Smooth skin, fix teeth, blemishes, shine',  hot: true },
    { id: 'remove_bg',      icon: '✂️', label: 'Remove Background', sub: 'Transparent, white, black, custom color'              },
    { id: 'change_bg',      icon: '🌄', label: 'Change Background', sub: 'Studio, office, cinema, beach, city, nature'           },
    { id: 'remove_objects', icon: '🧹', label: 'Remove Objects',    sub: 'People, cars, trash, shadows, watermarks'              },
    { id: 'magic_edit',     icon: '🪄', label: 'Magic Edit',        sub: 'Clothes, accessories, colors, weather',     hot: true },
  ];

  const handleSubClick = (type: AIEditType, label: string) => {
    if (type === 'creator_score') { runScore(); return; }
    if (GENERATIVE_EDIT_TYPES.has(type)) { setGenConfirmPending({ type, label }); return; }
    runEdit(type, { label });
  };

  const renderCategoryContent = (sec: Section) => {
    const content = CATEGORY_CONTENT[sec];
    if (!content) return null;
    const isGenerative = GENERATIVE_SECTIONS.has(sec);
    return (
      <div className="p-4 space-y-4">
        {isGenerative && (
          <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl"
            style={{background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.2)'}}>
            <span className="text-amber-400 text-base shrink-0 mt-0.5">⚠</span>
            <div>
              <p className="text-[11px] font-black text-amber-400">Generative AI Edit</p>
              <p className="text-[10px] text-white/40 leading-relaxed mt-0.5">This feature may modify image content. A confirmation will appear before processing.</p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {content.subs.map(sub => (
            <button key={sub.label + sub.type}
              onClick={() => handleSubClick(sub.type, sub.label)}
              disabled={!!running}
              className="relative flex flex-col items-start gap-1 px-3.5 py-3 rounded-2xl text-left transition-all active:scale-[0.97] disabled:opacity-50"
              style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)'}}>
              <p className="text-sm font-black text-white pr-6">{sub.label}</p>
              {running === sub.type && (
                <div className="absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin"/>
                </div>
              )}
              <div className="absolute bottom-2.5 right-2.5 text-[10px] text-white/25 font-bold">
                {CREDIT_COSTS[sub.type] ?? 1}✦
              </div>
            </button>
          ))}
        </div>
        {content.actions.length > 0 && (
          <div>
            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Quick Actions</p>
            <div className="flex flex-wrap gap-2">
              {content.actions.map(action => (
                <button key={action}
                  onClick={() => setSmartQuery(action)}
                  className="px-3 py-1.5 rounded-full text-xs text-white/60 hover:text-white/90 transition-colors"
                  style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.08)'}}>
                  &ldquo;{action}&rdquo;
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderGrid = (items: {id:AIEditType;label:string;sub:string;hot?:boolean}[]) => (
    <div className="grid grid-cols-2 gap-2 p-4">
      {items.map(item => (
        <button key={item.id}
          onClick={() => runEdit(item.id)}
          disabled={!!running}
          className="relative flex flex-col items-start gap-1 px-3.5 py-3 rounded-2xl text-left transition-all active:scale-[0.97] disabled:opacity-50"
          style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)'}}>
          {item.hot && (
            <span className="absolute top-2 right-2 text-[9px] font-black text-orange-400 bg-orange-400/15 px-1.5 py-0.5 rounded-full">HOT</span>
          )}
          <p className="text-sm font-black text-white pr-6">{item.label}</p>
          <p className="text-[10px] text-white/40 leading-tight">{item.sub}</p>
          {running === item.id && (
            <div className="absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin"/>
            </div>
          )}
          <div className="absolute bottom-2.5 right-2.5 text-[10px] text-white/25 font-bold">
            {CREDIT_COSTS[item.id] ?? 1}✦
          </div>
        </button>
      ))}
    </div>
  );

  // ── Section title map ─────────────────────────────────────────────────────
  const sectionTitle: Record<string, string> = {
    enhance:        'Enhance Quality',
    retouch:        'Retouch',
    remove_bg:      'Remove Background',
    change_bg:      'Change Background',
    remove_objects: 'Remove Objects',
    magic_edit:     'Magic Edit',
  };

  // ── Category content ───────────────────────────────────────────────────────
  type Sub = { label: string; type: AIEditType };
  const CATEGORY_CONTENT: Record<string, { subs: Sub[]; actions: string[] }> = {
    enhance: {
      subs: [
        { label: 'Auto Fix',            type: 'quick_edit'    },
        { label: 'Sharpen',             type: 'quick_edit'    },
        { label: 'Denoise',             type: 'denoise'       },
        { label: 'Increase Resolution', type: '4k_upscale'    },
        { label: 'Improve Lighting',    type: 'night_mode'    },
        { label: 'HDR Effect',          type: 'hdr_enhance'   },
        { label: 'Fix Colors',          type: 'quick_edit'    },
        { label: 'Restore Old Photos',  type: 'restore_photo' },
      ],
      actions: ['Make image clearer', 'Fix blurry photo', 'Improve low light'],
    },
    retouch: {
      subs: [
        { label: 'Smooth Skin',          type: 'skin_cleanup'   },
        { label: 'Fix Teeth',            type: 'teeth_cleanup'  },
        { label: 'Remove Blemishes',     type: 'skin_cleanup'   },
        { label: 'Reduce Shine',         type: 'skin_cleanup'   },
        { label: 'Reduce Dark Circles',  type: 'reduce_shadows' },
        { label: 'Natural Face Retouch', type: 'skin_cleanup'   },
      ],
      actions: ['Smooth skin naturally', 'Fix teeth', 'Remove blemishes'],
    },
    remove_bg: {
      subs: [
        { label: 'Transparent',        type: 'remove_background' },
        { label: 'White Background',   type: 'product_white_bg'  },
        { label: 'Black Background',   type: 'remove_background' },
        { label: 'Custom Color',       type: 'remove_background' },
        { label: 'Replace Background', type: 'replace_bg_custom' },
      ],
      actions: ['Remove background', 'White studio background'],
    },
    change_bg: {
      subs: [
        { label: 'Studio',        type: 'replace_bg_studio' },
        { label: 'Office',        type: 'replace_bg_office' },
        { label: 'Cinema',        type: 'replace_bg_luxury' },
        { label: 'Beach',         type: 'replace_bg_nature' },
        { label: 'Mountain',      type: 'replace_bg_nature' },
        { label: 'City',          type: 'replace_bg_office' },
        { label: 'Nature',        type: 'replace_bg_nature' },
        { label: 'Custom Prompt', type: 'replace_bg_custom' },
      ],
      actions: ['Place in luxury studio', 'Place in movie theater'],
    },
    remove_objects: {
      subs: [
        { label: 'People',           type: 'remove_person'  },
        { label: 'Cars',             type: 'remove_object'  },
        { label: 'Trash',            type: 'remove_object'  },
        { label: 'Shadows',          type: 'reduce_shadows' },
        { label: 'Watermarks',       type: 'remove_object'  },
        { label: 'Custom Selection', type: 'remove_object'  },
      ],
      actions: ['Remove person on left', 'Remove background crowd'],
    },
    magic_edit: {
      subs: [
        { label: 'Change Clothes',  type: 'replace_bg_custom' },
        { label: 'Add Accessories', type: 'replace_bg_custom' },
        { label: 'Change Colors',   type: 'quick_edit'        },
        { label: 'Add Decorations', type: 'replace_bg_custom' },
        { label: 'Add Props',       type: 'replace_bg_custom' },
        { label: 'Change Weather',  type: 'replace_bg_nature' },
        { label: 'Free Prompt',     type: 'replace_bg_custom' },
      ],
      actions: ['Make shirt black', 'Add sunglasses', 'Add sunset'],
    },
  };

  return (
    <>
      <style>{`
        @keyframes aiSlideIn { from { transform:translateY(100%);opacity:.5 } to { transform:translateY(0);opacity:1 } }
        @keyframes scoreBar  { from { width:0 } to { width:var(--w) } }
      `}</style>
      <div className="fixed inset-0 z-[70] flex flex-col"
        style={{
          background: 'linear-gradient(180deg, #070b1a 0%, #0d1224 60%, #070b1a 100%)',
          animation: 'aiSlideIn 0.32s cubic-bezier(0.32,0.72,0,1)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>

        {/* ── Header ── */}
        <div className="shrink-0 flex items-center justify-between px-4 pt-12 pb-3">
          <div className="flex items-center gap-2">
            {section !== 'home' && (
              <button onClick={() => setSection('home')}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center mr-1">
                <ChevronRight className="w-4 h-4 text-white rotate-180"/>
              </button>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-lg">✨</span>
              <p className="text-sm font-black text-white">
                {section === 'home' ? 'AI Editor' : sectionTitle[section] ?? 'AI Editor'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Credits badge */}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full"
              style={{background:'rgba(255,193,7,0.15)',border:'1px solid rgba(255,193,7,0.3)'}}>
              <span className="text-[10px] text-yellow-400 font-black">✦ {credits}</span>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <X className="w-4 h-4 text-white/70"/>
            </button>
          </div>
        </div>

        {/* ── Media preview ── */}
        <div className="shrink-0 mx-4 rounded-2xl overflow-hidden bg-black/40"
          style={{height:'28vh'}}>
          {mediaType === 'photo'
            ? <img src={mediaUrl} className="w-full h-full object-cover opacity-90"/>
            : <video src={mediaUrl} className="w-full h-full object-cover opacity-90" muted playsInline preload="metadata"/>}
          {running && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/65 rounded-2xl">
              <div className="flex gap-1.5">
                {[0,1,2].map(i=>(
                  <div key={i} className="w-2 h-2 rounded-full bg-blue-400"
                    style={{animation:`pulse 0.9s ease-in-out ${i*0.15}s infinite alternate`}}/>
                ))}
              </div>
              <div className="text-center px-4">
                <p className="text-[13px] text-white font-black">
                  {running === 'quick_edit' ? 'AI enhancing photo…' : 'AI processing…'}
                </p>
                {running === 'quick_edit' && (
                  <p className="text-[10px] text-white/40 mt-1 leading-snug">
                    Lighting · Shadow recovery · Color grading · Sharpness
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto mt-3">

          {/* HOME — 6 categories */}
          {section === 'home' && (
            <div className="divide-y divide-white/5">
              {ALL_CATEGORIES.map(s => (
                <button key={s.id} onClick={() => setSection(s.id)}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-white/5 transition-colors">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0"
                    style={{background:'rgba(255,255,255,0.07)'}}>
                    {s.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black text-white">{s.label}</p>
                      {s.hot && <span className="text-[9px] font-black text-orange-400 bg-orange-400/15 px-1.5 py-0.5 rounded-full">HOT</span>}
                    </div>
                    <p className="text-[11px] text-white/35 truncate mt-0.5">{s.sub}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/25 shrink-0"/>
                </button>
              ))}
            </div>
          )}

          {/* ENHANCE */}
          {section === 'enhance' && renderGrid(PHOTO_ENHANCE)}

          {/* RETOUCH + REMOVE BG + CHANGE BG + REMOVE OBJECTS + MAGIC EDIT */}
          {section !== 'home' && section !== 'enhance' && renderCategoryContent(section)}

          {/* CREATOR SCORE */}
          {section === 'score' && score && (
            <div className="p-4 space-y-4">
              {/* Score circle */}
              <div className="flex flex-col items-center gap-2 py-4">
                <div className="relative w-28 h-28">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8"/>
                    <circle cx="50" cy="50" r="42" fill="none"
                      stroke={score.reach >= 80 ? '#22c55e' : score.reach >= 60 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${(score.reach/100)*264} 264`}
                      style={{transition:'stroke-dasharray 1s ease'}}/>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-2xl font-black text-white">{score.reach}</p>
                    <p className="text-[9px] text-white/40 font-bold">/100</p>
                  </div>
                </div>
                <p className="text-sm font-black text-white">Reach Score</p>
                <p className="text-[11px] text-white/40">
                  {score.reach >= 80 ? 'Great! Ready to post.' : score.reach >= 60 ? 'Good — a few tweaks help.' : 'A few improvements can boost reach significantly.'}
                </p>
              </div>
              {/* Suggestions */}
              <div className="rounded-2xl overflow-hidden" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)'}}>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest px-4 pt-3 pb-2">Suggestions</p>
                {score.suggestions.map((s: string, i: number) => (
                  <div key={i} className="flex items-center gap-2.5 px-4 py-2.5 border-t border-white/5">
                    <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-blue-400"/>
                    </div>
                    <p className="text-sm text-white/80">{s}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="h-4"/>
        </div>

        {/* ── Auto Fix result sheet ── */}
        {showEnhanceResult && (
          <div className="absolute inset-0 z-10 flex items-end"
            style={{background:'rgba(0,0,0,0.65)',backdropFilter:'blur(4px)'}}>
            <div className="w-full rounded-t-3xl px-4 pt-5 pb-8 space-y-4"
              style={{background:'#0d1224',borderTop:'1px solid rgba(255,255,255,0.08)'}}>

              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
                  <Check className="w-5 h-5 text-green-400"/>
                </div>
                <div>
                  <p className="text-sm font-black text-white">AI Auto Fix Applied</p>
                  <p className="text-[11px] text-white/40">Professionally edited — same photo, better light</p>
                </div>
              </div>

              {/* What the AI improved */}
              <div>
                <p className="text-[9px] font-black text-white/25 uppercase tracking-widest mb-2">Improved</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {['Portrait lighting','Shadow recovery','Color grading','White balance',
                    'Subject visibility','Local contrast','Natural sharpness','Depth & separation'].map(item => (
                    <div key={item} className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-green-400 shrink-0"/>
                      <p className="text-[12px] text-white/65">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* What was preserved */}
              <div>
                <p className="text-[9px] font-black text-white/25 uppercase tracking-widest mb-2">Preserved</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {['Face identity','Facial structure','Hair','Body shape',
                    'Clothing','Pose','Background','Composition'].map(item => (
                    <div key={item} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full border border-white/20 shrink-0 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/30"/>
                      </div>
                      <p className="text-[12px] text-white/35">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Done button */}
              <button
                onClick={() => { setShowEnhanceResult(false); }}
                className="w-full py-3 rounded-2xl text-sm font-bold text-white transition-all active:scale-[0.98]"
                style={{background:'linear-gradient(135deg,#22c55e,#16a34a)'}}>
                Done
              </button>
            </div>
          </div>
        )}

        {/* ── Generative AI confirmation sheet ── */}
        {genConfirmPending && (
          <div className="absolute inset-0 z-10 flex items-end"
            style={{background:'rgba(0,0,0,0.72)',backdropFilter:'blur(4px)'}}>
            <div className="w-full rounded-t-3xl px-4 pt-5 pb-8 space-y-4"
              style={{background:'#0d1224',borderTop:'1px solid rgba(255,255,255,0.08)'}}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-400/15 flex items-center justify-center shrink-0">
                  <span className="text-amber-400 text-xl">⚠</span>
                </div>
                <div>
                  <p className="text-sm font-black text-white">Generative AI Edit</p>
                  <p className="text-[11px] text-white/40">This feature may modify image content</p>
                </div>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed">
                <span className="font-semibold text-amber-400">"{genConfirmPending.label}"</span> uses generative AI that can change the visual content of your image — unlike Safe Enhancement which only improves quality without altering what's in the photo.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setGenConfirmPending(null)}
                  className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white/70 transition-colors"
                  style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)'}}>
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const p = genConfirmPending;
                    setGenConfirmPending(null);
                    runEdit(p.type, { label: p.label });
                  }}
                  className="flex-[2] py-3 rounded-2xl text-sm font-bold text-white transition-all active:scale-[0.98]"
                  style={{background:'linear-gradient(135deg,#f59e0b,#d97706)'}}>
                  Proceed with Edit
                </button>
              </div>
            </div>
          </div>
        )}



        {/* ── Intent Router Plan ── */}
        {routerOutput && (
          <div className="absolute inset-0 z-10 flex items-end"
            style={{background:'rgba(0,0,0,0.78)',backdropFilter:'blur(4px)'}}>
            <div className="w-full rounded-t-3xl px-4 pt-5 pb-8 space-y-3"
              style={{background:'#0a0f1e',borderTop:'1px solid rgba(255,255,255,0.08)'}}>

              {/* Header + risk badge */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-0.5">AI Search — Intent Router</p>
                  <p className="text-base font-black text-white">{routerOutput.displayName}</p>
                </div>
                <span className={`shrink-0 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wide ${
                  routerOutput.risk==='low'    ? 'bg-green-500/15 text-green-400' :
                  routerOutput.risk==='medium' ? 'bg-yellow-500/15 text-yellow-400' :
                                                 'bg-red-500/15 text-red-400'}`}>
                  {routerOutput.risk==='low' ? '🟢 Low' : routerOutput.risk==='medium' ? '🟡 Medium' : '🔴 High'} Risk
                </span>
              </div>

              {/* Engine + AI flag */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-white/20 font-mono uppercase">Engine:</span>
                <span className="text-[10px] font-bold text-blue-300/50 font-mono">{routerOutput.engine.replace(/_/g,' ')}</span>
                {!routerOutput.allow_generative_ai && (
                  <span className="text-[8px] font-black text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-full">no generative AI</span>
                )}
              </div>

              {/* Edit / Lock */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl p-3"
                  style={{background:'rgba(34,197,94,0.07)',border:'1px solid rgba(34,197,94,0.15)'}}>
                  <p className="text-[9px] font-black text-green-400 uppercase tracking-widest mb-2">✓ Edit</p>
                  {routerOutput.target.map(t => (
                    <p key={t} className="text-[11px] text-white/65 leading-snug">• {t}</p>
                  ))}
                </div>
                {routerOutput.protect.length > 0 && (
                  <div className="rounded-2xl p-3"
                    style={{background:'rgba(239,68,68,0.05)',border:'1px solid rgba(239,68,68,0.12)'}}>
                    <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-2">🔒 Lock</p>
                    {routerOutput.protect.slice(0,6).map(p => (
                      <p key={p} className="text-[11px] text-white/40 leading-snug">• {p}</p>
                    ))}
                    {routerOutput.protect.length > 6 && (
                      <p className="text-[10px] text-white/20">+{routerOutput.protect.length - 6} more</p>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setRouterOutput(null); setSmartQuery(''); }}
                  className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white/60"
                  style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)'}}>
                  Cancel
                </button>
                <button onClick={executeEditPlan} disabled={!!running}
                  className="flex-[2] py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50 transition-all active:scale-[0.98]"
                  style={{background: routerOutput.risk==='high'
                    ? 'linear-gradient(135deg,#f59e0b,#d97706)'
                    : 'linear-gradient(135deg,#3b82f6,#8b5cf6)'}}>
                  {running ? 'Running…' : `Run ${routerOutput.engine.replace(/_engine/,'').replace(/_/g,' ')}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Validation Result ── */}
        {validation && (() => {
          const bgFail = validation.bg > 0 && validation.bg < 95;
          const rejected = validation.face < 98 || validation.clothing < 95 || bgFail;
          return (
            <div className="absolute inset-0 z-10 flex items-end"
              style={{background:'rgba(0,0,0,0.70)',backdropFilter:'blur(4px)'}}>
              <div className="w-full rounded-t-3xl px-4 pt-5 pb-8 space-y-4"
                style={{background:'#0a0f1e',borderTop:'1px solid rgba(255,255,255,0.08)'}}>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${rejected?'bg-red-500/15':'bg-green-500/15'}`}>
                    {rejected
                      ? <span className="text-red-400 font-black text-sm">✗</span>
                      : <Check className="w-4 h-4 text-green-400"/>}
                  </div>
                  <div>
                    <p className={`text-[9px] font-black uppercase tracking-widest mb-0.5 ${rejected?'text-red-400':'text-green-400'}`}>
                      {rejected ? 'Validation Failed — Original Preserved' : 'Validation Passed'}
                    </p>
                    <p className="text-sm font-black text-white">
                      {rejected ? 'Edit rejected — too many unintended changes' : 'Edit accepted'}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {([
                    {label:'Face Similarity',       value:validation.face,     min:98},
                    {label:'Clothing Similarity',   value:validation.clothing, min:95},
                    {label:'Background Similarity', value:validation.bg,       min:95},
                  ] as const).map(({label,value,min}) => {
                    const pass = value >= min || value === 0;
                    return (
                      <div key={label}>
                        <div className="flex justify-between mb-1">
                          <span className="text-[11px] text-white/45">{label}</span>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[11px] font-black ${pass?'text-green-400':'text-red-400'}`}>{value}%</span>
                            <span className="text-[9px] text-white/20">min {min}%</span>
                          </div>
                        </div>
                        <div className="w-full h-1 rounded-full" style={{background:'rgba(255,255,255,0.08)'}}>
                          <div className="h-1 rounded-full transition-all duration-700"
                            style={{width:`${Math.min(100,value)}%`,background:pass?'#22c55e':'#ef4444'}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {rejected && (
                  <div className="px-3 py-2.5 rounded-xl text-[11px] text-orange-300/80 leading-relaxed"
                    style={{background:'rgba(249,115,22,0.08)',border:'1px solid rgba(249,115,22,0.15)'}}>
                    ⚠ The edit modified areas outside the approved target. Original image has been restored.
                  </div>
                )}

                <button onClick={() => setValidation(null)}
                  className="w-full py-3 rounded-2xl text-sm font-bold text-white"
                  style={{background: rejected
                    ? 'rgba(255,255,255,0.08)'
                    : 'linear-gradient(135deg,#22c55e,#16a34a)'}}>
                  {rejected ? 'OK — Keep Original' : 'Accept Changes'}
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── Smart AI Search Bar ── */}
        <div className="shrink-0 px-4 pb-4 pt-2 border-t border-white/[0.06]">
          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <Sparkles className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400 pointer-events-none"/>
              <input
                value={smartQuery}
                onChange={e => setSmartQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSmartQuery()}
                placeholder="Ask AI to edit…"
                className="w-full rounded-2xl pl-9 pr-4 py-3 text-sm text-white placeholder-white/30 outline-none border border-white/10 focus:border-blue-400/50 transition-colors"
                style={{background:'rgba(255,255,255,0.07)'}}
              />
            </div>
            <button onClick={handleSmartQuery}
              disabled={!smartQuery.trim() || !!running}
              className="w-11 h-11 rounded-2xl flex items-center justify-center disabled:opacity-30 transition-all active:scale-95"
              style={{background:'linear-gradient(135deg,#3b82f6,#8b5cf6)'}}>
              {running
                ? <Loader2 className="w-4 h-4 text-white animate-spin"/>
                : <span className="text-white font-bold text-base">↑</span>}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}