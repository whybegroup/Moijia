/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Membership request action
 */
export type MembershipRequestAction = {
    /**
     * User ID of the member request
     */
    userId: string;
    /**
     * Action to take: approve or reject
     */
    action: MembershipRequestAction.action;
};
export namespace MembershipRequestAction {
    /**
     * Action to take: approve or reject
     */
    export enum action {
        APPROVE = 'approve',
        REJECT = 'reject',
    }
}

