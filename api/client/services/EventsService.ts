/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Comment } from '../models/Comment';
import type { CommentInput } from '../models/CommentInput';
import type { Event } from '../models/Event';
import type { EventDetailed } from '../models/EventDetailed';
import type { EventInput } from '../models/EventInput';
import type { EventTask } from '../models/EventTask';
import type { EventTaskInput } from '../models/EventTaskInput';
import type { EventTaskUpdate } from '../models/EventTaskUpdate';
import type { EventTimeSuggestion } from '../models/EventTimeSuggestion';
import type { EventTimeSuggestionInput } from '../models/EventTimeSuggestionInput';
import type { EventUpdate } from '../models/EventUpdate';
import type { EventWatchInput } from '../models/EventWatchInput';
import type { RecurrenceTruncateResult } from '../models/RecurrenceTruncateResult';
import type { RecurrenceTruncateSeriesInput } from '../models/RecurrenceTruncateSeriesInput';
import type { RSVP } from '../models/RSVP';
import type { RSVPInput } from '../models/RSVPInput';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class EventsService {
    /**
     * Retrieves events scoped by user's group membership. userId required.
     * Get all events
     * @param userId
     * @param groupId
     * @param startAfter
     * @param startBefore
     * @param limit
     * @returns EventDetailed Ok
     * @throws ApiError
     */
    public static getEvents(
        userId: string,
        groupId?: string,
        startAfter?: string,
        startBefore?: string,
        limit?: number,
    ): CancelablePromise<Array<EventDetailed>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/events',
            query: {
                'userId': userId,
                'groupId': groupId,
                'startAfter': startAfter,
                'startBefore': startBefore,
                'limit': limit,
            },
        });
    }
    /**
     * Creates a new event in a group
     * Create a new event
     * @param userId
     * @param requestBody
     * @returns Event Created
     * @throws ApiError
     */
    public static createEvent(
        userId: string,
        requestBody: EventInput,
    ): CancelablePromise<Event> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/events',
            query: {
                'userId': userId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Watch / unwatch this event for default notifications (per-user).
     * @param id
     * @param userId
     * @param requestBody
     * @returns any Ok
     * @throws ApiError
     */
    public static setEventWatch(
        id: string,
        userId: string,
        requestBody: EventWatchInput,
    ): CancelablePromise<{
        defaultWatching: boolean;
        watching: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/events/{id}/watch',
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
     * Retrieves a single event. userId required to verify access.
     * Get event by ID
     * @param id
     * @param userId
     * @returns EventDetailed Ok
     * @throws ApiError
     */
    public static getEvent(
        id: string,
        userId: string,
    ): CancelablePromise<EventDetailed> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/events/{id}',
            path: {
                'id': id,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Updates an existing event's information
     * Update an event
     * @param id
     * @param userId
     * @param requestBody
     * @returns Event Ok
     * @throws ApiError
     */
    public static updateEvent(
        id: string,
        userId: string,
        requestBody: EventUpdate,
    ): CancelablePromise<Event> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/events/{id}',
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
     * Deletes an event and all associated data
     * Delete an event
     * @param id
     * @param userId
     * @returns void
     * @throws ApiError
     */
    public static deleteEvent(
        id: string,
        userId: string,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/events/{id}',
            path: {
                'id': id,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Delete every occurrence in a series (same `recurrenceSeriesId`).
     * @param seriesId
     * @param userId
     * @returns void
     * @throws ApiError
     */
    public static deleteRecurrenceSeries(
        seriesId: string,
        userId: string,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/events/recurrence-series/{seriesId}',
            path: {
                'seriesId': seriesId,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Remove this occurrence and all later ones in the same series (by start time).
     * If the chosen occurrence is the first, deletes the entire series.
     * @param id
     * @param userId
     * @param requestBody
     * @returns RecurrenceTruncateResult Ok
     * @throws ApiError
     */
    public static truncateRecurrenceSeries(
        id: string,
        userId: string,
        requestBody: RecurrenceTruncateSeriesInput,
    ): CancelablePromise<RecurrenceTruncateResult> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/events/{id}/recurrence/truncate',
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
     * Creates or updates a user's RSVP for an event
     * Create or update RSVP
     * @param id
     * @param requestBody
     * @returns RSVP Ok
     * @throws ApiError
     */
    public static upsertRsvp(
        id: string,
        requestBody: RSVPInput,
    ): CancelablePromise<RSVP> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/events/{id}/rsvps',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Removes a user's RSVP from an event
     * Delete RSVP
     * @param id
     * @param userId
     * @returns void
     * @throws ApiError
     */
    public static deleteRsvp(
        id: string,
        userId: string,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/events/{id}/rsvps/{userId}',
            path: {
                'id': id,
                'userId': userId,
            },
        });
    }
    /**
     * Retrieves all comments for an event
     * Get event comments
     * @param id
     * @param userId
     * @returns Comment Ok
     * @throws ApiError
     */
    public static getComments(
        id: string,
        userId?: string,
    ): CancelablePromise<Array<Comment>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/events/{id}/comments',
            path: {
                'id': id,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Adds a new comment to an event
     * Create a comment
     * @param id
     * @param requestBody
     * @returns Comment Created
     * @throws ApiError
     */
    public static createComment(
        id: string,
        requestBody: CommentInput,
    ): CancelablePromise<Comment> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/events/{id}/comments',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Suggest a new start/end time for the event.
     * @param id
     * @param userId
     * @param requestBody
     * @returns EventTimeSuggestion Created
     * @throws ApiError
     */
    public static createTimeSuggestion(
        id: string,
        userId: string,
        requestBody: EventTimeSuggestionInput,
    ): CancelablePromise<EventTimeSuggestion> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/events/{id}/time-suggestions',
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
     * Host or group admin: apply a suggested time to the event.
     * @param id
     * @param suggestionId
     * @param userId
     * @returns Event Ok
     * @throws ApiError
     */
    public static acceptTimeSuggestion(
        id: string,
        suggestionId: string,
        userId: string,
    ): CancelablePromise<Event> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/events/{id}/time-suggestions/{suggestionId}/accept',
            path: {
                'id': id,
                'suggestionId': suggestionId,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Host or group admin: reject a time suggestion.
     * @param id
     * @param suggestionId
     * @param userId
     * @returns EventTimeSuggestion Ok
     * @throws ApiError
     */
    public static rejectTimeSuggestion(
        id: string,
        suggestionId: string,
        userId: string,
    ): CancelablePromise<EventTimeSuggestion> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/events/{id}/time-suggestions/{suggestionId}/reject',
            path: {
                'id': id,
                'suggestionId': suggestionId,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Add a checklist task to an event.
     * @param id
     * @param requestBody
     * @returns EventTask Created
     * @throws ApiError
     */
    public static createTask(
        id: string,
        requestBody: EventTaskInput,
    ): CancelablePromise<EventTask> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/events/{id}/tasks',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Update a task title, assignee, or completion.
     * @param id
     * @param taskId
     * @param requestBody
     * @returns EventTask Ok
     * @throws ApiError
     */
    public static updateTask(
        id: string,
        taskId: string,
        requestBody: EventTaskUpdate,
    ): CancelablePromise<EventTask> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/events/{id}/tasks/{taskId}',
            path: {
                'id': id,
                'taskId': taskId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Remove a task from an event.
     * @param id
     * @param taskId
     * @param actorId
     * @param seriesUpdateScope
     * @returns void
     * @throws ApiError
     */
    public static deleteTask(
        id: string,
        taskId: string,
        actorId: string,
        seriesUpdateScope?: 'this_occurrence' | 'this_and_following' | 'all_occurrences',
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/events/{id}/tasks/{taskId}',
            path: {
                'id': id,
                'taskId': taskId,
            },
            query: {
                'actorId': actorId,
                'seriesUpdateScope': seriesUpdateScope,
            },
        });
    }
}
