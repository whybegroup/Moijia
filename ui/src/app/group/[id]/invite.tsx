import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Linking, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Colors, Fonts, Radius } from '../../../constants/theme';
import { NavBar } from '../../../components/ui';
import { useGroup } from '../../../hooks/api';

const ME_ID = 'u1';

export default function GroupInviteScreen() {
  const { id }     = useLocalSearchParams<{ id: string }>();
  const router     = useRouter();
  
  const groupId = Array.isArray(id) ? id[0] : id;

  if (!groupId) {
    return null;
  }

  const { data: group, isLoading } = useGroup(groupId);
  const [copied,   setCopied]   = useState(false);
  const [newUser,  setNewUser]  = useState('');
  const [added,    setAdded]    = useState<string[]>([]);

  if (!group) {
    return null;
  }

  const inviteCode = groupId.toUpperCase().slice(0, 6);
  const inviteLink = `https://popin.app/join/${groupId}`;
  const inviteMsg  = `You're invited to ${group.name} on Popin!\n\nJoin here: ${inviteLink}\nOr use code: ${inviteCode}`;

  const copyLink = async () => {
    await Clipboard.setStringAsync(inviteLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyMsg = async () => {
    await Clipboard.setStringAsync(inviteMsg).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareIMessage = () => {
    const url = `sms:&body=${encodeURIComponent(`Join ${group.name} on Popin!\n\n${inviteLink}`)}`;
    Linking.openURL(url).catch(() => {});
  };

  const shareEmail = () => {
    const url = `mailto:?subject=${encodeURIComponent(`Join ${group.name} on Popin`)}&body=${encodeURIComponent(inviteMsg)}`;
    Linking.openURL(url).catch(() => {});
  };

  const shareNative = async () => {
    await Share.share({ message: inviteMsg, url: inviteLink }).catch(() => {});
  };

  const addUser = () => {
    const n = newUser.trim();
    if (!n || added.includes(n)) return;
    setAdded(p => [...p, n]);
    setNewUser('');
  };

  const SHARE_OPTIONS = [
    { icon: '📋', label: 'Copy full invite message', action: copyMsg },
    { icon: '💬', label: 'Share via iMessage',       action: shareIMessage },
    { icon: '📧', label: 'Share via Email',           action: shareEmail },
    { icon: '↗️', label: 'Share…',                    action: shareNative },
  ];

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push(`/`);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <NavBar title="Invite People" onBack={handleBack} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>

        {/* Invite code */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabelText}>INVITE CODE</Text>
          <Text style={styles.codeText}>{inviteCode}</Text>
          <Text style={styles.codeDesc}>
            {group.adminIds.includes(ME_ID)
              ? 'Share this code — requests will need your approval'
              : 'Share this code to let people request to join'}
          </Text>
        </View>

        {/* Invite link */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Invite Link</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={styles.linkBox}>
              <Text style={styles.linkText} numberOfLines={1}>{inviteLink}</Text>
            </View>
            <TouchableOpacity onPress={copyLink}
              style={[styles.copyBtn, copied && { backgroundColor: Colors.going }]}>
              <Text style={[styles.copyBtnText, copied && { color: '#fff' }]}>
                {copied ? 'Copied!' : 'Copy'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Share options */}
        <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
          {SHARE_OPTIONS.map((opt, i) => (
            <TouchableOpacity
              key={i}
              onPress={opt.action}
              style={[styles.shareRow, i < SHARE_OPTIONS.length - 1 && styles.rowBorder]}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 20 }}>{opt.icon}</Text>
              <Text style={styles.shareLabel}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Admin-only: add by username */}
        {group.adminIds.includes(ME_ID) && (
          <>
            <Text style={styles.sectionLabel}>ADD BY USERNAME</Text>
            <View style={[styles.card, { padding: 16 }]}>
              <Text style={styles.addDesc}>Admin only — adds directly without approval</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={newUser} onChangeText={setNewUser} onSubmitEditing={addUser}
                  placeholder="@handle or username"
                  placeholderTextColor={Colors.textMuted}
                  style={[styles.addInput, { flex: 1 }]}
                />
                <TouchableOpacity onPress={addUser}
                  style={[styles.addBtn, !newUser.trim() && { backgroundColor: Colors.border }]}>
                  <Text style={[styles.addBtnText, !newUser.trim() && { color: Colors.textMuted }]}>Add</Text>
                </TouchableOpacity>
              </View>
              {added.length > 0 && (
                <View style={{ marginTop: 12, gap: 6 }}>
                  {added.map((u, i) => (
                    <View key={i} style={styles.addedRow}>
                      <Text style={styles.addedName}>{u}</Text>
                      <Text style={[styles.addedBadge]}>Added ✓</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: Colors.bg },
  codeCard:       { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 24, marginBottom: 16, alignItems: 'center' },
  codeLabelText:  { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textMuted, letterSpacing: 0.8, marginBottom: 12 },
  codeText:       { fontSize: 40, fontFamily: Fonts.extraBold, color: Colors.text, letterSpacing: 8, marginBottom: 8 },
  codeDesc:       { fontSize: 13, color: Colors.textMuted, fontFamily: Fonts.regular, textAlign: 'center' },
  card:           { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 16 },
  cardTitle:      { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.text, marginBottom: 10 },
  linkBox:        { flex: 1, backgroundColor: Colors.bg, borderRadius: Radius.lg, padding: 9, paddingHorizontal: 12 },
  linkText:       { fontSize: 13, color: Colors.textMuted, fontFamily: Fonts.regular },
  copyBtn:        { paddingHorizontal: 16, paddingVertical: 9, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  copyBtnText:    { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  shareRow:       { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  rowBorder:      { borderBottomWidth: 1, borderBottomColor: Colors.border },
  shareLabel:     { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
  sectionLabel:   { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  addDesc:        { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular, marginBottom: 10 },
  addInput:       { padding: 9, paddingHorizontal: 14, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
  addBtn:         { paddingHorizontal: 16, paddingVertical: 9, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  addBtnText:     { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  addedRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  addedName:      { fontSize: 13, color: Colors.text, fontFamily: Fonts.medium },
  addedBadge:     { fontSize: 12, color: Colors.going, fontFamily: Fonts.semiBold },
});
