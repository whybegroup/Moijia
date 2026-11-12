/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Update a task title, assignee, or completion.
 */
export type EventTaskUpdate = {
    actorId: string;
    title?: string;
    /**
     * Pass null to clear the assignee. Omit to leave unchanged.
     */
    assigneeId?: string | null;
    completed?: boolean;
};

