/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PurchaseHistoryKind } from './PurchaseHistoryKind';
export type PurchaseHistoryEntry = {
    id: string;
    kind: PurchaseHistoryKind;
    productId?: string | null;
    title: string;
    detail?: string | null;
    groupId?: string | null;
    groupName?: string | null;
    createdAt: string;
};

