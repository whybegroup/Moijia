/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { GroupPostComment } from './GroupPostComment';
import type { GroupPostReactionEntry } from './GroupPostReactionEntry';
export type GroupPost = {
    id: string;
    groupId: string;
    userId: string;
    title: string;
    body: string;
    createdAt: string;
    updatedAt: string;
    reactions: Array<GroupPostReactionEntry>;
    comments: Array<GroupPostComment>;
};

