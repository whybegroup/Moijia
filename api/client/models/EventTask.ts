/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Checklist item on an event.
 */
export type EventTask = {
    id: string;
    title: string;
    /**
     * Group member responsible for this task. Null when unassigned.
     */
    assigneeId?: string | null;
    completed: boolean;
    /**
     * User who most recently checked this task off.
     */
    completedBy?: string | null;
    completedAt?: string | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    /**
     * True when this task was also added to other dates in the series.
     */
    repeated?: boolean;
};

