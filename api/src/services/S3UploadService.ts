import { DeleteObjectCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import type {
  PresignGetBatchResponse,
  PresignGetEntry,
  PresignUploadResponse,
} from '../models/Upload';
import { groupStorage } from './GroupStorageService';
import { createS3Client, getS3Config, requireS3Config } from '../utils/s3Config';
import {
  publicFileUrl,
  STORAGE_KEY_PREFIX,
  storageKeyByteSize,
  tryExtractUploadObjectKey,
} from '../utils/objectStorePaths';

const PRESIGN_TTL_SECONDS = 300;
const PRESIGN_GET_MAX_URLS = 50;

function extensionFromFilenameOrType(filename: string | undefined, contentType: string): string {
  if (filename?.includes('.')) {
    const ext = filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
    if (ext && ext.length <= 8) return ext;
  }
  if (contentType.includes('pdf')) return 'pdf';
  if (contentType.includes('json')) return 'json';
  if (contentType.includes('zip')) return 'zip';
  if (contentType.includes('text/html')) return 'html';
  if (contentType.includes('text/plain')) return 'txt';
  if (contentType.includes('msword')) return 'doc';
  if (contentType.includes('officedocument.wordprocessingml.document')) return 'docx';
  if (contentType.includes('spreadsheetml')) return 'xlsx';
  if (contentType.includes('presentationml')) return 'pptx';
  if (contentType.includes('opendocument.text')) return 'odt';
  if (contentType.includes('opendocument.spreadsheet')) return 'ods';
  if (contentType.includes('opendocument.presentation')) return 'odp';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('mp4')) return 'mp4';
  if (contentType.includes('quicktime') || contentType.includes('mov')) return 'mov';
  if (contentType.includes('webm')) return 'webm';
  if (contentType.includes('matroska')) return 'mkv';
  if (contentType.includes('m4v')) return 'm4v';
  if (contentType.startsWith('video/')) return 'mp4';
  return 'bin';
}

export class S3UploadService {
  public isConfigured(): boolean {
    try {
      requireS3Config();
      return true;
    } catch {
      return false;
    }
  }

  public async presignUpload(input: {
    userId: string;
    contentType: string;
    filename?: string;
    groupId?: string;
    contentLength?: number;
  }): Promise<PresignUploadResponse> {
    const cfg = requireS3Config();
    if (!input.contentType?.trim()) {
      throw Object.assign(new Error('contentType is required'), { status: 400 });
    }

    const groupId = input.groupId?.trim();
    if (groupId) {
      const extra = input.contentLength;
      if (extra == null || !Number.isFinite(extra) || extra < 0) {
        throw Object.assign(new Error('contentLength is required when uploading to a group'), {
          status: 400,
        });
      }
      await groupStorage.assertCanAddBytes(groupId, input.userId, extra);
    }

    const ext = extensionFromFilenameOrType(input.filename, input.contentType);
    const key = `${STORAGE_KEY_PREFIX}/${input.userId}/${randomUUID()}.${ext}`;
    const client = createS3Client(cfg);
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        ContentType: input.contentType,
      }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );

    return {
      uploadUrl,
      publicUrl: publicFileUrl(key, cfg),
      objectKey: key,
      expiresIn: PRESIGN_TTL_SECONDS,
    };
  }

  public async completeUpload(input: {
    userId: string;
    publicUrl: string;
    groupId?: string;
    filename?: string;
  }): Promise<void> {
    const cfg = requireS3Config();
    const key = tryExtractUploadObjectKey(input.publicUrl, cfg);
    if (!key) {
      throw Object.assign(new Error('URL is not an app-managed upload'), { status: 400 });
    }
    const prefix = `${STORAGE_KEY_PREFIX}/${input.userId}/`;
    if (!key.startsWith(prefix)) {
      throw Object.assign(new Error('You can only complete your own uploads'), { status: 403 });
    }

    const groupId = input.groupId?.trim();
    if (!groupId) return;

    let byteSize: number | null = null;
    for (let i = 0; i < 3; i++) {
      byteSize = await storageKeyByteSize(key, cfg);
      if (byteSize != null) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (byteSize == null) {
      throw Object.assign(new Error('Upload not found in S3'), { status: 400 });
    }

    const already = await groupStorage.trackedBytesForKey(key);
    try {
      await groupStorage.assertCanAddBytes(groupId, input.userId, Math.max(0, byteSize - already));
    } catch (e) {
      await this.deleteManagedUploadBestEffort(input.publicUrl);
      throw e;
    }
    await groupStorage.recordUpload({
      groupId,
      objectKey: key,
      publicUrl: input.publicUrl,
      byteSize,
      originalName: input.filename,
    });
  }

  public async deleteUploadedObject(userId: string, sourceUrl: string): Promise<void> {
    const cfg = requireS3Config();
    const key = tryExtractUploadObjectKey(sourceUrl, cfg);
    if (!key) {
      throw Object.assign(new Error('URL is not an app-managed upload'), { status: 400 });
    }
    const prefix = `${STORAGE_KEY_PREFIX}/${userId}/`;
    if (!key.startsWith(prefix)) {
      throw Object.assign(new Error('You can only delete your own uploads'), { status: 403 });
    }
    const client = createS3Client(cfg);
    await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    await groupStorage.removeByObjectKey(key);
  }

  public async deleteManagedUploadBestEffort(sourceUrl: string): Promise<void> {
    try {
      const cfg = getS3Config();
      const key = tryExtractUploadObjectKey(sourceUrl, cfg);
      if (!key) return;
      if (cfg) {
        const client = createS3Client(cfg);
        await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
      }
      await groupStorage.removeByObjectKey(key);
    } catch {
      /* best-effort */
    }
  }

  /** Public S3 URLs pass through; external URLs pass through. */
  public async presignGetBatch(sourceUrls: string[]): Promise<PresignGetBatchResponse> {
    const cfg = requireS3Config();
    const trimmed = sourceUrls.map((s) => s?.trim()).filter((s): s is string => !!s);
    const unique = [...new Set(trimmed)];
    if (unique.length > PRESIGN_GET_MAX_URLS) {
      throw Object.assign(new Error(`At most ${PRESIGN_GET_MAX_URLS} URLs per request`), {
        status: 400,
      });
    }

    const results: PresignGetEntry[] = unique.map((sourceUrl) => {
      const key = tryExtractUploadObjectKey(sourceUrl, cfg);
      if (!key) {
        return { sourceUrl, viewUrl: sourceUrl, expiresIn: 0 };
      }
      return { sourceUrl, viewUrl: publicFileUrl(key, cfg), expiresIn: 0 };
    });

    return { results };
  }

  public async presignDownloadUrl(sourceUrl: string): Promise<string> {
    const cfg = requireS3Config();
    const key = tryExtractUploadObjectKey(sourceUrl, cfg);
    if (!key) return sourceUrl;
    const fileName = key.split('/').pop() || 'download';
    const client = createS3Client(cfg);
    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, '')}"`,
      }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );
  }
}
