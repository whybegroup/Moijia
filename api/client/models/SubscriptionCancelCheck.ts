/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SubscriptionCancelGroup } from './SubscriptionCancelGroup';
/**
 * Whether owned groups already fit the free plan: 2 groups of at most 1 GB each.
 */
export type SubscriptionCancelCheck = {
    allowed: boolean;
    ownedCount: number;
    overStorage: Array<SubscriptionCancelGroup>;
};

