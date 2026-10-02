// A native FILMONS feed card prompting whichever profile field is most
// useful to complete next (see profileCompletion.ts's priority order),
// rendered INSIDE a feed (Home.tsx splices it into connectRenderItems)
// rather than as a global overlay -- a different paradigm from
// BusinessIndustryPrompt.tsx (that one's a single-field, app-wide panel
// with its own dedicated cooldown column). This one generalizes the same
// "persist a last-shown timestamp" idea to all fields via one jsonb
// column (profile_completion_prompts) instead of one dedicated column
// per field.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { getProfileCompletion, PROFILE_FIELD_COPY } from '../lib/profileCompletion';

export function ProfileCompletionCard() {
  const { user, setUserDirectly } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const { percentage, missingFields, nextRecommendedField: field } = getProfileCompletion(user);

  // Marks this field as shown the moment the card actually renders (not
  // on mount of some always-present wrapper) -- Home.tsx only mounts this
  // component when it's already decided to show it this session, so this
  // write only ever fires once per real appearance.
  useEffect(() => {
    if (!user || !field) return;
    const now = new Date().toISOString();
    const next = { ...(user.profileCompletionPrompts || {}), [field]: now };
    setUserDirectly({ ...user, profileCompletionPrompts: next });
    supabase.from('profiles').update({ profile_completion_prompts: next }).eq('id', user.id).then(() => {}, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, user?.id]);

  // Dismissing just hides this one render -- Home.tsx's own
  // sessionStorage cap already guarantees this card is spliced in at most
  // once per session, so there's nothing else to persist here.
  if (!user || !field || dismissed) return null;
  const copy = PROFILE_FIELD_COPY[field];
  // Multiple fields missing -> the broader, multi-purpose framing from the
  // spec ("Complete your profile" / "...creators, opportunities, gear,
  // services, and learning content") plus a short "N things left" list;
  // exactly one left -> that field's own specific copy, since there's
  // nothing else to lead with or list.
  const isLastField = missingFields.length === 1;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mx-4 my-2 relative">
      <button onClick={() => setDismissed(true)} aria-label="Dismiss"
        className="absolute top-3 right-3 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors">
        <X className="w-3.5 h-3.5"/>
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-blue-600"/>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-gray-900">
            {isLastField ? copy.title : 'Complete your profile'}
          </p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            {isLastField
              ? copy.body
              : 'Help FILMONS connect you with the right creators, opportunities, gear, services, and learning content.'}
          </p>

          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${percentage}%` }}/>
            </div>
            <span className="text-xs font-bold text-gray-500 shrink-0">{percentage}%</span>
          </div>

          {!isLastField && (
            <div className="mt-2.5 space-y-1">
              <p className="text-xs font-bold text-gray-500">{missingFields.length} things left</p>
              <ul className="space-y-0.5">
                {missingFields.slice(0, 3).map(f => (
                  <li key={f} className="text-xs text-gray-500 flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-gray-300 shrink-0"/>
                    {PROFILE_FIELD_COPY[f].title.replace(/^Add (your |a |the )?/i, 'Add ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={() => navigate(`/profile?edit=${copy.editSection}`)}
            className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors"
          >
            {isLastField ? 'Complete profile' : 'Continue setup'} <ArrowRight className="w-3.5 h-3.5"/>
          </button>
        </div>
      </div>
    </div>
  );
}
