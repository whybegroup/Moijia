import React, { useState, useRef } from 'react';
import * as Crypto from 'expo-crypto';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Radius } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, groupAvatarBorderRadius } from '../utils/helpers';
import { NavBar, Toggle } from '../components/ui';
import { useCreateGroup } from '../hooks/api/useGroups';
import { useAuth } from '../contexts/AuthContext';
import { GroupAvatar } from '../components/GroupAvatar';
import { AvatarPickerModal } from '../components/AvatarPickerModal';
import type { PendingAvatarFile } from '../services/pickAndUploadImage';
import { uploadPendingAvatarFile } from '../services/pickAndUploadImage';

const DEFAULT_AVATAR_SEED = 'auto';
const AVATAR_SIZE = 56;

export default function CreateGroupScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const createGroup = useCreateGroup(user?.uid ?? '');
  const [groupId] = useState(() => Crypto.randomUUID());

  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [draftSeed, setDraftSeed] = useState('');
  const [draftThumbnail, setDraftThumbnail] = useState<string | null>(null);
  const [draftIsPublic, setDraftIsPublic] = useState(true);
  const valid = !!draftName.trim();

  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const pendingAvatarFileRef = useRef<PendingAvatarFile | null>(null);
  const createAvatarSnapshotRef = useRef<{ thumbnail: string | null; seed: string } | null>(null);

  const openAvatarPicker = () => {
    createAvatarSnapshotRef.current = { thumbnail: draftThumbnail, seed: draftSeed };
    setShowAvatarPicker(true);
  };

  const closeAvatarPicker = () => {
    const snap = createAvatarSnapshotRef.current;
    if (snap) {
      setDraftThumbnail(snap.thumbnail);
      setDraftSeed(snap.seed);
    }
    const p = pendingAvatarFileRef.current;
    if (p?.kind === 'web') URL.revokeObjectURL(p.objectUrl);
    pendingAvatarFileRef.current = null;
    setShowAvatarPicker(false);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push('/(tabs)/groups');
    }
  };

  const handleCreate = async () => {
    if (!valid || !user) return;

    try {
      let thumbnail = draftThumbnail;
      if (pendingAvatarFileRef.current) {
        const p = pendingAvatarFileRef.current;
        thumbnail = await uploadPendingAvatarFile(user.uid, p);
        if (p.kind === 'web') URL.revokeObjectURL(p.objectUrl);
        pendingAvatarFileRef.current = null;
        setDraftThumbnail(thumbnail);
      }

      const newGroup = await createGroup.mutateAsync({
        id: groupId,
        name: draftName.trim(),
        desc: draftDesc.trim(),
        isPublic: draftIsPublic,
        thumbnail,
        superAdminId: user.uid,
        avatarSeed: draftSeed || draftName.trim() || undefined,
        createdBy: user.uid,
        adminIds: [user.uid],
        memberIds: [user.uid],
      });

      // Navigate to the new group
      router.replace(`/groups/${newGroup.id}`);
    } catch {
      Alert.alert('Error', 'Failed to create group. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <NavBar title="New Group" onBack={handleBack} />

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.headerBlock, { borderBottomColor: Colors.border }]}>
          <View style={styles.avatarNameRow}>
            <TouchableOpacity
              onPress={openAvatarPicker}
              style={[
                styles.groupThumb,
                {
                  backgroundColor: getGroupColor(getDefaultGroupThemeFromName(draftName || 'Group')).row,
                  borderColor: getGroupColor(getDefaultGroupThemeFromName(draftName || 'Group')).cal,
                  borderRadius: groupAvatarBorderRadius(AVATAR_SIZE),
                },
              ]}
              activeOpacity={0.8}
            >
              <GroupAvatar
                seed={draftSeed || DEFAULT_AVATAR_SEED}
                thumbnail={draftThumbnail}
                size={AVATAR_SIZE}
                style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
              />
            </TouchableOpacity>
            <View style={styles.nameFieldWrap}>
              <TextInput
                value={draftName}
                onChangeText={(text) => {
                  setDraftName(text);
                  if (text) {
                    setDraftSeed(text);
                  } else {
                    setDraftSeed(DEFAULT_AVATAR_SEED);
                  }
                }}
                placeholder="Group name"
                placeholderTextColor={Colors.textMuted}
                style={styles.nameInput}
                autoCorrect={false}
              />
            </View>
          </View>
          <TextInput
            value={draftDesc}
            onChangeText={setDraftDesc}
            placeholder="Description"
            placeholderTextColor={Colors.textMuted}
            style={styles.descInputFull}
            multiline
          />

          <View style={styles.inviteSection}>
            <View style={[styles.inviteRow, styles.inviteToggleRow, { borderTopWidth: 1, borderTopColor: Colors.border }]}>
              <Toggle
                value={!draftIsPublic}
                onChange={(v) => setDraftIsPublic(!v)}
                label="Private group (invite only)"
                style={{ borderBottomWidth: 0 }}
              />
            </View>
          </View>
        </View>

        <View style={{ padding: 16, paddingBottom: 100 }}>
          <TouchableOpacity
            onPress={handleCreate}
            disabled={!valid || createGroup.isPending}
            style={[styles.saveBtn, (!valid || createGroup.isPending) && styles.saveBtnDisabled]}
            activeOpacity={0.8}
          >
            {createGroup.isPending ? (
              <ActivityIndicator size="small" color={Colors.textMuted} />
            ) : (
              <Text style={[styles.saveBtnText, !valid && { color: Colors.textMuted }]}>Create</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <AvatarPickerModal
        variant="group"
        visible={showAvatarPicker}
        onRequestClose={closeAvatarPicker}
        seed={draftSeed}
        onSeedChange={setDraftSeed}
        thumbnail={draftThumbnail}
        onThumbnailChange={setDraftThumbnail}
        userId={user?.uid ?? ''}
        deferFileUpload
        pendingAvatarFileRef={pendingAvatarFileRef}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: Colors.bg },
  headerBlock:     { backgroundColor: Colors.surface, padding: 20, borderBottomWidth: 1 },
  avatarNameRow:   { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  groupThumb:      { width: AVATAR_SIZE, height: AVATAR_SIZE, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  nameFieldWrap:   { flex: 1, minWidth: 0, height: AVATAR_SIZE, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: Colors.border },
  nameInput:       {
    width: '100%',
    paddingVertical: Platform.OS === 'ios' ? 10 : 0,
    paddingHorizontal: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    fontSize: 19,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    textAlignVertical: 'center',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' as any, outlineWidth: 0 } as any) : null),
  },
  descInputFull:   {
    width: '100%',
    minHeight: 88,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: 'transparent',
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.text,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' as any, outlineWidth: 0 } as any) : null),
  },
  inviteSection:   { marginTop: 12, paddingBottom: 8 },
  inviteRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 0, borderTopWidth: 1, borderTopColor: Colors.border },
  inviteToggleRow: { paddingVertical: 4 },
  saveBtn:         { paddingVertical: 12, borderRadius: Radius.lg, backgroundColor: Colors.accent, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: Colors.border },
  saveBtnText:     { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
});
