import { EventUpdate } from '@moija/client';

/** OpenAPI string enum — use these keys in UI state and API payloads. */
export type SeriesUpdateScope = EventUpdate.seriesUpdateScope;

/** Labels for applying edits (form save or calendar move) to a recurring series. */
export const SERIES_SCOPE_OPTIONS: { key: SeriesUpdateScope; title: string; sub: string }[] = [
  {
    key: EventUpdate.seriesUpdateScope.THIS_OCCURRENCE,
    title: 'Only this event',
    sub: 'Update this date only. It becomes a one-off event (removed from the series).',
  },
  {
    key: EventUpdate.seriesUpdateScope.THIS_AND_FOLLOWING,
    title: 'This and following events',
    sub: 'Apply to this date and later ones in the series. They move to a new series id; earlier dates stay on the original series.',
  },
  {
    key: EventUpdate.seriesUpdateScope.ALL_OCCURRENCES,
    title: 'All events in series',
    sub: 'Apply to every occurrence that shares this series (same series id).',
  },
];
