/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Propose a new start/end time for the event
 */
export type EventTimeSuggestionInput = {
    id: string;
    userId: string;
    start: string;
    end: string;
    /**
     * IANA zone from the device so notification copy uses the same wall clock as the rest of the app.
     */
    viewerTimeZone?: string;
};

