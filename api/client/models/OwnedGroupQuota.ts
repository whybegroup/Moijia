/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type OwnedGroupQuota = {
    ownedGroupCount: number;
    subscriptionTier: OwnedGroupQuota.subscriptionTier;
    planLabel: string;
    /**
     * Shown on the current plan when it has a price.
     */
    priceLabel: string | null;
    /**
     * Pro price for the paywall.
     */
    proPriceLabel: string;
    /**
     * Renews or Expires while a paid period has an end date.
     */
    periodLabel: OwnedGroupQuota.periodLabel | null;
    /**
     * Null on Enterprise, which has no group cap.
     */
    groupCapacity: number | null;
    canCreateGroup: boolean;
    /**
     * Why creating a group is blocked. Null when it is allowed.
     */
    createLimitMessage: string | null;
    canChooseGroupSize: boolean;
    showUpgrade: boolean;
    showManage: boolean;
    subscriptionExpiresAt?: string | null;
    /**
     * Start of the current provider period. Grace after it ends is half of this span.
     */
    subscriptionStartedAt?: string | null;
    /**
     * False when Pro is cancelled and access continues until subscriptionExpiresAt.
     */
    subscriptionWillRenew?: boolean;
    /**
     * Set once the paid period has ended and the grace clock is running.
     */
    downgradeAt?: string | null;
    /**
     * True while a plan is ending or the grace period has started.
     */
    downgradePending: boolean;
    /**
     * True after the paid period has ended and free-plan limits are in the grace window.
     */
    graceStarted: boolean;
    /**
     * True when extra owned groups will be deleted and the owner can reorder which two stay.
     */
    choosingKeepers: boolean;
    /**
     * Date extra groups are deleted. Null when a downgrade is not pending.
     */
    plannedDowngradeAt: string | null;
    /**
     * Split My Groups at this index while the owner is choosing which groups stay.
     */
    ownershipKeepCount: number | null;
    /**
     * Developer notice when a subscription is at risk, such as a failed payment.
     */
    subscriptionWarning?: string | null;
};
export namespace OwnedGroupQuota {
    export enum subscriptionTier {
        FREE = 'free',
        PRO = 'pro',
        ENTERPRISE = 'enterprise',
    }
    /**
     * Renews or Expires while a paid period has an end date.
     */
    export enum periodLabel {
        RENEWS = 'Renews',
        EXPIRES = 'Expires',
    }
}

