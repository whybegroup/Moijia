import { S3Client } from '@aws-sdk/client-s3';

export type S3Config = {
  bucket: string;
  region: string;
  publicBase: string;
};

function pathStyleS3Base(bucket: string, region: string): string {
  return `https://s3.${region}.amazonaws.com/${bucket}`;
}

/** `{bucket}.s3.{region}.amazonaws.com` fails TLS when the bucket name contains dots. */
function publicBaseFromEnv(explicitBase: string | undefined, bucket: string, region: string): string {
  const fallback = pathStyleS3Base(bucket, region);
  if (!explicitBase) return fallback;
  try {
    const host = new URL(explicitBase).hostname;
    const m = host.match(/^(.+)\.s3(?:\.([a-z0-9-]+))?\.amazonaws\.com$/i);
    if (m?.[1]) return pathStyleS3Base(m[1], m[2] || region);
  } catch {
    return fallback;
  }
  return explicitBase;
}

export function getS3Config(): S3Config | null {
  const keyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secret = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.S3_BUCKET?.trim();
  if (!keyId || !secret || !bucket) return null;
  const region = process.env.S3_REGION?.trim() || 'us-west-1';
  const explicitBase = process.env.S3_PUBLIC_URL_BASE?.trim().replace(/\/$/, '');
  return { bucket, region, publicBase: publicBaseFromEnv(explicitBase, bucket, region) };
}

export function requireS3Config(): S3Config {
  const cfg = getS3Config();
  if (!cfg) {
    throw Object.assign(
      new Error(
        'S3 is not configured. Set S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.',
      ),
      { status: 503 },
    );
  }
  return cfg;
}

export function createS3Client(cfg: S3Config): S3Client {
  return new S3Client({
    region: cfg.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
}
