/** Twemoji CDN (MIT); used on iOS where RN <Text> emoji can render as tofu on some simulator runtimes. */
const TWEMOJI_72_BASE =
  'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72';

const ZWJ = '\u200D';
const VARIATION_SELECTOR = /\uFE0F/gu;

function codepoints(emoji: string): string {
  return [...emoji].map((unit) => unit.codePointAt(0)!.toString(16)).join('-');
}

/**
 * Twemoji asset name. U+FE0F is omitted unless the sequence contains ZWJ,
 * matching twitter/twemoji (e.g. ⛷️ is `26f7.png`, not `26f7-fe0f.png`).
 */
export function twemojiFilenameFromEmoji(emoji: string): string {
  const text = emoji.includes(ZWJ) ? emoji : emoji.replace(VARIATION_SELECTOR, '');
  return codepoints(text);
}

export function twemojiUrl72FromFilename(filename: string): string {
  return `${TWEMOJI_72_BASE}/${filename}.png`;
}

/** Primary Twemoji filename, then the fully-qualified codepoint name if it differs. */
export function twemojiUrlCandidates(emoji: string): string[] {
  const primary = twemojiFilenameFromEmoji(emoji);
  const urls = [twemojiUrl72FromFilename(primary)];
  const raw = codepoints(emoji);
  if (raw !== primary) urls.push(twemojiUrl72FromFilename(raw));
  return urls;
}
