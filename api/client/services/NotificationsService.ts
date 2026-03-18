/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Notification } from '../models/Notification';
import type { NotificationInput } from '../models/NotificationInput';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class NotificationsService {
    /**
     * Retrieves notifications, optionally filtered by user
     * Get all notifications
     * @param userId
     * @returns Notification Ok
     * @throws ApiError
     */
    public static getNotifications(
        userId?: string,
    ): CancelablePromise<Array<Notification>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/notifications',
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Creates a new notification
     * Create a notification
     * @param requestBody
     * @returns Notification Created
     * @throws ApiError
     */
    public static createNotification(
        requestBody: NotificationInput,
    ): CancelablePromise<Notification> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/notifications',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Retrieves a single notification
     * Get notification by ID
     * @param id
     * @returns Notification Ok
     * @throws ApiError
     */
    public static getNotification(
        id: string,
    ): CancelablePromise<Notification> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/notifications/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Marks a notification as read or unread
     * Update notification read status
     * @param id
     * @param requestBody
     * @returns Notification Ok
     * @throws ApiError
     */
    public static updateNotification(
        id: string,
        requestBody: {
            read: boolean;
        },
    ): CancelablePromise<Notification> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/notifications/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Deletes a notification
     * Delete notification
     * @param id
     * @returns any Ok
     * @throws ApiError
     */
    public static deleteNotification(
        id: string,
    ): CancelablePromise<{
        success: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/notifications/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Gets count of unread notifications for a user
     * Get unread notification count
     * @param userId
     * @returns any Ok
     * @throws ApiError
     */
    public static getUnreadCount(
        userId: string,
    ): CancelablePromise<{
        count: number;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/notifications/unread-count/{userId}',
            path: {
                'userId': userId,
            },
        });
    }
    /**
     * Marks all notifications as read for a user
     * Mark all as read
     * @param userId
     * @returns any Ok
     * @throws ApiError
     */
    public static markAllAsRead(
        userId: string,
    ): CancelablePromise<{
        success: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/notifications/mark-all-read/{userId}',
            path: {
                'userId': userId,
            },
        });
    }
}
