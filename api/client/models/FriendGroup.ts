/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FriendGroupLinkStatus } from './FriendGroupLinkStatus';
import type { MembershipStatus } from './MembershipStatus';
export type FriendGroup = {
    groupId: string;
    name: string;
    thumbnail?: string | null;
    avatarSeed?: string | null;
    status: FriendGroupLinkStatus;
    membershipStatus: MembershipStatus;
    memberCount: number;
};

