// Shared "View [Name]'s Portfolio ->" action for Portfolio Post/Album
// cards -- converts discovery of ONE piece of work into discovery of the
// creator's whole Portfolio. One implementation instead of three
// divergent labels/positions across PortfolioProjectCard ("View in
// Portfolio"), PortfolioFeedCard ("View portfolio", below the engagement
// row), and PortfolioAlbumCard ("View album ->", no personalized
// Portfolio link at all). Always sits below media/topics and above the
// interaction bar, styled as a lightweight text action, never a button.
import { useNavigate } from 'react-router';
import { ArrowRight } from 'lucide-react';

export function ViewPortfolioLink({ creatorId, creatorFirstName, isOwn, className, onNavigate }: {
  creatorId: string;
  creatorFirstName: string;
  isOwn: boolean;
  className?: string;
  /** Fired right before navigating -- e.g. logProfileEngagement's
   * 'view_portfolio_click' event. */
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <button
      onClick={e => { e.stopPropagation(); onNavigate?.(); navigate(`/portfolio/${creatorId}`); }}
      className={`flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors ${className ?? ''}`}
    >
      {isOwn ? 'View your Portfolio' : `View ${creatorFirstName}'s Portfolio`} <ArrowRight className="w-3.5 h-3.5" />
    </button>
  );
}
