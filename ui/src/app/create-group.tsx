import { useState, useRef, useMemo, useCallback, useEffect, useLayoutEffect } from 'react';
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
} from 'react-native';
import { useLocalSearchParams, type Href } from 'expo-router';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import { useGuardedPress } from '../hooks/useGuardedPress';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { Colors, Fonts, Radius } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, groupAvatarBorderRadius } from '../utils/helpers';
import { NavBar, Field, formSectionTitleStyle, Toggle } from '../components/ui';
import { UserAvatar } from '../components/UserAvatar';
import { EventFormPopoverChrome } from '../components/EventFormPopoverChrome';
import { KeyboardSafeScrollView } from '../components/KeyboardSafeScrollView';
import { useCreateGroup, useGroup, useUpdateGroup } from '../hooks/api/useGroups';
import { useAuth } from '../contexts/AuthContext';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { GroupAvatar } from '../components/GroupAvatar';
import { AvatarPickerModal } from '../components/AvatarPickerModal';
import type { PendingAvatarFile } from '../services/pickAndUploadImage';
import { uploadPendingAvatarFile } from '../services/pickAndUploadImage';
import { pickAndUploadCoverPhoto, takeAndUploadCoverPhoto } from '../services/pickAndUploadImage';
import { AddImageButton } from '../components/AddImageButton';
import { ImageLightboxModal } from '../components/ImageLightboxModal';
import { dropLightboxItem } from '../components/ForumPostMarkdownBody';
import { ResolvableImage } from '../components/ResolvableImage';
import { firstSearchParam, parseReturnToParam } from '../utils/navigationReturn';
import { ApiError } from '@moijia/client';
import { deleteManagedUploadFireAndForget } from '../services/managedUploadDelete';
import { confirmDestructive } from '../utils/confirmDestructive';

const DEFAULT_AVATAR_SEED = 'auto';
const AVATAR_SIZE = 56;
const DEFAULT_REQUIRE_APPROVAL = true;
const DESC_MAX_LENGTH = 500;

function serializeGroupForm(args: {
  name: string;
  desc: string;
  seed: string;
  thumbnail: string | null;
  coverPhotos: string[];
  requireApprovalToJoin: boolean;
}): string {
  return JSON.stringify({
    name: args.name,
    desc: args.desc,
    seed: args.seed,
    thumbnail: args.thumbnail,
    coverPhotos: args.coverPhotos,
    requireApprovalToJoin: args.requireApprovalToJoin,
  });
}

export default function CreateGroupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[]; editId?: string | string[] }>();
  const editId = firstSearchParam(params.editId);
  const isEditing = !!editId;
  const groupReturnTo = parseReturnToParam(firstSearchParam(params.returnTo));
  const { user } = useAuth();
  const { userId: currentUserId, user: currentUser } = useCurrentUserContext();
  const createGroup = useCreateGroup();
  const updateGroup = useUpdateGroup(editId ?? '', currentUserId ?? '');
  const { data: editingGroup } = useGroup(editId ?? '', currentUserId ?? '', { enabled: isEditing });
  const [newGroupId] = useState(() => Crypto.randomUUID());
  const groupId = editId ?? newGroupId;
  const hydratedEditRef = useRef(false);

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
  const [formBaselineSerialized, setFormBaselineSerialized] = useState<string | null>(null);
  const valid = !!draftName.trim();
  const savePending = createGroup.isPending || updateGroup.isPending;

  useEffect(() => {
    if (!isEditing || !editingGroup || hydratedEditRef.current) return;
    setDraftName(editingGroup.name ?? '');
    setDraftDesc(editingGroup.desc ?? '');
    setDraftSeed(editingGroup.avatarSeed ?? editingGroup.name ?? '');
    setDraftThumbnail(editingGroup.thumbnail ?? null);
    setDraftCoverPhotos(editingGroup.coverPhotos ?? []);
    setRequireApprovalToJoin(
      editingGroup.requireApprovalToJoin == null
        ? DEFAULT_REQUIRE_APPROVAL
        : !!editingGroup.requireApprovalToJoin
    );
    hydratedEditRef.current = true;
    setFormBaselineSerialized(null);
  }, [editingGroup, isEditing]);

  const currentFormSerialized = useMemo(
    () =>
      serializeGroupForm({
        name: draftName,
        desc: draftDesc,
        seed: draftSeed,
        thumbnail: draftThumbnail,
        coverPhotos: draftCoverPhotos,
        requireApprovalToJoin,
      }),
    [draftName, draftDesc, draftSeed, draftThumbnail, draftCoverPhotos, requireApprovalToJoin]
  );

  useLayoutEffect(() => {
    if (formBaselineSerialized != null) return;
    if (isEditing && !hydratedEditRef.current) return;
    setFormBaselineSerialized(currentFormSerialized);
  }, [formBaselineSerialized, currentFormSerialized, isEditing]);

  const createFormDirty = useMemo(() => {
    if (formBaselineSerialized == null) return false;
    return currentFormSerialized !== formBaselineSerialized;
  }, [formBaselineSerialized, currentFormSerialized]);

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

  const saveAvatarPicker = () => {
    // Don't restore snapshot - keep the changes
    setShowAvatarPicker(false);
  };

  const addCoverPhotoFromPicker = async () => {
    if (!user?.uid || coverPhotoBusy) return;
    setCoverPhotoBusy(true);
    try {
      const urls = await pickAndUploadCoverPhoto(user.uid, { groupId });
      if (urls?.length) setDraftCoverPhotos((prev) => [...prev, ...urls]);
    } finally {
      setCoverPhotoBusy(false);
    }
  };

  const addCoverPhotoFromCamera = async () => {
    if (!user?.uid || coverPhotoBusy) return;
    setCoverPhotoBusy(true);
    try {
      const url = await takeAndUploadCoverPhoto(user.uid, { groupId });
      if (url) setDraftCoverPhotos((prev) => [...prev, url]);
    } finally {
      setCoverPhotoBusy(false);
    }
  };

  const addCoverPhotoFromLink = async (url: string) => {
    const clean = url.trim();
    if (!clean) return;
    setDraftCoverPhotos((prev) => [...prev, clean]);
  };

  const removeDraftCoverPhoto = (url: string) => {
    setDraftCoverPhotos((prev) => prev.filter((u) => u !== url));
    const uid = (currentUserId ?? user?.uid ?? '').trim();
    if (uid) deleteManagedUploadFireAndForget(uid, url);
    setGroupPhotoLightbox((cur) => (cur ? dropLightboxItem(cur, url) : cur));
  };

  const handleBack = useCallback(() => {
    if (Platform.OS !== 'web' && router.canGoBack()) {
      router.back();
      return;
    }
    if (groupReturnTo) {
      router.replace(groupReturnTo as Href);
      return;
    }
    router.push('/(tabs)/groups');
  }, [router, groupReturnTo]);

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

  const guardedRequestClose = useGuardedPress(requestClose);

  const handleSubmit = useGuardedPress(async () => {
    if (!valid || !user) return;
    const actorId = (currentUserId ?? user.uid ?? '').trim();
    if (!actorId) {
      Alert.alert('Error', 'Missing user id. Please sign in again and retry.');
      return;
    }

    try {
      let thumbnail = draftThumbnail;
      if (pendingAvatarFileRef.current) {
        const p = pendingAvatarFileRef.current;
        thumbnail = await uploadPendingAvatarFile(user.uid, p, { groupId });
        if (p.kind === 'web') URL.revokeObjectURL(p.objectUrl);
        pendingAvatarFileRef.current = null;
        setDraftThumbnail(thumbnail);
      }

      if (isEditing && editId) {
        await updateGroup.mutateAsync({
          name: draftName.trim(),
          desc: draftDesc.trim(),
          thumbnail,
          coverPhotos: draftCoverPhotos,
          avatarSeed: draftSeed || draftName.trim() || undefined,
          requireApprovalToJoin,
          updatedBy: actorId,
        });
        Toast.show({ type: 'success', text1: 'Group updated' });
        handleBack();
        return;
      }

      await createGroup.mutateAsync({
        id: groupId,
        name: draftName.trim(),
        desc: draftDesc.trim(),
        thumbnail,
        coverPhotos: draftCoverPhotos,
        ownerId: actorId,
        avatarSeed: draftSeed || draftName.trim() || undefined,
        createdBy: actorId,
        adminIds: [actorId],
        memberIds: [actorId],
        requireApprovalToJoin,
      });

      handleBack();
    } catch (e) {
      let message = isEditing
        ? 'Failed to update group. Please try again.'
        : 'Failed to create group. Please try again.';
      if (e instanceof ApiError) {
        const body = e.body as { error?: string; message?: string } | undefined;
        message = (body?.error || body?.message || e.message || message).trim() || message;
      } else if (e instanceof Error && e.message) {
        message = e.message;
      }
      Alert.alert('Error', message);
    }
  }, { disabled: !valid || savePending || !user });

  const coverPhotosForDisplay = draftCoverPhotos;
  const themeName = draftName.trim() || 'Group';
  const avatarTheme = getGroupColor(getDefaultGroupThemeFromName(themeName));
  const navTitle = isEditing ? 'Edit Group' : 'New Group';

  return (
    <>
      <EventFormPopoverChrome onClose={guardedRequestClose}>
        <View style={styles.inner}>
          <NavBar
            title={navTitle}
            onClose={guardedRequestClose}
            right={
              <TouchableOpacity
                onPress={() => void handleSubmit()}
                disabled={!valid || savePending}
                style={[styles.headerBtn, (!valid || savePending) && styles.headerBtnDis]}
              >
                {savePending ? (
                  <ActivityIndicator size="small" color={Colors.accentFg} />
                ) : (
                  <Text style={[styles.headerBtnText, !valid && { color: Colors.textMuted }]} numberOfLines={1}>
                    {isEditing ? 'Save' : 'Create'}
                  </Text>
                )}
              </TouchableOpacity>
            }
          />

          <KeyboardSafeScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 100, width: '100%', alignSelf: 'stretch' }}
            showsVerticalScrollIndicator={false}
          >
            <Field label="Avatar">
              <TouchableOpacity
                onPress={openAvatarPicker}
                style={[
                  styles.avatarRow,
                  {
                    backgroundColor: avatarTheme.row,
                    borderColor: avatarTheme.dot,
                  },
                ]}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Choose group avatar"
              >
                <View
                  style={[
                    styles.avatarWrap,
                    {
                      backgroundColor: avatarTheme.cal,
                      borderRadius: groupAvatarBorderRadius(AVATAR_SIZE),
                    },
                  ]}
                >
                  <GroupAvatar
                    seed={draftSeed || DEFAULT_AVATAR_SEED}
                    thumbnail={draftThumbnail}
                    name={themeName}
                    size={AVATAR_SIZE}
                    style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
                  />
                </View>
                <View style={styles.avatarTextCol}>
                  <Text style={[styles.avatarTitle, { color: avatarTheme.text }]}>Group avatar</Text>
                  <Text style={styles.avatarHint}>Tap to choose a photo or pattern</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </Field>

            <Field label="Group name" required>
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
                style={styles.input}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </Field>

            <Field label="Description">
              <View style={styles.descBox}>
                <TextInput
                  value={draftDesc}
                  onChangeText={setDraftDesc}
                  placeholder="What is this group about?"
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={5}
                  maxLength={DESC_MAX_LENGTH}
                  style={styles.descInput}
                />
                <View style={styles.descToolbar}>
                  <Text style={{ fontSize: 11, color: Colors.textMuted }}>
                    {draftDesc.length}/{DESC_MAX_LENGTH}
                  </Text>
                </View>
              </View>
            </Field>

            {!isEditing ? (
              <View style={styles.photosSection}>
                <Text style={formSectionTitleStyle}>
                  Photos{coverPhotosForDisplay.length > 0 ? ` · ${coverPhotosForDisplay.length}` : ''}
                </Text>
                <View style={styles.photosCard}>
                  {coverPhotosForDisplay.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ borderBottomWidth: 1, borderBottomColor: Colors.border }}
                      contentContainerStyle={{ gap: 4, padding: 10 }}
                    >
                      {coverPhotosForDisplay.map((uri, i) => (
                        <View key={`${uri}-${i}`} style={{ position: 'relative' }}>
                          <TouchableOpacity
                            onPress={() => setGroupPhotoLightbox({ urls: coverPhotosForDisplay, index: i })}
                            activeOpacity={0.9}
                          >
                            <ResolvableImage
                              storedUrl={uri}
                              style={{ width: 80, height: 80, borderRadius: Radius.lg }}
                              resizeMode="cover"
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() =>
                              confirmDestructive(
                                'Delete photo?',
                                'This photo will be permanently deleted.',
                                () => removeDraftCoverPhoto(uri)
                              )
                            }
                            style={styles.removeThumb}
                          >
                            <Ionicons name="close" size={11} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </ScrollView>
                  ) : null}
                  <View style={[styles.photosToolbar, coverPhotosForDisplay.length === 0 && { borderTopWidth: 0 }]}>
                    <AddImageButton
                      label="Add photo"
                      busy={coverPhotoBusy}
                      disabled={coverPhotoBusy}
                      onTakePhoto={addCoverPhotoFromCamera}
                      onChooseFromLibrary={addCoverPhotoFromPicker}
                      onInsertLink={addCoverPhotoFromLink}
                    />
                  </View>
                </View>
              </View>
            ) : null}

            <Field label="Settings">
              <View style={styles.settingsCard}>
                <Toggle
                  value={requireApprovalToJoin}
                  onChange={setRequireApprovalToJoin}
                  label="Require approval to join"
                  style={{ borderBottomWidth: 0 }}
                />
              </View>
            </Field>

            <TouchableOpacity
              onPress={() => void handleSubmit()}
              style={[styles.submitBtn, (!valid || savePending) && { backgroundColor: Colors.border }]}
              disabled={!valid || savePending}
            >
              {savePending ? (
                <ActivityIndicator color={Colors.accentFg} />
              ) : (
                <Text style={[styles.submitBtnText, !valid && { color: Colors.textMuted }]} numberOfLines={1}>
                  {isEditing ? 'Save group' : 'Create group'}
                </Text>
              )}
            </TouchableOpacity>
          </KeyboardSafeScrollView>
        </View>
      </EventFormPopoverChrome>

      <ImageLightboxModal
        visible={groupPhotoLightbox !== null}
        urls={groupPhotoLightbox?.urls ?? []}
        index={groupPhotoLightbox?.index ?? 0}
        onChangeIndex={(nextIndex) =>
          setGroupPhotoLightbox((prev) => (prev ? { ...prev, index: nextIndex } : prev))
        }
        onClose={() => setGroupPhotoLightbox(null)}
        onDelete={removeDraftCoverPhoto}
        headerAvatar={
          currentUser ? (
            <UserAvatar
              seed={currentUser.displayName || currentUser.name}
              backgroundColor={[currentUser.avatarSeed ?? '']}
              thumbnail={currentUser.thumbnail ?? null}
              size={28}
            />
          ) : undefined
        }
        title={(currentUser?.displayName || currentUser?.name || '').trim() || undefined}
        subtitle={
          groupPhotoLightbox
            ? groupPhotoLightbox.urls.length > 1
              ? `Cover photos · ${groupPhotoLightbox.index + 1} of ${groupPhotoLightbox.urls.length}`
              : 'Cover photo'
            : undefined
        }
      />

      <AvatarPickerModal
        variant="group"
        visible={showAvatarPicker}
        onRequestClose={closeAvatarPicker}
        onAfterSave={saveAvatarPicker}
        seed={draftSeed}
        onSeedChange={setDraftSeed}
        thumbnail={draftThumbnail}
        onThumbnailChange={setDraftThumbnail}
        userId={user?.uid ?? ''}
        deferFileUpload
        pendingAvatarFileRef={pendingAvatarFileRef}
        groupId={groupId}
        onSave={async () => {
          // Changes already applied to draft state via onSeedChange/onThumbnailChange
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1, backgroundColor: Colors.bg },
  headerBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    flexShrink: 0,
  },
  headerBtnDis: { backgroundColor: Colors.border },
  headerBtnText: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: Colors.surface,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarTextCol: { flex: 1, minWidth: 0 },
  avatarTitle: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text },
  avatarHint: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textMuted, marginTop: 2 },
  input: {
    padding: 10,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    fontSize: 14,
    color: Colors.text,
    fontFamily: Fonts.regular,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null),
  },
  descBox: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  descInput: {
    padding: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: Colors.text,
    fontFamily: Fonts.regular,
    minHeight: 100,
    textAlignVertical: 'top',
    backgroundColor: 'transparent',
    borderWidth: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null),
  },
  descToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  photosSection: { marginTop: 0, marginBottom: 18 },
  photosCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  photosToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  removeThumb: {
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
  settingsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
  },
  submitBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 48,
  },
  submitBtnText: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.accentFg,
    textAlign: 'center',
  },
});
