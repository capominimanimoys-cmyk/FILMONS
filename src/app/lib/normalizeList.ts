// profileMeta (see AboutEditor.tsx) is a free-form jsonb blob -- nothing at
// the DB level guarantees skills/gear/secondaryRoles/collab/languages are
// actually arrays. An older record with one of these stored as a plain
// string (or anything else) would otherwise crash the first .join()/.map()
// called on it downstream ("x.join is not a function"). Normalize once at
// the read boundary instead of trusting the value's declared type.
export function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === 'string' && v.trim()) return v.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}
