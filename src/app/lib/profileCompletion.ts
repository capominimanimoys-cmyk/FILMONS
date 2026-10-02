// FILMONS Profile Completion -- the one centralized resolver every surface
// (Home feed card, Profile's own Profile Strength card, the Complete
// Profile checklist page) reads, so none of them can ever disagree on the
// percentage. Field order doubles as priority order (first incomplete =
// what gets prompted next); weight drives the percentage. identity/
// skills/location/gear/education carry "meaningful weight" per spec --
// they're what CategoryResults.tsx's "Because you use {gear}"/"Based on
// your skills in {skill}"/"Popular near {city}" rows personalize on.
// photo/bio/secondaryRoles/languages are real but lower-weight.
//
// Portfolio is deliberately NOT a field here -- checking it needs a
// separate getPortfolioItems() fetch, and this resolver has to stay a
// cheap synchronous read over the already-loaded User object so the Home
// feed (which calls it on every render) never pays for an extra request.
import type { User } from '../types';
import { normalizeTier } from './reliabilityApi';
import { toStringArray } from './normalizeList';

export type ProfileField = 'identity' | 'skills' | 'location' | 'gear' | 'education' | 'photo' | 'bio' | 'secondaryRoles' | 'languages';

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
  location: {
    title: 'Add your location',
    body: 'Discover creators, gear, services, and opportunities around you.',
    editSection: 'location',
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
  photo: {
    title: 'Add a profile photo',
    body: 'A real photo helps people recognize and trust your profile.',
    editSection: 'photo',
  },
  bio: {
    title: 'Add your bio',
    body: 'Tell people what you do and what makes your work stand out.',
    editSection: 'bio',
  },
  secondaryRoles: {
    title: 'Add a secondary role',
    body: 'Show the other ways you work so people searching for them can find you.',
    editSection: 'identity',
  },
  languages: {
    title: 'Add the languages you speak',
    body: 'Help creators and clients know how they can communicate with you.',
    editSection: 'skills',
  },
};

/** Business accounts complete "identity" via Business Industry instead of
 *  Professional Identity (primary_role) -- same account-type branch
 *  getDisplayIdentity()/BusinessIndustryPrompt.tsx already use. */
function hasIdentity(user: User): boolean {
  return normalizeTier(user.accountType) === 'business' ? !!user.businessIndustry : !!user.primaryRole;
}

interface FieldDef { id: ProfileField; weight: number; complete: (user: User) => boolean }

// Order = priority order (missingFields[0] is what gets prompted next) --
// identity, location, skills, gear, education per the Home Profile
// Completion spec's explicit 1-5 priority list. Weight = contribution to
// the percentage, independent of this ordering; identity/location/skills/
// gear/education (80 of 100 points total) are the "meaningful weight"
// fields the spec calls out, the rest make up the remaining 20.
const FIELDS: FieldDef[] = [
  { id: 'identity', weight: 20, complete: hasIdentity },
  { id: 'location', weight: 15, complete: u => !!u.city },
  { id: 'skills', weight: 15, complete: u => !!u.skills?.length },
  { id: 'gear', weight: 15, complete: u => !!u.gear?.length },
  { id: 'education', weight: 15, complete: u => !!u.education?.length },
  { id: 'photo', weight: 10, complete: u => !!u.avatar },
  { id: 'bio', weight: 5, complete: u => !!u.bio?.trim() },
  { id: 'secondaryRoles', weight: 2.5, complete: u => !!toStringArray((u as any).profileMeta?.secondaryRoles).length },
  { id: 'languages', weight: 2.5, complete: u => !!toStringArray((u as any).profileMeta?.languages).length },
];
const TOTAL_WEIGHT = FIELDS.reduce((sum, f) => sum + f.weight, 0);

export interface ProfileCompletion {
  percentage: number;
  completedFields: ProfileField[];
  missingFields: ProfileField[];
  nextRecommendedField: ProfileField | null;
  isComplete: boolean;
  accountType: ReturnType<typeof normalizeTier>;
}

const EMPTY: ProfileCompletion = { percentage: 0, completedFields: [], missingFields: [], nextRecommendedField: null, isComplete: false, accountType: normalizeTier(undefined) };

/** The single source of truth for profile completion -- every surface
 *  (Home's feed card, Profile's own Profile Strength card, the Complete
 *  Profile checklist page) must call this rather than compute its own
 *  version, so they can never disagree on the number. */
export function getProfileCompletion(user: User | null | undefined): ProfileCompletion {
  if (!user) return EMPTY;
  const completedFields: ProfileField[] = [];
  const missingFields: ProfileField[] = [];
  let earned = 0;
  for (const f of FIELDS) {
    if (f.complete(user)) { completedFields.push(f.id); earned += f.weight; }
    else missingFields.push(f.id);
  }
  return {
    percentage: Math.round((earned / TOTAL_WEIGHT) * 100),
    completedFields, missingFields,
    nextRecommendedField: missingFields[0] ?? null,
    isComplete: missingFields.length === 0,
    accountType: normalizeTier(user.accountType),
  };
}

/** Thin pass-through for the one pre-existing call site (Home.tsx's feed
 *  splice condition) -- not a second calculation, just a narrower view of
 *  getProfileCompletion's own missingFields. */
export function getMissingProfileFields(user: User | null | undefined): ProfileField[] {
  return getProfileCompletion(user).missingFields;
}

/** The 5 "meaningful weight" fields (identity/location/skills/gear/
 *  education) -- used by the Marketplace swipe card's checklist, which
 *  per spec only ever shows these 5, not the bonus photo/bio/
 *  secondaryRoles/languages fields. */
export const CORE_FIELDS: ProfileField[] = ['identity', 'location', 'skills', 'gear', 'education'];

/** Cooldown-based resurfacing, modeled directly on
 *  BusinessIndustryPrompt.tsx's isDue()/COOLDOWN_MS -- same 6h window,
 *  reused here instead of this morning's blunt "once ever per session"
 *  gate. Both Home surfaces (Marketplace swipe deck, Connect feed) call
 *  this with the SAME field's timestamp (profile_completion_prompts is
 *  shared, not per-surface), so showing the card on one surface also
 *  cools the other down for the same window -- satisfies "never show
 *  large prompts back-to-back across Marketplace + Connect" without a
 *  separate cross-surface tracker. */
const COMPLETION_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export function isProfileCompletionDue(user: User | null | undefined, field: ProfileField | null, cooldownMs = COMPLETION_COOLDOWN_MS): boolean {
  if (!user || !field) return false;
  const last = user.profileCompletionPrompts?.[field];
  if (!last) return true;
  return Date.now() - new Date(last).getTime() > cooldownMs;
}
