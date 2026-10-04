// Form building blocks for the course builder, on FILMONS Learning's light
// palette (white cards, gray-50 page, FILMONS blue for actions/focus).
import { useRef, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, Upload, X } from 'lucide-react';
import type { UploadInfo } from './useCourseBuilder';

export const inputCls =
  'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors';

export function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return <section data-pop id={id} className={`rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div data-pop className="mb-5">
      <h1 className="text-xl sm:text-2xl font-black tracking-tight text-gray-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
    </div>
  );
}

export function Field({ label, hint, optional, error, children, htmlFor, id }: {
  label: string; hint?: string; optional?: boolean; error?: string | null; children: ReactNode; htmlFor?: string; id?: string;
}) {
  return (
    <div id={id} className="space-y-1.5 scroll-mt-28">
      <label htmlFor={htmlFor} className="flex items-baseline gap-2 text-sm font-bold text-gray-900">
        {label}
        {optional && <span className="text-xs font-semibold text-gray-400">Optional</span>}
      </label>
      {children}
      {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : hint ? <p className="text-xs text-gray-400">{hint}</p> : null}
    </div>
  );
}

export function CharCount({ value, max }: { value: string; max: number }) {
  return <span className={`text-[11px] ${value.length > max ? 'text-red-600 font-bold' : 'text-gray-400'}`}>{value.length}/{max}</span>;
}

export function Toggle({ checked, onChange, label, description, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}>
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow" style={{ left: checked ? 18 : 2, transition: 'left 150ms ease' }} />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-gray-900">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{description}</span>}
      </span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: {
  value: T | ''; options: { id: T; label: string }[]; onChange: (v: T) => void; ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1">
      {options.map(o => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
          className={`rounded-lg px-3.5 py-1.5 text-sm font-bold transition-colors ${value === o.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Drop zone / file button with progress, processing and failure states. */
export function UploadBox({ accept, label, hint, upload, processing, failedMessage, onFile, onRetry, onCancel, canRetry, compact }: {
  accept: string; label: string; hint?: string;
  upload?: UploadInfo; processing?: boolean; failedMessage?: string | null;
  onFile: (f: File) => void; onRetry?: () => void; onCancel?: () => void; canRetry?: boolean; compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const pick = () => input.current?.click();
  const fileInput = (
    <input ref={input} type="file" accept={accept} className="hidden"
      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
  );

  if (upload?.status === 'uploading') {
    return (
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3.5" aria-live="polite">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <span className="min-w-0 flex-1 truncate">Uploading {upload.fileName}</span>
          <span className="text-xs text-gray-500">{upload.progress}%</span>
          {onCancel && <button type="button" onClick={onCancel} aria-label="Cancel upload" className="rounded-full p-1 hover:bg-white"><X className="h-3.5 w-3.5 text-gray-500" /></button>}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100">
          <div className="h-full rounded-full bg-blue-600" style={{ width: `${upload.progress}%`, transition: 'width 200ms ease' }} />
        </div>
      </div>
    );
  }
  if (processing) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3.5 text-sm font-bold text-amber-800" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin" /> Processing video… checking playback and reading its length
      </div>
    );
  }
  if (upload?.status === 'error' || failedMessage) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-3.5" role="alert">
        <p className="flex items-center gap-2 text-sm font-bold text-red-700"><AlertCircle className="h-4 w-4" /> {upload?.error || failedMessage}</p>
        <p className="mt-0.5 text-xs text-gray-600">Everything else you entered is kept.</p>
        <div className="mt-2.5 flex gap-2">
          {canRetry && onRetry && (
            <button type="button" onClick={onRetry} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-gray-800 border border-gray-200 hover:bg-gray-50">
              <RotateCcw className="h-3.5 w-3.5" /> Retry
            </button>
          )}
          <button type="button" onClick={pick} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-gray-800 border border-gray-200 hover:bg-gray-50">Choose another file</button>
        </div>
        {fileInput}
      </div>
    );
  }
  return (
    <>
      <button type="button" onClick={pick}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-sm font-bold text-gray-600 hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-700 transition-colors ${compact ? 'px-3 py-2.5' : 'flex-col px-4 py-8'}`}>
        <Upload className={compact ? 'h-4 w-4' : 'h-6 w-6 text-gray-400'} />
        <span>{label}</span>
        {hint && !compact && <span className="text-xs font-normal text-gray-400">{hint}</span>}
      </button>
      {fileInput}
    </>
  );
}

export function StatusPill({ state }: { state: 'Incomplete' | 'Processing' | 'Ready' | 'Needs attention' }) {
  const cls = state === 'Ready' ? 'bg-emerald-50 text-emerald-700' : state === 'Processing' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>
      {state === 'Ready' && <CheckCircle2 className="h-3 w-3" />}
      {state === 'Processing' && <Loader2 className="h-3 w-3 animate-spin" />}
      {state}
    </span>
  );
}

/** Small modal used for confirmations (delete content, leave, publish). */
export function ConfirmDialog({ title, body, confirmLabel, destructive, onConfirm, onCancel, busy }: {
  title: string; body: ReactNode; confirmLabel: string; destructive?: boolean; onConfirm: () => void; onCancel: () => void; busy?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-5 shadow-2xl" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-black text-gray-900">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-gray-600">{body}</div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy}
            className={`rounded-xl px-4 py-2.5 text-sm font-black text-white disabled:opacity-60 ${destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
