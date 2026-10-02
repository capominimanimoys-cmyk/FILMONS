// A native FILMONS feed card prompting whichever profile field is most
// useful to complete next (see profileCompletion.ts's priority order),
// rendered INSIDE the Connect "For You" feed (Home.tsx splices it into
// connectRenderItems, gated to that tab -- never "Following") -- a
// different paradigm from BusinessIndustryPrompt.tsx (that one's a
// single-field, app-wide panel with its own dedicated cooldown column).
// This one generalizes the same "persist a last-shown timestamp" idea to
// every field via one jsonb column (profile_completion_prompts), read
// back by isProfileCompletionDue() for cooldown-based resurfacing instead
// of a blunt once-per-session cap.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Briefcase, Camera, FileText, Globe2, GraduationCap, Image, Layers, MapPin, Wrench, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { getProfileCompletion, PROFILE_FIELD_COPY, type ProfileField } from '../lib/profileCompletion';

const FIELD_ICON: Record<ProfileField, typeof Briefcase> = {
  identity: Briefcase, location: MapPin, skills: Wrench, gear: Camera, education: GraduationCap,
  photo: Image, bio: FileText, secondaryRoles: Layers, languages: Globe2,
};

export function ProfileCompletionCard() {
  const { user, setUserDirectly } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const { percentage, nextRecommendedField: field } = getProfileCompletion(user);

  // Marks this field as shown the moment the card actually renders (not
  // on mount of some always-present wrapper) -- Home.tsx only mounts this
  // component when isProfileCompletionDue() already said yes, so this
  // write both records the impression AND starts that field's next
  // cooldown window.
  useEffect(() => {
    if (!user || !field) return;
    const now = new Date().toISOString();
    const next = { ...(user.profileCompletionPrompts || {}), [field]: now };
    setUserDirectly({ ...user, profileCompletionPrompts: next });
    supabase.from('profiles').update({ profile_completion_prompts: next }).eq('id', user.id).then(() => {}, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, user?.id]);

  // Dismissing hides this render; Home's cooldown-based gate (not a
  // session cap any more) decides when it's eligible to resurface.
  if (!user || !field || dismissed) return null;
  const copy = PROFILE_FIELD_COPY[field];
  const Icon = FIELD_ICON[field];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mx-4 my-2 relative">
      <button onClick={() => setDismissed(true)} aria-label="Dismiss"
        className="absolute top-3 right-3 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors">
        <X className="w-3.5 h-3.5"/>
      </button>

      <p className="text-sm font-black text-gray-900 pr-6">Complete your FILMONS profile</p>
      <p className="text-xs text-gray-500 mt-1 leading-relaxed pr-6">
        Help creators understand what you do and help FILMONS connect you with the right people and creative work.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${percentage}%` }}/>
        </div>
        <span className="text-xs font-bold text-gray-500 shrink-0">{percentage}% complete</span>
      </div>

      <div className="mt-3.5 flex items-start gap-3 bg-gray-50 rounded-xl p-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <Icon className="w-4.5 h-4.5 text-blue-600"/>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black text-blue-600 uppercase tracking-wide">Next</p>
          <p className="text-sm font-bold text-gray-900 mt-0.5">{copy.title}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{copy.body}</p>
        </div>
      </div>

      <button
        onClick={() => navigate(`/profile?edit=${copy.editSection}`)}
        className="mt-3 w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors"
      >
        {copy.title.replace(/^Add (your |a |the )?/i, 'Add ')}
      </button>
      <button
        onClick={() => navigate('/profile/complete')}
        className="mt-2 w-full flex items-center justify-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors"
      >
        Complete profile <ArrowRight className="w-3 h-3"/>
      </button>
    </div>
  );
}
