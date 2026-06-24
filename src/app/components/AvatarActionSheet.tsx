import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, Eye, Trash2, X, ImagePlus, Upload } from 'lucide-react';

const SHEET_SPRING = { type: 'spring' as const, damping: 32, stiffness: 340, mass: 0.9 };

// ── Reusable animated bottom sheet wrapper ───────────────────────────────────
// Renders via portal to document.body so position:fixed isn't broken by
// ancestor transform stacking contexts (will-change: transform on motion.div).
function BottomSheet({ children, onClose, zIndex = 50 }: {
  children: React.ReactNode;
  onClose: () => void;
  zIndex?: number;
}) {
  const NAV_HEIGHT = 0; // matches MobileBottomNav height

  const sheet = (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0"
        style={{ zIndex }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
          onClick={onClose}
        />
        {/* Sheet — sits just above the bottom nav */}
        <motion.div
          className="absolute inset-x-0 bg-white rounded-t-3xl shadow-2xl overflow-hidden"
          style={{ bottom: NAV_HEIGHT }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={SHEET_SPRING}
        >
          {/* Drag handle */}
          <div className="w-9 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1" />
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(sheet, document.body);
}

// ── Sub-selector: Take photo vs Upload ──────────────────────────────────────
function PhotoSourcePicker({ onFile, onClose }: { onFile: (f: File) => void; onClose: () => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  return (
    <BottomSheet onClose={onClose} zIndex={70}>
      <p className="text-center text-sm font-black text-gray-900 mt-2 mb-3">Choose method</p>
      <div className="px-4 pb-1 space-y-1.5">
        <button onClick={() => cameraRef.current?.click()}
          className="w-full flex items-center gap-3 px-3 py-3.5 rounded-2xl text-sm font-semibold text-gray-800 hover:bg-gray-50 active:bg-gray-100 transition-colors">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
            <Camera className="w-5 h-5 text-blue-600" />
          </div>
          Take a photo
        </button>
        <button onClick={() => uploadRef.current?.click()}
          className="w-full flex items-center gap-3 px-3 py-3.5 rounded-2xl text-sm font-semibold text-gray-800 hover:bg-gray-50 active:bg-gray-100 transition-colors">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
            <Upload className="w-5 h-5 text-purple-600" />
          </div>
          Upload from library
        </button>
      </div>
      <button onClick={onClose}
        className="mx-4 mt-3 mb-1 w-[calc(100%-32px)] py-3.5 rounded-2xl bg-gray-100 text-gray-700 text-sm font-bold">
        Cancel
      </button>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) { onFile(f); onClose(); } }} />
      <input ref={uploadRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) { onFile(f); onClose(); } }} />
    </BottomSheet>
  );
}

// ── Main action sheet ────────────────────────────────────────────────────────
interface AvatarActionSheetProps {
  avatar?: string;
  onChangePhoto: (file: File) => void;
  onDeletePhoto: () => void;
  onViewPhoto: () => void;
  onClose: () => void;
}

export function AvatarActionSheet({
  avatar,
  onChangePhoto, onDeletePhoto, onViewPhoto, onClose,
}: AvatarActionSheetProps) {
  const hasAvatar = !!avatar;
  const [showPicker, setShowPicker] = useState(false);

  if (showPicker) {
    return (
      <PhotoSourcePicker
        onFile={file => { onChangePhoto(file); onClose(); }}
        onClose={() => setShowPicker(false)}
      />
    );
  }

  const actions = hasAvatar
    ? [
        {
          icon: <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center shrink-0"><Eye className="w-4.5 h-4.5 text-gray-600" /></div>,
          label: 'View profile picture',
          sub: 'Full screen preview',
          action: () => { onViewPhoto(); onClose(); },
          danger: false,
        },
        {
          icon: <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center shrink-0"><Camera className="w-4.5 h-4.5 text-blue-600" /></div>,
          label: 'Change profile picture',
          sub: 'Take or upload a new photo',
          action: () => setShowPicker(true),
          danger: false,
        },
        {
          icon: <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center shrink-0"><Trash2 className="w-4.5 h-4.5 text-red-500" /></div>,
          label: 'Delete profile picture',
          sub: 'Remove your current photo',
          action: () => { onDeletePhoto(); onClose(); },
          danger: true,
        },
      ]
    : [
        {
          icon: <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center shrink-0"><ImagePlus className="w-4.5 h-4.5 text-blue-600" /></div>,
          label: 'Add profile picture',
          sub: 'Choose a photo to represent you',
          action: () => setShowPicker(true),
          danger: false,
        },
      ];

  return (
    <BottomSheet onClose={onClose}>
      <div className="px-4 pt-2 pb-1 space-y-0.5">
        {actions.map((a, i) => (
          <button key={i} onClick={a.action}
            className="w-full flex items-center gap-3 px-2 py-3 rounded-2xl transition-colors hover:bg-gray-50 active:bg-gray-100 text-left">
            {a.icon}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${a.danger ? 'text-red-500' : 'text-gray-900'}`}>{a.label}</p>
              <p className="text-[11px] text-gray-400">{a.sub}</p>
            </div>
          </button>
        ))}
      </div>
      <button onClick={onClose}
        className="mx-4 mt-2 mb-1 w-[calc(100%-32px)] py-3.5 rounded-2xl bg-gray-100 text-gray-700 text-sm font-bold">
        Cancel
      </button>
    </BottomSheet>
  );
}

// ── Full screen avatar viewer ─────────────────────────────────────────────────
export function AvatarFullScreen({ avatar, name, onClose, onChangePhoto, onDelete }: {
  avatar: string;
  name?: string;
  onClose: () => void;
  onChangePhoto: (file: File) => void;
  onDelete: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);

  return createPortal((
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        {showPicker && (
          <PhotoSourcePicker
            onFile={f => { onChangePhoto(f); onClose(); }}
            onClose={() => setShowPicker(false)}
          />
        )}

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)', paddingBottom: 12 }}>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 backdrop-blur text-white">
            <X className="w-5 h-5" />
          </button>
          {name && <p className="text-white font-semibold text-sm">{name}</p>}
          <div className="flex gap-2">
            <button onClick={() => setShowPicker(true)}
              className="px-3 py-1.5 rounded-xl bg-white/10 backdrop-blur text-white text-xs font-bold flex items-center gap-1">
              <Camera className="w-3.5 h-3.5" /> Change
            </button>
            <button onClick={() => { onDelete(); onClose(); }}
              className="px-3 py-1.5 rounded-xl bg-red-500/80 backdrop-blur text-white text-xs font-bold flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>

        {/* Circular avatar */}
        <motion.div
          className="w-72 h-72 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl"
          initial={{ scale: 0.82, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.82, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        >
          <img src={avatar} alt={name || 'Avatar'} className="w-full h-full object-cover" />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  ), document.body);
}
