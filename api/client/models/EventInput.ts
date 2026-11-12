/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EventFileAttachment } from './EventFileAttachment';
/**
 * Input for creating a new event
 */
export type EventInput = {
    id: string;
    groupId: string;
    createdBy: string;
    name: string;
    /**
     * Event description (multiline)
     */
    description?: string;
    coverPhotos?: Array<string>;
    attachments?: Array<EventFileAttachment>;
    start: string;
    end: string;
    isAllDay?: boolean;
    location?: string;
    /**
     * Defaults to false when omitted (free text). Set true when picking a Places suggestion.
     */
    locationLinkable?: boolean;
    locationName?: string | null;
    locationAddress?: string | null;
    minAttendees?: number;
    maxAttendees?: number;
    enableWaitlist?: boolean;
    allowMaybe?: boolean;
    /**
     * ISO instant; omit for no deadline on create.
     */
    rsvpDeadline?: string | null;
    recurrenceRule?: string | null;
    /**
     * IANA zone (`Intl…resolvedOptions().timeZone`) so WEEKLY materialization matches the device calendar.
     */
    viewerTimeZone?: string;
};

