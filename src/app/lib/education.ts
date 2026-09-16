// Shared Education & Training taxonomy -- covers traditional education AND
// non-traditional creative training as equally first-class (film/art/music
// schools, academies, certifications, workshops, bootcamps, mentorships,
// self-directed study). Single source of truth used by both the editor
// (AboutEditor.tsx) and the read-only display component (EducationSection.tsx)
// so the two never drift out of sync.
export type EducationType =
  | 'university' | 'film_school' | 'art_school' | 'music_school' | 'creative_academy'
  | 'certification' | 'professional_training' | 'workshop' | 'bootcamp' | 'mentorship'
  | 'online_course' | 'self_directed' | 'other';

export interface EduEntry {
  id: string;
  type: EducationType | '';
  school: string;
  schoolCity?: string;
  schoolProvince?: string;
  degree: string;
  field: string;
  startYear: string;
  endYear: string;
  current: boolean;
  description: string;
  showOnProfile: boolean;
}
export interface EduState { entries: EduEntry[]; training: string[]; }

export const EDUCATION_TYPES: { value: EducationType; label: string; emoji: string }[] = [
  { value: 'university',            label: 'University / College',      emoji: '🎓' },
  { value: 'film_school',           label: 'Film School',                emoji: '🎬' },
  { value: 'art_school',            label: 'Art School',                 emoji: '🎨' },
  { value: 'music_school',          label: 'Music School',               emoji: '🎵' },
  { value: 'creative_academy',      label: 'Creative Academy',           emoji: '🏛️' },
  { value: 'certification',         label: 'Certification',              emoji: '📜' },
  { value: 'professional_training', label: 'Professional Training',      emoji: '🛠️' },
  { value: 'workshop',              label: 'Workshop',                   emoji: '🧪' },
  { value: 'bootcamp',              label: 'Bootcamp',                   emoji: '🚀' },
  { value: 'mentorship',            label: 'Mentorship',                 emoji: '🤝' },
  { value: 'online_course',         label: 'Online Course',              emoji: '💻' },
  { value: 'self_directed',         label: 'Self-directed Program',      emoji: '🧭' },
  { value: 'other',                 label: 'Other',                      emoji: '✳️' },
];
export const EDUCATION_TYPE_LABEL: Record<string, string> = Object.fromEntries(EDUCATION_TYPES.map(t => [t.value, t.label]));
export const EDUCATION_TYPE_EMOJI: Record<string, string> = Object.fromEntries(EDUCATION_TYPES.map(t => [t.value, t.emoji]));

// Presentation-layer field labels per type -- e.g. "Degree" reads oddly on
// a Workshop entry, "Credential" reads oddly on a University entry.
// Only ever changes what a field is CALLED, never whether it's required
// (credential/degree is always optional, per spec).
export const EDUCATION_TYPE_META: Record<string, { orgLabel: string; credentialLabel: string; orgPlaceholder: string }> = {
  university:            { orgLabel: 'School / University', credentialLabel: 'Degree',               orgPlaceholder: 'e.g. University of British Columbia' },
  film_school:           { orgLabel: 'School',               credentialLabel: 'Diploma / Credential', orgPlaceholder: 'e.g. Vancouver Film School' },
  art_school:            { orgLabel: 'School',               credentialLabel: 'Diploma / Credential', orgPlaceholder: 'e.g. Emily Carr University' },
  music_school:          { orgLabel: 'School',               credentialLabel: 'Diploma / Credential', orgPlaceholder: 'e.g. SAE Institute' },
  creative_academy:      { orgLabel: 'Academy',               credentialLabel: 'Credential',           orgPlaceholder: 'e.g. Toronto Creative Academy' },
  certification:         { orgLabel: 'Issued By',             credentialLabel: 'Certification',        orgPlaceholder: 'e.g. Avid, Adobe, Blackmagic' },
  professional_training: { orgLabel: 'Organization',          credentialLabel: 'Credential',           orgPlaceholder: 'e.g. RED Digital Cinema' },
  workshop:              { orgLabel: 'Organization',          credentialLabel: 'Credential',           orgPlaceholder: 'e.g. RED Digital Cinema' },
  bootcamp:              { orgLabel: 'Organization',          credentialLabel: 'Credential',           orgPlaceholder: 'e.g. General Assembly' },
  mentorship:            { orgLabel: 'Mentor / Organization', credentialLabel: 'Credential',           orgPlaceholder: 'e.g. Name or studio' },
  online_course:         { orgLabel: 'Platform / Provider',   credentialLabel: 'Certificate',          orgPlaceholder: 'e.g. MasterClass, Skillshare' },
  self_directed:         { orgLabel: 'Program Name',          credentialLabel: 'Credential',           orgPlaceholder: 'e.g. Self-directed cinematography study' },
  other:                 { orgLabel: 'School / Organization', credentialLabel: 'Credential',           orgPlaceholder: '' },
};

export function blankEduEntry(): EduEntry {
  return {
    id: Math.random().toString(36).slice(2),
    type: '',
    school: '', schoolCity: '', schoolProvince: '',
    degree: '', field: '', startYear: '', endYear: '',
    current: false, description: '', showOnProfile: true,
  };
}

// Read helper mirroring how AboutEditor initializes `edu` from a possibly
// malformed/legacy `education` field -- reused by EducationSection.tsx so
// both places agree on what counts as a valid entries array.
export function parseEducation(raw: unknown): EduState {
  if (raw && typeof raw === 'object' && Array.isArray((raw as any).entries)) return raw as EduState;
  return { entries: [], training: [] };
}
