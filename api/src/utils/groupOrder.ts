/** Parse stored user group order (JSON string array of group ids). */
export function parseGroupOrderJson(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

export function serializeGroupOrderJson(groupIds: string[]): string {
  return JSON.stringify(groupIds);
}

/** First `keepCount` groups in My Groups order are kept. The rest are removed. */
export function partitionByOrder<T extends { id: string; name: string }>(
  groups: T[],
  orderIds: string[],
  keepCount: number
): { keep: T[]; remove: T[] } {
  const sorted = sortByGroupOrder(groups, orderIds);
  const count = Math.max(0, keepCount);
  return { keep: sorted.slice(0, count), remove: sorted.slice(count) };
}

/** Sort groups by stored order; unknown ids follow in name order after known ids. */
export function sortByGroupOrder<T extends { id: string; name: string }>(
  groups: T[],
  orderIds: string[]
): T[] {
  const orderMap = new Map(orderIds.map((id, index) => [id, index]));
  return [...groups].sort((a, b) => {
    const ai = orderMap.get(a.id);
    const bi = orderMap.get(b.id);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}
