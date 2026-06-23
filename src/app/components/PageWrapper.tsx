/**
 * PageWrapper — consistent full-width page container with optional page header.
 *
 * Usage:
 *   <PageWrapper title="My Listings" breadcrumb={[{ label: 'Home', to: '/' }, { label: 'My Listings' }]}>
 *     …content…
 *   </PageWrapper>
 */
import { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  to?: string;
}

interface PageWrapperProps {
  /** Optional page-level title rendered in a white header bar */
  title?: string;
  /** Optional breadcrumb trail */
  breadcrumb?: Crumb[];
  /** Optional action slot (buttons, etc.) rendered top-right */
  actions?: ReactNode;
  children: ReactNode;
  /** Max-width constraint. Defaults to "7xl" */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl' | '7xl' | 'full';
  /** Remove horizontal padding (for full-bleed sections) */
  noPadding?: boolean;
  className?: string;
}

const MAX_W: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-full',
};

export function PageWrapper({
  title,
  breadcrumb,
  actions,
  children,
  maxWidth = '7xl',
  noPadding = false,
  className = '',
}: PageWrapperProps) {
  const hasHeader = title || breadcrumb?.length || actions;
  const px = noPadding ? '' : 'px-4 sm:px-6 lg:px-8';

  return (
    <div className={`flex-1 bg-gray-50 ${className}`}>
      {hasHeader && (
        <div className="bg-white border-b border-gray-100">
          <div className={`${MAX_W[maxWidth]} mx-auto ${px} py-4`}>
            {/* Breadcrumb */}
            {breadcrumb && breadcrumb.length > 0 && (
              <nav className="flex items-center gap-1 text-xs text-gray-400 mb-2">
                {breadcrumb.map((crumb, idx) => (
                  <span key={idx} className="flex items-center gap-1">
                    {idx > 0 && <ChevronRight className="w-3 h-3 text-gray-300" />}
                    {crumb.to ? (
                      <Link to={crumb.to} className="hover:text-blue-600 transition-colors">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="text-gray-600 font-medium">{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            )}

            {/* Title + Actions */}
            {(title || actions) && (
              <div className="flex items-center justify-between gap-4">
                {title && (
                  <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
                )}
                {actions && <div className="flex items-center gap-2">{actions}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className={`${MAX_W[maxWidth]} mx-auto ${px} py-8`}>
        {children}
      </div>
    </div>
  );
}
