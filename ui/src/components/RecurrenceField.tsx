import { useMemo, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  Pressable,
  Platform,
  Keyboard,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Radius, Shadows } from '../constants/theme';
import { formatLocalDateInput, isSameDay } from '../utils/helpers';
import { formSectionTitleStyle } from './ui';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import {
  type RecurrenceFormState,
  type RecurrencePreset,
  type RecurrenceEndType,
  type MonthlyRecurrencePattern,
  formatRecurrenceFormSummary,
  defaultRecurrenceFormState,
  normalizeRecurrenceCount,
  formatMonthlyPatternSummary,
  getRecurrenceUntilMaxCalendarDate,
  clampRecurrenceUntilYmd,
} from '../utils/recurrence';

type Props = {
  anchorDate: Date;
  value: RecurrenceFormState;
  onChange: (next: RecurrenceFormState) => void;
};

const UNTIL_CAL_WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

function getUntilMonthGrid(year: number, month: number): (Date | null)[][] {
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

function untilLocalDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function parseYmdToLocalDate(s: string): Date | null {
  const [y, m, d] = s.trim().split('-').map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function RadioMark({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
      {selected ? <View style={styles.radioInner} /> : null}
    </View>
  );
}

function UntilEndDateCalendar({
  viewYear,
  viewMonth,
  onPrevMonth,
  onNextMonth,
  minDate,
  maxDate,
  selectedYmd,
  onSelectYmd,
}: {
  viewYear: number;
  viewMonth: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  minDate: Date;
  maxDate: Date;
  selectedYmd: string;
  onSelectYmd: (ymd: string) => void;
}) {
  const grid = useMemo(() => getUntilMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const selectedDate = useMemo(() => parseYmdToLocalDate(selectedYmd), [selectedYmd]);
  const minT = untilLocalDayMs(minDate);
  const maxT = untilLocalDayMs(maxDate);
  const monthTitle = new Date(viewYear, viewMonth, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={styles.untilCal}>
      <View style={styles.untilCalHeader}>
        <TouchableOpacity
          onPress={onPrevMonth}
          hitSlop={10}
          style={styles.untilCalNav}
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={18} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.untilCalTitle}>{monthTitle}</Text>
        <TouchableOpacity
          onPress={onNextMonth}
          hitSlop={10}
          style={styles.untilCalNav}
          accessibilityLabel="Next month"
        >
          <Ionicons name="chevron-forward" size={18} color={Colors.text} />
        </TouchableOpacity>
      </View>
      <View style={styles.untilCalWeekdayRow}>
        {UNTIL_CAL_WEEKDAYS.map((w, i) => (
          <Text key={i} style={styles.untilCalWeekday}>
            {w}
          </Text>
        ))}
      </View>
      {grid.map((grow, ri) => (
        <View key={ri} style={styles.untilCalRow}>
          {grow.map((cell, ci) => {
            if (!cell) return <View key={ci} style={styles.untilCalCell} />;
            const t = untilLocalDayMs(cell);
            const disabled = t < minT || t > maxT;
            const selected = !!selectedDate && !disabled && isSameDay(cell, selectedDate);
            const label = (
              <Text
                style={[
                  styles.untilCalCellText,
                  disabled && styles.untilCalCellTextDisabled,
                  selected && styles.untilCalCellTextSelected,
                ]}
              >
                {cell.getDate()}
              </Text>
            );
            if (disabled) {
              return (
                <View key={ci} style={[styles.untilCalCell, styles.untilCalCellDisabled]}>
                  {label}
                </View>
              );
            }
            return (
              <TouchableOpacity
                key={ci}
                style={[styles.untilCalCell, selected && styles.untilCalCellSelected]}
                onPress={() => onSelectYmd(formatLocalDateInput(cell))}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                {label}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const PRESET_ROWS: { preset: RecurrencePreset; label: string }[] = [
  { preset: 'none', label: 'Does not repeat' },
  { preset: 'daily', label: 'Every day' },
  { preset: 'weekly', label: 'Every Week' },
  { preset: 'monthly', label: 'Every Month' },
  { preset: 'yearly', label: 'Every Year' },
  { preset: 'custom', label: 'Custom…' },
];

function toggleDay(days: number[], d: number): number[] {
  const has = days.includes(d);
  if (has) return days.filter((x) => x !== d).sort((a, b) => a - b);
  return [...days, d].sort((a, b) => a - b);
}

function ChoiceCard({ children }: { children: ReactNode }) {
  return <View style={styles.choiceCard}>{children}</View>;
}

function ChoiceRow({
  selected,
  onPress,
  title,
  borderTop,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  borderTop?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.choiceRow, borderTop && styles.choiceRowBorder, selected && styles.choiceRowSelected]}
      activeOpacity={0.85}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <RadioMark selected={selected} />
      <Text style={styles.choiceRowText}>{title}</Text>
    </TouchableOpacity>
  );
}

function MonthlyPatternSection({
  anchorDate,
  pattern,
  interval,
  onPattern,
}: {
  anchorDate: Date;
  pattern: MonthlyRecurrencePattern;
  interval: number;
  onPattern: (p: MonthlyRecurrencePattern) => void;
}) {
  const iv = Math.max(1, interval);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Repeat by</Text>
      <ChoiceCard>
        <ChoiceRow
          selected={pattern === 'monthDay'}
          onPress={() => onPattern('monthDay')}
          title={formatMonthlyPatternSummary('monthDay', iv, anchorDate)}
        />
        <ChoiceRow
          selected={pattern === 'weekdayOfMonth'}
          onPress={() => onPattern('weekdayOfMonth')}
          title={formatMonthlyPatternSummary('weekdayOfMonth', iv, anchorDate)}
          borderTop
        />
      </ChoiceCard>
    </View>
  );
}

export function RecurrenceField({ anchorDate, value, onChange }: Props) {
  const { height: winH } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetYRef = useRef(0);
  const [untilViewMonth, setUntilViewMonth] = useState(() => ({
    y: anchorDate.getFullYear(),
    m: anchorDate.getMonth(),
  }));
  const summary = useMemo(() => formatRecurrenceFormSummary(value, anchorDate), [value, anchorDate]);

  const untilMinDate = useMemo(() => startOfLocalDay(anchorDate), [anchorDate]);
  const untilMaxDate = useMemo(() => getRecurrenceUntilMaxCalendarDate(anchorDate), [anchorDate]);
  const untilPickerValue = useMemo(() => {
    const raw = parseYmdToLocalDate(value.untilDate) ?? untilMinDate;
    const t = startOfLocalDay(raw).getTime();
    const minT = untilMinDate.getTime();
    const maxT = untilMaxDate.getTime();
    if (t < minT) return untilMinDate;
    if (t > maxT) return untilMaxDate;
    return raw;
  }, [value.untilDate, untilMinDate, untilMaxDate]);

  useEffect(() => {
    if (!open || value.endType !== 'until') return;
    const r = untilPickerValue;
    setUntilViewMonth({ y: r.getFullYear(), m: r.getMonth() });
  }, [open, value.endType, untilPickerValue]);

  useEffect(() => {
    if (!open) setKeyboardHeight(0);
  }, [open]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const keyboardOverlap = useMemo(() => {
    if (keyboardHeight <= 0 || Platform.OS === 'web') return 0;
    if (Platform.OS === 'android') {
      const occluded = Dimensions.get('screen').height - winH;
      if (occluded >= keyboardHeight * 0.5) return 0;
    }
    return keyboardHeight;
  }, [keyboardHeight, winH]);

  const spaceAboveKeyboard = winH - (keyboardOverlap > 0 ? keyboardOverlap + 36 : 48);
  const dialogMaxHeight =
    Platform.OS === 'web' ? ('92vh' as unknown as number) : Math.min(winH * 0.9, Math.max(0, spaceAboveKeyboard));
  const scrollMaxHeight =
    keyboardHeight > 0 ? Math.max(72, dialogMaxHeight - 168) : winH * 0.55;

  const scrollFocusedIntoView = useCallback(() => {
    if (Platform.OS === 'web') return;
    const focused = TextInput.State.currentlyFocusedInput?.() as {
      measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
    } | null;
    const scroll = scrollRef.current;
    if (!focused?.measureInWindow || !scroll?.measureInWindow) return;
    scroll.measureInWindow((_sx, sy, _sw, sh) => {
      focused.measureInWindow?.((_x, y, _w, h) => {
        const margin = 8;
        const top = sy + margin;
        const bottom = sy + sh - margin;
        let delta = 0;
        if (y + h > bottom) delta = y + h - bottom;
        else if (y < top) delta = y - top;
        if (Math.abs(delta) < 1) return;
        scroll.scrollTo({
          y: Math.max(0, scrollOffsetYRef.current + delta),
          animated: true,
        });
      });
    });
  }, []);

  useEffect(() => {
    if (keyboardHeight <= 0) return;
    const timers = [80, 280].map((ms) => setTimeout(scrollFocusedIntoView, ms));
    return () => timers.forEach(clearTimeout);
  }, [keyboardHeight, keyboardOverlap, winH, scrollFocusedIntoView]);

  const applyPreset = (preset: RecurrencePreset) => {
    if (preset === 'none') {
      onChange(defaultRecurrenceFormState());
      return;
    }
    const next: RecurrenceFormState = {
      ...defaultRecurrenceFormState(),
      preset,
    };
    if (preset === 'custom') {
      next.customInterval = value.customInterval >= 1 ? value.customInterval : 1;
      next.customUnit = value.customUnit;
      next.weeklyDays = value.weeklyDays.length ? value.weeklyDays : [anchorDate.getDay()];
      next.monthlyPattern = value.monthlyPattern;
      next.endType = value.endType;
      next.untilDate = clampRecurrenceUntilYmd(value.untilDate || '', anchorDate);
      next.count = value.count || '10';
    }
    onChange(next);
  };

  const setEndType = (endType: RecurrenceEndType) => {
    onChange({ ...value, endType });
  };

  const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <View style={styles.wrap}>
      <Text style={formSectionTitleStyle}>Repeat</Text>
      <TouchableOpacity style={styles.row} onPress={() => setOpen(true)} activeOpacity={0.75}>
        <Text style={styles.rowText} numberOfLines={2}>
          {summary}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        {...edgeToEdgeModalProps}
      >
        <View
          style={[
            styles.modalRoot,
            keyboardOverlap > 0 && {
              justifyContent: 'flex-end',
              paddingBottom: keyboardOverlap + 12,
            },
          ]}
          pointerEvents="box-none"
        >
          <Pressable
            style={styles.modalDismiss}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
          <View style={[styles.dialog, { maxHeight: dialogMaxHeight }]}>
            <View style={styles.dialogHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.dialogTitle}>Repeat event</Text>
                <Text style={styles.dialogSubtitle}>Choose how often this event repeats.</Text>
              </View>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                hitSlop={12}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={Colors.textSub} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollRef}
              style={[styles.dialogScroll, { maxHeight: scrollMaxHeight }]}
              contentContainerStyle={styles.dialogScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScroll={(e) => {
                scrollOffsetYRef.current = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
            >
              <ChoiceCard>
                {PRESET_ROWS.map(({ preset, label }, i) => (
                  <ChoiceRow
                    key={preset}
                    selected={value.preset === preset}
                    onPress={() => applyPreset(preset)}
                    title={label}
                    borderTop={i > 0}
                  />
                ))}
              </ChoiceCard>

              {value.preset === 'monthly' && (
                <MonthlyPatternSection
                  anchorDate={anchorDate}
                  pattern={value.monthlyPattern}
                  interval={1}
                  onPattern={(monthlyPattern) => onChange({ ...value, monthlyPattern })}
                />
              )}

              {value.preset === 'custom' && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Every</Text>
                  <View style={styles.customRow}>
                    <TextInput
                      style={styles.intervalInput}
                      keyboardType="number-pad"
                      value={String(value.customInterval)}
                      onFocus={scrollFocusedIntoView}
                      onChangeText={(t) => {
                        const n = parseInt(t.replace(/\D/g, ''), 10);
                        onChange({
                          ...value,
                          customInterval: Number.isFinite(n) && n > 0 ? Math.min(999, n) : 1,
                        });
                      }}
                    />
                    <View style={styles.unitPills}>
                      {(
                        [
                          ['day', 'day'],
                          ['week', 'week'],
                          ['month', 'month'],
                          ['year', 'year'],
                        ] as const
                      ).map(([u, lab]) => {
                        const on = value.customUnit === u;
                        return (
                          <TouchableOpacity
                            key={u}
                            style={[styles.unitChip, on && styles.optionChipOn]}
                            onPress={() => onChange({ ...value, customUnit: u })}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                          >
                            <Text
                              style={[styles.unitChipText, on && styles.optionChipTextOn]}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.75}
                            >
                              {lab}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              )}

              {value.preset === 'custom' && value.customUnit === 'week' && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Repeat on</Text>
                  <View style={styles.dowRow}>
                    {weekdayLabels.map((ch, i) => {
                      const on = value.weeklyDays.includes(i);
                      return (
                        <TouchableOpacity
                          key={i}
                          style={[styles.optionChip, styles.dowCell, on && styles.optionChipOn]}
                          onPress={() =>
                            onChange({
                              ...value,
                              weeklyDays: toggleDay(
                                value.weeklyDays.length ? value.weeklyDays : [anchorDate.getDay()],
                                i
                              ),
                            })
                          }
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                        >
                          <Text style={[styles.optionChipText, on && styles.optionChipTextOn]}>
                            {ch}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {value.preset === 'custom' && value.customUnit === 'month' && (
                <MonthlyPatternSection
                  anchorDate={anchorDate}
                  pattern={value.monthlyPattern}
                  interval={value.customInterval >= 1 ? value.customInterval : 1}
                  onPattern={(monthlyPattern) => onChange({ ...value, monthlyPattern })}
                />
              )}

              {value.preset !== 'none' && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Ends</Text>
                  <ChoiceCard>
                    <ChoiceRow
                      selected={value.endType === 'until'}
                      onPress={() => setEndType('until')}
                      title="On date"
                    />
                    <ChoiceRow
                      selected={value.endType === 'count'}
                      onPress={() => setEndType('count')}
                      title="After number of times"
                      borderTop
                    />
                  </ChoiceCard>
                  {value.endType === 'until' ? (
                    <UntilEndDateCalendar
                      viewYear={untilViewMonth.y}
                      viewMonth={untilViewMonth.m}
                      onPrevMonth={() =>
                        setUntilViewMonth(({ y, m }) => {
                          const d = new Date(y, m - 1, 1);
                          return { y: d.getFullYear(), m: d.getMonth() };
                        })
                      }
                      onNextMonth={() =>
                        setUntilViewMonth(({ y, m }) => {
                          const d = new Date(y, m + 1, 1);
                          return { y: d.getFullYear(), m: d.getMonth() };
                        })
                      }
                      minDate={untilMinDate}
                      maxDate={untilMaxDate}
                      selectedYmd={value.untilDate}
                      onSelectYmd={(ymd) =>
                        onChange({ ...value, untilDate: clampRecurrenceUntilYmd(ymd, anchorDate) })
                      }
                    />
                  ) : null}
                  {value.endType === 'count' ? (
                    <View style={styles.countRow}>
                      <Text style={styles.countHint}>Times</Text>
                      <TextInput
                        style={styles.countInput}
                        keyboardType="number-pad"
                        value={value.count}
                        onFocus={scrollFocusedIntoView}
                        onChangeText={(t) => onChange({ ...value, count: t.replace(/\D/g, '') })}
                        onBlur={() => {
                          const raw = value.count.replace(/\D/g, '');
                          const parsed = parseInt(raw, 10);
                          const n =
                            !raw || !Number.isFinite(parsed) || parsed < 1
                              ? normalizeRecurrenceCount(10)
                              : normalizeRecurrenceCount(parsed);
                          if (String(n) !== value.count) onChange({ ...value, count: String(n) });
                        }}
                      />
                    </View>
                  ) : null}
                </View>
              )}
            </ScrollView>

            <View style={styles.dialogFooter}>
              <TouchableOpacity style={styles.doneBtn} onPress={() => setOpen(false)} activeOpacity={0.85}>
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  rowText: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.text, flex: 1 },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  modalDismiss: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    flexGrow: 0,
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    flexDirection: 'column',
    ...Shadows.lg,
  },
  dialogHeader: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  dialogTitle: {
    fontSize: 18,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    marginBottom: 4,
  },
  dialogSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    lineHeight: 20,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg,
  },
  dialogScroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  dialogScrollContent: { paddingHorizontal: 20, paddingBottom: 8, gap: 4 },
  dialogFooter: {
    flexShrink: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  choiceCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: Colors.surface,
  },
  choiceRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  choiceRowSelected: {
    backgroundColor: Colors.bg,
  },
  choiceRowText: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.text,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterOn: {
    borderColor: Colors.text,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.text,
  },
  section: { marginTop: 16 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: Colors.textSub,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  dowRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  optionChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionChipOn: {
    borderColor: Colors.text,
    backgroundColor: Colors.bg,
  },
  optionChipText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Colors.textSub,
  },
  optionChipTextOn: {
    color: Colors.text,
  },
  dowCell: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 40,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderRadius: Radius.md,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  intervalInput: {
    width: 52,
    flexShrink: 0,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 6,
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Colors.text,
    backgroundColor: Colors.surface,
    textAlign: 'center',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null),
  },
  unitPills: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  unitChip: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitChipText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Colors.textSub,
    textAlign: 'center',
    width: '100%',
  },
  untilCal: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: 10,
    backgroundColor: Colors.bg,
  },
  untilCalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  untilCalNav: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  untilCalTitle: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text },
  untilCalWeekdayRow: { flexDirection: 'row', marginBottom: 4 },
  untilCalWeekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
  },
  untilCalRow: { flexDirection: 'row' },
  untilCalCell: {
    flex: 1,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  untilCalCellDisabled: {
    opacity: 0.38,
  },
  untilCalCellSelected: {
    backgroundColor: Colors.accent,
  },
  untilCalCellText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Colors.text,
    textAlign: 'center',
  },
  untilCalCellTextDisabled: {
    color: Colors.textMuted,
  },
  untilCalCellTextSelected: {
    color: Colors.accentFg,
  },
  countRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  countHint: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Colors.textSub,
  },
  countInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.text,
    backgroundColor: Colors.surface,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null),
  },
  doneBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  doneBtnText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
});
