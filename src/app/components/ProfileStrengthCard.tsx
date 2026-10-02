// Private "Profile strength" card -- owner-only, shown on the user's own
// Profile page (never on HostProfile.tsx, which renders other people's
// profiles and never imports this). Reuses the same centralized
// getProfileCompletion() resolver ProfileCompletionCard.tsx (Home feed)
// and CompleteProfilePage.tsx both read, so the percentage shown here can
// never disagree with either of those.
import { useNavigate } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getProfileCompletion } from '../lib/profileCompletion';

export function ProfileStrengthCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const completion = getProfileCompletion(user);
  // TEMP DEBUG -- remove once the "Profile Strength not visible" report is
  // resolved. Logs every render so we can see exactly what the resolver
  // saw for this user (percentage/missing fields) and which guard, if
  // any, returned null instead of rendering the card.
  console.log('[ProfileStrengthCard]', {
    hasUser: !!user,
    userId: user?.id,
    percentage: completion.percentage,
    completedFields: completion.completedFields,
    missingFields: completion.missingFields,
    nextRecommendedField: completion.nextRecommendedField,
    isComplete: completion.isComplete,
    willRender: !!user && !completion.isComplete,
    rawEducation: user?.education,
    rawAvatar: user?.avatar,
    rawBio: user?.bio,
    rawSkills: user?.skills,
    rawGear: user?.gear,
    rawCity: user?.city,
    rawPrimaryRole: user?.primaryRole,
    rawBusinessIndustry: user?.businessIndustry,
    rawAccountType: user?.accountType,
  });
  if (!user || completion.isComplete) return null;

  return (
    <button onClick={() => navigate('/profile/complete')}
      className="w-full flex items-center gap-4 mx-4 my-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm text-left hover:bg-gray-50 transition-colors"
      style={{ width: 'calc(100% - 2rem)' }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-black text-gray-900">Profile strength</p>
          <p className="text-sm font-black text-gray-900 shrink-0">{completion.percentage}% complete</p>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${completion.percentage}%` }}/>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Add {completion.missingFields.length} more detail{completion.missingFields.length === 1 ? '' : 's'} to improve your visibility on FILMONS.
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0"/>
    </button>
  );
}
