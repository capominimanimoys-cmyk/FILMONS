// Recognizes Stripe error messages that mean "this account reference is
// bad" (deleted, wrong mode/API key, or a leftover Express-style account
// from before this session's Custom-account rewrite that the platform was
// never authorized to edit identity/bank fields on) -- as opposed to a
// genuine validation error the user needs to fix (a bad field value, a
// missing requirement, etc.), which should always surface directly rather
// than being silently retried as a fresh account.
//
// Confirmed real-world phrasings, kept in one place since Stripe doesn't
// use a single consistent wording for this class of error and each one
// found so far had to be added after actually hitting it live:
//   "No such account: 'acct_...'"
//   "This application is not authorized to edit the following attributes: ..."
//   "The provided key '...' does not have access to account '...' (or that
//    account does not exist). Application access may have been revoked."
const PATTERNS = [
  /no such account/i,
  /not authorized to edit/i,
  /does not have access to account/i,
  /application access may have been revoked/i,
];

export function isStaleAccountError(message: string | null | undefined): boolean {
  if (!message) return false;
  return PATTERNS.some(p => p.test(message));
}
