import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Radius } from '../../constants/theme';
import { getGroupColor, avatarColor } from '../../utils/helpers';
import { useGroups, useEvents, useUser, useAllGroupMemberColors } from '../../hooks/api';
import { Toggle } from '../../components/ui';

// TODO: Replace with actual user authentication
const ME_ID = 'u1';

function defaultGroupAvatarUri(groupId: string): string {
  return `https://api.dicebear.com/8.x/bottts/png?seed=${encodeURIComponent(groupId)}&size=256&backgroundType=gradientLinear`;
}

const REMINDER_OPTIONS = ['Never', '1 hour before', '1 day before', '1 week before'];

export default function ProfileScreen() {
  const router = useRouter();

  const { data: groups = [], isLoading: groupsLoading } = useGroups();
  const { data: events = [], isLoading: eventsLoading } = useEvents();
  const { data: me = null, isLoading: meLoading } = useUser(ME_ID);
  const { data: groupColors = {}, isLoading: colorsLoading } = useAllGroupMemberColors(ME_ID);

  const loading = groupsLoading || eventsLoading || meLoading || colorsLoading;

  const myEvents = events.filter(e => e.rsvps.some(r => r.userId === ME_ID && r.status === 'going'));

  const [notifSettings, setNotifSettings] = useState<Record<string, any>>(
    {}
  );

  useEffect(() => {
    if (groups.length > 0) {
      setNotifSettings(
        Object.fromEntries(groups.map(g => [g.id, {
          newEvent: true, minAttendees: true,
          reminder: '1 hour before',
          onLocation: false, onTime: true, onRsvp: false,
        }]))
      );
    }
  }, [groups.length]);

  const updateSetting = (groupId: string, key: string, value: any) => {
    setNotifSettings(p => ({ ...p, [groupId]: { ...p[groupId], [key]: value } }));
  };

  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  if (!me) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <TouchableOpacity style={styles.editBtn}>
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* User card */}
        <View style={styles.userCard}>
          <View style={[styles.bigAvatar, { backgroundColor: avatarColor(me.name) }]}>
            <Text style={styles.bigAvatarText}>{me.name[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{me.name}</Text>
            <Text style={styles.userHandle}>@{me.handle}</Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{groups.length}</Text>
                <Text style={styles.statLabel}>Groups</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{myEvents.length}</Text>
                <Text style={styles.statLabel}>Events</Text>
              </View>
            </View>
          </View>
        </View>

        {/* My groups */}
        <Text style={styles.sectionLabel}>MY GROUPS</Text>
        <View style={[styles.card, { marginBottom: 20 }]}>
          {groups.map((g, i) => {
            const userColorHex = groupColors[g.id] || '#EC4899';
            const p = getGroupColor(userColorHex);
            return (
              <TouchableOpacity
                key={g.id}
                onPress={() => router.push(`/group/${g.id}`)}
                style={[styles.groupRow, i < groups.length - 1 && styles.rowBorder]}
                activeOpacity={0.7}
              >
                <Image 
                  source={{ uri: g.thumbnail || defaultGroupAvatarUri(g.id) }} 
                  style={[styles.groupIcon, { backgroundColor: p.row, borderColor: p.cal }]} 
                />
                <Text style={styles.groupName}>{g.name}</Text>
                <Text style={{ color: Colors.textMuted, fontSize: 16 }}>›</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Notification settings */}
        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
        <View style={styles.card}>
          {groups.map((g, i) => {
            const s = notifSettings[g.id];
            const isExpanded = expandedGroup === g.id;
            return (
              <View key={g.id} style={i < groups.length - 1 && styles.rowBorder}>
                <TouchableOpacity
                  onPress={() => setExpandedGroup(x => x === g.id ? null : g.id)}
                  style={styles.notifGroupRow}
                  activeOpacity={0.7}
                >
                  <Image 
                    source={{ uri: g.thumbnail || defaultGroupAvatarUri(g.id) }} 
                    style={{ width: 28, height: 28, borderRadius: 8 }} 
                  />
                  <Text style={styles.groupName}>{g.name}</Text>
                  <Text style={{ color: Colors.textMuted, fontSize: 13 }}>{isExpanded ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.notifExpanded}>
                    <Toggle value={s.newEvent} onChange={v => updateSetting(g.id, 'newEvent', v)} label="New event alerts" />
                    <Toggle value={s.minAttendees} onChange={v => updateSetting(g.id, 'minAttendees', v)} label="Min attendees alerts" />
                    <Toggle value={s.onLocation} onChange={v => updateSetting(g.id, 'onLocation', v)} label="Location changes" />
                    <Toggle value={s.onTime} onChange={v => updateSetting(g.id, 'onTime', v)} label="Time changes" />
                    <Toggle value={s.onRsvp} onChange={v => updateSetting(g.id, 'onRsvp', v)} label="RSVP updates" />

                    {/* Reminder dropdown */}
                    <View style={styles.reminderRow}>
                      <Text style={styles.reminderLabel}>Event reminder</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                        {REMINDER_OPTIONS.map(opt => (
                          <TouchableOpacity
                            key={opt}
                            onPress={() => updateSetting(g.id, 'reminder', opt)}
                            style={[styles.reminderChip, s.reminder === opt && styles.reminderChipActive]}
                          >
                            <Text style={[styles.reminderChipText, s.reminder === opt && styles.reminderChipTextActive]}>
                              {opt}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: Colors.bg },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title:            { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text },
  editBtn:          { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border },
  editBtnText:      { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textSub },
  userCard:         { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 20, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 16 },
  bigAvatar:        { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bigAvatarText:    { fontSize: 24, fontFamily: Fonts.bold, color: '#fff' },
  userName:         { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text, marginBottom: 2 },
  userHandle:       { fontSize: 14, color: Colors.textMuted, fontFamily: Fonts.regular, marginBottom: 8 },
  statsRow:         { flexDirection: 'row', gap: 16 },
  stat:             { alignItems: 'center' },
  statNum:          { fontSize: 16, fontFamily: Fonts.bold, color: Colors.text },
  statLabel:        { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.regular },
  sectionLabel:     { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  card:             { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  groupRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  rowBorder:        { borderBottomWidth: 1, borderBottomColor: Colors.border },
  groupIcon:        { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  groupName:        { flex: 1, fontSize: 14, fontFamily: Fonts.medium, color: Colors.text },
  notifGroupRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  notifExpanded:    { paddingHorizontal: 16, paddingBottom: 8 },
  reminderRow:      { paddingVertical: 10 },
  reminderLabel:    { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, marginBottom: 8 },
  reminderChip:     { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  reminderChipActive:   { borderColor: Colors.accent, backgroundColor: Colors.accent },
  reminderChipText:     { fontSize: 12, color: Colors.textSub, fontFamily: Fonts.regular },
  reminderChipTextActive:{ color: Colors.accentFg, fontFamily: Fonts.semiBold },
  signOutBtn:       { marginTop: 20, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  signOutText:      { fontSize: 14, color: Colors.textSub, fontFamily: Fonts.regular },
});
