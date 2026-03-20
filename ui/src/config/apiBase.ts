import { OpenAPI } from '@boltup/client';

/** API server origin. `/api` is appended to match tsoa `basePath` unless already present. */
const DEFAULT_API_ORIGIN = 'https://api.danielbyun.com';

function normalizeBase(url: string): string {
  return url.trim().replace(/\/$/, '');
}

function withApiPath(originOrBase: string): string {
  const n = normalizeBase(originOrBase);
  return n.endsWith('/api') ? n : `${n}/api`;
}

function resolveBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  return withApiPath(fromEnv || DEFAULT_API_ORIGIN);
}

OpenAPI.BASE = resolveBase();
