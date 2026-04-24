import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import type { Poll } from '@moijia/client';
import { Colors, Fonts, Layout, Radius } from '../../constants/theme';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';
import {
  useAllGroupMemberColors,
  useGroups,
  useNotifications,
  usePolls,
} from '../../hooks/api';
import { dayShort, fmtDateShort, getDefaultGroupThemeFromName, getGroupColor, isToday } from '../../utils/helpers';
import { withReturnTo } from '../../utils/navigationReturn';
import { CreateOrJoinButton } from '../../components/CreateOrJoinButton';
import { Pill } from '../../components/ui';
import { NotificationsPanelModal } from '../../components/NotificationsPanelModal';
import { PollRow } from '../../components/PollRow';
import Svg, { Path } from 'react-native-svg';

let WebDatePicker: any = null;
if (Platform.OS === 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebDatePicker = require('react-datepicker').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('react-datepicker/dist/react-datepicker.css');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./react-datepicker-overrides.css');
}

function deadlineForPoll(poll: Poll): Date | null {
  if ((poll as Poll & { deadline?: string | null }).deadline) {
    const direct = new Date((poll as Poll & { deadline?: string | null }).deadline as string);
    if (Number.isFinite(direct.getTime())) return direct;
  }
  let minTs = Number.POSITIVE_INFINITY;
  for (const option of poll.options) {
    if (option.inputKind !== 'datetime' || !option.dateTimeValue) continue;
    const ts = new Date(option.dateTimeValue).getTime();
    if (Number.isFinite(ts) && ts < minTs) minTs = ts;
  }
  return Number.isFinite(minTs) ? new Date(minTs) : null;
}

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

export default function PollsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { userId: currentUserId } = useCurrentUserContext();
  const { data: polls = [] } = usePolls(currentUserId ?? '');
  const { data: allGroups = [] } = useGroups(currentUserId ?? '');
  const { data: notifs = [], isLoading: notifsLoading } = useNotifications(currentUserId || '');
  const { data: groupColors = {} } = useAllGroupMemberColors(currentUserId ?? '');
  const [showNotifs, setShowNotifs] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [activeDateField, setActiveDateField] = useState<'from' | 'to' | null>(null);

  const groups = useMemo(
    () =>
      allGroups.filter(
        (g) =>
          g.membershipStatus === 'member' ||
          g.membershipStatus === 'admin' ||
          g.membershipStatus === 'pending'
      ),
    [allGroups]
  );
  const groupsById = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.id, g] as const)),
    [groups]
  );
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
  const [endDateText, setEndDateText] = useState<string>(defaultEndSpecificText);
  const [startMode, setStartMode] = useState<'specific' | 'now' | 'allTime'>('now');
  const [endMode, setEndMode] = useState<'specific' | 'now' | 'allTime'>('allTime');

  const parseDateTime = (txt: string): Date | null => {
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

  const filteredPolls = useMemo(() => {
    const startBound =
      startMode === 'now'
        ? new Date()
        : startMode === 'specific'
          ? parseDateTime(startDateText)
          : null;
    const endBound =
      endMode === 'now'
        ? new Date()
        : endMode === 'specific'
          ? parseDateTime(endDateText)
          : null;
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
    const endFilterCutoff = endBound ? inclusiveEndCutoff(endBound) : null;

    return polls.filter((poll) => {
      if (!groups.some((g) => g.id === poll.groupId)) return false;
      if (selectedGroupIds.length > 0 && !selectedGroupIds.includes(poll.groupId)) return false;
      const deadline = deadlineForPoll(poll);
      if (!deadline) return true; // legacy polls without deadline stay visible and sort first.
      if (startBound && deadline.getTime() <= startBound.getTime()) return false;
      if (endFilterCutoff && deadline.getTime() > endFilterCutoff.getTime()) return false;
      return true;
    });
  }, [
    polls,
    groups,
    selectedGroupIds,
    startMode,
    endMode,
    startDateText,
    endDateText,
  ]);
  const sortedPolls = useMemo(() => {
    return [...filteredPolls].sort((a, b) => {
      const ad = deadlineForPoll(a)?.getTime() ?? Number.POSITIVE_INFINITY;
      const bd = deadlineForPoll(b)?.getTime() ?? Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [filteredPolls]);

  type PollListRow =
    | { kind: 'divider'; key: string; label: string; highlightToday?: boolean }
    | { kind: 'poll'; key: string; poll: Poll };

  const pollListRows = useMemo((): PollListRow[] => {
    if (sortedPolls.length === 0) return [];
    const buckets = new Map<string, Poll[]>();
    for (const poll of sortedPolls) {
      const dl = deadlineForPoll(poll);
      const key = dl ? startDateKeyLocal(dl) : '__none__';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(poll);
    }
    const dateKeys = Array.from(buckets.keys())
      .filter((k) => k !== '__none__')
      .sort();
    if ((buckets.get('__none__')?.length ?? 0) > 0) dateKeys.push('__none__');

    const out: PollListRow[] = [];
    for (const dayKey of dateKeys) {
      if (dayKey === '__none__') {
        out.push({ kind: 'divider', key: 'div-none', label: 'No deadline' });
        for (const p of buckets.get('__none__')!) out.push({ kind: 'poll', key: p.id, poll: p });
        continue;
      }
      const d = dateFromLocalKey(dayKey);
      out.push({
        kind: 'divider',
        key: `div-${dayKey}`,
        label: `${dayShort(d)} · ${fmtDateShort(d)}, ${d.getFullYear()}`,
        highlightToday: isToday(d),
      });
      for (const p of buckets.get(dayKey) ?? []) out.push({ kind: 'poll', key: p.id, poll: p });
    }
    return out;
  }, [sortedPolls]);

  const eventEligibleGroupCount = groups.filter(
    (g) => g.membershipStatus === 'member' || g.membershipStatus === 'admin'
  ).length;
  const unread = notifs.filter((n) => !n.read).length;
  const hasFilters = !!(selectedGroupIds.length || startMode !== 'now' || endMode !== 'allTime');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="bar-chart-outline" size={22} color={Colors.text} />
          <Text style={styles.title}>Polls</Text>
        </View>
        <View style={styles.headerActions}>
          <CreateOrJoinButton userId={currentUserId} eventEligibleGroupCount={eventEligibleGroupCount} />
          <TouchableOpacity
            onPress={() => setShowNotifs((p) => !p)}
            style={[
              styles.iconBtn,
              showNotifs && { borderColor: Colors.borderStrong, backgroundColor: Colors.bg },
            ]}
          >
            <Svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke={Colors.text}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </Svg>
            {unread > 0 && <View style={styles.bellDot} />}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filtersContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillsRow}
          contentContainerStyle={{ gap: 6, paddingRight: 20 }}
        >
          <Pill label="All" selected={selectedGroupIds.length === 0} onPress={() => setSelectedGroupIds([])} />
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
                onPress={() =>
                  setSelectedGroupIds((prev) =>
                    isSelected ? prev.filter((id) => id !== g.id) : [...prev, g.id]
                  )
                }
                onLongPress={() => setSelectedGroupIds([g.id])}
              />
            );
          })}
        </ScrollView>

        <View style={[styles.filterPanel, { position: 'relative' }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingHorizontal: 20, paddingVertical: 8 }}
          >
            <TouchableOpacity
              onPress={() => setShowAdvancedFilters((p) => !p)}
              style={[
                styles.filterIconBtn,
                showAdvancedFilters && { borderColor: Colors.text, backgroundColor: Colors.text },
              ]}
            >
              <Svg
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke={showAdvancedFilters ? Colors.surface : Colors.text}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
              </Svg>
            </TouchableOpacity>
            {hasFilters ? (
              <Pill
                label="Reset filters"
                onPress={() => {
                  setSelectedGroupIds([]);
                  setStartMode('now');
                  setEndMode('allTime');
                  setStartDateText(defaultStartSpecificText);
                  setEndDateText(defaultEndSpecificText);
                }}
                selected={false}
              />
            ) : null}
          </ScrollView>

          {showAdvancedFilters ? (
            <View style={styles.filterExpandedRow}>
              <Text style={styles.filterExpandedHeader}>Deadline Range</Text>
              <View style={styles.dateFilterColumn}>
                <View style={styles.dateFilterRow}>
                  <Text style={styles.dateFilterFieldLabel}>From</Text>
                  <View style={styles.dateFieldWithNow}>
                    <TouchableOpacity
                      style={[styles.dateQuickButton, startMode === 'now' && styles.dateQuickButtonActive]}
                      onPress={() => setStartMode('now')}
                    >
                      <Text style={styles.dateQuickButtonText}>Now</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.dateQuickButton,
                        startMode === 'allTime' && styles.dateQuickButtonActive,
                      ]}
                      onPress={() => setStartMode('allTime')}
                    >
                      <Text style={styles.dateQuickButtonText}>All time</Text>
                    </TouchableOpacity>
                    {Platform.OS === 'web' && WebDatePicker ? (
                      <View
                        style={[
                          styles.webPickerWrapper,
                          startMode === 'specific' && styles.dateSpecificWrapperActive,
                          activeDateField === 'from' && styles.webPickerActive,
                          { alignSelf: 'flex-start' },
                        ]}
                      >
                        <WebDatePicker
                          selected={startDateText ? parseDateTime(startDateText) : null}
                          onChange={(date: Date | null) => {
                            if (!date) return;
                            const y = date.getFullYear();
                            const m = String(date.getMonth() + 1).padStart(2, '0');
                            const d = String(date.getDate()).padStart(2, '0');
                            const hh = String(date.getHours()).padStart(2, '0');
                            const mm = String(date.getMinutes()).padStart(2, '0');
                            setStartDateText(`${y}-${m}-${d} ${hh}:${mm}`);
                            setStartMode('specific');
                          }}
                          popperPlacement="bottom-start"
                          withPortal
                          onCalendarOpen={() => {
                            setActiveDateField('from');
                            setStartMode('specific');
                          }}
                          onCalendarClose={() => setActiveDateField(null)}
                          showTimeSelect
                          timeIntervals={15}
                          dateFormat="yyyy-MM-dd HH:mm"
                          placeholderText={defaultStartSpecificText}
                        />
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.dateValueChip,
                          startMode === 'specific' && styles.dateSpecificWrapperActive,
                        ]}
                        onPress={() => setStartMode('specific')}
                      >
                        <Text style={styles.dateValueText}>
                          {startMode === 'now'
                            ? 'Now'
                            : startMode === 'allTime'
                              ? 'All time'
                              : startDateText || defaultStartSpecificText}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <View style={styles.dateFilterRow}>
                  <Text style={styles.dateFilterFieldLabel}>To</Text>
                  <View style={styles.dateFieldWithNow}>
                    <TouchableOpacity
                      style={[styles.dateQuickButton, endMode === 'now' && styles.dateQuickButtonActive]}
                      onPress={() => setEndMode('now')}
                    >
                      <Text style={styles.dateQuickButtonText}>Now</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dateQuickButton, endMode === 'allTime' && styles.dateQuickButtonActive]}
                      onPress={() => setEndMode('allTime')}
                    >
                      <Text style={styles.dateQuickButtonText}>All time</Text>
                    </TouchableOpacity>
                    {Platform.OS === 'web' && WebDatePicker ? (
                      <View
                        style={[
                          styles.webPickerWrapper,
                          endMode === 'specific' && styles.dateSpecificWrapperActive,
                          activeDateField === 'to' && styles.webPickerActive,
                          { alignSelf: 'flex-start' },
                        ]}
                      >
                        <WebDatePicker
                          selected={endDateText ? parseDateTime(endDateText) : null}
                          onChange={(date: Date | null) => {
                            if (!date) return;
                            const y = date.getFullYear();
                            const m = String(date.getMonth() + 1).padStart(2, '0');
                            const d = String(date.getDate()).padStart(2, '0');
                            const hh = String(date.getHours()).padStart(2, '0');
                            const mm = String(date.getMinutes()).padStart(2, '0');
                            setEndDateText(`${y}-${m}-${d} ${hh}:${mm}`);
                            setEndMode('specific');
                          }}
                          popperPlacement="bottom-start"
                          withPortal
                          onCalendarOpen={() => {
                            setActiveDateField('to');
                            setEndMode('specific');
                          }}
                          onCalendarClose={() => setActiveDateField(null)}
                          showTimeSelect
                          timeIntervals={15}
                          dateFormat="yyyy-MM-dd HH:mm"
                          placeholderText={defaultEndSpecificText}
                        />
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.dateValueChip,
                          endMode === 'specific' && styles.dateSpecificWrapperActive,
                        ]}
                        onPress={() => setEndMode('specific')}
                      >
                        <Text style={styles.dateValueText}>
                          {endMode === 'now'
                            ? 'Now'
                            : endMode === 'allTime'
                              ? 'All time'
                              : endDateText || defaultEndSpecificText}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.pollsScroll}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 }}
      >
        {sortedPolls.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="pie-chart-outline" size={50} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No polls yet</Text>
            <Text style={styles.emptyDesc}>Create a poll to see it here.</Text>
          </View>
        ) : (
          pollListRows.map((row) => {
            if (row.kind === 'divider') {
              const today = row.highlightToday;
              return (
                <View key={row.key} style={styles.dateDividerRow}>
                  <View style={[styles.dividerLine, today && styles.dividerLineToday]} />
                  <Text style={[styles.dateDividerLabel, today && styles.dateDividerLabelToday]}>{row.label}</Text>
                  <View style={[styles.dividerLine, today && styles.dividerLineToday]} />
                </View>
              );
            }
            const poll = row.poll;
            const group = groupsById[poll.groupId];
            const colorHex = groupColors[poll.groupId] || getDefaultGroupThemeFromName(group?.name ?? 'Group');
            return (
              <View key={row.key} style={styles.pollCardWrap}>
                <PollRow
                  poll={poll}
                  group={group}
                  groupColorHex={colorHex}
                  onPress={() => router.push(withReturnTo(`/poll/${poll.id}`, pathname))}
                  onGroupPress={(gid) => router.push(withReturnTo(`/groups/${gid}`, pathname))}
                  isLast={false}
                />
              </View>
            );
          })
        )}
      </ScrollView>

      <NotificationsPanelModal
        visible={showNotifs}
        onClose={() => setShowNotifs(false)}
        userId={currentUserId || ''}
        notifications={notifs}
        isLoading={notifsLoading}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        groupColors={groupColors}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  pollsScroll: { flex: 1, backgroundColor: Colors.bg },
  dateDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerLineToday: {
    backgroundColor: Colors.todayRed,
  },
  dateDividerLabel: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
    flexShrink: 0,
  },
  dateDividerLabelToday: {
    color: Colors.todayRed,
    fontFamily: Fonts.semiBold,
  },
  pollCardWrap: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: Layout.tabHeaderMinHeight,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.notGoing,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  filtersContainer: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  pillsRow: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  filterPanel: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  filterExpandedRow: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  filterExpandedHeader: { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textMuted },
  dateFilterColumn: { gap: 8 },
  dateFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateFilterFieldLabel: {
    width: 36,
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
  },
  dateFieldWithNow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 },
  dateQuickButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.surface,
  },
  dateQuickButtonActive: { backgroundColor: Colors.bg },
  dateQuickButtonText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.text },
  dateValueChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.surface,
  },
  dateSpecificWrapperActive: { borderColor: Colors.text, backgroundColor: Colors.bg },
  dateValueText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.text },
  webPickerWrapper: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.surface,
  },
  webPickerActive: { borderColor: Colors.text },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 36,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.text },
  emptyDesc: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textMuted },
});
