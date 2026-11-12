/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Body for POST /polls/{id}/option-suggestions/{suggestionId}/decide
 */
export type PollOptionSuggestionDecisionInput = {
    userId: string;
    decision: PollOptionSuggestionDecisionInput.decision;
};
export namespace PollOptionSuggestionDecisionInput {
    export enum decision {
        ACCEPT = 'accept',
        DECLINE = 'decline',
    }
}

