// Given a rental's start date + duration, returns the list of calendar
// dates (YYYY-MM-DD) the booking covers -- day-based bookings only.
// Service bookings ('hours' duration) have no time-of-day captured
// anywhere in this app's current booking flow (RentRequestModal collects
// only a start date + an hour count, no start/end time), so an hour-long
// booking can't be safely reduced to "which whole calendar date(s) does
// this block" without either overclaiming the day or guessing a time
// window that was never actually chosen -- callers should treat an empty
// array here as "nothing to block," not "always available."
export function coveredDates(startDate: string, duration: number, durationType: string): string[] {
  if (!startDate || (durationType !== 'day' && durationType !== 'days')) return [];
  const n = Math.max(1, Math.floor(duration) || 1);
  const start = new Date(startDate + 'T00:00:00Z');
  if (isNaN(start.getTime())) return [];
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
