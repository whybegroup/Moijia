/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PollQuestionResult = {
    questionKey: string;
    questionIndex: number;
    questionTitle: string;
    questionType: PollQuestionResult.questionType;
    anonymousVotes?: boolean;
    totalVotes: number;
    textResponseCount?: number;
    textResponses?: Array<{
        thumbnail?: string | null;
        avatarSeed?: string | null;
        answer: string;
        userName: string;
        userId: string;
    }>;
    options: Array<{
        voters?: Array<{
            /**
             * Ranking position when questionType is rating (1 = best).
             */
            rank?: number;
            thumbnail?: string | null;
            avatarSeed?: string | null;
            userName: string;
            userId: string;
        }>;
        pct: number;
        /**
         * Distinct voters who picked this option (always set; survives anonymous redaction).
         */
        responseCount: number;
        votes: number;
        label: string;
        optionId: string;
    }>;
};
export namespace PollQuestionResult {
    export enum questionType {
        SINGLE = 'single',
        MULTIPLE = 'multiple',
        RATING = 'rating',
        TEXT = 'text',
    }
}

