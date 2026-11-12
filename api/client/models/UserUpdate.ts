/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Partial_NotifPrefs_ } from './Partial_NotifPrefs_';
/**
 * Input for updating a user
 */
export type UserUpdate = {
    name?: string;
    displayName?: string;
    avatarSeed?: string | null;
    thumbnail?: string | null;
    /**
     * Auth email for billing notices
     */
    email?: string | null;
    /**
     * Merged into existing global notification preferences
     */
    notifPrefs?: Partial_NotifPrefs_;
    /**
     * IANA time zone, such as America/Los_Angeles. Null clears the saved zone.
     */
    timeZone?: string | null;
};

