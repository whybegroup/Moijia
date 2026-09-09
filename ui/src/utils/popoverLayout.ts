export type PopoverAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PopoverPlacement = 'above' | 'below';
export type PopoverAlign = 'start' | 'center' | 'end';

export function layoutPopover(opts: {
  originX: number;
  originY: number;
  originW: number;
  originH: number;
  anchor: PopoverAnchor;
  menuW: number;
  menuH: number;
  placement: PopoverPlacement;
  align: PopoverAlign;
  gap?: number;
}): { left: number; top: number } {
  const { originX, originY, originW, originH, anchor, menuW, menuH, placement, align } = opts;
  const gap = opts.gap ?? 0;
  let left =
    align === 'center'
      ? anchor.x - originX + anchor.width / 2 - menuW / 2
      : align === 'start'
        ? anchor.x - originX
        : anchor.x - originX + anchor.width - menuW;
  left = Math.min(Math.max(0, left), Math.max(0, originW - menuW));

  const below = anchor.y - originY + anchor.height + gap;
  const above = anchor.y - originY - menuH - gap;
  let top = placement === 'above' ? above : below;
  if (placement === 'above' && above < 8 && below + menuH <= originH) {
    top = below;
  } else if (placement === 'below' && below + menuH > originH && above >= 8) {
    top = above;
  }
  return { left, top: Math.max(0, top) };
}
