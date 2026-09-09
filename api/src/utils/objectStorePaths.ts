import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { createS3Client, getS3Config, type S3Config } from './s3Config';

export const STORAGE_KEY_PREFIX = 'storage';

function decodedPath(pathname: string): string {
  return pathname
    .replace(/^\//, '')
    .split('/')
    .map((s) => decodeURIComponent(s))
    .join('/');
}

function isSafeKeySegment(s: string): boolean {
  return /^[A-Za-z0-9._~-]{1,200}$/.test(s);
}

/** `storage/{userId}/{file}` from `/f/{userId}/{file}` (moijia.com share URLs). */
export function objectKeyFromMediaSharePath(pathname: string): string | null {
  if (!pathname || pathname.includes('..') || pathname.includes('\\')) return null;
  const path = decodedPath(pathname);
  const m = path.match(/^f\/([^/]+)\/([^/]+)$/);
  if (!m) return null;
  const userId = m[1];
  const fileName = m[2];
  if (!isSafeKeySegment(userId) || !isSafeKeySegment(fileName)) return null;
  return `${STORAGE_KEY_PREFIX}/${userId}/${fileName}`;
}

export function urlMatchesOurObjectStore(url: string, cfg: S3Config): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  try {
    if (u.origin === new URL(cfg.publicBase).origin) return true;
  } catch {
    /* ignore */
  }
  if (u.host === `${cfg.bucket}.s3.${cfg.region}.amazonaws.com`) return true;
  if (u.host === `${cfg.bucket}.s3.amazonaws.com`) return true;
  if (u.host === `s3.${cfg.region}.amazonaws.com`) return true;
  if (u.host === 's3.amazonaws.com') return true;
  return false;
}

function objectKeyFromUrl(u: URL, cfg: S3Config): string | null {
  let path = decodedPath(u.pathname);
  const bucketPrefix = `${cfg.bucket}/`;
  if (
    (u.host === `s3.${cfg.region}.amazonaws.com` || u.host === 's3.amazonaws.com') &&
    path.startsWith(bucketPrefix)
  ) {
    path = path.slice(bucketPrefix.length);
  } else {
    try {
      const basePath = decodedPath(new URL(cfg.publicBase).pathname).replace(/\/$/, '');
      if (basePath && path.startsWith(`${basePath}/`)) {
        path = path.slice(basePath.length + 1);
      }
    } catch {
      /* ignore */
    }
  }
  if (!path.startsWith(`${STORAGE_KEY_PREFIX}/`)) return null;
  return path;
}

export function objectKeyOwnedByUser(objectKey: string, userId: string): boolean {
  if (!userId) return false;
  return objectKey.startsWith(`${STORAGE_KEY_PREFIX}/${userId}/`);
}

export function userIdFromUploadObjectKey(objectKey: string): string | null {
  const prefix = `${STORAGE_KEY_PREFIX}/`;
  if (!objectKey.startsWith(prefix)) return null;
  const rest = objectKey.slice(prefix.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  const userId = rest.slice(0, slash).trim();
  return userId || null;
}

export function userIdFromUploadUrl(sourceUrl: string, cfg?: S3Config | null): string | null {
  const key = tryExtractUploadObjectKey(sourceUrl, cfg);
  return key ? userIdFromUploadObjectKey(key) : null;
}

export function uploadUrlOwnedByUser(sourceUrl: string, userId: string, cfg?: S3Config | null): boolean {
  const key = tryExtractUploadObjectKey(sourceUrl, cfg);
  return !!key && objectKeyOwnedByUser(key, userId);
}

/** Object key from a stored public S3 URL or a `moijia.com/f/...` share URL. */
export function tryExtractUploadObjectKey(sourceUrl: string, cfg?: S3Config | null): string | null {
  if (!sourceUrl?.trim()) return null;
  let u: URL;
  try {
    u = new URL(sourceUrl.trim());
  } catch {
    return null;
  }
  if (u.pathname.includes('..') || u.pathname.includes('\\')) return null;

  const shareKey = objectKeyFromMediaSharePath(u.pathname);
  if (shareKey) return shareKey;

  const resolved = cfg ?? getS3Config();
  if (!resolved || !urlMatchesOurObjectStore(sourceUrl, resolved)) return null;
  return objectKeyFromUrl(u, resolved);
}

/** Path-style `https://s3.{region}.amazonaws.com/{bucket}/{key}` (never `{bucket}.s3...`). */
export function pathStylePublicFileUrl(key: string, cfg: S3Config): string {
  const encodedKey = key.split('/').map((s) => encodeURIComponent(s)).join('/');
  return `https://s3.${cfg.region}.amazonaws.com/${cfg.bucket}/${encodedKey}`;
}

export function publicFileUrl(key: string, cfg: S3Config): string {
  try {
    const host = new URL(cfg.publicBase).hostname;
    if (/\.s3(?:\.[a-z0-9-]+)?\.amazonaws\.com$/i.test(host)) {
      return pathStylePublicFileUrl(key, cfg);
    }
  } catch {
    return pathStylePublicFileUrl(key, cfg);
  }
  return `${cfg.publicBase}/${key.split('/').map((s) => encodeURIComponent(s)).join('/')}`;
}

export async function managedUploadByteSize(sourceUrl: string): Promise<number | null> {
  const cfg = getS3Config();
  if (!cfg) return null;
  const key = tryExtractUploadObjectKey(sourceUrl, cfg);
  if (!key) return null;
  return storageKeyByteSize(key, cfg);
}

export async function storageKeyByteSize(key: string, cfg?: S3Config | null): Promise<number | null> {
  const resolved = cfg ?? getS3Config();
  if (!resolved) return null;
  try {
    const client = createS3Client(resolved);
    const out = await client.send(new HeadObjectCommand({ Bucket: resolved.bucket, Key: key }));
    return typeof out.ContentLength === 'number' ? out.ContentLength : null;
  } catch {
    return null;
  }
}
