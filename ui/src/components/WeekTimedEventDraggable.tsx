import { useCallback, useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, type TransformsStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { EventDetailed } from '@moija/client';
import { isSameDay } from '../utils/helpers';
import { Fonts, Radius } from '../constants/theme';

const SNAP_BLOCK_MIN = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function addCalendarDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function snapLocalStartTo30Min(d: Date): Date {
  const x = new Date(d.getTime());
  const totalMin = x.getHours() * 60 + x.getMinutes();
  let snapped = Math.round(totalMin / SNAP_BLOCK_MIN) * SNAP_BLOCK_MIN;
  x.setHours(0, 0, 0, 0);
  if (snapped >= 24 * 60) {
    x.setDate(x.getDate() + 1);
    snapped = 0;
  }
  x.setMinutes(snapped);
  return x;
}

function applyDragToEventTimes(
  ev: EventDetailed,
  columnDay: Date,
  weekDays: Date[],
  translationX: number,
  translationY: number,
  columnStride: number,
  timelineHeight: number
): { start: Date; end: Date } {
  const origStart = new Date(ev.start);
  const origEnd = new Date(ev.end);
  const durationMs = origEnd.getTime() - origStart.getTime();

  const fromIndex = weekDays.findIndex((d) => isSameDay(d, columnDay));
  const safeFrom = fromIndex >= 0 ? fromIndex : 0;
  const stride =
    Number.isFinite(columnStride) && columnStride > 0 ? columnStride : 0;
  const colDelta = stride > 0 ? Math.round(translationX / stride) : 0;
  const toIndex = Math.max(0, Math.min(6, safeFrom + colDelta));
  const targetDay = weekDays[toIndex];

  // Vertical drag: shift time-of-day along the grid; carry whole days when crossing midnight.
  const origMsIntoDay =
    ((origStart.getHours() * 60 + origStart.getMinutes()) * 60 + origStart.getSeconds()) * 1000 +
    origStart.getMilliseconds();
  const th = timelineHeight > 0 ? timelineHeight : 1;
  const deltaMs = (translationY / th) * MS_PER_DAY;
  let totalMs = origMsIntoDay + deltaMs;
  const extraDaysFromVertical = Math.floor(totalMs / MS_PER_DAY);
  const wrapMs = totalMs - extraDaysFromVertical * MS_PER_DAY;
  const dayForTime = addCalendarDays(targetDay, extraDaysFromVertical);
  const midnight = new Date(
    dayForTime.getFullYear(),
    dayForTime.getMonth(),
    dayForTime.getDate(),
    0,
    0,
    0,
    0
  );
  const merged = new Date(midnight.getTime() + wrapMs);

  const newStart = snapLocalStartTo30Min(merged);
  const newEnd = new Date(newStart.getTime() + durationMs);
  return { start: newStart, end: newEnd };
}

type ColorsTheme = { label: string; dot: string; text: string };

type Props = {
  ev: EventDetailed;
  columnDay: Date;
  weekDays: Date[];
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  /** dayColWidth + horizontal margin between columns (matches week grid layout). */
  columnStride: number;
  timelineHeight: number;
  colors: ColorsTheme;
  canDrag: boolean;
  movePending: boolean;
  onPress: () => void;
  onMoveCommit: (start: Date, end: Date) => void;
  /** While true, parent can raise this column above siblings so the block stays visible across days. */
  onDragActiveChange?: (active: boolean) => void;
};

export function WeekTimedEventDraggable({
  ev,
  columnDay,
  weekDays,
  top,
  height,
  leftPct,
  widthPct,
  columnStride,
  timelineHeight,
  colors,
  canDrag,
  movePending,
  onPress,
  onMoveCommit,
  onDragActiveChange,
}: Props) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const dragging = useSharedValue(0);

  const onPressRef = useRef(onPress);
  const onMoveRef = useRef(onMoveCommit);
  const onDragActiveRef = useRef(onDragActiveChange);
  onPressRef.current = onPress;
  onMoveRef.current = onMoveCommit;
  onDragActiveRef.current = onDragActiveChange;

  const notifyDragActive = useCallback((active: boolean) => {
    onDragActiveRef.current?.(active);
  }, []);

  const finishDrag = useCallback(
    (translationX: number, translationY: number) => {
      if (!canDrag || movePending) return;
      if (Math.abs(translationX) < 6 && Math.abs(translationY) < 6) return;
      const { start, end } = applyDragToEventTimes(
        ev,
        columnDay,
        weekDays,
        translationX,
        translationY,
        columnStride,
        timelineHeight
      );
      const os = new Date(ev.start).getTime();
      const oe = new Date(ev.end).getTime();
      if (start.getTime() === os && end.getTime() === oe) return;
      onMoveRef.current(start, end);
    },
    [canDrag, movePending, ev, columnDay, weekDays, columnStride, timelineHeight]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
    ] as unknown as NonNullable<TransformsStyle['transform']>,
    zIndex: dragging.value ? 50 : 2,
    opacity: dragging.value ? 0.92 : 1,
    ...(Platform.OS === 'android'
      ? { elevation: dragging.value ? 16 : 0 }
      : {}),
  }));

  const gesture = useMemo(() => {
    const tap = Gesture.Tap().onEnd(() => {
      runOnJS(onPressRef.current)();
    });

    const pan = Gesture.Pan()
      .enabled(canDrag && !movePending)
      .minDistance(14)
      .onBegin(() => {
        dragging.value = 1;
        runOnJS(notifyDragActive)(true);
      })
      .onUpdate((e) => {
        tx.value = e.translationX;
        ty.value = e.translationY;
      })
      .onEnd((e) => {
        tx.value = withTiming(0, { duration: 160 });
        ty.value = withTiming(0, { duration: 160 });
        runOnJS(finishDrag)(e.translationX, e.translationY);
      })
      .onFinalize(() => {
        dragging.value = 0;
        runOnJS(notifyDragActive)(false);
      });

    return Gesture.Exclusive(pan, tap);
  }, [canDrag, movePending, finishDrag, notifyDragActive]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.block,
          {
            top,
            height,
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            backgroundColor: colors.label,
            borderLeftColor: colors.dot,
          },
          animatedStyle,
          { opacity: movePending ? 0.65 : 1 },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {ev.title}
        </Text>
        <Text style={[styles.time, { color: colors.text }]} numberOfLines={1}>
          {new Date(ev.start).toLocaleTimeString('default', {
            hour: 'numeric',
            minute: '2-digit',
          })}
          {' – '}
          {new Date(ev.end).toLocaleTimeString('default', {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  block: {
    position: 'absolute',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    borderLeftWidth: 3,
    overflow: 'hidden',
  },
  title: {
    fontSize: 10,
    fontFamily: Fonts.bold,
  },
  time: {
    fontSize: 9,
    fontFamily: Fonts.regular,
    marginTop: 1,
    opacity: 0.75,
  },
});
