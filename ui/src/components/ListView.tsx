import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { EventRow } from './EventRow';
import type { EventDetailed, Group } from '@boltup/client';

interface ListViewProps {
  events: EventDetailed[];
  groups?: Group[];
  groupColors?: Record<string, string>;
  onSelect: (ev: EventDetailed) => void;
  onSelectGroup?: (groupId: string) => void;
  showGroup?: boolean;
}

type Row =
  | { key: string; type: 'year'; year: number }
  | { key: string; type: 'nowDivider' }
  | { key: string; type: 'event'; event: EventDetailed; isPast: boolean };

export function ListView({
  events,
  groups = [],
  groupColors = {},
  onSelect,
  onSelectGroup,
  showGroup = true,
}: ListViewProps) {
  const groupsMap = useMemo(() => {
    const map: Record<string, Group> = {};
    groups.forEach(g => map[g.id] = g);
    return map;
  }, [groups]);

  const rows: Row[] = useMemo(() => {
    const past: EventDetailed[] = [];
    const future: EventDetailed[] = [];
    const futureByYear = new Map<number, EventDetailed[]>();
    const now = new Date();

    for (const ev of events) {
      const evStart = new Date(ev.start);
      const t = evStart.getTime();
      if (t < now.getTime()) {
        past.push(ev);
      } else {
        future.push(ev);
        const y = evStart.getFullYear();
        if (!futureByYear.has(y)) futureByYear.set(y, []);
        futureByYear.get(y)!.push(ev);
      }
    }

    // Sort each bucket by start time
    past.sort((a, b) => {
      const aStart = new Date(a.start);
      const bStart = new Date(b.start);
      return aStart.getTime() - bStart.getTime();
    });
    future.sort((a, b) => {
      const aStart = new Date(a.start);
      const bStart = new Date(b.start);
      return aStart.getTime() - bStart.getTime();
    });
    const futureYears = Array.from(futureByYear.keys()).sort((a, b) => a - b);
    for (const y of futureYears) {
      futureByYear.get(y)!.sort((a, b) => {
        const aStart = new Date(a.start);
        const bStart = new Date(b.start);
        return aStart.getTime() - bStart.getTime();
      });
    }

    // Past section (always included when present)
    const pastByYear = past.reduce((acc, ev) => {
      const evStart = new Date(ev.start);
      const y = evStart.getFullYear();
      if (!acc.has(y)) acc.set(y, [] as EventDetailed[]);
      acc.get(y)!.push(ev);
      return acc;
    }, new Map<number, EventDetailed[]>());

    const r: Row[] = [];

    if (past.length) {
      for (const [year, yearEvents] of Array.from(pastByYear.entries()).sort(
        (a, b) => a[0] - b[0],
      )) {
        r.push({ key: `past-year-${year}`, type: 'year', year });
        for (const ev of yearEvents) {
          r.push({ key: `past-${ev.id}`, type: 'event', event: ev, isPast: true });
        }
      }
    }

    // Now divider
    r.push({ key: 'now-divider', type: 'nowDivider' });

    // Upcoming by year, but only show year labels for years after current year
    const currentYear = now.getFullYear();
    for (const year of futureYears) {
      if (year > currentYear) {
        r.push({ key: `future-year-${year}`, type: 'year', year });
      }
      for (const ev of futureByYear.get(year)!) {
        r.push({ key: `future-${ev.id}`, type: 'event', event: ev, isPast: false });
      }
    }

    return r;
  }, [events]);

  const renderItem = ({ item }: { item: Row }) => {
    if (item.type === 'nowDivider') {
      return (
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <View style={styles.todayBadge}>
            <Text style={styles.todayText}>Now</Text>
          </View>
          <View style={styles.dividerLine} />
        </View>
      );
    }
    if (item.type === 'year') {
      return (
        <View style={styles.yearDivider}>
          <View style={styles.dividerLine} />
          <View style={styles.yearBadge}>
            <Text style={styles.yearText}>{item.year}</Text>
          </View>
          <View style={styles.dividerLine} />
        </View>
      );
    }
    // event
    const group = groupsMap[item.event.groupId];
    const userColorHex = groupColors[item.event.groupId];
    return (
      <View style={styles.cardWrapper}>
        <EventRow
          ev={item.event}
          group={group}
          groupColorHex={userColorHex}
          onPress={() => onSelect(item.event)}
          onGroupPress={onSelectGroup}
          isLast={false}
          showGroup={showGroup}
        />
      </View>
    );
  };

  return (
    <FlatList
      data={rows}
      keyExtractor={item => item.key}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      ListFooterComponent={<View style={{ height: 100 }} />}
    />
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: 0.5,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  yearDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  yearBadge: {},
  yearText: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  upcomingBadge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  upcomingText: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  todayBadge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  todayText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Colors.todayRed,
    letterSpacing: 0.4,
  },
});
