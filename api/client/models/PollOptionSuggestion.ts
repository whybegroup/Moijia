/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PollOptionSuggestionStatus } from './PollOptionSuggestionStatus';
export type PollOptionSuggestion = {
    id: string;
    pollId: string;
    questionKey: string;
    label: string;
    suggestedBy: string;
    suggesterName?: string;
    status: PollOptionSuggestionStatus;
    createdAt: string;
    decidedAt?: string;
};

