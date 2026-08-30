// Reset-window boundary for Opportunity posting/application entitlements
// (see entitlements.ts's `window` field per tier). Server/UTC time --
// this app has no per-user timezone to key off yet, so "the project's
// existing server timezone" is UTC everywhere a boundary is computed.
export function windowStart(unit: 'week' | 'month', now: Date = new Date()): Date {
  if (unit === 'month') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  }
  // Week = Monday 00:00 through Sunday 23:59 UTC. getUTCDay(): 0=Sun..6=Sat.
  const day = now.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysSinceMonday);
  return new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate(), 0, 0, 0, 0));
}
