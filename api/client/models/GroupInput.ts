/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Input for creating a new group
 */
export type GroupInput = {
    id: string;
    name: string;
    desc: string;
    thumbnail?: string | null;
    coverPhotos?: Array<string>;
    avatarSeed?: string | null;
    inviteCode?: string | null;
    requireApprovalToJoin?: boolean;
    /**
     * Enterprise owners may choose small, medium, or large. Other plans ignore this.
     */
    sizeTier?: GroupInput.sizeTier;
    ownerId: string;
    adminIds?: Array<string>;
    memberIds?: Array<string>;
    createdBy: string;
};
export namespace GroupInput {
    /**
     * Enterprise owners may choose small, medium, or large. Other plans ignore this.
     */
    export enum sizeTier {
        SMALL = 'small',
        MEDIUM = 'medium',
        LARGE = 'large',
    }
}

