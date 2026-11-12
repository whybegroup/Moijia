/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Input for editing a comment
 */
export type CommentUpdateInput = {
    actorId: string;
    /**
     * When omitted, existing text is kept
     */
    text?: string;
    /**
     * When set, replaces the full photo set for this comment
     */
    photos?: Array<string>;
    /**
     * When set, changes which comment this row replies to (same event).
     * Pass `null` for a top-level comment. When omitted, reply target is unchanged.
     */
    replyToCommentId?: string | null;
    /**
     * Client-resolved mention targets; server validates against the event's group roster
     */
    mentionedUserIds?: Array<string>;
};

