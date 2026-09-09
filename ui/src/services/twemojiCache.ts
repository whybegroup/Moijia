import { Image, Platform } from 'react-native';
import { COMMENT_REACTION_EMOJIS } from '../constants/commentReactionEmojis';
import { DEFAULT_COMMENT_QUICK_REACTIONS_LIST } from '../utils/commentQuickReactionsPrefs';
import { twemojiUrlCandidates } from '../utils/twemojiUrl';
import { ensureCachedImageFileUri, peekCachedImageFileUri } from './imageDiskCache';

/** emoji → CDN URL that successfully resolved (session). */
const workingUrlByEmoji = new Map<string, string>();
/** emoji → local file URI once on disk. */
const fileUriByEmoji = new Map<string, string>();
const inflightByEmoji = new Map<string, Promise<string | null>>();

let prefetchStarted = false;
let activeDownloads = 0;
const downloadWaiters: Array<() => void> = [];
const MAX_DOWNLOADS = 8;

function acquireDownloadSlot(): Promise<void> {
  if (activeDownloads < MAX_DOWNLOADS) {
    activeDownloads += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    downloadWaiters.push(() => {
      activeDownloads += 1;
      resolve();
    });
  });
}

function releaseDownloadSlot(): void {
  activeDownloads = Math.max(0, activeDownloads - 1);
  const next = downloadWaiters.shift();
  if (next) next();
}

function candidateUrls(emoji: string): string[] {
  const remembered = workingUrlByEmoji.get(emoji);
  const rest = twemojiUrlCandidates(emoji);
  if (!remembered) return rest;
  return [remembered, ...rest.filter((u) => u !== remembered)];
}

/** Instant URI for rendering: disk cache, else first CDN candidate. */
export function peekTwemojiDisplayUri(emoji: string): string | null {
  const cachedFile = fileUriByEmoji.get(emoji);
  if (cachedFile) return cachedFile;
  for (const url of candidateUrls(emoji)) {
    const peek = peekCachedImageFileUri(url);
    if (peek) {
      fileUriByEmoji.set(emoji, peek);
      workingUrlByEmoji.set(emoji, url);
      return peek;
    }
  }
  return workingUrlByEmoji.get(emoji) ?? twemojiUrlCandidates(emoji)[0] ?? null;
}

async function cacheOne(emoji: string): Promise<string | null> {
  const existing = fileUriByEmoji.get(emoji) ?? peekTwemojiDisplayUri(emoji);
  if (existing?.startsWith('file:')) return existing;

  const pending = inflightByEmoji.get(emoji);
  if (pending) return pending;

  const task = (async (): Promise<string | null> => {
    for (const url of candidateUrls(emoji)) {
      const peek = peekCachedImageFileUri(url);
      if (peek) {
        workingUrlByEmoji.set(emoji, url);
        fileUriByEmoji.set(emoji, peek);
        return peek;
      }
    }
    await acquireDownloadSlot();
    try {
      for (const url of candidateUrls(emoji)) {
        const peek = peekCachedImageFileUri(url);
        if (peek) {
          workingUrlByEmoji.set(emoji, url);
          fileUriByEmoji.set(emoji, peek);
          return peek;
        }
        try {
          void Image.prefetch(url);
          const local = await ensureCachedImageFileUri(url, url);
          if (local) {
            workingUrlByEmoji.set(emoji, url);
            fileUriByEmoji.set(emoji, local);
            return local;
          }
        } catch {
          /* try next filename variant */
        }
      }
    } finally {
      releaseDownloadSlot();
    }
    return peekTwemojiDisplayUri(emoji);
  })();

  inflightByEmoji.set(emoji, task);
  try {
    return await task;
  } finally {
    inflightByEmoji.delete(emoji);
  }
}

async function prefetchList(emojis: readonly string[], concurrency: number): Promise<void> {
  for (let i = 0; i < emojis.length; i += concurrency) {
    const slice = emojis.slice(i, i + concurrency);
    await Promise.all(slice.map((emoji) => cacheOne(emoji)));
  }
}

/** Warm disk + HTTP cache: quick bar first, then the full picker grid. */
export function prefetchTwemojiAssets(): void {
  if (Platform.OS !== 'ios' || prefetchStarted) return;
  prefetchStarted = true;
  void (async () => {
    await prefetchList(DEFAULT_COMMENT_QUICK_REACTIONS_LIST, 5);
    const rest = COMMENT_REACTION_EMOJIS.filter(
      (e) => !DEFAULT_COMMENT_QUICK_REACTIONS_LIST.includes(e)
    );
    await prefetchList(rest, 8);
  })();
}

export function ensureTwemojiCached(emoji: string): Promise<string | null> {
  if (Platform.OS !== 'ios') return Promise.resolve(null);
  return cacheOne(emoji);
}
