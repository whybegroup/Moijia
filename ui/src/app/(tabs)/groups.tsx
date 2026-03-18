import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Radius } from '../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName } from '../../utils/helpers';
import { useGroups, useEvents, useAllGroupMemberColors } from '../../hooks/api';

const ME_ID = 'u1';

function defaultGroupAvatarUri(groupId: string): string {
  return `https://api.dicebear.com/8.x/bottts/png?seed=${encodeURIComponent(groupId)}&size=256&backgroundType=gradientLinear`;
}

export default function GroupsScreen() {
  const router = useRouter();
  const { data: groups = [], isLoading: groupsLoading } = useGroups();
  const { data: events = [], isLoading: eventsLoading } = useEvents();
  const { data: groupColors = {}, isLoading: colorsLoading } = useAllGroupMemberColors(ME_ID);
  
  const loading = groupsLoading || eventsLoading || colorsLoading;

  // Removed loading state

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>My Groups</Text>
        <TouchableOpacity onPress={() => router.push('/create-group')} style={styles.createBtn}>
          <Text style={styles.createBtnText}>+ Group</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <View style={styles.card}>
          {groups.map((g, i) => {
            const userColorHex = groupColors[g.id] || getDefaultGroupThemeFromName(g.name);
            const p = getGroupColor(userColorHex);
            const evCount = events.filter(e => {
              const start = new Date(e.start);
              return e.groupId === g.id && start >= new Date();
            }).length;
            return (
              <TouchableOpacity
                key={g.id}
                onPress={() => router.push(`/group/${g.id}`)}
                style={[styles.row, i < groups.length - 1 && styles.rowBorder]}
                activeOpacity={0.7}
              >
                <Image 
                  source={{ uri: g.thumbnail || defaultGroupAvatarUri(g.id) }} 
                  style={[styles.groupIcon, { backgroundColor: p.row, borderColor: p.cal }]} 
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.groupName}>{g.name}</Text>
                  <Text style={styles.groupMeta}>
                    {g.memberIds.length} members{evCount > 0 ? ` · ${evCount} upcoming` : ''}{g.adminIds.includes(ME_ID) ? ' · Admin' : ''}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {g.adminIds.includes(ME_ID) && (
                    <View style={styles.adminBadge}>
                      <Text style={styles.adminBadgeText}>Admin</Text>
                    </View>
                  )}
                  <Text style={{ color: Colors.textMuted, fontSize: 18 }}>›</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: Colors.bg },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title:          { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text },
  createBtn:      { paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  createBtnText:  { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  card:           { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  row:            { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  rowBorder:      { borderBottomWidth: 1, borderBottomColor: Colors.border },
  groupIcon:      { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  groupName:      { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text, marginBottom: 2 },
  groupMeta:      { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular },
  adminBadge:     { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  adminBadgeText: { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textSub },
});
