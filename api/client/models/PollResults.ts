/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PollQuestionResult } from './PollQuestionResult';
export type PollResults = {
    pollId: string;
    myOptionIds: Array<string>;
    /**
     * Per-option ranks for the requesting user (rating questions).
     */
    myOptionRanks: Array<{
        rank: number;
        optionId: string;
    }>;
    questions: Array<PollQuestionResult>;
};

