/** Keep the purchase day-of-month when adding months (clamp to the last day). */
export function addCalendarMonths(from: Date, months: number): Date {
  const year = from.getFullYear();
  const month = from.getMonth();
  const day = from.getDate();
  const targetMonthIndex = month + months;
  const lastDay = new Date(year, targetMonthIndex + 1, 0).getDate();
  return new Date(
    year,
    targetMonthIndex,
    Math.min(day, lastDay),
    from.getHours(),
    from.getMinutes(),
    from.getSeconds(),
    from.getMilliseconds()
  );
}

export function parseMaybeDate(raw: unknown): Date | null {
  if (raw == null || raw === '') return null;
  const date = raw instanceof Date ? raw : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Next billing date: same day of month as `startedAt`, strictly after `now`. */
export function nextMonthlyAnniversary(startedAt: Date, now = new Date()): Date {
  if (startedAt.getTime() > now.getTime()) return new Date(startedAt.getTime());
  let months = 1;
  let next = addCalendarMonths(startedAt, months);
  while (next.getTime() <= now.getTime() && months < 240) {
    months += 1;
    next = addCalendarMonths(startedAt, months);
  }
  return next;
}

export function addCalendarDays(from: Date, days: number): Date {
  const next = new Date(from.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/** Paid access ends the day before the next billing anniversary. */
export function monthPeriodExpiresAt(startedAt: Date, now = new Date()): Date {
  return addCalendarDays(nextMonthlyAnniversary(startedAt, now), -1);
}
