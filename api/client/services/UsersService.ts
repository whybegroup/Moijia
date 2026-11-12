/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { GroupOrderInput } from '../models/GroupOrderInput';
import type { OwnedGroupQuota } from '../models/OwnedGroupQuota';
import type { PurchaseHistoryEntry } from '../models/PurchaseHistoryEntry';
import type { PushTokenInput } from '../models/PushTokenInput';
import type { SubscriptionCancelCheck } from '../models/SubscriptionCancelCheck';
import type { User } from '../models/User';
import type { UserInput } from '../models/UserInput';
import type { UserUpdate } from '../models/UserUpdate';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class UsersService {
    /**
     * Retrieves a list of all users in the system
     * Get all users
     * @returns User Ok
     * @throws ApiError
     */
    public static getUsers(): CancelablePromise<Array<User>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users',
        });
    }
    /**
     * Creates a new user in the system
     * Create a new user
     * @param requestBody
     * @returns User Created
     * @throws ApiError
     */
    public static createUser(
        requestBody: UserInput,
    ): CancelablePromise<User> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/users',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Retrieves a single user by their unique identifier
     * Get user by ID
     * @param id
     * @returns User Ok
     * @throws ApiError
     */
    public static getUser(
        id: string,
    ): CancelablePromise<User> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/{id}',
            path: {
                'id': id,
            },
            errors: {
                404: `User not found`,
            },
        });
    }
    /**
     * Updates an existing user's information
     * Update a user
     * @param id
     * @param requestBody
     * @returns User Ok
     * @throws ApiError
     */
    public static updateUser(
        id: string,
        requestBody: UserUpdate,
    ): CancelablePromise<User> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/users/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Deletes a user from the system
     * Delete a user
     * @param id
     * @returns void
     * @throws ApiError
     */
    public static deleteUser(
        id: string,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/users/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Ensures the user row exists; provider name is refreshed, display name is not overwritten
     * Sync user from auth provider (upsert)
     * @param requestBody
     * @returns User Ok
     * @throws ApiError
     */
    public static syncUser(
        requestBody: UserInput,
    ): CancelablePromise<User> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/users/sync',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * How many groups this user can still own on their plan.
     * @param id
     * @returns OwnedGroupQuota Ok
     * @throws ApiError
     */
    public static getOwnedGroupQuota(
        id: string,
    ): CancelablePromise<OwnedGroupQuota> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/{id}/owned-group-quota',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Whether the groups this user owns already fit the free plan.
     * Cancelling Pro is always allowed. Extra groups are deleted after the grace period.
     * @param id
     * @returns SubscriptionCancelCheck Ok
     * @throws ApiError
     */
    public static getSubscriptionCancelCheck(
        id: string,
    ): CancelablePromise<SubscriptionCancelCheck> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/{id}/subscription-cancel',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Purchase and plan-change history for this user.
     * @param id
     * @returns PurchaseHistoryEntry Ok
     * @throws ApiError
     */
    public static getPurchaseHistory(
        id: string,
    ): CancelablePromise<Array<PurchaseHistoryEntry>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/{id}/purchase-history',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Read this account's Pro subscription from the store and apply it.
     * Enterprise is left unchanged. The client does not send entitlement state.
     * @param id
     * @returns OwnedGroupQuota Ok
     * @throws ApiError
     */
    public static syncBilling(
        id: string,
    ): CancelablePromise<OwnedGroupQuota> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/users/{id}/billing-sync',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Persists drag-and-drop order for All Groups and group switchers
     * Set preferred group list order for the user
     * @param id
     * @param requestBody
     * @returns string Ok
     * @throws ApiError
     */
    public static setGroupOrder(
        id: string,
        requestBody: GroupOrderInput,
    ): CancelablePromise<Array<string>> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/users/{id}/group-order',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Upserts a device push token for remote notifications
     * Register an Expo push token for a user (iOS/Android)
     * @param id
     * @param requestBody
     * @returns void
     * @throws ApiError
     */
    public static registerPushToken(
        id: string,
        requestBody: PushTokenInput,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/users/{id}/push-token',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Unregisters a device push token
     * Remove a push token (e.g. on sign-out)
     * @param id
     * @param token
     * @returns void
     * @throws ApiError
     */
    public static unregisterPushToken(
        id: string,
        token: string,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/users/{id}/push-token',
            path: {
                'id': id,
            },
            query: {
                'token': token,
            },
        });
    }
}
