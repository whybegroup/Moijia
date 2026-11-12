/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Parent snippet for threaded reply UI.
 */
export type CommentReplyTo = {
    id: string;
    userId: string;
    text: string;
    preview: string;
    user: {
        name?: string;
        displayName?: string;
        id: string;
    };
    photos: Array<string>;
};

