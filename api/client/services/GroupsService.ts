/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Group } from '../models/Group';
import type { GroupInput } from '../models/GroupInput';
import type { GroupUpdate } from '../models/GroupUpdate';
import type { MembershipRequestAction } from '../models/MembershipRequestAction';
import type { Record_string_string_ } from '../models/Record_string_string_';
import type { User } from '../models/User';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class GroupsService {
    /**
     * Retrieves a list of all groups with their admin and member IDs
     * Get all groups
     * @returns Group Ok
     * @throws ApiError
     */
    public static getGroups(): CancelablePromise<Array<Group>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/groups',
        });
    }
    /**
     * Creates a new group with initial members
     * Create a new group
     * @param requestBody
     * @returns Group Created
     * @throws ApiError
     */
    public static createGroup(
        requestBody: GroupInput,
    ): CancelablePromise<Group> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/groups',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Retrieves a single group with member information
     * Get group by ID
     * @param id
     * @returns Group Ok
     * @throws ApiError
     */
    public static getGroup(
        id: string,
    ): CancelablePromise<Group> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/groups/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Updates an existing group's information and/or members
     * Update a group
     * @param id
     * @param requestBody
     * @returns Group Ok
     * @throws ApiError
     */
    public static updateGroup(
        id: string,
        requestBody: GroupUpdate,
    ): CancelablePromise<Group> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/groups/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Deletes a group and all its associated data
     * Delete a group
     * @param id
     * @returns void
     * @throws ApiError
     */
    public static deleteGroup(
        id: string,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/groups/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Retrieves all members of a specific group
     * Get group members
     * @param id
     * @returns User Ok
     * @throws ApiError
     */
    public static getGroupMembers(
        id: string,
    ): CancelablePromise<Array<User>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/groups/{id}/members',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Retrieves all pending membership requests for a group
     * Get pending membership requests
     * @param id
     * @returns User Ok
     * @throws ApiError
     */
    public static getPendingRequests(
        id: string,
    ): CancelablePromise<Array<User>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/groups/{id}/requests/pending',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Approve or reject a membership request
     * Handle membership request
     * @param id
     * @param requestBody
     * @returns void
     * @throws ApiError
     */
    public static handleMembershipRequest(
        id: string,
        requestBody: MembershipRequestAction,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/groups/{id}/requests/handle',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Sets the user's custom color for a specific group
     * Update user's color preference for a group
     * @param id
     * @param userId
     * @param requestBody
     * @returns void
     * @throws ApiError
     */
    public static updateMemberColor(
        id: string,
        userId: string,
        requestBody: {
            colorHex: string;
        },
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/groups/{id}/members/{userId}/color',
            path: {
                'id': id,
                'userId': userId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Retrieves the user's custom color for a specific group
     * Get user's color preference for a group
     * @param id
     * @param userId
     * @returns any Ok
     * @throws ApiError
     */
    public static getMemberColor(
        id: string,
        userId: string,
    ): CancelablePromise<{
        colorHex: string | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/groups/{id}/members/{userId}/color',
            path: {
                'id': id,
                'userId': userId,
            },
        });
    }
    /**
     * Retrieves all group color preferences for a user
     * Get user's color preferences for all their groups
     * @param userId
     * @returns Record_string_string_ Ok
     * @throws ApiError
     */
    public static getAllMemberColors(
        userId: string,
    ): CancelablePromise<Record_string_string_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/groups/members/{userId}/colors',
            path: {
                'userId': userId,
            },
        });
    }
}
