import { createContext, memo, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Colors, Shadows } from '../constants/theme';
import {
  layoutPopover,
  type PopoverAlign,
  type PopoverPlacement,
} from '../utils/popoverLayout';

export type OverflowMenuAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type OverflowMenuShowArgs = {
  id: object;
  anchor: OverflowMenuAnchor;
  width?: number;
  placement?: PopoverPlacement;
  align?: PopoverAlign;
  wrapInCard?: boolean;
  gap?: number;
  onClose: () => void;
  content: ReactNode;
};

type OverflowMenuEntry = {
  id: object;
  left: number;
  top: number;
  width?: number;
  ready: boolean;
  wrapInCard: boolean;
  placement: PopoverPlacement;
  align: PopoverAlign;
  gap: number;
  originX: number;
  originY: number;
  originW: number;
  originH: number;
  anchor: OverflowMenuAnchor;
  onClose: () => void;
  content: ReactNode;
};

type OverflowMenuHostValue = {
  show: (args: OverflowMenuShowArgs) => void;
  hide: (id: object) => void;
  toggle: (args: OverflowMenuShowArgs) => void;
};

type Measurable = View & {
  measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
};

const OverflowMenuHostContext = createContext<OverflowMenuHostValue | null>(null);

export function useOverflowMenuHost() {
  return useContext(OverflowMenuHostContext);
}

const FrozenSubtree = memo(function FrozenSubtree({ children }: { children: ReactNode }) {
  return <>{children}</>;
});

function defaultsFromArgs(args: OverflowMenuShowArgs) {
  return {
    placement: args.placement ?? 'below',
    align: args.align ?? 'end',
    wrapInCard: args.wrapInCard ?? true,
    gap: args.gap ?? 0,
  };
}

/** Renders overflow menus at the app root without an RN Modal (iOS Modals snapshot and flicker images). */
export function OverflowMenuHostProvider({ children }: { children: ReactNode }) {
  const rootRef = useRef<View>(null);
  const [entry, setEntry] = useState<OverflowMenuEntry | null>(null);

  const place = useCallback((args: OverflowMenuShowArgs, next: OverflowMenuEntry | null) => {
    if (!next) {
      setEntry(null);
      return;
    }
    const { placement, align, wrapInCard, gap } = defaultsFromArgs(args);
    const node = rootRef.current as Measurable | null;
    const apply = (ox: number, oy: number, ow: number, oh: number) => {
      const canPlaceNow = args.width != null && placement === 'below';
      const pos = canPlaceNow
        ? layoutPopover({
            originX: ox,
            originY: oy,
            originW: ow,
            originH: oh,
            anchor: args.anchor,
            menuW: args.width!,
            menuH: 0,
            placement,
            align,
            gap,
          })
        : { left: 0, top: 0 };
      setEntry({
        ...next,
        ...pos,
        width: args.width,
        ready: canPlaceNow,
        wrapInCard,
        placement,
        align,
        gap,
        originX: ox,
        originY: oy,
        originW: ow,
        originH: oh,
        anchor: args.anchor,
      });
    };
    if (!node?.measureInWindow) {
      apply(0, 0, args.anchor.x + args.anchor.width, args.anchor.y + args.anchor.height);
      return;
    }
    node.measureInWindow((ox, oy, ow, oh) => apply(ox, oy, ow, oh));
  }, []);

  const entryIdRef = useRef<object | null>(null);
  entryIdRef.current = entry?.id ?? null;

  const show = useCallback(
    (args: OverflowMenuShowArgs) => {
      place(args, {
        id: args.id,
        left: 0,
        top: 0,
        onClose: args.onClose,
        content: args.content,
        ready: false,
        wrapInCard: args.wrapInCard ?? true,
        placement: args.placement ?? 'below',
        align: args.align ?? 'end',
        gap: args.gap ?? 0,
        originX: 0,
        originY: 0,
        originW: 0,
        originH: 0,
        anchor: args.anchor,
      });
    },
    [place]
  );

  const hide = useCallback((id: object) => {
    setEntry((prev) => (prev?.id === id ? null : prev));
  }, []);

  const toggle = useCallback(
    (args: OverflowMenuShowArgs) => {
      if (entryIdRef.current === args.id) {
        setEntry(null);
        return;
      }
      show(args);
    },
    [show]
  );

  const onPopoverLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setEntry((prev) => {
      if (!prev) return prev;
      if (width < 1 || height < 1) return prev;
      if (prev.ready && prev.placement === 'below' && prev.width != null) return prev;
      const pos = layoutPopover({
        originX: prev.originX,
        originY: prev.originY,
        originW: prev.originW,
        originH: prev.originH,
        anchor: prev.anchor,
        menuW: width,
        menuH: height,
        placement: prev.placement,
        align: prev.align,
        gap: prev.gap,
      });
      if (
        prev.ready &&
        prev.left === pos.left &&
        prev.top === pos.top &&
        prev.width === width
      ) {
        return prev;
      }
      return { ...prev, ...pos, width, ready: true };
    });
  }, []);

  const value = useMemo(() => ({ show, hide, toggle }), [hide, show, toggle]);

  if (Platform.OS === 'web') {
    return <OverflowMenuHostContext.Provider value={value}>{children}</OverflowMenuHostContext.Provider>;
  }

  return (
    <OverflowMenuHostContext.Provider value={value}>
      <View ref={rootRef} collapsable={false} style={styles.root}>
        <FrozenSubtree>{children}</FrozenSubtree>
        <View style={styles.layer} pointerEvents={entry ? 'box-none' : 'none'}>
          {entry ? (
            <>
              <Pressable
                style={styles.dismiss}
                onPress={entry.onClose}
                accessibilityRole="button"
                accessibilityLabel="Dismiss menu"
              />
              <View
                style={[
                  entry.wrapInCard ? styles.popover : styles.popoverBare,
                  {
                    left: entry.left,
                    top: entry.top,
                    maxWidth: entry.originW,
                    opacity: entry.ready ? 1 : 0,
                    ...(entry.width != null && entry.wrapInCard ? { width: entry.width } : null),
                  },
                ]}
                pointerEvents={entry.ready ? 'box-none' : 'none'}
                onLayout={onPopoverLayout}
              >
                {entry.wrapInCard ? <View style={styles.card}>{entry.content}</View> : entry.content}
              </View>
            </>
          ) : null}
        </View>
      </View>
    </OverflowMenuHostContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100000,
    elevation: 100000,
  },
  dismiss: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  popover: {
    position: 'absolute',
    zIndex: 20,
    elevation: 20,
    borderRadius: 16,
    ...Shadows.lg,
  },
  popoverBare: {
    position: 'absolute',
    zIndex: 20,
    elevation: 20,
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
