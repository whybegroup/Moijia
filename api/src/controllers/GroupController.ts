import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Patch,
  Post,
  Put,
  Query,
  Route,
  Tags,
  SuccessResponse,
} from 'tsoa';
import {
  Group,
  GroupScoped,
  GroupInput,
  GroupUpdate,
  User,
  MembershipRequestAction,
  GroupPost,
  GroupPostCreateInput,
  GroupPostUpdateInput,
  GroupPostComment,
  GroupPostCommentCreateInput,
  GroupPostCommentUpdateInput,
  GroupPostReactionInput,
  NotifPrefs,
  NotifPrefsPartial,
  GroupStorageLimitInput,
  GroupStorageBreakdown,
  GroupStorageFileList,
  GroupStorageFileDeleteInput,
} from '../models';
import { GroupService } from '../services/GroupService';
import { httpError } from '../utils/httpError';

@Route('groups')
@Tags('Groups')
export class GroupController extends Controller {
  private groupService = new GroupService();

  /**
   * Get all groups
   * @summary Retrieves a list of groups with info scoped by user's membership status. Requires userId.
   * @param includeDeleted When true, includes soft-deleted groups where user is owner.
   */
  @Get()
  public async getGroups(
    @Query() userId: string,
    @Query() includeDeleted?: boolean
  ): Promise<GroupScoped[]> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    return this.groupService.getAllForUser(userId, includeDeleted === true);
  }

  /**
   * Get group by ID
   * @summary Retrieves a single group with info scoped by user's membership status. Requires userId.
   */
  @Get('{id}')
  public async getGroup(
    @Path() id: string,
    @Query() userId: string
  ): Promise<GroupScoped> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    const group = await this.groupService.getByIdForUser(id, userId);
    if (!group) {
      throw httpError(404, 'Group not found');
    }
    return group;
  }

  /**
   * Get group members
   * @summary Retrieves all members of a specific group. Requires caller to be a member.
   */
  @Get('{id}/members')
  public async getGroupMembers(
    @Path() id: string,
    @Query() userId: string
  ): Promise<User[]> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    const group = await this.groupService.getByIdForUser(id, userId);
    if (!group) {
      throw httpError(404, 'Group not found');
    }
    if (group.membershipStatus !== 'member' && group.membershipStatus !== 'admin') {
      this.setStatus(403);
      throw new Error('Must be a member to view group members');
    }
    return this.groupService.getMembers(id);
  }

  /**
   * Create a new group
   * @summary Creates a new group with initial members
   */
  @Post()
  @SuccessResponse('201', 'Created')
  public async createGroup(@Body() body: GroupInput): Promise<Group> {
    this.setStatus(201);
    return this.groupService.create(body);
  }

  /**
   * Update a group
   * @summary Updates an existing group. Requires admin.
   */
  @Put('{id}')
  public async updateGroup(
    @Path() id: string,
    @Query() userId: string,
    @Body() body: GroupUpdate
  ): Promise<GroupScoped> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    const scoped = await this.groupService.getByIdForUser(id, userId);
    if (!scoped) {
      throw httpError(404, 'Group not found');
    }
    if (scoped.membershipStatus !== 'admin') {
      this.setStatus(403);
      throw new Error('Must be admin to update group');
    }
    await this.groupService.update(id, body);
    const updated = await this.groupService.getByIdForUser(id, userId);
    return updated!;
  }

  /**
   * Regenerate invite code
   * @summary Issues a new invite code for joining; existing members are unchanged. Requires admin.
   */
  @Post('{id}/regenerate-invite-code')
  @SuccessResponse('200', 'OK')
  public async regenerateInviteCode(
    @Path() id: string,
    @Query() userId: string
  ): Promise<{ inviteCode: string }> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    const scoped = await this.groupService.getByIdForUser(id, userId);
    if (!scoped) {
      throw httpError(404, 'Group not found');
    }
    if (scoped.membershipStatus !== 'admin') {
      this.setStatus(403);
      throw new Error('Must be admin to regenerate invite code');
    }
    const { inviteCode } = await this.groupService.regenerateInviteCode(id, userId);
    this.setStatus(200);
    return { inviteCode };
  }

  /**
   * Hard-delete a group
   * @summary Permanently removes a group and all its data. Owner only.
   */
  @Delete('{id}')
  @SuccessResponse('204', 'No Content')
  public async deleteGroup(
    @Path() id: string,
    @Query() userId: string
  ): Promise<void> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    try {
      await this.groupService.hardDelete(id, userId);
      this.setStatus(204);
    } catch (e: any) {
      if (e?.status === 404) {
        throw httpError(404, 'Group not found');
      }
      if (e?.message?.includes('owner')) {
        this.setStatus(403);
        throw new Error('Must be owner to delete group');
      }
      throw e;
    }
  }

  /**
   * Soft-delete a group
   * @summary Marks a group as deleted. Owner only.
   */
  @Post('{id}/soft-delete')
  @SuccessResponse('200', 'OK')
  public async softDeleteGroup(
    @Path() id: string,
    @Body() body: { userId: string }
  ): Promise<{ success: boolean }> {
    if (!body?.userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    try {
      await this.groupService.softDelete(id, body.userId);
      this.setStatus(200);
      return { success: true };
    } catch (e: any) {
      if (e?.message?.includes('owner')) {
        this.setStatus(403);
        throw new Error('Must be owner to soft-delete group');
      }
      throw e;
    }
  }

  /**
   * Recover a soft-deleted group
   * @summary Restores a soft-deleted group. Owner only.
   */
  @Post('{id}/recover')
  @SuccessResponse('200', 'OK')
  public async recoverGroup(
    @Path() id: string,
    @Body() body: { userId: string }
  ): Promise<{ success: boolean }> {
    if (!body?.userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    try {
      await this.groupService.recoverGroup(id, body.userId);
      this.setStatus(200);
      return { success: true };
    } catch (e: any) {
      if (e?.message?.includes('owner')) {
        this.setStatus(403);
        throw new Error('Must be owner to recover group');
      }
      throw e;
    }
  }

  /**
   * Set this group's size add-on (Medium or Large). Owner only.
   * Upgrades apply immediately. Downgrades keep the current size until period end.
   */
  @Put('{id}/max-storage')
  public async setGroupStorageLimit(
    @Path() id: string,
    @Query() userId: string,
    @Body() body: GroupStorageLimitInput
  ): Promise<{ maxStorageBytes: number; sizeTier: string }> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    if (body.sizeTier !== 'medium' && body.sizeTier !== 'large') {
      this.setStatus(400);
      throw new Error('sizeTier must be medium or large');
    }
    return this.groupService.setStorageLimit(id, userId, body.sizeTier);
  }

  /**
   * Start a 15-day grace toward Small after canceling the size add-on. Owner only.
   * Apple/Google still bill until the paid period ends; this is the in-app downgrade clock
   * once paid access is gone or the owner opts out.
   */
  @Post('{id}/cancel-storage-subscription')
  public async cancelStorageSubscription(
    @Path() id: string,
    @Query() userId: string
  ): Promise<{ maxStorageBytes: number }> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    return this.groupService.cancelStorageSubscription(id, userId);
  }

  /**
   * Storage usage broken down by events, polls, and posts. Requires an active member.
   */
  @Get('{id}/storage-breakdown')
  public async getStorageBreakdown(
    @Path() id: string,
    @Query() userId: string
  ): Promise<GroupStorageBreakdown> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    return this.groupService.getStorageBreakdown(id, userId);
  }

  /**
   * Files billed to a storage category. Requires an active member.
   */
  @Get('{id}/storage-files/{category}')
  public async getStorageFiles(
    @Path() id: string,
    @Path() category: string,
    @Query() userId: string
  ): Promise<GroupStorageFileList> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    return this.groupService.listStorageFiles(id, userId, category);
  }

  /**
   * Remove a photo from this group's records and delete it from S3.
   * Owner/admin may delete any photo; members may delete photos they uploaded.
   */
  @Delete('{id}/storage-files')
  public async deleteStorageFile(
    @Path() id: string,
    @Query() userId: string,
    @Body() body: GroupStorageFileDeleteInput
  ): Promise<void> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    await this.groupService.deleteStorageFile(id, userId, body.url);
  }

  /**
   * Join a group by invite code
   * @summary Join or request to join a group using its invite code
   */
  @Post('join-by-code')
  @SuccessResponse('200', 'OK')
  public async joinByInviteCode(
    @Body() body: { inviteCode: string; userId: string }
  ): Promise<{
    success: boolean;
    groupId: string;
    groupName: string;
    status: 'joined' | 'pending';
    alreadyMember?: boolean;
  }> {
    if (!body?.inviteCode?.trim()) {
      this.setStatus(400);
      throw new Error('inviteCode is required');
    }
    if (!body?.userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    try {
      const result = await this.groupService.joinByInviteCode(body.inviteCode, body.userId);
      this.setStatus(200);
      return { success: true, ...result };
    } catch (e: any) {
      if (e?.status === 403) {
        this.setStatus(403);
        throw new Error(e?.message || 'Forbidden');
      }
      throw e;
    }
  }

  /**
   * Join a group by id (from a shared event, poll, or post link)
   * @summary Join or request to join a group
   */
  @Post('{id}/join')
  @SuccessResponse('200', 'OK')
  public async joinGroup(
    @Path() id: string,
    @Body() body: { userId: string }
  ): Promise<{
    success: boolean;
    groupId: string;
    groupName: string;
    status: 'joined' | 'pending';
    alreadyMember?: boolean;
  }> {
    if (!body?.userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    try {
      const result = await this.groupService.joinGroup(id, body.userId);
      this.setStatus(200);
      return { success: true, ...result };
    } catch (e: any) {
      if (e?.status === 404) {
        throw httpError(404, e?.message || 'Group not found');
      }
      throw e;
    }
  }

  /**
   * Leave a group
   * @summary Remove the current user from the group. Owner cannot leave.
   */
  @Post('{id}/leave')
  @SuccessResponse('200', 'OK')
  public async leaveGroup(
    @Path() id: string,
    @Body() body: { userId: string }
  ): Promise<{ success: boolean }> {
    if (!body?.userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    try {
      await this.groupService.leaveGroup(id, body.userId);
      this.setStatus(200);
      return { success: true };
    } catch (e: any) {
      if (e?.message?.includes('Owner cannot leave')) {
        this.setStatus(403);
        throw new Error('Owner cannot leave the group.');
      }
      throw e;
    }
  }

  /**
   * Get pending membership requests
   * @summary Retrieves pending requests for a group. Requires admin.
   */
  @Get('{id}/requests/pending')
  public async getPendingRequests(
    @Path() id: string,
    @Query() userId: string
  ): Promise<User[]> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    const group = await this.groupService.getByIdForUser(id, userId);
    if (!group) {
      throw httpError(404, 'Group not found');
    }
    if (group.membershipStatus !== 'admin') {
      this.setStatus(403);
      throw new Error('Must be admin to view pending requests');
    }
    return this.groupService.getPendingRequests(id);
  }

  /**
   * Remove a member from the group
   * @summary Admin removes a member. Cannot remove owner.
   */
  @Post('{id}/members/{memberId}/remove')
  @SuccessResponse('200', 'OK')
  public async removeMember(
    @Path() id: string,
    @Path() memberId: string,
    @Body() body: { performedBy: string }
  ): Promise<{ success: boolean }> {
    if (!body?.performedBy) {
      this.setStatus(400);
      throw new Error('performedBy is required');
    }
    const group = await this.groupService.getByIdForUser(id, body.performedBy);
    if (!group) {
      throw httpError(404, 'Group not found');
    }
    if (group.membershipStatus !== 'admin') {
      this.setStatus(403);
      throw new Error('Must be admin to remove members');
    }
    try {
      await this.groupService.removeMember(id, memberId, body.performedBy);
      this.setStatus(200);
      return { success: true };
    } catch (e: any) {
      if (e?.message?.includes('owner')) {
        this.setStatus(403);
        throw new Error('Cannot remove owner from group');
      }
      if (e?.message?.includes('Member not found')) {
        throw httpError(404, String(e.message));
      }
      throw e;
    }
  }

  /**
   * Set a member's role (admin or member)
   * @summary Admin sets a member's role. Cannot change owner.
   */
  @Put('{id}/members/{memberId}/role')
  @SuccessResponse('200', 'OK')
  public async setMemberRole(
    @Path() id: string,
    @Path() memberId: string,
    @Body() body: { performedBy: string; role: 'admin' | 'member' }
  ): Promise<{ success: boolean }> {
    if (!body?.performedBy || !body?.role) {
      this.setStatus(400);
      throw new Error('performedBy and role are required');
    }
    const group = await this.groupService.getByIdForUser(id, body.performedBy);
    if (!group) {
      throw httpError(404, 'Group not found');
    }
    if (group.membershipStatus !== 'admin') {
      this.setStatus(403);
      throw new Error('Must be admin to change member roles');
    }
    try {
      await this.groupService.setMemberRole(id, memberId, body.role, body.performedBy);
      this.setStatus(200);
      return { success: true };
    } catch (e: any) {
      if (e?.message?.includes('owner')) {
        this.setStatus(403);
        throw new Error('Cannot change owner role');
      }
      if (e?.message?.includes('Member not found')) {
        throw httpError(404, String(e.message));
      }
      throw e;
    }
  }

  /**
   * Transfer owner role to another member
   * @summary Owner transfers ownership to an admin or member.
   */
  @Put('{id}/owner')
  @SuccessResponse('200', 'OK')
  public async setOwner(
    @Path() id: string,
    @Body() body: { performedBy: string; userId: string }
  ): Promise<{ success: boolean }> {
    if (!body?.performedBy || !body?.userId) {
      this.setStatus(400);
      throw new Error('performedBy and userId are required');
    }
    const group = await this.groupService.getByIdForUser(id, body.performedBy);
    if (!group) {
      throw httpError(404, 'Group not found');
    }
    if (group.ownerId !== body.performedBy) {
      this.setStatus(403);
      throw new Error('Must be owner to transfer ownership');
    }
    try {
      await this.groupService.setOwner(id, body.userId, body.performedBy);
      this.setStatus(200);
      return { success: true };
    } catch (e: any) {
      if (e?.message?.includes('Already owner')) {
        this.setStatus(400);
        throw e;
      }
      if (e?.message?.includes('Member not found')) {
        throw httpError(404, String(e.message));
      }
      throw e;
    }
  }

  /**
   * Handle membership request
   * @summary Approve or reject a membership request. Requires admin.
   */
  @Post('{id}/requests/handle')
  public async handleMembershipRequest(
    @Path() id: string,
    @Query() userId: string,
    @Body() body: MembershipRequestAction
  ): Promise<void> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    const group = await this.groupService.getByIdForUser(id, userId);
    if (!group) {
      throw httpError(404, 'Group not found');
    }
    if (group.membershipStatus !== 'admin') {
      this.setStatus(403);
      throw new Error('Must be admin to handle membership requests');
    }
    try {
      await this.groupService.handleMembershipRequest(id, body);
      this.setStatus(200);
    } catch (e: any) {
      if (e?.status === 403) {
        this.setStatus(403);
        throw new Error(e?.message || 'Forbidden');
      }
      throw e;
    }
  }

  /**
   * Update user's color preference for a group
   * @summary Sets the user's custom color for a specific group
   */
  @Put('{id}/members/{userId}/color')
  public async updateMemberColor(
    @Path() id: string,
    @Path() userId: string,
    @Body() body: { colorHex: string }
  ): Promise<void> {
    const group = await this.groupService.getById(id);
    if (!group) {
      throw httpError(404, 'Group not found');
    }
    await this.groupService.updateMemberColor(id, userId, body.colorHex);
    this.setStatus(200);
  }

  /**
   * Get user's color preference for a group
   * @summary Retrieves the user's custom color for a specific group
   */
  @Get('{id}/members/{userId}/color')
  public async getMemberColor(
    @Path() id: string,
    @Path() userId: string
  ): Promise<{ colorHex: string | null }> {
    const group = await this.groupService.getById(id);
    if (!group) {
      throw httpError(404, 'Group not found');
    }
    const colorHex = await this.groupService.getMemberColor(id, userId);
    return { colorHex };
  }

  /**
   * Update user's in-app notification preferences for a group
   * @summary Merges into stored per-group prefs; delivery also requires matching global user prefs.
   */
  @Put('{id}/members/{userId}/notification-preferences')
  public async updateMemberNotifPrefs(
    @Path() id: string,
    @Path() userId: string,
    @Body() body: NotifPrefsPartial
  ): Promise<void> {
    const group = await this.groupService.getById(id);
    if (!group) {
      throw httpError(404, 'Group not found');
    }
    await this.groupService.updateMemberNotifPrefs(id, userId, body);
    this.setStatus(200);
  }

  /**
   * Get user's resolved notification preferences for a group
   */
  @Get('{id}/members/{userId}/notification-preferences')
  public async getMemberNotifPrefs(
    @Path() id: string,
    @Path() userId: string
  ): Promise<NotifPrefs> {
    const group = await this.groupService.getById(id);
    if (!group) {
      throw httpError(404, 'Group not found');
    }
    return this.groupService.getMemberNotifPrefs(id, userId);
  }

  /**
   * Get user's color preferences for all their groups
   * @summary Retrieves all group color preferences for a user
   */
  @Get('members/{userId}/colors')
  public async getAllMemberColors(
    @Path() userId: string
  ): Promise<Record<string, string>> {
    return this.groupService.getAllMemberColors(userId);
  }

  /** List posts in a group (active members only). */
  @Get('{id}/posts')
  public async getGroupPosts(
    @Path() id: string,
    @Query() userId: string
  ): Promise<GroupPost[]> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    return this.groupService.getGroupPosts(id, userId);
  }

  /** Create a group post (active members only). */
  @Post('{id}/posts')
  @SuccessResponse('201', 'Created')
  public async createGroupPost(
    @Path() id: string,
    @Body() body: GroupPostCreateInput
  ): Promise<GroupPost> {
    if (!body?.userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    this.setStatus(201);
    return this.groupService.createGroupPost(id, body);
  }

  /** Update your own group post. */
  @Patch('posts/{postId}')
  public async updateGroupPost(
    @Path() postId: string,
    @Body() body: GroupPostUpdateInput
  ): Promise<GroupPost> {
    if (!body?.userId || !body?.body?.trim()) {
      this.setStatus(400);
      throw new Error('userId and body are required');
    }
    return this.groupService.updateGroupPost(postId, body);
  }

  /** Delete your own group post. */
  @Delete('posts/{postId}')
  @SuccessResponse('204', 'No Content')
  public async deleteGroupPost(@Path() postId: string, @Query() userId: string): Promise<void> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    await this.groupService.deleteGroupPost(postId, userId);
    this.setStatus(204);
  }

  /** Toggle a reaction on a group post (same emoji removes it). */
  @Post('posts/{postId}/reactions')
  public async toggleGroupPostReaction(
    @Path() postId: string,
    @Body() body: GroupPostReactionInput
  ): Promise<GroupPost> {
    if (!body?.userId || !body?.emoji?.trim()) {
      this.setStatus(400);
      throw new Error('userId and emoji are required');
    }
    return this.groupService.toggleGroupPostReaction(postId, body);
  }

  /** Add a comment (or reply via parentCommentId) on a group post. */
  @Post('posts/{postId}/comments')
  @SuccessResponse('201', 'Created')
  public async createGroupPostComment(
    @Path() postId: string,
    @Body() body: GroupPostCommentCreateInput
  ): Promise<GroupPostComment> {
    if (!body?.userId || !body?.body?.trim()) {
      this.setStatus(400);
      throw new Error('userId and body are required');
    }
    this.setStatus(201);
    return this.groupService.createGroupPostComment(postId, body);
  }

  /** Update your own group post comment. */
  @Patch('post-comments/{commentId}')
  public async updateGroupPostComment(
    @Path() commentId: string,
    @Body() body: GroupPostCommentUpdateInput
  ): Promise<GroupPostComment> {
    if (!body?.userId || !body?.body?.trim()) {
      this.setStatus(400);
      throw new Error('userId and body are required');
    }
    return this.groupService.updateGroupPostComment(commentId, body);
  }

  /** Delete your own group post comment. */
  @Delete('post-comments/{commentId}')
  @SuccessResponse('204', 'No Content')
  public async deleteGroupPostComment(
    @Path() commentId: string,
    @Query() userId: string
  ): Promise<void> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    await this.groupService.deleteGroupPostComment(commentId, userId);
    this.setStatus(204);
  }

  /** Toggle a reaction on a group post comment (same emoji removes it). */
  @Post('post-comments/{commentId}/reactions')
  public async toggleGroupPostCommentReaction(
    @Path() commentId: string,
    @Body() body: GroupPostReactionInput
  ): Promise<GroupPostComment> {
    if (!body?.userId || !body?.emoji?.trim()) {
      this.setStatus(400);
      throw new Error('userId and emoji are required');
    }
    return this.groupService.toggleGroupPostCommentReaction(commentId, body);
  }
}
