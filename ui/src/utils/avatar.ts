import { createAvatar } from '@dicebear/core';
import { initials, icons } from '@dicebear/collection';
import { hslToHex, normalizeHex } from './helpers';

const DEFAULT_SIZE = 256;

/** DiceBear initials expects 6-char hex without # (e.g. "6366f1"). Normalize any color format. */
function toDiceBearHex(color: string): string {
  const s = (color || '').trim();
  if (!s) return '6366f1';

  // Already 6-char hex (no #)
  if (/^[a-fA-F0-9]{6}$/.test(s)) return s.toLowerCase();

  // Hex with # (6 or 3 char)
  const hex6 = normalizeHex(s);
  if (hex6) return hex6.slice(1).toLowerCase();
  const hex3 = /^#?([a-f\d]{3})$/i.exec(s);
  if (hex3) {
    const [r, g, b] = hex3[1].split('').map((c) => parseInt(c + c, 16));
    return [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toLowerCase();
  }

  // hsl(h, s%, l%)
  const hslMatch = /^hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)$/.exec(s);
  if (hslMatch) {
    const h = parseInt(hslMatch[1], 10);
    const sVal = parseFloat(hslMatch[2]);
    const l = parseFloat(hslMatch[3]);
    return hslToHex(h, sVal, l).slice(1).toLowerCase();
  }

  return '6366f1';
}

/** DiceBear icons style supports explicit icon selection. These can be used as seed. */
export const ICON_OPTIONS = [
  'heart', 'star', 'camera', 'gift', 'lightbulb', 'cup', 'book', 'flag',
  'trophy', 'palette', 'globe', 'house', 'key', 'sun', 'moon', 'flower1',
  'gem', 'envelope', 'phone', 'brush', 'cloud', 'lightning', 'puzzle',
  'handThumbsUp', 'emojiSmile', 'search', 'map', 'compass', 'award',
] as const;

export type IconOption = (typeof ICON_OPTIONS)[number];

/** Bottts style preset seeds for user avatars. */
export const BOTTT_PRESETS = [
  'profile-default', 'profile-blue', 'profile-green', 'profile-orange',
  'profile-purple', 'profile-pink', 'profile-red', 'profile-teal',
  'profile-yellow', 'profile-cyan', 'profile-indigo', 'profile-coral',
  'profile-mint', 'profile-amber', 'profile-rose', 'profile-sky',
] as const;

export type BotttsPreset = (typeof BOTTT_PRESETS)[number];

export function isBotttsPreset(seed: string): seed is BotttsPreset {
  return (BOTTT_PRESETS as readonly string[]).includes(seed);
}

export function isIconOption(seed: string): seed is IconOption {
  return (ICON_OPTIONS as readonly string[]).includes(seed);
}

/**
 * Generate bottts avatar SVG string (offline, no API calls).
 */
export function generateInitialsSvg(seed: string, backgroundColor: string[], size = DEFAULT_SIZE): string {
  const normalized = backgroundColor.filter(Boolean).map(toDiceBearHex);
  const bg = normalized.length > 0 ? normalized : [toDiceBearHex('6366f1')];
  const avatar = createAvatar(initials, {
    seed,
    size,
    backgroundColor: bg,
    backgroundType: ['solid'],
    randomizeIds: true,
  });
  return avatar.toString();
}

/**
 * Generate icons avatar SVG string (offline, no API calls).
 * When seed is a known icon name (ICON_OPTIONS), uses that specific icon.
 */
export function generateIconsSvg(seed: string, size = DEFAULT_SIZE): string {
  const avatar = createAvatar(icons, {
    seed,
    size,
    backgroundType: ['solid'],
    randomizeIds: true,
    ...(isIconOption(seed) && { icon: [seed] }),
  });
  return avatar.toString();
}
