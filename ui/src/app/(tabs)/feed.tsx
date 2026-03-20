import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Modal, TextInput, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
// Web datetime picker (react-datepicker) – only used on web
let WebDatePicker: any = null;
if (Platform.OS === 'web') {
  // require at runtime so native builds don't try to bundle DOM-only code
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebDatePicker = require('react-datepicker').default;
  // Load default react-datepicker styles on web so the popup calendar/time picker is visible and styled
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('react-datepicker/dist/react-datepicker.css');
  // Lightly override the portal backdrop so it doesn't dim the whole app too strongly
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./react-datepicker-overrides.css');
}
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Colors, Fonts, Radius } from '../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName } from '../../utils/helpers';
import { ListView } from '../../components/ListView';
import { CalendarView } from '../../components/CalendarView';
import { Pill } from '../../components/ui';
import Svg, { Path } from 'react-native-svg';
import { useEvents, useGroups, useNotifications, useAllGroupMemberColors, useUpdateNotification, useMarkAllNotificationsRead } from '../../hooks/api';
import { queryKeys } from '../../config/queryClient';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';

export default function FeedScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId: currentUserId, user: me } = useCurrentUserContext();
  
  const { data: events = [], isLoading: eventsLoading } = useEvents({ userId: currentUserId ?? '', groupId: undefined });
  const { data: allGroups = [], isLoading: groupsLoading } = useGroups(currentUserId ?? '');
  const { data: notifs = [], isLoading: notifsLoading } = useNotifications(currentUserId || '');
  const { data: groupColors = {}, isLoading: colorsLoading } = useAllGroupMemberColors(currentUserId || '');
  const updateNotification = useUpdateNotification();
  const markAllAsRead = useMarkAllNotificationsRead();
  
  const groups = allGroups.filter(g => g.membershipStatus === 'member' || g.membershipStatus === 'admin');
  
  const loading = eventsLoading || groupsLoading || notifsLoading || colorsLoading;
  
  // Manual polling for notifications every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('[Feed] Invalidating notifications at', new Date().toLocaleTimeString());
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.user(currentUserId) });
    }, 5000);
    
    return () => clearInterval(interval);
  }, [queryClient]);
  
  // Filter state
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [filterRsvp,  setFilterRsvp]  = useState<string[]>([]);
  const [filterNeeds, setFilterNeeds] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  // Date range filters (ISO date strings)
  const todayIso = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);
  const defaultStartSpecificText = useMemo(() => `${todayIso} 00:00`, [todayIso]);
  const defaultEndSpecificText = useMemo(() => {
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    return `${y}-${m}-${d} 00:00`;
  }, []);
  const [startDateText, setStartDateText] = useState<string>(defaultStartSpecificText);
  const [endDateText,   setEndDateText]   = useState<string>(defaultEndSpecificText);
  const [startMode,     setStartMode]     = useState<'specific' | 'now' | 'allTime'>('now');
  const [endMode,       setEndMode]       = useState<'specific' | 'now' | 'allTime'>('allTime');
  const [showDateEditor, setShowDateEditor] = useState(false);
  const [dateButtonLayout, setDateButtonLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker,   setShowEndPicker]   = useState(false);
  const [activeDateField, setActiveDateField] = useState<'from' | 'to' | null>(null);
  const [showRsvpDropdown, setShowRsvpDropdown] = useState(false);
  const [rsvpButtonLayout, setRsvpButtonLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [rsvpDropdownLayout, setRsvpDropdownLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [dateDropdownLayout, setDateDropdownLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const RSVP_OPTIONS = [
    ['going', 'Going'],
    ['maybe', 'Maybe'],
    ['notGoing', "Can't go"],
    ['none', 'No response'],
  ] as const;

  const parseDateTime = (txt: string): Date | null => {
    const t = txt.trim();
    if (!t) return null;
    const [datePart, timePart] = t.split(' ');
    const parts = datePart.split('-');
    if (parts.length !== 3) return null;
    const [ys, ms, ds] = parts;
    const y = Number(ys);
    const m = Number(ms);
    const d = Number(ds);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    let hh = 0;
    let mm = 0;
    if (timePart) {
      const [hs, mins] = timePart.split(':');
      hh = Number(hs) || 0;
      mm = Number(mins) || 0;
    }
    const dt = new Date(y, m - 1, d, hh, mm);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  };
  const [showPast,    setShowPast]    = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [showNoGroupAlert, setShowNoGroupAlert] = useState(false);

  const unread = notifs.filter(n => !n.read).length;

  const filtered = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const parseBound = (txt: string): Date | null => {
      const t = txt.trim();
      if (!t) return null;
      const [datePart, timePart] = t.split(' ');
      const parts = datePart.split('-');
      if (parts.length !== 3) return null;
      const [ys, ms, ds] = parts;
      const y = Number(ys);
      const m = Number(ms);
      const d = Number(ds);
      if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
      let hh = 0;
      let mm = 0;
      if (timePart) {
        const [hs, mins] = timePart.split(':');
        hh = Number(hs) || 0;
        mm = Number(mins) || 0;
      }
      const dt = new Date(y, m - 1, d, hh, mm);
      if (Number.isNaN(dt.getTime())) return null;
      return dt;
    };

    const startBound =
      startMode === 'now'
        ? new Date()
        : startMode === 'specific'
          ? (parseBound(startDateText) ?? null)
          : null; // allTime → no lower bound

    const endBound =
      endMode === 'now'
        ? new Date()
        : endMode === 'specific'
          ? parseBound(endDateText)
          : null; // allTime → no upper bound

    return events.filter(ev => {
      if (!groups.some(g => g.id === ev.groupId)) return false;
      if (selectedGroupIds.length > 0 && !selectedGroupIds.includes(ev.groupId)) return false;

      const evStart = typeof ev.start === 'string' ? new Date(ev.start) : ev.start;
      const t = evStart.getTime();
      if (startBound && t < startBound.getTime()) return false;
      if (endBound && t >= endBound.getTime()) return false;

      const rsvps = ev.rsvps || [];
      const myGoing    = !!rsvps.find(r => r.userId === currentUserId && r.status === 'going');
      const myNotGoing = !!rsvps.find(r => r.userId === currentUserId && r.status === 'notGoing');
      const myAnyRsvp  = !!rsvps.find(r => r.userId === currentUserId);

      if (filterRsvp.length) {
        const myMaybe = !!rsvps.find(r => r.userId === currentUserId && r.status === 'maybe');
        const matchesRsvp =
          (filterRsvp.includes('going')    && myGoing) ||
          (filterRsvp.includes('maybe')    && myMaybe) ||
          (filterRsvp.includes('notGoing') && myNotGoing) ||
          (filterRsvp.includes('none')     && !myAnyRsvp);
        if (!matchesRsvp) return false;
      }

      if (filterNeeds && !(ev.minAttendees && rsvps.filter(r => r.status === 'going').length < ev.minAttendees)) return false;
      return true;
    });
  }, [groups, selectedGroupIds, filterRsvp, filterNeeds, startDateText, endDateText, startMode, endMode, events]);

  const hasFilters = !!(selectedGroupIds.length || filterRsvp.length || filterNeeds);

  // Removed loading state - show empty UI instead

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        {/* Title */}
        <Text style={styles.pageTitle}>My Events</Text>

        {/* Actions */}
        <View style={styles.actions}>
          {/* View toggle */}
          <View style={styles.viewToggle}>
            {([['list','☰'],['calendar','📅']] as const).map(([v, icon]) => (
              <TouchableOpacity
                key={v}
                style={[styles.viewBtn, viewMode === v && styles.viewBtnActive]}
                onPress={() => setViewMode(v)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 13, color: viewMode === v ? Colors.text : Colors.textMuted }}>{icon}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Create */}
          <TouchableOpacity
            onPress={() => {
              if (groups.length === 0) {
                setShowNoGroupAlert(true);
                return;
              }
              router.push('/create-event');
            }}
            style={styles.createBtn}
          >
            <Text style={styles.createBtnText}>+ Event</Text>
          </TouchableOpacity>

          {/* Bell */}
          <TouchableOpacity
            onPress={() => setShowNotifs(p => !p)}
            style={[styles.iconBtn, showNotifs && { borderColor: Colors.borderStrong, backgroundColor: Colors.bg }]}
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={Colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <Path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </Svg>
            {unread > 0 && <View style={styles.bellDot} />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Filters container */}
      <View style={styles.filtersContainer}>
        {/* Group filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow} contentContainerStyle={{ gap: 6, paddingRight: 20 }}>
          <Pill
            label="All"
            selected={selectedGroupIds.length === 0}
            onPress={() => setSelectedGroupIds([])}
          />
          {groups.map(g => {
            const userColorHex = groupColors[g.id] || getDefaultGroupThemeFromName(g.name);
            const p = getGroupColor(userColorHex);
            const isSelected = selectedGroupIds.includes(g.id);
            return (
              <Pill
                key={g.id}
                label={g.name}
                selected={isSelected}
                activeColor={p.dot}
                activeBg={p.label}
                activeText={p.text}
                inactiveBorderColor={p.dot}
                onPress={() => {
                  const next = isSelected
                    ? selectedGroupIds.filter(id => id !== g.id)
                    : [...selectedGroupIds, g.id];
                  setSelectedGroupIds(next);
                }}
                onLongPress={() => setSelectedGroupIds([g.id])}
              />
            );
          })}
        </ScrollView>

        {/* RSVP / needs filters (always visible) */}
        <View style={[styles.filterPanel, { position: 'relative' }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingHorizontal: 20, paddingVertical: 8 }}
          >
            <TouchableOpacity
              onPress={() => setShowAdvancedFilters(p => !p)}
              style={[styles.filterIconBtn, showAdvancedFilters && { borderColor: Colors.text, backgroundColor: Colors.text }]}
            >
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={showAdvancedFilters ? Colors.surface : Colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>
              </Svg>
            </TouchableOpacity>
            <Pill
              label="⚠️ Needs people"
              selected={filterNeeds}
              onPress={() => setFilterNeeds(p => !p)}
              activeColor="#FDE68A"
              activeBg="#FFFBEB"
              activeText="#92400E"
            />
          </ScrollView>

          {showAdvancedFilters && (
            <>
            <View style={styles.filterExpandedRow}>
              <Text style={styles.filterExpandedHeader}>RSVP</Text>
              {RSVP_OPTIONS.map(([v, label]) => {
                const isSelected = filterRsvp.includes(v);
                const pillStyle =
                  v === 'going'
                    ? (isSelected ? styles.rsvpPillGoingActive : styles.rsvpPillGoing)
                    : v === 'maybe'
                      ? (isSelected ? styles.rsvpPillMaybeActive : styles.rsvpPillMaybe)
                      : v === 'notGoing'
                        ? (isSelected ? styles.rsvpPillNotGoingActive : styles.rsvpPillNotGoing)
                        : (isSelected ? styles.rsvpPillNoneActive : styles.rsvpPillNone);

                return (
                  <TouchableOpacity
                    key={v}
                    style={[styles.rsvpDropdownItem, pillStyle]}
                    activeOpacity={0.7}
                    onPress={() => {
                      setFilterRsvp(isSelected ? [] : [v]);
                    }}
                  >
                    <Text style={styles.rsvpDropdownLabel}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.filterExpandedRow}>
              <Text style={styles.filterExpandedHeader}>Time Range</Text>
              <View style={styles.dateFilterColumn}>
                <View style={styles.dateFilterRow}>
                  <Text style={styles.dateFilterFieldLabel}>From</Text>
                  <View style={styles.dateFieldWithNow}>
                    <TouchableOpacity
                      style={[
                        styles.dateQuickButton,
                        startMode === 'now' && styles.dateQuickButtonActive,
                      ]}
                      activeOpacity={0.7}
                      onPress={() => {
                        setStartMode('now');
                      }}
                    >
                      <Text style={styles.dateQuickButtonText}>Now</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.dateQuickButton,
                        startMode === 'allTime' && styles.dateQuickButtonActive,
                      ]}
                      activeOpacity={0.7}
                      onPress={() => {
                        setStartMode('allTime');
                      }}
                    >
                      <Text style={styles.dateQuickButtonText}>All time</Text>
                    </TouchableOpacity>
                    {Platform.OS === 'web' && WebDatePicker ? (
                      <View
                        style={[
                          styles.webPickerWrapper,
                          startMode === 'specific' && styles.dateSpecificWrapperActive,
                          activeDateField === 'from' && styles.webPickerActive,
                          { alignSelf: 'flex-start' },
                        ]}
                      >
                        <WebDatePicker
                          selected={startDateText ? parseDateTime(startDateText) : null}
                          onChange={(date: Date | null) => {
                            if (!date) return;
                            const y = date.getFullYear();
                            const m = String(date.getMonth() + 1).padStart(2, '0');
                            const d = String(date.getDate()).padStart(2, '0');
                            const hh = String(date.getHours()).padStart(2, '0');
                            const mm = String(date.getMinutes()).padStart(2, '0');
                            setStartDateText(`${y}-${m}-${d} ${hh}:${mm}`);
                            setStartMode('specific');
                          }}
                          popperPlacement="bottom-start"
                          withPortal
                          onCalendarOpen={() => {
                            if (!startDateText) {
                              const now = new Date();
                              const y = now.getFullYear();
                              const m = String(now.getMonth() + 1).padStart(2, '0');
                              const d = String(now.getDate()).padStart(2, '0');
                              const hh = '00';
                              const mm = '00';
                              setStartDateText(`${y}-${m}-${d} ${hh}:${mm}`);
                            }
                            setActiveDateField('from');
                            setStartMode('specific');
                          }}
                          onCalendarClose={() => setActiveDateField(null)}
                          showTimeSelect
                          timeIntervals={15}
                          dateFormat="yyyy-MM-dd HH:mm"
                          placeholderText={defaultStartSpecificText}
                        />
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => {
                          if (!startDateText) {
                            const now = new Date();
                            const y = now.getFullYear();
                            const m = String(now.getMonth() + 1).padStart(2, '0');
                            const d = String(now.getDate()).padStart(2, '0');
                            const hh = '00';
                            const mm = '00';
                            setStartDateText(`${y}-${m}-${d} ${hh}:${mm}`);
                          }
                          setStartMode('specific');
                          setShowStartPicker(true);
                        }}
                        activeOpacity={0.7}
                        style={[
                          styles.dateValueChip,
                          startMode === 'specific' && styles.dateSpecificWrapperActive,
                        ]}
                      >
                        <Text style={styles.dateValueText}>
                          {startMode === 'now'
                            ? 'Now'
                            : startMode === 'allTime'
                              ? 'All time'
                              : (startDateText || defaultStartSpecificText)}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <View style={styles.dateFilterRow}>
                  <Text style={styles.dateFilterFieldLabel}>To</Text>
                  <View style={styles.dateFieldWithNow}>
                    <TouchableOpacity
                      style={[
                        styles.dateQuickButton,
                        endMode === 'now' && styles.dateQuickButtonActive,
                      ]}
                      activeOpacity={0.7}
                      onPress={() => {
                        setEndMode('now');
                      }}
                    >
                      <Text style={styles.dateQuickButtonText}>Now</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.dateQuickButton,
                        endMode === 'allTime' && styles.dateQuickButtonActive,
                      ]}
                      activeOpacity={0.7}
                      onPress={() => {
                        setEndMode('allTime');
                      }}
                    >
                      <Text style={styles.dateQuickButtonText}>All time</Text>
                    </TouchableOpacity>
                    {Platform.OS === 'web' && WebDatePicker ? (
                      <View
                        style={[
                          styles.webPickerWrapper,
                          endMode === 'specific' && styles.dateSpecificWrapperActive,
                          activeDateField === 'to' && styles.webPickerActive,
                          { alignSelf: 'flex-start' },
                        ]}
                      >
                        <WebDatePicker
                          selected={endDateText ? parseDateTime(endDateText) : null}
                          onChange={(date: Date | null) => {
                            if (!date) return;
                            const y = date.getFullYear();
                            const m = String(date.getMonth() + 1).padStart(2, '0');
                            const d = String(date.getDate()).padStart(2, '0');
                            const hh = String(date.getHours()).padStart(2, '0');
                            const mm = String(date.getMinutes()).padStart(2, '0');
                            setEndDateText(`${y}-${m}-${d} ${hh}:${mm}`);
                            setEndMode('specific');
                          }}
                          popperPlacement="bottom-start"
                          withPortal
                          onCalendarOpen={() => {
                            if (!endDateText) {
                              const now = new Date();
                              const y = now.getFullYear();
                              const m = String(now.getMonth() + 1).padStart(2, '0');
                              const d = String(now.getDate()).padStart(2, '0');
                              const hh = '00';
                              const mm = '00';
                              setEndDateText(`${y}-${m}-${d} ${hh}:${mm}`);
                            }
                            setActiveDateField('to');
                            setEndMode('specific');
                          }}
                          onCalendarClose={() => setActiveDateField(null)}
                          showTimeSelect
                          timeIntervals={15}
                          dateFormat="yyyy-MM-dd HH:mm"
                          placeholderText={defaultEndSpecificText}
                        />
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => {
                          if (!endDateText) {
                            const now = new Date();
                            const y = now.getFullYear();
                            const m = String(now.getMonth() + 1).padStart(2, '0');
                            const d = String(now.getDate()).padStart(2, '0');
                            const hh = '00';
                            const mm = '00';
                            setEndDateText(`${y}-${m}-${d} ${hh}:${mm}`);
                          }
                          setEndMode('specific');
                          setShowEndPicker(true);
                        }}
                        activeOpacity={0.7}
                        style={[
                          styles.dateValueChip,
                          endMode === 'specific' && styles.dateSpecificWrapperActive,
                        ]}
                      >
                        <Text style={styles.dateValueText}>
                          {endMode === 'now'
                            ? 'Now'
                            : endMode === 'allTime'
                              ? 'All time'
                              : (endDateText || defaultEndSpecificText)}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            </View>
            </>
          )}
        </View>
      </View>

      {/* Feed */}
      <View style={styles.feedContent}>
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>No events</Text>
            <Text style={styles.emptyDesc}>
              {hasFilters ? 'Try adjusting your filters' : 'Create an event to get started'}
            </Text>
          </View>
        ) : viewMode === 'list' ? (
          <ListView
            events={filtered}
            groups={groups}
            groupColors={groupColors}
            onSelect={ev => router.push(`/event/${ev.id}`)}
            onSelectGroup={groupId => router.push(`/group/${groupId}`)}
          />
        ) : (
          <CalendarView
            events={filtered}
            groups={groups}
            groupColors={groupColors}
            onSelectEvent={ev => router.push(`/event/${ev.id}`)}
          />
        )}
      </View>

      {/* Start / End native pickers (native platforms only) */}
      {Platform.OS !== 'web' && showStartPicker && (
        <DateTimePicker
          mode={Platform.OS === 'ios' ? 'datetime' : 'date'}
          value={startMode === 'now'
            ? new Date()
            : (startDateText ? parseDateTime(startDateText) ?? new Date() : new Date())
          }
          onChange={(_, date) => {
            setShowStartPicker(false);
            if (date) {
              const y = date.getFullYear();
              const m = String(date.getMonth() + 1).padStart(2, '0');
              const d = String(date.getDate()).padStart(2, '0');
              const hh = String(date.getHours()).padStart(2, '0');
              const mm = String(date.getMinutes()).padStart(2, '0');
              setStartDateText(`${y}-${m}-${d} ${hh}:${mm}`);
              setStartMode('specific');
            }
          }}
        />
      )}
      {Platform.OS !== 'web' && showEndPicker && (
        <DateTimePicker
          mode={Platform.OS === 'ios' ? 'datetime' : 'date'}
          value={endMode === 'now'
            ? new Date()
            : (endDateText ? parseDateTime(endDateText) ?? new Date() : new Date())
          }
          onChange={(_, date) => {
            setShowEndPicker(false);
            if (date) {
              const y = date.getFullYear();
              const m = String(date.getMonth() + 1).padStart(2, '0');
              const d = String(date.getDate()).padStart(2, '0');
              const hh = String(date.getHours()).padStart(2, '0');
              const mm = String(date.getMinutes()).padStart(2, '0');
              setEndDateText(`${y}-${m}-${d} ${hh}:${mm}`);
              setEndMode('specific');
            }
          }}
        />
      )}

      {/* Notif dropdown - Modal ensures it's always on top */}
      <Modal
        visible={showNotifs}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotifs(false)}
      >
        <View style={styles.notifOverlay}>
          <TouchableOpacity
            style={styles.notifBackdrop}
            onPress={() => setShowNotifs(false)}
            activeOpacity={1}
          />
          <View style={styles.notifPanel}>
            <View style={styles.notifHeader}>
              <Text style={styles.notifTitle}>Notifications</Text>
              {unread > 0 && (
                <TouchableOpacity onPress={() => {
                  markAllAsRead.mutate(currentUserId);
                }}>
                  <Text style={styles.notifMarkAll}>Mark all read</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {notifs.map((n, i) => {
                const group = groups.find(g => g.id === n.groupId);
                const userColorHex = group ? (groupColors[group.id] || getDefaultGroupThemeFromName(group.name)) : '#EC4899';
                const p = getGroupColor(userColorHex);
                return (
                  <TouchableOpacity
                    key={n.id}
                    onPress={() => {
                      // Mark notification as read
                      if (!n.read) {
                        updateNotification.mutate({ id: n.id, read: true });
                      }
                      
                      // Navigate if applicable
                      if (!n.navigable) return;
                      setShowNotifs(false);
                      if (n.dest === 'event' && n.eventId) router.push(`/event/${n.eventId}`);
                      else if (n.dest === 'group' && n.groupId) router.push(`/group/${n.groupId}`);
                    }}
                    style={[styles.notifRow, { backgroundColor: n.read ? 'transparent' : p.row }, i < notifs.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border }]}
                    activeOpacity={n.navigable ? 0.7 : 1}
                  >
                    <View style={[styles.notifIcon, { backgroundColor: n.read ? Colors.bg : p.row, borderColor: n.read ? Colors.border : p.cal }]}>
                      <Text style={{ fontSize: 16 }}>{n.icon}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Text style={{ fontSize: 13, fontFamily: n.read ? Fonts.medium : Fonts.bold, color: Colors.text }} numberOfLines={1}>{n.title}</Text>
                        {!n.read && <View style={styles.unreadDot} />}
                      </View>
                      <Text style={{ fontSize: 12, color: Colors.textSub }} numberOfLines={1}>{n.body}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* No Group Alert */}
      <Modal
        visible={showNoGroupAlert}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNoGroupAlert(false)}
      >
        <View style={styles.alertOverlay}>
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>No Groups</Text>
            <Text style={styles.alertMessage}>You need to join or create a group before creating an event.</Text>
            <TouchableOpacity 
              onPress={() => setShowNoGroupAlert(false)}
              style={styles.alertButton}
            >
              <Text style={styles.alertButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.bg },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  pageTitle:   { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text },
  filtersContainer: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  actions:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewToggle:  { flexDirection: 'row', backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 3, gap: 2 },
  viewBtn:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  viewBtnActive: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  iconBtn:     { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  iconBtnActive:{ backgroundColor: Colors.bg, borderColor: Colors.accent },
  createBtn:   { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, backgroundColor: Colors.accent },
  createBtnText:{ fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  bellDot:     { position: 'absolute', top: 1, right: 1, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.notGoing, borderWidth: 2, borderColor: Colors.surface },
  pillsRow:    { flexGrow: 0, paddingLeft: 20, paddingVertical: 8 },
  feedContent:   { flex: 1, paddingHorizontal: 16, paddingTop: 8, zIndex: 0 },
  filterIconBtn:{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  dateFilterBetween: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    minWidth: 220,
  },
  dateFilterColumn: {
    marginTop: 4,
    gap: 6,
  },
  dateFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateFilterLabel: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
  },
  dateFilterInput: {
    minWidth: 120,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.text,
  },
  dateFilterSeparator: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  dateFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  dateFilterButtonActive: {
    borderColor: Colors.accent,
  },
  dateFilterButtonText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.textSub,
  },
  dateFilterButtonTextActive: {
    color: Colors.text,
  },
  dateOverlay: {
    flex: 1,
  },
  dateTooltip: {
    position: 'absolute',
    borderRadius: Radius['2xl'],
    backgroundColor: Colors.surface,
    padding: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    zIndex: 200,
    elevation: 200,
  },
  dateClickAwayHitbox: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    backgroundColor: 'transparent',
  },
  dateFilterFieldLabel: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
    minWidth: 40, // align "From" / "To" columns
  },
  dateValueChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  dateValueText: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Colors.accent,
  },
  webPickerWrapper: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  webPickerActive: {
    borderColor: Colors.accent,
  },
  dateFieldWithNow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateQuickButton: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dateQuickButtonText: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Colors.accent,
  },
  dateQuickButtonActive: {
    backgroundColor: Colors.bg,
    borderColor: Colors.accent,
  },
  dateSpecificWrapperActive: {
    borderColor: Colors.accent,
  },
  pastToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    paddingBottom: 6,
    marginTop: 4,
  },
  pastDividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  pastBadge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  pastBadgeActive: {
    borderColor: Colors.textSub,
    backgroundColor: Colors.bg,
  },
  pastBadgeText: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  pastBadgeTextActive: {
    color: Colors.textSub,
  },
  rsvpFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  rsvpFilterButtonText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.textSub,
  },
  rsvpFilterChevron: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  filterExpandedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.bg,
  },
  filterExpandedHeader: {
    width: '100%',
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  rsvpDropdownItem: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
    borderWidth: 1,
    marginRight: 6,
    marginBottom: 6,
  },
  rsvpDropdownLabel: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Colors.text,
  },
  rsvpPillGoing: {
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  rsvpPillGoingActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.bg,
  },
  rsvpPillMaybe: {
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  rsvpPillMaybeActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.bg,
  },
  rsvpPillNotGoing: {
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  rsvpPillNotGoingActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.bg,
  },
  rsvpPillNone: {
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  rsvpPillNoneActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.bg,
  },
  filterPanel: { paddingBottom: 6 },
  filterSectionLabel:{ fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textMuted, letterSpacing: 0.6, marginBottom: 8 },
  notifOverlay:  { flex: 1, opacity: 1 },
  notifBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.2)', opacity: 1 },
  notifPanel:    { position: 'absolute', top: 110, right: 16, width: 300, backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', opacity: 1, elevation: 999, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 },
  notifHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  notifTitle:  { fontSize: 15, fontFamily: Fonts.bold, color: Colors.text },
  notifMarkAll:{ fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSub },
  notifRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 },
  notifIcon:   { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  unreadDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.notGoing },
  emptyState:  { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyIcon:   { fontSize: 64, marginBottom: 16 },
  emptyTitle:  { fontSize: 20, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 8 },
  emptyDesc:   { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textMuted, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  emptyBtn:    { paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  emptyBtnText:{ fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  alertOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  alertBox: { backgroundColor: Colors.surface, borderRadius: Radius['2xl'], padding: 24, width: '100%', maxWidth: 320, alignItems: 'center' },
  alertTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 12 },
  alertMessage: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSub, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  alertButton: { paddingHorizontal: 32, paddingVertical: 10, borderRadius: Radius.lg, backgroundColor: Colors.accent, width: '100%' },
  alertButtonText: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.accentFg, textAlign: 'center' },
});
