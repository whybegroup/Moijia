import { UploadsService } from '@moijia/client';

export function isDirectRenderableImageUrl(url: string): boolean {
  if (!url?.trim()) return false;
  return (
    /^(blob:|file:|content:|ph:|data:)/i.test(url) ||
    url.startsWith('assets-library:')
  );
}

/** Batch-resolve stored DB URLs to presigned GET URLs; locals pass through. */
export async function resolveImageViewUrls(urls: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const needsApi: string[] = [];
  for (const u of urls) {
    if (!u) continue;
    if (isDirectRenderableImageUrl(u)) {
      out.set(u, u);
    } else {
      needsApi.push(u);
    }
  }
  if (needsApi.length === 0) return out;

  try {
    const res = await UploadsService.presignGetBatch({ sourceUrls: needsApi });
    for (const row of res.results) {
      out.set(row.sourceUrl, row.viewUrl);
    }
    for (const u of needsApi) {
      if (!out.has(u)) out.set(u, u);
    }
  } catch {
    for (const u of needsApi) out.set(u, u);
  }
  return out;
}
