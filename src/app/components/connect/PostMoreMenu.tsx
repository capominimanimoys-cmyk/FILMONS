// Universal "•••" bottom sheet for Connect cards -- one shared shell so
// every content type (post, connection, Portfolio item/album, event,
// course, recommendation) looks and animates identically, while each
// caller supplies its own contextual action list (content-specific
// actions near the top, universal Save/Copy link/Hide/Report below,
// destructive actions separated by a divider at the bottom). Mobile: slides
// up as a bottom sheet. Desktop: BottomSheet already renders as a small
// centered card there, matching the "anchored dropdown" intent closely
// enough to reuse rather than building a second desktop-only menu shell.
import type { LucideIcon } from 'lucide-react';
import { BottomSheet, SheetAction, SheetCancel } from '../BottomSheet';

export interface MoreMenuAction {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}

export function PostMoreMenu({ actions, destructiveActions, onClose }: {
  /** Content-specific actions first, then the universal Save/Copy
   *  link/View profile/Hide/Report set -- assembled by the caller so each
   *  card only opts into what actually applies to it. */
  actions: MoreMenuAction[];
  /** Rendered after a divider at the very bottom (e.g. Delete). */
  destructiveActions?: MoreMenuAction[];
  onClose: () => void;
}) {
  return (
    <BottomSheet onClose={onClose}>
      <div className="py-1">
        {actions.map((a, i) => <SheetAction key={i} icon={a.icon} label={a.label} onClick={a.onClick} />)}
      </div>
      {!!destructiveActions?.length && (
        <>
          <div className="border-t border-gray-100 my-1" />
          <div className="py-1">
            {destructiveActions.map((a, i) => <SheetAction key={i} icon={a.icon} label={a.label} onClick={a.onClick} destructive />)}
          </div>
        </>
      )}
      <SheetCancel onClick={onClose} />
    </BottomSheet>
  );
}
