/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Input for updating an event
 */
export type EventUpdate = {
    title?: string;
    subtitle?: string;
    description?: string;
    coverPhotos?: Array<string>;
    start?: string;
    end?: string;
    isAllDay?: boolean;
    location?: string;
    minAttendees?: number;
    maxAttendees?: number;
    enableWaitlist?: boolean;
    allowMaybe?: boolean;
    updatedBy: string;
};

