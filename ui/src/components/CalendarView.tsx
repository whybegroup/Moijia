import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName } from '../utils/helpers';
import { isSameDay, isToday, fmtTime } from '../utils/helpers';
import type { EventDetailed, Group } from '@boltup/client';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarViewProps {
  events: EventDetailed[];
  groups: Group[];
  groupColors?: Record<string, string>;
  onSelectEvent: (ev: EventDetailed) => void;
}

function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startWeekday = first.getDay();
  const daysInMo = last.getDate();
  const rows: (Date | null)[][] = [];
  let row: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) row.push(null);
  for (let d = 1; d <= daysInMo; d++) {
    row.push(new Date(year, month, d));
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) {
    while (row.length < 7) row.push(null);
    rows.push(row);
  }
  return rows;
}

export function CalendarView({ events, groups, groupColors = {}, onSelectEvent }: CalendarViewProps) {
  const [focusDate, setFocusDate] = useState(() => new Date());
  const year = focusDate.getFullYear();
  const month = focusDate.getMonth();

  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);
  
  const groupsMap = useMemo(() => {
    const map: Record<string, Group> = {};
    groups.forEach(g => map[g.id] = g);
    return map;
  }, [groups]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventDetailed[]>();
    for (const ev of events) {
      const d = new Date(ev.start);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }, [events]);

  const prevMonth = () => setFocusDate(d => new Date(d.getFullYear(), d.getMonth() - 1));
  const nextMonth = () => setFocusDate(d => new Date(d.getFullYear(), d.getMonth() + 1));
  const goToToday = () => setFocusDate(new Date());

  const selectedKey = `${focusDate.getFullYear()}-${focusDate.getMonth()}-${focusDate.getDate()}`;
  const selectedEvents = eventsByDate.get(selectedKey) ?? [];

  const monthLabel = focusDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* Month nav */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
          <Text style={styles.navBtnText}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goToToday} style={styles.monthLabel}>
          <Text style={styles.monthLabelText}>{monthLabel}</Text>
          <Text style={styles.todayLink}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
          <Text style={styles.navBtnText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Weekday headers */}
      <View style={styles.weekdayRow}>
        {WEEKDAYS.map(d => (
          <Text key={d} style={styles.weekdayCell}>{d}</Text>
        ))}
      </View>

      {/* Calendar grid */}
      <View style={styles.grid}>
        {grid.map((row, ri) => (
          <View key={ri} style={styles.gridRow}>
            {row.map((cell, ci) => {
              if (!cell) return <View key={ci} style={styles.cell} />;
              const key = `${cell.getFullYear()}-${cell.getMonth()}-${cell.getDate()}`;
              const dayEvents = eventsByDate.get(key) ?? [];
              const selected = isSameDay(cell, focusDate);
              const today = isToday(cell);
              return (
                <TouchableOpacity
                  key={ci}
                  style={[
                    styles.cell,
                    selected && styles.cellSelected,
                    today && !selected && styles.cellToday,
                  ]}
                  onPress={() => setFocusDate(cell)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.cellText,
                    selected && styles.cellTextSelected,
                    today && !selected && styles.cellTextToday,
                  ]}>
                    {cell.getDate()}
                  </Text>
                  {dayEvents.length > 0 && (
                    <View style={styles.dotWrap}>
                      {dayEvents.slice(0, 2).map(ev => {
                        const group = groupsMap[ev.groupId];
                        const userColorHex = groupColors[ev.groupId] || (group ? getDefaultGroupThemeFromName(group.name) : '#EC4899');
                        const p = getGroupColor(userColorHex);
                        return (
                          <View
                            key={ev.id}
                            style={[
                              styles.dot,
                              selected && styles.dotSelected,
                              { backgroundColor: p.dot },
                            ]}
                          />
                        );
                      })}
                      {dayEvents.length > 2 && (
                        <Text style={[styles.dotMore, selected && styles.dotMoreSelected]}>
                          +{dayEvents.length - 2}
                        </Text>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* Events for selected day */}
      <View style={styles.eventsSection}>
        <Text style={styles.eventsSectionTitle}>
          {focusDate.toLocaleDateString('default', { weekday: 'long', month: 'short', day: 'numeric' })}
        </Text>
        {selectedEvents.length === 0 ? (
          <Text style={styles.noEvents}>No events this day</Text>
        ) : (
          <View style={styles.eventList}>
            {selectedEvents
              .sort((a, b) => {
                const sa = new Date(a.start);
                const sb = new Date(b.start);
                return sa.getTime() - sb.getTime();
              })
              .map(ev => {
                const group = groupsMap[ev.groupId];
                const userColorHex = groupColors[ev.groupId] || (group ? getDefaultGroupThemeFromName(group.name) : '#EC4899');
                const p = getGroupColor(userColorHex);
                const startDate = new Date(ev.start);
                return (
                  <TouchableOpacity
                    key={ev.id}
                    style={[styles.eventCard, { borderLeftColor: p.dot }]}
                    onPress={() => onSelectEvent(ev)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.eventTime}>{fmtTime(startDate)}</Text>
                    <Text style={styles.eventTitle} numberOfLines={1}>{ev.title}</Text>
                    {ev.subtitle && (
                      <Text style={styles.eventSubtitle} numberOfLines={1}>{ev.subtitle}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
          </View>
        )}
      </View>
      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  navBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: { fontSize: 24, color: Colors.text, fontFamily: Fonts.medium },
  monthLabel: { alignItems: 'center' },
  monthLabelText: { fontSize: 17, fontFamily: Fonts.bold, color: Colors.text },
  todayLink: { fontSize: 12, color: Colors.textSub, marginTop: 2 },
  weekdayRow: {
    flexDirection: 'row',
    paddingVertical: 8,
  },
  weekdayCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
  },
  grid: { paddingHorizontal: 4 },
  gridRow: { flexDirection: 'row' },
  cell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    margin: 2,
  },
  cellSelected: {
    backgroundColor: Colors.accent,
  },
  cellToday: {
    borderWidth: 1,
    borderColor: Colors.todayRed,
  },
  cellText: { fontSize: 15, fontFamily: Fonts.medium, color: Colors.text },
  cellTextSelected: { color: Colors.accentFg },
  cellTextToday: { color: Colors.todayRed },
  dotWrap: {
    position: 'absolute',
    bottom: 4,
    height: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  dotSelected: {},
  dotMore: {
    fontSize: 9,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    marginLeft: 1,
    lineHeight: 10,
  },
  dotMoreSelected: {
    color: Colors.accentFg,
  },
  eventsSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  eventsSectionTitle: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.text,
    marginBottom: 12,
  },
  noEvents: {
    fontSize: 14,
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
  },
  eventList: { gap: 10 },
  eventCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
  },
  eventTime: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  eventTitle: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  eventSubtitle: {
    fontSize: 13,
    color: Colors.textSub,
    marginTop: 2,
  },
});
