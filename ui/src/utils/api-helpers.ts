import type { EventDetailed } from '@moija/client';

export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function getNoResponseIds(event: EventDetailed, group: { memberIds?: string[] }): string[] {
  const rsvpUserIds = new Set((event.rsvps || []).map(r => r.userId));
  return (group.memberIds ?? []).filter(id => !rsvpUserIds.has(id));
}

export function parseDate(dateString: string | undefined): Date | undefined {
  return dateString ? new Date(dateString) : undefined;
}

export function toISOString(date: Date | string | undefined): string | undefined {
  if (!date) return undefined;
  return typeof date === 'string' ? date : date.toISOString();
}
