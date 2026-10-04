// State for the course builder: the draft document, autosave and uploads.
//
// Autosave: every change is saved ~1s after the last edit, one save in
// flight at a time; the status shown is exactly what happened -- Saving…
// while a request is out, Saved once the server confirmed the latest
// version, "Changes could not be saved" (with Retry) if it failed. Nothing
// is lost on failure: the document stays in memory and the next edit or
// Retry saves it again.
//
// Uploads live here, not in the editor panels, so closing a lesson editor
// doesn't cancel its upload. Each one remembers its File, so a failed
// upload can be retried without picking the file again.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  builderApi, probeVideo, uploadCourseFile, fileKind,
  type CourseDoc, type DocVideo, type DraftLoad, type UploadHandle,
} from '../../../lib/courseBuilder';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type UploadTarget = string; // 'cover' | 'intro' | `video:${id}` | `res:${itemId}:${resId}`
export interface UploadInfo { progress: number; status: 'uploading' | 'error'; error?: string; fileName: string }

const SAVE_DELAY_MS = 900;

export function useCourseBuilder(courseId: string | undefined, instructorId: string | undefined) {
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Omit<DraftLoad, 'doc' | 'savedAt'> | null>(null);
  const [doc, setDocState] = useState<CourseDoc | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Record<UploadTarget, UploadInfo>>({});

  const docRef = useRef<CourseDoc | null>(null);
  const version = useRef(0);       // bumps on every edit
  const savedVersion = useRef(0);  // last version the server confirmed
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handles = useRef<Record<UploadTarget, UploadHandle>>({});
  const files = useRef<Record<UploadTarget, File>>({});

  // ── Load ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!courseId || !instructorId) return;
    setLoadState('loading');
    setLoadError(null);
    try {
      const r = await builderApi.load(courseId, instructorId);
      docRef.current = r.doc;
      setDocState(r.doc);
      setMeta({ course: r.course, payoutReady: r.payoutReady, platformFeeBps: r.platformFeeBps });
      setSavedAt(r.savedAt);
      setSaveState(r.savedAt ? 'saved' : 'idle');
      setLoadState('ready');
      // A video that was still processing when the editor closed: check it again.
      r.doc.sections.forEach(s => s.items.forEach(i => { if (i.kind === 'video' && i.videoStatus === 'processing' && i.videoUrl) reprocess(`video:${i.id}`, i.videoUrl); }));
      if (r.doc.presentation.introVideoStatus === 'processing' && r.doc.presentation.introVideoUrl) reprocess('intro', r.doc.presentation.introVideoUrl);
    } catch (e: any) {
      setLoadError(
        e?.status === 404 && !e?.data?.error ? 'Course creation is being set up on our servers. Please try again in a little while -- your course is saved.'
        : e?.status === 403 ? "You can't edit this course."
        : e?.status === 404 ? 'This course no longer exists.'
        : (e?.message || "Couldn't load the course"));
      setLoadState('error');
    }
  }, [courseId, instructorId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // ── Save ───────────────────────────────────────────────────────────────
  const saveNow = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    if (!courseId || !instructorId || !docRef.current) return false;
    if (inFlight.current) await inFlight.current.catch(() => {});
    if (savedVersion.current === version.current) return true;
    const v = version.current;
    setSaveState('saving');
    let ok = false;
    const p = builderApi.save(courseId, instructorId, docRef.current).then(r => {
      savedVersion.current = Math.max(savedVersion.current, v);
      setSavedAt(r.savedAt);
      ok = true;
    });
    inFlight.current = p.then(() => {}, () => {});
    try { await p; } catch { /* reported below */ }
    inFlight.current = null;
    if (!ok) { setSaveState('error'); return false; }
    if (version.current !== savedVersion.current) { schedule(); setSaveState('saving'); }
    else setSaveState('saved');
    return true;
  }, [courseId, instructorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const schedule = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { saveNow(); }, SAVE_DELAY_MS);
  };

  const setDoc = useCallback((update: (d: CourseDoc) => CourseDoc) => {
    if (!docRef.current) return;
    const next = update(docRef.current);
    if (next === docRef.current) return;
    docRef.current = next;
    version.current += 1;
    setDocState(next);
    setSaveState(s => (s === 'error' ? 'error' : 'saving'));
    schedule();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = () => version.current !== savedVersion.current || !!inFlight.current;

  // Warn before closing the tab with unsaved changes or uploads running.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty() || Object.values(uploads).some(u => u.status === 'uploading')) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [uploads]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // ── Uploads ────────────────────────────────────────────────────────────
  const setUpload = (target: UploadTarget, info: UploadInfo | null) =>
    setUploads(u => { const n = { ...u }; if (info) n[target] = info; else delete n[target]; return n; });

  const updateVideo = (id: string, patch: Partial<DocVideo>) =>
    setDoc(d => ({ ...d, sections: d.sections.map(s => ({ ...s, items: s.items.map(i => (i.id === id && i.kind === 'video' ? { ...i, ...patch } : i)) })) }));

  const applyResult = (target: UploadTarget, patch: { url: string; status?: DocVideo['videoStatus']; durationSeconds?: number; fileName?: string; fileType?: string }) => {
    if (target === 'cover') setDoc(d => ({ ...d, presentation: { ...d.presentation, coverUrl: patch.url } }));
    else if (target === 'intro') setDoc(d => ({ ...d, presentation: { ...d.presentation, introVideoUrl: patch.url, introVideoStatus: patch.status ?? 'ready' } }));
    else if (target.startsWith('video:')) updateVideo(target.slice(6), { videoUrl: patch.url, videoStatus: patch.status ?? 'ready', ...(patch.durationSeconds ? { durationSeconds: patch.durationSeconds } : {}) });
    else if (target.startsWith('res:')) {
      const [, itemId, resId] = target.split(':');
      setDoc(d => ({ ...d, sections: d.sections.map(s => ({ ...s, items: s.items.map(i => (i.id === itemId && i.kind === 'video'
        ? { ...i, resources: i.resources.map(r => (r.id === resId ? { ...r, url: patch.url, fileType: patch.fileType ?? r.fileType, name: r.name || (patch.fileName ?? '') } : r)) }
        : i)) })) }));
    }
  };

  const setVideoStatus = (target: UploadTarget, status: DocVideo['videoStatus'], durationSeconds?: number) => {
    if (target === 'intro') setDoc(d => ({ ...d, presentation: { ...d.presentation, introVideoStatus: status } }));
    else if (target.startsWith('video:')) updateVideo(target.slice(6), { videoStatus: status, ...(durationSeconds ? { durationSeconds } : {}) });
  };

  const reprocess = async (target: UploadTarget, url: string) => {
    try {
      const { durationSeconds } = await probeVideo(url);
      setVideoStatus(target, 'ready', durationSeconds);
    } catch (e: any) {
      setVideoStatus(target, 'failed');
      setUpload(target, { progress: 100, status: 'error', error: e?.message || 'Processing failed', fileName: '' });
    }
  };

  const startUpload = useCallback((target: UploadTarget, file: File) => {
    if (!courseId) return;
    handles.current[target]?.abort();
    files.current[target] = file;
    const isVideo = target === 'intro' || target.startsWith('video:');
    const folder = `${courseId}/${target === 'cover' ? 'cover' : target === 'intro' ? 'intro' : target.startsWith('video:') ? 'lessons' : 'resources'}`;
    setUpload(target, { progress: 0, status: 'uploading', fileName: file.name });
    if (isVideo) setVideoStatus(target, 'uploading');
    const handle = uploadCourseFile(file, folder, pct => setUploads(u => (u[target] ? { ...u, [target]: { ...u[target], progress: pct } } : u)));
    handles.current[target] = handle;
    handle.promise.then(async url => {
      delete handles.current[target];
      if (!isVideo) {
        applyResult(target, { url, fileName: file.name.replace(/\.[^.]+$/, ''), fileType: fileKind(file) });
        setUpload(target, null);
        return;
      }
      applyResult(target, { url, status: 'processing' });
      setUpload(target, null);
      await reprocess(target, url);
    }).catch((e: Error) => {
      delete handles.current[target];
      if (e.message === 'Upload cancelled') { setUpload(target, null); if (isVideo) setVideoStatus(target, 'none'); return; }
      setUpload(target, { progress: 0, status: 'error', error: e.message, fileName: file.name });
      if (isVideo) setVideoStatus(target, 'failed');
    });
  }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const retryUpload = useCallback((target: UploadTarget) => {
    const file = files.current[target];
    if (file) startUpload(target, file);
  }, [startUpload]);

  const cancelUpload = useCallback((target: UploadTarget) => { handles.current[target]?.abort(); }, []);
  const canRetry = (target: UploadTarget) => !!files.current[target];

  return {
    loadState, loadError, reload: load, meta, setMeta, doc, setDoc,
    saveState, savedAt, saveNow, dirty,
    uploads, startUpload, retryUpload, cancelUpload, canRetry, clearUploadError: (t: UploadTarget) => setUpload(t, null),
  };
}

export type CourseBuilderState = ReturnType<typeof useCourseBuilder>;
