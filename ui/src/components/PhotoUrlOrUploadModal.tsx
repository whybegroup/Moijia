import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { UploadProgressBanner } from './UploadProgressBanner';
import {
  pickImagesFromLibrary,
  uploadPickedImageAsset,
  uploadWebImageFile,
  prepareWebImageFiles,
  keepWebFilesThatFit,
  isCancelled,
  ensureGroupCanUpload,
} from '../services/pickAndUploadImage';
import { uid } from '../utils/api-helpers';
import { withUploadSession } from '../services/uploadProgress';

export type PhotoUrlOrUploadModalProps = {
  visible: boolean;
  onClose: () => void;
  /**
   * After successful upload: final URL. With {@link onPickPreview}, optional `uploadId` matches
   * the preview row in the parent.
   */
  onAdd: (imageUrl: string, uploadId?: string) => void;
  /** After the user picks a file, before upload finishes — close modal and show this URI in the composer. */
  onPickPreview?: (previewUri: string, uploadId: string) => void;
  /** Upload failed after a preview was shown (same uploadId as onPickPreview). */
  onUploadFailed?: (uploadId: string) => void;
  userId: string;
  title?: string;
  groupId?: string;
};

export function PhotoUrlOrUploadModal({
  visible,
  onClose,
  onAdd,
  onPickPreview,
  onUploadFailed,
  userId,
  title = 'Add photo',
  groupId,
}: PhotoUrlOrUploadModalProps) {
  const [busy, setBusy] = useState(false);
  /** Local preview inside this modal when upload runs without {@link onPickPreview}. */
  const [inlinePreviewUri, setInlinePreviewUri] = useState<string | null>(null);
  const inlinePreviewBlobRef = useRef<string | null>(null);
  const fileInputRef = useRef<{ click: () => void } | null>(null);

  const clearInlinePreview = () => {
    if (inlinePreviewBlobRef.current) {
      URL.revokeObjectURL(inlinePreviewBlobRef.current);
      inlinePreviewBlobRef.current = null;
    }
    setInlinePreviewUri(null);
  };

  useEffect(() => {
    if (!visible) {
      setBusy(false);
      if (inlinePreviewBlobRef.current) {
        URL.revokeObjectURL(inlinePreviewBlobRef.current);
        inlinePreviewBlobRef.current = null;
      }
      setInlinePreviewUri(null);
    }
  }, [visible]);

  const resetAndClose = () => {
    onClose();
  };

  const handleNativeUpload = async () => {
    if (!(await ensureGroupCanUpload(userId, groupId))) return;
    setBusy(true);
    const previewIds: string[] = [];
    try {
      const assets = await pickImagesFromLibrary({ multiple: true, userId, groupId });
      if (onPickPreview) {
        onClose();
        setBusy(false);
        await withUploadSession(assets.length, async () => {
          for (const asset of assets) {
            const uploadId = uid();
            previewIds.push(uploadId);
            onPickPreview(asset.uri, uploadId);
            const url = await uploadPickedImageAsset(userId, asset, { groupId });
            onAdd(url, uploadId);
          }
        });
        return;
      }
      setInlinePreviewUri(assets[0]?.uri ?? null);
      await withUploadSession(assets.length, async () => {
        for (const asset of assets) {
          const url = await uploadPickedImageAsset(userId, asset, { groupId });
          onAdd(url);
        }
      });
      resetAndClose();
    } catch (e) {
      if (isCancelled(e)) {
        setBusy(false);
        clearInlinePreview();
        return;
      }
      for (const id of previewIds) onUploadFailed?.(id);
      const msg = e instanceof Error ? e.message : 'Upload failed';
      Alert.alert('Upload', msg);
      clearInlinePreview();
    } finally {
      setBusy(false);
    }
  };

  const triggerWebFilePicker = async () => {
    if (!(await ensureGroupCanUpload(userId, groupId))) return;
    fileInputRef.current?.click();
  };

  const onWebFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (!selected.length) return;
    let files: File[];
    try {
      files = await keepWebFilesThatFit(userId, groupId, await prepareWebImageFiles(selected));
      if (!files.length) return;
    } catch (err) {
      if (!isCancelled(err)) {
        Alert.alert('Upload', err instanceof Error ? err.message : 'Upload failed');
      }
      return;
    }

    const previewIds: string[] = [];
    const previewUris: string[] = [];
    if (onPickPreview) {
      onClose();
      setBusy(true);
      try {
        await withUploadSession(files.length, async () => {
          for (const file of files) {
            const uploadId = uid();
            const previewUri = URL.createObjectURL(file);
            previewIds.push(uploadId);
            previewUris.push(previewUri);
            onPickPreview(previewUri, uploadId);
            const url = await uploadWebImageFile(userId, file, { groupId });
            onAdd(url, uploadId);
            URL.revokeObjectURL(previewUri);
          }
        });
      } catch (err) {
        for (const id of previewIds) onUploadFailed?.(id);
        for (const uri of previewUris) URL.revokeObjectURL(uri);
        const msg = err instanceof Error ? err.message : 'Upload failed';
        Alert.alert('Upload', msg);
      } finally {
        setBusy(false);
      }
      return;
    }

    const objectUrl = URL.createObjectURL(files[0]);
    inlinePreviewBlobRef.current = objectUrl;
    setInlinePreviewUri(objectUrl);
    setBusy(true);
    try {
      await withUploadSession(files.length, async () => {
        for (const file of files) {
          const url = await uploadWebImageFile(userId, file, { groupId });
          onAdd(url);
        }
      });
      clearInlinePreview();
      resetAndClose();
    } catch (err) {
      clearInlinePreview();
      const msg = err instanceof Error ? err.message : 'Upload failed';
      Alert.alert('Upload', msg);
    } finally {
      setBusy(false);
    }
  };

  const blockDismissWhileUploading = busy && !!inlinePreviewUri;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!blockDismissWhileUploading) resetAndClose();
      }}
      {...edgeToEdgeModalProps}
    >
      {Platform.OS === 'web' && (
        <input
          ref={(el) => {
            fileInputRef.current = el;
          }}
          type="file"
          accept="image/*,video/*,.gif,.gifv,.mp4,.mov,.webm"
          multiple
          style={{ display: 'none' }}
          onChange={onWebFileChange}
        />
      )}
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (!blockDismissWhileUploading) resetAndClose();
          }}
          activeOpacity={1}
        />
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>

          {inlinePreviewUri ? (
            <View style={styles.previewWrap}>
              <Image source={{ uri: inlinePreviewUri }} style={styles.inlinePreview} resizeMode="contain" />
              {busy ? (
                <View style={styles.uploadingRow}>
                  <Text style={styles.uploadingText}>Uploading…</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={styles.hint}>
              Images are uploaded to your S3 bucket (configure API env on the API).
            </Text>
          )}
          {!inlinePreviewUri ? (
            <TouchableOpacity
              style={[styles.uploadBtn, busy && styles.uploadBtnDisabled]}
              onPress={Platform.OS === 'web' ? triggerWebFilePicker : handleNativeUpload}
              disabled={busy}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color={Colors.accentFg} />
              ) : (
                <Text style={styles.uploadBtnText}>Choose images or videos…</Text>
              )}
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={resetAndClose}
            style={styles.cancelFullWidth}
            activeOpacity={0.8}
            disabled={busy && !!inlinePreviewUri}
          >
            <Text style={styles.secondaryBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <UploadProgressBanner />
      </View>
    </Modal>
  );
}

const webBtnBox =
  Platform.OS === 'web'
    ? ({ boxSizing: 'border-box' as const, maxWidth: '100%' as const } as const)
    : null;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    width: '100%',
    maxWidth: 360,
    flexGrow: 0,
  },
  title: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.text, marginBottom: 12 },
  hint: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted, marginBottom: 10, lineHeight: 18 },
  cancelFullWidth: {
    marginTop: 8,
    width: '100%',
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    ...(webBtnBox ?? {}),
  },
  secondaryBtnText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    textAlign: 'center',
    ...(Platform.OS === 'web' ? ({ maxWidth: '100%' as const } as const) : null),
  },
  uploadBtn: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    minHeight: 48,
    ...(webBtnBox ?? {}),
  },
  uploadBtnDisabled: { opacity: 0.6 },
  uploadBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.accentFg, textAlign: 'center' },
  previewWrap: {
    marginBottom: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    minHeight: 160,
    maxHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlinePreview: { width: '100%', height: 200 },
  uploadingRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  uploadingText: { fontSize: 13, fontFamily: Fonts.medium, color: '#fff' },
});
