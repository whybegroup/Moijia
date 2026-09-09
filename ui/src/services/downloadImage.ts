import { Linking, Platform, Share } from 'react-native';
import { File as ExpoFile, Paths } from 'expo-file-system';
import { ensureCachedImageFileUri, peekCachedImageFileUri } from './imageDiskCache';
import { isDirectRenderableImageUrl, resolveImageViewUrls, toRenderableImageUrl } from './resolveImageViewUrls';
import { shareUrl } from '../utils/shareContent';
import { toPublicFacingMediaUrl } from '../utils/mediaShareUrl';

function extensionFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\.([a-z0-9]{1,8})$/i);
    if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  } catch {
    /* ignore */
  }
  return 'bin';
}

function fileNameFromUrl(url: string): string {
  const ext = extensionFromUrl(url);
  return `moijia-${Date.now()}.${ext}`;
}

async function resolveDownloadUri(
  storedUrl: string,
  urlMap?: Map<string, string> | Record<string, string>
): Promise<string> {
  const trimmed = storedUrl.trim();
  if (!trimmed) throw new Error('No image to download');
  if (isDirectRenderableImageUrl(trimmed)) return toRenderableImageUrl(trimmed);

  const diskHit = peekCachedImageFileUri(trimmed);
  if (diskHit) return diskHit;

  let viewUrl: string | null = null;
  if (urlMap instanceof Map) {
    const mapped = urlMap.get(trimmed);
    if (mapped?.trim()) viewUrl = mapped.trim();
  } else if (urlMap && typeof urlMap === 'object') {
    const mapped = urlMap[trimmed];
    if (mapped?.trim()) viewUrl = mapped.trim();
  }
  if (!viewUrl) {
    const resolved = await resolveImageViewUrls([trimmed]);
    viewUrl = (resolved.get(trimmed) ?? trimmed).trim();
  }

  const cached = await ensureCachedImageFileUri(trimmed, viewUrl);
  return cached ?? viewUrl;
}

async function downloadOnWeb(uri: string): Promise<void> {
  const name = fileNameFromUrl(uri);
  try {
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(uri, '_blank', 'noopener,noreferrer');
  }
}

async function shareOnWeb(uri: string): Promise<void> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const name = fileNameFromUrl(uri);
  if (nav && typeof nav.share === 'function') {
    try {
      const res = await fetch(uri);
      if (res.ok) {
        const blob = await res.blob();
        const WebFile = (globalThis as unknown as { File?: typeof globalThis.File }).File;
        if (WebFile) {
          const file = new WebFile([blob], name, { type: blob.type || 'image/jpeg' });
          const payload = { files: [file], title: 'Photo' };
          if (typeof nav.canShare !== 'function' || nav.canShare(payload)) {
            await nav.share(payload);
            return;
          }
        }
      }
      await nav.share({ title: 'Photo', url: uri });
      return;
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'name' in e && (e as { name?: string }).name === 'AbortError') {
        return;
      }
    }
  }
  await Share.share({ message: uri, url: uri, title: 'Photo' });
}

function mappedViewUrl(
  storedUrl: string,
  urlMap?: Map<string, string> | Record<string, string>
): string | null {
  if (urlMap instanceof Map) {
    const mapped = urlMap.get(storedUrl)?.trim();
    return mapped || null;
  }
  if (urlMap && typeof urlMap === 'object') {
    const mapped = urlMap[storedUrl]?.trim();
    return mapped || null;
  }
  return null;
}

function asHttpUrl(url: string): string | null {
  const t = toRenderableImageUrl(url.trim());
  return /^https?:\/\//i.test(t) ? t : null;
}

function asShareableHttpUrl(url: string): string | null {
  const http = asHttpUrl(url);
  return http ? toPublicFacingMediaUrl(http) : null;
}

/** Public HTTP(S) URL for sharing (S3 / stored link), never a local cache path. */
export async function resolveShareableHttpUrl(
  storedUrl: string,
  urlMap?: Map<string, string> | Record<string, string>
): Promise<string | null> {
  const trimmed = storedUrl?.trim();
  if (!trimmed) return null;
  const direct = asShareableHttpUrl(trimmed);
  if (direct) return direct;
  const mapped = mappedViewUrl(trimmed, urlMap);
  if (mapped) {
    const http = asShareableHttpUrl(mapped);
    if (http) return http;
  }
  try {
    const resolved = await resolveImageViewUrls([trimmed]);
    const view = resolved.get(trimmed)?.trim();
    if (view) return asShareableHttpUrl(view);
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Present the OS share sheet with a shareable HTTP link (S3 / stored URL).
 * Local drafts with no public URL still share the file.
 */
export async function shareImage(
  storedUrl: string,
  urlMap?: Map<string, string> | Record<string, string>
): Promise<void> {
  const link = await resolveShareableHttpUrl(storedUrl, urlMap);
  if (link) {
    await shareUrl({
      title: 'Share',
      message: link,
      url: link,
      copiedToast: 'Link copied',
    });
    return;
  }

  const uri = await resolveDownloadUri(storedUrl, urlMap);
  if (!uri) throw new Error('No image to share');

  if (Platform.OS === 'web') {
    await shareOnWeb(uri);
    return;
  }

  let localUri = uri;
  if (!/^file:\/\//i.test(uri)) {
    const name = fileNameFromUrl(uri);
    const destination = new ExpoFile(Paths.cache, name);
    const file = await ExpoFile.downloadFileAsync(uri, destination, { idempotent: true });
    localUri = file.uri;
  }

  try {
    if (Platform.OS === 'ios') {
      await Share.share({ url: localUri });
    } else {
      await Share.share({
        message: localUri,
        title: 'Share photo',
        url: localUri,
      });
    }
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'message' in e) {
      const msg = String((e as { message?: string }).message ?? '');
      if (/cancel|dismiss/i.test(msg)) return;
    }
    throw e instanceof Error ? e : new Error('Could not share image');
  }
}

/**
 * Download (web) or save/share (native).
 * Uses React Native `Share` so no ExpoSharing native module is required.
 */
export async function downloadOrShareImage(
  storedUrl: string,
  urlMap?: Map<string, string> | Record<string, string>
): Promise<void> {
  const uri = await resolveDownloadUri(storedUrl, urlMap);
  if (!uri) throw new Error('No image to download');

  if (Platform.OS === 'web') {
    await downloadOnWeb(uri);
    return;
  }

  let localUri = uri;
  if (!/^file:\/\//i.test(uri)) {
    const name = fileNameFromUrl(uri);
    const destination = new ExpoFile(Paths.cache, name);
    const file = await ExpoFile.downloadFileAsync(uri, destination, { idempotent: true });
    localUri = file.uri;
  }

  try {
    if (Platform.OS === 'ios') {
      await Share.share({ url: localUri });
    } else {
      await Share.share({
        message: localUri,
        title: 'Save image',
        url: localUri,
      });
    }
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'message' in e) {
      const msg = String((e as { message?: string }).message ?? '');
      if (/cancel|dismiss/i.test(msg)) return;
    }
    const canOpen = await Linking.canOpenURL(uri);
    if (canOpen) {
      await Linking.openURL(uri);
      return;
    }
    throw e instanceof Error ? e : new Error('Could not share image');
  }
}
