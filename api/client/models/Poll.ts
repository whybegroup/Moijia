/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PollOption } from './PollOption';
export type Poll = {
    id: string;
    groupId: string;
    createdBy: string;
    createdByName?: string;
    updatedBy: string;
    title: string;
    description?: string;
    anonymousVotes: boolean;
    multipleChoice: boolean;
    ranking: boolean;
    /**
     * UTC instant when voting closes.
     */
    deadline: string;
    /**
     * UTC instant when poll was manually closed before deadline.
     */
    closedAt?: string;
    /**
     * User id who manually closed the poll.
     */
    closedBy?: string;
    /**
     * Display name of closer when available.
     */
    closedByName?: string;
    coverPhotos: Array<string>;
    options: Array<PollOption>;
    createdAt: string;
    updatedAt: string;
    /**
     * Distinct group members who submitted at least one option vote or text answer.
     */
    respondentCount: number;
    /**
     * Effective watcher status for the viewer (when loaded with userId).
     */
    viewerWatching?: boolean;
    /**
     * Default watcher status for the viewer when no explicit PollWatch row exists.
     */
    viewerWatchDefault?: boolean;
};

