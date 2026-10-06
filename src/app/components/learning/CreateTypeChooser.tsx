// "What would you like to create?" -- shown when an instructor taps Create
// course. Modal on desktop, bottom sheet on mobile.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Radio, X } from 'lucide-react';
import { BottomSheet } from '../BottomSheet';
import { useIsMobile } from '../ui/use-mobile';

const OPTIONS = [
  { id: 'online', icon: BookOpen, title: 'Online courses', body: 'Upload recorded lessons that students can complete at their own pace.', cta: 'Create online course' },
  { id: 'live', icon: Radio, title: 'Live sessions', body: 'Offer live teaching with a session fee. Students contact you and apply, then you confirm the schedule.', cta: 'Create live session' },
] as const;

export type CreateType = (typeof OPTIONS)[number]['id'];

function Options({ onSelect }: { onSelect: (t: CreateType) => void }) {
  return (
    <div className="space-y-3">
      {OPTIONS.map(o => (
        <div key={o.id} className="rounded-2xl border border-gray-100 bg-white p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><o.icon className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-sm font-black text-gray-900">{o.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{o.body}</p>
            </div>
          </div>
          <button onClick={() => onSelect(o.id)} className="mt-3 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700">{o.cta}</button>
        </div>
      ))}
    </div>
  );
}

export function CreateTypeChooser({ onClose, onSelect }: { onClose: () => void; onSelect: (t: CreateType) => void }) {
  const isMobile = useIsMobile();
  useEffect(() => {
    if (isMobile) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobile, onClose]);

  if (isMobile) {
    return <BottomSheet title="What would you like to create?" onClose={onClose}><div className="px-4 pb-6"><Options onSelect={onSelect} /></div></BottomSheet>;
  }
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="What would you like to create?" onClick={e => e.stopPropagation()} className="w-full max-w-md rounded-3xl bg-gray-50 p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-base font-black text-gray-900">What would you like to create?</p>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-200"><X className="h-4 w-4 text-gray-600" /></button>
        </div>
        <Options onSelect={onSelect} />
      </div>
    </div>,
    document.body,
  );
}
