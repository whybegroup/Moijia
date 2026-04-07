import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
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
  NotifPrefs,
  NotifPrefsPartial,
} from '../models';
import { GroupService } from '../services/GroupService';

@Route('groups')
@Tags('Groups')
export class GroupController extends Controller {
  private groupService = new GroupService();

  /**
   * Get all groups
   * @summary Retrieves a list of groups with info scoped by user's membership status. Requires userId.
   * @param includeDeleted When true, includes soft-deleted groups where user is superadmin.
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
      this.setStatus(404);
      throw new Error('Group not found');
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
      this.setStatus(404);
      throw new Error('Group not found');
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
      this.setStatus(404);
      throw new Error('Group not found');
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
      this.setStatus(404);
      throw new Error('Group not found');
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
   * @summary Permanently removes a group and all its data. Superadmin only.
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
        this.setStatus(404);
        throw new Error('Group not found');
      }
      if (e?.message?.includes('superadmin')) {
        this.setStatus(403);
        throw new Error('Must be superadmin to delete group');
      }
      throw e;
    }
  }

  /**
   * Soft-delete a group
   * @summary Marks a group as deleted. Superadmin only.
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
      if (e?.message?.includes('superadmin')) {
        this.setStatus(403);
        throw new Error('Must be superadmin to soft-delete group');
      }
      throw e;
    }
  }

  /**
   * Recover a soft-deleted group
   * @summary Restores a soft-deleted group. Superadmin only.
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
      if (e?.message?.includes('superadmin')) {
        this.setStatus(403);
        throw new Error('Must be superadmin to recover group');
      }
      throw e;
    }
  }

  /**
   * Join a group by invite code
   * @summary Join or request to join a group using its invite code
   */
  @Post('join-by-code')
  @SuccessResponse('200', 'OK')
  public async joinByInviteCode(
    @Body() body: { inviteCode: string; userId: string }
  ): Promise<{ success: boolean; groupName: string; status: 'joined' | 'pending' }> {
    if (!body?.inviteCode?.trim()) {
      this.setStatus(400);
      throw new Error('inviteCode is required');
    }
    if (!body?.userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    const result = await this.groupService.joinByInviteCode(body.inviteCode, body.userId);
    this.setStatus(200);
    return { success: true, ...result };
  }

  /**
   * Leave a group
   * @summary Remove the current user from the group. Superadmin cannot leave.
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
      if (e?.message?.includes('Superadmin cannot leave')) {
        this.setStatus(403);
        throw new Error('Superadmin cannot leave the group.');
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
      this.setStatus(404);
      throw new Error('Group not found');
    }
    if (group.membershipStatus !== 'admin') {
      this.setStatus(403);
      throw new Error('Must be admin to view pending requests');
    }
    return this.groupService.getPendingRequests(id);
  }

  /**
   * Remove a member from the group
   * @summary Admin removes a member. Cannot remove superadmin.
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
      this.setStatus(404);
      throw new Error('Group not found');
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
      if (e?.message?.includes('superadmin')) {
        this.setStatus(403);
        throw new Error('Cannot remove superadmin from group');
      }
      if (e?.message?.includes('Member not found')) {
        this.setStatus(404);
        throw e;
      }
      throw e;
    }
  }

  /**
   * Set a member's role (admin or member)
   * @summary Admin sets a member's role. Cannot change superadmin.
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
      this.setStatus(404);
      throw new Error('Group not found');
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
      if (e?.message?.includes('superadmin')) {
        this.setStatus(403);
        throw new Error('Cannot change superadmin role');
      }
      if (e?.message?.includes('Member not found')) {
        this.setStatus(404);
        throw e;
      }
      throw e;
    }
  }

  /**
   * Transfer superadmin role to another member
   * @summary Superadmin transfers ownership to an admin or member.
   */
  @Put('{id}/superadmin')
  @SuccessResponse('200', 'OK')
  public async setSuperAdmin(
    @Path() id: string,
    @Body() body: { performedBy: string; userId: string }
  ): Promise<{ success: boolean }> {
    if (!body?.performedBy || !body?.userId) {
      this.setStatus(400);
      throw new Error('performedBy and userId are required');
    }
    const group = await this.groupService.getByIdForUser(id, body.performedBy);
    if (!group) {
      this.setStatus(404);
      throw new Error('Group not found');
    }
    if (group.superAdminId !== body.performedBy) {
      this.setStatus(403);
      throw new Error('Must be superadmin to transfer ownership');
    }
    try {
      await this.groupService.setSuperAdmin(id, body.userId, body.performedBy);
      this.setStatus(200);
      return { success: true };
    } catch (e: any) {
      if (e?.message?.includes('Already superadmin')) {
        this.setStatus(400);
        throw e;
      }
      if (e?.message?.includes('Member not found')) {
        this.setStatus(404);
        throw e;
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
      this.setStatus(404);
      throw new Error('Group not found');
    }
    if (group.membershipStatus !== 'admin') {
      this.setStatus(403);
      throw new Error('Must be admin to handle membership requests');
    }
    await this.groupService.handleMembershipRequest(id, body);
    this.setStatus(200);
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
      this.setStatus(404);
      throw new Error('Group not found');
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
      this.setStatus(404);
      throw new Error('Group not found');
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
      this.setStatus(404);
      throw new Error('Group not found');
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
      this.setStatus(404);
      throw new Error('Group not found');
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
}
