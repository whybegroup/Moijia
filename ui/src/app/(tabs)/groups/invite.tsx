import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Fonts, Radius } from '../../../constants/theme';
import { NavBar } from '../../../components/ui';
import { useGroup } from '../../../hooks/api';
import { useCurrentUserContext } from '../../../contexts/CurrentUserContext';

export default function GroupInviteScreen() {
  const { id }    = useLocalSearchParams<{ id: string }>();
  const router    = useRouter();
  const { userId: currentUserId } = useCurrentUserContext();
  
  const groupId = Array.isArray(id) ? id[0] : id;

  if (!groupId) {
    return null;
  }

  const { data: group } = useGroup(groupId, currentUserId || '');

  const [copied,    setCopied]    = useState(false);
  const [newMember, setNewMember] = useState('');

  if (!group) {
    return null;
  }

  const inviteCode = group.id.toUpperCase().slice(0, 6);
  const inviteLink = `https://moijia.app/join/${group.id}`;

  const copyLink = async () => {
    await Clipboard.setStringAsync(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyMessage = async () => {
    await Clipboard.setStringAsync(
      `You're invited to ${group.name} on moijia!\n\nJoin here: ${inviteLink}\nOr use code: ${inviteCode}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareIMessage = () => {
      Linking.openURL(`sms:?body=${encodeURIComponent(`Join ${group.name} on moijia!\n\n${inviteLink}`)}`);
  };

  const shareEmail = () => {
    Linking.openURL(
      `mailto:?subject=${encodeURIComponent(`Join ${group.name} on moijia`)}&body=${encodeURIComponent(`You're invited!\n\n${inviteLink}`)}`
    );
  };

  const addMemberDirectly = () => {
    const n = newMember.trim();
    if (!n) return;
    // In real app: add to group via API
    setNewMember('');
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/groups');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <NavBar title="Invite People" onClose={handleBack} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>

        {/* Invite code */}
        <View style={styles.codeCard}>
          <Text style={styles.codeSectionLabel}>INVITE CODE</Text>
          <Text style={styles.codeText}>{inviteCode}</Text>
          <Text style={styles.codeDesc}>
            Share this code — {group.adminIds.includes(currentUserId) ? "they'll need admin approval to join" : 'admin will approve requests'}
          </Text>
        </View>

        {/* Invite link */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Invite Link</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <View style={styles.linkBox}>
              <Text style={styles.linkText} numberOfLines={1}>{inviteLink}</Text>
            </View>
            <TouchableOpacity
              onPress={copyLink}
              style={[styles.copyBtn, copied && styles.copyBtnCopied]}
            >
              <Text style={styles.copyBtnText}>{copied ? 'Copied!' : 'Copy'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Share options */}
        <View style={[styles.card, { padding: 0 }]}>
          {(
            [
              { ion: 'clipboard-outline' as const, label: 'Copy full invite message', action: copyMessage },
              { ion: 'chatbubble-outline' as const, label: 'Share via iMessage', action: shareIMessage },
              { ion: 'mail-outline' as const, label: 'Share via Email', action: shareEmail },
            ] as const
          ).map((item, i, arr) => (
            <TouchableOpacity
              key={i}
              onPress={item.action}
              style={[styles.shareRow, i < arr.length - 1 && styles.rowBorder]}
              activeOpacity={0.7}
            >
              <Ionicons name={item.ion} size={22} color={Colors.textSub} />
              <Text style={styles.shareLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Admin only: add by username */}
        {group.adminIds.includes(currentUserId) && (
          <View style={[styles.card, { padding: 14 }]}>
            <Text style={styles.cardTitle}>Add by username</Text>
            <Text style={styles.addDesc}>Admin only — adds directly without approval</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TextInput
                value={newMember}
                onChangeText={setNewMember}
                onSubmitEditing={addMemberDirectly}
                placeholder="Search by name"
                placeholderTextColor={Colors.textMuted}
                style={styles.addInput}
              />
              <TouchableOpacity
                onPress={addMemberDirectly}
                style={[styles.addBtn, !newMember.trim() && { backgroundColor: Colors.border }]}
                disabled={!newMember.trim()}
              >
                <Text style={[styles.addBtnText, !newMember.trim() && { color: Colors.textMuted }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: Colors.bg },
  codeCard:        { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 24, marginBottom: 16, alignItems: 'center' },
  codeSectionLabel:{ fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textMuted, letterSpacing: 0.8, marginBottom: 12 },
  codeText:        { fontSize: 42, fontFamily: Fonts.extraBold, color: Colors.text, letterSpacing: 8, marginBottom: 6 },
  codeDesc:        { fontSize: 13, color: Colors.textMuted, fontFamily: Fonts.regular, textAlign: 'center' },
  card:            { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 16 },
  cardTitle:       { fontSize: 13, fontFamily: Fonts.bold, color: Colors.text },
  linkBox:         { flex: 1, padding: 8, paddingHorizontal: 12, borderRadius: Radius.lg, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  linkText:        { fontSize: 13, color: Colors.textMuted, fontFamily: Fonts.regular },
  copyBtn:         { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  copyBtnCopied:   { backgroundColor: Colors.going },
  copyBtnText:     { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  shareRow:        { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  rowBorder:       { borderBottomWidth: 1, borderBottomColor: Colors.border },
  shareLabel:      { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
  addDesc:         { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular, marginTop: 4 },
  addInput:        { flex: 1, padding: 9, paddingHorizontal: 14, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
  addBtn:          { paddingHorizontal: 16, paddingVertical: 9, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  addBtnText:      { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
});
