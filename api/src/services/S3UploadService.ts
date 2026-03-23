import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import type {
  PresignGetBatchResponse,
  PresignGetEntry,
  PresignUploadResponse,
} from '../models/Upload';

/**
 * Configure via environment (placeholders until you wire real credentials):
 *   S3_BUCKET              — bucket name
 *   S3_REGION              — e.g. us-east-1
 *   AWS_ACCESS_KEY_ID      — IAM user with s3:PutObject on uploads/*
 *   AWS_SECRET_ACCESS_KEY
 *   S3_PUBLIC_URL_BASE     — optional; default https://{bucket}.s3.{region}.amazonaws.com
 *                           Use CloudFront or custom domain if applicable.
 *
 * Bucket CORS must allow PUT from your app origins (Expo web / dev client), e.g.:
 *   AllowedMethods: PUT, OPTIONS
 *   AllowedHeaders: *
 *   AllowedOrigins: your dev/prod origins (http://localhost:8081, etc.)
 *
 * AWS SDK v3 defaults to CRC32 in presigned PutObject URLs; browsers rarely satisfy that.
 * We set requestChecksumCalculation to WHEN_REQUIRED so plain fetch + Content-Type works.
 *
 * Display in the app: clients call POST /uploads/presign-get with stored URLs; the API returns
 * short-lived presigned GET URLs so the bucket can stay private (IAM GetObject on the API user).
 * Do not use object ACLs (x-amz-acl): buckets with Object Ownership "Bucket owner enforced" reject them with 403.
 */
const DEFAULT_REGION = 'us-west-1';
const DEFAULT_BUCKET = 'moija-343569715951-us-west-1-an';
const PRESIGN_TTL_SECONDS = 300;
const PRESIGN_GET_MAX_URLS = 50;

function presignGetTtlSeconds(): number {
  const n = Number(process.env.S3_PRESIGN_GET_TTL_SECONDS);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 604800) : 3600;
}

function getS3Config(): { bucket: string; region: string; publicBase: string } | null {
  const keyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secret = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!keyId || !secret) {
    return null;
  }
  const bucket = process.env.S3_BUCKET?.trim() || DEFAULT_BUCKET;
  const region = process.env.S3_REGION?.trim() || DEFAULT_REGION;
  const explicitBase = process.env.S3_PUBLIC_URL_BASE?.trim().replace(/\/$/, '');
  const publicBase =
    explicitBase || `https://${bucket}.s3.${region}.amazonaws.com`;
  return { bucket, region, publicBase };
}

/** True if the URL is hosted on our configured bucket (virtual-hosted or custom public base). */
function urlMatchesOurObjectStore(url: string, cfg: { bucket: string; region: string; publicBase: string }): boolean {
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
  const vh = `${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
  if (u.host === vh) return true;
  if (u.host === `${cfg.bucket}.s3.amazonaws.com`) return true;
  return false;
}

/**
 * Returns S3 object key for URLs we issued (uploads/{userId}/...), or null if not ours / invalid.
 */
function tryExtractUploadObjectKey(
  sourceUrl: string,
  cfg: { bucket: string; region: string; publicBase: string },
): string | null {
  if (!sourceUrl?.trim()) return null;
  let u: URL;
  try {
    u = new URL(sourceUrl.trim());
  } catch {
    return null;
  }
  if (!urlMatchesOurObjectStore(sourceUrl, cfg)) return null;
  let path = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
  path = decodeURIComponent(path);
  if (!path.startsWith('uploads/')) return null;
  if (path.includes('..') || path.includes('\\')) return null;
  return path;
}

function extensionFromFilenameOrType(filename: string | undefined, contentType: string): string {
  if (filename?.includes('.')) {
    const ext = filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
    if (ext && ext.length <= 8) return ext;
  }
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return 'jpg';
}

export class S3UploadService {
  public isConfigured(): boolean {
    return getS3Config() !== null;
  }

  public async presignUpload(input: {
    userId: string;
    contentType: string;
    filename?: string;
  }): Promise<PresignUploadResponse> {
    const cfg = getS3Config();
    if (!cfg) {
      throw Object.assign(
        new Error(
          'S3 uploads are not configured. Set S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.',
        ),
        { status: 503 },
      );
    }

    if (!input.contentType.startsWith('image/')) {
      throw Object.assign(new Error('Only image/* content types are allowed'), { status: 400 });
    }

    const ext = extensionFromFilenameOrType(input.filename, input.contentType);
    const key = `uploads/${input.userId}/${randomUUID()}.${ext}`;

    const client = new S3Client({
      region: cfg.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      // Presigned URLs must match what the browser sends; default WHEN_SUPPORTED adds
      // x-amz-checksum-* query params that break simple PUT from fetch.
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });

    const command = new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      ContentType: input.contentType,
    });

    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: PRESIGN_TTL_SECONDS,
    });

    const publicUrl = `${cfg.publicBase}/${key}`;

    return {
      uploadUrl,
      publicUrl,
      objectKey: key,
      expiresIn: PRESIGN_TTL_SECONDS,
    };
  }

  /** Remove an object the app uploaded; caller must own the `uploads/{userId}/` prefix. */
  public async deleteUploadedObject(userId: string, sourceUrl: string): Promise<void> {
    const cfg = getS3Config();
    if (!cfg) {
      throw Object.assign(
        new Error(
          'S3 uploads are not configured. Set S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.',
        ),
        { status: 503 },
      );
    }
    const key = tryExtractUploadObjectKey(sourceUrl, cfg);
    if (!key) {
      throw Object.assign(new Error('URL is not an app-managed upload'), { status: 400 });
    }
    const prefix = `uploads/${userId}/`;
    if (!key.startsWith(prefix)) {
      throw Object.assign(new Error('You can only delete your own uploads'), { status: 403 });
    }

    const client = new S3Client({
      region: cfg.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });

    await client.send(
      new DeleteObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
      }),
    );
  }

  /**
   * Server-side cleanup: delete `uploads/...` in our bucket when a stored URL is dropped from the DB.
   * No per-user prefix check (call only after authz). Ignores external URLs, missing config, and errors.
   */
  public async deleteManagedUploadBestEffort(sourceUrl: string): Promise<void> {
    try {
      const cfg = getS3Config();
      if (!cfg) return;
      const key = tryExtractUploadObjectKey(sourceUrl, cfg);
      if (!key) return;
      const client = new S3Client({
        region: cfg.region,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
        requestChecksumCalculation: 'WHEN_REQUIRED',
      });
      await client.send(
        new DeleteObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
        }),
      );
    } catch {
      /* best-effort */
    }
  }

  /**
   * Presigned GET for stored app URLs; unknown / external URLs are returned unchanged as viewUrl.
   */
  public async presignGetBatch(sourceUrls: string[]): Promise<PresignGetBatchResponse> {
    const cfg = getS3Config();
    if (!cfg) {
      throw Object.assign(
        new Error(
          'S3 uploads are not configured. Set S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.',
        ),
        { status: 503 },
      );
    }

    const trimmed = sourceUrls.map((s) => s?.trim()).filter((s): s is string => !!s);
    const unique = [...new Set(trimmed)];
    if (unique.length > PRESIGN_GET_MAX_URLS) {
      throw Object.assign(new Error(`At most ${PRESIGN_GET_MAX_URLS} URLs per request`), {
        status: 400,
      });
    }

    const client = new S3Client({
      region: cfg.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });

    const results: PresignGetEntry[] = [];

    await Promise.all(
      unique.map(async (sourceUrl) => {
        const key = tryExtractUploadObjectKey(sourceUrl, cfg);
        if (!key) {
          results.push({ sourceUrl, viewUrl: sourceUrl, expiresIn: 0 });
          return;
        }
        const command = new GetObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
        });
        const ttl = presignGetTtlSeconds();
        const viewUrl = await getSignedUrl(client, command, {
          expiresIn: ttl,
        });
        results.push({
          sourceUrl,
          viewUrl,
          expiresIn: ttl,
        });
      }),
    );

    return { results };
  }
}
