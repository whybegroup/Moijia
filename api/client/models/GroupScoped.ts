/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MemberPlan } from './MemberPlan';
import type { MembershipStatus } from './MembershipStatus';
/**
 * Group scoped by membership - API returns only appropriate fields per user's status
 */
export type GroupScoped = {
    id: string;
    name: string;
    desc: string;
    announcement?: string | null;
    thumbnail?: string | null;
    coverPhotos: Array<string>;
    avatarSeed?: string | null;
    requireApprovalToJoin: boolean;
    /**
     * Max bytes this group may store in S3. Default Small = 1 GiB.
     */
    maxStorageBytes: number;
    sizeTier: GroupScoped.sizeTier;
    pendingSizeTier?: GroupScoped.pendingSizeTier | null;
    /**
     * When the current paid size add-on started (billing day-of-month).
     */
    sizeStartedAt?: string | null;
    graceEndsAt?: string | null;
    /**
     * When the owner's downgrade will permanently delete this group.
     * Absent for groups that stay.
     */
    deletionScheduledAt?: string | null;
    /**
     * Bytes used by this group's images and file attachments. Present on group detail.
     */
    usedStorageBytes?: number;
    memberCount: number;
    membershipStatus: MembershipStatus;
    /**
     * Present when member or admin
     */
    inviteCode?: string | null;
    ownerId?: string;
    /**
     * Present for the owner. Used to choose who can receive ownership.
     */
    memberPlans?: Array<MemberPlan>;
    adminIds?: Array<string>;
    memberIds?: Array<string>;
    /**
     * Present when admin only
     */
    pendingMemberIds?: Array<string>;
    createdBy?: string;
    updatedBy?: string;
    createdAt?: string;
    updatedAt?: string;
    /**
     * Set when group is soft-deleted
     */
    deletedAt?: string | null;
    deletedBy?: string | null;
};
export namespace GroupScoped {
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

