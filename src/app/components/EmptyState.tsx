/**
 * EmptyState — reusable zero-data placeholder.
 * Drop it wherever a list, grid, or feed has no items.
 */
import { ReactNode } from 'react';
import { Button } from './ui/button';

interface EmptyStateProps {
  /** Large emoji or lucide icon element shown at the top */
  icon?: ReactNode;
  /** Bold heading */
  title: string;
  /** Optional supporting description */
  description?: string;
  /** Label for the primary CTA button */
  actionLabel?: string;
  /** Handler for the primary CTA button */
  onAction?: () => void;
  /** Optional secondary action */
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
  /** Extra classes on the root container */
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondaryAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-16 px-6 ${className}`}
    >
      {icon && (
        <div className="mb-5 text-5xl opacity-80">{icon}</div>
      )}
      <h3 className="text-lg font-semibold text-gray-800 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 max-w-xs mb-6 leading-relaxed">{description}</p>
      )}
      {(actionLabel || secondaryLabel) && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {actionLabel && onAction && (
            <Button onClick={onAction} className="bg-blue-600 hover:bg-blue-700">
              {actionLabel}
            </Button>
          )}
          {secondaryLabel && onSecondaryAction && (
            <Button variant="outline" onClick={onSecondaryAction}>
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
