/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type GroupPostCommentCreateInput = {
    id: string;
    userId: string;
    body: string;
    parentCommentId?: string;
    /**
     * Client-resolved mention targets; server validates against group roster
     */
    mentionedUserIds?: Array<string>;
};

