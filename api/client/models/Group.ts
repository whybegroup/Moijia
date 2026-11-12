/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MemberPlan } from './MemberPlan';
/**
 * Group model - represents a social group (full, for members/admins)
 */
export type Group = {
    /**
     * Unique group identifier
     */
    id: string;
    /**
     * Group name
     */
    name: string;
    /**
     * Group description
     */
    desc: string;
    /**
     * Group announcement (visible to all members)
     */
    announcement?: string | null;
    /**
     * Group thumbnail/avatar URL
     */
    thumbnail?: string | null;
    /**
     * Cover / banner image URLs (uploaded), ordered
     */
    coverPhotos: Array<string>;
    /**
     * DiceBear icons seed for generated avatar
     */
    avatarSeed?: string | null;
    /**
     * Unique invite code for joining the group
     */
    inviteCode?: string | null;
    /**
     * When true, new members must be approved; when false, join is immediate
     */
    requireApprovalToJoin: boolean;
    /**
     * Max bytes this group may store in S3. Default Small = 1 GiB.
     */
    maxStorageBytes: number;
    sizeTier: Group.sizeTier;
    pendingSizeTier?: Group.pendingSizeTier | null;
    /**
     * When the current paid size add-on started (billing day-of-month).
     */
    sizeStartedAt?: string | null;
    graceEndsAt?: string | null;
    /**
     * Bytes used by this group's images and file attachments.
     */
    usedStorageBytes?: number;
    /**
     * ID of the group's owner
     */
    ownerId: string;
    /**
     * Present for the owner. Used to choose who can receive ownership.
     */
    memberPlans?: Array<MemberPlan>;
    /**
     * Array of admin user IDs
     */
    adminIds: Array<string>;
    /**
     * Array of member user IDs
     */
    memberIds: Array<string>;
    /**
     * Array of pending member request user IDs
     */
    pendingMemberIds?: Array<string>;
    /**
     * ID of the user who created this group
     */
    createdBy: string;
    /**
     * ID of the user who last updated this group
     */
    updatedBy: string;
    /**
     * Timestamp when the group was created
     */
    createdAt: string;
    /**
     * Timestamp when the group was last updated
     */
    updatedAt: string;
};
export namespace Group {
    export enum sizeTier {
        SMALL = 'small',
        MEDIUM = 'medium',
        LARGE = 'large',
    }
    export enum pendingSizeTier {
        SMALL = 'small',
        MEDIUM = 'medium',
        LARGE = 'large',
    }
}

