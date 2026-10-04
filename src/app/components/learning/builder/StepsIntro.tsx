// Course builder steps 1-3: Course basics, Learning outcomes, Course
// presentation.
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Hash, Plus, Trash2, X } from 'lucide-react';
import { searchHashtagSuggestions } from '../../../lib/hashtagsApi';
import { CATEGORIES, LANGUAGES, LEVELS, MAX_TOPICS, uid, type CourseDoc } from '../../../lib/courseBuilder';
import { Card, CharCount, Field, Segmented, StepHeading, UploadBox, inputCls } from './BuilderUI';
import type { CourseBuilderState } from './useCourseBuilder';

type StepProps = { b: CourseBuilderState; doc: CourseDoc };

const normalizeTopic = (t: string) => t.trim().replace(/^#/, '').toLowerCase().replace(/[^a-z0-9_]/g, '');

// ── 1. Course basics ──────────────────────────────────────────────────────
export function StepBasics({ b, doc }: StepProps) {
  const set = (patch: Partial<CourseDoc['basics']>) => b.setDoc(d => ({ ...d, basics: { ...d.basics, ...patch } }));
  const v = doc.basics;
  const otherLanguage = !!v.language && !LANGUAGES.includes(v.language);
  const [topicInput, setTopicInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const q = normalizeTopic(topicInput);
    if (!q) { setSuggestions([]); return; }
    const t = setTimeout(() => {
      searchHashtagSuggestions(q, 6).then(r => setSuggestions(r.map(s => s.tag).filter(tag => !v.topics.includes(tag)))).catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(t);
  }, [topicInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const addTopic = (raw: string) => {
    const t = normalizeTopic(raw);
    if (!t || v.topics.includes(t) || v.topics.length >= MAX_TOPICS) { setTopicInput(''); return; }
    set({ topics: [...v.topics, t] });
    setTopicInput('');
    setSuggestions([]);
  };

  return (
    <div className="space-y-4">
      <StepHeading title="Course basics" subtitle="The essentials students see first. Category and topics help people find your course in search, recommendations and topic pages." />
      <Card className="space-y-5">
        <Field label="Course title" htmlFor="cb-title" id="field-title">
          <input id="cb-title" value={v.title} maxLength={120} onChange={e => set({ title: e.target.value })} placeholder="e.g. Cinematic Lighting on a Budget" className={inputCls} />
          <div className="flex justify-end"><CharCount value={v.title} max={120} /></div>
        </Field>
        <Field label="Short description" htmlFor="cb-short" hint="One or two sentences shown on course cards." id="field-shortDescription">
          <textarea id="cb-short" value={v.shortDescription} maxLength={240} rows={2} onChange={e => set({ shortDescription: e.target.value })}
            placeholder="What will students be able to do after this course?" className={`${inputCls} resize-none`} />
          <div className="flex justify-end"><CharCount value={v.shortDescription} max={240} /></div>
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Teaching language" htmlFor="cb-lang" id="field-language">
            <select id="cb-lang" value={otherLanguage ? '__other' : v.language} onChange={e => set({ language: e.target.value === '__other' ? ' ' : e.target.value })} className={inputCls}>
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              <option value="__other">Other…</option>
            </select>
            {otherLanguage && <input value={v.language.trim()} onChange={e => set({ language: e.target.value })} placeholder="Language" className={`${inputCls} mt-2`} aria-label="Other language" />}
          </Field>
          <Field label="Category" htmlFor="cb-cat" id="field-category">
            <select id="cb-cat" value={v.category} onChange={e => set({ category: e.target.value })} className={inputCls}>
              <option value="">Choose a category</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Topics" optional hint={`Up to ${MAX_TOPICS}. Press Enter to add.`} htmlFor="cb-topic" id="field-topics">
          <div className="flex flex-wrap gap-1.5">
            {v.topics.map(t => (
              <span key={t} className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                #{t}
                <button type="button" onClick={() => set({ topics: v.topics.filter(x => x !== t) })} aria-label={`Remove ${t}`}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
          <div className="relative">
            <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input id="cb-topic" value={topicInput} disabled={v.topics.length >= MAX_TOPICS}
              onChange={e => setTopicInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTopic(topicInput); } }}
              placeholder={v.topics.length >= MAX_TOPICS ? 'Topic limit reached' : 'e.g. lighting, davinciresolve'} className={`${inputCls} pl-9`} />
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map(s => (
                <button key={s} type="button" onClick={() => addTopic(s)} className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:border-blue-300 hover:text-blue-700">#{s}</button>
              ))}
            </div>
          )}
        </Field>
        <Field label="Level" id="field-level">
          <Segmented ariaLabel="Level" value={v.level} options={LEVELS} onChange={level => set({ level })} />
        </Field>
      </Card>
    </div>
  );
}

// ── 2. Learning outcomes ─────────────────────────────────────────────────
export function StepOutcomes({ b, doc }: StepProps) {
  const o = doc.outcomes;
  const set = (patch: Partial<CourseDoc['outcomes']>) => b.setDoc(d => ({ ...d, outcomes: { ...d.outcomes, ...patch } }));
  const list = o.outcomes;
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    set({ outcomes: next });
  };

  return (
    <div className="space-y-4">
      <StepHeading title="Learning outcomes" subtitle="Set clear expectations so the right students enroll." />
      <Card className="space-y-3" id="field-outcomes">
        <div>
          <p className="text-sm font-bold text-gray-900">What students will learn</p>
          <p className="text-xs text-gray-400">Start each one with an action, e.g. “Light an interview with two lights”.</p>
        </div>
        <ol className="space-y-2">
          {list.map((item, i) => (
            <li key={item.id} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center text-xs font-black text-gray-400">{i + 1}</span>
              <input value={item.text} maxLength={160} aria-label={`Learning outcome ${i + 1}`}
                onChange={e => set({ outcomes: list.map(x => (x.id === item.id ? { ...x, text: e.target.value } : x)) })}
                onKeyDown={e => { if (e.key === 'Enter' && item.text.trim()) { e.preventDefault(); set({ outcomes: [...list, { id: uid(), text: '' }] }); } }}
                placeholder="Students will be able to…" className={inputCls} />
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Move down" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" onClick={() => set({ outcomes: list.filter(x => x.id !== item.id) })} aria-label="Remove outcome" className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => set({ outcomes: [...list, { id: uid(), text: '' }] })}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50">
          <Plus className="h-4 w-4" /> Add learning outcome
        </button>
      </Card>
      <Card className="space-y-5">
        <Field label="Who the course is for" htmlFor="cb-aud" optional>
          <textarea id="cb-aud" rows={2} value={o.audience} onChange={e => set({ audience: e.target.value })} placeholder="e.g. Beginner filmmakers who shoot their own projects" className={`${inputCls} resize-none`} />
        </Field>
        <Field label="Prerequisite skills" htmlFor="cb-pre" optional>
          <textarea id="cb-pre" rows={2} value={o.prerequisites} onChange={e => set({ prerequisites: e.target.value })} placeholder="Leave empty if none" className={`${inputCls} resize-none`} />
        </Field>
        <Field label="Required tools, software or gear" htmlFor="cb-tools" optional>
          <textarea id="cb-tools" rows={2} value={o.tools} onChange={e => set({ tools: e.target.value })} placeholder="e.g. Any camera with manual exposure, DaVinci Resolve (free)" className={`${inputCls} resize-none`} />
        </Field>
      </Card>
    </div>
  );
}

// ── 3. Course presentation ───────────────────────────────────────────────
export function StepPresentation({ b, doc }: StepProps) {
  const p = doc.presentation;
  const set = (patch: Partial<CourseDoc['presentation']>) => b.setDoc(d => ({ ...d, presentation: { ...d.presentation, ...patch } }));
  return (
    <div className="space-y-4">
      <StepHeading title="Course presentation" subtitle="Make a strong first impression on your course page." />
      <Card className="space-y-3" id="field-cover">
        <p className="text-sm font-bold text-gray-900">Course cover image</p>
        {p.coverUrl && !b.uploads.cover && (
          <div className="relative overflow-hidden rounded-xl bg-gray-100" style={{ aspectRatio: '16/9' }}>
            <img src={p.coverUrl} alt="Course cover preview" className="h-full w-full object-cover" />
            <button type="button" onClick={() => set({ coverUrl: '' })} className="absolute right-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white">Remove</button>
          </div>
        )}
        <UploadBox accept="image/jpeg,image/png,image/webp" label={p.coverUrl ? 'Replace cover image' : 'Upload a cover image'} hint="16:9, at least 1280×720 · JPG, PNG or WebP"
          upload={b.uploads.cover} onFile={f => b.startUpload('cover', f)} onRetry={() => b.retryUpload('cover')} canRetry={b.canRetry('cover')}
          onCancel={() => b.cancelUpload('cover')} compact={!!p.coverUrl} />
      </Card>
      <Card className="space-y-3" id="field-intro">
        <div>
          <p className="text-sm font-bold text-gray-900">Introduction video <span className="text-xs font-semibold text-gray-400">Optional</span></p>
          <p className="text-xs text-gray-400">A short trailer shown at the top of your course page.</p>
        </div>
        {p.introVideoUrl && p.introVideoStatus === 'ready' && !b.uploads.intro && (
          <div className="space-y-2">
            <video src={p.introVideoUrl} controls playsInline className="w-full rounded-xl bg-black" style={{ aspectRatio: '16/9' }} />
            <button type="button" onClick={() => set({ introVideoUrl: '', introVideoStatus: 'none' })} className="text-xs font-bold text-red-600 hover:underline">Remove introduction video</button>
          </div>
        )}
        <UploadBox accept="video/mp4,video/quicktime,video/webm" label={p.introVideoUrl ? 'Replace introduction video' : 'Upload an introduction video'} hint="MP4 recommended"
          upload={b.uploads.intro} processing={p.introVideoStatus === 'processing'} failedMessage={p.introVideoStatus === 'failed' ? 'The introduction video could not be processed' : null}
          onFile={f => b.startUpload('intro', f)} onRetry={() => b.retryUpload('intro')} canRetry={b.canRetry('intro')} onCancel={() => b.cancelUpload('intro')}
          compact={p.introVideoStatus === 'ready'} />
      </Card>
      <Card id="field-description">
        <Field label="Full course description" htmlFor="cb-desc" hint="Explain what the course covers, how it's taught and what students will create.">
          <textarea id="cb-desc" rows={8} value={p.description} onChange={e => set({ description: e.target.value })} className={inputCls} />
        </Field>
      </Card>
    </div>
  );
}
