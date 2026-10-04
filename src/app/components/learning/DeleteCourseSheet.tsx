// Confirmation for deleting one of the instructor's own courses (opened
// from the course's ⋯ menu on the Instructor dashboard). Checks first
// whether anyone is enrolled or has paid: if so a permanent delete would
// take the course away from those learners and wipe the payment records
// (deleting a course cascades to both), so it offers Unpublish instead --
// hidden from Learning, enrolled students keep access.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Archive, Trash2 } from 'lucide-react';
import { BottomSheet } from '../BottomSheet';
import { deleteCourse, getCourseDeletionBlockers, type Course } from '../../lib/coursesApi';
import { builderApi } from '../../lib/courseBuilder';

type State =
  | { kind: 'checking' }
  | { kind: 'free' }
  | { kind: 'blocked'; students: number; payments: number }
  | { kind: 'error' };

export function DeleteCourseSheet({ course, instructorId, onClose, onChanged }: {
  course: Course;
  instructorId: string;
  onClose: () => void;
  /** Called after the course was deleted or unpublished. */
  onChanged: () => void;
}) {
  const [state, setState] = useState<State>({ kind: 'checking' });
  const [busy, setBusy] = useState(false);
  // Only a published course can be unpublished; drafts never have students.
  const isLive = course.status === 'published';

  useEffect(() => {
    let cancelled = false;
    getCourseDeletionBlockers(course.id)
      .then(b => { if (!cancelled) setState(b.students || b.payments ? { kind: 'blocked', ...b } : { kind: 'free' }); })
      .catch(() => { if (!cancelled) setState({ kind: 'error' }); });
    return () => { cancelled = true; };
  }, [course.id]);

  const handleDelete = async () => {
    setBusy(true);
    const res = await deleteCourse(course.id, instructorId);
    setBusy(false);
    if (res.ok) { toast.success('Course deleted'); onChanged(); onClose(); return; }
    if (res.reason === 'has_students') { setState({ kind: 'blocked', students: res.students, payments: res.payments }); return; }
    toast.error('Could not delete the course. Please try again.');
  };

  const handleArchive = async () => {
    setBusy(true);
    const ok = await builderApi.setStatus(course.id, instructorId, 'unpublished').then(() => true, () => false);
    setBusy(false);
    if (!ok) { toast.error('Could not unpublish the course'); return; }
    toast.success('Course unpublished');
    onChanged();
    onClose();
  };

  const who = (s: number, p: number) => [
    s ? `${s} student${s === 1 ? ' is' : 's are'} enrolled` : '',
    p ? `${p} payment${p === 1 ? '' : 's'} recorded` : '',
  ].filter(Boolean).join(' and ');

  return (
    <BottomSheet title="Delete course" onClose={onClose}>
      <div className="px-5 pb-6">
        <p className="text-sm font-bold text-gray-900 truncate">“{course.title}”</p>

        {state.kind === 'checking' && (
          <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
            <span className="h-4 w-4 rounded-full border-2 border-gray-200 border-t-blue-600 animate-spin" />
            Checking for enrolled students…
          </div>
        )}

        {state.kind === 'error' && (
          <p className="py-5 text-sm text-gray-600">We couldn't check this course right now. Please try again in a moment.</p>
        )}

        {state.kind === 'free' && (
          <>
            <div className="mt-3 flex gap-3 rounded-2xl bg-red-50 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
              <p className="text-sm leading-relaxed text-gray-700">
                This permanently deletes the course with all its sections, lessons and reviews. This can't be undone.
              </p>
            </div>
            <button onClick={handleDelete} disabled={busy}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 py-3.5 text-sm font-black text-white hover:bg-red-700 disabled:opacity-60">
              <Trash2 className="h-4 w-4" /> {busy ? 'Deleting…' : 'Delete permanently'}
            </button>
          </>
        )}

        {state.kind === 'blocked' && (
          <>
            <div className="mt-3 flex gap-3 rounded-2xl bg-amber-50 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
              <p className="text-sm leading-relaxed text-gray-700">
                This course can't be deleted because {who(state.students, state.payments)}. Deleting it would remove it
                from their learning and erase their progress and payment records.
                {isLive && <> Unpublish it instead: it disappears from FILMONS Learning and new purchases, and enrolled students keep access.</>}
              </p>
            </div>
            {isLive ? (
              <button onClick={handleArchive} disabled={busy}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 py-3.5 text-sm font-black text-white hover:bg-gray-800 disabled:opacity-60">
                <Archive className="h-4 w-4" /> {busy ? 'Unpublishing…' : 'Unpublish course'}
              </button>
            ) : (
              <p className="mt-4 text-sm text-gray-500">It's already unpublished, so it's hidden from Learning.</p>
            )}
          </>
        )}

        <button onClick={onClose} className="mt-2 w-full py-3 text-center text-sm font-black text-gray-500">Cancel</button>
      </div>
    </BottomSheet>
  );
}
