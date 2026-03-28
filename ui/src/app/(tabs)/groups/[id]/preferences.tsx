import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Fonts, Radius } from '../../../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, groupAvatarBorderRadius } from '../../../../utils/helpers';
import { NavBar, Toggle } from '../../../../components/ui';
import { useGroup, useGroupMemberColor, useUpdateGroupMemberColor } from '../../../../hooks/api';
import { useCurrentUserContext } from '../../../../contexts/CurrentUserContext';
import { GroupAvatar } from '../../../../components/GroupAvatar';
import ColorPicker, { Panel1, HueSlider, OpacitySlider } from 'reanimated-color-picker';

const REMINDER_OPTIONS = ['Never', '1 hour before', '1 day before', '1 week before'];

export default function GroupPreferencesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userId: currentUserId } = useCurrentUserContext();

  const groupId = Array.isArray(id) ? id[0] : id;

  const { data: group } = useGroup(groupId || '', currentUserId || '');
  const { data: memberColorData } = useGroupMemberColor(groupId || '', currentUserId);
  const updateMemberColor = useUpdateGroupMemberColor(groupId || '', currentUserId);

  const userColorHex = memberColorData?.colorHex || getDefaultGroupThemeFromName(group?.name || '');
  const p = getGroupColor(userColorHex);

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
      /* color update failed — UI unchanged */
    }
  };

  const updateSetting = (key: string, value: any) => {
    setNotifSettings(s => ({ ...s, [key]: value }));
  };

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  if (!groupId || !group) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <NavBar title={group.name} onBack={handleBack} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {/* Group header */}
        <View style={styles.headerCard}>
          <View style={[styles.groupThumb, { backgroundColor: p.row, borderColor: p.cal, borderRadius: groupAvatarBorderRadius(56) }]}>
            <GroupAvatar seed={group.avatarSeed} thumbnail={group.thumbnail} name={group.name} size={56} style={{ width: 56, height: 56 }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.groupName}>{group.name}</Text>
            <Text style={styles.groupDesc}>{group.desc || 'No description'}</Text>
          </View>
        </View>

        {/* Your color */}
        <Text style={styles.sectionLabel}>YOUR COLOR</Text>
        <View style={[styles.card, { marginBottom: 20 }]}>
          <View style={styles.colorSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <View style={[styles.colorDot, { backgroundColor: p.dot }]} />
              <Text style={styles.colorLabel}>Theme color for this group</Text>
            </View>
            <ColorPicker
              style={{ width: '100%' }}
              value={userColorHex}
              onCompleteJS={({ hex }) => void selectColor(hex)}
            >
              <Panel1 />
              <HueSlider />
              <OpacitySlider />
            </ColorPicker>
            <Text style={styles.hexReadout}>{userColorHex.toUpperCase()}</Text>
          </View>
        </View>

        {/* Notifications */}
        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
        <View style={[styles.card, { marginBottom: 20 }]}>
          <View style={styles.notifSection}>
            <Toggle value={notifSettings.newEvent} onChange={v => updateSetting('newEvent', v)} label="New event alerts" />
            <Toggle value={notifSettings.minAttendees} onChange={v => updateSetting('minAttendees', v)} label="Min attendees alerts" />
            <Toggle value={notifSettings.onLocation} onChange={v => updateSetting('onLocation', v)} label="Location changes" />
            <Toggle value={notifSettings.onTime} onChange={v => updateSetting('onTime', v)} label="Time changes" />
            <Toggle value={notifSettings.onRsvp} onChange={v => updateSetting('onRsvp', v)} label="RSVP updates" />

            <View style={styles.reminderRow}>
              <Text style={styles.reminderLabel}>Event reminder</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {REMINDER_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => updateSetting('reminder', opt)}
                    style={[styles.reminderChip, notifSettings.reminder === opt && styles.reminderChipActive]}
                  >
                    <Text style={[styles.reminderChipText, notifSettings.reminder === opt && styles.reminderChipTextActive]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </View>

        {/* View group */}
        <TouchableOpacity
          onPress={() => router.push(`/groups/${groupId}`)}
          style={styles.viewGroupBtn}
          activeOpacity={0.8}
        >
          <Text style={styles.viewGroupBtnText}>View Group</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: Colors.bg },
  headerCard:     { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 20 },
  groupThumb:     { width: 56, height: 56, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  groupName:      { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text },
  groupDesc:      { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.regular, marginTop: 4 },
  sectionLabel:   { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  card:           { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  colorSection:   { padding: 16 },
  colorDot:       { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  colorLabel:     { fontSize: 14, fontFamily: Fonts.medium, color: Colors.text },
  hexReadout:     { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.text, textAlign: 'center', marginTop: 12 },
  notifSection:   { padding: 16 },
  reminderRow:     { paddingVertical: 10, marginTop: 8 },
  reminderLabel:   { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, marginBottom: 8 },
  reminderChip:    { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  reminderChipActive:   { borderColor: Colors.accent, backgroundColor: Colors.accent },
  reminderChipText:     { fontSize: 12, color: Colors.textSub, fontFamily: Fonts.regular },
  reminderChipTextActive:{ color: Colors.accentFg, fontFamily: Fonts.semiBold },
  viewGroupBtn:   { paddingVertical: 14, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center' },
  viewGroupBtnText:{ fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text },
});
