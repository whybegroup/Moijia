import { useState, useRef, useMemo, useCallback } from 'react';
import * as Crypto from 'expo-crypto';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Radius } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, groupAvatarBorderRadius } from '../utils/helpers';
import { NavBar, formSectionTitleStyle, Avatar, Toggle } from '../components/ui';
import { EventFormPopoverChrome } from '../components/EventFormPopoverChrome';
import { useCreateGroup } from '../hooks/api/useGroups';
import { useAuth } from '../contexts/AuthContext';
import { GroupAvatar } from '../components/GroupAvatar';
import { AvatarPickerModal } from '../components/AvatarPickerModal';
import type { PendingAvatarFile } from '../services/pickAndUploadImage';
import { uploadPendingAvatarFile } from '../services/pickAndUploadImage';
import { ResolvableImage } from '../components/ResolvableImage';
import { pickAndUploadCoverPhoto } from '../services/pickAndUploadImage';
import { firstSearchParam, parseReturnToParam } from '../utils/navigationReturn';

const DEFAULT_AVATAR_SEED = 'auto';
const AVATAR_SIZE = 56;
const DEFAULT_REQUIRE_APPROVAL = true;

export default function CreateGroupScreen() {
  const router = useRouter();
  const { returnTo: returnToRaw } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const groupReturnTo = parseReturnToParam(firstSearchParam(returnToRaw));
  const { user } = useAuth();
  const createGroup = useCreateGroup();
  const [groupId] = useState(() => Crypto.randomUUID());

  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [draftSeed, setDraftSeed] = useState('');
  const [draftThumbnail, setDraftThumbnail] = useState<string | null>(null);
  const [draftCoverPhotos, setDraftCoverPhotos] = useState<string[]>([]);
  const [coverPhotoBusy, setCoverPhotoBusy] = useState(false);
  const [groupPhotoLightbox, setGroupPhotoLightbox] = useState<{ urls: string[]; index: number } | null>(
    null,
  );
  const [requireApprovalToJoin, setRequireApprovalToJoin] = useState(DEFAULT_REQUIRE_APPROVAL);
  const valid = !!draftName.trim();

  const settingsDirty = requireApprovalToJoin !== DEFAULT_REQUIRE_APPROVAL;

  const createFormDirty = useMemo(
    () =>
      !!(
        draftName.trim() ||
        draftDesc.trim() ||
        draftCoverPhotos.length > 0 ||
        draftThumbnail != null ||
        settingsDirty
      ),
    [draftName, draftDesc, draftCoverPhotos.length, draftThumbnail, settingsDirty],
  );

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

  const resetCreateForm = useCallback(() => {
    setDraftName('');
    setDraftDesc('');
    setDraftSeed('');
    setDraftThumbnail(null);
    setDraftCoverPhotos([]);
    setRequireApprovalToJoin(DEFAULT_REQUIRE_APPROVAL);
    const p = pendingAvatarFileRef.current;
    if (p?.kind === 'web') URL.revokeObjectURL(p.objectUrl);
    pendingAvatarFileRef.current = null;
  }, []);

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
    if (Platform.OS !== 'web' && router.canGoBack()) {
      router.back();
      return;
    }
    if (groupReturnTo) {
      router.replace(groupReturnTo as Href);
      return;
    }
    router.push('/(tabs)/groups');
  };

  const requestClose = useCallback(() => {
    if (!createFormDirty) {
      handleBack();
      return;
    }
    const message = 'Discard your changes?';
    if (Platform.OS === 'web') {
      if (window.confirm(message)) handleBack();
      return;
    }
    Alert.alert('Discard changes?', message, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: handleBack },
    ]);
  }, [createFormDirty, handleBack]);

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

      await createGroup.mutateAsync({
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
        requireApprovalToJoin,
      });

      handleBack();
    } catch {
      Alert.alert('Error', 'Failed to create group. Please try again.');
    }
  };

  const coverPhotosForDisplay = draftCoverPhotos;
  const themeName = draftName.trim() || 'Group';

  const groupPhotosBlock = (
    <View style={{ marginTop: 10, marginBottom: 0 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <Text style={formSectionTitleStyle}>
          Photos{coverPhotosForDisplay.length > 0 ? ` · ${coverPhotosForDisplay.length}` : ''}
        </Text>
      </View>
      {coverPhotosForDisplay.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: Colors.border,
          }}
          contentContainerStyle={{ gap: 4, paddingVertical: 10, paddingHorizontal: 16 }}
        >
          {coverPhotosForDisplay.map((uri, i) => (
            <View key={`${uri}-${i}`} style={{ position: 'relative' }}>
              <TouchableOpacity
                onPress={() => setGroupPhotoLightbox({ urls: coverPhotosForDisplay, index: i })}
                activeOpacity={0.9}
              >
                <ResolvableImage
                  storedUrl={uri}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: Radius.lg,
                    backgroundColor: Colors.bg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: Colors.border,
                  }}
                  resizeMode="cover"
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setDraftCoverPhotos((prev) => prev.filter((_, j) => j !== i))}
                style={styles.coverRemoveThumb}
              >
                <Ionicons name="close" size={11} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <View
        style={{
          paddingHorizontal: 16,
          marginTop: coverPhotosForDisplay.length > 0 ? 4 : 0,
          marginBottom: 16,
        }}
      >
        <View style={[styles.groupPhotosAddCard, styles.groupPhotosAddCardNested]}>
          <TouchableOpacity
            onPress={() => void addCoverPhotoFromPicker()}
            style={styles.groupPhotosAddBtn}
            disabled={coverPhotoBusy}
            activeOpacity={0.85}
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
  );

  const displayNameForChrome = draftName.trim() || 'New group';

  return (
    <>
      <EventFormPopoverChrome onClose={requestClose}>
        <View style={styles.safe}>
          <NavBar
            onClose={requestClose}
            right={
              <View style={styles.navEditActions}>
                <TouchableOpacity
                  onPress={resetCreateForm}
                  disabled={!createFormDirty || createGroup.isPending}
                  style={[
                    styles.draftBarBtnSecondary,
                    (!createFormDirty || createGroup.isPending) && { opacity: 0.45 },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text style={styles.draftBarBtnSecondaryText}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void handleCreate()}
                  disabled={!valid || createGroup.isPending}
                  style={[
                    styles.draftBarBtnPrimary,
                    (!valid || createGroup.isPending) && styles.draftBarBtnPrimaryDisabled,
                  ]}
                  activeOpacity={0.8}
                >
                  {createGroup.isPending ? (
                    <ActivityIndicator size="small" color={Colors.accentFg} />
                  ) : (
                    <Text style={styles.draftBarBtnPrimaryText}>Create</Text>
                  )}
                </TouchableOpacity>
              </View>
            }
          />

          <ScrollView
            style={styles.groupScrollView}
            contentContainerStyle={styles.groupScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.groupMainCardWrap}>
              <View style={styles.groupMainCard}>
                <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
                  <TouchableOpacity
                    onPress={openAvatarPicker}
                    style={[
                      styles.groupThumb,
                      {
                        alignSelf: 'flex-start',
                        marginBottom: 10,
                        backgroundColor: getGroupColor(getDefaultGroupThemeFromName(themeName)).row,
                        borderColor: getGroupColor(getDefaultGroupThemeFromName(themeName)).cal,
                        borderRadius: groupAvatarBorderRadius(AVATAR_SIZE),
                      },
                    ]}
                    activeOpacity={0.8}
                  >
                    <GroupAvatar
                      seed={draftSeed || DEFAULT_AVATAR_SEED}
                      thumbnail={draftThumbnail}
                      name={themeName}
                      size={AVATAR_SIZE}
                      style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
                    />
                  </TouchableOpacity>
                  <View style={styles.groupNameField}>
                    <Text style={formSectionTitleStyle}>
                      Group name
                      <Text style={styles.requiredMark} accessibilityLabel="required">
                        {' '}
                        *
                      </Text>
                    </Text>
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
                      placeholder="e.g. Weekend hikers"
                      placeholderTextColor={Colors.textMuted}
                      style={styles.groupTitleInput}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  </View>
                  <View style={styles.groupDescField}>
                    <Text style={formSectionTitleStyle}>Description</Text>
                    <View style={styles.groupDescBox}>
                      <TextInput
                        value={draftDesc}
                        onChangeText={setDraftDesc}
                        placeholder="Optional"
                        placeholderTextColor={Colors.textMuted}
                        style={styles.groupDescInput}
                        multiline
                        scrollEnabled
                      />
                    </View>
                  </View>
                </View>

                {groupPhotosBlock}
              </View>
            </View>

            <View style={styles.groupDetailSections}>
              <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>SETTINGS</Text>
              <View style={[styles.card, { marginBottom: 16 }]}>
                <Toggle
                  value={requireApprovalToJoin}
                  onChange={setRequireApprovalToJoin}
                  label="Require approval to join?"
                  style={{ borderBottomWidth: 0, paddingHorizontal: 16 }}
                />
              </View>
            </View>

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </EventFormPopoverChrome>

      {groupPhotoLightbox !== null && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setGroupPhotoLightbox(null)}
        >
          <View style={styles.groupPhotoLightbox}>
            <View style={styles.groupPhotoLightboxHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar name={displayNameForChrome} size={28} />
                <View>
                  <Text style={styles.groupPhotoLightboxName}>{displayNameForChrome}</Text>
                  <Text style={styles.groupPhotoLightboxSub}>
                    {groupPhotoLightbox.urls.length > 1
                      ? `Cover photos · ${groupPhotoLightbox.index + 1} of ${groupPhotoLightbox.urls.length}`
                      : 'Cover photo'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setGroupPhotoLightbox(null)}
                style={styles.groupPhotoLightboxClose}
              >
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            {groupPhotoLightbox.urls.length > 1 ? (
              <>
                <TouchableOpacity
                  accessibilityLabel="Previous photo"
                  onPress={() =>
                    setGroupPhotoLightbox((prev) =>
                      prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev,
                    )
                  }
                  disabled={groupPhotoLightbox.index <= 0}
                  style={[
                    styles.groupPhotoLightboxNavBtn,
                    styles.groupPhotoLightboxNavPrev,
                    groupPhotoLightbox.index <= 0 && styles.groupPhotoLightboxNavBtnDisabled,
                  ]}
                >
                  <Ionicons name="chevron-back" size={28} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityLabel="Next photo"
                  onPress={() =>
                    setGroupPhotoLightbox((prev) =>
                      prev && prev.index < prev.urls.length - 1
                        ? { ...prev, index: prev.index + 1 }
                        : prev,
                    )
                  }
                  disabled={groupPhotoLightbox.index >= groupPhotoLightbox.urls.length - 1}
                  style={[
                    styles.groupPhotoLightboxNavBtn,
                    styles.groupPhotoLightboxNavNext,
                    groupPhotoLightbox.index >= groupPhotoLightbox.urls.length - 1 &&
                      styles.groupPhotoLightboxNavBtnDisabled,
                  ]}
                >
                  <Ionicons name="chevron-forward" size={28} color="#fff" />
                </TouchableOpacity>
              </>
            ) : null}
            <ResolvableImage
              storedUrl={groupPhotoLightbox.urls[groupPhotoLightbox.index] ?? ''}
              style={styles.groupPhotoLightboxImg}
              resizeMode="contain"
            />
          </View>
        </Modal>
      )}

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
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  groupScrollView: { flex: 1, backgroundColor: Colors.bg },
  groupScrollContent: { flexGrow: 1, backgroundColor: Colors.bg, paddingBottom: 8 },
  groupDetailSections: { paddingHorizontal: 20 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  sectionLabelSpaced: { marginTop: 8 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius['2xl'], overflow: 'hidden' },
  groupMainCardWrap: { marginHorizontal: 20, marginTop: 10, marginBottom: 4 },
  groupMainCard: { backgroundColor: Colors.surface, borderRadius: Radius['2xl'], overflow: 'hidden' },
  groupThumb: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  groupNameField: { marginBottom: 2 },
  requiredMark: { color: Colors.todayRed, fontFamily: Fonts.semiBold },
  groupTitleInput: {
    width: '100%',
    minHeight: 40,
    paddingVertical: Platform.OS === 'ios' ? 6 : 4,
    paddingHorizontal: 0,
    margin: 0,
    marginTop: 2,
    borderWidth: 0,
    backgroundColor: 'transparent',
    fontSize: 21,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    lineHeight: 28,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null),
  },
  groupDescField: { marginTop: 10 },
  groupDescBox: {
    backgroundColor: Colors.bg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    marginTop: 6,
    marginBottom: 16,
    height: 112,
  },
  groupDescInput: {
    flex: 1,
    width: '100%',
    minHeight: 88,
    padding: 0,
    margin: 0,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.text,
    lineHeight: 22,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null),
  },
  groupPhotosAddCard: {
    backgroundColor: Colors.bg,
    borderRadius: 16,
    overflow: 'hidden',
  },
  groupPhotosAddCardNested: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  groupPhotosAddBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'flex-start',
  },
  coverRemoveThumb: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.text,
    borderWidth: 2,
    borderColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navEditActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  draftBarBtnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  draftBarBtnSecondaryText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text },
  draftBarBtnPrimary: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftBarBtnPrimaryDisabled: { opacity: 0.45 },
  draftBarBtnPrimaryText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  groupPhotoLightbox: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.93)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupPhotoLightboxHeader: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  groupPhotoLightboxName: { fontSize: 13, fontFamily: Fonts.semiBold, color: '#fff' },
  groupPhotoLightboxSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    fontFamily: Fonts.regular,
  },
  groupPhotoLightboxClose: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  groupPhotoLightboxImg: { width: '100%', height: '70%' },
  groupPhotoLightboxNavBtn: {
    position: 'absolute',
    top: '42%',
    zIndex: 2,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupPhotoLightboxNavBtnDisabled: { opacity: 0.28 },
  groupPhotoLightboxNavPrev: { left: 10 },
  groupPhotoLightboxNavNext: { right: 10 },
});
