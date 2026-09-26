import { normalizeTier } from './reliabilityApi';

// Centralized "what defines this account professionally" resolver -- per
// spec, Business accounts show Business Industry instead of Primary Role
// everywhere; every other account type is unchanged. Call sites pass the
// RESULT into whatever prop a presentational component already expects for
// its role/identity line (usually still literally named `primaryRole`) --
// this intentionally doesn't rename props across the app, only changes
// what value flows into the existing slot. Missing businessIndustry on a
// Business account resolves to undefined (omit the line), never a
// misleading fallback to primaryRole.
export function getDisplayIdentity(u: {
  accountType?: string | null;
  primaryRole?: string | null;
  businessIndustry?: string | null;
}): string | undefined {
  if (normalizeTier(u.accountType ?? undefined) === 'business') return u.businessIndustry || undefined;
  return u.primaryRole || undefined;
}
