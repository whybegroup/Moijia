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
  Response,
} from 'tsoa';
import { User, UserInput, UserUpdate, GroupOrderInput, GroupBillingSyncInput, OwnedGroupQuota } from '../models';
import type { PushTokenInput } from '../models/PushToken';
import { UserService } from '../services/UserService';
import { PushTokenService } from '../services/PushTokenService';
import { groupBilling } from '../services/GroupBillingService';

@Route('users')
@Tags('Users')
export class UserController extends Controller {
  private userService = new UserService();
  private pushTokenService = new PushTokenService();

  /**
   * Get all users
   * @summary Retrieves a list of all users in the system
   */
  @Get()
  public async getUsers(): Promise<User[]> {
    return this.userService.getAll();
  }

  /**
   * Get user by ID
   * @summary Retrieves a single user by their unique identifier
   */
  @Get('{id}')
  @Response(404, 'User not found')
  public async getUser(@Path() id: string): Promise<User> {
    const user = await this.userService.getById(id);
    if (!user) {
      throw {
        status: 404,
        message: 'User not found',
      };
    }
    return user;
  }

  /**
   * Create a new user
   * @summary Creates a new user in the system
   */
  @Post()
  @SuccessResponse('201', 'Created')
  public async createUser(@Body() body: UserInput): Promise<User> {
    this.setStatus(201);
    return this.userService.create(body);
  }

  /**
   * Sync user from auth provider (upsert)
   * @summary Ensures the user row exists; provider name is refreshed, display name is not overwritten
   */
  @Post('sync')
  public async syncUser(@Body() body: UserInput): Promise<User> {
    return this.userService.upsertFromAuth(body);
  }

  /**
   * How many groups this user can still own (5 free + extra slots).
   */
  @Get('{id}/owned-group-quota')
  public async getOwnedGroupQuota(@Path() id: string): Promise<OwnedGroupQuota> {
    return groupBilling.getOwnedGroupQuota(id);
  }

  /**
   * Record a purchased extra owned-group slot ($0.99).
   */
  @Post('{id}/extra-group-slots')
  public async addExtraGroupSlot(@Path() id: string): Promise<{ extraGroupSlots: number }> {
    return groupBilling.addExtraGroupSlot(id);
  }

  /**
   * Reconcile Medium/Large add-ons from RevenueCat with owned groups.
   * Lapsed entitlements start a 15-day grace; restored entitlements clear it.
   */
  @Post('{id}/billing-sync')
  public async syncBilling(
    @Path() id: string,
    @Body() body: GroupBillingSyncInput
  ): Promise<OwnedGroupQuota> {
    await groupBilling.syncOwnerEntitlements(id, {
      mediumActive: !!body.mediumActive,
      largeActive: !!body.largeActive,
    });
    return groupBilling.getOwnedGroupQuota(id);
  }

  /**
   * Set preferred group list order for the user
   * @summary Persists drag-and-drop order for All Groups and group switchers
   */
  @Put('{id}/group-order')
  public async setGroupOrder(
    @Path() id: string,
    @Body() body: GroupOrderInput
  ): Promise<string[]> {
    try {
      return await this.userService.setGroupOrder(id, body);
    } catch (e: any) {
      this.setStatus(400);
      throw new Error(e?.message ?? 'Invalid group order');
    }
  }

  /**
   * Register an Expo push token for a user (iOS/Android)
   * @summary Upserts a device push token for remote notifications
   */
  @Post('{id}/push-token')
  @SuccessResponse('204', 'No Content')
  public async registerPushToken(
    @Path() id: string,
    @Body() body: PushTokenInput
  ): Promise<void> {
    await this.pushTokenService.register(id, body);
    this.setStatus(204);
  }

  /**
   * Remove a push token (e.g. on sign-out)
   * @summary Unregisters a device push token
   */
  @Delete('{id}/push-token')
  @SuccessResponse('204', 'No Content')
  public async unregisterPushToken(
    @Path() id: string,
    @Query() token: string
  ): Promise<void> {
    await this.pushTokenService.unregister(id, token);
    this.setStatus(204);
  }

  /**
   * Update a user
   * @summary Updates an existing user's information
   */
  @Put('{id}')
  public async updateUser(
    @Path() id: string,
    @Body() body: UserUpdate
  ): Promise<User> {
    return this.userService.update(id, body);
  }

  /**
   * Delete a user
   * @summary Deletes a user from the system
   */
  @Delete('{id}')
  @SuccessResponse('204', 'No Content')
  public async deleteUser(@Path() id: string): Promise<void> {
    await this.userService.delete(id);
    this.setStatus(204);
  }
}
