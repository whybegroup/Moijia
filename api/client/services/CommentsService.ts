/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Comment } from '../models/Comment';
import type { CommentReactionInput } from '../models/CommentReactionInput';
import type { CommentUpdateInput } from '../models/CommentUpdateInput';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class CommentsService {
    /**
     * Toggle a reaction on a comment (same emoji again removes it).
     * @param id
     * @param requestBody
     * @returns Comment Ok
     * @throws ApiError
     */
    public static setCommentReaction(
        id: string,
        requestBody: CommentReactionInput,
    ): CancelablePromise<Comment> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/comments/{id}/reactions',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Edits a comment by its author
     * Edit a comment
     * @param id
     * @param requestBody
     * @returns Comment Ok
     * @throws ApiError
     */
    public static updateComment(
        id: string,
        requestBody: CommentUpdateInput,
    ): CancelablePromise<Comment> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/comments/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Deletes a comment from an event (admin can delete others)
     * Delete a comment
     * @param id
     * @param actorId
     * @returns void
     * @throws ApiError
     */
    public static deleteComment(
        id: string,
        actorId: string,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/comments/{id}',
            path: {
                'id': id,
            },
            query: {
                'actorId': actorId,
            },
        });
    }
}
