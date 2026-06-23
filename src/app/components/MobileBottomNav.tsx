import { Link, useLocation } from 'react-router';
import { Home, Search, Plus, MessageCircle, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { chatApi } from '../lib/api';
import { useState, useEffect } from 'react';
import { captureSnapshot } from '../lib/smartAnimate';

export function MobileBottomNav() {
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  useEffect(() => {
    if (!user) { setUnreadMsgs(0); return; }
    const update = () => setUnreadMsgs(chatApi.getUnreadCount(user.id));
    update();
    const t = setInterval(update, 15_000);
    // Instant update when a conversation is marked read
    window.addEventListener('filmons:unread-changed', update);
    return () => { clearInterval(t); window.removeEventListener('filmons:unread-changed', update); };
  }, [user?.id]);

  const tabs = [
    { to: '/',                                   Icon: Home,          label: 'Home',     badge: 0,          isPrimary: false },
    { to: '/search',                             Icon: Search,        label: 'Search',   badge: 0,          isPrimary: false },
    { to: '/create-listing',                     Icon: null,          label: 'Create',   badge: 0,          isPrimary: true  },
    { to: isAuthenticated ? '/inbox'   : '/login', Icon: MessageCircle, label: 'Messages', badge: unreadMsgs, isPrimary: false },
    { to: isAuthenticated ? '/profile' : '/login', Icon: User,          label: 'Profile',  badge: 0,          isPrimary: false },
  ] as const;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-100/80"
      style={{
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-end">
        {tabs.map(({ to, Icon, label, badge, isPrimary }) => {
          // Home tab: only exact match
          const isHome   = to === '/';
          const isActive = !isPrimary && (
            isHome ? location.pathname === '/' : location.pathname.startsWith(to as string)
          );

          if (isPrimary) {
            return (
              <Link
                key={to}
                to={to}
                onClick={captureSnapshot}
                className="flex-1 flex flex-col items-center justify-center pt-1.5 pb-1"
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all active:scale-95 mb-0.5"
                  style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
                >
                  <Plus className="w-6 h-6 text-white" strokeWidth={2.5}/>
                </div>
                <span className="text-[9px] font-semibold tracking-wide text-gray-400">{label}</span>
              </Link>
            );
          }

          return (
            <Link
              key={to}
              to={to}
              onClick={captureSnapshot}
              className="flex-1 flex flex-col items-center justify-center pt-2 pb-1 relative"
            >
              {/* Active pip */}
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full bg-black"
                style={{
                  width:   isActive ? '28px' : '0px',
                  opacity: isActive ? 1 : 0,
                  transition: 'width 220ms cubic-bezier(0.34,1.4,0.64,1), opacity 150ms ease',
                }}
              />

              <div className="relative">
                {Icon && (
                  <Icon
                    className={`transition-all ${isActive ? 'text-black' : 'text-gray-400'}`}
                    style={{
                      width:       isActive ? '26px' : '24px',
                      height:      isActive ? '26px' : '24px',
                      strokeWidth: isActive ? 2.25 : 1.75,
                      transition: 'width 200ms cubic-bezier(0.34,1.4,0.64,1), height 200ms, color 150ms ease',
                    }}
                  />
                )}
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 min-w-[15px] h-[15px] bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>

              <span
                className="text-[9px] font-semibold mt-0.5 tracking-wide"
                style={{
                  color:   isActive ? '#000' : '#9ca3af',
                  opacity: isActive ? 1 : 0.8,
                  transition: 'color 150ms ease',
                }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
