/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type FriendGroupDecisionInput = {
    userId: string;
    action: FriendGroupDecisionInput.action;
};
export namespace FriendGroupDecisionInput {
    export enum action {
        APPROVE = 'approve',
        REJECT = 'reject',
    }
}

