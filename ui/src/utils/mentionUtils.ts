/** Match server-side mention token normalization (alphanumeric + underscore, lowercased). */

export function normalizeMentionSlug(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

/** All slugs that resolve to this member on the server. */
export function memberMentionSlugs(u: { displayName: string; name: string }): string[] {
  const s = new Set<string>();
  const add = (raw: string) => {
    const t = normalizeMentionSlug(raw);
    if (t.length >= 1) s.add(t);
  };
  add(u.displayName);
  add(u.name);
  const first = u.displayName.trim().split(/\s+/)[0];
  if (first) add(first);
  return [...s];
}

/** Shortest slug — usually the nicest @handle (e.g. so8991 vs so8991lastname). */
export function primaryMentionSlug(u: { displayName: string; name: string }): string {
  const slugs = memberMentionSlugs(u);
  if (slugs.length === 0) return 'member';
  return slugs.reduce((a, b) => (a.length <= b.length ? a : b));
}

export function memberMatchesMentionFilter(
  u: { displayName: string; name: string },
  queryLower: string
): boolean {
  if (!queryLower) return true;
  const dn = u.displayName.toLowerCase();
  const nm = u.name.toLowerCase();
  if (dn.includes(queryLower) || nm.includes(queryLower)) return true;
  return memberMentionSlugs(u).some((slug) => slug.startsWith(queryLower));
}

// ── Server-aligned mention resolution (keep in sync with api/src/utils/commentMentions.ts) ──

const MENTION_RE = /(?:^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]+)/g;
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

function handlesForUserSet(displayName: string, name: string): Set<string> {
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

export type MentionMemberRow = { userId: string; displayName: string; name: string };

/** Same rules as api resolveMentionRecipientIds — used when posting comment. */
export function resolveMentionRecipientIds(
  tokens: string[],
  members: MentionMemberRow[],
  authorId: string
): Set<string> {
  const ids = new Set<string>();
  const others = members.filter((m) => m.userId !== authorId);

  for (const token of tokens) {
    if (token === 'all') {
      others.forEach((m) => ids.add(m.userId));
      continue;
    }
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
      const handles = handlesForUserSet(m.displayName, m.name);
      if (handles.has(token)) {
        ids.add(m.userId);
        continue;
      }
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

export function computeMentionUserIdsForPost(
  text: string | undefined,
  memberRows: MentionMemberRow[],
  authorId: string
): string[] {
  return [...resolveMentionRecipientIds(extractMentionTokens(text), memberRows, authorId)];
}
