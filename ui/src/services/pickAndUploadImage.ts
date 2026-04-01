import { Platform } from 'react-native';
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

/** Pending local file chosen in avatar UI; upload on Save / Create. */
export type PendingAvatarFile =
  | { kind: 'native'; asset: PickedImageAsset }
  | { kind: 'web'; file: File; objectUrl: string };

export async function uploadPendingAvatarFile(userId: string, pending: PendingAvatarFile): Promise<string> {
  if (pending.kind === 'web') {
    return uploadWebImageFile(userId, pending.file);
  }
  return uploadPickedImageAsset(userId, pending.asset);
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
