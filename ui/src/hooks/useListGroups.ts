import { useMemo } from 'react';
import { useGroups } from './api';
import { filterListGroups } from '../utils/groupOrder';

/** Groups visible on All Groups and in the group breadcrumb switcher (API-sorted by user preference). */
export function useListGroups(userId: string, includeDeleted = false) {
  const query = useGroups(userId, includeDeleted);
  const listGroups = useMemo(
    () => (query.data ? filterListGroups(query.data) : []),
    [query.data]
  );
  return { ...query, listGroups };
}

export function listGroupsToSwitcherOptions(listGroups: { id: string; name: string }[]) {
  return listGroups.map((g) => ({ id: g.id, name: g.name }));
}
