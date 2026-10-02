import { useMemo } from 'react';
import { useListGroups, listGroupsToSwitcherOptions } from './useListGroups';

/** Groups for breadcrumb switcher menus, in the user's preferred order. */
export function useOrderedSwitcherGroups(userId: string) {
  const query = useListGroups(userId, false);
  const orderedSwitcherGroups = useMemo(
    () => listGroupsToSwitcherOptions(query.listGroups),
    [query.listGroups]
  );
  return { ...query, orderedSwitcherGroups };
}
