/**
 * Filmons — TextLayerEditor
 * Non-destructive text overlays on media.
 * Layers are stored in post_text_layers table and applied at render time.
 */
import { useState, useRef, type ReactNode } from 'react';
import { X, Plus, Trash2, ChevronLeft, Check, Type } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface TextLayer {
  id:          string;
  layer_index: number;
  text:        string;
  x:           number;   // % from left
  y:           number;   // % from top
  font_family: string;
  font_size:   number;
  font_weight: string;
  color:       string;
  bg_color:    string | null;
  opacity:     number;
  rotation:    number;
  scale:       number;
  align:       'left' | 'center' | 'right';
  animation:   'none' | 'fadeIn' | 'slideUp' | 'bounce' | 'typewriter';
  width:       number;   // % width
}

const FONT_OPTIONS = [
  { id:'system-ui',   label:'Default'   },
  { id:'Georgia',     label:'Serif'     },
  { id:'monospace',   label:'Mono'      },
  { id:'Impact',      label:'Impact'    },
  { id:'cursive',     label:'Cursive'   },
];

const COLOR_PRESETS = [
  '#FFFFFF','#000000','#EF4444','#F97316','#EAB308',
  '#22C55E','#3B82F6','#8B5CF6','#EC4899','#06B6D4',
];

const ANIM_OPTIONS: { id: TextLayer['animation']; label: string; icon: string }[] = [
  { id:'none',       label:'Static',    icon:'–'  },
  { id:'fadeIn',     label:'Fade In',   icon:'◌'  },
  { id:'slideUp',    label:'Slide Up',  icon:'↑'  },
  { id:'bounce',     label:'Bounce',    icon:'⬆'  },
  { id:'typewriter', label:'Typewriter',icon:'|'  },
];

function makeLayer(index: number): TextLayer {
  return {
    id:          crypto.randomUUID(),
    layer_index: index,
    text:        'Tap to edit',
    x:           50,
    y:           50,
    font_family: 'system-ui',
    font_size:   28,
    font_weight: '700',
    color:       '#FFFFFF',
    bg_color:    null,
    opacity:     1,
    rotation:    0,
    scale:       1,
    align:       'center',
    animation:   'none',
    width:       70,
  };
}

// ── Layer renderer (used in PostCard too) ─────────────────────────────────────
export function TextLayerRenderer({ layers, containerRef }: {
  layers: TextLayer[];
  containerRef?: React.RefObject<HTMLDivElement> | null;
}) {
  return (
    <>
      <style>{`
        @keyframes tlFadeIn   { from{opacity:0}to{opacity:1} }
        @keyframes tlSlideUp  { from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)} }
        @keyframes tlBounce   { 0%{transform:translateY(0)}30%{transform:translateY(-8px)}60%{transform:translateY(0)}80%{transform:translateY(-4px)}100%{transform:translateY(0)} }
        @keyframes tlBlink    { 0%,100%{border-right-color:transparent}50%{border-right-color:currentColor} }
      `}</style>
      {[...layers].sort((a,b)=>a.layer_index-b.layer_index).map(layer=>(
        <div key={layer.id}
          style={{
            position:   'absolute',
            left:       `${layer.x}%`,
            top:        `${layer.y}%`,
            transform:  `translate(-50%,-50%) rotate(${layer.rotation}deg) scale(${layer.scale})`,
            width:      `${layer.width}%`,
            textAlign:  layer.align,
            opacity:    layer.opacity,
            pointerEvents: 'none',
            zIndex:     10 + layer.layer_index,
            animation:  layer.animation === 'fadeIn'    ? 'tlFadeIn 0.8s ease forwards'
                      : layer.animation === 'slideUp'   ? 'tlSlideUp 0.6s cubic-bezier(0.22,1,0.36,1) forwards'
                      : layer.animation === 'bounce'    ? 'tlBounce 1.2s ease forwards'
                      : 'none',
          }}>
          <span style={{
            display:        'inline-block',
            fontFamily:     layer.font_family,
            fontSize:       `${layer.font_size}px`,
            fontWeight:     layer.font_weight,
            color:          layer.color,
            background:     layer.bg_color || 'transparent',
            borderRadius:   layer.bg_color ? '6px' : undefined,
            padding:        layer.bg_color ? '3px 10px' : undefined,
            lineHeight:     1.2,
            wordBreak:      'break-word',
            textShadow:     layer.bg_color ? 'none' : '0 1px 4px rgba(0,0,0,0.7)',
            borderRight:    layer.animation === 'typewriter' ? '2px solid currentColor' : undefined,
            animation:      layer.animation === 'typewriter' ? 'tlBlink 0.8s step-end infinite' : undefined,
          }}>
            {layer.text}
          </span>
        </div>
      ))}
    </>
  );
}

// ── Main Editor ───────────────────────────────────────────────────────────────
interface Props {
  mediaUrl:  string;
  postId?:   string;
  initial?:  TextLayer[];
  onSave:    (layers: TextLayer[]) => void;
  onClose:   () => void;
}

export function TextLayerEditor({ mediaUrl, postId, initial = [], onSave, onClose }: Props) {
  const [layers,   setLayers]   = useState<TextLayer[]>(initial.length ? initial : []);
  const [selected, setSelected] = useState<string | null>(null);
  const [view,     setView]     = useState<'list' | 'edit' | 'canvas'>('list');
  const [saving,   setSaving]   = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const selectedLayer = layers.find((l: TextLayer) => l.id === selected) ?? null;

  const update = (id: string, patch: Partial<TextLayer>) => {
    setLayers((prev: TextLayer[]) => prev.map((l: TextLayer) => l.id === id ? { ...l, ...patch } : l));
  };

  const addLayer = () => {
    const layer = makeLayer(layers.length);
    setLayers((prev: TextLayer[]) => [...prev, layer]);
    setSelected(layer.id);
    setView('edit');
  };

  const deleteLayer = (id: string) => {
    setLayers((prev: TextLayer[]) => prev.filter((l: TextLayer) => l.id !== id));
    if (selected === id) { setSelected(null); setView('list'); }
  };

  // ── Drag to reposition on canvas ──────────────────────────────────────────
  const dragging  = useRef<{ id: string; startX: number; startY: number; ox: number; oy: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>, layerId: string) => {
    e.stopPropagation();
    const layer = layers.find((l: TextLayer) => l.id === layerId)!;
    dragging.current = { id: layerId, startX: e.clientX, startY: e.clientY, ox: layer.x, oy: layer.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragging.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragging.current.startX) / rect.width)  * 100;
    const dy = ((e.clientY - dragging.current.startY) / rect.height) * 100;
    update(dragging.current.id, {
      x: Math.max(5, Math.min(95, dragging.current.ox + dx)),
      y: Math.max(5, Math.min(95, dragging.current.oy + dy)),
    });
  };

  const onPointerUp = () => { dragging.current = null; };

  // ── Save to DB ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      if (postId) {
        // Delete old layers
        await supabase.from('post_text_layers').delete().eq('post_id', postId);
        // Insert new layers
        if (layers.length) {
          await supabase.from('post_text_layers').insert(
            layers.map((l: TextLayer) => ({ ...l, post_id: postId }))
          );
        }
        // Update denormalized snapshot + trigger text_search rebuild
        await supabase.from('posts').update({
          text_layers: layers.length ? layers : null,
        }).eq('id', postId);
      }
      onSave(layers);
    } catch (e: any) {
      console.error('Save text layers:', e);
      onSave(layers); // still pass to parent even if DB fails
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes tlEditorIn { from{transform:translateY(100%);opacity:0.5} to{transform:translateY(0);opacity:1} }
        @keyframes tlFadeIn   { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes tlSlideUp  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes tlBounce   { 0%{transform:translateY(0)}30%{transform:translateY(-8px)}60%{transform:translateY(0)}80%{transform:translateY(-4px)}100%{transform:translateY(0)} }
        @keyframes tlBlink    { 0%,100%{border-right-color:transparent}50%{border-right-color:currentColor} }
      `}</style>

      <div className="fixed inset-0 z-[80] flex flex-col bg-black"
        style={{
          animation: 'tlEditorIn 0.32s cubic-bezier(0.32,0.72,0,1)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>

        {/* ── Header ── */}
        <div className="shrink-0 flex items-center justify-between px-4 pt-12 pb-3">
          <div className="flex items-center gap-2">
            {view !== 'list' && (
              <button onClick={() => { setView('list'); setSelected(null); }}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center mr-1">
                <ChevronLeft className="w-4 h-4 text-white"/>
              </button>
            )}
            <Type className="w-4 h-4 text-white/60"/>
            <p className="text-sm font-black text-white">
              {view === 'list'   ? `Text Overlays${layers.length ? ` (${layers.length})` : ''}`
              : view === 'edit'  ? 'Edit Text'
              :                    'Position'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-1.5 rounded-full text-sm font-black text-white disabled:opacity-50"
              style={{background:'#3B82F6'}}>
              {saving ? 'Saving…' : 'Done'}
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <X className="w-4 h-4 text-white/70"/>
            </button>
          </div>
        </div>

        {/* ── Canvas (always visible) ── */}
        <div ref={canvasRef}
          className="shrink-0 mx-4 rounded-2xl overflow-hidden relative bg-black"
          style={{height: view === 'canvas' ? '55vh' : '30vh'}}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={() => { if (view !== 'canvas') setView('canvas'); }}>
          <img src={mediaUrl} className="w-full h-full object-cover opacity-80"/>
          {/* Render all layers */}
          {layers.map((layer: TextLayer) => (
            <div key={layer.id}
              style={{
                position:    'absolute',
                left:        `${layer.x}%`,
                top:         `${layer.y}%`,
                transform:   `translate(-50%,-50%) rotate(${layer.rotation}deg) scale(${layer.scale})`,
                width:       `${layer.width}%`,
                textAlign:   layer.align,
                opacity:     layer.opacity,
                cursor:      view === 'canvas' ? 'move' : 'pointer',
                zIndex:      10 + layer.layer_index,
                outline:     selected === layer.id ? '2px dashed rgba(59,130,246,0.9)' : 'none',
                outlineOffset: '4px',
                borderRadius: '4px',
              }}
              onPointerDown={(e: React.PointerEvent<HTMLElement>) => {
                if (view === 'canvas') onPointerDown(e, layer.id);
                else { setSelected(layer.id); setView('edit'); }
              }}>
              <span style={{
                display:     'inline-block',
                fontFamily:  layer.font_family,
                fontSize:    `${Math.max(12, layer.font_size * (view === 'canvas' ? 1 : 0.8))}px`,
                fontWeight:  layer.font_weight,
                color:       layer.color,
                background:  layer.bg_color || 'transparent',
                borderRadius: layer.bg_color ? '6px' : undefined,
                padding:     layer.bg_color ? '2px 8px' : undefined,
                lineHeight:  1.2,
                wordBreak:   'break-word',
                textShadow:  layer.bg_color ? 'none' : '0 1px 4px rgba(0,0,0,0.8)',
                whiteSpace:  'pre-wrap',
              }}>
                {layer.text}
              </span>
            </div>
          ))}
          {/* Canvas hint */}
          {view === 'canvas' && layers.length > 0 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 rounded-full px-3 py-1">
              <p className="text-[10px] text-white/60 font-semibold">Drag to reposition</p>
            </div>
          )}
          {view !== 'canvas' && (
            <div className="absolute top-3 right-3 bg-black/60 rounded-xl px-2.5 py-1">
              <p className="text-[10px] text-white/50 font-semibold">Tap to position</p>
            </div>
          )}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto mt-3">

          {/* LIST view */}
          {view === 'list' && (
            <div>
              {layers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-2xl">𝐓</div>
                  <p className="text-sm text-white/40 font-semibold">No text layers yet</p>
                  <p className="text-xs text-white/25">Add text to overlay on your media</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {layers.map((layer, idx) => (
                    <div key={layer.id} className="flex items-center gap-3 px-4 py-3.5">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0"
                        style={{background:'rgba(255,255,255,0.07)',color: layer.color}}>
                        {idx + 1}
                      </div>
                      <button className="flex-1 text-left min-w-0"
                        onClick={() => { setSelected(layer.id); setView('edit'); }}>
                        <p className="text-sm font-semibold text-white truncate">{layer.text}</p>
                        <p className="text-[10px] text-white/35">
                          {layer.font_family === 'system-ui' ? 'Default' : layer.font_family} · {layer.font_size}px
                          {layer.animation !== 'none' ? ` · ${layer.animation}` : ''}
                        </p>
                      </button>
                      <button onClick={() => { setSelected(layer.id); setView('canvas'); }}
                        className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-xs text-white/40 shrink-0">
                        ⊹
                      </button>
                      <button onClick={() => deleteLayer(layer.id)}
                        className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                        <Trash2 className="w-3.5 h-3.5 text-red-400"/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* EDIT view */}
          {view === 'edit' && selectedLayer && (
            <div className="px-4 space-y-4 pb-6">
              {/* Text input */}
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Text</p>
                <textarea
                  ref={inputRef}
                  value={selectedLayer.text}
                  onChange={e => update(selectedLayer.id, { text: e.target.value })}
                  autoFocus
                  rows={3}
                  className="w-full bg-white/8 border border-white/15 rounded-2xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-blue-400/60 resize-none text-sm"
                  style={{fontFamily: selectedLayer.font_family}}
                  placeholder="Enter text…"
                />
              </div>

              {/* Font */}
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Font</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {FONT_OPTIONS.map(f => (
                    <button key={f.id}
                      onClick={() => update(selectedLayer.id, { font_family: f.id })}
                      className="shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        fontFamily: f.id,
                        background: selectedLayer.font_family === f.id ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${selectedLayer.font_family === f.id ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.08)'}`,
                        color: selectedLayer.font_family === f.id ? '#93C5FD' : 'rgba(255,255,255,0.6)',
                      }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Size + Weight */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Size</p>
                  <div className="relative h-10 rounded-2xl flex items-center"
                    style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)'}}
                    onPointerDown={e=>{
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      const r = e.currentTarget.getBoundingClientRect();
                      update(selectedLayer.id, { font_size: Math.round(12 + ((e.clientX-r.left)/r.width)*60) });
                    }}
                    onPointerMove={e=>{
                      if(e.buttons!==1) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      update(selectedLayer.id, { font_size: Math.round(12 + ((e.clientX-r.left)/r.width)*60) });
                    }}>
                    <div className="absolute inset-y-0 left-0 rounded-2xl"
                      style={{width:`${((selectedLayer.font_size-12)/60)*100}%`,background:'rgba(59,130,246,0.25)'}}/>
                    <div className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full"
                      style={{left:`calc(${((selectedLayer.font_size-12)/60)*100}% - 10px)`,background:'#3B82F6'}}/>
                    <p className="w-full text-center text-xs font-black text-white/60 pointer-events-none">{selectedLayer.font_size}px</p>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Weight</p>
                  <div className="flex gap-1.5 h-10">
                    {(['400','600','700','900'] as const).map(w => (
                      <button key={w}
                        onClick={() => update(selectedLayer.id, { font_weight: w })}
                        className="flex-1 rounded-xl text-xs transition-all"
                        style={{
                          fontWeight: w,
                          background: selectedLayer.font_weight === w ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)',
                          border: `1px solid ${selectedLayer.font_weight === w ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.08)'}`,
                          color: selectedLayer.font_weight === w ? '#93C5FD' : 'rgba(255,255,255,0.5)',
                        }}>
                        {w === '400' ? 'Reg' : w === '600' ? 'Semi' : w === '700' ? 'Bold' : 'Black'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Color */}
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Color</p>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_PRESETS.map(c => (
                    <button key={c} onClick={() => update(selectedLayer.id, { color: c })}
                      className="w-8 h-8 rounded-full border-2 transition-all"
                      style={{
                        background: c,
                        borderColor: selectedLayer.color === c ? '#3B82F6' : 'rgba(255,255,255,0.15)',
                        transform: selectedLayer.color === c ? 'scale(1.2)' : 'scale(1)',
                      }}/>
                  ))}
                  {/* Custom color picker */}
                  <label className="w-8 h-8 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center cursor-pointer relative">
                    <span className="text-white/40 text-xs">+</span>
                    <input type="color" value={selectedLayer.color}
                      onChange={e => update(selectedLayer.id, { color: e.target.value })}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"/>
                  </label>
                </div>
              </div>

              {/* Background pill */}
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Background Pill</p>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => update(selectedLayer.id, { bg_color: null })}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                    style={{
                      background: !selectedLayer.bg_color ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${!selectedLayer.bg_color ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.08)'}`,
                      color: !selectedLayer.bg_color ? '#93C5FD' : 'rgba(255,255,255,0.5)',
                    }}>
                    None
                  </button>
                  {['rgba(0,0,0,0.6)','rgba(255,255,255,0.9)','rgba(59,130,246,0.85)','rgba(239,68,68,0.85)','rgba(34,197,94,0.85)'].map(bg => (
                    <button key={bg} onClick={() => update(selectedLayer.id, { bg_color: bg })}
                      className="w-8 h-8 rounded-xl border-2 transition-all"
                      style={{
                        background: bg,
                        borderColor: selectedLayer.bg_color === bg ? '#3B82F6' : 'rgba(255,255,255,0.15)',
                      }}/>
                  ))}
                </div>
              </div>

              {/* Opacity */}
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Opacity — {Math.round(selectedLayer.opacity*100)}%</p>
                <div className="relative h-9 rounded-2xl flex items-center"
                  style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)'}}
                  onPointerDown={e=>{
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    const r=e.currentTarget.getBoundingClientRect();
                    update(selectedLayer.id, { opacity: Math.max(0.1,Math.min(1,+(((e.clientX-r.left)/r.width)).toFixed(2))) });
                  }}
                  onPointerMove={e=>{
                    if(e.buttons!==1) return;
                    const r=e.currentTarget.getBoundingClientRect();
                    update(selectedLayer.id, { opacity: Math.max(0.1,Math.min(1,+(((e.clientX-r.left)/r.width)).toFixed(2))) });
                  }}>
                  <div className="absolute inset-y-0 left-0 rounded-2xl" style={{width:`${selectedLayer.opacity*100}%`,background:'rgba(255,255,255,0.15)'}}/>
                  <div className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white" style={{left:`calc(${selectedLayer.opacity*100}% - 10px)`}}/>
                </div>
              </div>

              {/* Rotation */}
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Rotation — {selectedLayer.rotation}°</p>
                <div className="relative h-9 rounded-2xl flex items-center"
                  style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)'}}
                  onPointerDown={e=>{
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    const r=e.currentTarget.getBoundingClientRect();
                    update(selectedLayer.id, { rotation: Math.round(-45+((e.clientX-r.left)/r.width)*90) });
                  }}
                  onPointerMove={e=>{
                    if(e.buttons!==1) return;
                    const r=e.currentTarget.getBoundingClientRect();
                    update(selectedLayer.id, { rotation: Math.round(-45+((e.clientX-r.left)/r.width)*90) });
                  }}>
                  <div className="absolute inset-y-0 left-1/2 w-px bg-white/15"/>
                  <div className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-blue-400"
                    style={{left:`calc(${((selectedLayer.rotation+45)/90)*100}% - 10px)`}}/>
                  <p className="w-full text-center text-[10px] text-white/20 pointer-events-none">← −45° to +45° →</p>
                </div>
              </div>

              {/* Animation */}
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Animation</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {ANIM_OPTIONS.map(a => (
                    <button key={a.id}
                      onClick={() => update(selectedLayer.id, { animation: a.id })}
                      className="shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        background: selectedLayer.animation === a.id ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${selectedLayer.animation === a.id ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.08)'}`,
                        color: selectedLayer.animation === a.id ? '#93C5FD' : 'rgba(255,255,255,0.5)',
                      }}>
                      <span className="text-base">{a.icon}</span>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alignment */}
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Alignment</p>
                <div className="flex gap-2">
                  {(['left','center','right'] as const).map(a => (
                    <button key={a}
                      onClick={() => update(selectedLayer.id, { align: a })}
                      className="flex-1 py-2 rounded-xl text-sm font-black transition-all"
                      style={{
                        background: selectedLayer.align === a ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${selectedLayer.align === a ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.08)'}`,
                        color: selectedLayer.align === a ? '#93C5FD' : 'rgba(255,255,255,0.5)',
                      }}>
                      {a === 'left' ? '⬅' : a === 'center' ? '⬛' : '➡'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Delete */}
              <button onClick={() => deleteLayer(selectedLayer.id)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold text-red-400"
                style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)'}}>
                <Trash2 className="w-4 h-4"/> Delete this layer
              </button>
            </div>
          )}

          {/* CANVAS view — just shows the canvas (rendered above) */}
          {view === 'canvas' && (
            <div className="px-4 pt-2">
              <p className="text-xs text-white/30 text-center mb-3">Drag text to reposition · Tap to select</p>
              {/* Layer selector chips */}
              <div className="flex gap-2 flex-wrap justify-center">
                {layers.map((layer, i) => (
                  <button key={layer.id}
                    onClick={() => setSelected(layer.id)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                    style={{
                      background: selected === layer.id ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${selected === layer.id ? '#3B82F6' : 'rgba(255,255,255,0.1)'}`,
                      color: selected === layer.id ? '#93C5FD' : 'rgba(255,255,255,0.5)',
                    }}>
                    {i+1}. {layer.text.slice(0,20)}{layer.text.length > 20 ? '…' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="h-6"/>
        </div>

        {/* ── Add Layer button ── */}
        {view === 'list' && (
          <div className="shrink-0 px-4 pb-4 pt-2">
            <button onClick={addLayer}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black text-white transition-all active:scale-[0.98]"
              style={{background:'linear-gradient(135deg,#3B82F6,#8B5CF6)',boxShadow:'0 8px 24px rgba(99,102,241,0.3)'}}>
              <Plus className="w-4 h-4"/> Add Text Layer
            </button>
          </div>
        )}
      </div>
    </>
  );
}