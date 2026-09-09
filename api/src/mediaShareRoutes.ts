import { Readable } from 'node:stream';
import type { Application, Request, Response } from 'express';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { objectKeyFromMediaSharePath } from './utils/objectStorePaths';
import { createS3Client, getS3Config, type S3Config } from './utils/s3Config';

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  pdf: 'application/pdf',
  json: 'application/json',
  txt: 'text/plain; charset=utf-8',
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  zip: 'application/zip',
};

function contentTypeForKey(key: string, fromS3?: string): string {
  const s3 = fromS3?.trim();
  if (s3 && s3 !== 'application/octet-stream' && s3 !== 'binary/octet-stream') return s3;
  const ext = key.split('.').pop()?.toLowerCase() || '';
  return CONTENT_TYPES[ext] || s3 || 'application/octet-stream';
}

function s3RangeHeader(range: unknown): string | undefined {
  if (typeof range !== 'string') return undefined;
  const t = range.trim();
  if (!/^bytes=\d*-\d*$/i.test(t)) return undefined;
  return t;
}

function httpStatusFromS3(err: unknown): number {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  const code = e.$metadata?.httpStatusCode;
  if (code === 404 || e.name === 'NoSuchKey' || e.name === 'NotFound') return 404;
  if (code === 416 || e.name === 'InvalidRange') return 416;
  if (code && code >= 400 && code < 500) return code;
  return 502;
}

function applyObjectHeaders(
  res: Response,
  key: string,
  meta: {
    ContentType?: string;
    ContentLength?: number;
    ContentRange?: string;
    ETag?: string;
    LastModified?: Date;
  },
  partial: boolean
): void {
  const fileName = key.split('/').pop() || 'file';
  res.setHeader('Content-Type', contentTypeForKey(key, meta.ContentType));
  res.setHeader('Content-Disposition', `inline; filename="${fileName.replace(/"/g, '')}"`);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (meta.ContentLength != null) res.setHeader('Content-Length', String(meta.ContentLength));
  if (meta.ContentRange) res.setHeader('Content-Range', meta.ContentRange);
  if (meta.ETag) res.setHeader('ETag', meta.ETag);
  if (meta.LastModified) res.setHeader('Last-Modified', meta.LastModified.toUTCString());
  res.status(partial || meta.ContentRange ? 206 : 200);
}

function asNodeReadable(body: unknown): Readable | null {
  if (!body) return null;
  if (body instanceof Readable) return body;
  if (typeof (body as { pipe?: unknown }).pipe === 'function') return body as Readable;
  return null;
}

async function streamFromS3(req: Request, res: Response, cfg: S3Config, key: string): Promise<void> {
  req.setTimeout(0);
  res.setTimeout(0);
  const client = createS3Client(cfg);
  const range = s3RangeHeader(req.headers.range);
  const out = await client.send(
    new GetObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Range: range,
    })
  );
  const body = asNodeReadable(out.Body);
  if (!body) {
    res.status(404).type('text').send('Not found');
    return;
  }
  applyObjectHeaders(res, key, out, !!range && !!out.ContentRange);
  const abort = () => {
    if (!body.destroyed) body.destroy();
  };
  req.on('close', abort);
  body.on('error', () => {
    abort();
    if (!res.headersSent) res.status(502).end();
    else res.destroy();
  });
  body.pipe(res);
}

async function headFromS3(res: Response, cfg: S3Config, key: string): Promise<void> {
  const client = createS3Client(cfg);
  const out = await client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
  applyObjectHeaders(res, key, out, false);
  res.end();
}

/** `GET|HEAD /f/:userId/:fileName` streams the object from S3; the browser stays on moijia.com. */
export function registerMediaShareRoutes(app: Application): void {
  const handler = async (req: Request, res: Response) => {
    const key = objectKeyFromMediaSharePath(req.path);
    if (!key) {
      res.status(404).type('text').send('Not found');
      return;
    }
    const cfg = getS3Config();
    if (!cfg) {
      res.status(503).type('text').send('Storage unavailable');
      return;
    }
    try {
      if (req.method === 'HEAD') await headFromS3(res, cfg, key);
      else await streamFromS3(req, res, cfg, key);
    } catch (err) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const status = httpStatusFromS3(err);
      res.status(status).type('text').send(status === 404 ? 'Not found' : 'Storage error');
    }
  };

  app.head('/f/:userId/:fileName', handler);
  app.get('/f/:userId/:fileName', handler);
}
