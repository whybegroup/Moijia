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
import { Notification, NotificationInput } from '../models';
import { NotificationService } from '../services/NotificationService';

@Route('notifications')
@Tags('Notifications')
export class NotificationController extends Controller {
  private notificationService = new NotificationService();

  /**
   * Get all notifications
   * @summary Retrieves notifications, optionally filtered by user
   */
  @Get()
  public async getNotifications(@Query() userId?: string): Promise<Notification[]> {
    return this.notificationService.getAll(userId);
  }

  /**
   * Get notification by ID
   * @summary Retrieves a single notification
   */
  @Get('{id}')
  public async getNotification(@Path() id: string): Promise<Notification> {
    const notification = await this.notificationService.getById(id);
    if (!notification) {
      this.setStatus(404);
      throw new Error('Notification not found');
    }
    return notification;
  }

  /**
   * Create a notification
   * @summary Creates a new notification
   */
  @Post()
  @SuccessResponse('201', 'Created')
  public async createNotification(@Body() body: NotificationInput): Promise<Notification> {
    this.setStatus(201);
    return this.notificationService.create(body);
  }

  /**
   * Update notification read status
   * @summary Marks a notification as read or unread
   */
  @Put('{id}')
  public async updateNotification(
    @Path() id: string,
    @Body() body: { read: boolean }
  ): Promise<Notification> {
    return this.notificationService.updateReadStatus(id, body.read);
  }

  /**
   * Get unread notification count
   * @summary Gets count of unread notifications for a user
   */
  @Get('unread-count/{userId}')
  public async getUnreadCount(@Path() userId: string): Promise<{ count: number }> {
    const count = await this.notificationService.getUnreadCount(userId);
    return { count };
  }

  /**
   * Mark all as read
   * @summary Marks all notifications as read for a user
   */
  @Put('mark-all-read/{userId}')
  public async markAllAsRead(@Path() userId: string): Promise<{ success: boolean }> {
    await this.notificationService.markAllAsRead(userId);
    return { success: true };
  }

  /**
   * Delete notification
   * @summary Deletes a notification
   */
  @Delete('{id}')
  public async deleteNotification(@Path() id: string): Promise<{ success: boolean }> {
    await this.notificationService.delete(id);
    return { success: true };
  }
}
