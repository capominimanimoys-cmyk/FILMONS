// Video lesson editor (full-screen panel over the outline). Edits go
// straight into the draft (and autosave); uploads keep running if the
// panel is closed. "Save lesson" returns to the outline.
import { ArrowLeft, FileDown, Lock, Trash2, Unlock } from 'lucide-react';
import { formatDuration, uid, videoLessonState, type DocResource, type DocVideo } from '../../../lib/courseBuilder';
import { Card, Field, StatusPill, Toggle, UploadBox, inputCls } from './BuilderUI';
import type { CourseBuilderState } from './useCourseBuilder';

const RESOURCE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.zip,.cube,.drp,.prproj,.aep,.psd,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.mp3,.wav,.fcpxml,.xml,.lut';

export function VideoLessonEditor({ b, lesson, onClose }: { b: CourseBuilderState; lesson: DocVideo; onClose: () => void }) {
  const patch = (p: Partial<DocVideo>) => b.setDoc(d => ({
    ...d, sections: d.sections.map(s => ({ ...s, items: s.items.map(i => (i.id === lesson.id && i.kind === 'video' ? { ...i, ...p } : i)) })),
  }));
  const patchResource = (id: string, p: Partial<DocResource>) => b.setDoc(d => ({
    ...d, sections: d.sections.map(s => ({ ...s, items: s.items.map(i => (i.id === lesson.id && i.kind === 'video' ? { ...i, resources: i.resources.map(r => (r.id === id ? { ...r, ...p } : r)) } : i)) })),
  }));
  const target = `video:${lesson.id}`;
  const upload = b.uploads[target];
  const state = videoLessonState(lesson);

  const addResource = (file: File) => {
    const id = uid();
    b.setDoc(d => ({
      ...d, sections: d.sections.map(s => ({ ...s, items: s.items.map(i => (i.id === lesson.id && i.kind === 'video'
        ? { ...i, resources: [...i.resources, { id, name: file.name.replace(/\.[^.]+$/, ''), url: '', fileType: '', isPreview: false }] }
        : i)) })),
    }));
    b.startUpload(`res:${lesson.id}:${id}`, file);
  };
  const removeResource = (id: string) => {
    b.cancelUpload(`res:${lesson.id}:${id}`);
    b.setDoc(d => ({ ...d, sections: d.sections.map(s => ({ ...s, items: s.items.map(i => (i.id === lesson.id && i.kind === 'video' ? { ...i, resources: i.resources.filter(r => r.id !== id) } : i)) })) }));
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-gray-50" role="dialog" aria-modal="true" aria-label="Video lesson editor">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-100 bg-white px-3 py-2.5 sm:px-6" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
        <button type="button" onClick={onClose} aria-label="Back to outline" className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-bold text-gray-600 hover:bg-gray-100">
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Outline</span>
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-black text-gray-900">Video lesson</p>
        <StatusPill state={state} />
        <button type="button" onClick={onClose} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700">Save lesson</button>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-5 pb-16">
        <Card className="space-y-5">
          <Field label="Lesson title" htmlFor="vl-title">
            <input id="vl-title" autoFocus={!lesson.title} value={lesson.title} maxLength={120} onChange={e => patch({ title: e.target.value })} placeholder="e.g. Setting up a three-point light" className={inputCls} />
          </Field>

          <div className="space-y-2">
            <p className="text-sm font-bold text-gray-900">Video</p>
            {lesson.videoStatus === 'ready' && lesson.videoUrl && !upload && (
              <div className="space-y-2">
                <video key={lesson.videoUrl} src={lesson.videoUrl} controls playsInline preload="metadata" className="w-full rounded-xl bg-black" style={{ aspectRatio: '16/9' }} />
                <p className="text-xs text-gray-500">Ready · Detected duration <span className="font-bold text-gray-900">{formatDuration(lesson.durationSeconds)}</span></p>
              </div>
            )}
            <UploadBox accept="video/mp4,video/quicktime,video/webm,video/x-m4v" label={lesson.videoUrl && lesson.videoStatus === 'ready' ? 'Replace video' : 'Upload video'}
              hint="MP4 (H.264) plays everywhere" upload={upload} processing={lesson.videoStatus === 'processing'}
              failedMessage={lesson.videoStatus === 'failed' ? 'This video could not be uploaded or processed' : null}
              onFile={f => b.startUpload(target, f)} onRetry={() => b.retryUpload(target)} canRetry={b.canRetry(target)} onCancel={() => b.cancelUpload(target)}
              compact={lesson.videoStatus === 'ready'} />
          </div>

          <Field label="Lesson description" optional htmlFor="vl-desc">
            <textarea id="vl-desc" rows={3} value={lesson.description} onChange={e => patch({ description: e.target.value })} className={`${inputCls} resize-y`} />
          </Field>

          <Toggle checked={lesson.isPreview} onChange={isPreview => patch({ isPreview })} label="Allow free preview"
            description="Anyone can watch this lesson before enrolling, plus any of its resources you mark as preview. Everything else stays locked until purchase." />
        </Card>

        <Card className="space-y-3">
          <div>
            <p className="text-sm font-bold text-gray-900">Downloadable resources <span className="text-xs font-semibold text-gray-400">Optional</span></p>
            <p className="text-xs text-gray-400">PDFs, images, templates or practice files. Give each a readable name.</p>
          </div>
          {lesson.resources.map(r => {
            const t = `res:${lesson.id}:${r.id}`;
            const up = b.uploads[t];
            return (
              <div data-pop key={r.id} className="space-y-2 rounded-xl border border-gray-100 p-3">
                <div className="flex items-center gap-2">
                  <FileDown className="h-4 w-4 shrink-0 text-gray-400" />
                  <input value={r.name} onChange={e => patchResource(r.id, { name: e.target.value })} placeholder="Resource name" aria-label="Resource name" className={`${inputCls} !py-2`} />
                  <button type="button" onClick={() => removeResource(r.id)} aria-label="Remove resource" className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
                {up ? (
                  <UploadBox accept={RESOURCE_ACCEPT} label="Choose file" upload={up} onFile={f => b.startUpload(t, f)} onRetry={() => b.retryUpload(t)} canRetry={b.canRetry(t)} onCancel={() => removeResource(r.id)} compact />
                ) : r.url ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <a href={r.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 hover:underline">{r.fileType ? r.fileType.toUpperCase() : 'File'} uploaded · open</a>
                    <button type="button" onClick={() => patchResource(r.id, { isPreview: !r.isPreview })} disabled={!lesson.isPreview}
                      title={lesson.isPreview ? '' : 'Turn on free preview for this lesson first'}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-bold ${r.isPreview && lesson.isPreview ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'} disabled:opacity-50`}>
                      {r.isPreview && lesson.isPreview ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                      {r.isPreview && lesson.isPreview ? 'Included in free preview' : 'Students only'}
                    </button>
                  </div>
                ) : (
                  <UploadBox accept={RESOURCE_ACCEPT} label="Choose file" onFile={f => b.startUpload(t, f)} compact />
                )}
              </div>
            );
          })}
          <UploadBox accept={RESOURCE_ACCEPT} label="Add resource" onFile={addResource} compact />
        </Card>

        <Card className="space-y-4">
          <Toggle checked={lesson.exercise.enabled} onChange={enabled => patch({ exercise: { ...lesson.exercise, enabled } })} label="Practical exercise"
            description="Give students something to practise. They can mark it complete without uploading their work." />
          {lesson.exercise.enabled && (
            <>
              <Field label="Instructions" htmlFor="vl-ex">
                <textarea id="vl-ex" rows={3} value={lesson.exercise.instructions} onChange={e => patch({ exercise: { ...lesson.exercise, instructions: e.target.value } })}
                  placeholder="e.g. Light a short interview using only window light and a reflector." className={inputCls} />
              </Field>
              <Field label="Expected result" optional htmlFor="vl-exr">
                <textarea id="vl-exr" rows={2} value={lesson.exercise.expectedResult} onChange={e => patch({ exercise: { ...lesson.exercise, expectedResult: e.target.value } })}
                  placeholder="What a good result looks like" className={inputCls} />
              </Field>
            </>
          )}
        </Card>

        <button type="button" onClick={onClose} className="w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white hover:bg-blue-700">Save lesson</button>
      </div>
    </div>
  );
}
