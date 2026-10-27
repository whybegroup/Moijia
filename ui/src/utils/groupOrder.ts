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

/** Move an owned group into or out of the top two, which are the ones a downgrade keeps. */
export function relocateOwnedGroup<T extends { id: string }>(
  owned: T[],
  groupId: string,
  toKept: boolean,
  limit = 2
): T[] {
  const kept = owned.slice(0, limit);
  const removed = owned.slice(limit);
  if (toKept) {
    const index = removed.findIndex((group) => group.id === groupId);
    if (index < 0) return owned;
    const [group] = removed.splice(index, 1);
    const nextKept = [group, ...kept];
    return [...nextKept.slice(0, limit), ...nextKept.slice(limit), ...removed];
  }
  const index = kept.findIndex((group) => group.id === groupId);
  if (index < 0 || removed.length === 0) return owned;
  const [group] = kept.splice(index, 1);
  const [promoted, ...rest] = removed;
  return [...kept, promoted, group, ...rest];
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
