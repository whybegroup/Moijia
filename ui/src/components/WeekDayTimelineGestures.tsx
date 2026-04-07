import { useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

const SNAP_BLOCK_MIN = 30;
const DEFAULT_TAP_DURATION_MIN = 30;
const TAP_DRAG_THRESHOLD_PX = 8;

/** Snap start to the 30‑minute mark at or before this Y (floor along the day grid). */
function yToFloorStartMinutes(y: number, height: number): number {
  const m = (y / height) * (24 * 60);
  const slot = Math.floor(m / SNAP_BLOCK_MIN) * SNAP_BLOCK_MIN;
  return Math.max(0, Math.min(24 * 60 - SNAP_BLOCK_MIN, slot));
}

/** Snap Y to the nearest 30‑minute mark for the range end (00:00 … 24:00). */
function yToNearestEndMinutes(y: number, height: number): number {
  const m = (y / height) * (24 * 60);
  let slot = Math.round(m / SNAP_BLOCK_MIN) * SNAP_BLOCK_MIN;
  if (slot <= 0) slot = SNAP_BLOCK_MIN;
  return Math.min(24 * 60, slot);
}

function minutesToY(minutes: number, height: number): number {
  return (minutes / (24 * 60)) * height;
}

function dayAtMinute(day: Date, minutesFromMidnight: number): Date {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  d.setMinutes(minutesFromMidnight);
  return d;
}

function commitFromYs(
  day: Date,
  height: number,
  y0: number,
  y1: number,
  onCommit: (s: Date, e: Date) => void
) {
  const clamp = (y: number) => Math.max(0, Math.min(height, y));
  const ca = clamp(y0);
  const cb = clamp(y1);
  const lo = Math.min(ca, cb);
  const hi = Math.max(ca, cb);
  if (hi - lo < TAP_DRAG_THRESHOLD_PX) {
    // Match updateDraft: use earlier Y (lo), not gesture start (ca), so small drags match preview.
    const startMin = yToFloorStartMinutes(lo, height);
    const start = dayAtMinute(day, startMin);
    onCommit(start, new Date(start.getTime() + DEFAULT_TAP_DURATION_MIN * 60 * 1000));
    return;
  }
  let sm = yToFloorStartMinutes(lo, height);
  let em = yToNearestEndMinutes(hi, height);
  if (em <= sm) em = Math.min(sm + SNAP_BLOCK_MIN, 24 * 60);
  onCommit(dayAtMinute(day, sm), dayAtMinute(day, em));
}

export type WeekSlotDraft = { top: number; height: number };

type Props = {
  day: Date;
  timelineHeight: number;
  onDraftChange: (draft: WeekSlotDraft | null) => void;
  onCommitRange: (start: Date, end: Date) => void;
};

export function WeekDayTimelineGestures({
  day,
  timelineHeight,
  onDraftChange,
  onCommitRange,
}: Props) {
  const startYRef = useRef(0);
  const onCommitRef = useRef(onCommitRange);
  const onDraftRef = useRef(onDraftChange);
  onCommitRef.current = onCommitRange;
  onDraftRef.current = onDraftChange;

  const clearDraft = useCallback(() => {
    onDraftRef.current(null);
  }, []);

  const updateDraft = useCallback((y0: number, y1: number) => {
    const h = timelineHeight;
    const a = Math.max(0, Math.min(h, y0));
    const b = Math.max(0, Math.min(h, y1));
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi - lo < TAP_DRAG_THRESHOLD_PX) {
      const startMin = yToFloorStartMinutes(lo, h);
      const top = minutesToY(startMin, h);
      const endY = minutesToY(Math.min(startMin + DEFAULT_TAP_DURATION_MIN, 24 * 60), h);
      onDraftRef.current({ top, height: Math.max(endY - top, 4) });
      return;
    }
    let sm = yToFloorStartMinutes(lo, h);
    let em = yToNearestEndMinutes(hi, h);
    if (em <= sm) em = Math.min(sm + SNAP_BLOCK_MIN, 24 * 60);
    const top = minutesToY(sm, h);
    const bottom = minutesToY(em, h);
    onDraftRef.current({ top, height: Math.max(bottom - top, 4) });
  }, [timelineHeight]);

  const panBegin = useCallback(
    (y: number) => {
      startYRef.current = y;
      updateDraft(y, y);
    },
    [updateDraft]
  );

  const panMove = useCallback(
    (y: number) => {
      updateDraft(startYRef.current, y);
    },
    [updateDraft]
  );

  const panEnd = useCallback(
    (y: number) => {
      clearDraft();
      commitFromYs(day, timelineHeight, startYRef.current, y, (s, e) => onCommitRef.current(s, e));
    },
    [day, timelineHeight, clearDraft]
  );

  const tapEnd = useCallback(
    (y: number) => {
      clearDraft();
      commitFromYs(day, timelineHeight, y, y, (s, e) => onCommitRef.current(s, e));
    },
    [day, timelineHeight, clearDraft]
  );

  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .maxDistance(14)
      .onEnd((e) => {
        runOnJS(tapEnd)(e.y);
      });

    const pan = Gesture.Pan()
      .activeOffsetY([-10, 10])
      .failOffsetX([-22, 22])
      .onStart((e) => {
        runOnJS(panBegin)(e.y);
      })
      .onUpdate((e) => {
        runOnJS(panMove)(e.y);
      })
      .onEnd((e) => {
        runOnJS(panEnd)(e.y);
      })
      .onFinalize(() => {
        runOnJS(clearDraft)();
      });

    return Gesture.Exclusive(pan, tap);
  }, [tapEnd, panBegin, panMove, panEnd, clearDraft]);

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.fill} collapsable={false} />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});
