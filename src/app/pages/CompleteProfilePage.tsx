// FILMONS -- /profile/complete. A dedicated checklist for every field
// getProfileCompletion() tracks, reusing VerificationStatusPage.tsx's
// divide-y row layout as its structural precedent. Every "Add" action
// routes back through /profile?edit={section} -- the exact same deep
// links ProfileCompletionCard.tsx's CTA and ProfileStrengthCard already
// use -- so there is no second copy of any field editor anywhere.
import { useNavigate } from 'react-router';
import { ArrowLeft, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getProfileCompletion, PROFILE_FIELD_COPY } from '../lib/profileCompletion';

export function CompleteProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const completion = getProfileCompletion(user);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-14 lg:top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-700"/>
        </button>
        <h1 className="text-base font-black text-gray-900">Complete your profile</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
        <div>
          <p className="text-sm text-gray-500 leading-relaxed">
            Add these details to improve your visibility and get better recommendations.
          </p>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-2xl font-black text-gray-900">{completion.percentage}%</p>
            {completion.isComplete && <span className="text-sm font-bold text-green-600">Profile complete ✓</span>}
          </div>
          <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${completion.percentage}%` }}/>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
          {completion.completedFields.map(id => (
            <div key={id} className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <Check className="w-4 h-4 text-green-600"/>
              </div>
              <p className="text-sm font-semibold text-gray-900 flex-1 min-w-0">{PROFILE_FIELD_COPY[id].title.replace(/^Add (your |a |the )?/i, '')}</p>
            </div>
          ))}
          {completion.missingFields.map(id => {
            const copy = PROFILE_FIELD_COPY[id];
            return (
              <div key={id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 rounded-full bg-gray-300"/>
                </div>
                <p className="text-sm font-semibold text-gray-900 flex-1 min-w-0">{copy.title.replace(/^Add (your |a |the )?/i, '')}</p>
                <button onClick={() => navigate(`/profile?edit=${copy.editSection}`)}
                  className="shrink-0 px-3.5 py-1.5 rounded-full bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 transition-colors">
                  Add
                </button>
              </div>
            );
          })}
        </div>

        <div className="pb-24"/>
      </div>
    </div>
  );
}
