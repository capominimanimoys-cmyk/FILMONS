/**
 * Filmons — Copyright Scan Modal
 * Shows during/after audio upload copyright check
 * src/app/components/CopyrightScanModal.tsx
 */
import { useState, useEffect } from 'react';
import { Shield, CheckCircle, XCircle, AlertTriangle, RefreshCw, Upload, Coins } from 'lucide-react';
import { checkCopyright, appealCopyright, calcFpForUses, FP_TIERS, type CopyrightResult } from '../lib/copyrightApi';

interface Props {
  audioBlob:  Blob;
  trackId?:   string;
  trackTitle: string;
  onApproved: () => void;
  onReplace:  () => void;
  onRemove:   () => void;
}

export function CopyrightScanModal({ audioBlob, trackId, trackTitle, onApproved, onReplace, onRemove }: Props) {
  const [phase,   setPhase]   = useState<'scanning' | 'result'>('scanning');
  const [result,  setResult]  = useState<CopyrightResult | null>(null);
  const [appealed,setAppealed]= useState(false);

  useEffect(() => {
    let cancelled = false;
    checkCopyright(audioBlob, trackId).then(r => {
      if (!cancelled) { setResult(r); setPhase('result'); }
    });
    return () => { cancelled = true; };
  }, []);

  const handleAppeal = async () => {
    if (!trackId) return;
    await appealCopyright(trackId, 'Creator owns rights');
    setAppealed(true);
  };

  // ── Scanning ──────────────────────────────────────────────────────────────
  if (phase === 'scanning') {
    return (
      <div className="fixed inset-0 z-[110] bg-gray-950/95 flex flex-col items-center justify-center gap-6 px-8">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-2 border-blue-500/30 flex items-center justify-center">
            <Shield className="w-9 h-9 text-blue-400"/>
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-blue-400 border-t-transparent animate-spin"/>
        </div>
        <div className="text-center">
          <p className="text-base font-black text-white">Scanning Audio</p>
          <p className="text-sm text-white/40 mt-1">Checking copyright fingerprint…</p>
        </div>
        {/* Animated bars */}
        <div className="flex items-center gap-1.5 h-8">
          {[...Array(16)].map((_,i) => (
            <div key={i} className="w-1.5 rounded-full bg-blue-400/60"
              style={{
                height:`${30+Math.sin(i*0.5)*50}%`,
                animation:`scanbar ${0.6+i*0.04}s ease-in-out infinite alternate`,
                animationDelay:`${i*0.05}s`,
              }}/>
          ))}
        </div>
        <style>{`@keyframes scanbar{from{transform:scaleY(0.3);opacity:0.4}to{transform:scaleY(1);opacity:1}}`}</style>
        <p className="text-xs text-white/25 text-center">
          Comparing against 10M+ tracks · Usually takes 5–10 seconds
        </p>
      </div>
    );
  }

  // ── Blocked ───────────────────────────────────────────────────────────────
  if (result?.status === 'blocked') {
    return (
      <div className="fixed inset-0 z-[110] bg-gray-950/95 flex flex-col items-center justify-center gap-5 px-8">
        <div className="w-20 h-20 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
          <XCircle className="w-10 h-10 text-red-400"/>
        </div>
        <div className="text-center">
          <p className="text-base font-black text-white">Copyrighted Sound Detected</p>
          <p className="text-sm text-white/50 mt-1 leading-relaxed">
            This audio cannot be used as original audio.
            {result.match && <><br/><span className="text-white/70 font-semibold">Matched: {result.match}</span></>}
            {result.artist && <> · {result.artist}</>}
          </p>
        </div>
        <div className="w-full space-y-2.5">
          <button onClick={onReplace}
            className="w-full py-3.5 rounded-2xl text-sm font-black text-white"
            style={{background:'#51A2FF'}}>
            Replace Audio
          </button>
          {!appealed ? (
            <button onClick={handleAppeal}
              className="w-full py-3.5 rounded-2xl text-sm font-bold text-white/60 border border-white/15">
              Appeal — I Own the Rights
            </button>
          ) : (
            <div className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 border border-yellow-500/30"
              style={{background:'rgba(234,179,8,0.1)'}}>
              <AlertTriangle className="w-4 h-4 text-yellow-400"/>
              <p className="text-sm font-bold text-yellow-400">Appeal submitted for review</p>
            </div>
          )}
          <button onClick={onRemove}
            className="w-full py-3 text-sm font-semibold text-red-400">
            Remove Audio
          </button>
        </div>
      </div>
    );
  }

  // ── Approved ──────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[110] bg-gray-950/95 flex flex-col items-center justify-center gap-5 px-8">
      <div className="w-20 h-20 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
        <CheckCircle className="w-10 h-10 text-green-400"/>
      </div>
      <div className="text-center">
        <p className="text-base font-black text-white">Original Sound Approved</p>
        <p className="text-sm text-white/50 mt-1">
          Your sound is copyright-safe and can be reused by other creators.
        </p>
      </div>

      {/* FP Rewards preview */}
      <div className="w-full rounded-2xl p-4 space-y-3"
        style={{background:'rgba(255,215,0,0.06)', border:'1px solid rgba(255,215,0,0.2)'}}>
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-yellow-400"/>
          <p className="text-xs font-black text-yellow-400 uppercase tracking-widest">Earn FP Coins</p>
        </div>
        <p className="text-xs text-white/50">You earn FP every time another creator uses your sound:</p>
        <div className="space-y-2">
          {FP_TIERS.map(tier => (
            <div key={tier.uses} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400"/>
                <p className="text-xs text-white/60">{tier.uses.toLocaleString()} uses</p>
              </div>
              <p className="text-xs font-black text-yellow-400">+{tier.fp.toLocaleString()} FP{tier.uses === 10000 ? ' + 🔥 Trending' : ''}</p>
            </div>
          ))}
        </div>
      </div>

      <button onClick={onApproved}
        className="w-full py-4 rounded-2xl text-sm font-black text-white"
        style={{background:'linear-gradient(135deg,#22c55e,#16a34a)', boxShadow:'0 4px 20px rgba(34,197,94,0.3)'}}>
        Use This Sound ✓
      </button>
    </div>
  );
}