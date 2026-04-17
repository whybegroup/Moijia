import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = '@moijia:commentQuickReactions:v1:';

/** Shown until the user picks reactions; order is MRU after first use. */
export const DEFAULT_COMMENT_QUICK_REACTIONS_LIST: readonly string[] = [
  '👍',
  '🙂',
  '😮',
  '✔️',
  '😂',
];

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function defaultsCopy(): string[] {
  return [...DEFAULT_COMMENT_QUICK_REACTIONS_LIST];
}

/** Dedupe, preserve order, pad to 5 using defaults for any missing slots. */
function normalizeBar(emojis: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of emojis) {
    const t = (e || '').trim();
    if (!t || seen.has(t)) continue;
    out.push(t);
    seen.add(t);
    if (out.length === 5) return out;
  }
  for (const d of DEFAULT_COMMENT_QUICK_REACTIONS_LIST) {
    if (!seen.has(d)) {
      out.push(d);
      seen.add(d);
      if (out.length === 5) break;
    }
  }
  return out;
}

export async function loadCommentQuickReactions(userId: string): Promise<string[]> {
  const uid = userId.trim();
  if (!uid) return defaultsCopy();
  const raw = await AsyncStorage.getItem(storageKey(uid));
  if (!raw) return defaultsCopy();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultsCopy();
    const emojis = parsed
      .filter((x): x is string => typeof x === 'string')
      .map((e) => e.trim())
      .filter(Boolean);
    if (emojis.length === 0) return defaultsCopy();
    return normalizeBar(emojis);
  } catch {
    return defaultsCopy();
  }
}

/**
 * Promote `emoji` to the front of the user's quick bar (max 5, MRU).
 * Call after a successful reaction API call (add or remove).
 */
export async function recordCommentQuickReaction(userId: string, emoji: string): Promise<string[]> {
  const uid = userId.trim();
  const t = emoji.trim();
  if (!uid || !t) return defaultsCopy();
  const prev = await loadCommentQuickReactions(uid);
  const next = normalizeBar([t, ...prev.filter((e) => e !== t)]);
  await AsyncStorage.setItem(storageKey(uid), JSON.stringify(next));
  return next;
}
