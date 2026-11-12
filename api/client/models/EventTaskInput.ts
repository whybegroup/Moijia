/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Create a task on an event.
 */
export type EventTaskInput = {
    title: string;
    /**
     * Omit or null to leave the task unassigned.
     */
    assigneeId?: string | null;
    createdBy: string;
    /**
     * When this event is part of a series, how far the new task applies.
     * `this_occurrence` adds it only on this date and leaves the series intact.
     */
    seriesUpdateScope?: EventTaskInput.seriesUpdateScope;
};
export namespace EventTaskInput {
    /**
     * When this event is part of a series, how far the new task applies.
     * `this_occurrence` adds it only on this date and leaves the series intact.
     */
    export enum seriesUpdateScope {
        THIS_OCCURRENCE = 'this_occurrence',
        THIS_AND_FOLLOWING = 'this_and_following',
        ALL_OCCURRENCES = 'all_occurrences',
    }
}

