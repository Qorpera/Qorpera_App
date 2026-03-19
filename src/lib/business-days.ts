// ── Business Day Helpers ─────────────────────────────────────────────────────
// Weekdays only (Mon–Fri). No public holiday handling.

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

/**
 * Add N business days to a date. Skips weekends.
 */
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (isWeekday(result)) {
      remaining--;
    }
  }
  return result;
}

/**
 * Count business days between two dates (exclusive of start, inclusive of end).
 */
export function countBusinessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  while (current < end) {
    current.setDate(current.getDate() + 1);
    if (isWeekday(current)) {
      count++;
    }
  }
  return count;
}

/**
 * Check if `now` is within 1 business day of `target`.
 * Returns true when there are 0 or 1 business days remaining before the deadline.
 */
export function isWithinOneBusinessDay(target: Date, now: Date): boolean {
  if (now >= target) return true;
  const remaining = countBusinessDaysBetween(now, target);
  return remaining <= 1;
}
