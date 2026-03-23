/**
 * Parse @mentions in comment text and resolve to group member user IDs.
 * Supports @all (all active members except author) and @handle where handle matches
 * normalized displayName, name, or first word of displayName (alphanumeric only, case-insensitive).
 */

const MENTION_RE = /(?:^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]+)/g;
/** @<uuid> — word-style regex cannot capture hyphens, so we scan for full UUIDs separately */
const UUID_MENTION_RE =
  /(?:^|[^a-zA-Z0-9_])@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

function pushToken(seen: Set<string>, out: string[], t: string) {
  if (!seen.has(t)) {
    seen.add(t);
    out.push(t);
  }
}

export function extractMentionTokens(text: string | undefined | null): string[] {
  if (!text || !text.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    pushToken(seen, out, m[1].toLowerCase());
  }
  UUID_MENTION_RE.lastIndex = 0;
  while ((m = UUID_MENTION_RE.exec(text)) !== null) {
    pushToken(seen, out, m[1].toLowerCase());
  }
  return out;
}

function normalizeMentionSlug(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

/**
 * Fallback when strict handles miss (e.g. punctuation in display names, nicknames).
 * Requires token length ≥ 2 to limit false positives.
 */
function looseNameMatchesToken(token: string, displayName: string, name: string): boolean {
  if (token.length < 2) return false;
  const t = token.toLowerCase();
  const dn = displayName.toLowerCase().trim();
  const nm = name.toLowerCase().trim();
  if (dn === t || nm === t) return true;
  if (dn.includes(t) || nm.includes(t)) return true;
  for (const part of dn.split(/\s+/).filter(Boolean)) {
    if (part === t || part.startsWith(t)) return true;
  }
  for (const part of nm.split(/\s+/).filter(Boolean)) {
    if (part === t || part.startsWith(t)) return true;
  }
  const slugDn = normalizeMentionSlug(displayName);
  const slugNm = normalizeMentionSlug(name);
  if (slugDn.includes(t) || slugNm.includes(t)) return true;
  return false;
}

/** Handles used to match a mention token (lowercase alphanumeric + underscore only). */
export function handlesForUser(displayName: string, name: string): Set<string> {
  const h = new Set<string>();
  const add = (raw: string) => {
    const t = normalizeMentionSlug(raw);
    if (t.length >= 1) h.add(t);
  };
  add(displayName);
  add(name);
  const first = displayName.trim().split(/\s+/)[0];
  if (first) add(first);
  return h;
}

export type MemberRow = { userId: string; displayName: string; name: string };

/**
 * Map a raw user id from the client to the canonical `userId` stored on group members.
 * Handles trimming, case, and hyphen normalization (UUID).
 */
export function resolveCanonicalMemberUserId(
  raw: string | undefined | null,
  allowedMemberUserIds: Iterable<string>
): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;

  const ids = [...allowedMemberUserIds];
  if (ids.includes(t)) return t;
  const tLower = t.toLowerCase();
  for (const id of ids) {
    if (id.toLowerCase() === tLower) return id;
  }
  const tNoHyphen = tLower.replace(/-/g, '');
  if (tNoHyphen.length === 32 && /^[0-9a-f]+$/.test(tNoHyphen)) {
    for (const id of ids) {
      if (id.toLowerCase().replace(/-/g, '') === tNoHyphen) return id;
    }
  }
  return null;
}

/**
 * User IDs to notify for @mentions (excludes author). Includes @all expansion.
 * Matches exact handle, prefix (token length ≥ 3), or full normalized display/name.
 */
export function resolveMentionRecipientIds(
  tokens: string[],
  members: MemberRow[],
  authorId: string
): Set<string> {
  const ids = new Set<string>();
  const others = members.filter((m) => m.userId !== authorId);

  for (const token of tokens) {
    if (token === 'all') {
      others.forEach((m) => ids.add(m.userId));
      continue;
    }
    // Match by user id (any group member, not only event creator)
    const uidLower = token.replace(/-/g, '');
    if (uidLower.length === 32 && /^[0-9a-f]+$/.test(uidLower)) {
      const match = others.find((m) => m.userId.toLowerCase().replace(/-/g, '') === uidLower);
      if (match) {
        ids.add(match.userId);
        continue;
      }
    }
    const exactId = others.find((m) => m.userId.toLowerCase() === token);
    if (exactId) {
      ids.add(exactId.userId);
      continue;
    }
    for (const m of others) {
      const handles = handlesForUser(m.displayName, m.name);
      if (handles.has(token)) {
        ids.add(m.userId);
        continue;
      }
      // Prefix match (avoid single-letter noise)
      if (token.length >= 3) {
        for (const h of handles) {
          if (h.startsWith(token)) {
            ids.add(m.userId);
            break;
          }
        }
      }
      const dn = normalizeMentionSlug(m.displayName);
      const nm = normalizeMentionSlug(m.name);
      if (token === dn || token === nm) ids.add(m.userId);
      else if (looseNameMatchesToken(token, m.displayName, m.name)) ids.add(m.userId);
    }
  }
  return ids;
}
