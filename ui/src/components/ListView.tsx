import { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { EventRow } from './EventRow';
import { useUsers } from '../hooks/api';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import type { EventDetailed, GroupScoped } from '@moija/client';

interface ListViewProps {
  events: EventDetailed[];
  groups?: GroupScoped[];
  groupColors?: Record<string, string>;
  onSelect: (ev: EventDetailed) => void;
  onSelectGroup?: (groupId: string) => void;
  showGroup?: boolean;
}

type Row =
  | { key: string; type: 'year'; year: number }
  | { key: string; type: 'nowDivider' }
  | { key: string; type: 'upcomingDivider' }
  | { key: string; type: 'event'; event: EventDetailed; isPast: boolean };

export function ListView({
  events,
  groups = [],
  groupColors = {},
  onSelect,
  onSelectGroup,
  showGroup = true,
}: ListViewProps) {
  const { data: allUsers = [] } = useUsers();
  const { userId: meId } = useCurrentUserContext();
  
  const groupsMap = useMemo(() => {
    const map: Record<string, GroupScoped> = {};
    groups.forEach(g => map[g.id] = g);
    return map;
  }, [groups]);

  const rows: Row[] = useMemo(() => {
    const past: EventDetailed[] = [];
    const ongoing: EventDetailed[] = [];
    const upcoming: EventDetailed[] = [];
    const now = new Date();
    const nowTime = now.getTime();

    for (const ev of events) {
      const evStart = new Date(ev.start);
      const evEnd = new Date(ev.end);
      
      if (evEnd.getTime() <= nowTime) {
        past.push(ev);
      } else if (evStart.getTime() <= nowTime && evEnd.getTime() > nowTime) {
        ongoing.push(ev);
      } else {
        upcoming.push(ev);
      }
    }

    // Sort each bucket by start time
    past.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    ongoing.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    upcoming.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    // Past section by year
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
          r.push({
            key: `past-${ev.id}-${new Date(ev.start).getTime()}`,
            type: 'event',
            event: ev,
            isPast: true,
          });
        }
      }
    }

    // Now divider (only if there are ongoing events)
    if (ongoing.length > 0) {
      r.push({ key: 'now-divider', type: 'nowDivider' });
      for (const ev of ongoing) {
        r.push({
          key: `ongoing-${ev.id}-${new Date(ev.start).getTime()}`,
          type: 'event',
          event: ev,
          isPast: false,
        });
      }
    }

    // Upcoming divider
    if (upcoming.length > 0) {
      r.push({ key: 'upcoming-divider', type: 'upcomingDivider' });
      
      // Group upcoming by year
      const upcomingByYear = upcoming.reduce((acc, ev) => {
        const evStart = new Date(ev.start);
        const y = evStart.getFullYear();
        if (!acc.has(y)) acc.set(y, [] as EventDetailed[]);
        acc.get(y)!.push(ev);
        return acc;
      }, new Map<number, EventDetailed[]>());
      
      const currentYear = now.getFullYear();
      const upcomingYears = Array.from(upcomingByYear.keys()).sort((a, b) => a - b);
      
      for (const year of upcomingYears) {
        if (year > currentYear) {
          r.push({ key: `upcoming-year-${year}`, type: 'year', year });
        }
        for (const ev of upcomingByYear.get(year)!) {
          r.push({
            key: `upcoming-${ev.id}-${new Date(ev.start).getTime()}`,
            type: 'event',
            event: ev,
            isPast: false,
          });
        }
      }
    }

    return r;
  }, [events]);

  const renderItem = ({ item }: { item: Row }) => {
    if (item.type === 'nowDivider') {
      return (
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <View style={styles.nowBadge}>
            <Text style={styles.nowText}>Now</Text>
          </View>
          <View style={styles.dividerLine} />
        </View>
      );
    }
    if (item.type === 'upcomingDivider') {
      return (
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <View style={styles.upcomingBadge}>
            <Text style={styles.upcomingText}>Upcoming</Text>
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
          meId={meId ?? undefined}
          users={allUsers}
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
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  dividerLine: { 
    flex: 1, 
    height: 1, 
    backgroundColor: Colors.border,
  },
  yearDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  yearBadge: {},
  yearText: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  nowBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  nowText: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textSub,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  upcomingBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  upcomingText: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textSub,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
