/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SupportRequest } from '../models/SupportRequest';
import type { SupportSubmitResult } from '../models/SupportSubmitResult';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class SupportService {
    /**
     * Delivers the support form to the Moijia inbox
     * Send a support message
     * @param requestBody
     * @returns SupportSubmitResult Ok
     * @throws ApiError
     */
    public static submitSupport(
        requestBody: SupportRequest,
    ): CancelablePromise<SupportSubmitResult> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/support',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request`,
                429: `Too many requests`,
                502: `Could not send`,
            },
        });
    }
}
