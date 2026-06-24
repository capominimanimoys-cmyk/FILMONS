/**
 * Filmons — SideDrawer
 * Left-side navigation drawer opened from the ☰ hamburger in the Marketplace header.
 * Focused on secondary actions and account management — does NOT duplicate
 * bottom-nav items (Marketplace, Feed, Create, Inbox, Profile).
 */
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { UserAvatar } from './AccountTypeBadge';
import {
  X, ShoppingBag, Heart, CalendarDays, CreditCard,
  Layers, ShieldCheck, BarChart2, HelpCircle, Mail,
  Settings, Lock, Bell, LogOut,
} from 'lucide-react';

type LucideIcon = React.ComponentType<{ className?: string; strokeWidth?: number }>;

interface Section {
  title: string;
  items: {
    icon:    LucideIcon;
    label:   string;
    to?:     string;
    action?: () => void;
    badge?:  string;
    danger?: boolean;
  }[];
}

interface Props {
  onClose: () => void;
}

export function SideDrawer({ onClose }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const go = (to: string) => { onClose(); navigate(to); };

  const sections: Section[] = [
    {
      title: 'Marketplace',
      items: [
        { icon: ShoppingBag,  label: 'My Listings',         to: '/my-listings'           },
        { icon: Heart,        label: 'Saved Listings',       to: '/profile?tab=saved'     },
        { icon: CalendarDays, label: 'Bookings & Requests',  to: '/my-orders'             },
        { icon: CreditCard,   label: 'Payments & Earnings',  to: '/wallet'                },
      ],
    },
    {
      title: 'Professional',
      items: [
        { icon: Layers,      label: 'Portfolio',    to: '/profile?tab=portfolio' },
        { icon: ShieldCheck, label: 'Verification', to: '/verification'          },
        { icon: BarChart2,   label: 'Analytics',    to: '/dashboard'             },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: HelpCircle, label: 'Help Center',     to: '/help'    },
        { icon: Mail,       label: 'Contact Support',  to: '/contact' },
      ],
    },
    {
      title: 'Settings',
      items: [
        { icon: Settings, label: 'Settings',           to: '/settings'              },
        { icon: Lock,     label: 'Privacy & Security', to: '/settings/privacy'      },
        { icon: Bell,     label: 'Notifications',      to: '/settings/notifications' },
      ],
    },
    {
      title: 'Account',
      items: [
        { icon: LogOut, label: 'Logout', danger: true, action: () => { onClose(); logout?.(); navigate('/login'); } },
      ],
    },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70] bg-black/50"
        style={{ backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed left-0 top-0 bottom-0 z-[71] bg-white flex flex-col shadow-2xl"
        style={{
          width: 'min(300px, 85vw)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          animation: 'drawerSlideIn 0.28s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        <style>{`
          @keyframes drawerSlideIn {
            from { transform: translateX(-100%); }
            to   { transform: translateX(0); }
          }
        `}</style>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-12 pb-4 border-b border-gray-100">
          {user ? (
            <div className="flex items-center gap-3">
              <UserAvatar user={user} size={38} />
              <div className="min-w-0">
                <p className="text-sm font-black text-gray-900 truncate">{user.name}</p>
                <p className="text-[11px] text-gray-400 truncate">@{user.username || user.email?.split('@')[0]}</p>
              </div>
            </div>
          ) : (
            <p className="text-base font-black text-gray-900">Filmons</p>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Nav sections */}
        <div className="flex-1 overflow-y-auto py-3">
          {sections.map(section => (
            <div key={section.title} className="mb-1">
              <p className="px-4 pt-3 pb-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                {section.title}
              </p>
              {section.items.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={() => item.action ? item.action() : go(item.to!)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 ${item.danger ? 'text-red-500' : 'text-gray-700'}`}
                  >
                    <Icon
                      className={`w-[18px] h-[18px] shrink-0 ${item.danger ? 'text-red-500' : 'text-gray-500'}`}
                      strokeWidth={1.75}
                    />
                    <span className="text-sm font-medium flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer brand */}
        <div className="px-4 py-4 border-t border-gray-100">
          <p className="text-[11px] text-gray-300 font-semibold">Filmons V1</p>
        </div>
      </div>
    </>
  );
}
