import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef, type ComponentRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  PixelRatio,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Radius } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName } from '../utils/helpers';
import { isSameDay, isToday } from '../utils/helpers';
import type { EventDetailed, GroupScoped } from '@moijia/client';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import { WeekDayTimelineGestures } from './WeekDayTimelineGestures';
import { WeekTimedEventDraggable } from './WeekTimedEventDraggable';
import { EventRow } from './EventRow';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

import type { CalendarScopeMode } from '../utils/eventsScreenPrefs';

export type { CalendarScopeMode };

interface CalendarViewProps {
  events: EventDetailed[];
  groups: GroupScoped[];
  groupColors?: Record<string, string>;
  onSelectEvent: (ev: EventDetailed) => void;
  onSelectGroup?: (groupId: string) => void;
  /** When set with `onCalendarFocusDateChange`, calendar navigation is controlled (e.g. for persistence). */
  calendarFocusDate?: Date;
  onCalendarFocusDateChange?: (date: Date) => void;
  calendarScopeMode?: CalendarScopeMode;
  onCalendarScopeModeChange?: (mode: CalendarScopeMode) => void;
  /** Week view: tap or drag on the time grid to open create-event with that range (tap = 30 min). */
  onWeekCreateEvent?: (start: Date, end: Date) => void;
  /** Week view: hosts / group admins drag timed blocks to reschedule (start/end preserved duration). */
  onWeekEventTimeMove?: (ev: EventDetailed, start: Date, end: Date) => void | Promise<void>;
  /** While a week drag-update is in flight, that event id shows as busy. */
  weekEventMovePendingId?: string | null;
  /** Persisted vertical offsets per scope (events screen AsyncStorage). */
  calendarBodyScrollY?: Partial<Record<CalendarScopeMode, number>>;
  onCalendarBodyScrollYCommit?: (mode: CalendarScopeMode, y: number) => void;
  /** False until parent finished loading prefs — avoids locking scroll restore before stored Y is applied. */
  calendarScrollPrefsReady?: boolean;
  /** Increment when leaving create-event or the events tab so an in-grid slot draft is cleared. */
  clearWeekSlotDraftSeq?: number;
  /** Persisted horizontal scroll of the year mini-month strip (see `onCalendarYearMonthStripCommit`). */
  calendarYearMonthStrip?: { year: number; x: number };
  onCalendarYearMonthStripCommit?: (payload: { year: number; x: number }) => void;
}

const YEAR_STRIP_PAD_H = 12;
const YEAR_STRIP_CARD_MARGIN = 10;

function yearStripContentWidth(cardSize: number): number {
  return YEAR_STRIP_PAD_H * 2 + 12 * cardSize + 12 * YEAR_STRIP_CARD_MARGIN;
}

function yearStripScrollToCenterMonth(monthIndex: number, cardSize: number, viewportW: number): number {
  const contentW = yearStripContentWidth(cardSize);
  const cardLeft = YEAR_STRIP_PAD_H + monthIndex * (cardSize + YEAR_STRIP_CARD_MARGIN);
  const raw = cardLeft + cardSize / 2 - viewportW / 2;
  const maxScroll = Math.max(0, contentW - viewportW);
  return Math.max(0, Math.min(maxScroll, Math.round(raw)));
}

function yearStripClampScroll(x: number, cardSize: number, viewportW: number): number {
  const contentW = yearStripContentWidth(cardSize);
  const maxScroll = Math.max(0, contentW - viewportW);
  return Math.max(0, Math.min(maxScroll, Math.round(x)));
}

const HOUR_HEIGHT = 40;
const TIMELINE_HEIGHT = 24 * HOUR_HEIGHT;
/** Matches week day header row height (frozen gutter spacer) */
const WEEK_HEADER_ROW_HEIGHT = 56;
const ALLDAY_CHIP_BLOCK = 30;

function estimateAllDayBandHeight(eventCount: number): number {
  if (eventCount <= 0) return 0;
  return Math.min(6 + eventCount * ALLDAY_CHIP_BLOCK, 160);
}

function startOfWeekSunday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  x.setDate(x.getDate() - dow);
  return x;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function dayEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** React keys must differ per expanded occurrence (same `id`, different `start`). */
function eventOccurrenceKey(ev: EventDetailed & { __occurrenceKey?: number }): string {
  if (ev.__occurrenceKey != null) return `${ev.id}-${ev.__occurrenceKey}`;
  const s = typeof ev.start === 'string' ? ev.start : (ev.start as Date).toISOString();
  return `${ev.id}-${s}`;
}

function calendarDateOnly(d: Date): number {
  d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return d.getTime();
}

function sameCalendarMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function formatHourLabel(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startWeekday = first.getDay();
  const daysInMo = last.getDate();
  const rows: (Date | null)[][] = [];
  let row: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) row.push(null);
  for (let d = 1; d <= daysInMo; d++) {
    row.push(new Date(year, month, d));
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) {
    while (row.length < 7) row.push(null);
    rows.push(row);
  }
  return rows;
}

/** Timed segment of an event within a single calendar day (local). */
function timedSegmentForDay(
  ev: EventDetailed,
  day: Date
): { top: number; height: number } | null {
  if (ev.isAllDay) return null;
  const evS = new Date(ev.start);
  const evE = new Date(ev.end);
  const ds = dayStart(day);
  const de = dayEnd(day);
  if (evE.getTime() <= ds.getTime() || evS.getTime() >= de.getTime()) return null;
  const clipS = evS > ds ? evS : ds;
  const clipE = evE < de ? evE : de;
  const dayMs = 24 * 60 * 60 * 1000;
  const top = ((clipS.getTime() - ds.getTime()) / dayMs) * TIMELINE_HEIGHT;
  const height = ((clipE.getTime() - clipS.getTime()) / dayMs) * TIMELINE_HEIGHT;
  return { top, height };
}

function allDayEventsForDay(day: Date, events: EventDetailed[]): EventDetailed[] {
  const d0 = calendarDateOnly(day);
  return events.filter((ev) => {
    if (!ev.isAllDay) return false;
    const s0 = calendarDateOnly(new Date(ev.start));
    const e0 = calendarDateOnly(new Date(ev.end));
    return d0 >= s0 && d0 <= e0;
  });
}

/** Events that occur on this calendar day (timed overlap + all-day span). Sorted: all-day first, then by start. */
function eventsOverlappingCalendarDay(day: Date, list: EventDetailed[]): EventDetailed[] {
  const ds = dayStart(day).getTime();
  const de = dayEnd(day).getTime();
  const d0 = calendarDateOnly(day);
  const out = list.filter((ev) => {
    const s = new Date(ev.start);
    const e = new Date(ev.end);
    if (ev.isAllDay) {
      const s0 = calendarDateOnly(s);
      const e0 = calendarDateOnly(e);
      return d0 >= s0 && d0 <= e0;
    }
    return e.getTime() > ds && s.getTime() < de;
  });
  return out.sort((a, b) => {
    const aAll = !!a.isAllDay;
    const bAll = !!b.isAllDay;
    if (aAll !== bAll) return aAll ? -1 : 1;
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });
}

function clampDayInMonth(year: number, month: number, preferredDom: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  const dom = Math.min(Math.max(1, preferredDom), last);
  return new Date(year, month, dom);
}

/** Events with any overlap on this calendar month, sorted by start. */
function eventsOverlappingCalendarMonth(y: number, mo: number, list: EventDetailed[]): EventDetailed[] {
  const monthStart = new Date(y, mo, 1, 0, 0, 0, 0).getTime();
  const monthEnd = new Date(y, mo + 1, 0, 23, 59, 59, 999).getTime();
  const out = list.filter((ev) => {
    const s = new Date(ev.start).getTime();
    const e = new Date(ev.end).getTime();
    return e >= monthStart && s <= monthEnd;
  });
  return out.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

type TimedSeg = { ev: EventDetailed; top: number; height: number };

function timedSegmentsOverlap(a: TimedSeg, b: TimedSeg): boolean {
  const a1 = a.top + a.height;
  const b1 = b.top + b.height;
  return a.top < b1 - 0.5 && b.top < a1 - 0.5;
}

/** Lane layout within one overlap-connected group (events that share time overlap). */
function assignLanesInGroup(group: TimedSeg[]): (TimedSeg & { lane: number; laneCount: number })[] {
  const n = group.length;
  if (n === 0) return [];
  const order = group.map((seg, i) => ({ seg, i }));
  order.sort((a, b) => a.seg.top - b.seg.top || a.seg.height - b.seg.height);
  const laneBottoms: number[] = [];
  const laneByOrigIndex = new Array<number>(n);
  for (const { seg, i } of order) {
    const bottom = seg.top + seg.height;
    let lane = 0;
    while (lane < laneBottoms.length && laneBottoms[lane] > seg.top + 0.5) lane++;
    if (lane === laneBottoms.length) laneBottoms.push(bottom);
    else laneBottoms[lane] = Math.max(laneBottoms[lane], bottom);
    laneByOrigIndex[i] = lane;
  }
  const laneCount = Math.max(1, laneBottoms.length);
  return group.map((seg, i) => ({
    ...seg,
    lane: laneByOrigIndex[i],
    laneCount,
  }));
}

/** Each event only shares column width with events it actually overlaps in time (not whole-day max). */
function assignLanesForDay(segments: TimedSeg[]): (TimedSeg & { lane: number; laneCount: number })[] {
  if (segments.length === 0) return [];
  const n = segments.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (timedSegmentsOverlap(segments[i], segments[j])) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }
  const visited = new Array(n).fill(false);
  const out: (TimedSeg & { lane: number; laneCount: number })[] = new Array(n);
  for (let s = 0; s < n; s++) {
    if (visited[s]) continue;
    const comp: number[] = [];
    const stack = [s];
    visited[s] = true;
    while (stack.length) {
      const u = stack.pop()!;
      comp.push(u);
      for (const v of adj[u]) {
        if (!visited[v]) {
          visited[v] = true;
          stack.push(v);
        }
      }
    }
    const groupSegs = comp.map((idx) => segments[idx]);
    const placed = assignLanesInGroup(groupSegs);
    comp.forEach((idx, j) => {
      out[idx] = placed[j];
    });
  }
  return out;
}

const SCOPE_OPTIONS: { key: CalendarScopeMode; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

const TIME_GUTTER_W = 44;

export function CalendarView({
  events,
  groups,
  groupColors = {},
  onSelectEvent,
  onSelectGroup,
  calendarFocusDate: focusDateProp,
  onCalendarFocusDateChange,
  calendarScopeMode: scopeModeProp,
  onCalendarScopeModeChange,
  onWeekCreateEvent,
  onWeekEventTimeMove,
  weekEventMovePendingId,
  calendarBodyScrollY,
  onCalendarBodyScrollYCommit,
  calendarScrollPrefsReady = false,
  clearWeekSlotDraftSeq = 0,
  calendarYearMonthStrip,
  onCalendarYearMonthStripCommit,
}: CalendarViewProps) {
  const { userId: meId } = useCurrentUserContext();
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [internalFocus, setInternalFocus] = useState(() => new Date());
  const [internalScope, setInternalScope] = useState<CalendarScopeMode>('week');
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [scopeMenuAnchor, setScopeMenuAnchor] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const scopeDropdownRef = useRef<View>(null);
  const [weekSlotDraft, setWeekSlotDraft] = useState<{
    dayKey: string;
    top: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (clearWeekSlotDraftSeq > 0) {
      setWeekSlotDraft(null);
    }
  }, [clearWeekSlotDraftSeq]);

  /** Actual width of the week day strip (avoids using full window width when parent is narrower). */
  const [weekDaysStripMeasuredW, setWeekDaysStripMeasuredW] = useState<number | null>(null);
  /** Source day column lifted above siblings while a timed event is dragged across days. */
  const [weekDragSourceDayKey, setWeekDragSourceDayKey] = useState<string | null>(null);

  const controlledFocus = focusDateProp != null && onCalendarFocusDateChange != null;
  const controlledScope = scopeModeProp != null && onCalendarScopeModeChange != null;
  const focusDate = controlledFocus ? focusDateProp! : internalFocus;
  const scopeMode = controlledScope ? scopeModeProp! : internalScope;

  const setFocusDate = useCallback(
    (updater: Date | ((d: Date) => Date)) => {
      if (controlledFocus) {
        const prev = focusDateProp!;
        const next = typeof updater === 'function' ? updater(prev) : updater;
        onCalendarFocusDateChange!(next);
      } else {
        setInternalFocus((prev) => (typeof updater === 'function' ? updater(prev) : updater));
      }
    },
    [controlledFocus, focusDateProp, onCalendarFocusDateChange]
  );

  const setScopeMode = useCallback(
    (mode: CalendarScopeMode) => {
      if (controlledScope) onCalendarScopeModeChange!(mode);
      else setInternalScope(mode);
    },
    [controlledScope, onCalendarScopeModeChange]
  );

  const closeScopeMenu = useCallback(() => {
    setScopeMenuOpen(false);
    setScopeMenuAnchor(null);
  }, []);

  const openScopeMenu = useCallback(() => {
    scopeDropdownRef.current?.measureInWindow((x, y, width, height) => {
      setScopeMenuAnchor({ top: y, left: x, width, height });
      setScopeMenuOpen(true);
    });
  }, []);

  const scopeMenuPosition = useMemo(() => {
    if (!scopeMenuAnchor) return null;
    const pad = 8;
    const gap = 4;
    const menuW = Math.max(168, scopeMenuAnchor.width);
    const estMenuH = SCOPE_OPTIONS.length * 48 + 4;
    let left = scopeMenuAnchor.left;
    left = Math.min(Math.max(pad, left), winW - menuW - pad);
    let top = scopeMenuAnchor.top + scopeMenuAnchor.height + gap;
    const maxBottom = winH - Math.max(insets.bottom, pad) - pad;
    if (top + estMenuH > maxBottom) {
      top = Math.max(insets.top + pad, scopeMenuAnchor.top - estMenuH - gap);
    }
    return { top, left, width: menuW };
  }, [scopeMenuAnchor, winH, winW, insets.bottom, insets.top]);

  useEffect(() => {
    if (scopeMode !== 'week' && scopeMode !== 'day') {
      setWeekSlotDraft(null);
      setWeekDragSourceDayKey(null);
    }
  }, [scopeMode]);

  const weekBodyVerticalRef = useRef<ComponentRef<typeof GestureScrollView>>(null);
  const monthVerticalRef = useRef<ScrollView>(null);
  const yearVerticalRef = useRef<ScrollView>(null);
  const yearMonthStripScrollRef = useRef<ScrollView>(null);
  const yearStripViewportWRef = useRef(0);
  const [yearStripViewportW, setYearStripViewportW] = useState(0);
  const latestYearStripXRef = useRef(0);
  const yearStripSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** After we auto-center once for a calendar year (no saved strip), ignore until `year` changes. */
  const appliedDefaultYearStripForYearRef = useRef<number | null>(null);
  const stripScrollYearRef = useRef(0);
  const bodyScrollMapRef = useRef(calendarBodyScrollY);
  bodyScrollMapRef.current = calendarBodyScrollY;
  const scopeModeRef = useRef(scopeMode);
  scopeModeRef.current = scopeMode;
  const didRestoreBodyScrollRef = useRef<Partial<Record<CalendarScopeMode, boolean>>>({});
  const prevScopeForScrollRef = useRef(scopeMode);
  const latestBodyScrollYRef = useRef<Partial<Record<CalendarScopeMode, number>>>({});
  const bodyScrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    if (prevScopeForScrollRef.current !== scopeMode) {
      didRestoreBodyScrollRef.current[prevScopeForScrollRef.current] = false;
      prevScopeForScrollRef.current = scopeMode;
    }
  }, [scopeMode]);

  const scheduleBodyScrollPersist = useCallback(
    (mode: CalendarScopeMode, y: number) => {
      if (!onCalendarBodyScrollYCommit) return;
      latestBodyScrollYRef.current[mode] = y;
      if (bodyScrollSaveTimerRef.current) clearTimeout(bodyScrollSaveTimerRef.current);
      bodyScrollSaveTimerRef.current = setTimeout(() => {
        bodyScrollSaveTimerRef.current = null;
        onCalendarBodyScrollYCommit(mode, Math.max(0, Math.round(y)));
      }, 280);
    },
    [onCalendarBodyScrollYCommit]
  );

  const flushBodyScrollPersist = useCallback(() => {
    if (!onCalendarBodyScrollYCommit) return;
    if (bodyScrollSaveTimerRef.current) {
      clearTimeout(bodyScrollSaveTimerRef.current);
      bodyScrollSaveTimerRef.current = null;
    }
    const mode = scopeModeRef.current;
    const y = latestBodyScrollYRef.current[mode];
    if (y != null) onCalendarBodyScrollYCommit(mode, Math.max(0, Math.round(y)));
  }, [onCalendarBodyScrollYCommit]);

  const scheduleYearStripScrollPersist = useCallback(
    (stripYear: number, x: number) => {
      if (!onCalendarYearMonthStripCommit) return;
      latestYearStripXRef.current = x;
      if (yearStripSaveTimerRef.current) clearTimeout(yearStripSaveTimerRef.current);
      yearStripSaveTimerRef.current = setTimeout(() => {
        yearStripSaveTimerRef.current = null;
        onCalendarYearMonthStripCommit({
          year: stripYear,
          x: Math.max(0, Math.round(x)),
        });
      }, 280);
    },
    [onCalendarYearMonthStripCommit]
  );

  const flushYearStripScrollPersist = useCallback(() => {
    if (!onCalendarYearMonthStripCommit) return;
    if (yearStripSaveTimerRef.current) {
      clearTimeout(yearStripSaveTimerRef.current);
      yearStripSaveTimerRef.current = null;
    }
    onCalendarYearMonthStripCommit({
      year: stripScrollYearRef.current,
      x: Math.max(0, Math.round(latestYearStripXRef.current)),
    });
  }, [onCalendarYearMonthStripCommit]);

  useEffect(() => {
    return () => {
      if (bodyScrollSaveTimerRef.current) {
        clearTimeout(bodyScrollSaveTimerRef.current);
        bodyScrollSaveTimerRef.current = null;
      }
      if (yearStripSaveTimerRef.current) {
        clearTimeout(yearStripSaveTimerRef.current);
        yearStripSaveTimerRef.current = null;
      }
      if (onCalendarBodyScrollYCommit) {
        const mode = scopeModeRef.current;
        const y = latestBodyScrollYRef.current[mode];
        if (y != null) onCalendarBodyScrollYCommit(mode, Math.max(0, Math.round(y)));
      }
      if (onCalendarYearMonthStripCommit && scopeModeRef.current === 'year') {
        onCalendarYearMonthStripCommit({
          year: stripScrollYearRef.current,
          x: Math.max(0, Math.round(latestYearStripXRef.current)),
        });
      }
    };
  }, [onCalendarBodyScrollYCommit, onCalendarYearMonthStripCommit]);

  useEffect(() => {
    if (!calendarScrollPrefsReady) return;
    const mode = scopeMode;
    if (didRestoreBodyScrollRef.current[mode]) return;
    const y = bodyScrollMapRef.current?.[mode];
    const id = requestAnimationFrame(() => {
      if (y != null && y >= 1) {
        if (mode === 'week' || mode === 'day') {
          weekBodyVerticalRef.current?.scrollTo({ y, animated: false });
        } else if (mode === 'month') {
          monthVerticalRef.current?.scrollTo({ y, animated: false });
        } else if (mode === 'year') {
          yearVerticalRef.current?.scrollTo({ y, animated: false });
        }
      }
      didRestoreBodyScrollRef.current[mode] = true;
    });
    return () => cancelAnimationFrame(id);
  }, [calendarScrollPrefsReady, scopeMode]);

  const onWeekDayBodyScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (scopeMode !== 'week' && scopeMode !== 'day') return;
      scheduleBodyScrollPersist(scopeMode, e.nativeEvent.contentOffset.y);
    },
    [scopeMode, scheduleBodyScrollPersist]
  );

  const onMonthBodyScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scheduleBodyScrollPersist('month', e.nativeEvent.contentOffset.y);
    },
    [scheduleBodyScrollPersist]
  );

  const onYearBodyScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scheduleBodyScrollPersist('year', e.nativeEvent.contentOffset.y);
    },
    [scheduleBodyScrollPersist]
  );

  const year = focusDate.getFullYear();
  const month = focusDate.getMonth();
  stripScrollYearRef.current = year;

  const onYearMonthStripScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (scopeMode !== 'year') return;
      const x = e.nativeEvent.contentOffset.x;
      latestYearStripXRef.current = x;
      scheduleYearStripScrollPersist(year, x);
    },
    [scopeMode, year, scheduleYearStripScrollPersist]
  );

  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);

  /** Square month tile in year horizontal strip; mini calendar cells derive from this. */
  const yearMonthCardSize = useMemo(
    () => Math.min(200, Math.max(96, Math.round(winW - 48))),
    [winW]
  );

  const yearCardPad = 6;
  const yearCardTitleBand = 14;
  const yearCardDowBand = 12;
  const yearGridInnerW = yearMonthCardSize - yearCardPad * 2;
  const yearGridInnerH = yearMonthCardSize - yearCardPad * 2 - yearCardTitleBand - yearCardDowBand;
  const yearCellW = Math.max(8, Math.floor(yearGridInnerW / 7));
  const yearCellH = Math.max(8, Math.floor(yearGridInnerH / 6));
  const yearDayNumSize = Math.max(7, Math.min(11, Math.floor(Math.min(yearCellW, yearCellH) * 0.52)));
  const yearCellBox = { width: yearCellW, height: yearCellH };

  useEffect(() => {
    if (scopeMode !== 'year') {
      appliedDefaultYearStripForYearRef.current = null;
    }
  }, [scopeMode]);

  const scrollYearStripToCenterMonth = useCallback(
    (calendarYear: number, monthIdx: number, animated: boolean) => {
      stripScrollYearRef.current = calendarYear;
      const vw = yearStripViewportWRef.current || yearStripViewportW;
      if (vw < 8) return;
      const x = yearStripScrollToCenterMonth(monthIdx, yearMonthCardSize, vw);
      yearMonthStripScrollRef.current?.scrollTo({ x, animated });
      latestYearStripXRef.current = x;
      if (yearStripSaveTimerRef.current) {
        clearTimeout(yearStripSaveTimerRef.current);
        yearStripSaveTimerRef.current = null;
      }
      onCalendarYearMonthStripCommit?.({ year: calendarYear, x });
    },
    [yearMonthCardSize, yearStripViewportW, onCalendarYearMonthStripCommit]
  );

  useLayoutEffect(() => {
    if (scopeMode !== 'year' || !calendarScrollPrefsReady || yearStripViewportW < 8) return;
    const vw = yearStripViewportW;
    const cardSize = yearMonthCardSize;
    const saved = calendarYearMonthStrip;
    const stripRef = yearMonthStripScrollRef.current;
    if (!stripRef) return;

    if (saved?.year === year) {
      appliedDefaultYearStripForYearRef.current = year;
      const x = yearStripClampScroll(saved.x, cardSize, vw);
      stripRef.scrollTo({ x, animated: false });
      latestYearStripXRef.current = x;
      return;
    }

    if (appliedDefaultYearStripForYearRef.current === year) {
      return;
    }
    appliedDefaultYearStripForYearRef.current = year;
    const today = new Date();
    const centerMo = year === today.getFullYear() ? today.getMonth() : month;
    const x = yearStripScrollToCenterMonth(centerMo, cardSize, vw);
    stripRef.scrollTo({ x, animated: false });
    latestYearStripXRef.current = x;
    onCalendarYearMonthStripCommit?.({ year, x });
  }, [
    scopeMode,
    year,
    month,
    calendarScrollPrefsReady,
    calendarYearMonthStrip,
    yearMonthCardSize,
    yearStripViewportW,
    onCalendarYearMonthStripCommit,
  ]);

  const goToToday = useCallback(() => {
    const t = new Date();
    setFocusDate(t);
    if (scopeMode === 'year') {
      requestAnimationFrame(() => {
        scrollYearStripToCenterMonth(t.getFullYear(), t.getMonth(), true);
      });
    }
  }, [scopeMode, scrollYearStripToCenterMonth]);

  const groupsMap = useMemo(() => {
    const map: Record<string, GroupScoped> = {};
    groups.forEach((g) => (map[g.id] = g));
    return map;
  }, [groups]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventDetailed[]>();
    for (const ev of events) {
      const d = new Date(ev.start);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }, [events]);

  const monthSelectedDayEvents = useMemo(
    () => eventsOverlappingCalendarDay(focusDate, events),
    [focusDate, events]
  );

  const yearSelectedMonthEvents = useMemo(
    () => eventsOverlappingCalendarMonth(year, month, events),
    [year, month, events]
  );

  const prevNav = () => {
    setFocusDate((d) => {
      if (scopeMode === 'day') return addDays(d, -1);
      if (scopeMode === 'week') return addDays(d, -7);
      if (scopeMode === 'month') return new Date(d.getFullYear(), d.getMonth() - 1, d.getDate());
      return new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
    });
  };

  const nextNav = () => {
    setFocusDate((d) => {
      if (scopeMode === 'day') return addDays(d, 1);
      if (scopeMode === 'week') return addDays(d, 7);
      if (scopeMode === 'month') return new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
      return new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
    });
  };

  const weekStart = useMemo(() => startOfWeekSunday(focusDate), [focusDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const timelineDays = useMemo((): Date[] => {
    if (scopeMode === 'day') {
      return [new Date(focusDate.getFullYear(), focusDate.getMonth(), focusDate.getDate())];
    }
    return weekDays;
  }, [scopeMode, focusDate, weekDays]);

  /** Outer week timeline horizontal padding (weekTimelineOuter paddingHorizontal 4 × 2). */
  const weekTimelineHPadding = 8;
  const availWeekDaysWidth = winW - TIME_GUTTER_W - weekTimelineHPadding;
  /** Horizontal margin total per column (weekDayColumn marginHorizontal 2 + 2). */
  const dayColGutter = 4;
  const maxColThatFits = (availWeekDaysWidth - 7 * dayColGutter) / 7;
  const dayColWidth = Math.max(76, maxColThatFits);
  const weekScrollContentWidth = 7 * dayColWidth + 7 * dayColGutter;
  const weekNeedsHorizontalScroll = weekScrollContentWidth > availWeekDaysWidth + 0.5;
  /** Center-to-center distance between day columns (for drag across dates). */
  useEffect(() => {
    if (scopeMode !== 'week' || weekNeedsHorizontalScroll) setWeekDaysStripMeasuredW(null);
  }, [scopeMode, weekNeedsHorizontalScroll, winW]);

  const dayColWidthResolved =
    weekNeedsHorizontalScroll || weekDaysStripMeasuredW == null
      ? dayColWidth
      : Math.max(56, (weekDaysStripMeasuredW - 7 * dayColGutter) / 7);
  const weekColumnStrideResolved = dayColWidthResolved + dayColGutter;

  const maxAllDayBandHeight = useMemo(() => {
    let m = 0;
    for (const day of timelineDays) {
      m = Math.max(m, estimateAllDayBandHeight(allDayEventsForDay(day, events).length));
    }
    return m;
  }, [timelineDays, events]);

  const navCenterLabel = useMemo(() => {
    if (scopeMode === 'day') {
      return focusDate.toLocaleDateString('default', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
    if (scopeMode === 'week') {
      const weekEnd = addDays(weekStart, 6);
      const sameYear = weekStart.getFullYear() === weekEnd.getFullYear();
      const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
      const a = weekStart.toLocaleDateString('default', opts);
      const b = weekEnd.toLocaleDateString(
        'default',
        sameYear ? opts : { ...opts, year: 'numeric' }
      );
      return `${a} – ${b}`;
    }
    if (scopeMode === 'month') {
      return focusDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    }
    return String(focusDate.getFullYear());
  }, [scopeMode, focusDate, weekStart]);

  const scopeLabel = SCOPE_OPTIONS.find((o) => o.key === scopeMode)?.label ?? 'Week';

  const now = new Date();
  const nowMinutes =
    now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const nowLineTop = (nowMinutes / (24 * 60)) * TIMELINE_HEIGHT;

  const needsWeekHorizontalScroll = scopeMode === 'week' && weekNeedsHorizontalScroll;

  const timelineParts = useMemo(() => {
    const colLayoutStyle =
      scopeMode === 'day' || !weekNeedsHorizontalScroll
        ? ({ flex: 1, minWidth: 0 } as const)
        : ({ width: dayColWidthResolved } as const);
    const columnStrideForDrag = scopeMode === 'day' ? 0 : weekColumnStrideResolved;
    const header = (
      <View
        style={[
          styles.weekDayHeaderRow,
          { minHeight: WEEK_HEADER_ROW_HEIGHT, alignSelf: 'stretch', width: '100%' },
        ]}
      >
        {timelineDays.map((day) => {
          const sel = isSameDay(day, focusDate);
          const today = isToday(day);
          return (
            <TouchableOpacity
              key={dateKey(day)}
              style={[
                styles.weekDayHeaderCell,
                colLayoutStyle,
                sel && styles.weekDayHeaderCellSelected,
              ]}
              onPress={() => setFocusDate(day)}
              activeOpacity={0.75}
            >
              <Text style={[styles.weekDayHeaderDow, sel && styles.weekDayHeaderTextSelected]}>
                {WEEKDAYS[day.getDay()]}
              </Text>
              <Text
                style={[
                  styles.weekDayHeaderDom,
                  sel && styles.weekDayHeaderTextSelected,
                  today && !sel && styles.weekDayHeaderDomToday,
                ]}
              >
                {day.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
    const body = (
      <View style={[styles.weekTimelineBody, { alignSelf: 'stretch', width: '100%' }]}>
        {timelineDays.map((day) => {
            const allDay = allDayEventsForDay(day, events);
            const timed: TimedSeg[] = [];
            for (const ev of events) {
              const seg = timedSegmentForDay(ev, day);
              if (seg) timed.push({ ev, ...seg });
            }
            const placed = assignLanesForDay(timed);
            const showNowLine = isToday(day);

            return (
              <View
                key={dateKey(day)}
                style={[
                  styles.weekDayColumn,
                  colLayoutStyle,
                  weekDragSourceDayKey === dateKey(day) && styles.weekDayColumnDragLift,
                ]}
              >
                <View
                  style={[
                    styles.allDayBand,
                    maxAllDayBandHeight > 0 && { minHeight: maxAllDayBandHeight },
                  ]}
                >
                  {allDay.map((ev) => {
                    const group = groupsMap[ev.groupId];
                    const userColorHex =
                      groupColors[ev.groupId] ||
                      (group ? getDefaultGroupThemeFromName(group.name) : '#EC4899');
                    const p = getGroupColor(userColorHex);
                    return (
                      <TouchableOpacity
                        key={eventOccurrenceKey(ev)}
                        onPress={() => onSelectEvent(ev)}
                        style={[styles.allDayChip, { backgroundColor: p.label, borderLeftColor: p.dot }]}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.allDayChipText, { color: p.text }]} numberOfLines={2}>
                          {ev.title}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={[styles.hourGrid, { height: TIMELINE_HEIGHT }]}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <View
                      key={h}
                      style={[styles.hourLine, { top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }]}
                    />
                  ))}
                  {showNowLine ? (
                    <View style={[styles.nowLine, { top: nowLineTop }]} pointerEvents="none" />
                  ) : null}
                  {onWeekCreateEvent ? (
                    <>
                      <WeekDayTimelineGestures
                        day={day}
                        timelineHeight={TIMELINE_HEIGHT}
                        requireLongPressToPaint={scopeMode === 'week' || scopeMode === 'day'}
                        onDraftChange={(d) =>
                          setWeekSlotDraft(d ? { dayKey: dateKey(day), ...d } : null)
                        }
                        onCommitRange={(start, end) => onWeekCreateEvent(start, end)}
                      />
                      {weekSlotDraft?.dayKey === dateKey(day) ? (
                        <View
                          pointerEvents="none"
                          style={[
                            styles.weekSlotDraft,
                            { top: weekSlotDraft.top, height: weekSlotDraft.height },
                          ]}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {placed.map(({ ev, top, height, lane, laneCount }) => {
                    const group = groupsMap[ev.groupId];
                    const userColorHex =
                      groupColors[ev.groupId] ||
                      (group ? getDefaultGroupThemeFromName(group.name) : '#EC4899');
                    const p = getGroupColor(userColorHex);
                    const wPct = 100 / laneCount;
                    const leftPct = lane * wPct;
                    const segKey = `wk-${ev.id}-${String(ev.start)}-${dateKey(day)}`;
                    const creatorCanDragWeek =
                      !!onWeekEventTimeMove && !!meId && ev.createdBy === meId;
                    const eventEnded = new Date(ev.end).getTime() < Date.now();
                    if (creatorCanDragWeek && !eventEnded) {
                      return (
                        <WeekTimedEventDraggable
                          key={segKey}
                          ev={ev}
                          columnDay={day}
                          weekDays={timelineDays}
                          top={top}
                          height={height}
                          leftPct={leftPct}
                          widthPct={wPct}
                          columnStride={columnStrideForDrag}
                          timelineHeight={TIMELINE_HEIGHT}
                          colors={{ label: p.label, dot: p.dot, text: p.text }}
                          canDrag
                          movePending={weekEventMovePendingId === ev.id}
                          onPress={() => onSelectEvent(ev)}
                          onMoveCommit={(start, end) => {
                            void onWeekEventTimeMove!(ev, start, end);
                          }}
                          onDragActiveChange={(active) => {
                            setWeekDragSourceDayKey(active ? dateKey(day) : null);
                          }}
                        />
                      );
                    }
                    return (
                      <TouchableOpacity
                        key={segKey}
                        onPress={() => onSelectEvent(ev)}
                        style={[
                          styles.timedEventBlock,
                          {
                            top,
                            height,
                            left: `${leftPct}%`,
                            width: `${wPct}%`,
                            backgroundColor: p.label,
                            borderLeftColor: p.dot,
                          },
                        ]}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.timedEventTitle, { color: p.text }]} numberOfLines={2}>
                          {ev.title}
                        </Text>
                        <Text
                          style={[styles.timedEventTime, { color: p.text, opacity: 0.75 }]}
                          numberOfLines={1}
                        >
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
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}
      </View>
    );
    return { header, body };
  }, [
    timelineDays,
    focusDate,
    scopeMode,
    weekNeedsHorizontalScroll,
    dayColWidthResolved,
    weekColumnStrideResolved,
    events,
    groupsMap,
    groupColors,
    maxAllDayBandHeight,
    onWeekCreateEvent,
    weekSlotDraft,
    onWeekEventTimeMove,
    weekEventMovePendingId,
    meId,
    onSelectEvent,
    setFocusDate,
    nowLineTop,
    weekColumnStrideResolved,
    setWeekSlotDraft,
    weekDragSourceDayKey,
  ]);

  const weekHeaderHRef = useRef<ComponentRef<typeof GestureScrollView>>(null);
  const weekBodyHRef = useRef<ComponentRef<typeof GestureScrollView>>(null);
  const weekHSyncLock = useRef(false);

  const onWeekHeaderHScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (weekHSyncLock.current || !needsWeekHorizontalScroll) return;
    const x = e.nativeEvent.contentOffset.x;
    weekHSyncLock.current = true;
    weekBodyHRef.current?.scrollTo({ x, animated: false });
    requestAnimationFrame(() => {
      weekHSyncLock.current = false;
    });
  }, [needsWeekHorizontalScroll]);

  const onWeekBodyHScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (weekHSyncLock.current || !needsWeekHorizontalScroll) return;
    const x = e.nativeEvent.contentOffset.x;
    weekHSyncLock.current = true;
    weekHeaderHRef.current?.scrollTo({ x, animated: false });
    requestAnimationFrame(() => {
      weekHSyncLock.current = false;
    });
  }, [needsWeekHorizontalScroll]);

  const renderMonthNavigation = () => (
    <View style={styles.monthNav}>
      <TouchableOpacity onPress={prevNav} style={styles.navBtn}>
        <Text style={styles.navBtnText}>‹</Text>
      </TouchableOpacity>
      <View style={styles.monthLabel}>
        <Text style={styles.monthLabelText}>{navCenterLabel}</Text>
      </View>
      <TouchableOpacity onPress={nextNav} style={styles.navBtn}>
        <Text style={styles.navBtnText}>›</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.calendarRoot}>
      <View style={styles.toolbarRow}>
        <TouchableOpacity onPress={goToToday} style={styles.todayBtn} activeOpacity={0.75}>
          <Text style={styles.todayBtnText}>Today</Text>
        </TouchableOpacity>
        <View ref={scopeDropdownRef} collapsable={false}>
          <TouchableOpacity onPress={openScopeMenu} style={styles.scopeDropdown} activeOpacity={0.75}>
            <Text style={styles.scopeDropdownText}>{scopeLabel}</Text>
            <Ionicons name="chevron-down" size={16} color={Colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={scopeMenuOpen} transparent animationType="fade" onRequestClose={closeScopeMenu}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeScopeMenu} />
          {scopeMenuPosition ? (
            <View
              style={[
                styles.modalMenuWrap,
                {
                  top: scopeMenuPosition.top,
                  left: scopeMenuPosition.left,
                  width: scopeMenuPosition.width,
                },
              ]}
              pointerEvents="box-none"
            >
            <View style={styles.scopeMenu}>
              {SCOPE_OPTIONS.map(({ key, label }, i) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.scopeMenuItem,
                    i === SCOPE_OPTIONS.length - 1 && styles.scopeMenuItemLast,
                    scopeMode === key && styles.scopeMenuItemActive,
                  ]}
                  onPress={() => {
                    setScopeMode(key);
                    closeScopeMenu();
                  }}
                >
                  <Text style={[styles.scopeMenuItemText, scopeMode === key && styles.scopeMenuItemTextActive]}>
                    {label}
                  </Text>
                  {scopeMode === key ? (
                    <Ionicons name="checkmark" size={18} color={Colors.accentFg} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
            </View>
          ) : null}
        </View>
      </Modal>

      {scopeMode !== 'month' && scopeMode !== 'year' ? renderMonthNavigation() : null}

      {(scopeMode === 'week' || scopeMode === 'day') && (
        <View style={[styles.weekTimelineOuter, styles.weekTimelineOuterFlex]}>
          <View style={styles.weekTimelineStack}>
            <View style={styles.weekPinnedHeaderRow}>
              <View style={[styles.weekHeaderGutterSpacer, { width: TIME_GUTTER_W }]} />
              {needsWeekHorizontalScroll ? (
                <GestureScrollView
                  ref={weekHeaderHRef}
                  horizontal
                  showsHorizontalScrollIndicator
                  nestedScrollEnabled
                  style={styles.weekScrollableDays}
                  contentContainerStyle={{ width: weekScrollContentWidth }}
                  onScroll={onWeekHeaderHScroll}
                  scrollEventThrottle={16}
                >
                  <View style={{ width: weekScrollContentWidth }}>{timelineParts.header}</View>
                </GestureScrollView>
              ) : (
                <View
                  style={styles.weekScrollableDays}
                  onLayout={(e) => {
                    const w = e.nativeEvent.layout.width;
                    if (w > 0) setWeekDaysStripMeasuredW(w);
                  }}
                >
                  <View style={styles.weekDaysInnerStretch}>{timelineParts.header}</View>
                </View>
              )}
            </View>
            <GestureScrollView
              ref={weekBodyVerticalRef}
              style={styles.weekBodyVerticalScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              onScroll={onWeekDayBodyScroll}
              onScrollEndDrag={flushBodyScrollPersist}
              onMomentumScrollEnd={flushBodyScrollPersist}
              scrollEventThrottle={64}
            >
              <View style={styles.weekTimelineWithFrozenGutter}>
                <View style={[styles.weekFrozenGutter, { width: TIME_GUTTER_W }]}>
                  <View style={{ height: maxAllDayBandHeight }} />
                  <View style={[styles.timeGutter, styles.weekFrozenTimeGutter]}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <View key={h} style={[styles.timeGutterHour, { height: HOUR_HEIGHT }]}>
                        <Text style={styles.timeGutterLabel}>{formatHourLabel(h)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                {needsWeekHorizontalScroll ? (
                  <GestureScrollView
                    ref={weekBodyHRef}
                    horizontal
                    showsHorizontalScrollIndicator
                    nestedScrollEnabled
                    style={styles.weekScrollableDays}
                    contentContainerStyle={{ width: weekScrollContentWidth }}
                    onScroll={onWeekBodyHScroll}
                    scrollEventThrottle={16}
                  >
                    <View style={{ width: weekScrollContentWidth }}>{timelineParts.body}</View>
                  </GestureScrollView>
                ) : (
                  <View style={styles.weekScrollableDays}>
                    <View style={styles.weekDaysInnerStretch}>{timelineParts.body}</View>
                  </View>
                )}
              </View>
            </GestureScrollView>
          </View>
        </View>
      )}

      {scopeMode === 'month' && (
        <ScrollView
          ref={monthVerticalRef}
          style={styles.monthYearScroll}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          onScroll={onMonthBodyScroll}
          onScrollEndDrag={flushBodyScrollPersist}
          onMomentumScrollEnd={flushBodyScrollPersist}
          scrollEventThrottle={64}
        >
          {renderMonthNavigation()}
          <View style={styles.weekdayRowStickyWrap}>
            <View style={styles.weekdayRow}>
              {WEEKDAYS.map((d) => (
                <Text key={d} style={styles.weekdayCell}>
                  {d}
                </Text>
              ))}
            </View>
          </View>

          <View style={styles.grid}>
            {grid.map((row, ri) => (
              <View key={ri} style={styles.gridRow}>
                {row.map((cell, ci) => {
                  if (!cell) return <View key={ci} style={styles.cell} />;
                  const key = `${cell.getFullYear()}-${cell.getMonth()}-${cell.getDate()}`;
                  const dayEvents = eventsByDate.get(key) ?? [];
                  const selected = isSameDay(cell, focusDate);
                  const today = isToday(cell);
                  return (
                    <TouchableOpacity
                      key={ci}
                      style={[
                        styles.cell,
                        selected && styles.cellSelected,
                        today && !selected && styles.cellToday,
                      ]}
                      onPress={() => setFocusDate(cell)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.cellText,
                          selected && styles.cellTextSelected,
                          today && !selected && styles.cellTextToday,
                        ]}
                      >
                        {cell.getDate()}
                      </Text>
                      {dayEvents.length > 0 && (
                        <View style={styles.dotWrap}>
                          {dayEvents.slice(0, 2).map((ev) => {
                            const group = groupsMap[ev.groupId];
                            const userColorHex =
                              groupColors[ev.groupId] ||
                              (group ? getDefaultGroupThemeFromName(group.name) : '#EC4899');
                            const p = getGroupColor(userColorHex);
                            return (
                              <View
                                key={eventOccurrenceKey(ev)}
                                style={[
                                  styles.dot,
                                  selected && styles.dotSelected,
                                  { backgroundColor: p.dot },
                                ]}
                              />
                            );
                          })}
                          {dayEvents.length > 2 && (
                            <Text style={[styles.dotMore, selected && styles.dotMoreSelected]}>
                              +{dayEvents.length - 2}
                            </Text>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          <View style={styles.monthDayEventsSection}>
            <Text style={styles.monthDayEventsSectionTitle}>
              {focusDate.toLocaleDateString('default', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
            {monthSelectedDayEvents.length === 0 ? (
              <Text style={styles.monthDayEventsEmpty}>No events this day</Text>
            ) : (
              <View style={styles.monthDayEventsList}>
                {monthSelectedDayEvents.map((ev, i) => {
                  const group = groupsMap[ev.groupId];
                  const userColorHex =
                    groupColors[ev.groupId] ||
                    (group ? getDefaultGroupThemeFromName(group.name) : '#EC4899');
                  return (
                    <View key={eventOccurrenceKey(ev)} style={styles.monthDayEventRowWrap}>
                      <EventRow
                        ev={ev}
                        group={group}
                        groupColorHex={userColorHex}
                        onPress={() => onSelectEvent(ev)}
                        onGroupPress={onSelectGroup}
                        isLast={i === monthSelectedDayEvents.length - 1}
                        meId={meId}
                        users={[]}
                      />
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {scopeMode === 'year' && (
        <ScrollView
          ref={yearVerticalRef}
          style={styles.monthYearScroll}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          onScroll={onYearBodyScroll}
          onScrollEndDrag={flushBodyScrollPersist}
          onMomentumScrollEnd={flushBodyScrollPersist}
          scrollEventThrottle={64}
        >
          {renderMonthNavigation()}
          <ScrollView
            ref={yearMonthStripScrollRef}
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator
            style={[styles.yearMonthStrip, { height: yearMonthCardSize + 16 }]}
            contentContainerStyle={styles.yearMonthStripContent}
            onLayout={(e) => {
              const w = Math.round(e.nativeEvent.layout.width);
              if (w < 1) return;
              yearStripViewportWRef.current = w;
              setYearStripViewportW(w);
            }}
            onScroll={onYearMonthStripScroll}
            scrollEventThrottle={32}
            onScrollEndDrag={flushYearStripScrollPersist}
            onMomentumScrollEnd={flushYearStripScrollPersist}
          >
            {Array.from({ length: 12 }, (_, m) => {
              const monthStart = new Date(year, m, 1);
              const monthGrid = getMonthGrid(year, m);
              const monthHighlighted = sameCalendarMonth(focusDate, monthStart);
              return (
                <TouchableOpacity
                  key={m}
                  activeOpacity={0.88}
                  onPress={() =>
                    setFocusDate(clampDayInMonth(year, m, focusDate.getDate()))
                  }
                  style={[
                    styles.yearMonthSquareCard,
                    {
                      width: yearMonthCardSize,
                      height: yearMonthCardSize,
                      padding: yearCardPad,
                    },
                    monthHighlighted && styles.yearMiniMonthCardSelected,
                  ]}
                >
                  <Text style={styles.yearMiniMonthTitle} numberOfLines={1}>
                    {monthStart.toLocaleString('default', { month: 'short' })}
                  </Text>
                  <View style={styles.yearMiniWeekdayRow}>
                    {WEEKDAYS.map((d) => (
                      <View key={d} style={styles.yearMiniWeekdayCellFlex}>
                        <Text style={styles.yearMiniWeekdayCell}>{d.slice(0, 1)}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.yearMonthSquareGrid}>
                    {monthGrid.map((row, ri) => (
                      <View key={ri} style={styles.yearMiniGridRow}>
                        {row.map((cell, ci) => {
                          if (!cell) {
                            return (
                              <View key={ci} style={[styles.yearMiniCellEmpty, yearCellBox]} />
                            );
                          }
                          const key = `${cell.getFullYear()}-${cell.getMonth()}-${cell.getDate()}`;
                          const dayEvents = eventsByDate.get(key) ?? [];
                          const selected = isSameDay(cell, focusDate);
                          const today = isToday(cell);
                          return (
                            <TouchableOpacity
                              key={ci}
                              style={[
                                styles.yearMiniCell,
                                yearCellBox,
                                selected && styles.yearMiniCellSelected,
                                today && !selected && styles.yearMiniCellToday,
                              ]}
                              onPress={() => setFocusDate(cell)}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.yearMiniCellText,
                                  { fontSize: yearDayNumSize },
                                  selected && styles.yearMiniCellTextSelected,
                                  today && !selected && styles.yearMiniCellTextToday,
                                ]}
                              >
                                {cell.getDate()}
                              </Text>
                              {dayEvents.length > 0 ? (
                                <View style={styles.yearMiniDotWrap}>
                                  {dayEvents.slice(0, 2).map((ev) => {
                                    const group = groupsMap[ev.groupId];
                                    const userColorHex =
                                      groupColors[ev.groupId] ||
                                      (group ? getDefaultGroupThemeFromName(group.name) : '#EC4899');
                                    const p = getGroupColor(userColorHex);
                                    return (
                                      <View
                                        key={eventOccurrenceKey(ev)}
                                        style={[
                                          styles.yearMiniDot,
                                          selected && styles.yearMiniDotSelected,
                                          { backgroundColor: p.dot },
                                        ]}
                                      />
                                    );
                                  })}
                                  {dayEvents.length > 2 ? (
                                    <Text
                                      style={[
                                        styles.yearMiniDotMore,
                                        selected && styles.yearMiniDotMoreSelected,
                                      ]}
                                    >
                                      +{dayEvents.length - 2}
                                    </Text>
                                  ) : null}
                                </View>
                              ) : null}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.yearMonthEventsSection}>
            <Text style={styles.monthDayEventsSectionTitle}>
              {new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
            </Text>
            {yearSelectedMonthEvents.length === 0 ? (
              <Text style={styles.monthDayEventsEmpty}>No events this month</Text>
            ) : (
              <View style={styles.monthDayEventsList}>
                {yearSelectedMonthEvents.map((ev, i) => {
                  const group = groupsMap[ev.groupId];
                  const userColorHex =
                    groupColors[ev.groupId] ||
                    (group ? getDefaultGroupThemeFromName(group.name) : '#EC4899');
                  return (
                    <View key={eventOccurrenceKey(ev)} style={styles.monthDayEventRowWrap}>
                      <EventRow
                        ev={ev}
                        group={group}
                        groupColorHex={userColorHex}
                        onPress={() => onSelectEvent(ev)}
                        onGroupPress={onSelectGroup}
                        isLast={i === yearSelectedMonthEvents.length - 1}
                        meId={meId}
                        users={[]}
                      />
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  calendarRoot: {
    flex: 1,
    minHeight: 0,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
  },
  todayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  todayBtnText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
  },
  scopeDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  scopeDropdownText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
  },
  modalRoot: {
    flex: 1,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  modalMenuWrap: {
    position: 'absolute',
    zIndex: 10,
  },
  scopeMenu: {
    width: '100%',
    minWidth: 168,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  scopeMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  scopeMenuItemLast: {
    borderBottomWidth: 0,
  },
  scopeMenuItemActive: {
    backgroundColor: Colors.accent,
  },
  scopeMenuItemText: {
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Colors.text,
  },
  scopeMenuItemTextActive: {
    color: Colors.accentFg,
    fontFamily: Fonts.bold,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  navBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: { fontSize: 24, color: Colors.text, fontFamily: Fonts.medium },
  monthLabel: { alignItems: 'center', flex: 1 },
  monthLabelText: { fontSize: 17, fontFamily: Fonts.bold, color: Colors.text, textAlign: 'center' },
  weekdayRow: {
    flexDirection: 'row',
    paddingVertical: 8,
  },
  weekdayCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
  },
  weekTimelineOuter: {
    paddingBottom: 12,
    paddingHorizontal: 4,
  },
  weekTimelineOuterFlex: {
    flex: 1,
    minHeight: 0,
  },
  weekTimelineStack: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
  },
  weekPinnedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  weekHeaderGutterSpacer: {
    flexShrink: 0,
    height: WEEK_HEADER_ROW_HEIGHT,
    backgroundColor: Colors.bg,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.border,
  },
  weekBodyVerticalScroll: {
    flex: 1,
    minHeight: 0,
  },
  monthYearScroll: {
    flex: 1,
    minHeight: 0,
  },
  weekdayRowStickyWrap: {
    backgroundColor: Colors.bg,
  },
  weekTimelineWithFrozenGutter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  weekFrozenGutter: {
    flexShrink: 0,
    backgroundColor: Colors.bg,
    zIndex: 1,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.border,
  },
  weekFrozenTimeGutter: {
    paddingRight: 4,
  },
  weekScrollableDays: {
    flex: 1,
    minWidth: 0,
  },
  weekDaysInnerStretch: {
    width: '100%',
    alignSelf: 'stretch',
  },
  weekDayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 8,
  },
  weekDayHeaderCell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: Radius.md,
    marginHorizontal: 2,
  },
  weekDayHeaderCellSelected: {
    backgroundColor: Colors.accent,
  },
  weekDayHeaderDow: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
  },
  weekDayHeaderDom: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: Colors.text,
    marginTop: 2,
  },
  weekDayHeaderDomToday: {
    color: Colors.todayRed,
  },
  weekDayHeaderTextSelected: {
    color: Colors.accentFg,
  },
  weekTimelineBody: {
    flexDirection: 'row',
    marginTop: 4,
    overflow: 'visible',
  },
  timeGutter: {
    paddingRight: 4,
  },
  timeGutterHour: {
    justifyContent: 'flex-start',
    paddingTop: 0,
  },
  timeGutterLabel: {
    fontSize: 10,
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
    textAlign: 'right',
  },
  weekDayColumn: {
    marginHorizontal: 2,
    overflow: 'visible',
  },
  weekDayColumnDragLift: {
    zIndex: 200,
    ...(Platform.OS === 'android' ? { elevation: 20 } : {}),
  },
  allDayBand: {
    minHeight: 0,
    gap: 4,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  allDayChip: {
    borderLeftWidth: 3,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  allDayChipText: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
  },
  hourGrid: {
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    overflow: 'visible',
    backgroundColor: Colors.bg,
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1 / Math.max(PixelRatio.get(), 1),
    borderTopColor: 'rgba(24, 24, 27, 0.11)',
    borderStyle: 'solid',
  },
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.todayRed,
    zIndex: 10,
    marginTop: -1,
  },
  weekSlotDraft: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: 'rgba(24, 24, 27, 0.12)',
    zIndex: 25,
  },
  timedEventBlock: {
    position: 'absolute',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    borderLeftWidth: 3,
    overflow: 'hidden',
    zIndex: 2,
  },
  timedEventTitle: {
    fontSize: 10,
    fontFamily: Fonts.bold,
  },
  timedEventTime: {
    fontSize: 9,
    fontFamily: Fonts.regular,
    marginTop: 1,
  },
  grid: { paddingHorizontal: 4 },
  gridRow: { flexDirection: 'row' },
  cell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    margin: 2,
  },
  cellSelected: {
    backgroundColor: Colors.accent,
  },
  cellToday: {
    borderWidth: 1,
    borderColor: Colors.todayRed,
  },
  cellText: { fontSize: 15, fontFamily: Fonts.medium, color: Colors.text },
  cellTextSelected: { color: Colors.accentFg },
  cellTextToday: { color: Colors.todayRed },
  dotWrap: {
    position: 'absolute',
    bottom: 4,
    height: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  dotSelected: {},
  dotMore: {
    fontSize: 9,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    marginLeft: 1,
    lineHeight: 10,
  },
  dotMoreSelected: {
    color: Colors.accentFg,
  },
  monthDayEventsSection: {
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 100,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginTop: 8,
  },
  monthDayEventsSectionTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Colors.text,
    marginBottom: 12,
  },
  monthDayEventsEmpty: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
    paddingVertical: 8,
  },
  monthDayEventsList: {
    gap: 10,
  },
  monthDayEventRowWrap: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  yearMonthStrip: {
    flexGrow: 0,
    flexShrink: 0,
  },
  yearMonthStripContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'flex-start',
  },
  yearMonthSquareCard: {
    flexDirection: 'column',
    alignItems: 'stretch',
    marginRight: 10,
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  yearMonthSquareGrid: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
  },
  yearMiniWeekdayCellFlex: {
    flex: 1,
    alignItems: 'center',
  },
  yearMonthEventsSection: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 100,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  yearMiniMonthCardSelected: {
    borderColor: Colors.accent,
  },
  yearMiniMonthTitle: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  yearMiniWeekdayRow: {
    flexDirection: 'row',
    flexShrink: 0,
    paddingBottom: 2,
  },
  yearMiniWeekdayCell: {
    textAlign: 'center',
    fontSize: 8,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
  },
  yearMiniGridRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  yearMiniCellEmpty: {
    margin: 0.5,
  },
  yearMiniCell: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
    borderRadius: 6,
    margin: 0.5,
  },
  yearMiniCellSelected: {
    backgroundColor: Colors.accent,
  },
  yearMiniCellToday: {
    borderWidth: 1,
    borderColor: Colors.todayRed,
  },
  yearMiniCellText: {
    fontFamily: Fonts.medium,
    color: Colors.text,
  },
  yearMiniCellTextSelected: {
    color: Colors.accentFg,
  },
  yearMiniCellTextToday: {
    color: Colors.todayRed,
  },
  yearMiniDotWrap: {
    marginTop: 'auto',
    marginBottom: 1,
    minHeight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  yearMiniDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  yearMiniDotSelected: {},
  yearMiniDotMore: {
    fontSize: 7,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    lineHeight: 8,
  },
  yearMiniDotMoreSelected: {
    color: Colors.accentFg,
  },
});
