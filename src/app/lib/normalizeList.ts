// profileMeta (see AboutEditor.tsx) is a free-form jsonb blob -- nothing at
// the DB level guarantees skills/gear/secondaryRoles/collab/languages are
// actually arrays. An older record with one of these stored as a plain
// string (or anything else) would otherwise crash the first .join()/.map()
// called on it downstream ("x.join is not a function"). Normalize once at
// the read boundary instead of trusting the value's declared type.
// "null"/"undefined" as literal text (not the JS values) show up when
// something upstream stringified a genuinely-empty value before it got
// here -- e.g. a record where secondaryRoles was stored as the 4-character
// string "null" -- and would otherwise survive as a garbage entry ("Also
// Works As: null" rendered to the user) instead of being treated as empty.
const EMPTY_TOKENS = new Set(['null', 'undefined']);
const isRealValue = (s: string) => !!s && !EMPTY_TOKENS.has(s.toLowerCase());

export function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(x => String(x ?? '').trim()).filter(isRealValue);
  if (typeof v === 'string' && v.trim()) return v.split(',').map(s => s.trim()).filter(isRealValue);
  return [];
}
