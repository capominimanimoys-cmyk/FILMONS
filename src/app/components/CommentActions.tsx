// One comment-action flow for every comment list (posts, portfolio, reels, replies):
// three-dot button or ~500 ms press -> menu (bottom sheet on mobile, dropdown on desktop) ->
// Edit (inline) / Delete (confirm) / Copy text / Report, shown by who is looking.
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Pencil, Trash2, Copy, Flag } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { BottomSheet } from './BottomSheet';
import { reportComment } from '../lib/commentReports';

const EDIT_WINDOW_MS = 30 * 60_000;
const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 8;
const Z = 300;

export interface CommentActionsConfig {
  kind: 'post' | 'portfolio';
  commentId: string;
  text: string;
  authorId: string;
  /** Owner of the post / portfolio item the comment is on. */
  contentOwnerId?: string;
  createdAt: string;
  editedAt?: string;
  /** A just-posted optimistic comment has no server id yet: no menu. */
  pending?: boolean;
  /** Throws on failure. */
  onSaveEdit: (text: string) => Promise<unknown>;
  /** Throws on failure. The caller removes the comment (or turns it into the "deleted" placeholder). */
  onDelete: () => Promise<unknown>;
}

const isMobile = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches;

export function useCommentActions(cfg: CommentActionsConfig) {
  const { user } = useAuth();
  const [text, setText] = useState(cfg.text);
  useEffect(() => setText(cfg.text), [cfg.text]);
  const [edited, setEdited] = useState(!!cfg.editedAt);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [menu, setMenu] = useState<null | 'button' | 'press'>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAuthor = !!user && user.id === cfg.authorId;
  const isOwner = !!user && !isAuthor && !!cfg.contentOwnerId && user.id === cfg.contentOwnerId;
  const canEditNow = isAuthor && Date.now() - new Date(cfg.createdAt).getTime() < EDIT_WINDOW_MS;

  // ── long press ─────────────────────────────────────────────────────────────
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; origin.current = null; };
  useEffect(() => cancel, []);
  const longPress = cfg.pending || editing ? {} : {
    onTouchStart: (e: TouchEvent) => {
      // Links, mentions and hashtags keep their own tap behaviour.
      if ((e.target as HTMLElement).closest('a, button, input, textarea, [role="button"]')) return;
      e.stopPropagation();   // a reply inside a comment handles its own press
      const t = e.touches[0];
      origin.current = { x: t.clientX, y: t.clientY };
      timer.current = setTimeout(() => {
        timer.current = null;
        try { navigator.vibrate?.(10); } catch { /* unsupported */ }
        setMenu('press');
      }, LONG_PRESS_MS);
    },
    onTouchMove: (e: TouchEvent) => {
      const o = origin.current; if (!o) return;
      const t = e.touches[0];
      if (Math.hypot(t.clientX - o.x, t.clientY - o.y) > MOVE_CANCEL_PX) cancel();
    },
    onTouchEnd: cancel,
    onTouchCancel: cancel,
  };

  // ── actions ────────────────────────────────────────────────────────────────
  const startEdit = () => { setMenu(null); setDraft(text); setSaveError(false); setEditing(true); };
  const copy = async () => {
    setMenu(null);
    try { await navigator.clipboard.writeText(text); toast.success('Comment copied.'); }
    catch { toast.error("Couldn't copy the comment."); }
  };
  const report = async () => {
    setMenu(null);
    if (!user) { toast.error('Sign in to report a comment'); return; }
    const ok = await reportComment(user.id, cfg.commentId, cfg.kind);
    if (ok) toast.success('Report submitted.'); else toast.error("Couldn't submit your report. Try again.");
  };
  const askDelete = () => { setMenu(null); setConfirmDelete(true); };
  const doDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try { await cfg.onDelete(); setConfirmDelete(false); }
    catch { setConfirmDelete(false); toast.error("Couldn't delete this comment. Try again."); }
    finally { setDeleting(false); }
  };
  const save = async () => {
    const next = draft.trim();
    if (!next || next === text.trim() || saving) return;
    setSaving(true); setSaveError(false);
    try { await cfg.onSaveEdit(next); setText(next); setEdited(true); setEditing(false); }
    catch { setSaveError(true); }   // keep the draft
    finally { setSaving(false); }
  };

  const items: { key: string; label: string; icon: ReactNode; danger?: boolean; run: () => void }[] = [];
  if (isAuthor && canEditNow) items.push({ key: 'edit', label: 'Edit comment', icon: <Pencil className="w-4 h-4" />, run: startEdit });
  if (isAuthor || isOwner) items.push({ key: 'delete', label: 'Delete comment', icon: <Trash2 className="w-4 h-4" />, danger: true, run: askDelete });
  items.push({ key: 'copy', label: 'Copy text', icon: <Copy className="w-4 h-4" />, run: copy });
  if (!isAuthor) items.push({ key: 'report', label: 'Report comment', icon: <Flag className="w-4 h-4" />, danger: true, run: report });

  const optionsButton = cfg.pending ? null : (
    <span className="relative inline-block">
      <button type="button" aria-label="Comment options" aria-haspopup="menu" aria-expanded={menu === 'button'}
        onClick={() => setMenu(m => (m ? null : 'button'))}
        className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100">
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {menu === 'button' && !isMobile() && (
        <>
          <div className="fixed inset-0" style={{ zIndex: Z - 1 }} onClick={() => setMenu(null)} />
          <div role="menu" className="absolute right-0 top-8 bg-white rounded-xl shadow-lg border border-gray-100 py-1 w-48" style={{ zIndex: Z }}>
            {items.map(i => (
              <button key={i.key} role="menuitem" onClick={i.run}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 ${i.danger ? 'text-red-600' : 'text-gray-800'}`}>
                {i.icon}{i.label}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );

  const editor = editing ? (
    <div>
      <textarea value={draft} onChange={e => { setDraft(e.target.value); setSaveError(false); }} autoFocus rows={3}
        aria-label="Edit comment"
        className="w-full bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-300 resize-none whitespace-pre-wrap" />
      {saveError && <p className="text-xs text-red-500 mt-1">Couldn't save your changes. Try again.</p>}
      <div className="flex gap-4 mt-1">
        <button onClick={save} disabled={!draft.trim() || draft.trim() === text.trim() || saving}
          className="text-sm font-bold text-blue-600 disabled:opacity-40">{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={() => { setEditing(false); setSaveError(false); }} disabled={saving} className="text-sm font-semibold text-gray-500">Cancel</button>
      </div>
    </div>
  ) : null;

  const overlays = (
    <>
      {(menu === 'press' || (menu === 'button' && isMobile())) && (
        <BottomSheet onClose={() => setMenu(null)} zIndex={Z}>
          <div className="px-2 pb-2">
            {items.map(i => (
              <button key={i.key} onClick={i.run}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm text-left rounded-xl hover:bg-gray-50 ${i.danger ? 'text-red-600' : 'text-gray-800'}`}>
                {i.icon}{i.label}
              </button>
            ))}
            <button onClick={() => setMenu(null)} className="w-full mt-1 px-4 py-3.5 text-sm font-semibold text-gray-600 rounded-xl bg-gray-100">Cancel</button>
          </div>
        </BottomSheet>
      )}
      {confirmDelete && createPortal(
        <div className="fixed inset-0 flex items-center justify-center p-6 bg-black/40" style={{ zIndex: Z }}
          onClick={() => !deleting && setConfirmDelete(false)}>
          <div role="alertdialog" aria-labelledby="del-title" className="w-full max-w-xs bg-white rounded-2xl p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <p id="del-title" className="text-base font-bold text-gray-900">Delete this comment?</p>
            <p className="text-sm text-gray-500 mt-1">This action cannot be undone.</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 disabled:opacity-50">Cancel</button>
              <button onClick={doDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl bg-red-500 text-sm font-bold text-white disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );

  return { text, edited, editing, editor, optionsButton, overlays, longPress };
}

/** Placeholder for a deleted comment that still has replies. */
export function DeletedComment() {
  return <p className="text-sm italic text-gray-400">This comment was deleted.</p>;
}
