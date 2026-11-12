/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Body for POST /events/:id/recurrence/truncate
 */
export type RecurrenceTruncateSeriesInput = {
    /**
     * ISO 8601 start of the first occurrence to drop. That occurrence and every later one are removed;
     * earlier instances stay on the calendar.
     */
    occurrenceStart: string;
    /**
     * IANA timezone from `Intl.DateTimeFormat().resolvedOptions().timeZone` on the device.
     * Needed so WEEKLY rules match the same instants as the in-app calendar (local weekday expansion).
     */
    viewerTimeZone?: string;
};

