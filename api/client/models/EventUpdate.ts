/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EventFileAttachment } from './EventFileAttachment';
/**
 * Input for updating an event
 */
export type EventUpdate = {
    name?: string;
    /**
     * Event description (multiline)
     */
    description?: string;
    coverPhotos?: Array<string>;
    attachments?: Array<EventFileAttachment>;
    start?: string;
    end?: string;
    isAllDay?: boolean;
    location?: string;
    /**
     * When updating location: true for Places picks, false for free-text / use-as-entered.
     */
    locationLinkable?: boolean;
    locationName?: string | null;
    locationAddress?: string | null;
    /**
     * Omit to leave unchanged; `null` clears the cap.
     */
    minAttendees?: number | null;
    /**
     * Omit to leave unchanged; `null` clears the cap.
     */
    maxAttendees?: number | null;
    enableWaitlist?: boolean;
    allowMaybe?: boolean;
    /**
     * ISO instant, or null to clear the deadline. Omit to leave unchanged.
     */
    rsvpDeadline?: string | null;
    updatedBy: string;
    /**
     * Set to null to clear recurrence on this row (series rows should stay in sync via the same value).
     */
    recurrenceRule?: string | null;
    /**
     * How edits apply when this event belongs to a recurring series. Ignored for one-off events.
     * `this_occurrence`: update only this row; clears `recurrenceSeriesId` and `recurrenceRule` so it is standalone.
     * `this_and_following`: this row and any same-series row with `start` strictly after this row’s `start`; those rows get a new shared `recurrenceSeriesId` after the update (earlier rows keep the old id).
     * `all_occurrences`: every stored row with the same `recurrenceSeriesId` (id unchanged).
     * When omitted, legacy single-row behavior for non-series fields; recurrence rule still syncs across the whole series.
     */
    seriesUpdateScope?: EventUpdate.seriesUpdateScope;
    /**
     * IANA zone (`Intl…resolvedOptions().timeZone`) when applying `start`/`end` across a series:
     * each occurrence keeps its local date; wall times and duration follow the form.
     */
    viewerTimeZone?: string;
};
export namespace EventUpdate {
    /**
     * How edits apply when this event belongs to a recurring series. Ignored for one-off events.
     * `this_occurrence`: update only this row; clears `recurrenceSeriesId` and `recurrenceRule` so it is standalone.
     * `this_and_following`: this row and any same-series row with `start` strictly after this row’s `start`; those rows get a new shared `recurrenceSeriesId` after the update (earlier rows keep the old id).
     * `all_occurrences`: every stored row with the same `recurrenceSeriesId` (id unchanged).
     * When omitted, legacy single-row behavior for non-series fields; recurrence rule still syncs across the whole series.
     */
    export enum seriesUpdateScope {
        THIS_OCCURRENCE = 'this_occurrence',
        THIS_AND_FOLLOWING = 'this_and_following',
        ALL_OCCURRENCES = 'all_occurrences',
    }
}

