// LinkedIn-inspired "Connect" request flow -- reached by tapping Connect
// on someone's profile while connectionStatus is 'none'. Two stages in one
// sheet: a plain "send it" choice, or a short personal note first.
import { useState } from 'react';
import { BottomSheet, SheetCancel } from './BottomSheet';
import { UserAvatar } from './AccountTypeBadge';

export function ConnectFlowSheet({ name, avatar, onSend, onClose }: {
  name: string;
  avatar?: string | null;
  onSend: (note?: string) => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<'choose' | 'note'>('choose');
  const [note, setNote] = useState('');

  if (stage === 'note') {
    return (
      <BottomSheet title="Add a note" onClose={onClose}>
        <div className="px-4 pb-2">
          <textarea
            autoFocus
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={`Hi ${name.split(' ')[0]}, I'd love to connect...`}
            rows={4}
            maxLength={300}
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 bg-gray-50 resize-none"
          />
          <p className="text-[11px] text-gray-400 text-right mt-1">{note.length}/300</p>
        </div>
        <div className="flex gap-2 px-4 pb-2">
          <button onClick={() => setStage('choose')} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm">
            Cancel
          </button>
          <button onClick={() => onSend(note)} className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors">
            Send
          </button>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet onClose={onClose}>
      <div className="px-4 pt-2 pb-4 text-center">
        <div className="flex justify-center mb-3">
          <UserAvatar user={{ id: '', name, avatar: avatar || undefined }} size={56} />
        </div>
        <p className="text-base font-black text-gray-900">Connect with {name.split(' ')[0]}?</p>
        <p className="text-sm text-gray-500 mt-1">Build your professional creative network on FILMONS.</p>
      </div>
      <div className="px-4 pb-2 space-y-2">
        <button onClick={() => onSend()} className="w-full py-3.5 rounded-2xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors">
          Send without a note
        </button>
        <button onClick={() => setStage('note')} className="w-full py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition-colors">
          Add a note
        </button>
      </div>
      <SheetCancel onClick={onClose} />
    </BottomSheet>
  );
}
