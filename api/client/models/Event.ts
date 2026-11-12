/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EventFileAttachment } from './EventFileAttachment';
/**
 * Event model - represents a scheduled event
 */
export type Event = {
    /**
     * Unique event identifier
     */
    id: string;
    /**
     * ID of the group this event belongs to
     */
    groupId: string;
    /**
     * ID of the user who created this event
     */
    createdBy: string;
    /**
     * ID of the user who last updated this event
     */
    updatedBy: string;
    /**
     * Event name
     */
    name: string;
    /**
     * Event description (multiline)
     */
    description?: string | null;
    /**
     * Array of cover photo URLs
     */
    coverPhotos: Array<string>;
    /**
     * Host/admin file attachments on the event
     */
    attachments: Array<EventFileAttachment>;
    /**
     * Event start date/time
     */
    start: string;
    /**
     * Event end date/time
     */
    end: string;
    /**
     * Whether this is an all-day event
     */
    isAllDay?: boolean | null;
    /**
     * Event location
     */
    location?: string | null;
    /**
     * When true, the location may be opened in maps (Places pick).
     * False for free-text / “use as entered” locations.
     */
    locationLinkable?: boolean;
    /**
     * Place name when chosen from Places; null for free-text.
     */
    locationName?: string | null;
    /**
     * Full formatted address when chosen from Places; null for free-text.
     */
    locationAddress?: string | null;
    /**
     * Minimum number of attendees required
     */
    minAttendees?: number | null;
    /**
     * Maximum number of attendees allowed
     */
    maxAttendees?: number | null;
    /**
     * Whether waitlist is enabled when max capacity is reached
     */
    enableWaitlist?: boolean | null;
    /**
     * Whether 'maybe' RSVPs are allowed
     */
    allowMaybe: boolean;
    /**
     * When set, RSVPs cannot be created or updated after this instant (server time).
     * Null means no RSVP deadline.
     */
    rsvpDeadline?: string | null;
    /**
     * RFC 5545 RRULE (same string on every row in a series). Null on one-off events.
     */
    recurrenceRule?: string | null;
    /**
     * Present on each row that belongs to the same materialized recurrence.
     */
    recurrenceSeriesId?: string | null;
    /**
     * Timestamp when the event was created
     */
    createdAt: string;
    /**
     * Timestamp when the event was last updated
     */
    updatedAt: string;
};

