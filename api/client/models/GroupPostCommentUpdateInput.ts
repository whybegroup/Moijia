/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type GroupPostCommentUpdateInput = {
    userId: string;
    body: string;
    /**
     * When set (including `null`), replaces reply parent; omit to leave unchanged.
     */
    parentCommentId?: string | null;
    /**
     * Client-resolved mention targets; server validates against group roster
     */
    mentionedUserIds?: Array<string>;
};

