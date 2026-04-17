/** Twemoji CDN (MIT); used on iOS where RN <Text> emoji can render as tofu on some simulator runtimes. */
const TWEMOJI_72_BASE =
  'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72';

/** Lowercase hex segments joined by `-`, matching Twemoji asset filenames. */
export function twemojiFilenameFromEmoji(emoji: string): string {
  return [...emoji]
    .map((unit) => unit.codePointAt(0)!.toString(16))
    .join('-');
}

export function twemojiUrl72FromFilename(filename: string): string {
  return `${TWEMOJI_72_BASE}/${filename}.png`;
}

/** Try primary filename first; some glyphs resolve without the trailing `-fe0f` segment. */
export function twemojiUrlCandidates(emoji: string): string[] {
  const primary = twemojiFilenameFromEmoji(emoji);
  const urls = [twemojiUrl72FromFilename(primary)];
  if (primary.endsWith('-fe0f')) {
    urls.push(twemojiUrl72FromFilename(primary.replace(/-fe0f$/u, '')));
  }
  return urls;
}
