import AsyncStorage from '@react-native-async-storage/async-storage';

export type CalendarScopeMode = 'week' | 'month' | 'year';

const STORAGE_KEY = '@moija/eventsScreenPrefs';

export type EventsScreenPersistedV1 = {
  v: 1;
  viewMode: 'list' | 'calendar';
  calendarScopeMode: CalendarScopeMode;
  calendarFocusIso: string;
  selectedGroupIds: string[];
  filterRsvp: string[];
  filterNeeds: boolean;
  showAdvancedFilters: boolean;
  startDateText: string;
  endDateText: string;
  startMode: 'specific' | 'now' | 'allTime';
  endMode: 'specific' | 'now' | 'allTime';
};

const RSVP_KEYS = new Set(['going', 'maybe', 'notGoing', 'none']);

function isScopeMode(x: unknown): x is CalendarScopeMode {
  return x === 'week' || x === 'month' || x === 'year';
}

function isDateMode(x: unknown): x is 'specific' | 'now' | 'allTime' {
  return x === 'specific' || x === 'now' || x === 'allTime';
}

export function parseCalendarFocusIso(iso: string | undefined): Date {
  if (!iso || typeof iso !== 'string') return new Date();
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export async function loadEventsScreenPrefs(): Promise<Partial<EventsScreenPersistedV1> | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (p.v !== 1 || typeof p !== 'object' || p === null) return null;
    const out: Partial<EventsScreenPersistedV1> = {};
    if (p.viewMode === 'list' || p.viewMode === 'calendar') out.viewMode = p.viewMode;
    if (isScopeMode(p.calendarScopeMode)) out.calendarScopeMode = p.calendarScopeMode;
    if (typeof p.calendarFocusIso === 'string') out.calendarFocusIso = p.calendarFocusIso;
    if (Array.isArray(p.selectedGroupIds) && p.selectedGroupIds.every((id) => typeof id === 'string'))
      out.selectedGroupIds = p.selectedGroupIds;
    if (Array.isArray(p.filterRsvp) && p.filterRsvp.every((k) => typeof k === 'string' && RSVP_KEYS.has(k)))
      out.filterRsvp = p.filterRsvp as EventsScreenPersistedV1['filterRsvp'];
    if (typeof p.filterNeeds === 'boolean') out.filterNeeds = p.filterNeeds;
    if (typeof p.showAdvancedFilters === 'boolean') out.showAdvancedFilters = p.showAdvancedFilters;
    if (typeof p.startDateText === 'string') out.startDateText = p.startDateText;
    if (typeof p.endDateText === 'string') out.endDateText = p.endDateText;
    if (isDateMode(p.startMode)) out.startMode = p.startMode;
    if (isDateMode(p.endMode)) out.endMode = p.endMode;
    return out;
  } catch {
    return null;
  }
}

export async function saveEventsScreenPrefs(prefs: EventsScreenPersistedV1): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
