/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Poll } from './Poll';
import type { PollOptionSuggestion } from './PollOptionSuggestion';
/**
 * Response when accepting (includes updated poll); decline returns suggestion only via poll optional absent
 */
export type PollOptionSuggestionDecisionResult = {
    suggestion: PollOptionSuggestion;
    /**
     * Present when decision was accept and poll was updated.
     */
    poll?: Poll;
};

