/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CompleteUploadRequest } from '../models/CompleteUploadRequest';
import type { DeleteUploadRequest } from '../models/DeleteUploadRequest';
import type { PresignGetBatchRequest } from '../models/PresignGetBatchRequest';
import type { PresignGetBatchResponse } from '../models/PresignGetBatchResponse';
import type { PresignUploadRequest } from '../models/PresignUploadRequest';
import type { PresignUploadResponse } from '../models/PresignUploadResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class StorageService {
    /**
     * Presign file upload (S3)
     * Get a short-lived signed PUT URL for direct client upload to S3.
     * @param requestBody
     * @returns PresignUploadResponse Ok
     * @throws ApiError
     */
    public static presignUpload(
        requestBody: PresignUploadRequest,
    ): CancelablePromise<PresignUploadResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/storage/presign',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Record an S3 upload against a group's storage quota after the client PUT succeeds.
     * @param requestBody
     * @returns void
     * @throws ApiError
     */
    public static completeUpload(
        requestBody: CompleteUploadRequest,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/storage/complete',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Resolve stored file URLs for display. S3 uploads return the public object URL; externals pass through.
     * @param requestBody
     * @returns PresignGetBatchResponse Ok
     * @throws ApiError
     */
    public static presignGetBatch(
        requestBody: PresignGetBatchRequest,
    ): CancelablePromise<PresignGetBatchResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/storage/presign-get',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Delete a file under storage/{userId}/ for the given userId.
     * @param userId
     * @param requestBody
     * @returns void
     * @throws ApiError
     */
    public static deleteUploadedObject(
        userId: string,
        requestBody: DeleteUploadRequest,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/storage/delete',
            query: {
                'userId': userId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
