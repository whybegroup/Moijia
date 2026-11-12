/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type MemberPlan = {
    userId: string;
    subscriptionTier: MemberPlan.subscriptionTier;
    /**
     * Server decision: this member's plan can take ownership from the current owner.
     */
    canReceiveOwnership?: boolean;
};
export namespace MemberPlan {
    export enum subscriptionTier {
        FREE = 'free',
        PRO = 'pro',
        ENTERPRISE = 'enterprise',
    }
}

