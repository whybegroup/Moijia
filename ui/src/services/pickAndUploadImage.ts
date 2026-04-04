import { Alert, Platform } from 'react-native';
import { File as ExpoFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { UploadsService } from '@moija/client';

function isCancelled(e: unknown): boolean {
  return e instanceof Error && e.message === 'cancelled';
}

export type PickedImageAsset = {
  uri: string;
  contentType: string;
  fileName?: string;
};

/** Opens the image library; throws `cancelled` if the user backs out. */
export async function pickImageFromLibrary(): Promise<PickedImageAsset> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new Error('Photo library access is required to upload images.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
  });

  if (result.canceled || !result.assets?.length) {
    throw new Error('cancelled');
  }

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    contentType: asset.mimeType || 'image/jpeg',
    fileName: asset.fileName ?? undefined,
  };
}

/**
 * Presign + PUT to the API (local `api/data` storage; set API_PUBLIC_URL if clients use another host).
 */
export async function uploadPickedImageAsset(userId: string, asset: PickedImageAsset): Promise<string> {
  if (!userId) throw new Error('You must be signed in to upload photos.');

  const presign = await UploadsService.presignUpload({
    userId,
    contentType: asset.contentType,
    filename: asset.fileName,
  });

  let body: Blob | ArrayBuffer;
  if (Platform.OS === 'web') {
    body = await (await fetch(asset.uri)).blob();
  } else {
    const file = new ExpoFile(asset.uri);
    body = await file.arrayBuffer();
  }

  const put = await fetch(presign.uploadUrl, {
    method: 'PUT',
    body,
    headers: { 'Content-Type': asset.contentType },
  });
  if (!put.ok) {
    throw new Error(`Upload failed (${put.status}). Check S3 CORS and credentials.`);
  }

  return presign.publicUrl;
}

/** Picks from library then presigns + PUT. Throws `cancelled` if the user backs out of the picker. */
export async function pickAndUploadImageFromLibrary(userId: string): Promise<string> {
  const asset = await pickImageFromLibrary();
  return uploadPickedImageAsset(userId, asset);
}

/**
 * Opens the image picker immediately (no intermediate dialog). Returns the public URL, or undefined if cancelled / not signed in.
 */
export async function pickAndUploadCoverPhoto(userId: string): Promise<string | undefined> {
  if (!userId.trim()) {
    Alert.alert('Upload', 'You must be signed in to upload photos.');
    return undefined;
  }
  try {
    return await pickAndUploadImageFromLibrary(userId);
  } catch (e) {
    if (isCancelled(e)) return undefined;
    Alert.alert('Upload', e instanceof Error ? e.message : 'Upload failed');
    return undefined;
  }
}

/** Pending local file chosen in avatar UI; upload on Save / Create. */
export type PendingAvatarFile =
  | { kind: 'native'; asset: PickedImageAsset }
  | { kind: 'web'; file: File; objectUrl: string };

/** Cover photo row: already on server, or local pick to upload on Create/Save (same as avatar defer flow). */
export type CoverPhotoDraft =
  | { kind: 'remote'; url: string }
  | { kind: 'pending'; previewUri: string; pending: PendingAvatarFile };

export async function uploadPendingAvatarFile(userId: string, pending: PendingAvatarFile): Promise<string> {
  if (pending.kind === 'web') {
    return uploadWebImageFile(userId, pending.file);
  }
  return uploadPickedImageAsset(userId, pending.asset);
}

export function revokeCoverPhotoDraftPreview(d: CoverPhotoDraft) {
  if (d.kind === 'pending' && d.pending.kind === 'web') {
    URL.revokeObjectURL(d.pending.objectUrl);
  }
}

/** Upload any pending drafts in order; revokes web object URLs after successful upload. */
export async function uploadCoverPhotoDrafts(userId: string, drafts: CoverPhotoDraft[]): Promise<string[]> {
  const out: string[] = [];
  for (const d of drafts) {
    if (d.kind === 'remote') {
      out.push(d.url);
    } else {
      const url = await uploadPendingAvatarFile(userId, d.pending);
      if (d.pending.kind === 'web') {
        URL.revokeObjectURL(d.pending.objectUrl);
      }
      out.push(url);
    }
  }
  return out;
}

/** Native image library pick only — no network (use with web file input + {@link createWebDeferredCoverPhoto} on web). */
export async function pickDeferredCoverPhotoNative(): Promise<{
  previewUri: string;
  pending: PendingAvatarFile;
} | null> {
  try {
    const asset = await pickImageFromLibrary();
    return { previewUri: asset.uri, pending: { kind: 'native', asset } };
  } catch (e) {
    if (isCancelled(e)) return null;
    Alert.alert('Photo', e instanceof Error ? e.message : 'Could not pick image');
    return null;
  }
}

export function createWebDeferredCoverPhoto(file: File): { previewUri: string; pending: PendingAvatarFile } {
  const objectUrl = URL.createObjectURL(file);
  return { previewUri: objectUrl, pending: { kind: 'web', file, objectUrl } };
}

export function coverPhotoDraftDisplayUri(d: CoverPhotoDraft): string {
  return d.kind === 'remote' ? d.url : d.previewUri;
}

export async function uploadWebImageFile(userId: string, file: File): Promise<string> {
  if (!userId) throw new Error('You must be signed in to upload photos.');
  const contentType = file.type?.startsWith('image/') ? file.type : 'image/jpeg';
  const presign = await UploadsService.presignUpload({
    userId,
    contentType,
    filename: file.name,
  });
  const put = await fetch(presign.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType },
  });
  if (!put.ok) {
    throw new Error(`Upload failed (${put.status}). Check S3 CORS and credentials.`);
  }
  return presign.publicUrl;
}

export { isCancelled };
