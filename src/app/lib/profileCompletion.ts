// FILMONS Profile Completion -- tracks the 5 fields that drive
// personalization (see CategoryResults.tsx's new "Because you use
// {gear}"/"Based on your skills in {skill}"/"Popular near {city}" rows),
// in priority order (first incomplete = what gets prompted next).
import type { User } from '../types';
import { normalizeTier } from './reliabilityApi';

export type ProfileField = 'identity' | 'skills' | 'gear' | 'education' | 'location';

export const PROFILE_FIELD_COPY: Record<ProfileField, { title: string; body: string; editSection: string }> = {
  identity: {
    title: 'Add your professional identity',
    body: 'Tell FILMONS what you do so we can recommend relevant opportunities, creators, and content.',
    editSection: 'identity',
  },
  skills: {
    title: 'Add your skills & specialties',
    body: 'Tell FILMONS what you do so we can recommend more relevant opportunities, creators, and content.',
    editSection: 'skills',
  },
  gear: {
    title: 'Add your gear & tools',
    body: 'Tell FILMONS what you shoot with so we can recommend relevant gear, rentals, and services.',
    editSection: 'gear',
  },
  education: {
    title: 'Add your education & training',
    body: 'Share your background so FILMONS can connect you with relevant courses and creators.',
    editSection: 'education',
  },
  location: {
    title: 'Add your location',
    body: 'Discover creators, gear, services, and opportunities around you.',
    editSection: 'location',
  },
};

/** Business accounts complete "identity" via Business Industry instead of
 *  Professional Identity (primary_role) -- same account-type branch
 *  getDisplayIdentity()/BusinessIndustryPrompt.tsx already use. */
function hasIdentity(user: User): boolean {
  return normalizeTier(user.accountType) === 'business' ? !!user.businessIndustry : !!user.primaryRole;
}

/** Fields the viewer hasn't filled in yet, in priority order -- the first
 *  entry is what a completion card should prompt next. Empty array means
 *  fully complete; callers should stop showing any completion UI. */
export function getMissingProfileFields(user: User | null | undefined): ProfileField[] {
  if (!user) return [];
  const missing: ProfileField[] = [];
  if (!hasIdentity(user)) missing.push('identity');
  if (!user.skills?.length) missing.push('skills');
  if (!user.gear?.length) missing.push('gear');
  if (!user.education?.length) missing.push('education');
  if (!user.city) missing.push('location');
  return missing;
}
