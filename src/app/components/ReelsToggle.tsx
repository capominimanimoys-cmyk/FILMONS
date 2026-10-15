// "Show in Reels" for a portfolio item / album, from a three-dot menu. Only public work can appear in Reels.
import { useState } from 'react';
import { Clapperboard } from 'lucide-react';
import { toast } from 'sonner';
import { setShowInReels } from '../lib/portfolioApi';

export function useReelsToggle(kind: 'item' | 'album', id: string, initial: boolean | undefined, visibility: string | undefined,
  /** Called with the new value after it saved, so the caller can keep its copy of the work in sync. */
  onChanged?: (v: boolean) => void) {
  const [on, setOn] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  const isPublic = !visibility || visibility === 'public';
  const toggle = async () => {
    if (busy) return;
    if (!isPublic) { toast.error('Only public work can appear in Reels'); return; }
    const next = !on;
    setBusy(true); setOn(next);
    const ok = await setShowInReels(kind, id, next).catch(() => false);
    setBusy(false);
    if (!ok) { setOn(!next); toast.error("Couldn't update Reels. Try again."); return; }
    onChanged?.(next);
    toast.success(next ? 'Now showing in Reels' : 'Removed from Reels');
  };
  return { on: on && isPublic, busy, toggle, isPublic };
}

/** A menu row with a switch. Stays open so the change is visible. */
export function ReelsToggleRow({ state, className }: { state: ReturnType<typeof useReelsToggle>; className: string }) {
  return (
    <button type="button" onClick={state.toggle} disabled={state.busy} role="switch" aria-checked={state.on}
      className={`${className} justify-between ${state.isPublic ? '' : 'opacity-60'}`}>
      <span className="flex items-center gap-3"><Clapperboard className="w-4 h-4 text-gray-400" /> Show in Reels</span>
      <span className={`relative w-10 h-6 rounded-full transition-colors ${state.on ? 'bg-violet-500' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${state.on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}
