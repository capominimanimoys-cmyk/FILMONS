// A native FILMONS feed card prompting whichever profile field is most
// useful to complete next (see profileCompletion.ts's priority order),
// rendered INSIDE a feed (Home.tsx splices it into connectRenderItems)
// rather than as a global overlay -- a different paradigm from
// BusinessIndustryPrompt.tsx (that one's a single-field, app-wide panel
// with its own dedicated cooldown column). This one generalizes the same
// "persist a last-shown timestamp" idea to all 5 fields via one jsonb
// column (profile_completion_prompts) instead of 5 dedicated ones.
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { getMissingProfileFields, PROFILE_FIELD_COPY, type ProfileField } from '../lib/profileCompletion';

export function ProfileCompletionCard() {
  const { user, setUserDirectly } = useAuth();
  const navigate = useNavigate();
  const missing = getMissingProfileFields(user);
  const field: ProfileField | undefined = missing[0];

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

  if (!user || !field) return null;
  const copy = PROFILE_FIELD_COPY[field];
  // Multiple fields missing -> the broader, multi-purpose framing from the
  // spec ("Complete your profile" / "...creators, opportunities, gear,
  // services, and learning content"); exactly one left -> that field's own
  // specific copy, since there's nothing else to lead with.
  const isLastField = missing.length === 1;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mx-4 my-2">
      <div className="flex items-start gap-3">
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
          <button
            onClick={() => navigate(`/profile?edit=${copy.editSection}`)}
            className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors"
          >
            Complete profile <ArrowRight className="w-3.5 h-3.5"/>
          </button>
        </div>
      </div>
    </div>
  );
}
