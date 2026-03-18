import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, Radius } from '../../constants/theme';
import { getGroupColor } from '../../utils/helpers';
import { useGroups, useAllGroupMemberColors } from '../../hooks/api';

const ME_ID = 'u1';

function defaultGroupAvatarUri(groupId: string): string {
  return `https://api.dicebear.com/8.x/bottts/png?seed=${encodeURIComponent(groupId)}&size=256&backgroundType=gradientLinear`;
}

export default function ExploreScreen() {
  const [query,  setQuery]  = useState('');
  const [code,   setCode]   = useState('');
  const [joined, setJoined] = useState<string[]>([]);

  const { data: groups = [], isLoading: loading } = useGroups();
  const { data: groupColors = {} } = useAllGroupMemberColors(ME_ID);

  const results = groups.filter(g =>
    g.isPublic && (!query || g.name.toLowerCase().includes(query.toLowerCase()) || g.desc.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Explore Groups</Text>
        <TextInput
          value={query} onChangeText={setQuery}
          placeholder="Search groups…" placeholderTextColor={Colors.textMuted}
          style={styles.searchInput}
        />
      </View>

      {(
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* Join by code */}
        <View style={styles.codeCard}>
          <Text style={styles.codeTitle}>Join with invite code</Text>
          <Text style={styles.codeDesc}>Got an invite link or code? Enter it here.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={code} onChangeText={setCode}
              placeholder="Enter invite code" placeholderTextColor={Colors.textMuted}
              style={[styles.codeInput, { flex: 1 }]}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={[styles.joinBtn, { opacity: code.trim() ? 1 : 0.4 }]}
              disabled={!code.trim()}
            >
              <Text style={styles.joinBtnText}>Join</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Results */}
        <Text style={styles.sectionLabel}>{query ? `Results for "${query}"` : 'Public Groups'}</Text>
        <View style={styles.card}>
          {results.map((g, i) => {
            const userColorHex = groupColors[g.id] || '#EC4899';
            const p = getGroupColor(userColorHex);
            const isJoined = joined.includes(g.id);
            return (
              <View key={g.id} style={[styles.row, i < results.length - 1 && styles.rowBorder]}>
                <Image 
                  source={{ uri: g.thumbnail || defaultGroupAvatarUri(g.id) }} 
                  style={[styles.groupIcon, { backgroundColor: p.row, borderColor: p.cal }]} 
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.groupName}>{g.name}</Text>
                  <Text style={styles.groupDesc} numberOfLines={1}>{g.desc}</Text>
                  <Text style={styles.groupMeta}>{g.memberIds.length} members</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setJoined(p => isJoined ? p.filter(x => x !== g.id) : [...p, g.id])}
                  style={[styles.joinGroupBtn, isJoined && styles.joinGroupBtnJoined]}
                >
                  <Text style={[styles.joinGroupBtnText, isJoined && styles.joinGroupBtnTextJoined]}>
                    {isJoined ? 'Joined ✓' : 'Join'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
          {results.length === 0 && (
            <View style={{ padding: 32, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: Colors.textMuted, fontFamily: Fonts.regular }}>No groups found</Text>
            </View>
          )}
        </View>
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: Colors.bg },
  header:             { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, padding: 20 },
  title:              { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text, marginBottom: 14 },
  searchInput:        { padding: 10, paddingHorizontal: 14, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
  codeCard:           { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 20 },
  codeTitle:          { fontSize: 14, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 4 },
  codeDesc:           { fontSize: 13, color: Colors.textMuted, fontFamily: Fonts.regular, marginBottom: 12 },
  codeInput:          { padding: 9, paddingHorizontal: 14, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
  joinBtn:            { paddingHorizontal: 18, paddingVertical: 9, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  joinBtnText:        { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  sectionLabel:       { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  card:               { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  row:                { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  rowBorder:          { borderBottomWidth: 1, borderBottomColor: Colors.border },
  groupIcon:          { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  groupName:          { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text, marginBottom: 1 },
  groupDesc:          { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular, marginBottom: 2 },
  groupMeta:          { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.regular },
  joinGroupBtn:       { paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.accent, backgroundColor: Colors.accent, flexShrink: 0 },
  joinGroupBtnJoined: { borderColor: Colors.border, backgroundColor: Colors.surface },
  joinGroupBtnText:       { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  joinGroupBtnTextJoined: { color: Colors.textSub },
});
