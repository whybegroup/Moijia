import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Radius } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName } from '../utils/helpers';
import { Toggle } from './ui';
import { useGroupMemberColor, useUpdateGroupMemberColor } from '../hooks/api';
import ColorPicker, { Panel1, HueSlider, OpacitySlider } from 'reanimated-color-picker';

const REMINDER_OPTIONS = ['Never', '1 hour before', '1 day before', '1 week before'];

type Props = {
  groupId: string;
  userId: string;
  groupName: string;
};

export function GroupMemberThemeAndNotifications({ groupId, userId, groupName }: Props) {
  const { data: memberColorData } = useGroupMemberColor(groupId, userId);
  const updateMemberColor = useUpdateGroupMemberColor(groupId, userId);

  const userColorHex = memberColorData?.colorHex || getDefaultGroupThemeFromName(groupName);
  const p = getGroupColor(userColorHex);

  const [themeExpanded, setThemeExpanded] = useState(false);

  const [notifSettings, setNotifSettings] = useState({
    newEvent: true,
    minAttendees: true,
    onLocation: false,
    onTime: true,
    onRsvp: false,
    reminder: '1 hour before',
  });

  const selectColor = async (colorHex: string) => {
    try {
      await updateMemberColor.mutateAsync(colorHex);
    } catch {
      /* unchanged */
    }
  };

  const updateSetting = (key: string, value: boolean | string) => {
    setNotifSettings((s) => ({ ...s, [key]: value }));
  };

  return (
    <>
      <Text style={styles.sectionLabel}>THEME COLOR</Text>
      <View style={[styles.card, { marginBottom: 20 }]}>
        <TouchableOpacity
          style={styles.themeHeader}
          onPress={() => setThemeExpanded((e) => !e)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded: themeExpanded }}
          accessibilityLabel={themeExpanded ? 'Collapse theme color picker' : 'Expand theme color picker'}
        >
          <View style={[styles.colorDot, { backgroundColor: p.dot }]} />
          <View style={styles.themeHeaderText}>
            <Text style={styles.hexInline}>{userColorHex.toUpperCase()}</Text>
            <Text style={styles.hexInline}></Text>
          </View>
          <Ionicons name={themeExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={Colors.textMuted} />
        </TouchableOpacity>
        {themeExpanded ? (
          <View style={styles.colorPickerWrap}>
            <ColorPicker style={{ width: '100%' }} value={userColorHex} onCompleteJS={({ hex }) => void selectColor(hex)}>
              <Panel1 />
              <HueSlider />
              <OpacitySlider />
            </ColorPicker>
            <Text style={styles.hexReadout}>{userColorHex.toUpperCase()}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
      <View style={[styles.card, { marginBottom: 20 }]}>
        <View style={styles.notifSection}>
          <Toggle value={notifSettings.newEvent} onChange={(v) => updateSetting('newEvent', v)} label="New event alerts" />
          <Toggle value={notifSettings.minAttendees} onChange={(v) => updateSetting('minAttendees', v)} label="Min attendees alerts" />
          <Toggle value={notifSettings.onLocation} onChange={(v) => updateSetting('onLocation', v)} label="Location changes" />
          <Toggle value={notifSettings.onTime} onChange={(v) => updateSetting('onTime', v)} label="Time changes" />
          <Toggle value={notifSettings.onRsvp} onChange={(v) => updateSetting('onRsvp', v)} label="RSVP updates" />

          <View style={styles.reminderRow}>
            <Text style={styles.reminderLabel}>Event reminder</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {REMINDER_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  onPress={() => updateSetting('reminder', opt)}
                  style={[styles.reminderChip, notifSettings.reminder === opt && styles.reminderChipActive]}
                >
                  <Text style={[styles.reminderChipText, notifSettings.reminder === opt && styles.reminderChipTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  themeHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  themeHeaderText: { flex: 1, minWidth: 0 },
  colorDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  colorLabel: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.text },
  hexInline: { fontSize: 14, color: Colors.textMuted, marginTop: 2 },
  colorPickerWrap: { paddingHorizontal: 16, paddingBottom: 16 },
  hexReadout: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.text, textAlign: 'center', marginTop: 12 },
  notifSection: { padding: 16 },
  reminderRow: { paddingVertical: 10, marginTop: 8 },
  reminderLabel: { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, marginBottom: 8 },
  reminderChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  reminderChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accent },
  reminderChipText: { fontSize: 12, color: Colors.textSub, fontFamily: Fonts.regular },
  reminderChipTextActive: { color: Colors.accentFg, fontFamily: Fonts.semiBold },
});
