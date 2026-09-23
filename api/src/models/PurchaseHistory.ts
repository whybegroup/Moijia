export type PurchaseHistoryKind = 'size_addon' | 'extra_group' | 'cancel';

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
