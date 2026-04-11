import { DateTime } from 'luxon';

/**
 * For a recurring series row, apply the edit form’s wall-clock start time in `zone` on this row’s
 * local calendar day, then add the same UTC millisecond length as the form’s start→end (matches
 * `EventService.create`’s `durationMs` and avoids Luxon `Duration` + DST quirks collapsing siblings).
 */
export function seriesOccurrenceStartEndFromForm(args: {
  rowStartUtc: Date;
  formStartUtc: Date;
  formEndUtc: Date;
  zone: string;
  isAllDay: boolean;
}): { start: Date; end: Date } {
  const zone = args.zone?.trim() || 'UTC';

  const sForm = DateTime.fromMillis(args.formStartUtc.getTime(), { zone: 'utc' }).setZone(zone);
  const eForm = DateTime.fromMillis(args.formEndUtc.getTime(), { zone: 'utc' }).setZone(zone);
  const occ = DateTime.fromMillis(args.rowStartUtc.getTime(), { zone: 'utc' }).setZone(zone);

  if (args.isAllDay) {
    const formStartDay = sForm.startOf('day');
    const formEndDay = eForm.startOf('day');
    const deltaDays = Math.trunc(formEndDay.diff(formStartDay, 'days').days);
    const newStartL = occ.startOf('day');
    const newEndL = newStartL.plus({ days: deltaDays }).endOf('day');
    return {
      start: newStartL.toUTC().toJSDate(),
      end: newEndL.toUTC().toJSDate(),
    };
  }

  const durationMs = args.formEndUtc.getTime() - args.formStartUtc.getTime();

  let newStartL = DateTime.fromObject(
    {
      year: occ.year,
      month: occ.month,
      day: occ.day,
      hour: sForm.hour,
      minute: sForm.minute,
      second: sForm.second,
      millisecond: sForm.millisecond,
    },
    { zone }
  );
  if (!newStartL.isValid) {
    newStartL = occ.set({
      hour: sForm.hour,
      minute: sForm.minute,
      second: sForm.second,
      millisecond: sForm.millisecond,
    });
  }

  const startUtcMs = newStartL.toUTC().toMillis();
  const endUtcMs = startUtcMs + durationMs;
  return {
    start: new Date(startUtcMs),
    end: new Date(endUtcMs),
  };
}
