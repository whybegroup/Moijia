import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import DateTimePicker from './AppDateTimePicker';
import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import type { Poll } from '@moijia/client';
import { Colors, Fonts, Radius } from '../constants/theme';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import {
  useAllGroupMemberColors,
  useGroups,
  usePolls,
} from '../hooks/api';
import {
  getDefaultGroupThemeFromName,
  getGroupColor,
  formatFilterDatetimeTwelveHour,
} from '../utils/helpers';
import { loadPollsScreenPrefs, savePollsScreenPrefs } from '../utils/pollsScreenPrefs';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { Pill } from './ui';
import { CollapsibleFiltersButton } from './CollapsibleFiltersButton';
import { PollRow, getDeadlineUrgency } from './PollRow';
import { ListAdCard } from './ListAdCard';
import { shouldInsertListAdAfter } from '../config/ads';
import { useAdsEnabled } from '../hooks/useAdsEnabled';

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

function formatLocalDateTime(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function formatLocalTimeTwelveHour(d: Date): string {
  const hours24 = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, '0')}:${minutes} ${suffix}`;
}

function webFilterModalInputStyle(): Record<string, string | number> {
  return {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #18181B',
    backgroundColor: '#F4F4F5',
    fontSize: 14,
    color: '#18181B',
    fontFamily: 'DMSans_500Medium',
    boxSizing: 'border-box',
    outline: 'none',
    marginBottom: 4,
  };
}

function mergeFilterDraftDatePart(base: Date, picked: Date): Date {
  const n = new Date(base);
  n.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return n;
}

function mergeFilterDraftTimePart(base: Date, picked: Date): Date {
  const n = new Date(base);
  n.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return n;
}

export type PollsListScreenProps = {
  /** When set, filters to this group only and hides group pills; does not overwrite saved tab group selection. */
  lockedGroupId?: string;
  /** Omit tab header / notifications (parent provides Groups chrome). */
  embedded?: boolean;
};

export function PollsListScreen({ lockedGroupId, embedded }: PollsListScreenProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const { userId: currentUserId } = useCurrentUserContext();
  const isGroupEmbedded = !!(embedded && lockedGroupId);
  const adsEnabled = useAdsEnabled();
  const showListAds = adsEnabled && !isGroupEmbedded;
  const { data: polls = [], refetch: refetchPolls } = usePolls(currentUserId ?? '');
  const { data: allGroups = [], refetch: refetchGroups } = useGroups(currentUserId ?? '');
  const { data: groupColors = {}, refetch: refetchGroupColors } = useAllGroupMemberColors(
    currentUserId ?? ''
  );
  const { refreshControl } = usePullToRefresh([refetchPolls, refetchGroups, refetchGroupColors]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(() =>
    lockedGroupId ? [lockedGroupId] : []
  );

  useEffect(() => {
    if (lockedGroupId) setSelectedGroupIds([lockedGroupId]);
  }, [lockedGroupId]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [datetimeFilterModal, setDatetimeFilterModal] = useState<null | 'start' | 'end'>(null);
  const [filterModalDraft, setFilterModalDraft] = useState(() => new Date());
  const [iosFilterFieldPicker, setIosFilterFieldPicker] = useState<null | 'date' | 'time'>(null);
  const [iosFilterSubDraft, setIosFilterSubDraft] = useState(() => new Date());

  const closeDatetimeFilterModal = () => {
    setIosFilterFieldPicker(null);
    setDatetimeFilterModal(null);
  };

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

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const prefs = await loadPollsScreenPrefs();
      if (!mounted || !prefs) return;
      if (!lockedGroupId && prefs.selectedGroupIds) setSelectedGroupIds(prefs.selectedGroupIds);
      if (prefs.showAdvancedFilters !== undefined) setShowAdvancedFilters(prefs.showAdvancedFilters);
      if (prefs.startDateText) setStartDateText(prefs.startDateText);
      if (prefs.endDateText) setEndDateText(prefs.endDateText);
      if (prefs.startMode) setStartMode(prefs.startMode);
      if (prefs.endMode) setEndMode(prefs.endMode);
    })();
    return () => {
      mounted = false;
    };
  }, [lockedGroupId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const prev = lockedGroupId ? await loadPollsScreenPrefs() : null;
      if (cancelled) return;
      void savePollsScreenPrefs({
        v: 1,
        selectedGroupIds: lockedGroupId ? (prev?.selectedGroupIds ?? []) : selectedGroupIds,
        showAdvancedFilters,
        startDateText,
        endDateText,
        startMode,
        endMode,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    lockedGroupId,
    selectedGroupIds,
    showAdvancedFilters,
    startDateText,
    endDateText,
    startMode,
    endMode,
  ]);

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
      if (lockedGroupId && poll.groupId !== lockedGroupId) return false;
      if (!groups.some((g) => g.id === poll.groupId)) return false;
      if (selectedGroupIds.length > 0 && !selectedGroupIds.includes(poll.groupId)) return false;
      const deadline = deadlineForPoll(poll);
      if (!deadline) return true;
      if (startBound && deadline.getTime() <= startBound.getTime()) return false;
      if (endFilterCutoff && deadline.getTime() > endFilterCutoff.getTime()) return false;
      return true;
    });
  }, [
    polls,
    groups,
    lockedGroupId,
    selectedGroupIds,
    startMode,
    endMode,
    startDateText,
    endDateText,
  ]);
  /** Soonest deadline first; polls with no deadline sort last. */
  const sortedPolls = useMemo(() => {
    return [...filteredPolls].sort((a, b) => {
      const aDeadline = deadlineForPoll(a)?.getTime() ?? Number.POSITIVE_INFINITY;
      const bDeadline = deadlineForPoll(b)?.getTime() ?? Number.POSITIVE_INFINITY;
      if (aDeadline !== bDeadline) return aDeadline - bDeadline;

      const aClosedAt = new Date((a as Poll & { closedAt?: string | null }).closedAt ?? '').getTime();
      const bClosedAt = new Date((b as Poll & { closedAt?: string | null }).closedAt ?? '').getTime();
      const aClosedSort = Number.isFinite(aClosedAt) ? aClosedAt : Number.POSITIVE_INFINITY;
      const bClosedSort = Number.isFinite(bClosedAt) ? bClosedAt : Number.POSITIVE_INFINITY;
      if (aClosedSort !== bClosedSort) return aClosedSort - bClosedSort;

      const aCreatedAt = new Date(a.createdAt).getTime();
      const bCreatedAt = new Date(b.createdAt).getTime();
      const aCreatedSort = Number.isFinite(aCreatedAt) ? aCreatedAt : Number.POSITIVE_INFINITY;
      const bCreatedSort = Number.isFinite(bCreatedAt) ? bCreatedAt : Number.POSITIVE_INFINITY;
      return aCreatedSort - bCreatedSort;
    });
  }, [filteredPolls]);

  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);
  const listNow = useMemo(() => new Date(), [nowTick]);

  const hasFilters = !!(
    (!lockedGroupId && selectedGroupIds.length > 0) ||
    startMode !== 'now' ||
    endMode !== 'allTime'
  );

  const inner = (
    <>
      <View style={styles.filtersContainer}>
        <View style={styles.filterToggleRow}>
          <CollapsibleFiltersButton
            expanded={showAdvancedFilters}
            onToggle={() => setShowAdvancedFilters((p) => !p)}
            filtersActive={hasFilters}
            onReset={() => {
              setSelectedGroupIds(lockedGroupId ? [lockedGroupId] : []);
              setStartMode('now');
              setEndMode('allTime');
              setStartDateText(defaultStartSpecificText);
              setEndDateText(defaultEndSpecificText);
            }}
          />
        </View>

        {showAdvancedFilters ? (
          <>
            {!lockedGroupId ? (
              <View style={styles.filterExpandedRow}>
                <Text style={styles.filterExpandedHeader}>Groups</Text>
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
              </View>
            ) : null}

            <View style={styles.filterExpandedRow}>
              <Text style={styles.filterExpandedHeader}>Time Range</Text>
              <View style={styles.dateFilterColumn}>
                <View style={styles.dateFilterRow}>
                  <Text style={styles.dateFilterFieldLabel}>From</Text>
                  <View style={styles.dateFieldWithNow}>
                    <TouchableOpacity
                      style={[styles.dateQuickButton, startMode === 'now' && styles.dateQuickButtonActive]}
                      activeOpacity={0.7}
                      onPress={() => setStartMode('now')}
                    >
                      <Text style={styles.dateQuickButtonText}>Now</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.dateQuickButton,
                        startMode === 'allTime' && styles.dateQuickButtonActive,
                      ]}
                      activeOpacity={0.7}
                      onPress={() => setStartMode('allTime')}
                    >
                      <Text style={styles.dateQuickButtonText}>All time</Text>
                    </TouchableOpacity>
                    <View style={[styles.nativeDateFieldWrap, styles.filterDatetimeSlot]} collapsable={false}>
                      <TouchableOpacity
                        style={[
                          styles.dateValueChip,
                          startMode === 'specific' && styles.dateSpecificWrapperActive,
                        ]}
                        activeOpacity={0.7}
                        onPress={() => {
                          let text = startDateText;
                          if (!text) {
                            const now = new Date();
                            const y = now.getFullYear();
                            const m = String(now.getMonth() + 1).padStart(2, '0');
                            const d = String(now.getDate()).padStart(2, '0');
                            text = `${y}-${m}-${d} 00:00`;
                            setStartDateText(text);
                          }
                          setFilterModalDraft(parseDateTime(text) ?? new Date());
                          setDatetimeFilterModal('start');
                        }}
                      >
                        <Text
                          style={[
                            styles.dateValueText,
                            startMode === 'specific' && styles.dateValueTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {formatFilterDatetimeTwelveHour(
                            startDateText || defaultStartSpecificText
                          )}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                <View style={styles.dateFilterRow}>
                  <Text style={styles.dateFilterFieldLabel}>To</Text>
                  <View style={styles.dateFieldWithNow}>
                    <TouchableOpacity
                      style={[styles.dateQuickButton, endMode === 'now' && styles.dateQuickButtonActive]}
                      activeOpacity={0.7}
                      onPress={() => setEndMode('now')}
                    >
                      <Text style={styles.dateQuickButtonText}>Now</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dateQuickButton, endMode === 'allTime' && styles.dateQuickButtonActive]}
                      activeOpacity={0.7}
                      onPress={() => setEndMode('allTime')}
                    >
                      <Text style={styles.dateQuickButtonText}>All time</Text>
                    </TouchableOpacity>
                    <View style={[styles.nativeDateFieldWrap, styles.filterDatetimeSlot]} collapsable={false}>
                      <TouchableOpacity
                        style={[
                          styles.dateValueChip,
                          endMode === 'specific' && styles.dateSpecificWrapperActive,
                        ]}
                        activeOpacity={0.7}
                        onPress={() => {
                          let text = endDateText;
                          if (!text) {
                            const now = new Date();
                            const y = now.getFullYear();
                            const m = String(now.getMonth() + 1).padStart(2, '0');
                            const d = String(now.getDate()).padStart(2, '0');
                            text = `${y}-${m}-${d} 00:00`;
                            setEndDateText(text);
                          }
                          setFilterModalDraft(parseDateTime(text) ?? new Date());
                          setDatetimeFilterModal('end');
                        }}
                      >
                        <Text
                          style={[
                            styles.dateValueText,
                            endMode === 'specific' && styles.dateValueTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {formatFilterDatetimeTwelveHour(
                            endDateText || defaultEndSpecificText
                          )}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </>
        ) : null}
      </View>

      <ScrollView
        style={styles.pollsScroll}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: showListAds ? 140 : 100 }}
        refreshControl={refreshControl}
      >
        {sortedPolls.length === 0 ? (
          <>
            <View style={styles.emptyState}>
              <Ionicons name="pie-chart-outline" size={50} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No polls yet</Text>
              <Text style={styles.emptyDesc}>Create a poll to see it here.</Text>
            </View>
          </>
        ) : (
          sortedPolls.map((poll, i) => {
            const group = groupsById[poll.groupId];
            const colorHex = groupColors[poll.groupId] || getDefaultGroupThemeFromName(group?.name ?? 'Group');
            const showAd = showListAds && shouldInsertListAdAfter(i + 1, sortedPolls.length);
            return (
              <Fragment key={poll.id}>
                <View style={styles.pollCardWrap}>
                  <PollRow
                    poll={poll}
                    group={group}
                    groupColorHex={colorHex}
                    showGroup={!lockedGroupId}
                    urgency={getDeadlineUrgency(poll, listNow)}
                    onPress={() =>
                      router.push(
                        (embedded
                          ? `/(tabs)/groups/${poll.groupId}/polls/${poll.id}`
                          : `/(tabs)/polls/${poll.id}`) as import('expo-router').Href
                      )
                    }
                    isLast={i === sortedPolls.length - 1}
                  />
                </View>
                {showAd ? <ListAdCard /> : null}
              </Fragment>
            );
          })
        )}
      </ScrollView>
      <Modal
        transparent
        animationType="fade"
        visible={datetimeFilterModal != null}
        onRequestClose={() => {
          if (Platform.OS === 'ios' && iosFilterFieldPicker != null) {
            setIosFilterFieldPicker(null);
          } else {
            closeDatetimeFilterModal();
          }
        }}
        {...edgeToEdgeModalProps}
      >
        <View style={styles.filterDatetimeModalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, styles.iosFilterPickerBackdrop]}
            onPress={() => {
              if (Platform.OS === 'ios' && iosFilterFieldPicker != null) {
                setIosFilterFieldPicker(null);
              } else {
                closeDatetimeFilterModal();
              }
            }}
          />
          <View style={styles.filterDatetimeModalCard} pointerEvents="box-none">
            {Platform.OS === 'ios' && iosFilterFieldPicker != null ? (
              <>
                <View style={styles.filterIosSubPickerHeader}>
                  <TouchableOpacity
                    onPress={() => setIosFilterFieldPicker(null)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={styles.filterIosSubPickerBack}
                  >
                    <Ionicons name="chevron-back" size={22} color={Colors.text} />
                  </TouchableOpacity>
                  <Text style={styles.filterIosSubPickerTitle}>
                    {iosFilterFieldPicker === 'date' ? 'Date' : 'Time'}
                  </Text>
                </View>
                <View
                  style={
                    iosFilterFieldPicker === 'date'
                      ? styles.filterIosSubPickerHostCalendar
                      : styles.filterIosSubPickerHostTime
                  }
                >
                  <DateTimePicker
                    value={iosFilterSubDraft}
                    mode={iosFilterFieldPicker}
                    display={iosFilterFieldPicker === 'date' ? 'inline' : 'spinner'}
                    locale="en-US"
                    onChange={(_, date) => {
                      if (date) setIosFilterSubDraft(date);
                    }}
                    style={
                      iosFilterFieldPicker === 'date'
                        ? styles.filterIosSubPickerCalendar
                        : styles.filterIosSubPickerTimeWheels
                    }
                  />
                </View>
                <TouchableOpacity
                  style={[styles.filterDatetimeModalSave, styles.filterIosSubPickerDone]}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (iosFilterFieldPicker === 'date') {
                      setFilterModalDraft((prev) => mergeFilterDraftDatePart(prev, iosFilterSubDraft));
                    } else {
                      setFilterModalDraft((prev) => mergeFilterDraftTimePart(prev, iosFilterSubDraft));
                    }
                    setIosFilterFieldPicker(null);
                  }}
                >
                  <Text style={styles.filterDatetimeModalSaveText}>Done</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.filterDatetimeModalTitle}>
                  {datetimeFilterModal === 'start' ? 'From' : datetimeFilterModal === 'end' ? 'To' : ''}
                </Text>
                <ScrollView
                  style={styles.filterDatetimeModalScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.filterModalSectionLabel}>Date</Text>
                  {Platform.OS === 'web' ? (
                    <input
                      type="date"
                      value={
                        datetimeFilterModal
                          ? formatLocalDateTime(filterModalDraft).slice(0, 10)
                          : ''
                      }
                      onChange={(e: any) => {
                        const datePart = String(e?.target?.value || '').trim();
                        if (!datePart || !datetimeFilterModal) return;
                        const [y, m, d] = datePart.split('-').map(Number);
                        if (!y || !m || !d) return;
                        setFilterModalDraft((prev) =>
                          mergeFilterDraftDatePart(prev, new Date(y, m - 1, d, 12, 0))
                        );
                      }}
                      style={webFilterModalInputStyle()}
                    />
                  ) : Platform.OS === 'ios' ? (
                    <TouchableOpacity
                      style={styles.filterModalIosField}
                      activeOpacity={0.75}
                      onPress={() => {
                        setIosFilterSubDraft(new Date(filterModalDraft));
                        setIosFilterFieldPicker('date');
                      }}
                    >
                      <Text style={styles.filterModalIosFieldText}>
                        {formatLocalDateTime(filterModalDraft).slice(0, 10)}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <DateTimePicker
                      value={filterModalDraft}
                      mode="date"
                      display="spinner"
                      locale="en-US"
                      onChange={(_, date) => {
                        if (date) setFilterModalDraft((prev) => mergeFilterDraftDatePart(prev, date));
                      }}
                      style={styles.inlinePicker}
                    />
                  )}
                  <Text style={styles.filterModalSectionLabel}>Time</Text>
                  {Platform.OS === 'web' ? (
                    <input
                      type="time"
                      value={(() => {
                        const t = formatLocalDateTime(filterModalDraft).split(' ')[1] ?? '00:00';
                        return t.length === 5 ? t : '00:00';
                      })()}
                      onChange={(e: any) => {
                        const timePart = String(e?.target?.value || '').trim();
                        if (!timePart || !datetimeFilterModal) return;
                        const [hs, mins] = timePart.split(':');
                        const hh = Number(hs) || 0;
                        const mm = Number(mins) || 0;
                        setFilterModalDraft((prev) => {
                          const n = new Date(prev);
                          n.setHours(hh, mm, 0, 0);
                          return n;
                        });
                      }}
                      style={webFilterModalInputStyle()}
                    />
                  ) : Platform.OS === 'ios' ? (
                    <TouchableOpacity
                      style={styles.filterModalIosField}
                      activeOpacity={0.75}
                      onPress={() => {
                        setIosFilterSubDraft(new Date(filterModalDraft));
                        setIosFilterFieldPicker('time');
                      }}
                    >
                      <Text style={styles.filterModalIosFieldText}>
                        {formatLocalTimeTwelveHour(filterModalDraft)}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <DateTimePicker
                      value={filterModalDraft}
                      mode="time"
                      display="spinner"
                      is24Hour={false}
                      locale="en-US"
                      onChange={(_, date) => {
                        if (date) setFilterModalDraft((prev) => mergeFilterDraftTimePart(prev, date));
                      }}
                      style={styles.inlinePicker}
                    />
                  )}
                </ScrollView>
                <TouchableOpacity
                  style={styles.filterDatetimeModalSave}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (datetimeFilterModal === 'start') {
                      setStartDateText(formatLocalDateTime(filterModalDraft));
                      setStartMode('specific');
                    } else if (datetimeFilterModal === 'end') {
                      setEndDateText(formatLocalDateTime(filterModalDraft));
                      setEndMode('specific');
                    }
                    closeDatetimeFilterModal();
                  }}
                >
                  <Text style={styles.filterDatetimeModalSaveText}>Save</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

    </>
  );

  return (
    <View style={[styles.safe, embedded && styles.embeddedRoot]}>
      {inner}
      {showListAds ? <ListAdCard docked /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  embeddedRoot: { minHeight: 0 },
  pollsScroll: { flex: 1, backgroundColor: Colors.bg },
  pollCardWrap: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: 0.5,
  },
  filtersContainer: {
    backgroundColor: Colors.bg,
  },
  filterToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  pillsRow: {
    width: '100%',
    flexGrow: 0,
  },
  filterExpandedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.bg,
  },
  filterExpandedHeader: {
    width: '100%',
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  dateFilterColumn: {
    marginTop: 4,
    gap: 6,
    width: '100%',
  },
  dateFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  dateFilterFieldLabel: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
    minWidth: 40,
  },
  filterDatetimeSlot: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexShrink: 0,
  },
  dateFieldWithNow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    flexWrap: 'wrap',
    flexShrink: 1,
    minWidth: 0,
  },
  dateQuickButton: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dateQuickButtonActive: {
    backgroundColor: Colors.bg,
    borderColor: Colors.accent,
  },
  dateQuickButtonText: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Colors.textSub,
  },
  dateValueChip: {
    alignSelf: 'flex-start',
    minHeight: 32,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  dateSpecificWrapperActive: { borderColor: Colors.accent, backgroundColor: Colors.bg },
  dateValueText: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Colors.textSub,
    textAlign: 'left',
  },
  dateValueTextActive: { color: Colors.text },
  nativeDateFieldWrap: { alignSelf: 'flex-start', alignItems: 'flex-start', gap: 6 },
  inlinePicker: { alignSelf: 'flex-start' },
  iosFilterPickerBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  filterDatetimeModalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  filterDatetimeModalCard: {
    width: '100%',
    maxWidth: 400,
    flexGrow: 0,
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    zIndex: 2,
  },
  filterDatetimeModalTitle: {
    fontSize: 17,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    marginBottom: 12,
  },
  filterModalSectionLabel: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    marginTop: 8,
    marginBottom: 6,
  },
  filterDatetimeModalScroll: {
    maxHeight: 420,
  },
  filterDatetimeModalSave: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  filterDatetimeModalSaveText: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: Colors.surface,
  },
  filterModalIosField: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#18181B',
    backgroundColor: Colors.bg,
    marginBottom: 4,
  },
  filterModalIosFieldText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Colors.text,
  },
  filterIosSubPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 0,
  },
  filterIosSubPickerTitle: {
    fontSize: 17,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    marginBottom: 0,
    flex: 1,
  },
  filterIosSubPickerBack: {
    paddingVertical: 4,
    paddingRight: 4,
    marginLeft: -4,
  },
  filterIosSubPickerHostCalendar: {
    width: '100%',
    minHeight: 320,
    padding: 16,
    marginTop: 12,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  filterIosSubPickerHostTime: {
    width: '100%',
    minHeight: 200,
    padding: 16,
    marginTop: 12,
    marginBottom: 12,
    alignItems: 'stretch',
    justifyContent: 'center',
    overflow: 'visible',
  },
  filterIosSubPickerCalendar: {
    alignSelf: 'center',
  },
  filterIosSubPickerTimeWheels: {
    width: '100%',
    alignSelf: 'stretch',
  },
  filterIosSubPickerDone: {
    marginTop: 4,
  },
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
