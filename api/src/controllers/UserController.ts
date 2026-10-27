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
import { User, UserInput, UserUpdate, GroupOrderInput, GroupBillingSyncInput, OwnedGroupQuota, PurchaseHistoryEntry, SubscriptionCancelCheck } from '../models';
import type { PushTokenInput } from '../models/PushToken';
import { UserService } from '../services/UserService';
import { PushTokenService } from '../services/PushTokenService';
import { groupBilling } from '../services/GroupBillingService';
import { listPurchases } from '../services/PurchaseHistoryService';

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
   * How many groups this user can still own on their plan.
   */
  @Get('{id}/owned-group-quota')
  public async getOwnedGroupQuota(@Path() id: string): Promise<OwnedGroupQuota> {
    return groupBilling.getOwnedGroupQuota(id);
  }

  /**
   * Whether the groups this user owns already fit the free plan.
   * Cancelling Pro is always allowed. Extra groups are deleted after the grace period.
   */
  @Get('{id}/subscription-cancel')
  public async getSubscriptionCancelCheck(@Path() id: string): Promise<SubscriptionCancelCheck> {
    return groupBilling.getSubscriptionCancelCheck(id);
  }

  /**
   * Purchase and plan-change history for this user.
   */
  @Get('{id}/purchase-history')
  public async getPurchaseHistory(@Path() id: string): Promise<PurchaseHistoryEntry[]> {
    return listPurchases(id);
  }

  /**
   * Reconcile the App Store Pro subscription with this account.
   * Enterprise is left unchanged. After Pro expires, groups stay for 15 days.
   * Then only the top two in My Groups are kept and become Small. The rest are deleted.
   */
  @Post('{id}/billing-sync')
  public async syncBilling(
    @Path() id: string,
    @Body() body: GroupBillingSyncInput
  ): Promise<OwnedGroupQuota> {
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (body.expiresAt && expiresAt && Number.isNaN(expiresAt.getTime())) {
      this.setStatus(400);
      throw new Error('expiresAt is invalid');
    }
    const purchasedAt = body.purchasedAt ? new Date(body.purchasedAt) : null;
    if (body.purchasedAt && purchasedAt && Number.isNaN(purchasedAt.getTime())) {
      this.setStatus(400);
      throw new Error('purchasedAt is invalid');
    }
    return groupBilling.syncSubscription(id, {
      proActive: !!body.proActive,
      proRenewing: !!body.proActive && body.proRenewing !== false,
      expiresAt,
      purchasedAt,
    });
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
