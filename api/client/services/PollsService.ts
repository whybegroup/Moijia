/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Poll } from '../models/Poll';
import type { PollCloseInput } from '../models/PollCloseInput';
import type { PollInput } from '../models/PollInput';
import type { PollOptionSuggestion } from '../models/PollOptionSuggestion';
import type { PollOptionSuggestionDecisionInput } from '../models/PollOptionSuggestionDecisionInput';
import type { PollOptionSuggestionDecisionResult } from '../models/PollOptionSuggestionDecisionResult';
import type { PollOptionSuggestionInput } from '../models/PollOptionSuggestionInput';
import type { PollResults } from '../models/PollResults';
import type { PollVoteInput } from '../models/PollVoteInput';
import type { PollWatchInput } from '../models/PollWatchInput';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class PollsService {
    /**
     * Create a poll in a group (active members).
     * @param userId
     * @param requestBody
     * @returns Poll Created
     * @throws ApiError
     */
    public static createPoll(
        userId: string,
        requestBody: PollInput,
    ): CancelablePromise<Poll> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/polls',
            query: {
                'userId': userId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * List polls where the user is an active member of the group.
     * @param userId
     * @returns Poll Ok
     * @throws ApiError
     */
    public static listPolls(
        userId: string,
    ): CancelablePromise<Array<Poll>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/polls',
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Edit an existing poll (creator only).
     * @param id
     * @param userId
     * @param requestBody
     * @returns Poll Ok
     * @throws ApiError
     */
    public static updatePoll(
        id: string,
        userId: string,
        requestBody: PollInput,
    ): CancelablePromise<Poll> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/polls/{id}',
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
     * Get a poll if the user is an active member of its group.
     * @param id
     * @param userId
     * @returns Poll Ok
     * @throws ApiError
     */
    public static getPoll(
        id: string,
        userId: string,
    ): CancelablePromise<Poll> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/polls/{id}',
            path: {
                'id': id,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Delete a poll (creator or group admin).
     * @param id
     * @param userId
     * @returns void
     * @throws ApiError
     */
    public static deletePoll(
        id: string,
        userId: string,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/polls/{id}',
            path: {
                'id': id,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Watch / unwatch this poll for default notifications.
     * @param id
     * @param userId
     * @param requestBody
     * @returns any Ok
     * @throws ApiError
     */
    public static setPollWatch(
        id: string,
        userId: string,
        requestBody: PollWatchInput,
    ): CancelablePromise<{
        defaultWatching: boolean;
        watching: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/polls/{id}/watch',
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
     * Submit or replace the user's votes for this poll.
     * @param id
     * @param requestBody
     * @returns PollResults Ok
     * @throws ApiError
     */
    public static submitVote(
        id: string,
        requestBody: PollVoteInput,
    ): CancelablePromise<PollResults> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/polls/{id}/vote',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Close poll early (creator/admin/owner).
     * @param id
     * @param requestBody
     * @returns Poll Ok
     * @throws ApiError
     */
    public static closePoll(
        id: string,
        requestBody: PollCloseInput,
    ): CancelablePromise<Poll> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/polls/{id}/close',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Read aggregated poll results + caller's current selections.
     * @param id
     * @param userId
     * @returns PollResults Ok
     * @throws ApiError
     */
    public static getPollResults(
        id: string,
        userId: string,
    ): CancelablePromise<PollResults> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/polls/{id}/results',
            path: {
                'id': id,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Suggest a new choice option (active group members; not for text questions).
     * @param id
     * @param requestBody
     * @returns PollOptionSuggestion Created
     * @throws ApiError
     */
    public static suggestPollOption(
        id: string,
        requestBody: PollOptionSuggestionInput,
    ): CancelablePromise<PollOptionSuggestion> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/polls/{id}/option-suggestions',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * List option suggestions (active group members).
     * @param id
     * @param userId
     * @returns PollOptionSuggestion Ok
     * @throws ApiError
     */
    public static listPollOptionSuggestions(
        id: string,
        userId: string,
    ): CancelablePromise<Array<PollOptionSuggestion>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/polls/{id}/option-suggestions',
            path: {
                'id': id,
            },
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * Accept or decline a suggested option (poll creator or group admin).
     * @param id
     * @param suggestionId
     * @param requestBody
     * @returns PollOptionSuggestionDecisionResult Ok
     * @throws ApiError
     */
    public static decidePollOptionSuggestion(
        id: string,
        suggestionId: string,
        requestBody: PollOptionSuggestionDecisionInput,
    ): CancelablePromise<PollOptionSuggestionDecisionResult> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/polls/{id}/option-suggestions/{suggestionId}/decide',
            path: {
                'id': id,
                'suggestionId': suggestionId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
