// Shared by request-payout (payout arrival estimate) and stripe-webhook
// (funds-availability hold for Creator+/Professional/Business earnings).
// Skips Saturday/Sunday only — no statutory-holiday calendar.
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}
