import React, { useEffect, useRef, useState, type ChangeEvent } from 'react';
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
import {
  pickImageFromLibrary,
  uploadPickedImageAsset,
  uploadWebImageFile,
  isCancelled,
} from '../services/pickAndUploadImage';
import { uid } from '../utils/api-helpers';

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
};

export function PhotoUrlOrUploadModal({
  visible,
  onClose,
  onAdd,
  onPickPreview,
  onUploadFailed,
  userId,
  title = 'Add photo',
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
    setBusy(true);
    let uploadId: string | undefined;
    try {
      const asset = await pickImageFromLibrary();
      if (onPickPreview) {
        uploadId = uid();
        onPickPreview(asset.uri, uploadId);
        onClose();
        setBusy(false);
        const url = await uploadPickedImageAsset(userId, asset);
        onAdd(url, uploadId);
        return;
      }
      setInlinePreviewUri(asset.uri);
      const url = await uploadPickedImageAsset(userId, asset);
      onAdd(url);
      resetAndClose();
    } catch (e) {
      if (isCancelled(e)) {
        setBusy(false);
        clearInlinePreview();
        return;
      }
      if (uploadId) onUploadFailed?.(uploadId);
      const msg = e instanceof Error ? e.message : 'Upload failed';
      Alert.alert('Upload', msg);
      clearInlinePreview();
    } finally {
      setBusy(false);
    }
  };

  const triggerWebFilePicker = () => {
    fileInputRef.current?.click();
  };

  const onWebFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      Alert.alert('Upload', 'Please choose an image file.');
      return;
    }
    let previewUri: string | undefined;
    let uploadId: string | undefined;
    if (onPickPreview) {
      uploadId = uid();
      previewUri = URL.createObjectURL(file);
      onPickPreview(previewUri, uploadId);
      onClose();
      setBusy(true);
      try {
        const url = await uploadWebImageFile(userId, file);
        onAdd(url, uploadId);
        if (previewUri) URL.revokeObjectURL(previewUri);
      } catch (err) {
        if (uploadId) onUploadFailed?.(uploadId);
        if (previewUri) URL.revokeObjectURL(previewUri);
        const msg = err instanceof Error ? err.message : 'Upload failed';
        Alert.alert('Upload', msg);
      } finally {
        setBusy(false);
      }
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    inlinePreviewBlobRef.current = objectUrl;
    setInlinePreviewUri(objectUrl);
    setBusy(true);
    try {
      const url = await uploadWebImageFile(userId, file);
      onAdd(url);
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
    >
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
                  <ActivityIndicator color={Colors.accent} />
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
                <Text style={styles.uploadBtnText}>Choose image…</Text>
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
    backgroundColor: Colors.bg,
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
