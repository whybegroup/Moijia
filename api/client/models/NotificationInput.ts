/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Input for creating a notification
 */
export type NotificationInput = {
    id: string;
    type: string;
    read?: boolean;
    ts?: string;
    icon: string;
    title: string;
    body: string;
    groupId?: string;
    eventId?: string;
    pollId?: string;
    postId?: string;
    commentId?: string;
    navigable?: boolean;
    dest?: NotificationInput.dest;
    userId?: string;
};
export namespace NotificationInput {
    export enum dest {
        GROUP = 'group',
        EVENT = 'event',
        POLL = 'poll',
    }
}

