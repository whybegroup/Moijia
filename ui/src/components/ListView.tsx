import { Fragment, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, type StyleProp, type ViewStyle } from 'react-native';
import { Colors, Fonts } from '../constants/theme';
import { dayShort, fmtDateShort } from '../utils/helpers';
import { EventRow } from './EventRow';
import { useUsers } from '../hooks/api';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import type { EventDetailed, GroupScoped } from '@moijia/client';

interface ListViewProps {
  events: EventDetailed[];
  groups?: GroupScoped[];
  groupColors?: Record<string, string>;
  onSelect: (ev: EventDetailed) => void;
  onSelectGroup?: (groupId: string) => void;
  showGroup?: boolean;
  /** Use `embedded` inside an outer ScrollView (renders rows without FlatList). */
  variant?: 'scroll' | 'embedded';
  /** Applied to the scroll variant’s FlatList (e.g. `{ flex: 1 }` in a modal). */
  listContainerStyle?: StyleProp<ViewStyle>;
}

type Row =
  | { key: string; type: 'dateDivider'; date: Date }
  | { key: string; type: 'event'; event: EventDetailed };

function startDateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateFromLocalKey(key: string): Date {
  const [ys, ms, ds] = key.split('-').map(Number);
  return new Date(ys, ms - 1, ds);
}

function insertTodayInOrder(keys: string[], todayKey: string): string[] {
  if (keys.includes(todayKey)) return keys;
  const i = keys.findIndex(k => k > todayKey);
  if (i === -1) return [...keys, todayKey];
  return [...keys.slice(0, i), todayKey, ...keys.slice(i)];
}

function isLocalToday(d: Date): boolean {
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

export function ListView({
  events,
  groups = [],
  groupColors = {},
  onSelect,
  onSelectGroup,
  showGroup = true,
  variant = 'scroll',
  listContainerStyle,
}: ListViewProps) {
  const { data: allUsers = [] } = useUsers();
  const { userId: meId } = useCurrentUserContext();

  const groupsMap = useMemo(() => {
    const map: Record<string, GroupScoped> = {};
    groups.forEach(g => map[g.id] = g);
    return map;
  }, [groups]);

  const rows: Row[] = useMemo(() => {
    if (events.length === 0) return [];

    const sorted = [...events].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );

    const buckets = new Map<string, EventDetailed[]>();
    for (const ev of sorted) {
      const key = startDateKeyLocal(new Date(ev.start));
      const list = buckets.get(key);
      if (list) list.push(ev);
      else buckets.set(key, [ev]);
    }

    const now = new Date();
    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayKey = startDateKeyLocal(todayLocal);

    const dayKeys = insertTodayInOrder([...buckets.keys()].sort(), todayKey);

    const r: Row[] = [];
    for (const dayKey of dayKeys) {
      const dividerDate = dateFromLocalKey(dayKey);
      r.push({ key: `div-${dayKey}`, type: 'dateDivider', date: dividerDate });
      for (const ev of buckets.get(dayKey) ?? []) {
        r.push({
          key: `ev-${ev.id}-${new Date(ev.start).getTime()}`,
          type: 'event',
          event: ev,
        });
      }
    }
    return r;
  }, [events]);

  const renderItem = ({ item }: { item: Row }) => {
    if (item.type === 'dateDivider') {
      const d = item.date;
      const label = `${dayShort(d)} · ${fmtDateShort(d)}, ${d.getFullYear()}`;
      const today = isLocalToday(d);
      return (
        <View style={styles.dateDividerRow}>
          <View style={[styles.dividerLine, today && styles.dividerLineToday]} />
          <Text style={[styles.dateDividerLabel, today && styles.dateDividerLabelToday]}>{label}</Text>
          <View style={[styles.dividerLine, today && styles.dividerLineToday]} />
        </View>
      );
    }
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

  if (variant === 'embedded') {
    return (
      <>
        {rows.map((item) => (
          <Fragment key={item.key}>{renderItem({ item })}</Fragment>
        ))}
      </>
    );
  }

  return (
    <FlatList
      style={listContainerStyle}
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
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dateDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  dateDividerLabel: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
    flexShrink: 0,
  },
  dividerLineToday: {
    backgroundColor: Colors.todayRed,
  },
  dateDividerLabelToday: {
    color: Colors.todayRed,
    fontFamily: Fonts.semiBold,
  },
});
