/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Input for creating a comment
 */
export type CommentInput = {
    id: string;
    userId: string;
    text?: string;
    photos?: Array<string>;
    /**
     * Client-resolved mention targets; server validates they are in the event's group
     */
    mentionedUserIds?: Array<string>;
    replyToCommentId?: string;
};

