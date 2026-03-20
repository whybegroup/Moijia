/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Group } from '../models/Group';
import type { GroupInput } from '../models/GroupInput';
import type { GroupScoped } from '../models/GroupScoped';
import type { GroupUpdate } from '../models/GroupUpdate';
import type { MembershipRequestAction } from '../models/MembershipRequestAction';
import type { PublicGroupsPage } from '../models/PublicGroupsPage';
import type { Record_string_string_ } from '../models/Record_string_string_';
import type { User } from '../models/User';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class GroupsService {
    /**
     * Retrieves a list of groups with info scoped by user's membership status. Requires userId.
     * Get all groups
     * @param userId
     * @param includeDeleted When true, includes soft-deleted groups where user is superadmin.
     * @returns GroupScoped Ok
     * @throws ApiError
     */
    public static getGroups(
        userId: string,
        includeDeleted?: boolean,
    ): CancelablePromise<Array<GroupScoped>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/groups',
            query: {
                'userId': userId,
                'includeDeleted': includeDeleted,
            },
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
     * Paginated public groups for discovery. includeJoined=false hides groups you already belong to or have a pending request for.
     * List public groups with pagination (offset/limit). Must be registered before `GET /groups/:id`.
     * @param userId
     * @param limit
     * @param offset
     * @param q
     * @param includeJoined
     * @returns PublicGroupsPage Ok
     * @throws ApiError
     */
    public static getPublicGroups(
        userId: string,
        limit: number = 10,
        offset?: number,
        q?: string,
        includeJoined?: boolean,
    ): CancelablePromise<PublicGroupsPage> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/groups/public',
            query: {
                'userId': userId,
                'limit': limit,
                'offset': offset,
                'q': q,
                'includeJoined': includeJoined,
            },
        });
    }
    /**
     * Retrieves a single group with info scoped by user's membership status. Requires userId.
     * Get group by ID
     * @param id
     * @param userId
     * @returns GroupScoped Ok
     * @throws ApiError
     */
    public static getGroup(
        id: string,
        userId: string,
    ): CancelablePromise<GroupScoped> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/groups/{id}',
            path: {
                'id': id,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Updates an existing group. Requires admin.
     * Update a group
     * @param id
     * @param userId
     * @param requestBody
     * @returns GroupScoped Ok
     * @throws ApiError
     */
    public static updateGroup(
        id: string,
        userId: string,
        requestBody: GroupUpdate,
    ): CancelablePromise<GroupScoped> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/groups/{id}',
            path: {
                'id': id,
            },
            query: {
                'userId': userId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Permanently removes a group and all its data. Superadmin only.
     * Hard-delete a group
     * @param id
     * @param userId
     * @returns void
     * @throws ApiError
     */
    public static deleteGroup(
        id: string,
        userId: string,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/groups/{id}',
            path: {
                'id': id,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Retrieves all members of a specific group. Requires caller to be a member.
     * Get group members
     * @param id
     * @param userId
     * @returns User Ok
     * @throws ApiError
     */
    public static getGroupMembers(
        id: string,
        userId: string,
    ): CancelablePromise<Array<User>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/groups/{id}/members',
            path: {
                'id': id,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Marks a group as deleted. Superadmin only.
     * Soft-delete a group
     * @param id
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static softDeleteGroup(
        id: string,
        requestBody: {
            userId: string;
        },
    ): CancelablePromise<{
        success: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/groups/{id}/soft-delete',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Restores a soft-deleted group. Superadmin only.
     * Recover a soft-deleted group
     * @param id
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static recoverGroup(
        id: string,
        requestBody: {
            userId: string;
        },
    ): CancelablePromise<{
        success: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/groups/{id}/recover',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Join or request to join a group using its invite code
     * Join a group by invite code
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static joinByInviteCode(
        requestBody: {
            userId: string;
            inviteCode: string;
        },
    ): CancelablePromise<{
        status: 'joined' | 'pending';
        groupName: string;
        success: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/groups/join-by-code',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Remove the current user from the group. Superadmin cannot leave.
     * Leave a group
     * @param id
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static leaveGroup(
        id: string,
        requestBody: {
            userId: string;
        },
    ): CancelablePromise<{
        success: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/groups/{id}/leave',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Join a public group (immediate) or request to join a private group (pending)
     * Join a group
     * @param id
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static joinGroup(
        id: string,
        requestBody: {
            userId: string;
        },
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/groups/{id}/join',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Retrieves pending requests for a group. Requires admin.
     * Get pending membership requests
     * @param id
     * @param userId
     * @returns User Ok
     * @throws ApiError
     */
    public static getPendingRequests(
        id: string,
        userId: string,
    ): CancelablePromise<Array<User>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/groups/{id}/requests/pending',
            path: {
                'id': id,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Admin removes a member. Cannot remove superadmin.
     * Remove a member from the group
     * @param id
     * @param memberId
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static removeMember(
        id: string,
        memberId: string,
        requestBody: {
            performedBy: string;
        },
    ): CancelablePromise<{
        success: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/groups/{id}/members/{memberId}/remove',
            path: {
                'id': id,
                'memberId': memberId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Admin sets a member's role. Cannot change superadmin.
     * Set a member's role (admin or member)
     * @param id
     * @param memberId
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static setMemberRole(
        id: string,
        memberId: string,
        requestBody: {
            role: 'admin' | 'member';
            performedBy: string;
        },
    ): CancelablePromise<{
        success: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/groups/{id}/members/{memberId}/role',
            path: {
                'id': id,
                'memberId': memberId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Superadmin transfers ownership to an admin or member.
     * Transfer superadmin role to another member
     * @param id
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static setSuperAdmin(
        id: string,
        requestBody: {
            userId: string;
            performedBy: string;
        },
    ): CancelablePromise<{
        success: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/groups/{id}/superadmin',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Approve or reject a membership request. Requires admin.
     * Handle membership request
     * @param id
     * @param userId
     * @param requestBody
     * @returns void
     * @throws ApiError
     */
    public static handleMembershipRequest(
        id: string,
        userId: string,
        requestBody: MembershipRequestAction,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/groups/{id}/requests/handle',
            path: {
                'id': id,
            },
            query: {
                'userId': userId,
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
