import { Alert, Image, Platform } from 'react-native';
import { File as ExpoFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { GroupsService, StorageService } from '@moijia/client';
import * as FileSystem from 'expo-file-system/legacy';
import { apiErrorMessage } from '../utils/apiErrors';
import { isVideoFileUrl } from '../utils/fileKind';
import { toPublicFacingMediaUrl } from '../utils/mediaShareUrl';
import {
  GROUP_STORAGE_CHECK_FAILED_MESSAGE,
  GROUP_STORAGE_FULL_MESSAGE,
  GROUP_STORAGE_FULL_TITLE,
  GROUP_STORAGE_UNKNOWN_SIZE_MESSAGE,
  groupStorageDoesNotFitMessage,
  groupStorageRemainingBytes,
} from '../utils/groupStorage';
import {
  abandonUploadSessionIfAuto,
  completeUploadFile,
  ensureUploadSession,
  setUploadFileFraction,
  withUploadSession,
} from './uploadProgress';

export type UploadOpts = { groupId?: string };

function showStorageQuotaAlert(message: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${GROUP_STORAGE_FULL_TITLE}\n\n${message}`);
    return;
  }
  Alert.alert(GROUP_STORAGE_FULL_TITLE, message);
}

async function loadGroupStorageUsage(
  userId: string,
  groupId: string
): Promise<{ used: unknown; max: unknown } | null> {
  try {
    const breakdown = await GroupsService.getStorageBreakdown(groupId, userId);
    return { used: breakdown.usedBytes, max: breakdown.maxBytes };
  } catch {
    try {
      const group = await GroupsService.getGroup(groupId, userId);
      return { used: group.usedStorageBytes, max: group.maxStorageBytes };
    } catch {
      return null;
    }
  }
}

/** Returns false after an alert when remaining space is 0 or smaller than `additionalBytes`. */
export async function ensureGroupCanUpload(
  userId?: string | null,
  groupId?: string | null,
  additionalBytes = 0
): Promise<boolean> {
  const uid = userId?.trim();
  const gid = groupId?.trim();
  if (!gid) return true;
  if (!uid) {
    showStorageQuotaAlert(GROUP_STORAGE_CHECK_FAILED_MESSAGE);
    return false;
  }
  const usage = await loadGroupStorageUsage(uid, gid);
  if (!usage) {
    showStorageQuotaAlert(GROUP_STORAGE_CHECK_FAILED_MESSAGE);
    return false;
  }
  const remaining = groupStorageRemainingBytes(usage.used, usage.max);
  const extra = Math.max(0, Math.floor(additionalBytes));
  if (remaining <= 0) {
    showStorageQuotaAlert(GROUP_STORAGE_FULL_MESSAGE);
    return false;
  }
  if (extra > remaining) {
    showStorageQuotaAlert(groupStorageDoesNotFitMessage(extra, remaining));
    return false;
  }
  return true;
}

function isCancelled(e: unknown): boolean {
  return e instanceof Error && e.message === 'cancelled';
}

export type PickedImageAsset = {
  uri: string;
  contentType: string;
  fileName?: string;
  width?: number;
  height?: number;
};

export type PickedFileAsset = {
  uri: string;
  contentType: string;
  fileName: string;
};

const GIF_TYPE = /^image\/gif$/i;
const VIDEO_TYPE = /^video\//i;
const VIDEO_NAME = /\.(mp4|mov|webm|m4v|avi|mkv|gifv)$/i;
const MEDIA_NAME = /\.(jpe?g|png|gif|webp|heic|heif|avif|mp4|mov|webm|m4v|avi|mkv|gifv)$/i;
const COMPRESSED_MAX_EDGE = 1920;
const COMPRESSED_JPEG_QUALITY = 0.72;
const LIBRARY_SELECTION_LIMIT = 20;
const FILE_SELECTION_LIMIT = 20;

function inferContentType(
  mimeType: string | null | undefined,
  fileName?: string | null,
  uri?: string
): string {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
  const hint = `${fileName || ''} ${uri || ''}`.toLowerCase();
  if (hint.includes('.mp4')) return 'video/mp4';
  if (hint.includes('.mov')) return 'video/quicktime';
  if (hint.includes('.webm')) return 'video/webm';
  if (hint.includes('.m4v')) return 'video/x-m4v';
  if (hint.includes('.avi')) return 'video/x-msvideo';
  if (hint.includes('.mkv')) return 'video/x-matroska';
  if (hint.includes('.gifv')) return 'video/mp4';
  if (hint.includes('.png')) return 'image/png';
  if (hint.includes('.gif')) return 'image/gif';
  if (hint.includes('.webp')) return 'image/webp';
  if (hint.includes('.heic') || hint.includes('.heif')) return 'image/heic';
  if (hint.includes('.avif')) return 'image/avif';
  return 'image/jpeg';
}

function isVideoMedia(contentType: string, fileName?: string | null, uri?: string): boolean {
  if (VIDEO_TYPE.test(contentType)) return true;
  return VIDEO_NAME.test(`${fileName || ''} ${uri || ''}`);
}

function replaceExt(fileName: string | undefined, ext: string): string {
  const raw = (fileName || `photo-${Date.now()}`).trim() || `photo-${Date.now()}`;
  const base = raw.replace(/\.[^.]+$/, '');
  return `${base}.${ext}`;
}

function needsReencode(contentType: string): boolean {
  return !GIF_TYPE.test(contentType);
}

async function getImageSize(
  uri: string,
  width?: number,
  height?: number
): Promise<{ width: number; height: number } | null> {
  if (width && height) return { width, height };
  try {
    return await new Promise((resolve, reject) => {
      Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
    });
  } catch {
    return null;
  }
}

function resizeActions(
  size: { width: number; height: number } | null
): Array<{ resize: { width: number } | { height: number } }> {
  if (!size) return [];
  const edge = Math.max(size.width, size.height);
  if (edge <= COMPRESSED_MAX_EDGE) return [];
  return size.width >= size.height
    ? [{ resize: { width: COMPRESSED_MAX_EDGE } }]
    : [{ resize: { height: COMPRESSED_MAX_EDGE } }];
}

export async function convertPickedImage(asset: PickedImageAsset): Promise<PickedImageAsset> {
  const contentType = inferContentType(asset.contentType, asset.fileName, asset.uri);
  if (isVideoMedia(contentType, asset.fileName, asset.uri) || !needsReencode(contentType)) {
    return { ...asset, contentType };
  }
  const size = await getImageSize(asset.uri, asset.width, asset.height);
  try {
    const result = await manipulateAsync(asset.uri, resizeActions(size), {
      compress: COMPRESSED_JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });
    return {
      uri: result.uri,
      contentType: 'image/jpeg',
      fileName: replaceExt(asset.fileName, 'jpg'),
      width: result.width,
      height: result.height,
    };
  } catch {
    throw new Error('Could not convert this image. Try a JPEG or PNG.');
  }
}

export async function convertWebImageFile(file: File): Promise<File> {
  const contentType = inferContentType(file.type, file.name);
  if (isVideoMedia(contentType, file.name) || !needsReencode(contentType)) return file;
  const objectUrl = URL.createObjectURL(file);
  try {
    const converted = await convertPickedImage({
      uri: objectUrl,
      contentType,
      fileName: file.name,
    });
    const blob = await (await fetch(converted.uri)).blob();
    return new File([blob], converted.fileName || replaceExt(file.name, 'jpg'), {
      type: converted.contentType,
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Converts each image to a compressed JPEG. Videos are kept as-is. Throws `cancelled` if none are media. */
export async function prepareWebImageFiles(files: Iterable<File>): Promise<File[]> {
  const media = [...files].filter(
    (f) => f.type.startsWith('image/') || f.type.startsWith('video/') || MEDIA_NAME.test(f.name)
  );
  if (!media.length) {
    Alert.alert('Upload', 'Please choose an image or video file.');
    throw new Error('cancelled');
  }
  const out: File[] = [];
  for (const file of media) {
    out.push(await convertWebImageFile(file));
  }
  return out;
}

function pickerAssetToPicked(asset: ImagePicker.ImagePickerAsset): PickedImageAsset {
  return {
    uri: asset.uri,
    contentType: inferContentType(asset.mimeType, asset.fileName, asset.uri),
    fileName: asset.fileName ?? undefined,
    width: asset.width,
    height: asset.height,
  };
}

async function convertPickedImages(assets: PickedImageAsset[]): Promise<PickedImageAsset[]> {
  const out: PickedImageAsset[] = [];
  for (const asset of assets) {
    out.push(await convertPickedImage(asset));
  }
  return out;
}

/** Opens the image library; throws `cancelled` if the user backs out. */
export async function pickImageFromLibrary(opts?: UploadOpts & { userId?: string }): Promise<PickedImageAsset> {
  const assets = await pickImagesFromLibrary({ multiple: false, userId: opts?.userId, groupId: opts?.groupId });
  return assets[0];
}

/** Opens the image library. Multiple selection by default. Photos are compressed. */
export async function pickImagesFromLibrary(opts?: {
  multiple?: boolean;
  userId?: string;
  groupId?: string;
}): Promise<PickedImageAsset[]> {
  if (!(await ensureGroupCanUpload(opts?.userId, opts?.groupId))) {
    throw new Error('cancelled');
  }
  const multiple = opts?.multiple ?? true;
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new Error('Photo library access is required to upload photos and videos.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 1,
    allowsMultipleSelection: multiple,
    selectionLimit: multiple ? LIBRARY_SELECTION_LIMIT : 1,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    videoMaxDuration: 120,
  });

  if (result.canceled || !result.assets?.length) {
    throw new Error('cancelled');
  }

  const picked = result.assets.map(pickerAssetToPicked);
  const converted = await convertPickedImages(picked);
  const assets = await keepAssetsThatFit(opts?.userId, opts?.groupId, converted);
  if (!assets.length) throw new Error('cancelled');
  return assets;
}

async function androidCameraMediaType(): Promise<'images' | 'videos'> {
  return new Promise((resolve, reject) => {
    Alert.alert('Camera', 'Take a photo or record a video?', [
      { text: 'Cancel', style: 'cancel', onPress: () => reject(new Error('cancelled')) },
      { text: 'Photo', onPress: () => resolve('images') },
      { text: 'Video', onPress: () => resolve('videos') },
    ]);
  });
}

/** Opens the camera; throws `cancelled` if the user backs out. */
export async function pickImageFromCamera(): Promise<PickedImageAsset> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new Error('Camera access is required to take photos and videos.');
  }
  const mediaTypes: Array<'images' | 'videos'> =
    Platform.OS === 'android' ? [await androidCameraMediaType()] : ['images', 'videos'];
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes,
    quality: 1,
    videoMaxDuration: 120,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled || !result.assets?.length) {
    throw new Error('cancelled');
  }
  return pickerAssetToPicked(result.assets[0]);
}

async function pickCameraImageForUpload(): Promise<PickedImageAsset> {
  const asset = await pickImageFromCamera();
  return convertPickedImage(asset);
}

/** Opens the document picker; throws `cancelled` if the user backs out. */
export async function pickFilesFromDevice(opts?: UploadOpts & { userId?: string }): Promise<PickedFileAsset[]> {
  if (!(await ensureGroupCanUpload(opts?.userId, opts?.groupId))) {
    throw new Error('cancelled');
  }
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: '*/*',
  });
  if (result.canceled || !result.assets?.length) {
    throw new Error('cancelled');
  }
  const picked = result.assets.slice(0, FILE_SELECTION_LIMIT).map((asset) => ({
    uri: asset.uri,
    contentType: asset.mimeType || 'application/octet-stream',
    fileName: asset.name?.trim() || `file-${Date.now()}`,
  }));
  const assets = await keepAssetsThatFit(opts?.userId, opts?.groupId, picked);
  if (!assets.length) throw new Error('cancelled');
  return assets;
}

export async function pickFileFromDevice(): Promise<PickedFileAsset> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: false,
    copyToCacheDirectory: true,
    type: '*/*',
  });
  if (result.canceled || !result.assets?.length) {
    throw new Error('cancelled');
  }
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    contentType: asset.mimeType || 'application/octet-stream',
    fileName: asset.name?.trim() || `file-${Date.now()}`,
  };
}

async function readUploadBody(uri: string): Promise<Blob | ArrayBuffer> {
  if (Platform.OS === 'web') {
    return (await fetch(uri)).blob();
  }
  const file = new ExpoFile(uri);
  return file.arrayBuffer();
}

function bodyByteLength(body: Blob | ArrayBuffer): number {
  return body instanceof Blob ? body.size : body.byteLength;
}

type PutResult = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

type PutSource =
  | { kind: 'uri'; uri: string; byteLength: number }
  | { kind: 'body'; body: Blob | ArrayBuffer; byteLength: number };

async function throwIfPutFailed(put: PutResult): Promise<void> {
  if (put.ok) return;
  let message = `Upload failed (${put.status}).`;
  try {
    const text = await put.text();
    try {
      const json = JSON.parse(text) as { error?: string };
      if (typeof json.error === 'string' && json.error.trim()) {
        message = json.error.trim();
      } else if (text.trim()) {
        message = text.trim();
      }
    } catch {
      if (text.trim()) message = text.trim();
    }
  } catch {
    /* keep default */
  }
  throw new Error(message);
}

function reportPutProgress(loaded: number, total: number) {
  const frac = total > 0 ? Math.min(1, loaded / total) : 0.5;
  setUploadFileFraction(0.05 + 0.9 * frac);
}

function putWithXhr(
  url: string,
  body: Blob | ArrayBuffer,
  contentType: string
): Promise<PutResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) reportPutProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        text: async () => String(xhr.responseText ?? ''),
      });
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.onabort = () => reject(new Error('cancelled'));
    xhr.send(body);
  });
}

async function putNativeFile(url: string, fileUri: string, contentType: string): Promise<PutResult> {
  const task = FileSystem.createUploadTask(
    url,
    fileUri,
    {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': contentType },
    },
    ({ totalBytesSent, totalBytesExpectedToSend }) => {
      reportPutProgress(totalBytesSent, totalBytesExpectedToSend);
    }
  );
  const result = await task.uploadAsync();
  if (!result) throw new Error('Upload failed');
  return {
    ok: result.status >= 200 && result.status < 300,
    status: result.status,
    text: async () => result.body,
  };
}

async function putSource(url: string, source: PutSource, contentType: string): Promise<PutResult> {
  if (source.kind === 'uri' && Platform.OS !== 'web') {
    try {
      return await putNativeFile(url, source.uri, contentType);
    } catch {
      const body = await readUploadBody(source.uri);
      return putWithXhr(url, body, contentType);
    }
  }
  const body = source.kind === 'body' ? source.body : await readUploadBody(source.uri);
  return putWithXhr(url, body, contentType);
}

async function localUriByteLength(uri: string): Promise<number> {
  try {
    const size = new ExpoFile(uri).size;
    if (typeof size === 'number' && size > 0) return size;
  } catch {
    /* fall through */
  }
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && 'size' in info && typeof info.size === 'number' && info.size > 0) {
      return info.size;
    }
  } catch {
    /* fall through */
  }
  const body = await readUploadBody(uri);
  return bodyByteLength(body);
}

async function sourceForLocalUri(uri: string): Promise<PutSource> {
  if (Platform.OS === 'web') {
    const body = await readUploadBody(uri);
    return { kind: 'body', body, byteLength: bodyByteLength(body) };
  }
  const byteLength = await localUriByteLength(uri);
  if (byteLength <= 0) {
    const body = await readUploadBody(uri);
    return { kind: 'body', body, byteLength: bodyByteLength(body) };
  }
  return { kind: 'uri', uri, byteLength };
}

async function keepAssetsThatFit<T extends { uri: string }>(
  userId: string | undefined,
  groupId: string | undefined,
  assets: T[]
): Promise<T[]> {
  if (!groupId?.trim() || assets.length === 0) return assets;
  if (!userId?.trim()) {
    showStorageQuotaAlert(GROUP_STORAGE_CHECK_FAILED_MESSAGE);
    return [];
  }
  const usage = await loadGroupStorageUsage(userId.trim(), groupId.trim());
  if (!usage) {
    showStorageQuotaAlert(GROUP_STORAGE_CHECK_FAILED_MESSAGE);
    return [];
  }
  let remaining = groupStorageRemainingBytes(usage.used, usage.max);
  const kept: T[] = [];
  let warned = false;
  for (const asset of assets) {
    const size = (await sourceForLocalUri(asset.uri)).byteLength;
    if (size <= 0) {
      if (!warned) {
        showStorageQuotaAlert(GROUP_STORAGE_UNKNOWN_SIZE_MESSAGE);
        warned = true;
      }
      continue;
    }
    if (remaining <= 0 || size > remaining) {
      if (!warned) {
        showStorageQuotaAlert(
          remaining <= 0 ? GROUP_STORAGE_FULL_MESSAGE : groupStorageDoesNotFitMessage(size, remaining)
        );
        warned = true;
      }
      continue;
    }
    kept.push(asset);
    remaining -= size;
  }
  return kept;
}

async function presignAndPut(input: {
  userId: string;
  contentType: string;
  filename?: string;
  source: PutSource;
  groupId?: string;
}): Promise<string> {
  ensureUploadSession();
  setUploadFileFraction(0.04);
  try {
    const groupId = input.groupId?.trim() || undefined;
    if (groupId && input.source.byteLength <= 0) {
      showStorageQuotaAlert(GROUP_STORAGE_UNKNOWN_SIZE_MESSAGE);
      throw new Error('cancelled');
    }
    if (!(await ensureGroupCanUpload(input.userId, groupId, input.source.byteLength))) {
      throw new Error('cancelled');
    }
    let presign;
    try {
      presign = await StorageService.presignUpload({
        userId: input.userId,
        contentType: input.contentType,
        filename: input.filename,
        groupId,
        contentLength: input.source.byteLength,
      });
    } catch (e) {
      const msg = apiErrorMessage(e, 'Upload failed');
      if (/storage limit/i.test(msg) || /not enough storage/i.test(msg) || /contentLength/i.test(msg)) {
        showStorageQuotaAlert(msg);
        throw new Error('cancelled');
      }
      throw new Error(msg);
    }

    const put = await putSource(presign.uploadUrl, input.source, input.contentType);
    await throwIfPutFailed(put);
    setUploadFileFraction(0.96);
    if (groupId) {
      try {
        await StorageService.completeUpload({
          userId: input.userId,
          publicUrl: presign.publicUrl,
          groupId,
          filename: input.filename,
        });
      } catch (e) {
        const msg = apiErrorMessage(e, 'Upload failed');
        if (/storage limit/i.test(msg) || /not enough storage/i.test(msg)) {
          showStorageQuotaAlert(msg);
          throw new Error('cancelled');
        }
        throw new Error(msg);
      }
    }
    completeUploadFile();
    return presign.publicUrl;
  } catch (e) {
    abandonUploadSessionIfAuto();
    throw e;
  }
}

/**
 * Presign + PUT to S3. Public URL is the S3 object URL.
 */
export async function uploadPickedImageAsset(
  userId: string,
  asset: PickedImageAsset,
  opts?: UploadOpts
): Promise<string> {
  if (!userId) throw new Error('You must be signed in to upload photos.');
  const source = await sourceForLocalUri(asset.uri);
  return presignAndPut({
    userId,
    contentType: asset.contentType,
    filename: asset.fileName,
    source,
    groupId: opts?.groupId,
  });
}

export async function uploadPickedFileAsset(
  userId: string,
  asset: PickedFileAsset,
  opts?: UploadOpts
): Promise<string> {
  if (!userId) throw new Error('You must be signed in to upload files.');
  const source = await sourceForLocalUri(asset.uri);
  return presignAndPut({
    userId,
    contentType: asset.contentType,
    filename: asset.fileName,
    source,
    groupId: opts?.groupId,
  });
}

/** Picks one or more files from the device and uploads them. Throws `cancelled` when picker closes. */
export async function pickAndUploadFileFromDevice(
  userId: string,
  opts?: UploadOpts
): Promise<{ publicUrl: string; fileName: string }[]> {
  const picked = await pickFilesFromDevice({ userId, groupId: opts?.groupId });
  const assets = await keepAssetsThatFit(userId, opts?.groupId, picked);
  if (!assets.length) throw new Error('cancelled');
  return withUploadSession(assets.length, async () => {
    const uploaded: { publicUrl: string; fileName: string }[] = [];
    for (const asset of assets) {
      const publicUrl = await uploadPickedFileAsset(userId, asset, opts);
      uploaded.push({ publicUrl, fileName: asset.fileName });
    }
    return uploaded;
  });
}

/** File attachments use a moijia.com share URL instead of the raw S3 URL. */
export function uploadUrlToDownloadUrl(sourceUrl: string): string {
  return toPublicFacingMediaUrl(sourceUrl);
}

/** Picks from library then presigns + PUT. Throws `cancelled` if the user backs out of the picker. */
export async function pickAndUploadImageFromLibrary(userId: string, opts?: UploadOpts): Promise<string> {
  const picked = await pickImagesFromLibrary({ multiple: false, userId, groupId: opts?.groupId });
  const assets = await keepAssetsThatFit(userId, opts?.groupId, picked);
  if (!assets.length) throw new Error('cancelled');
  return uploadPickedImageAsset(userId, assets[0], opts);
}

export async function pickAndUploadImagesFromLibrary(userId: string, opts?: UploadOpts): Promise<string[]> {
  const picked = await pickImagesFromLibrary({ multiple: true, userId, groupId: opts?.groupId });
  const assets = await keepAssetsThatFit(userId, opts?.groupId, picked);
  if (!assets.length) throw new Error('cancelled');
  return withUploadSession(assets.length, async () => {
    const urls: string[] = [];
    for (const asset of assets) {
      urls.push(await uploadPickedImageAsset(userId, asset, opts));
    }
    return urls;
  });
}

export async function pickAndUploadImageFromCamera(userId: string, opts?: UploadOpts): Promise<string> {
  if (!(await ensureGroupCanUpload(userId, opts?.groupId))) {
    throw new Error('cancelled');
  }
  const asset = await pickCameraImageForUpload();
  return uploadPickedImageAsset(userId, asset, opts);
}

/**
 * Opens the image picker immediately (no intermediate dialog). Returns public URLs, or undefined if cancelled / not signed in.
 */
export async function pickAndUploadCoverPhoto(
  userId: string,
  opts?: UploadOpts
): Promise<string[] | undefined> {
  if (!userId.trim()) {
    Alert.alert('Upload', 'You must be signed in to upload photos.');
    return undefined;
  }
  try {
    return await pickAndUploadImagesFromLibrary(userId, opts);
  } catch (e) {
    if (isCancelled(e)) return undefined;
    Alert.alert('Upload', e instanceof Error ? e.message : 'Upload failed');
    return undefined;
  }
}

export async function takeAndUploadCoverPhoto(userId: string, opts?: UploadOpts): Promise<string | undefined> {
  if (!userId.trim()) {
    Alert.alert('Upload', 'You must be signed in to upload photos.');
    return undefined;
  }
  try {
    return await pickAndUploadImageFromCamera(userId, opts);
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

export async function uploadPendingAvatarFile(
  userId: string,
  pending: PendingAvatarFile,
  opts?: UploadOpts
): Promise<string> {
  if (pending.kind === 'web') {
    return uploadWebImageFile(userId, pending.file, opts);
  }
  return uploadPickedImageAsset(userId, pending.asset, opts);
}

export function revokeCoverPhotoDraftPreview(d: CoverPhotoDraft) {
  if (d.kind === 'pending' && d.pending.kind === 'web') {
    URL.revokeObjectURL(d.pending.objectUrl);
  }
}

/** Upload any pending drafts in order; revokes web object URLs after successful upload. */
export async function uploadCoverPhotoDrafts(
  userId: string,
  drafts: CoverPhotoDraft[],
  opts?: UploadOpts
): Promise<string[]> {
  const pendingCount = drafts.filter((d) => d.kind === 'pending').length;
  if (pendingCount > 0 && !(await ensureGroupCanUpload(userId, opts?.groupId))) {
    throw new Error('cancelled');
  }
  const run = async () => {
    const out: string[] = [];
    for (const d of drafts) {
      if (d.kind === 'remote') {
        out.push(d.url);
      } else {
        const url = await uploadPendingAvatarFile(userId, d.pending, opts);
        if (d.pending.kind === 'web') {
          URL.revokeObjectURL(d.pending.objectUrl);
        }
        out.push(url);
      }
    }
    return out;
  };
  return pendingCount > 0 ? withUploadSession(pendingCount, run) : run();
}

function pendingFromPicked(asset: PickedImageAsset): { previewUri: string; pending: PendingAvatarFile } {
  return { previewUri: asset.uri, pending: { kind: 'native', asset } };
}

/** Native image library pick — no network (use with web file input + {@link createWebDeferredCoverPhoto} on web). */
export async function pickDeferredCoverPhotoNative(opts?: UploadOpts & { userId?: string }): Promise<Array<{
  previewUri: string;
  pending: PendingAvatarFile;
}> | null> {
  if (!(await ensureGroupCanUpload(opts?.userId, opts?.groupId))) {
    return null;
  }
  try {
    const picked = await pickImagesFromLibrary({
      multiple: true,
      userId: opts?.userId,
      groupId: opts?.groupId,
    });
    const assets = await keepAssetsThatFit(opts?.userId, opts?.groupId, picked);
    if (!assets.length) return null;
    return assets.map(pendingFromPicked);
  } catch (e) {
    if (isCancelled(e)) return null;
    Alert.alert('Photo', e instanceof Error ? e.message : 'Could not pick image');
    return null;
  }
}

export async function pickDeferredCoverPhotoFromCamera(opts?: UploadOpts & { userId?: string }): Promise<{
  previewUri: string;
  pending: PendingAvatarFile;
} | null> {
  if (!(await ensureGroupCanUpload(opts?.userId, opts?.groupId))) {
    return null;
  }
  try {
    const asset = await pickCameraImageForUpload();
    const fitted = await keepAssetsThatFit(opts?.userId, opts?.groupId, [asset]);
    if (!fitted.length) return null;
    return pendingFromPicked(fitted[0]);
  } catch (e) {
    if (isCancelled(e)) return null;
    Alert.alert('Photo', e instanceof Error ? e.message : 'Could not take photo');
    return null;
  }
}

export async function keepWebFilesThatFit(
  userId: string | undefined,
  groupId: string | undefined,
  files: File[]
): Promise<File[]> {
  if (!groupId?.trim() || files.length === 0) return files;
  if (!userId?.trim()) {
    showStorageQuotaAlert(GROUP_STORAGE_CHECK_FAILED_MESSAGE);
    return [];
  }
  const usage = await loadGroupStorageUsage(userId.trim(), groupId.trim());
  if (!usage) {
    showStorageQuotaAlert(GROUP_STORAGE_CHECK_FAILED_MESSAGE);
    return [];
  }
  let remaining = groupStorageRemainingBytes(usage.used, usage.max);
  const kept: File[] = [];
  let warned = false;
  for (const file of files) {
    if (file.size <= 0) {
      if (!warned) {
        showStorageQuotaAlert(GROUP_STORAGE_UNKNOWN_SIZE_MESSAGE);
        warned = true;
      }
      continue;
    }
    if (remaining <= 0 || file.size > remaining) {
      if (!warned) {
        showStorageQuotaAlert(
          remaining <= 0 ? GROUP_STORAGE_FULL_MESSAGE : groupStorageDoesNotFitMessage(file.size, remaining)
        );
        warned = true;
      }
      continue;
    }
    kept.push(file);
    remaining -= file.size;
  }
  return kept;
}

export function createWebDeferredCoverPhoto(file: File): { previewUri: string; pending: PendingAvatarFile } {
  const objectUrl = URL.createObjectURL(file);
  return { previewUri: objectUrl, pending: { kind: 'web', file, objectUrl } };
}

export function coverPhotoDraftDisplayUri(d: CoverPhotoDraft): string {
  return d.kind === 'remote' ? d.url : d.previewUri;
}

export function coverPhotoDraftIsVideo(d: CoverPhotoDraft): boolean {
  if (d.kind === 'pending') {
    if (d.pending.kind === 'web') {
      return isVideoMedia(d.pending.file.type, d.pending.file.name);
    }
    return isVideoMedia(d.pending.asset.contentType, d.pending.asset.fileName, d.pending.asset.uri);
  }
  return isVideoFileUrl(d.url);
}

export async function uploadWebImageFile(userId: string, file: File, opts?: UploadOpts): Promise<string> {
  if (!userId) throw new Error('You must be signed in to upload photos.');
  const ready = isVideoMedia(file.type, file.name) ? file : await convertWebImageFile(file);
  const contentType = inferContentType(ready.type, ready.name);
  return presignAndPut({
    userId,
    contentType,
    filename: ready.name,
    source: { kind: 'body', body: ready, byteLength: ready.size },
    groupId: opts?.groupId,
  });
}

export { isCancelled };
