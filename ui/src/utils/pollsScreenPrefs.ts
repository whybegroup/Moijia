import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@moijia/pollsScreenPrefs';

export type PollsScreenPersistedV1 = {
  v: 1;
  selectedGroupIds: string[];
  showAdvancedFilters: boolean;
  startDateText: string;
  endDateText: string;
  startMode: 'specific' | 'now' | 'allTime';
  endMode: 'specific' | 'now' | 'allTime';
};

function isDateMode(x: unknown): x is 'specific' | 'now' | 'allTime' {
  return x === 'specific' || x === 'now' || x === 'allTime';
}

export async function loadPollsScreenPrefs(): Promise<Partial<PollsScreenPersistedV1> | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (p.v !== 1 || typeof p !== 'object' || p === null) return null;
    const out: Partial<PollsScreenPersistedV1> = {};
    if (Array.isArray(p.selectedGroupIds) && p.selectedGroupIds.every((x) => typeof x === 'string'))
      out.selectedGroupIds = p.selectedGroupIds;
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

export async function savePollsScreenPrefs(prefs: PollsScreenPersistedV1): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

