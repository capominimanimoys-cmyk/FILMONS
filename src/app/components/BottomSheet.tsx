import { useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { X } from 'lucide-react';

// Shared slide-up sheet — same backdrop-fade/slide/safe-area/delayed-close
// animation as ListingCard.tsx's BottomMenuSheet (left untouched there, this
// is the generalized version for anything that needs a title + scrollable
// body + optional sticky footer, e.g. Application Details).
export function BottomSheet({ title, onClose, children, footer }: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [show, setShow] = useState(false);
  const closedRef = useRef(false);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
  }, []);

  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    setShow(false);
    setTimeout(onClose, 260);
  }, [onClose]);

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
          transform: show ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 280ms cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1 md:hidden shrink-0" />
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
