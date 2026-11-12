/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PollOptionInput } from './PollOptionInput';
export type PollInput = {
    id?: string;
    groupId: string;
    createdBy: string;
    title: string;
    description?: string;
    /**
     * UTC instant (ISO) after which voting should be considered closed.
     */
    deadline: string;
    coverPhotos?: Array<string>;
    options: Array<PollOptionInput>;
    anonymousVotes?: boolean;
    multipleChoice?: boolean;
    ranking?: boolean;
};

