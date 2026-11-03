/** iOS banner unit from AdMob. Android needs its own unit before ads can run there. */
export const IOS_BANNER_AD_UNIT_ID = 'ca-app-pub-3281928944395448/9660220711';

const AD_EVERY = 4;

/**
 * Inline banners between cards. The first banner is always docked above the tab bar,
 * so these are only the extras: one per 4 cards, never after the last card.
 */
export function shouldInsertListAdAfter(shownCount: number, total: number): boolean {
  if (total < AD_EVERY || shownCount < 1 || shownCount >= total) return false;
  const inlineCount = Math.floor(total / AD_EVERY);
  for (let i = 1; i <= inlineCount; i++) {
    const after = Math.round((i * total) / (inlineCount + 1));
    if (after === shownCount) return true;
  }
  return false;
}
