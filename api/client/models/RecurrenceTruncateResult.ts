/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Event } from './Event';
/**
 * Result of truncating a series at an occurrence (or deleting the event if nothing would remain).
 */
export type RecurrenceTruncateResult = {
    deleted: boolean;
    event?: Event;
};

