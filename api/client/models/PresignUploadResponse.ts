/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PresignUploadResponse = {
    /**
     * HTTP PUT target (S3 signed URL); include Content-Type header matching the presign request.
     */
    uploadUrl: string;
    /**
     * Public S3 URL to store on events/comments after upload succeeds.
     */
    publicUrl: string;
    objectKey: string;
    expiresIn: number;
};

