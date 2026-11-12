/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Input for creating a new user
 */
export type UserInput = {
    id: string;
    name: string;
    displayName: string;
    avatarSeed?: string | null;
    thumbnail?: string | null;
    /**
     * Auth email for billing notices
     */
    email?: string | null;
};

