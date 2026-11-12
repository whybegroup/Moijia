/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Alternate schedule proposed by a member; host may accept to update the event.
 */
export type EventTimeSuggestion = {
    id: string;
    suggestedBy: string;
    start: string;
    end: string;
    status: EventTimeSuggestion.status;
    createdAt: string;
    updatedAt: string;
};
export namespace EventTimeSuggestion {
    export enum status {
        PENDING = 'pending',
        ACCEPTED = 'accepted',
        REJECTED = 'rejected',
    }
}

