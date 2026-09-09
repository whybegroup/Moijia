import { Dimensions, Platform } from 'react-native';
import { WEB_APP_MAX_WIDTH } from '../constants/webAppMaxWidth';

/** Gutter to the left of the web app column (0 on native / narrow web). */
export function webAppColumnOffsetX(): number {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 0;
  return Math.max(0, (window.innerWidth - WEB_APP_MAX_WIDTH) / 2);
}

export function webAppColumnWidth(): number {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return Dimensions.get('window').width;
  }
  return Math.min(window.innerWidth, WEB_APP_MAX_WIDTH);
}

/** `measureInWindow` / `pageX` → X inside a Modal pinned to the app column. */
export function toWebAppColumnX(windowX: number): number {
  return windowX - webAppColumnOffsetX();
}

export function clampToWebAppColumn(left: number, width: number, margin = 8): number {
  const col = webAppColumnWidth();
  return Math.max(margin, Math.min(left, col - width - margin));
}

export function webColumnPopoverLeft(
  anchor: { x: number; width: number },
  menuWidth: number,
  margin = 8
): number {
  return clampToWebAppColumn(toWebAppColumnX(anchor.x) + anchor.width - menuWidth, menuWidth, margin);
}

export function webColumnCenteredLeft(
  anchor: { x: number; width: number },
  menuWidth: number,
  margin = 10
): number {
  return clampToWebAppColumn(
    toWebAppColumnX(anchor.x) + anchor.width / 2 - menuWidth / 2,
    menuWidth,
    margin
  );
}

