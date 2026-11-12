/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PollVoteInput = {
    userId: string;
    optionIds: Array<string>;
    textAnswers?: Array<{
        answer: string;
        questionKey: string;
    }>;
};

