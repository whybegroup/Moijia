/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Input for creating a new event
 */
export type EventInput = {
    id: string;
    groupId: string;
    createdBy: string;
    title: string;
    subtitle?: string;
    description?: string;
    coverPhotos?: Array<string>;
    start: string;
    end: string;
    isAllDay?: boolean;
    location?: string;
    minAttendees?: number;
    maxAttendees?: number;
    enableWaitlist?: boolean;
    allowMaybe?: boolean;
};

