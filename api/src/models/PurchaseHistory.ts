export type PurchaseHistoryKind = 'subscription' | 'cancel';

export interface PurchaseHistoryEntry {
  id: string;
  kind: PurchaseHistoryKind;
  productId?: string | null;
  title: string;
  detail?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  createdAt: Date;
}
