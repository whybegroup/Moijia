/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
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
     * Event title
     */
    title: string;
    /**
     * Event subtitle
     */
    subtitle?: string | null;
    /**
     * Event description
     */
    description?: string | null;
    /**
     * Array of cover photo URLs
     */
    coverPhotos: Array<string>;
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
     * Timestamp when the event was created
     */
    createdAt: string;
    /**
     * Timestamp when the event was last updated
     */
    updatedAt: string;
};

