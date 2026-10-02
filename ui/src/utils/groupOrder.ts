import type { GroupScoped } from '@moijia/client';

export function isListMembershipGroup(g: GroupScoped): boolean {
  return (
    g.membershipStatus === 'member' ||
    g.membershipStatus === 'admin' ||
    g.membershipStatus === 'pending'
  );
}

export function filterListGroups(allGroups: GroupScoped[]): GroupScoped[] {
  return allGroups.filter((g) => !g.deletedAt && isListMembershipGroup(g));
}

/** Reorder groups in a full list using a new order for active (non-deleted) ids. */
export function reorderGroupsInCache(
  allGroups: GroupScoped[],
  activeOrderIds: string[]
): GroupScoped[] {
  const active = allGroups.filter((g) => !g.deletedAt && isListMembershipGroup(g));
  const deleted = allGroups.filter((g) => g.deletedAt);
  const other = allGroups.filter((g) => !g.deletedAt && !isListMembershipGroup(g));
  const byId = new Map(active.map((g) => [g.id, g]));
  const orderedActive: GroupScoped[] = [];
  for (const id of activeOrderIds) {
    const g = byId.get(id);
    if (g) {
      orderedActive.push(g);
      byId.delete(id);
    }
  }
  for (const g of byId.values()) {
    orderedActive.push(g);
  }
  return [...orderedActive, ...other, ...deleted];
}
