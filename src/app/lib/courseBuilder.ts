// FILMONS Learning course builder -- the draft document, its checklist
// rules, server calls and uploads. The draft is one JSON document per
// course, saved through the server (it contains quiz answer keys, which
// the browser must never be able to read for other courses -- see
// supabase/functions/server/learning.tsx). Shapes and the publish rules
// here mirror that file; the server re-checks everything on publish.
import { projectId, publicAnonKey } from '/utils/supabase/info';

// ── Draft document ────────────────────────────────────────────────────────
export type CourseLevel3 = 'beginner' | 'intermediate' | 'advanced';
export type VideoStatus = 'none' | 'uploading' | 'processing' | 'ready' | 'failed';

export interface DocOption { id: string; text: string }
export interface DocQuestion {
  id: string; type: 'multiple_choice' | 'true_false'; prompt: string;
  options: DocOption[]; correctOptionId: string | null; explanation: string;
}
export interface DocResource { id: string; name: string; url: string; fileType: string; isPreview: boolean }
export interface DocVideo {
  kind: 'video'; id: string; title: string; description: string;
  videoUrl: string; videoStatus: VideoStatus; durationSeconds: number; posterUrl: string;
  isPreview: boolean; resources: DocResource[];
  exercise: { enabled: boolean; instructions: string; expectedResult: string };
}
export interface DocQuiz {
  kind: 'quiz'; id: string; title: string; instructions: string; passingScore: number;
  maxAttempts: number | null; required: boolean; isFinal: boolean; questions: DocQuestion[];
}
/** A lesson made with the earlier editor (text/image/pdf/file/link). */
export interface DocLegacy { kind: 'legacy'; id: string; title: string; type: string; content: string; videoUrl: string; durationSeconds: number; isPreview: boolean }
export type DocItem = DocVideo | DocQuiz | DocLegacy;
export interface DocSection { id: string; title: string; description: string; items: DocItem[] }
export interface CourseDoc {
  version: 1;
  basics: { title: string; shortDescription: string; language: string; category: string; topics: string[]; level: CourseLevel3 | '' };
  outcomes: { outcomes: { id: string; text: string }[]; audience: string; prerequisites: string; tools: string };
  presentation: {
    coverUrl: string; // always an image: uploaded, or a frame taken from the cover video
    coverVideoUrl: string; coverVideoStatus: VideoStatus; // optional looping cover video
    introVideoUrl: string; introVideoStatus: VideoStatus; description: string;
  };
  sections: DocSection[];
  certificate: { enabled: boolean };
  pricing: { isFree: boolean | null; price: number; currency: string };
}

export const uid = () => crypto.randomUUID();

export const CATEGORIES = [
  'Filmmaking', 'Cinematography', 'Directing', 'Screenwriting', 'Video Editing', 'Color Grading',
  'Lighting', 'Sound & Music', 'Acting', 'Photography', 'Animation & VFX', 'Content Creation',
  'Production', 'Business of Film', 'Other',
];
export const LANGUAGES = ['English', 'French', 'Spanish', 'Portuguese', 'German', 'Italian', 'Arabic', 'Hindi', 'Mandarin', 'Japanese', 'Korean'];
export const LEVELS: { id: CourseLevel3; label: string }[] = [
  { id: 'beginner', label: 'Beginner' }, { id: 'intermediate', label: 'Intermediate' }, { id: 'advanced', label: 'Advanced' },
];
export const CURRENCIES = ['CAD', 'USD'];
export const MAX_TOPICS = 10;
export const VIDEO_COMPLETE_PERCENT = 90;

export function newSection(n = 1): DocSection {
  return { id: uid(), title: `Section ${n}`, description: '', items: [] };
}
export function newVideo(): DocVideo {
  return {
    kind: 'video', id: uid(), title: '', description: '', videoUrl: '', videoStatus: 'none', durationSeconds: 0, posterUrl: '',
    isPreview: false, resources: [], exercise: { enabled: false, instructions: '', expectedResult: '' },
  };
}
export function newQuestion(type: DocQuestion['type']): DocQuestion {
  return type === 'true_false'
    ? { id: uid(), type, prompt: '', options: [{ id: uid(), text: 'True' }, { id: uid(), text: 'False' }], correctOptionId: null, explanation: '' }
    : { id: uid(), type, prompt: '', options: [{ id: uid(), text: '' }, { id: uid(), text: '' }, { id: uid(), text: '' }], correctOptionId: null, explanation: '' };
}
export function newQuiz(isFinal = false): DocQuiz {
  return { kind: 'quiz', id: uid(), title: isFinal ? 'Final quiz' : '', instructions: '', passingScore: 70, maxAttempts: null, required: true, isFinal, questions: [] };
}
/** Deep copy with fresh ids (so the copy and the original never collide). */
export function duplicateItem(item: DocItem): DocItem {
  const copy = structuredClone(item) as DocItem;
  copy.id = uid();
  if (copy.kind === 'video') copy.resources = copy.resources.map(r => ({ ...r, id: uid() }));
  if (copy.kind === 'quiz') {
    copy.isFinal = false;
    copy.questions = copy.questions.map(q => {
      const map = new Map(q.options.map(o => [o.id, uid()]));
      return { ...q, id: uid(), options: q.options.map(o => ({ ...o, id: map.get(o.id)! })), correctOptionId: q.correctOptionId ? map.get(q.correctOptionId) ?? null : null };
    });
  }
  copy.title = copy.title ? `${copy.title} (copy)` : '';
  return copy;
}

export function courseVideoSeconds(doc: CourseDoc): number {
  return doc.sections.reduce((n, s) => n + s.items.reduce((m, i) => m + (i.kind === 'video' && i.videoStatus === 'ready' ? i.durationSeconds : 0), 0), 0);
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  if (!s) return '0:00';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
export function formatDurationWords(totalSeconds: number): string {
  if (totalSeconds > 0 && totalSeconds < 60) return `${Math.round(totalSeconds)} sec`;
  const m = Math.round(totalSeconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim();
}

export type VideoLessonState = 'Incomplete' | 'Processing' | 'Ready';
export function videoLessonState(v: DocVideo): VideoLessonState {
  if (v.videoStatus === 'uploading' || v.videoStatus === 'processing') return 'Processing';
  if (v.videoStatus === 'ready' && v.title.trim() && (!v.exercise.enabled || v.exercise.instructions.trim())) return 'Ready';
  return 'Incomplete';
}

export function quizProblems(q: DocQuiz): string[] {
  const p: string[] = [];
  if (!q.title.trim()) p.push('Add a quiz title');
  if (!q.questions.length) p.push('Add at least one question');
  if (!(q.passingScore >= 1 && q.passingScore <= 100)) p.push('Passing score must be between 1 and 100%');
  if (q.maxAttempts !== null && !(q.maxAttempts >= 1)) p.push('Allow at least 1 attempt');
  q.questions.forEach((x, n) => {
    if (!x.prompt.trim()) p.push(`Question ${n + 1} has no text`);
    if (x.options.length < 2 || x.options.some(o => !o.text.trim())) p.push(`Question ${n + 1} needs at least two filled-in answers`);
    if (!x.correctOptionId || !x.options.some(o => o.id === x.correctOptionId)) p.push(`Question ${n + 1} has no correct answer`);
  });
  return p;
}

// ── Steps + checklist (mirrors validateDoc on the server) ─────────────────
export const STEPS = [
  'Course basics', 'Learning outcomes', 'Course presentation', 'Build your lessons',
  'Completion and certificate', 'Price and access', 'Preview and review', 'Publish',
] as const;

export interface Problem { step: number; target?: string; message: string }

export function checklist(doc: CourseDoc, opts: { payoutReady: boolean }): Problem[] {
  const p: Problem[] = [];
  const b = doc.basics;
  if (!b.title.trim()) p.push({ step: 1, target: 'title', message: 'Add a course title' });
  if (!b.shortDescription.trim()) p.push({ step: 1, target: 'shortDescription', message: 'Add a short description' });
  if (!b.language.trim()) p.push({ step: 1, target: 'language', message: 'Choose the teaching language' });
  if (!b.category.trim()) p.push({ step: 1, target: 'category', message: 'Choose a category' });
  if (!b.level) p.push({ step: 1, target: 'level', message: 'Choose a level' });
  if (!doc.outcomes.outcomes.some(o => o.text.trim())) p.push({ step: 2, target: 'outcomes', message: 'Add at least one learning outcome' });
  const cover = doc.presentation;
  if (cover.coverVideoUrl && cover.coverVideoStatus !== 'ready') p.push({ step: 3, target: 'cover', message: 'Wait for the cover video to finish processing' });
  else if (!cover.coverUrl && !cover.coverVideoUrl) p.push({ step: 3, target: 'cover', message: 'Add a course cover image or video' });
  if (!doc.presentation.description.trim()) p.push({ step: 3, target: 'description', message: 'Add the full course description' });
  if (doc.presentation.introVideoUrl && doc.presentation.introVideoStatus !== 'ready') p.push({ step: 3, target: 'intro', message: 'Wait for the introduction video to finish processing' });

  const items = doc.sections.flatMap(s => s.items);
  const videos = items.filter((i): i is DocVideo => i.kind === 'video');
  if (!videos.some(v => v.videoStatus === 'ready' && v.title.trim())) p.push({ step: 4, target: 'lessons', message: 'Add at least one complete video lesson' });
  for (const s of doc.sections) if (!s.title.trim()) p.push({ step: 4, target: `section:${s.id}`, message: 'Every section needs a title' });
  for (const v of videos) {
    const name = `“${v.title || 'Untitled lesson'}”`;
    if (!v.title.trim()) p.push({ step: 4, target: `item:${v.id}`, message: 'A video lesson is missing its title' });
    if (v.videoStatus === 'uploading' || v.videoStatus === 'processing') p.push({ step: 4, target: `item:${v.id}`, message: `${name} is still processing` });
    else if (v.videoStatus !== 'ready') p.push({ step: 4, target: `item:${v.id}`, message: `${name} needs a video` });
    if (v.exercise.enabled && !v.exercise.instructions.trim()) p.push({ step: 4, target: `item:${v.id}`, message: `Add exercise instructions to ${name}` });
    for (const r of v.resources) if (!r.name.trim() || !r.url) p.push({ step: 4, target: `item:${v.id}`, message: `A resource in ${name} needs a name and file` });
  }
  for (const q of items.filter((i): i is DocQuiz => i.kind === 'quiz')) {
    for (const msg of quizProblems(q)) p.push({ step: 4, target: `item:${q.id}`, message: `${q.title ? `“${q.title}”: ` : 'Quiz: '}${msg}` });
  }
  const pr = doc.pricing;
  if (pr.isFree === null) p.push({ step: 6, target: 'pricing', message: 'Choose Free or Paid' });
  else if (!pr.isFree) {
    if (!(pr.price >= 1 && pr.price <= 10000)) p.push({ step: 6, target: 'price', message: 'Set a price between 1 and 10,000' });
    if (!CURRENCIES.includes(pr.currency)) p.push({ step: 6, target: 'currency', message: 'Choose a supported currency' });
    if (!opts.payoutReady) p.push({ step: 6, target: 'payout', message: 'Finish payout setup to publish a paid course' });
  }
  return p;
}

// ── Server calls ──────────────────────────────────────────────────────────
const SERVER = `https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879/learning`;

export class LearningApiError extends Error {
  constructor(message: string, public status: number, public data: any) { super(message); }
}

export async function learningPost<T = any>(path: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SERVER}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LearningApiError('Network error -- check your connection', 0, null);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new LearningApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  return data as T;
}

export async function learningGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${SERVER}${path}`, { headers: { Authorization: `Bearer ${publicAnonKey}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new LearningApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  return data as T;
}

export interface DraftLoad {
  doc: CourseDoc; savedAt: string | null;
  course: { status: 'draft' | 'published' | 'unpublished'; publishedAt: string | null; hasDraftChanges: boolean; ownershipConfirmedAt: string | null };
  payoutReady: boolean; platformFeeBps: number;
}

/** Fills in anything an older draft might be missing, and recovers from an
 *  editor that was closed mid-upload (the file is gone with the tab). */
export function normalizeDoc(raw: any): CourseDoc {
  const r: any = structuredClone(raw ?? {});
  const d = r as CourseDoc;
  d.version = 1;
  d.basics = { title: '', shortDescription: '', language: 'English', category: '', topics: [], level: '', ...r.basics };
  d.outcomes = { outcomes: [], audience: '', prerequisites: '', tools: '', ...r.outcomes };
  d.presentation = { coverUrl: '', coverVideoUrl: '', coverVideoStatus: 'none', introVideoUrl: '', introVideoStatus: 'none', description: '', ...r.presentation };
  if (d.presentation.introVideoStatus === 'uploading') d.presentation.introVideoStatus = d.presentation.introVideoUrl ? 'ready' : 'failed';
  if (d.presentation.introVideoStatus === 'processing') d.presentation.introVideoStatus = d.presentation.introVideoUrl ? 'ready' : 'failed';
  d.sections = ((r.sections ?? []) as any[]).map(s => ({
    ...s, description: s.description ?? '',
    items: ((s.items ?? []) as any[]).map(i => {
      if (i.kind === 'video') {
        const v = { ...newVideo(), ...i, exercise: { ...newVideo().exercise, ...(i.exercise ?? {}) } } as DocVideo;
        // An upload/processing state left over from an interrupted session:
        // if the file made it to storage the video is usable.
        if (v.videoStatus === 'uploading' || v.videoStatus === 'processing') v.videoStatus = v.videoUrl ? 'ready' : 'failed';
        return v;
      }
      return i;
    }),
  }));
  d.certificate = { enabled: false, ...r.certificate };
  d.pricing = { isFree: null, price: 0, currency: 'CAD', ...r.pricing };
  return d;
}

export const builderApi = {
  load: (courseId: string, instructorId: string) =>
    learningPost<DraftLoad>('/draft/load', { courseId, instructorId }).then(r => ({ ...r, doc: normalizeDoc(r.doc) })),
  save: (courseId: string, instructorId: string, doc: CourseDoc) => learningPost<{ savedAt: string }>('/draft/save', { courseId, instructorId, doc }),
  discard: (courseId: string, instructorId: string) => learningPost('/draft/discard', { courseId, instructorId }),
  publish: (courseId: string, instructorId: string) => learningPost<{ ok: true; firstPublish: boolean }>('/publish', { courseId, instructorId, ownershipConfirmed: true }),
  setStatus: (courseId: string, instructorId: string, status: 'published' | 'unpublished') => learningPost('/status', { courseId, instructorId, status }),
  students: (courseId: string, instructorId: string) => learningPost<{ students: CourseStudent[] }>('/students', { courseId, instructorId }),
  earnings: (courseId: string, instructorId: string) => learningPost<CourseEarnings>('/earnings', { courseId, instructorId }),
  grantAttempt: (courseId: string, instructorId: string, lessonId: string, userId: string) => learningPost('/quiz/grant', { courseId, instructorId, lessonId, userId }),
};

export interface CourseStudent {
  userId: string; name: string; username: string | null; avatar: string | null; enrolledAt: string; status: string;
  progressPercent: number; complete: boolean; certificateCode: string | null;
  exhaustedQuizzes: { lessonId: string; title: string }[];
}
export interface CourseEarnings {
  currency: string; sales: number; gross: number; fees: number; net: number; refunds: number;
  recent: { gross_amount: number; net_amount: number; status: string; created_at: string }[];
  platformFeeBps: number; isFree: boolean; price: number;
}

// ── Uploads (course-media bucket) with progress ───────────────────────────
const STORAGE = `https://${projectId}.supabase.co/storage/v1`;
export const MEDIA_BUCKET = 'course-media';

export interface UploadHandle { promise: Promise<string>; abort: () => void }

/** Uploads a file with progress events; resolves to its public URL. */
export function uploadCourseFile(file: File, folder: string, onProgress: (pct: number) => void): UploadHandle {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const xhr = new XMLHttpRequest();
  const promise = new Promise<string>((resolve, reject) => {
    xhr.open('POST', `${STORAGE}/object/${MEDIA_BUCKET}/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${publicAnonKey}`);
    xhr.setRequestHeader('apikey', publicAnonKey);
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(`${STORAGE}/object/public/${MEDIA_BUCKET}/${path}`);
      else {
        let msg = `Upload failed (${xhr.status})`;
        try { const j = JSON.parse(xhr.responseText); if (j?.message || j?.error) msg = j.message || j.error; } catch {}
        if (xhr.status === 413) msg = 'This file is too large to upload';
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed -- check your connection'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(file);
  });
  return { promise, abort: () => xhr.abort() };
}

/** "Processing": confirms the uploaded video actually plays from storage
 *  and reads its duration. */
export class ProbeInconclusive extends Error {}

/** Rejects with ProbeInconclusive when the browser simply never reports the
 *  length (iOS Safari often doesn't load metadata for a detached <video>);
 *  that says nothing about whether the upload is fine, so callers must not
 *  treat it as a failed video. Any other rejection = the file can't play. */
export function probeVideo(url: string, timeoutMs = 20000): Promise<{ durationSeconds: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    const done = (fn: () => void) => { clearTimeout(t); v.removeAttribute('src'); v.load(); fn(); };
    const t = setTimeout(() => done(() => reject(new ProbeInconclusive('The video took too long to process'))), timeoutMs);
    const check = () => {
      const d = v.duration;
      if (Number.isFinite(d) && d > 0) done(() => resolve({ durationSeconds: Math.round(d) }));
    };
    v.onloadedmetadata = () => {
      const d = v.duration;
      if (Number.isFinite(d) && d > 0) check();
      else done(() => reject(new ProbeInconclusive("We couldn't read this video's length")));
    };
    v.ondurationchange = check;
    v.onloadeddata = check;
    v.onerror = () => done(() => reject(new Error("This video format can't be played. Try an MP4 (H.264) file.")));
    v.src = url;
    v.load();
  });
}

/** A JPEG frame from a local video file (about a second in), used as the
 *  cover image when the instructor's cover is a video. */
export function captureVideoFrame(file: File, atSeconds = 1): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    const done = (fn: () => void) => { clearTimeout(t); URL.revokeObjectURL(url); fn(); };
    const t = setTimeout(() => done(() => reject(new Error('timeout'))), 20000);
    v.onloadedmetadata = () => { v.currentTime = Math.min(atSeconds, Math.max(0, (v.duration || 0) / 3)); };
    v.onseeked = () => {
      const w = Math.min(1600, v.videoWidth), h = Math.round(w * (v.videoHeight / v.videoWidth));
      if (!w || !h) return done(() => reject(new Error('no frame')));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(v, 0, 0, w, h);
      c.toBlob(b => done(() => (b ? resolve(new File([b], file.name.replace(/\.[^.]+$/, '') + '-cover.jpg', { type: 'image/jpeg' })) : reject(new Error('no frame')))), 'image/jpeg', 0.86);
    };
    v.onerror = () => done(() => reject(new Error('unreadable')));
    v.src = url;
  });
}

export function fileKind(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ext || file.type.split('/')[1] || 'file';
}
