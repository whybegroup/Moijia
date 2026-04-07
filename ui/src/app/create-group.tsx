import { useState, useRef } from 'react';
import * as Crypto from 'expo-crypto';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Radius } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, groupAvatarBorderRadius } from '../utils/helpers';
import { NavBar, Field, formSectionTitleStyle } from '../components/ui';
import { useCreateGroup } from '../hooks/api/useGroups';
import { useAuth } from '../contexts/AuthContext';
import { GroupAvatar } from '../components/GroupAvatar';
import { AvatarPickerModal } from '../components/AvatarPickerModal';
import type { PendingAvatarFile } from '../services/pickAndUploadImage';
import { uploadPendingAvatarFile } from '../services/pickAndUploadImage';
import { ResolvableImage } from '../components/ResolvableImage';
import { pickAndUploadCoverPhoto } from '../services/pickAndUploadImage';

const DEFAULT_AVATAR_SEED = 'auto';
const AVATAR_SIZE = 56;

export default function CreateGroupScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const createGroup = useCreateGroup();
  const [groupId] = useState(() => Crypto.randomUUID());

  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [draftSeed, setDraftSeed] = useState('');
  const [draftThumbnail, setDraftThumbnail] = useState<string | null>(null);
  const [draftCoverPhotos, setDraftCoverPhotos] = useState<string[]>([]);
  const [coverPhotoBusy, setCoverPhotoBusy] = useState(false);
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

  const addCoverPhotoFromPicker = async () => {
    if (!user?.uid || coverPhotoBusy) return;
    setCoverPhotoBusy(true);
    try {
      const url = await pickAndUploadCoverPhoto(user.uid);
      if (url) setDraftCoverPhotos((prev) => [...prev, url]);
    } finally {
      setCoverPhotoBusy(false);
    }
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
        thumbnail,
        coverPhotos: draftCoverPhotos,
        superAdminId: user.uid,
        avatarSeed: draftSeed || draftName.trim() || undefined,
        createdBy: user.uid,
        adminIds: [user.uid],
        memberIds: [user.uid],
      });

      router.replace(`/groups/${newGroup.id}`);
    } catch {
      Alert.alert('Error', 'Failed to create group. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <NavBar
        title="New Group"
        onBack={handleBack}
        centerTitle
        right={
          <TouchableOpacity
            onPress={() => void handleCreate()}
            disabled={!valid || createGroup.isPending}
            style={[styles.navCreateBtn, (!valid || createGroup.isPending) && styles.navCreateBtnDisabled]}
            activeOpacity={0.8}
          >
            {createGroup.isPending ? (
              <ActivityIndicator size="small" color={Colors.textMuted} />
            ) : (
              <Text style={[styles.navCreateBtnText, !valid && { color: Colors.textMuted }]} numberOfLines={1}>
                Create
              </Text>
            )}
          </TouchableOpacity>
        }
      />

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

          <Field label="Description">
            <View style={styles.descBox}>
              <TextInput
                value={draftDesc}
                onChangeText={setDraftDesc}
                placeholder="What's this group about?"
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={5}
                style={styles.descInput}
              />
              <View style={styles.descToolbar}>
                <Text style={{ fontSize: 11, color: Colors.textMuted }}>{draftDesc.length}/500</Text>
              </View>
            </View>
          </Field>
        </View>

        <View style={styles.photosSectionLower}>
          <Text style={formSectionTitleStyle}>
            Photos{draftCoverPhotos.length > 0 ? ` · ${draftCoverPhotos.length}` : ''}
          </Text>
          <Text style={styles.photosHint}>Optional — saved when you create the group.</Text>
          <View style={styles.photosCard}>
            {draftCoverPhotos.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ borderBottomWidth: 1, borderBottomColor: Colors.border }}
                contentContainerStyle={{ gap: 4, padding: 10 }}
              >
                {draftCoverPhotos.map((uri, i) => (
                  <View key={`${uri}-${i}`} style={{ position: 'relative' }}>
                    <ResolvableImage
                      storedUrl={uri}
                      style={{ width: 80, height: 80, borderRadius: Radius.lg }}
                      resizeMode="cover"
                    />
                    <TouchableOpacity
                      onPress={() => setDraftCoverPhotos(draftCoverPhotos.filter((_, j) => j !== i))}
                      style={styles.removeThumb}
                    >
                      <Ionicons name="close" size={11} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={[styles.photosToolbar, draftCoverPhotos.length === 0 && { borderTopWidth: 0 }]}>
              <TouchableOpacity
                onPress={() => void addCoverPhotoFromPicker()}
                style={styles.photoBtn}
                disabled={coverPhotoBusy}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  {coverPhotoBusy ? (
                    <ActivityIndicator size="small" color={Colors.textSub} />
                  ) : (
                    <Ionicons name="camera-outline" size={16} color={Colors.textSub} />
                  )}
                  <Text style={{ fontSize: 12, color: Colors.textSub, fontFamily: Fonts.medium }}>Add photo</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={{ height: 100 }} />
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
  descBox:         { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.border, overflow: 'hidden' },
  descInput:       { padding: 12, paddingHorizontal: 14, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, minHeight: 100, textAlignVertical: 'top' },
  descToolbar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', padding: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  navCreateBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    flexShrink: 0,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCreateBtnDisabled: {
    backgroundColor: Colors.border,
  },
  navCreateBtnText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: Colors.accentFg,
  },
  photosSectionLower: {
    paddingHorizontal: 20,
    marginTop: 14,
    paddingTop: 22,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  photosHint: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    marginBottom: 10,
    lineHeight: 18,
  },
  photosCard:      { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  photosToolbar:   { flexDirection: 'row', alignItems: 'center', padding: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  photoBtn:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  removeThumb:     { position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.text, borderWidth: 2, borderColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
});
