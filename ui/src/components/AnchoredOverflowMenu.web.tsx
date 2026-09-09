import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { Colors, Shadows } from '../constants/theme';
import { layoutPopover, type PopoverAlign, type PopoverPlacement } from '../utils/popoverLayout';

type CloseMenu = () => void;

export type AnchoredOverflowMenuProps = {
  width?: number;
  placement?: PopoverPlacement;
  align?: PopoverAlign;
  wrapInCard?: boolean;
  gap?: number;
  menu: ReactNode | ((close: CloseMenu) => ReactNode);
  children: ReactElement<{ onPress?: (e: GestureResponderEvent) => void }>;
};

function resolveMenu(menu: AnchoredOverflowMenuProps['menu'], close: CloseMenu): ReactNode {
  return typeof menu === 'function' ? menu(close) : menu;
}

/**
 * Body portal (not an RN Modal / `role="dialog"`), so column-pin CSS does not apply.
 * `left`/`top` are viewport coords from the trigger’s bounding box.
 */
export function AnchoredOverflowMenu({
  width,
  placement = 'below',
  align = 'end',
  wrapInCard = true,
  gap = 0,
  menu,
  children,
}: AnchoredOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null
  );
  const [menuBox, setMenuBox] = useState<{ w: number; h: number } | null>(null);
  const triggerRef = useRef<View>(null);
  const close = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      setMenuBox(null);
      return;
    }
    const update = () => {
      const el = triggerRef.current as unknown as HTMLElement | null;
      if (!el?.getBoundingClientRect) return;
      const r = el.getBoundingClientRect();
      setRect({ x: r.left, y: r.top, width: r.width, height: r.height });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  const measured =
    width != null && placement === 'below'
      ? { w: width, h: 0 }
      : menuBox;
  const pos =
    rect && measured
      ? layoutPopover({
          originX: 0,
          originY: 0,
          originW: window.innerWidth,
          originH: window.innerHeight,
          anchor: rect,
          menuW: measured.w,
          menuH: measured.h,
          placement,
          align,
          gap,
        })
      : null;

  const child = Children.only(children);
  const trigger = isValidElement(child)
    ? cloneElement(child, {
        onPress: (e: GestureResponderEvent) => {
          child.props.onPress?.(e);
          setOpen((v) => !v);
        },
      })
    : child;

  return (
    <View ref={triggerRef} collapsable={false} style={styles.trigger}>
      {trigger}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <View style={styles.root}>
              <Pressable
                style={styles.dismiss}
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel="Dismiss menu"
              />
              <View
                style={[
                  wrapInCard ? styles.popover : styles.popoverBare,
                  pos
                    ? {
                        left: pos.left,
                        top: pos.top,
                        opacity: 1,
                        maxWidth: window.innerWidth,
                        ...(width != null && wrapInCard ? { width } : null),
                      }
                    : {
                        left: 0,
                        top: 0,
                        opacity: 0,
                        maxWidth: window.innerWidth,
                        ...(width != null && wrapInCard ? { width } : null),
                      },
                ]}
                pointerEvents={pos ? 'box-none' : 'none'}
                onLayout={(e) => {
                  const { width: w, height: h } = e.nativeEvent.layout;
                  if (w < 1 || h < 1) return;
                  setMenuBox((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
                }}
              >
                {wrapInCard ? (
                  <View style={styles.card}>{resolveMenu(menu, close)}</View>
                ) : (
                  resolveMenu(menu, close)
                )}
              </View>
            </View>,
            document.body
          )
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: { alignSelf: 'flex-start' },
  root: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100000,
  },
  dismiss: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  popover: {
    position: 'absolute',
    zIndex: 20,
    borderRadius: 16,
    ...Shadows.lg,
  },
  popoverBare: {
    position: 'absolute',
    zIndex: 20,
    alignSelf: 'flex-start',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    overflow: 'hidden',
    width: '100%',
  },
});
