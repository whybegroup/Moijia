/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Input for updating a group
 */
export type GroupUpdate = {
    name?: string;
    desc?: string;
    announcement?: string | null;
    thumbnail?: string | null;
    coverPhotos?: Array<string>;
    avatarSeed?: string | null;
    requireApprovalToJoin?: boolean;
    /**
     * Enterprise owners may set small, medium, or large.
     */
    sizeTier?: GroupUpdate.sizeTier;
    ownerId?: string;
    adminIds?: Array<string>;
    memberIds?: Array<string>;
    updatedBy: string;
};
export namespace GroupUpdate {
    /**
     * Enterprise owners may set small, medium, or large.
     */
    export enum sizeTier {
        SMALL = 'small',
        MEDIUM = 'medium',
        LARGE = 'large',
    }
}

