import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

// Shared slide-up sheet — same backdrop-fade/slide/safe-area/delayed-close
// animation as ListingCard.tsx's BottomMenuSheet (left untouched there, this
// is the generalized version for anything that needs a title + scrollable
// body + optional sticky footer, e.g. Application Details). Mount/unmount
// this component from the parent (`{open && <BottomSheet ...>}`) rather
// than passing an `open` prop — `close()` delays the real `onClose` call
// until the exit animation finishes.
export function BottomSheet({ title, onClose, children, footer }: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [show, setShow] = useState(false);
  const [dragY, setDragY] = useState(0);
  const closedRef = useRef(false);
  const dragging = useRef(false);
  const startY = useRef(0);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
  }, []);

  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    setShow(false);
    setTimeout(onClose, 260);
  }, [onClose]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    startY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const delta = e.clientY - startY.current;
    if (delta > 0) setDragY(delta);
  };
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragY > 100) { close(); return; }
    setDragY(0);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm"
        style={{ opacity: show ? 1 : 0, transition: 'opacity 240ms ease' }}
        onClick={close}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[70] bg-white rounded-t-3xl shadow-2xl flex flex-col md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:bottom-4 md:w-full md:max-w-lg md:rounded-3xl"
        style={{
          maxHeight: '92vh',
          transform: show ? `translateY(${dragY}px)` : 'translateY(100%)',
          transition: dragging.current ? 'none' : 'transform 280ms cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        <div
          className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1 md:hidden shrink-0 touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        {title && (
          <div className="flex items-center justify-between px-5 pt-3 pb-2 shrink-0 border-b border-gray-100">
            <p className="text-sm font-black text-gray-900">{title}</p>
            <button onClick={close} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1" style={{ paddingBottom: footer ? 0 : 'env(safe-area-inset-bottom)' }}>
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-gray-100 px-4 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

export function SheetAction({
  icon: Icon, label, onClick, destructive = false,
}: {
  icon: any;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-left transition-colors ${
        destructive ? 'text-red-500 hover:bg-red-50' : 'text-gray-800 hover:bg-gray-50'
      }`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${destructive ? 'text-red-500' : 'text-gray-400'}`} />
      {label}
    </button>
  );
}

export function SheetCancel({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full py-3 text-sm font-black text-gray-500 text-center">
      Cancel
    </button>
  );
}
