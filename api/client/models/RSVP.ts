/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * RSVP model
 */
export type RSVP = {
    /**
     * User ID who made the RSVP
     */
    userId: string;
    /**
     * RSVP status
     */
    status: RSVP.status;
    /**
     * Optional memo or note
     */
    memo: string;
    /**
     * Timestamp when created
     */
    createdAt: string;
    /**
     * Timestamp when updated
     */
    updatedAt: string;
};
export namespace RSVP {
    /**
     * RSVP status
     */
    export enum status {
        GOING = 'going',
        MAYBE = 'maybe',
        NOT_GOING = 'notGoing',
        WAITLIST = 'waitlist',
    }
}

