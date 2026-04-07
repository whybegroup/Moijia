import { useState, useRef, type MutableRefObject, type ChangeEvent } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Radius } from '../constants/theme';
import { deleteManagedUploadFireAndForget } from '../services/managedUploadDelete';
import {
  pickImageFromLibrary,
  uploadPickedImageAsset,
  uploadWebImageFile,
  isCancelled,
  type PendingAvatarFile,
  type PickedImageAsset,
} from '../services/pickAndUploadImage';

type Props = {
  /** Firebase uid — required for presigned S3 upload */
  userId: string;
  thumbnail: string | null;
  onThumbnailChange: (url: string | null) => void;
  /** When true, file picks stay local until parent uploads on Save / Create. */
  deferFileUpload?: boolean;
  pendingAvatarFileRef?: MutableRefObject<PendingAvatarFile | null>;
};

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

export function AvatarThumbnailField({
  userId,
  thumbnail,
  onThumbnailChange,
  deferFileUpload = false,
  pendingAvatarFileRef,
}: Props) {
  const [pickBusy, setPickBusy] = useState(false);
  const fileInputRef = useRef<{ click: () => void } | null>(null);

  const canUpload = !!userId.trim();
  const defer = deferFileUpload && !!pendingAvatarFileRef;

  const revokePendingWebIfAny = () => {
    const ref = pendingAvatarFileRef?.current;
    if (ref?.kind === 'web') {
      URL.revokeObjectURL(ref.objectUrl);
    }
    if (pendingAvatarFileRef) pendingAvatarFileRef.current = null;
  };

  const handleDeferredFileChosen = (previewUri: string, source: PickedImageAsset | File) => {
    if (!pendingAvatarFileRef) return;
    revokePendingWebIfAny();
    if (typeof File !== 'undefined' && source instanceof File) {
      pendingAvatarFileRef.current = { kind: 'web', file: source, objectUrl: previewUri };
    } else {
      pendingAvatarFileRef.current = { kind: 'native', asset: source as PickedImageAsset };
    }
  };

  const onWebFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canUpload) return;
    if (!file.type.startsWith('image/')) {
      Alert.alert('Upload', 'Please choose an image file.');
      return;
    }
    if (defer) {
      const objectUrl = URL.createObjectURL(file);
      handleDeferredFileChosen(objectUrl, file);
      onThumbnailChange(objectUrl);
      return;
    }
    setPickBusy(true);
    try {
      const url = await uploadWebImageFile(userId, file);
      const prev = thumbnail?.trim();
      onThumbnailChange(url);
      if (prev && prev !== url && isHttpUrl(prev)) {
        deleteManagedUploadFireAndForget(userId, prev);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      Alert.alert('Upload', msg);
    } finally {
      setPickBusy(false);
    }
  };

  const runNativePick = async () => {
    if (!canUpload) return;
    setPickBusy(true);
    try {
      const asset = await pickImageFromLibrary();
      if (defer) {
        handleDeferredFileChosen(asset.uri, asset);
        onThumbnailChange(asset.uri);
        return;
      }
      const url = await uploadPickedImageAsset(userId, asset);
      const prev = thumbnail?.trim();
      onThumbnailChange(url);
      if (prev && prev !== url && isHttpUrl(prev)) {
        deleteManagedUploadFireAndForget(userId, prev);
      }
    } catch (e) {
      if (!isCancelled(e)) {
        Alert.alert('Photo', e instanceof Error ? e.message : 'Could not pick image');
      }
    } finally {
      setPickBusy(false);
    }
  };

  const onUploadPress = () => {
    if (!canUpload || pickBusy) return;
    if (Platform.OS === 'web') {
      fileInputRef.current?.click();
    } else {
      void runNativePick();
    }
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>Photo (optional)</Text>
      <View style={styles.actions}>
        {Platform.OS === 'web' && (
          <input
            ref={(el) => {
              fileInputRef.current = el;
            }}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={onWebFileChange}
          />
        )}
        <TouchableOpacity
          style={[styles.uploadBtn, (!canUpload || pickBusy) && styles.uploadBtnDisabled]}
          onPress={onUploadPress}
          activeOpacity={0.85}
          disabled={!canUpload || pickBusy}
        >
          {pickBusy ? (
            <ActivityIndicator color={Colors.accentFg} size="small" />
          ) : (
            <Ionicons name="cloud-upload-outline" size={18} color={canUpload ? Colors.accentFg : Colors.textMuted} />
          )}
          <Text style={[styles.uploadBtnText, !canUpload && styles.uploadBtnTextDisabled]}>Upload image…</Text>
        </TouchableOpacity>
        {thumbnail ? (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => {
              revokePendingWebIfAny();
              onThumbnailChange(null);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {!canUpload ? (
        <Text style={styles.hint}>Sign in to upload images to storage.</Text>
      ) : defer ? (
        <Text style={styles.hint}>File uploads are sent when you save.</Text>
      ) : (
        <Text style={styles.hint}>Uses the same S3 upload flow as event photos (see API env).</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    marginBottom: 6,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    ...(Platform.OS === 'web' ? ({ boxSizing: 'border-box', maxWidth: '100%' } as object) : null),
  },
  uploadBtnDisabled: {
    backgroundColor: Colors.border,
    opacity: 0.85,
  },
  uploadBtnText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.accentFg,
  },
  uploadBtnTextDisabled: {
    color: Colors.textMuted,
  },
  clearBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  clearText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Colors.textSub,
  },
  hint: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    marginTop: 6,
    lineHeight: 16,
  },
});
