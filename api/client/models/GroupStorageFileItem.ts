/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type GroupStorageFileItem = {
    url: string;
    byteSize: number;
    sourceLabel?: string;
    /**
     * Original or derived file name (used for non-image tiles).
     */
    fileName?: string;
    /**
     * Display name of the member who uploaded this file.
     */
    uploadedByName?: string;
    uploadedByAvatarSeed?: string | null;
    uploadedByThumbnail?: string | null;
    /**
     * Viewer may delete this file (owner/admin, or the member who uploaded it).
     */
    canDelete: boolean;
};

