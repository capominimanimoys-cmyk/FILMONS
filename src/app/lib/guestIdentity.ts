// A stable, per-browser guest identifier -- nothing like this existed
// before (guest-tier limits, e.g. Home's swipe counter, were tracked
// purely in a date-scoped localStorage key with no id sent anywhere, so
// there was no way for a server-side limit to recognize "this is the same
// guest" across requests). Generated once and persisted, so refreshing
// the page or navigating away and back keeps counting against the same
// daily allowance instead of resetting it.
const KEY = 'filmons_guest_id';

export function getGuestId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `guest_${crypto.randomUUID()}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // localStorage unavailable (private browsing edge cases) -- a
    // per-call random id at least never crashes; it just won't persist
    // across refreshes for that session, same limitation as before.
    return `guest_${crypto.randomUUID()}`;
  }
}
