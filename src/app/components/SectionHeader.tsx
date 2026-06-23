/**
 * SectionHeader — consistent section title used throughout pages.
 *
 * Usage:
 *   <SectionHeader title="Featured Listings" subtitle="Browse top gear near you" />
 *   <SectionHeader title="My Posts" action={{ label: 'See all', onClick: () => {} }} />
 */
import { ReactNode } from 'react';
import { Button } from './ui/button';
import { Link } from 'react-router';

interface SectionAction {
  label: string;
  to?: string;
  onClick?: () => void;
  variant?: 'link' | 'outline' | 'ghost';
}

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional right-side CTA */
  action?: SectionAction;
  /** Optional icon shown left of title */
  icon?: ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  subtitle,
  action,
  icon,
  className = '',
}: SectionHeaderProps) {
  return (
    <div className={`flex items-end justify-between mb-5 ${className}`}>
      <div>
        <div className="flex items-center gap-2">
          {icon && <span className="text-blue-600">{icon}</span>}
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        </div>
        {subtitle && (
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        )}
      </div>

      {action && (
        action.to ? (
          <Link to={action.to}>
            <Button
              variant={action.variant === 'link' ? 'ghost' : (action.variant || 'ghost')}
              size="sm"
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              {action.label} →
            </Button>
          </Link>
        ) : (
          <Button
            variant={action.variant === 'link' ? 'ghost' : (action.variant || 'ghost')}
            size="sm"
            onClick={action.onClick}
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            {action.label} →
          </Button>
        )
      )}
    </div>
  );
}
