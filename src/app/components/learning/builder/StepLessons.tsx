// Course builder step 4: Build your lessons -- the course outline.
// Sections stack vertically and expand to show their content (video
// lessons and quizzes). Content can be dragged within a section, moved
// with Move up / Move down (always available, so it works on touch
// screens too), moved to another section, duplicated or deleted. A final
// quiz, when added, always stays at the very end of the course.
import { useMemo, useState } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown, ArrowUp, ChevronDown, ChevronRight, ClipboardCheck, Copy, FileText, Flag, GripVertical, MoreHorizontal,
  MoveRight, Pencil, Plus, Trash2, Video,
} from 'lucide-react';
import {
  courseVideoSeconds, duplicateItem, formatDuration, formatDurationWords, newQuiz, newSection, newVideo, quizProblems, videoLessonState,
  type CourseDoc, type DocItem, type DocSection,
} from '../../../lib/courseBuilder';
import { Card, ConfirmDialog, StatusPill, StepHeading, inputCls } from './BuilderUI';
import { VideoLessonEditor } from './VideoLessonEditor';
import { QuizEditor } from './QuizEditor';
import type { CourseBuilderState } from './useCourseBuilder';

/** A final quiz always sits at the end of the last section. */
export function keepFinalQuizLast(doc: CourseDoc): CourseDoc {
  if (!doc.sections.length) return doc;
  let final: DocItem | null = null;
  const sections = doc.sections.map(s => ({ ...s, items: s.items.filter(i => { if (i.kind === 'quiz' && i.isFinal) { final = final ?? i; return false; } return true; }) }));
  if (!final) return doc;
  sections[sections.length - 1].items.push(final);
  return { ...doc, sections };
}

export function StepLessons({ b, doc }: { b: CourseBuilderState; doc: CourseDoc }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'item' | 'section'; id: string; title: string; body: string } | null>(null);
  const update = (fn: (d: CourseDoc) => CourseDoc) => b.setDoc(d => keepFinalQuizLast(fn(d)));
  const isOpen = (id: string) => open[id] ?? true;
  const hasFinal = doc.sections.some(s => s.items.some(i => i.kind === 'quiz' && i.isFinal));
  const totalVideo = courseVideoSeconds(doc);
  const counts = useMemo(() => {
    const items = doc.sections.flatMap(s => s.items);
    return { videos: items.filter(i => i.kind === 'video').length, quizzes: items.filter(i => i.kind === 'quiz').length };
  }, [doc.sections]);

  const editingItem = editing ? doc.sections.flatMap(s => s.items).find(i => i.id === editing) ?? null : null;

  const patchSection = (id: string, patch: Partial<DocSection>) => update(d => ({ ...d, sections: d.sections.map(s => (s.id === id ? { ...s, ...patch } : s)) }));
  const moveSection = (idx: number, dir: -1 | 1) => update(d => {
    const j = idx + dir;
    if (j < 0 || j >= d.sections.length) return d;
    return { ...d, sections: arrayMove(d.sections, idx, j) };
  });
  const addSection = () => update(d => ({ ...d, sections: [...d.sections, newSection(d.sections.length + 1)] }));
  const addItem = (sectionId: string, kind: 'video' | 'quiz') => {
    const item = kind === 'video' ? newVideo() : newQuiz();
    update(d => ({ ...d, sections: d.sections.map(s => (s.id === sectionId ? { ...s, items: [...s.items, item] } : s)) }));
    setOpen(o => ({ ...o, [sectionId]: true }));
    setEditing(item.id);
  };
  const addFinalQuiz = () => {
    const quiz = newQuiz(true);
    update(d => {
      const sections = d.sections.length ? d.sections : [newSection(1)];
      return { ...d, sections: sections.map((s, i) => (i === sections.length - 1 ? { ...s, items: [...s.items, quiz] } : s)) };
    });
    setEditing(quiz.id);
  };
  const moveItem = (sectionId: string, from: number, to: number) => update(d => ({
    ...d, sections: d.sections.map(s => (s.id === sectionId && to >= 0 && to < s.items.length ? { ...s, items: arrayMove(s.items, from, to) } : s)),
  }));
  const moveToSection = (itemId: string, targetId: string) => update(d => {
    const item = d.sections.flatMap(s => s.items).find(i => i.id === itemId);
    if (!item) return d;
    return { ...d, sections: d.sections.map(s => ({ ...s, items: s.id === targetId ? [...s.items.filter(i => i.id !== itemId), item] : s.items.filter(i => i.id !== itemId) })) };
  });
  const duplicate = (sectionId: string, itemId: string) => update(d => ({
    ...d, sections: d.sections.map(s => {
      if (s.id !== sectionId) return s;
      const idx = s.items.findIndex(i => i.id === itemId);
      const items = [...s.items];
      items.splice(idx + 1, 0, duplicateItem(s.items[idx]));
      return { ...s, items };
    }),
  }));
  const removeItem = (itemId: string) => update(d => ({ ...d, sections: d.sections.map(s => ({ ...s, items: s.items.filter(i => i.id !== itemId) })) }));
  const removeSection = (id: string) => update(d => ({ ...d, sections: d.sections.filter(s => s.id !== id) }));

  const requestDeleteItem = (item: DocItem) => {
    const hasMaterial = item.kind === 'video' ? !!(item.videoUrl || item.resources.length) : item.kind === 'quiz' ? item.questions.length > 0 : true;
    if (!hasMaterial) { removeItem(item.id); return; }
    setConfirmDelete({
      kind: 'item', id: item.id, title: `Delete “${item.title || (item.kind === 'quiz' ? 'Untitled quiz' : 'Untitled lesson')}”?`,
      body: item.kind === 'quiz' ? `Its ${item.questions.length} question${item.questions.length === 1 ? '' : 's'} will be deleted too.` : 'Its uploaded video and resources will be removed from the course.',
    });
  };
  const requestDeleteSection = (s: DocSection) => {
    if (!s.items.length) { removeSection(s.id); return; }
    setConfirmDelete({ kind: 'section', id: s.id, title: `Delete “${s.title || 'Untitled section'}”?`, body: `Its ${s.items.length} lesson${s.items.length === 1 ? '' : 's'} and quizzes will be deleted too.` });
  };

  return (
    <div className="space-y-4">
      <StepHeading title="Build your lessons" subtitle="Organize your course into sections of video lessons and quizzes." />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-gray-500" id="field-lessons">
        <span>{doc.sections.length} section{doc.sections.length === 1 ? '' : 's'}</span>
        <span>{counts.videos} video lesson{counts.videos === 1 ? '' : 's'}</span>
        <span>{counts.quizzes} quiz{counts.quizzes === 1 ? '' : 'zes'}</span>
        <span>Total video: <span className="text-gray-900">{totalVideo ? formatDurationWords(totalVideo) : '0 min'}</span></span>
      </div>

      {doc.sections.length === 0 && (
        <Card className="text-center">
          <p className="text-sm font-bold text-gray-800">Start with your first section</p>
          <p className="mt-1 text-xs text-gray-500">Sections group related lessons, like chapters.</p>
        </Card>
      )}

      {doc.sections.map((s, si) => (
        <Card key={s.id} className="!p-0 overflow-hidden" id={`field-section:${s.id}`}>
          <div className="flex items-start gap-2 border-b border-gray-100 p-3 sm:p-4">
            <button type="button" onClick={() => setOpen(o => ({ ...o, [s.id]: !isOpen(s.id) }))} aria-expanded={isOpen(s.id)} aria-label={isOpen(s.id) ? 'Collapse section' : 'Expand section'}
              className="mt-1.5 rounded-lg p-1 text-gray-500 hover:bg-gray-100">
              {isOpen(s.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">Section {si + 1}</p>
              <input value={s.title} onChange={e => patchSection(s.id, { title: e.target.value })} placeholder="Section title" aria-label={`Section ${si + 1} title`}
                className={`${inputCls} !py-2 font-bold ${!s.title.trim() ? '!border-red-300' : ''}`} />
              {isOpen(s.id) && (
                <textarea value={s.description} onChange={e => patchSection(s.id, { description: e.target.value })} rows={1} placeholder="Section description (optional)"
                  aria-label={`Section ${si + 1} description`} className={`${inputCls} !py-2 resize-none text-xs`} />
              )}
            </div>
            <div className="mt-6 flex shrink-0 items-center">
              <button type="button" onClick={() => moveSection(si, -1)} disabled={si === 0} aria-label="Move section up" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => moveSection(si, 1)} disabled={si === doc.sections.length - 1} aria-label="Move section down" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" onClick={() => requestDeleteSection(s)} aria-label="Delete section" className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>

          {isOpen(s.id) && (
            <div className="space-y-2 p-3 sm:p-4">
              <SectionItems section={s} sections={doc.sections}
                onReorder={(from, to) => moveItem(s.id, from, to)}
                onEdit={id => setEditing(id)} onDuplicate={id => duplicate(s.id, id)}
                onMoveTo={(id, target) => moveToSection(id, target)} onDelete={requestDeleteItem} />
              <AddContent onAdd={kind => addItem(s.id, kind)} />
            </div>
          )}
        </Card>
      ))}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={addSection} className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:border-blue-300 hover:text-blue-700">
          <Plus className="h-4 w-4" /> Add section
        </button>
        {!hasFinal && (
          <button type="button" onClick={addFinalQuiz} className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:border-blue-300 hover:text-blue-700">
            <Flag className="h-4 w-4" /> Add final quiz
          </button>
        )}
      </div>

      {editingItem?.kind === 'video' && (
        <VideoLessonEditor b={b} lesson={editingItem} onClose={() => setEditing(null)} />
      )}
      {editingItem?.kind === 'quiz' && (
        <QuizEditor b={b} quiz={editingItem} onClose={() => setEditing(null)} />
      )}
      {editingItem?.kind === 'legacy' && (
        <ConfirmDialog title={editingItem.title} confirmLabel="Close" onConfirm={() => setEditing(null)} onCancel={() => setEditing(null)}
          body={`This ${editingItem.type} lesson was made with the previous editor. You can move or delete it; to change it, replace it with a video lesson.`} />
      )}
      {confirmDelete && (
        <ConfirmDialog title={confirmDelete.title} body={confirmDelete.body} confirmLabel="Delete" destructive
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { if (confirmDelete.kind === 'item') removeItem(confirmDelete.id); else removeSection(confirmDelete.id); setConfirmDelete(null); }} />
      )}
    </div>
  );
}

function AddContent({ onAdd }: { onAdd: (kind: 'video' | 'quiz') => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-blue-600 hover:bg-blue-50">
        <Plus className="h-4 w-4" /> Add content
      </button>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => { setOpen(false); onAdd('video'); }} className="flex flex-col items-start gap-1 rounded-xl border border-gray-200 p-3 text-left hover:border-blue-300 hover:bg-blue-50/40">
        <Video className="h-5 w-5 text-blue-600" />
        <span className="text-sm font-bold text-gray-900">Video lesson</span>
        <span className="text-xs text-gray-500">Teach course material</span>
      </button>
      <button type="button" onClick={() => { setOpen(false); onAdd('quiz'); }} className="flex flex-col items-start gap-1 rounded-xl border border-gray-200 p-3 text-left hover:border-blue-300 hover:bg-blue-50/40">
        <ClipboardCheck className="h-5 w-5 text-blue-600" />
        <span className="text-sm font-bold text-gray-900">Quiz</span>
        <span className="text-xs text-gray-500">Assess understanding</span>
      </button>
      <button type="button" onClick={() => setOpen(false)} className="col-span-2 py-1 text-xs font-bold text-gray-400 hover:text-gray-700">Cancel</button>
    </div>
  );
}

function SectionItems({ section, sections, onReorder, onEdit, onDuplicate, onMoveTo, onDelete }: {
  section: DocSection; sections: DocSection[];
  onReorder: (from: number, to: number) => void; onEdit: (id: string) => void; onDuplicate: (id: string) => void;
  onMoveTo: (id: string, sectionId: string) => void; onDelete: (item: DocItem) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = section.items.findIndex(i => i.id === e.active.id);
    const to = section.items.findIndex(i => i.id === e.over!.id);
    if (from >= 0 && to >= 0) onReorder(from, to);
  };
  if (!section.items.length) return <p className="py-2 text-center text-xs text-gray-400">No content in this section yet.</p>;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={section.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {section.items.map((item, idx) => (
            <OutlineItem key={item.id} item={item} index={idx} count={section.items.length} sections={sections} sectionId={section.id}
              onUp={() => onReorder(idx, idx - 1)} onDown={() => onReorder(idx, idx + 1)}
              onEdit={() => onEdit(item.id)} onDuplicate={() => onDuplicate(item.id)} onMoveTo={t => onMoveTo(item.id, t)} onDelete={() => onDelete(item)} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function OutlineItem({ item, index, count, sections, sectionId, onUp, onDown, onEdit, onDuplicate, onMoveTo, onDelete }: {
  item: DocItem; index: number; count: number; sections: DocSection[]; sectionId: string;
  onUp: () => void; onDown: () => void; onEdit: () => void; onDuplicate: () => void; onMoveTo: (sectionId: string) => void; onDelete: () => void;
}) {
  const locked = item.kind === 'quiz' && item.isFinal; // the final quiz stays last
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: locked });
  const [menu, setMenu] = useState(false);
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined };

  const icon = item.kind === 'quiz' ? <ClipboardCheck className="h-4 w-4 text-violet-600" /> : item.kind === 'video' ? <Video className="h-4 w-4 text-blue-600" /> : <FileText className="h-4 w-4 text-gray-500" />;
  let meta: React.ReactNode = null;
  if (item.kind === 'video') {
    meta = (
      <>
        <StatusPill state={videoLessonState(item)} />
        {item.videoStatus === 'ready' && item.durationSeconds > 0 && <span>{formatDuration(item.durationSeconds)}</span>}
        {item.isPreview && <span className="font-bold text-emerald-600">Free preview</span>}
        {item.resources.length > 0 && <span>{item.resources.length} resource{item.resources.length === 1 ? '' : 's'}</span>}
        {item.exercise.enabled && <span>Exercise</span>}
      </>
    );
  } else if (item.kind === 'quiz') {
    const problems = quizProblems(item);
    meta = (
      <>
        <StatusPill state={problems.length ? 'Incomplete' : 'Ready'} />
        <span>{item.questions.length} question{item.questions.length === 1 ? '' : 's'}</span>
        <span>Pass {item.passingScore}%</span>
        {item.required ? <span>Required</span> : <span>Optional</span>}
        {item.isFinal && <span className="font-bold text-violet-600">Final quiz</span>}
      </>
    );
  } else meta = <span>Older {item.type} lesson</span>;

  return (
    <li ref={setNodeRef} style={style} id={`field-item:${item.id}`}
      className={`flex items-center gap-2 rounded-xl border bg-white p-2.5 scroll-mt-28 ${isDragging ? 'border-blue-300 shadow-lg' : 'border-gray-100'}`}>
      <button type="button" {...attributes} {...listeners} disabled={locked} aria-label="Drag to reorder"
        className={`shrink-0 touch-none rounded-lg p-1 text-gray-300 ${locked ? 'opacity-30' : 'cursor-grab hover:bg-gray-100 hover:text-gray-500'}`}>
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50">{icon}</span>
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-bold text-gray-900">{item.title || <span className="text-gray-400">{item.kind === 'quiz' ? 'Untitled quiz' : 'Untitled lesson'}</span>}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">{meta}</span>
      </button>
      <div className="flex shrink-0 items-center">
        <button type="button" onClick={onUp} disabled={index === 0 || locked} aria-label="Move up" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
        <button type="button" onClick={onDown} disabled={index === count - 1 || locked} aria-label="Move down" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
        <div className="relative">
          <button type="button" onClick={() => setMenu(m => !m)} aria-label="More actions" aria-expanded={menu} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"><MoreHorizontal className="h-4 w-4" /></button>
          {menu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-9 z-30 w-56 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-xl">
                <MenuButton icon={Pencil} label="Edit" onClick={() => { setMenu(false); onEdit(); }} />
                {item.kind !== 'legacy' && !locked && <MenuButton icon={Copy} label="Duplicate" onClick={() => { setMenu(false); onDuplicate(); }} />}
                {!locked && sections.filter(s => s.id !== sectionId).map(s => (
                  <MenuButton key={s.id} icon={MoveRight} label={`Move to “${s.title || 'Untitled section'}”`} onClick={() => { setMenu(false); onMoveTo(s.id); }} />
                ))}
                <MenuButton icon={Trash2} label="Delete" destructive onClick={() => { setMenu(false); onDelete(); }} />
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function MenuButton({ icon: Icon, label, onClick, destructive }: { icon: any; label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-semibold ${destructive ? 'text-red-600 hover:bg-red-50' : 'text-gray-800 hover:bg-gray-50'}`}>
      <Icon className="h-4 w-4 shrink-0" /> <span className="truncate">{label}</span>
    </button>
  );
}
