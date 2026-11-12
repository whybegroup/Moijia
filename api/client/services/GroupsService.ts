/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FriendGroup } from '../models/FriendGroup';
import type { FriendGroupDecisionInput } from '../models/FriendGroupDecisionInput';
import type { FriendGroupInviteInput } from '../models/FriendGroupInviteInput';
import type { Group } from '../models/Group';
import type { GroupInput } from '../models/GroupInput';
import type { GroupPost } from '../models/GroupPost';
import type { GroupPostComment } from '../models/GroupPostComment';
import type { GroupPostCommentCreateInput } from '../models/GroupPostCommentCreateInput';
import type { GroupPostCommentUpdateInput } from '../models/GroupPostCommentUpdateInput';
import type { GroupPostCreateInput } from '../models/GroupPostCreateInput';
import type { GroupPostReactionInput } from '../models/GroupPostReactionInput';
import type { GroupPostUpdateInput } from '../models/GroupPostUpdateInput';
import type { GroupScoped } from '../models/GroupScoped';
import type { GroupStorageBreakdown } from '../models/GroupStorageBreakdown';
import type { GroupStorageFileDeleteInput } from '../models/GroupStorageFileDeleteInput';
import type { GroupStorageFileList } from '../models/GroupStorageFileList';
import type { GroupUpdate } from '../models/GroupUpdate';
import type { MembershipRequestAction } from '../models/MembershipRequestAction';
import type { NotifPrefs } from '../models/NotifPrefs';
import type { Partial_NotifPrefs_ } from '../models/Partial_NotifPrefs_';
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
     * @param includeDeleted When true, includes soft-deleted groups where user is owner.
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
     * Permanently removes a group and all its data. Owner only.
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
     * Issues a new invite code for joining; existing members are unchanged. Requires admin.
     * Regenerate invite code
     * @param id
     * @param userId
     * @returns any OK
     * @throws ApiError
     */
    public static regenerateInviteCode(
        id: string,
        userId: string,
    ): CancelablePromise<{
        inviteCode: string;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/groups/{id}/regenerate-invite-code',
            path: {
                'id': id,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Marks a group as deleted. Owner only.
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
     * Restores a soft-deleted group. Owner only.
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
     * Storage usage broken down by events, polls, and posts. Requires an active member.
     * @param id
     * @param userId
     * @returns GroupStorageBreakdown Ok
     * @throws ApiError
     */
    public static getStorageBreakdown(
        id: string,
        userId: string,
    ): CancelablePromise<GroupStorageBreakdown> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/groups/{id}/storage-breakdown',
            path: {
                'id': id,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Files billed to a storage category. Requires an active member.
     * @param id
     * @param category
     * @param userId
     * @returns GroupStorageFileList Ok
     * @throws ApiError
     */
    public static getStorageFiles(
        id: string,
        category: string,
        userId: string,
    ): CancelablePromise<GroupStorageFileList> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/groups/{id}/storage-files/{category}',
            path: {
                'id': id,
                'category': category,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Remove a photo from this group's records and delete it from S3.
     * Owner/admin may delete any photo; members may delete photos they uploaded.
     * @param id
     * @param userId
     * @param requestBody
     * @returns void
     * @throws ApiError
     */
    public static deleteStorageFile(
        id: string,
        userId: string,
        requestBody: GroupStorageFileDeleteInput,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/groups/{id}/storage-files',
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
     * Friend groups linked to this group (accepted and pending).
     * @param id
     * @param userId
     * @returns FriendGroup Ok
     * @throws ApiError
     */
    public static getFriendGroups(
        id: string,
        userId: string,
    ): CancelablePromise<Array<FriendGroup>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/groups/{id}/friend-groups',
            path: {
                'id': id,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Request a friend-group link using the other group's invite code. Pending until they approve.
     * @param id
     * @param requestBody
     * @returns FriendGroup OK
     * @throws ApiError
     */
    public static requestFriendGroup(
        id: string,
        requestBody: FriendGroupInviteInput,
    ): CancelablePromise<FriendGroup> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/groups/{id}/friend-groups',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Approve or reject an incoming friend-group request.
     * @param id
     * @param friendGroupId
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static decideFriendGroup(
        id: string,
        friendGroupId: string,
        requestBody: FriendGroupDecisionInput,
    ): CancelablePromise<{
        success: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/groups/{id}/friend-groups/{friendGroupId}',
            path: {
                'id': id,
                'friendGroupId': friendGroupId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Remove a friend-group link or cancel an outgoing request.
     * @param id
     * @param friendGroupId
     * @param userId
     * @returns void
     * @throws ApiError
     */
    public static removeFriendGroup(
        id: string,
        friendGroupId: string,
        userId: string,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/groups/{id}/friend-groups/{friendGroupId}',
            path: {
                'id': id,
                'friendGroupId': friendGroupId,
            },
            query: {
                'userId': userId,
            },
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
        alreadyMember?: boolean;
        status: 'joined' | 'pending';
        groupName: string;
        groupId: string;
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
     * Join or request to join a group
     * Join a group by id (from a shared event, poll, or post link)
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
    ): CancelablePromise<{
        alreadyMember?: boolean;
        status: 'joined' | 'pending';
        groupName: string;
        groupId: string;
        success: boolean;
    }> {
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
     * Remove the current user from the group. Owner cannot leave.
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
     * Admin removes a member. Cannot remove owner.
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
     * Admin sets a member's role. Cannot change owner.
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
     * Owner transfers ownership to an admin on an equal or higher plan.
     * Transfer owner role to another member
     * @param id
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static setOwner(
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
            url: '/groups/{id}/owner',
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
     * Merges into stored per-group prefs; delivery also requires matching global user prefs.
     * Update user's in-app notification preferences for a group
     * @param id
     * @param userId
     * @param requestBody
     * @returns void
     * @throws ApiError
     */
    public static updateMemberNotifPrefs(
        id: string,
        userId: string,
        requestBody: Partial_NotifPrefs_,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/groups/{id}/members/{userId}/notification-preferences',
            path: {
                'id': id,
                'userId': userId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get user's resolved notification preferences for a group
     * @param id
     * @param userId
     * @returns NotifPrefs Ok
     * @throws ApiError
     */
    public static getMemberNotifPrefs(
        id: string,
        userId: string,
    ): CancelablePromise<NotifPrefs> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/groups/{id}/members/{userId}/notification-preferences',
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
    /**
     * List posts in a group (active members only).
     * @param id
     * @param userId
     * @returns GroupPost Ok
     * @throws ApiError
     */
    public static getGroupPosts(
        id: string,
        userId: string,
    ): CancelablePromise<Array<GroupPost>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/groups/{id}/posts',
            path: {
                'id': id,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Create a group post (active members only).
     * @param id
     * @param requestBody
     * @returns GroupPost Created
     * @throws ApiError
     */
    public static createGroupPost(
        id: string,
        requestBody: GroupPostCreateInput,
    ): CancelablePromise<GroupPost> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/groups/{id}/posts',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Update your own group post.
     * @param postId
     * @param requestBody
     * @returns GroupPost Ok
     * @throws ApiError
     */
    public static updateGroupPost(
        postId: string,
        requestBody: GroupPostUpdateInput,
    ): CancelablePromise<GroupPost> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/groups/posts/{postId}',
            path: {
                'postId': postId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Delete your own group post.
     * @param postId
     * @param userId
     * @returns void
     * @throws ApiError
     */
    public static deleteGroupPost(
        postId: string,
        userId: string,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/groups/posts/{postId}',
            path: {
                'postId': postId,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Toggle a reaction on a group post (same emoji removes it).
     * @param postId
     * @param requestBody
     * @returns GroupPost Ok
     * @throws ApiError
     */
    public static toggleGroupPostReaction(
        postId: string,
        requestBody: GroupPostReactionInput,
    ): CancelablePromise<GroupPost> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/groups/posts/{postId}/reactions',
            path: {
                'postId': postId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Add a comment (or reply via parentCommentId) on a group post.
     * @param postId
     * @param requestBody
     * @returns GroupPostComment Created
     * @throws ApiError
     */
    public static createGroupPostComment(
        postId: string,
        requestBody: GroupPostCommentCreateInput,
    ): CancelablePromise<GroupPostComment> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/groups/posts/{postId}/comments',
            path: {
                'postId': postId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Update your own group post comment.
     * @param commentId
     * @param requestBody
     * @returns GroupPostComment Ok
     * @throws ApiError
     */
    public static updateGroupPostComment(
        commentId: string,
        requestBody: GroupPostCommentUpdateInput,
    ): CancelablePromise<GroupPostComment> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/groups/post-comments/{commentId}',
            path: {
                'commentId': commentId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Delete your own group post comment.
     * @param commentId
     * @param userId
     * @returns void
     * @throws ApiError
     */
    public static deleteGroupPostComment(
        commentId: string,
        userId: string,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/groups/post-comments/{commentId}',
            path: {
                'commentId': commentId,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Toggle a reaction on a group post comment (same emoji removes it).
     * @param commentId
     * @param requestBody
     * @returns GroupPostComment Ok
     * @throws ApiError
     */
    public static toggleGroupPostCommentReaction(
        commentId: string,
        requestBody: GroupPostReactionInput,
    ): CancelablePromise<GroupPostComment> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/groups/post-comments/{commentId}/reactions',
            path: {
                'commentId': commentId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
