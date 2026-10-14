// Shared pieces for editing / deleting your own comment: used by every comment list in the app.
import { useState } from 'react';
import { toast } from 'sonner';

export const COMMENT_EDIT_WINDOW_MS = 30 * 60_000;
export const canEditComment = (createdAt: string) => Date.now() - new Date(createdAt).getTime() < COMMENT_EDIT_WINDOW_MS;

/** Edit state for one comment. `save` is the API call (throws on failure); the shown text updates at once. */
export function useCommentEdit(initial: string, createdAt: string, editedAt: string | undefined,
  save: (text: string) => Promise<unknown>) {
  const [text, setText] = useState(initial);
  const [edited, setEdited] = useState(!!editedAt);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  return {
    text, edited, editing, draft, setDraft, saving,
    canEdit: canEditComment(createdAt),
    start: () => { setDraft(text); setEditing(true); },
    cancel: () => setEditing(false),
    commit: async () => {
      const next = draft.trim();
      if (!next || saving) return;
      if (next === text) { setEditing(false); return; }
      setSaving(true);
      try { await save(next); setText(next); setEdited(true); setEditing(false); }
      catch (e: any) { toast.error(e?.message || 'Could not edit comment'); }
      finally { setSaving(false); }
    },
  };
}

export function CommentEditBox({ edit, dark = false }: { edit: ReturnType<typeof useCommentEdit>; dark?: boolean }) {
  return (
    <div>
      <textarea value={edit.draft} onChange={e => edit.setDraft(e.target.value)} autoFocus rows={2}
        className={`w-full rounded-xl px-2.5 py-1.5 text-sm outline-none resize-none border ${dark ? 'bg-white/10 text-white border-white/20' : 'bg-white text-gray-900 border-gray-200 focus:border-blue-300'}`} />
      <div className="flex gap-3 mt-1">
        <button onClick={edit.commit} disabled={!edit.draft.trim() || edit.saving} className="text-xs font-bold text-blue-500 disabled:opacity-40">{edit.saving ? 'Saving…' : 'Save'}</button>
        <button onClick={edit.cancel} className={`text-xs font-semibold ${dark ? 'text-white/60' : 'text-gray-500'}`}>Cancel</button>
      </div>
    </div>
  );
}
