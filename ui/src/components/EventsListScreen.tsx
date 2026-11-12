import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, type Href } from 'expo-router';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import { Colors, Fonts } from '../constants/theme';
import {
  getGroupColor,
  getDefaultGroupThemeFromName,
} from '../utils/helpers';
import { ListView } from './ListView';
import { CalendarView } from './CalendarView';
import { Pill } from './ui';
import { EventsListFiltersPanel } from './EventsListFiltersPanel';
import {
  useEvents,
  useGroups,
  useNotifications,
  useAllGroupMemberColors,
} from '../hooks/api';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useEventScopeNav } from './eventsScope/EventScopeNavContext';
import {
  loadEventsScreenPrefs,
  saveEventsScreenPrefs,
  parseCalendarFocusIso,
  type EventsScreenPersistedV1,
  type CalendarScopeMode,
} from '../utils/eventsScreenPrefs';
import { type EventDetailed } from '@moijia/client';
import { withReturnTo } from '../utils/navigationReturn';

export function EventsListScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { viewMode, setViewMode, setFromEventId } = useEventScopeNav();
  const { userId: currentUserId } = useCurrentUserContext();

  // Clear fromEventId when returning to all events
  useEffect(() => {
    setFromEventId(undefined);
  }, [setFromEventId]);

  const { data: events = [], refetch: refetchEvents } = useEvents({
    userId: currentUserId ?? '',
    groupId: undefined,
  });
  const { data: allGroups = [], refetch: refetchGroups } = useGroups(currentUserId ?? '');
  const { refetch: refetchNotifications } = useNotifications(currentUserId || '');
  const { data: groupColors = {}, refetch: refetchGroupColors } = useAllGroupMemberColors(
    currentUserId || ''
  );
  const { refreshControl } = usePullToRefresh([
    refetchEvents,
    refetchGroups,
    refetchNotifications,
    refetchGroupColors,
  ]);
  const groups = allGroups.filter(g => g.membershipStatus === 'member' || g.membershipStatus === 'admin');
  
  // Filter state
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [filterRsvp,  setFilterRsvp]  = useState<string[]>([]);
  const [filterNeeds, setFilterNeeds] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  // Date range filters (ISO date strings)
  const todayIso = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);
  const defaultStartSpecificText = useMemo(() => `${todayIso} 00:00`, [todayIso]);
  const defaultEndSpecificText = useMemo(() => {
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    return `${y}-${m}-${d} 00:00`;
  }, []);
  const [startDateText, setStartDateText] = useState<string>(defaultStartSpecificText);
  const [endDateText,   setEndDateText]   = useState<string>(defaultEndSpecificText);
  const [startMode,     setStartMode]     = useState<'specific' | 'now' | 'allTime'>('now');
  const [endMode,       setEndMode]       = useState<'specific' | 'now' | 'allTime'>('allTime');
  const [calendarScopeMode, setCalendarScopeMode] = useState<CalendarScopeMode>('week');
  const [calendarFocusDate, setCalendarFocusDate] = useState(() => new Date());
  const [calendarBodyScrollY, setCalendarBodyScrollY] = useState<
    Partial<Record<CalendarScopeMode, number>>
  >({});
  const [calendarYearMonthStrip, setCalendarYearMonthStrip] = useState<
    { year: number; x: number } | undefined
  >(undefined);
  const [prefsReady, setPrefsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const partial = await loadEventsScreenPrefs();
      if (cancelled) return;
      if (partial) {
        if (partial.viewMode) setViewMode(partial.viewMode);
        if (partial.calendarScopeMode) setCalendarScopeMode(partial.calendarScopeMode);
        if (partial.calendarFocusIso !== undefined) {
          setCalendarFocusDate(parseCalendarFocusIso(partial.calendarFocusIso));
        }
        if (partial.calendarBodyScrollY) setCalendarBodyScrollY(partial.calendarBodyScrollY);
        if (partial.calendarYearMonthStrip) setCalendarYearMonthStrip(partial.calendarYearMonthStrip);
        if (partial.selectedGroupIds !== undefined) setSelectedGroupIds(partial.selectedGroupIds);
        if (partial.filterRsvp !== undefined) setFilterRsvp(partial.filterRsvp);
        if (partial.filterNeeds !== undefined) setFilterNeeds(partial.filterNeeds);
        if (partial.showAdvancedFilters !== undefined) setShowAdvancedFilters(partial.showAdvancedFilters);
        if (partial.startDateText) setStartDateText(partial.startDateText);
        if (partial.endDateText) setEndDateText(partial.endDateText);
        if (partial.startMode) setStartMode(partial.startMode);
        if (partial.endMode) setEndMode(partial.endMode);
      }
      if (!cancelled) setPrefsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [setViewMode]);

  useEffect(() => {
    if (!prefsReady) return;
    const payload: EventsScreenPersistedV1 = {
      v: 1,
      viewMode,
      calendarScopeMode,
      calendarFocusIso: calendarFocusDate.toISOString(),
      calendarBodyScrollY: Object.keys(calendarBodyScrollY).length ? calendarBodyScrollY : undefined,
      calendarYearMonthStrip,
      selectedGroupIds,
      filterRsvp,
      filterNeeds,
      showAdvancedFilters,
      startDateText,
      endDateText,
      startMode,
      endMode,
    };
    void saveEventsScreenPrefs(payload);
  }, [
    prefsReady,
    viewMode,
    calendarScopeMode,
    calendarFocusDate,
    calendarBodyScrollY,
    calendarYearMonthStrip,
    selectedGroupIds,
    filterRsvp,
    filterNeeds,
    showAdvancedFilters,
    startDateText,
    endDateText,
    startMode,
    endMode,
  ]);

  const onCalendarBodyScrollYCommit = useCallback((mode: CalendarScopeMode, y: number) => {
    setCalendarBodyScrollY((prev) => ({ ...prev, [mode]: y }));
  }, []);

  const onCalendarYearMonthStripCommit = useCallback((payload: { year: number; x: number }) => {
    setCalendarYearMonthStrip(payload);
  }, []);

  const filtered = useMemo(() => {
    const parseBound = (txt: string): Date | null => {
      const t = txt.trim();
      if (!t) return null;
      const [datePart, timePart] = t.split(' ');
      const parts = datePart.split('-');
      if (parts.length !== 3) return null;
      const [ys, ms, ds] = parts;
      const y = Number(ys);
      const m = Number(ms);
      const d = Number(ds);
      if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
      let hh = 0;
      let mm = 0;
      if (timePart) {
        const [hs, mins] = timePart.split(':');
        hh = Number(hs) || 0;
        mm = Number(mins) || 0;
      }
      const dt = new Date(y, m - 1, d, hh, mm);
      if (Number.isNaN(dt.getTime())) return null;
      return dt;
    };

    const startBound =
      startMode === 'now'
        ? new Date()
        : startMode === 'specific'
          ? (parseBound(startDateText) ?? null)
          : null; // allTime → no lower bound

    const endBound =
      endMode === 'now'
        ? new Date()
        : endMode === 'specific'
          ? parseBound(endDateText)
          : null; // allTime → no upper bound

    /** Date picker default is 00:00 — treat as “through that calendar day”, not “before midnight”. */
    const inclusiveEndCutoff = (b: Date): Date => {
      if (
        b.getHours() === 0 &&
        b.getMinutes() === 0 &&
        b.getSeconds() === 0 &&
        b.getMilliseconds() === 0
      ) {
        return new Date(b.getFullYear(), b.getMonth(), b.getDate(), 23, 59, 59, 999);
      }
      return b;
    };

    const endFilterCutoff = endBound != null ? inclusiveEndCutoff(endBound) : null;

    return events.filter(ev => {
      if (!groups.some(g => g.id === ev.groupId)) return false;
      if (selectedGroupIds.length > 0 && !selectedGroupIds.includes(ev.groupId)) return false;

      const evStart = typeof ev.start === 'string' ? new Date(ev.start) : ev.start;
      const evEnd = typeof ev.end === 'string' ? new Date(ev.end) : ev.end;
      
      // Use end time for start bound (so ongoing events show up)
      if (startBound && evEnd.getTime() <= startBound.getTime()) return false;
      // Inclusive end: hide only when start is after the cutoff instant
      if (endFilterCutoff && evStart.getTime() > endFilterCutoff.getTime()) return false;

      const rsvps = ev.rsvps || [];
      const myGoing    = !!rsvps.find(r => r.userId === currentUserId && r.status === 'going');
      const myNotGoing = !!rsvps.find(r => r.userId === currentUserId && r.status === 'notGoing');
      const myAnyRsvp  = !!rsvps.find(r => r.userId === currentUserId);

      if (filterRsvp.length) {
        const myMaybe = !!rsvps.find(r => r.userId === currentUserId && r.status === 'maybe');
        const matchesRsvp =
          (filterRsvp.includes('going')    && myGoing) ||
          (filterRsvp.includes('maybe')    && myMaybe) ||
          (filterRsvp.includes('notGoing') && myNotGoing) ||
          (filterRsvp.includes('none')     && !myAnyRsvp);
        if (!matchesRsvp) return false;
      }

      if (filterNeeds && !(ev.minAttendees && rsvps.filter(r => r.status === 'going').length < ev.minAttendees)) return false;
      return true;
    });
  }, [
    groups,
    selectedGroupIds,
    filterRsvp,
    filterNeeds,
    startDateText,
    endDateText,
    startMode,
    endMode,
    events,
    currentUserId,
  ]);

  const hasFilters = !!(
    selectedGroupIds.length ||
    filterRsvp.length ||
    filterNeeds ||
    startMode !== 'now' ||
    endMode !== 'allTime'
  );

  return (
    <View style={styles.safe}>
      <EventsListFiltersPanel
        filterRsvp={filterRsvp}
        setFilterRsvp={setFilterRsvp}
        filterNeeds={filterNeeds}
        setFilterNeeds={setFilterNeeds}
        showAdvancedFilters={showAdvancedFilters}
        setShowAdvancedFilters={setShowAdvancedFilters}
        startDateText={startDateText}
        setStartDateText={setStartDateText}
        endDateText={endDateText}
        setEndDateText={setEndDateText}
        startMode={startMode}
        setStartMode={setStartMode}
        endMode={endMode}
        setEndMode={setEndMode}
        defaultStartSpecificText={defaultStartSpecificText}
        defaultEndSpecificText={defaultEndSpecificText}
        filtersActive={hasFilters}
        onResetExtra={() => setSelectedGroupIds([])}
        groupPillsRow={
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pillsRow}
            contentContainerStyle={{ gap: 6, paddingRight: 20 }}
          >
            <Pill
              label="All"
              selected={selectedGroupIds.length === 0}
              onPress={() => setSelectedGroupIds([])}
            />
            {groups.map((g) => {
              const userColorHex = groupColors[g.id] || getDefaultGroupThemeFromName(g.name);
              const p = getGroupColor(userColorHex);
              const isSelected = selectedGroupIds.includes(g.id);
              return (
                <Pill
                  key={g.id}
                  label={g.name}
                  selected={isSelected}
                  activeColor={p.dot}
                  activeBg={p.label}
                  activeText={p.text}
                  inactiveBorderColor={p.dot}
                  onPress={() => {
                    const next = isSelected
                      ? selectedGroupIds.filter((id) => id !== g.id)
                      : [...selectedGroupIds, g.id];
                    setSelectedGroupIds(next);
                  }}
                  onLongPress={() => setSelectedGroupIds([g.id])}
                />
              );
            })}
          </ScrollView>
        }
      >
        {({ toggle, expanded }) => (
      <View
        style={styles.eventsContent}
        collapsable={false}
      >
        {viewMode === 'list' ? (
          filtered.length === 0 ? (
            <>
              <View style={styles.listToolbarRow}>
                <View style={styles.toolbarEnd}>{toggle}</View>
              </View>
              {expanded}
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.emptyState}
                refreshControl={refreshControl}
              >
                <Ionicons name="calendar-outline" size={56} color={Colors.textMuted} style={styles.emptyGlyph} />
                <Text style={styles.emptyTitle}>No events</Text>
                <Text style={styles.emptyDesc}>
                  {hasFilters ? 'Try adjusting your filters' : 'Create an event to get started'}
                </Text>
              </ScrollView>
            </>
          ) : (
            <ListView
              events={filtered}
              groups={groups}
              groupColors={groupColors}
              refreshControl={refreshControl}
              toolbarEnd={toggle}
              belowToolbar={expanded}
              onSelect={(ev) =>
                router.push(`/(tabs)/events/${(ev as EventDetailed).id}` as Href)
              }
              onSelectGroup={(groupId) =>
                router.push(withReturnTo(`/(tabs)/groups/${groupId}`, pathname))
              }
            />
          )
        ) : (
          <CalendarView
            events={filtered}
            filterRsvp={filterRsvp}
            groups={groups}
            groupColors={groupColors}
            refreshControl={refreshControl}
            toolbarEnd={toggle}
            belowToolbar={expanded}
            onSelectEvent={(ev) =>
              router.push(`/(tabs)/events/${(ev as EventDetailed).id}` as Href)
            }
            onSelectGroup={(groupId) =>
              router.push(withReturnTo(`/(tabs)/groups/${groupId}`, pathname))
            }
            calendarFocusDate={calendarFocusDate}
            onCalendarFocusDateChange={setCalendarFocusDate}
            calendarScopeMode={calendarScopeMode}
            onCalendarScopeModeChange={setCalendarScopeMode}
            calendarBodyScrollY={calendarBodyScrollY}
            onCalendarBodyScrollYCommit={onCalendarBodyScrollYCommit}
            calendarYearMonthStrip={calendarYearMonthStrip}
            onCalendarYearMonthStripCommit={onCalendarYearMonthStripCommit}
            calendarScrollPrefsReady={prefsReady}
          />
        )}
      </View>
        )}
      </EventsListFiltersPanel>

    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  pillsRow: { flexGrow: 0, width: '100%' },
  eventsContent: { flex: 1, paddingTop: 4, zIndex: 0, minHeight: 0 },
  listToolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 6,
  },
  toolbarEnd: { marginLeft: 'auto' },
  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyGlyph: { marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 8 },
  emptyDesc: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textMuted, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
});
