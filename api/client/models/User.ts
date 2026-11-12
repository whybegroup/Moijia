/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { NotifPrefs } from './NotifPrefs';
/**
 * User model - represents a user in the system
 */
export type User = {
    /**
     * Unique user identifier
     */
    id: string;
    /**
     * User's name
     */
    name: string;
    /**
     * User's display name with location and year
     */
    displayName: string;
    /**
     * DiceBear bottts seed for generated avatar
     */
    avatarSeed?: string | null;
    /**
     * Optional custom avatar image URL
     */
    thumbnail?: string | null;
    /**
     * free | pro | enterprise. Omitted only on incomplete client placeholders; the API sends free by default.
     */
    subscriptionTier?: User.subscriptionTier;
    /**
     * Global in-app notification toggles (applies to all groups, AND with per-group prefs)
     */
    notifPrefs?: NotifPrefs;
    /**
     * IANA time zone used for emails and notifications. Null until the app saves the device zone.
     */
    timeZone?: string | null;
    /**
     * Timestamp when the user was created
     */
    createdAt: string;
    /**
     * Timestamp when the user was last updated
     */
    updatedAt: string;
};
export namespace User {
    /**
     * free | pro | enterprise. Omitted only on incomplete client placeholders; the API sends free by default.
     */
    export enum subscriptionTier {
        FREE = 'free',
        PRO = 'pro',
        ENTERPRISE = 'enterprise',
    }
}

