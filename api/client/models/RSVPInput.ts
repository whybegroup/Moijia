/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Input for creating/updating an RSVP
 */
export type RSVPInput = {
    userId: string;
    status: RSVPInput.status;
    memo?: string;
};
export namespace RSVPInput {
    export enum status {
        GOING = 'going',
        MAYBE = 'maybe',
        NOT_GOING = 'notGoing',
        WAITLIST = 'waitlist',
    }
}

