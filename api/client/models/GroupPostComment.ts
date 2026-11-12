/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { GroupPostReactionEntry } from './GroupPostReactionEntry';
export type GroupPostComment = {
    id: string;
    postId: string;
    userId: string;
    body: string;
    parentCommentId?: string;
    createdAt: string;
    updatedAt: string;
    reactions: Array<GroupPostReactionEntry>;
};

