// Profile page's 3-dot menu -- didn't exist anywhere before (Profile.tsx's
// old "Share" button bypassed a sheet entirely and navigated straight to
// /share-card; HostProfile.tsx had no menu at all). Deliberately minimal:
// no "Block" here -- the only existing block primitive (chatApi.blockUser)
// is conversation-scoped, not a real user-level block, and half-building
// that concept isn't part of this redesign.
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Share2, Settings, Flag } from 'lucide-react';
import { BottomSheet, SheetCancel } from '../BottomSheet';
import { reportPortfolioContent } from '../../lib/portfolioApi';
import { logProfileEngagement } from '../../lib/profileEngagement';

const rowClass = 'flex items-center gap-3 w-full px-4 py-3.5 text-sm text-gray-800 hover:bg-gray-50 rounded-xl transition-colors';

export function ProfileActionSheet({
  isOwner, profileUrl, targetUserId, reporterId, onClose,
}: {
  isOwner: boolean;
  profileUrl: string;
  targetUserId: string;
  reporterId?: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const run = (fn: () => void) => { onClose(); fn(); };

  const handleShare = async () => {
    // Profile Interaction: only a VIEWER sharing someone else's profile
    // counts -- the owner sharing their own profile isn't engagement with
    // themselves.
    if (!isOwner) logProfileEngagement(targetUserId, 'profile_share', reporterId);
    if (navigator.share) { navigator.share({ url: profileUrl }).catch(() => {}); return; }
    try { await navigator.clipboard.writeText(profileUrl); toast.success('Link copied'); } catch { toast.error('Could not copy link'); }
  };

  const handleReport = async () => {
    if (!reporterId) { navigate('/login'); return; }
    if (!window.confirm('Report this profile to Filmons?')) return;
    const ok = await reportPortfolioContent(reporterId, targetUserId, 'profile' as any);
    toast[ok ? 'success' : 'error'](ok ? 'Reported. Thanks for letting us know.' : 'Could not submit report. Please try again.');
  };

  return (
    <BottomSheet onClose={onClose}>
      <div className="px-2 py-1">
        <button onClick={() => run(handleShare)} className={rowClass}>
          <Share2 className="w-4 h-4 text-gray-400" /> Share Profile
        </button>
        {isOwner ? (
          <button onClick={() => run(() => navigate('/settings'))} className={rowClass}>
            <Settings className="w-4 h-4 text-gray-400" /> Settings
          </button>
        ) : (
          <button onClick={() => run(handleReport)} className={rowClass + ' text-red-600'}>
            <Flag className="w-4 h-4" /> Report
          </button>
        )}
        <div className="border-t border-gray-50 mt-1" />
        <SheetCancel onClick={onClose} />
      </div>
    </BottomSheet>
  );
}
