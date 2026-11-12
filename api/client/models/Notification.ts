/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Notification model
 */
export type Notification = {
    /**
     * Unique notification identifier
     */
    id: string;
    /**
     * Notification type
     */
    type: string;
    /**
     * Whether the notification has been read
     */
    read: boolean;
    /**
     * Timestamp of the notification
     */
    ts: string;
    /**
     * Icon identifier
     */
    icon: string;
    /**
     * Notification title
     */
    title: string;
    /**
     * Notification body text
     */
    body: string;
    /**
     * Related group ID (if applicable)
     */
    groupId?: string | null;
    /**
     * Related event ID (if applicable)
     */
    eventId?: string | null;
    /**
     * Related poll ID (in-app; when dest is poll)
     */
    pollId?: string | null;
    /**
     * Related group forum post ID (forum mention notifications)
     */
    postId?: string | null;
    /**
     * Related group forum comment ID (forum mention notifications)
     */
    commentId?: string | null;
    /**
     * Whether this notification is navigable/clickable
     */
    navigable: boolean;
    /**
     * Navigation destination
     */
    dest?: Notification.dest | null;
    /**
     * User ID this notification is for
     */
    userId?: string | null;
    /**
     * Timestamp when created
     */
    createdAt: string;
    /**
     * Timestamp when updated
     */
    updatedAt: string;
};
export namespace Notification {
    /**
     * Navigation destination
     */
    export enum dest {
        GROUP = 'group',
        EVENT = 'event',
        POLL = 'poll',
    }
}

