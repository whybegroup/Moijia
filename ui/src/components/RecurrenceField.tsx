import { useMemo, useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Radius } from '../constants/theme';
import { formSectionTitleStyle } from './ui';
import {
  type RecurrenceFormState,
  type RecurrencePreset,
  type RecurrenceEndType,
  buildRecurrenceRule,
  formatRecurrenceSummary,
  defaultRecurrenceFormState,
} from '../utils/recurrence';

type Props = {
  anchorDate: Date;
  value: RecurrenceFormState;
  onChange: (next: RecurrenceFormState) => void;
};

const PRESET_ROWS: { preset: RecurrencePreset; label: string }[] = [
  { preset: 'none', label: 'Does not repeat' },
  { preset: 'daily', label: 'Daily' },
  { preset: 'weekly', label: 'Weekly' },
  { preset: 'monthly', label: 'Monthly' },
  { preset: 'yearly', label: 'Annually' },
  { preset: 'custom', label: 'Custom…' },
];

function toggleDay(days: number[], d: number): number[] {
  const has = days.includes(d);
  if (has) return days.filter((x) => x !== d).sort((a, b) => a - b);
  return [...days, d].sort((a, b) => a - b);
}

export function RecurrenceField({ anchorDate, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const summary = useMemo(
    () => formatRecurrenceSummary(buildRecurrenceRule(value, anchorDate) ?? '', anchorDate),
    [value, anchorDate]
  );

  const applyPreset = (preset: RecurrencePreset) => {
    if (preset === 'none') {
      onChange(defaultRecurrenceFormState());
      setOpen(false);
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
      next.endType = value.endType;
      next.untilDate = value.untilDate;
      next.count = value.count || '10';
    }
    onChange(next);
    if (preset !== 'custom') {
      setOpen(false);
    }
  };

  const setEndType = (endType: RecurrenceEndType) => {
    onChange({ ...value, endType });
  };

  const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <View style={styles.wrap}>
      <Text style={formSectionTitleStyle}>Repeat</Text>
      <TouchableOpacity style={styles.row} onPress={() => setOpen(true)} activeOpacity={0.75}>
        <Text style={styles.rowText}>{summary}</Text>
        <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalRoot} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Repeat event</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
              {PRESET_ROWS.map(({ preset, label }) => (
                <TouchableOpacity
                  key={preset}
                  style={[styles.option, value.preset === preset && styles.optionOn]}
                  onPress={() => applyPreset(preset)}
                >
                  <Text style={[styles.optionText, value.preset === preset && styles.optionTextOn]}>
                    {label}
                  </Text>
                  {value.preset === preset ? (
                    <Ionicons name="checkmark" size={20} color={Colors.accentFg} />
                  ) : null}
                </TouchableOpacity>
              ))}

              {value.preset === 'custom' && value.customUnit === 'week' && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Repeat on</Text>
                  <View style={styles.dowRow}>
                    {weekdayLabels.map((ch, i) => {
                      const on = value.weeklyDays.includes(i);
                      return (
                        <TouchableOpacity
                          key={i}
                          style={[styles.dowCell, on && styles.dowCellOn]}
                          onPress={() =>
                            onChange({
                              ...value,
                              weeklyDays: toggleDay(
                                value.weeklyDays.length ? value.weeklyDays : [anchorDate.getDay()],
                                i
                              ),
                            })
                          }
                        >
                          <Text style={[styles.dowText, on && styles.dowTextOn]}>{ch}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {value.preset === 'custom' && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Every</Text>
                  <View style={styles.customRow}>
                    <TextInput
                      style={styles.intervalInput}
                      keyboardType="number-pad"
                      value={String(value.customInterval)}
                      onChangeText={(t) => {
                        const n = parseInt(t.replace(/\D/g, ''), 10);
                        onChange({
                          ...value,
                          customInterval: Number.isFinite(n) && n > 0 ? Math.min(999, n) : 1,
                        });
                      }}
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.unitScroll}>
                      {(
                        [
                          ['day', 'day'],
                          ['week', 'week'],
                          ['month', 'month'],
                          ['year', 'year'],
                        ] as const
                      ).map(([u, lab]) => (
                        <TouchableOpacity
                          key={u}
                          style={[styles.unitChip, value.customUnit === u && styles.unitChipOn]}
                          onPress={() => onChange({ ...value, customUnit: u })}
                        >
                          <Text style={[styles.unitChipText, value.customUnit === u && styles.unitChipTextOn]}>
                            {lab}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              )}

              {value.preset !== 'none' && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Ends</Text>
                  <TouchableOpacity
                    style={[styles.endRow, value.endType === 'until' && styles.endRowOn]}
                    onPress={() => setEndType('until')}
                  >
                    <Text style={styles.endRowText}>On date</Text>
                    {value.endType === 'until' ? (
                      <Ionicons name="radio-button-on" size={20} color={Colors.accent} />
                    ) : (
                      <Ionicons name="radio-button-off" size={20} color={Colors.textMuted} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.endRow, value.endType === 'count' && styles.endRowOn]}
                    onPress={() => setEndType('count')}
                  >
                    <Text style={styles.endRowText}>After number of times</Text>
                    {value.endType === 'count' ? (
                      <Ionicons name="radio-button-on" size={20} color={Colors.accent} />
                    ) : (
                      <Ionicons name="radio-button-off" size={20} color={Colors.textMuted} />
                    )}
                  </TouchableOpacity>
                  {value.endType === 'until' ? (
                    <TextInput
                      style={styles.dateInput}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={Colors.textMuted}
                      value={value.untilDate}
                      onChangeText={(t) => onChange({ ...value, untilDate: t })}
                    />
                  ) : null}
                  {value.endType === 'count' ? (
                    <TextInput
                      style={styles.dateInput}
                      keyboardType="number-pad"
                      value={value.count}
                      onChangeText={(t) => onChange({ ...value, count: t.replace(/\D/g, '') || '1' })}
                    />
                  ) : null}
                </View>
              )}

              <TouchableOpacity style={styles.doneBtn} onPress={() => setOpen(false)}>
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
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
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingVertical: 9,
    paddingHorizontal: 12,
    minHeight: 0,
  },
  rowText: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.text, flex: 1 },
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: Platform.OS === 'web' ? ('85vh' as any) : '88%',
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  sheetTitle: { fontSize: 17, fontFamily: Fonts.bold, color: Colors.text },
  sheetScroll: { paddingHorizontal: 8, paddingTop: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
  },
  optionOn: { backgroundColor: Colors.accent },
  optionText: { fontSize: 16, fontFamily: Fonts.medium, color: Colors.text, flex: 1 },
  optionTextOn: { color: Colors.accentFg },
  section: { marginTop: 12, marginBottom: 8, paddingHorizontal: 8 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  dowRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  dowCell: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  dowCellOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  dowText: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.text },
  dowTextOn: { color: Colors.accentFg },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  intervalInput: {
    width: 56,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 16,
    fontFamily: Fonts.medium,
    color: Colors.text,
    backgroundColor: Colors.surface,
    textAlign: 'center',
  },
  unitScroll: { flexGrow: 0, flexShrink: 1 },
  unitChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
    backgroundColor: Colors.surface,
  },
  unitChipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  unitChipText: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.text },
  unitChipTextOn: { color: Colors.accentFg },
  endRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  endRowOn: {},
  endRowText: { fontSize: 16, fontFamily: Fonts.regular, color: Colors.text },
  dateInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 12,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.text,
    backgroundColor: Colors.surface,
    marginTop: 8,
  },
  doneBtn: {
    marginTop: 20,
    marginHorizontal: 12,
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneBtnText: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.accentFg },
});
