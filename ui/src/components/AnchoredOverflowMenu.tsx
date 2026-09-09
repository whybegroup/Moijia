import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { useOverflowMenuHost } from './OverflowMenuHost';
import type { PopoverAlign, PopoverPlacement } from '../utils/popoverLayout';

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

type Measurable = View & {
  measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
};

function resolveMenu(menu: AnchoredOverflowMenuProps['menu'], close: CloseMenu): ReactNode {
  return typeof menu === 'function' ? menu(close) : menu;
}

/** Overflow menu anchored to its trigger. Native menus render through `OverflowMenuHostProvider`. */
export function AnchoredOverflowMenu({
  width,
  placement,
  align,
  wrapInCard,
  gap,
  menu,
  children,
}: AnchoredOverflowMenuProps) {
  const host = useOverflowMenuHost();
  const triggerRef = useRef<View>(null);
  const idRef = useRef<object | null>(null);
  if (idRef.current == null) idRef.current = {};
  const menuRef = useRef(menu);
  menuRef.current = menu;

  const close = useCallback(() => {
    const id = idRef.current;
    if (id) host?.hide(id);
  }, [host]);

  const toggle = useCallback(() => {
    const id = idRef.current;
    if (!host || !id) return;
    const node = triggerRef.current as Measurable | null;
    node?.measureInWindow?.((x, y, w, h) => {
      host.toggle({
        id,
        anchor: { x, y, width: w, height: h },
        width,
        placement,
        align,
        wrapInCard,
        gap,
        onClose: close,
        content: resolveMenu(menuRef.current, close),
      });
    });
  }, [align, close, gap, host, placement, width, wrapInCard]);

  const child = Children.only(children);
  const trigger = isValidElement(child)
    ? cloneElement(child, {
        onPress: (e: GestureResponderEvent) => {
          child.props.onPress?.(e);
          toggle();
        },
      })
    : child;

  return (
    <View ref={triggerRef} collapsable={false} style={styles.trigger}>
      {trigger}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: { alignSelf: 'flex-start' },
});
