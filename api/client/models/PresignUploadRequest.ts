/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Request a short-lived signed URL to PUT a file into S3.
 */
export type PresignUploadRequest = {
    userId: string;
    contentType: string;
    filename?: string;
    /**
     * When set, the upload counts toward this group's storage quota.
     */
    groupId?: string;
    /**
     * Declared body size in bytes; used for quota checks before the PUT.
     */
    contentLength?: number;
};

