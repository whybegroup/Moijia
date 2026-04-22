import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  type ChangeEvent,
} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { Colors, Fonts, Radius } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, formatLocalDateInput } from '../utils/helpers';
import {
  localWallDateTimeToDate,
  localWallDateTimeToUtcIso,
  localWallDateStartOfDayToUtcIso,
  localWallDateEndOfDayToUtcIso,
  isValidEventFormTimeRange,
} from '../utils/datetimeUtc';
import { NavBar, Field, Toggle, formSectionTitleStyle } from '../components/ui';
import { EventFormPopoverChrome } from '../components/EventFormPopoverChrome';
import { RecurrenceField } from '../components/RecurrenceField';
import { buildRecurrenceRule, defaultRecurrenceFormState, type RecurrenceFormState } from '../utils/recurrence';
import { useGroups, useCreateEvent, useAllGroupMemberColors } from '../hooks/api';
import { uid } from '../utils/api-helpers';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { ResolvableImage } from '../components/ResolvableImage';
import {
  pickDeferredCoverPhotoNative,
  createWebDeferredCoverPhoto,
  uploadCoverPhotoDrafts,
  revokeCoverPhotoDraftPreview,
  coverPhotoDraftDisplayUri,
  type CoverPhotoDraft,
} from '../services/pickAndUploadImage';
import { firstSearchParam, parseReturnToParam, withReturnTo } from '../utils/navigationReturn';

/** Stable snapshot for “dirty?” after URL + default-group hydration. */
function serializeCreateFormBaseline(
  f: {
    title: string;
    description: string;
    groupId: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    allDay: boolean;
    location: string;
    minAttendees: string;
    maxAttendees: string;
    allowMaybe: boolean;
    enableWaitlist: boolean;
    coverPhotoDrafts: CoverPhotoDraft[];
    activityIdeasEnabled: boolean;
    activityVotesAnonymous: boolean;
    recurrence: RecurrenceFormState;
  },
  activityOptionDrafts: { id: string; label: string }[],
  newActivityLabel: string
): string {
  const coverKey = f.coverPhotoDrafts
    .map((d) => (d.kind === 'remote' ? `r:${d.url}` : `p:${d.previewUri}`))
    .join('\n');
  return JSON.stringify({
    title: f.title,
    description: f.description,
    groupId: f.groupId,
    startDate: f.startDate,
    startTime: f.startTime,
    endDate: f.endDate,
    endTime: f.endTime,
    allDay: f.allDay,
    location: f.location,
    minAttendees: f.minAttendees,
    maxAttendees: f.maxAttendees,
    allowMaybe: f.allowMaybe,
    enableWaitlist: f.enableWaitlist,
    coverKey,
    activityIdeasEnabled: f.activityIdeasEnabled,
    activityVotesAnonymous: f.activityVotesAnonymous,
    recurrence: f.recurrence,
    activityOptionDrafts,
    newActivityLabel,
  });
}

function webEventTimeInputStyle(errored: boolean): Record<string, string | number> {
  return {
    padding: '6px 10px',
    borderRadius: 8,
    border: errored ? '1.5px solid #EF4444' : '1.5px solid #E5E5E5',
    backgroundColor: '#FAFAFA',
    fontSize: 13,
    color: '#1A1A1A',
    fontFamily: 'DMSans_400Regular',
    boxSizing: 'border-box',
    outline: 'none',
    minWidth: 0,
    width: '100%',
  };
}

export default function CreateEventScreen() {
  const router = useRouter();
  const calendarParams = useLocalSearchParams<{
    start?: string;
    end?: string;
    returnTo?: string | string[];
  }>();
  const createReturnTo = useMemo(
    () => parseReturnToParam(firstSearchParam(calendarParams.returnTo)),
    [calendarParams.returnTo]
  );
  const { userId: currentUserId } = useCurrentUserContext();
  const today = formatLocalDateInput(new Date());
  const { data: groups = [], isFetched: groupsIsFetched } = useGroups(currentUserId ?? '');
  const { data: groupColors = {} } = useAllGroupMemberColors(currentUserId || '');
  const createEventMutation = useCreateEvent(currentUserId ?? '');

  const [form, setForm] = useState({
    title: '', description: '', groupId: '',
    startDate: today, startTime: '19:00', endDate: today, endTime: '21:00', allDay: false,
    location: '', minAttendees: '1', maxAttendees: '',
    allowMaybe: false, enableWaitlist: false, coverPhotoDrafts: [] as CoverPhotoDraft[],
    activityIdeasEnabled: false,
    activityVotesAnonymous: false,
    recurrence: defaultRecurrenceFormState() as RecurrenceFormState,
  });
  const [errors, setErrors] = useState({
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
  });
  const [coverPhotoBusy, setCoverPhotoBusy] = useState(false);

  const eventEligibleGroups = groups.filter(
    (g) => g.membershipStatus === 'member' || g.membershipStatus === 'admin',
  );

  const [activityOptionDrafts, setActivityOptionDrafts] = useState<{ id: string; label: string }[]>([]);
  const [newActivityLabel, setNewActivityLabel] = useState('');
  const [createFormBaselineSerialized, setCreateFormBaselineSerialized] = useState<string | null>(null);

  useEffect(() => {
    if (eventEligibleGroups.length > 0 && !form.groupId) {
      setForm((p) => ({ ...p, groupId: eventEligibleGroups[0].id }));
    }
  }, [eventEligibleGroups, form.groupId]);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const coverPhotoFileInputRef = useRef<{ click: () => void } | null>(null);

  const addCoverPhotoFromPicker = async () => {
    if (!currentUserId) return;
    if (Platform.OS === 'web') {
      coverPhotoFileInputRef.current?.click();
      return;
    }
    if (coverPhotoBusy) return;
    setCoverPhotoBusy(true);
    try {
      const picked = await pickDeferredCoverPhotoNative();
      if (picked) {
        setForm((p) => ({
          ...p,
          coverPhotoDrafts: [
            ...p.coverPhotoDrafts,
            { kind: 'pending', previewUri: picked.previewUri, pending: picked.pending },
          ],
        }));
      }
    } finally {
      setCoverPhotoBusy(false);
    }
  };

  const onCoverPhotoWebFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentUserId) return;
    if (!file.type.startsWith('image/')) {
      Alert.alert('Upload', 'Please choose an image file.');
      return;
    }
    const { previewUri, pending } = createWebDeferredCoverPhoto(file);
    setForm((p) => ({
      ...p,
      coverPhotoDrafts: [...p.coverPhotoDrafts, { kind: 'pending', previewUri, pending }],
    }));
  };

  const removeCoverPhotoAt = (index: number) => {
    setForm((p) => {
      const d = p.coverPhotoDrafts[index];
      if (d) revokeCoverPhotoDraftPreview(d);
      return { ...p, coverPhotoDrafts: p.coverPhotoDrafts.filter((_, j) => j !== index) };
    });
  };

  const timeRangeValid = useMemo(
    () =>
      isValidEventFormTimeRange({
        allDay: form.allDay,
        startDate: form.startDate,
        endDate: form.endDate,
        startTime: form.startTime,
        endTime: form.endTime,
      }),
    [form.allDay, form.startDate, form.endDate, form.startTime, form.endTime]
  );

  const ok =
    !!form.title.trim() &&
    !!form.startDate &&
    !!form.endDate &&
    !!form.groupId &&
    timeRangeValid &&
    !errors.startDate &&
    !errors.startTime &&
    !errors.endDate &&
    !errors.endTime;

  const createFormDirty = useMemo(() => {
    if (createFormBaselineSerialized == null) return false;
    return (
      serializeCreateFormBaseline(form, activityOptionDrafts, newActivityLabel) !==
      createFormBaselineSerialized
    );
  }, [createFormBaselineSerialized, form, activityOptionDrafts, newActivityLabel]);

  const timeFieldsComplete =
    !!form.startDate?.trim() &&
    !!form.endDate?.trim() &&
    (form.allDay || (!!form.startTime?.trim() && !!form.endTime?.trim()));
  const showInvalidRangeHint =
    timeFieldsComplete && !timeRangeValid && !errors.endDate && !errors.endTime;

  const recurrenceAnchor = useMemo(
    () => localWallDateTimeToDate(form.startDate, form.startTime),
    [form.startDate, form.startTime]
  );

  const submit = async () => {
    if (!ok) return;
    try {
      const startIso = form.allDay
        ? localWallDateStartOfDayToUtcIso(form.startDate)
        : localWallDateTimeToUtcIso(form.startDate, form.startTime);
      const endIso = form.allDay
        ? localWallDateEndOfDayToUtcIso(form.endDate)
        : localWallDateTimeToUtcIso(form.endDate, form.endTime);
      const start = new Date(startIso);
      const end = new Date(endIso);

      const isAllDay = form.allDay && form.startDate === form.endDate;

      let coverPhotos: string[] = [];
      if (form.coverPhotoDrafts.length > 0) {
        if (!currentUserId) {
          Alert.alert('Error', 'You must be signed in to upload photos.');
          return;
        }
        try {
          coverPhotos = await uploadCoverPhotoDrafts(currentUserId, form.coverPhotoDrafts);
        } catch {
          Alert.alert('Error', 'Failed to upload photos. Try again.');
          return;
        }
      }
      
      const recurrenceRule = buildRecurrenceRule(form.recurrence, start);

      const newEvent = {
        id: uid(),
        groupId: form.groupId,
        createdBy: currentUserId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        coverPhotos,
        start: startIso,
        end: endIso,
        isAllDay: isAllDay || undefined,
        location: form.location.trim() || undefined,
        minAttendees: form.minAttendees.trim() ? parseInt(form.minAttendees, 10) : undefined,
        maxAttendees: form.maxAttendees.trim() ? parseInt(form.maxAttendees, 10) : undefined,
        enableWaitlist: form.maxAttendees.trim() ? form.enableWaitlist : undefined,
        allowMaybe: form.allowMaybe,
        activityIdeasEnabled: form.activityIdeasEnabled,
        ...(form.activityIdeasEnabled
          ? {
              activityVotesAnonymous: form.activityVotesAnonymous,
              activityOptionLabels: activityOptionDrafts
                .map((o) => o.label.trim())
                .filter((s) => s.length > 0),
            }
          : {}),
        ...(recurrenceRule
          ? { recurrenceRule, viewerTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
          : {}),
      };
      
      await createEventMutation.mutateAsync(newEvent);
      router.replace(withReturnTo(`/event/${newEvent.id}`, createReturnTo));
    } catch {
      Alert.alert('Error', 'Failed to create event');
    }
  };

  const addActivityDraft = () => {
    const label = newActivityLabel.trim();
    if (!label) return;
    setActivityOptionDrafts((prev) => [...prev, { id: uid(), label }]);
    setNewActivityLabel('');
  };

  const removeActivityDraft = (id: string) => {
    setActivityOptionDrafts((prev) => prev.filter((o) => o.id !== id));
  };

  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const getTimeDate = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours || 0);
    date.setMinutes(minutes || 0);
    return date;
  };

  const getMinimumStartTime = () => {
    const selectedDate = new Date(form.startDate);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    if (selectedDate.getTime() === todayDate.getTime()) {
      return new Date();
    }
    return undefined;
  };

  const getMinimumEndTime = () => {
    if (form.startDate !== form.endDate) return undefined;
    if (!form.startTime) return undefined;
    const [h, m] = form.startTime.split(':').map(Number);
    const minTime = new Date();
    minTime.setHours(h, m + 1, 0, 0);
    return minTime;
  };

  const validateStartDate = (dateStr: string) => {
    if (!dateStr) {
      setErrors(e => ({ ...e, startDate: '' }));
      return;
    }
    const selectedDate = new Date(dateStr);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    if (selectedDate < todayDate) {
      setErrors(e => ({ ...e, startDate: 'Date cannot be in the past' }));
    } else {
      setErrors(e => ({ ...e, startDate: '' }));
    }
  };

  const validateEndDate = (endDateStr: string, startDateStr: string) => {
    if (!endDateStr || !startDateStr) {
      setErrors(e => ({ ...e, endDate: '' }));
      return;
    }
    const endDate = new Date(endDateStr);
    const startDate = new Date(startDateStr);
    
    if (endDate < startDate) {
      setErrors(e => ({ ...e, endDate: 'End date cannot be before start date' }));
    } else {
      setErrors(e => ({ ...e, endDate: '' }));
    }
  };

  const validateStartTime = (timeStr: string, dateStr: string, allDay: boolean) => {
    if (allDay) {
      setErrors((e) => ({ ...e, startTime: '' }));
      return;
    }
    if (!timeStr || !dateStr) {
      setErrors(e => ({ ...e, startTime: '' }));
      return;
    }
    
    const selectedDate = new Date(dateStr);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    if (selectedDate.getTime() === todayDate.getTime()) {
      const [h, m] = timeStr.split(':').map(Number);
      const now = new Date();
      const selectedTime = new Date();
      selectedTime.setHours(h, m, 0, 0);
      
      if (selectedTime <= now) {
        setErrors(e => ({ ...e, startTime: 'Start time must be in the future' }));
        return;
      }
    }
    
    setErrors(e => ({ ...e, startTime: '' }));
  };

  const validateEndTime = (
    endTimeStr: string,
    startTimeStr: string,
    endDateStr: string,
    startDateStr: string,
    allDay: boolean,
  ) => {
    if (allDay) {
      setErrors((e) => ({ ...e, endTime: '' }));
      return;
    }
    if (!endTimeStr?.trim() || !startTimeStr?.trim() || !endDateStr?.trim() || !startDateStr?.trim()) {
      setErrors((e) => ({ ...e, endTime: '' }));
      return;
    }
    try {
      const startIso = localWallDateTimeToUtcIso(startDateStr.trim(), startTimeStr.trim());
      const endIso = localWallDateTimeToUtcIso(endDateStr.trim(), endTimeStr.trim());
      if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
        setErrors((e) => ({ ...e, endTime: 'End must be after start' }));
      } else {
        setErrors((e) => ({ ...e, endTime: '' }));
      }
    } catch {
      setErrors((e) => ({ ...e, endTime: 'Invalid time' }));
    }
  };

  const handleStartDateChange = (_event: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartDatePicker(false);
    }
    if (selectedDate) {
      const dateStr = formatLocalDateInput(selectedDate);
      set('startDate', dateStr);
      validateStartDate(dateStr);
      validateStartTime(form.startTime, dateStr, form.allDay);
      validateEndDate(form.endDate, dateStr);
      validateEndTime(form.endTime, form.startTime, form.endDate, dateStr, form.allDay);
    }
  };

  const handleEndDateChange = (_event: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndDatePicker(false);
    }
    if (selectedDate) {
      const dateStr = formatLocalDateInput(selectedDate);
      set('endDate', dateStr);
      validateEndDate(dateStr, form.startDate);
      validateEndTime(form.endTime, form.startTime, dateStr, form.startDate, form.allDay);
    }
  };

  const handleStartDateInputChange = (dateStr: string) => {
    set('startDate', dateStr);
    validateStartDate(dateStr);
    validateStartTime(form.startTime, dateStr, form.allDay);
    validateEndDate(form.endDate, dateStr);
    validateEndTime(form.endTime, form.startTime, form.endDate, dateStr, form.allDay);
  };

  const handleEndDateInputChange = (dateStr: string) => {
    set('endDate', dateStr);
    validateEndDate(dateStr, form.startDate);
    validateEndTime(form.endTime, form.startTime, dateStr, form.startDate, form.allDay);
  };

  const handleStartTimeChange = (_event: unknown, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartTimePicker(false);
    }
    if (selectedTime) {
      const hours = String(selectedTime.getHours()).padStart(2, '0');
      const minutes = String(selectedTime.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;
      set('startTime', timeStr);
      validateStartTime(timeStr, form.startDate, form.allDay);
      validateEndTime(form.endTime, timeStr, form.endDate, form.startDate, form.allDay);
    }
  };

  const handleStartTimeInputChange = (timeStr: string) => {
    set('startTime', timeStr);
    validateStartTime(timeStr, form.startDate, form.allDay);
    validateEndTime(form.endTime, timeStr, form.endDate, form.startDate, form.allDay);
  };

  const handleEndTimeChange = (_event: unknown, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndTimePicker(false);
    }
    if (selectedTime) {
      const hours = String(selectedTime.getHours()).padStart(2, '0');
      const minutes = String(selectedTime.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;
      set('endTime', timeStr);
      validateEndTime(timeStr, form.startTime, form.endDate, form.startDate, form.allDay);
    }
  };

  const handleEndTimeInputChange = (timeStr: string) => {
    set('endTime', timeStr);
    validateEndTime(timeStr, form.startTime, form.endDate, form.startDate, form.allDay);
  };

  const toggleAllDay = () => {
    const next = !form.allDay;
    set('allDay', next);
    if (next) {
      setErrors((e) => ({ ...e, startTime: '', endTime: '' }));
    } else {
      validateStartTime(form.startTime, form.startDate, false);
      validateEndTime(form.endTime, form.startTime, form.endDate, form.startDate, false);
    }
  };

  const calendarPresetAppliedRef = useRef(false);
  useEffect(() => {
    if (calendarPresetAppliedRef.current) return;
    const rawS = calendarParams.start;
    const rawE = calendarParams.end;
    const sStr = typeof rawS === 'string' ? rawS : Array.isArray(rawS) ? rawS[0] : undefined;
    const eStr = typeof rawE === 'string' ? rawE : Array.isArray(rawE) ? rawE[0] : undefined;
    if (!sStr || !eStr) {
      calendarPresetAppliedRef.current = true;
      return;
    }
    const start = new Date(sStr);
    const end = new Date(eStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
      calendarPresetAppliedRef.current = true;
      return;
    }
    calendarPresetAppliedRef.current = true;
    const pad = (n: number) => String(n).padStart(2, '0');
    const startDate = formatLocalDateInput(start);
    const endDate = formatLocalDateInput(end);
    const startTime = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
    const endTime = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
    setForm((prev) => ({
      ...prev,
      startDate,
      startTime,
      endDate,
      endTime,
      allDay: false,
    }));
    setErrors((e) => ({
      ...e,
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
    }));
  }, [calendarParams.start, calendarParams.end]);

  const calStartStr = firstSearchParam(calendarParams.start);
  const calEndStr = firstSearchParam(calendarParams.end);
  const hasCalendarTimePreset = !!(calStartStr && calEndStr);
  const calendarPresetHydrated = !hasCalendarTimePreset || calendarPresetAppliedRef.current;
  const groupsDataReady = !currentUserId || groupsIsFetched;
  const groupSelectHydrated =
    !groupsDataReady ? false : eventEligibleGroups.length === 0 ? true : !!form.groupId;

  useLayoutEffect(() => {
    if (createFormBaselineSerialized != null) return;
    if (!calendarPresetHydrated || !groupSelectHydrated) return;
    setCreateFormBaselineSerialized(
      serializeCreateFormBaseline(form, activityOptionDrafts, newActivityLabel)
    );
  }, [
    createFormBaselineSerialized,
    calendarPresetHydrated,
    groupSelectHydrated,
    form,
    activityOptionDrafts,
    newActivityLabel,
  ]);

  const dismiss = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (createReturnTo) {
      router.replace(createReturnTo as Href);
      return;
    }
    router.replace('/(tabs)/events');
  }, [router, createReturnTo]);

  const requestClose = useCallback(() => {
    if (!createFormDirty) {
      dismiss();
      return;
    }
    const message = 'Discard your changes?';
    if (Platform.OS === 'web') {
      if (window.confirm(message)) dismiss();
      return;
    }
    Alert.alert('Discard changes?', message, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: dismiss },
    ]);
  }, [createFormDirty, dismiss]);

  return (
    <EventFormPopoverChrome onClose={requestClose}>
      <View style={styles.inner}>
      <NavBar title="New Event" onClose={requestClose}
        right={
          <TouchableOpacity
            onPress={submit}
            disabled={!ok || createEventMutation.isPending}
            style={[styles.headerBtn, (!ok || createEventMutation.isPending) && styles.headerBtnDis]}
          >
            {createEventMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.accentFg} />
            ) : (
              <Text style={[styles.headerBtnText, !ok && { color: Colors.textMuted }]} numberOfLines={1}>
                Create
              </Text>
            )}
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 100, width: '100%', alignSelf: 'stretch' }}
        showsVerticalScrollIndicator={false}
      >

        <Field label="Group" required>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {eventEligibleGroups.map((g) => {
              const userColorHex = groupColors[g.id] || getDefaultGroupThemeFromName(g.name);
              const p = getGroupColor(userColorHex);
              const sel = form.groupId === g.id;
              return (
                <TouchableOpacity key={g.id} onPress={() => set('groupId', g.id)}
                  style={[styles.groupChip, sel && { borderColor: p.dot, backgroundColor: p.row }]}>
                  <Text style={[styles.chipText, sel && { color: p.text, fontFamily: Fonts.semiBold }]}>{g.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Field>

        <Field label="Event Title" required>
          <TextInput value={form.title} onChangeText={v => set('title', v)} placeholder="e.g. Game Night" placeholderTextColor={Colors.textMuted} style={styles.input} />
        </Field>

        <Field label="Event description">
          <View style={styles.descBox}>
            <TextInput
              value={form.description}
              onChangeText={(v) => set('description', v)}
              placeholder="Add notes, directions, agenda, or a helpful link"
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={5}
              maxLength={500}
              style={styles.descInput}
            />
            <View style={styles.descToolbar}>
              <Text style={{ fontSize: 11, color: Colors.textMuted }}>{form.description.length}/500</Text>
            </View>
          </View>
        </Field>

        <View style={styles.dateTimeSection}>
          <View style={styles.sectionHeader}>
            <Text style={[formSectionTitleStyle, styles.dateTimeHeading]}>Event time</Text>
            <TouchableOpacity onPress={toggleAllDay} style={styles.allDayChip} activeOpacity={0.7}>
              <Text style={[styles.allDayChipText, form.allDay && styles.allDayChipTextActive]}>All-day</Text>
              <View style={[styles.allDayCheckbox, form.allDay && styles.allDayCheckboxActive]}>
                {form.allDay && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.eventTimeStack}>
            <View style={styles.eventTimeLine}>
              <Text style={styles.eventTimeLineLabel}>From</Text>
              <View style={styles.eventTimeRow}>
                {Platform.OS === 'web' ? (
                  <View style={[styles.eventTimeCell, styles.eventTimeFieldDate]}>
                    <input
                      type="date"
                      value={form.startDate}
                      min={today}
                      onChange={(e: any) => handleStartDateInputChange(e.target.value)}
                      style={webEventTimeInputStyle(!!errors.startDate)}
                    />
                  </View>
                ) : (
                  <View style={[styles.eventTimeCell, styles.eventTimeFieldDate]}>
                    <TouchableOpacity
                      onPress={() => setShowStartDatePicker(true)}
                      activeOpacity={0.85}
                      style={[styles.eventTimeSegment, errors.startDate && styles.inputError]}
                    >
                      <Text style={styles.eventTimeSegmentText} numberOfLines={1}>
                        {form.startDate}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                {!form.allDay &&
                  (Platform.OS === 'web' ? (
                    <View style={[styles.eventTimeCell, styles.eventTimeFieldTime]}>
                      <input
                        type="time"
                        value={form.startTime}
                        onChange={(e: any) => handleStartTimeInputChange(e.target.value)}
                        style={webEventTimeInputStyle(!!errors.startTime)}
                      />
                    </View>
                  ) : (
                    <View style={[styles.eventTimeCell, styles.eventTimeFieldTime]}>
                      <TouchableOpacity
                        onPress={() => setShowStartTimePicker(true)}
                        activeOpacity={0.85}
                        style={[styles.eventTimeSegment, errors.startTime && styles.inputError]}
                      >
                        <Text style={styles.eventTimeSegmentText} numberOfLines={1}>
                          {form.startTime}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
              </View>
            </View>
            <View style={styles.eventTimeLine}>
              <Text style={styles.eventTimeLineLabel}>To</Text>
              <View style={styles.eventTimeRow}>
                {Platform.OS === 'web' ? (
                  <View style={[styles.eventTimeCell, styles.eventTimeFieldDate]}>
                    <input
                      type="date"
                      value={form.endDate}
                      min={form.startDate}
                      onChange={(e: any) => handleEndDateInputChange(e.target.value)}
                      style={webEventTimeInputStyle(!!errors.endDate)}
                    />
                  </View>
                ) : (
                  <View style={[styles.eventTimeCell, styles.eventTimeFieldDate]}>
                    <TouchableOpacity
                      onPress={() => setShowEndDatePicker(true)}
                      activeOpacity={0.85}
                      style={[styles.eventTimeSegment, errors.endDate && styles.inputError]}
                    >
                      <Text style={styles.eventTimeSegmentText} numberOfLines={1}>
                        {form.endDate}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                {!form.allDay &&
                  (Platform.OS === 'web' ? (
                    <View style={[styles.eventTimeCell, styles.eventTimeFieldTime]}>
                      <input
                        type="time"
                        value={form.endTime}
                        onChange={(e: any) => handleEndTimeInputChange(e.target.value)}
                        style={webEventTimeInputStyle(!!errors.endTime)}
                      />
                    </View>
                  ) : (
                    <View style={[styles.eventTimeCell, styles.eventTimeFieldTime]}>
                      <TouchableOpacity
                        onPress={() => setShowEndTimePicker(true)}
                        activeOpacity={0.85}
                        style={[styles.eventTimeSegment, errors.endTime && styles.inputError]}
                      >
                        <Text style={styles.eventTimeSegmentText} numberOfLines={1}>
                          {form.endTime}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
              </View>
            </View>
          </View>
          {[errors.startDate, errors.startTime, errors.endDate, errors.endTime].some(Boolean) ||
          showInvalidRangeHint ? (
            <View style={{ marginTop: 6 }}>
              {errors.startDate ? <Text style={styles.errorText}>{errors.startDate}</Text> : null}
              {errors.startTime ? <Text style={styles.errorText}>{errors.startTime}</Text> : null}
              {errors.endDate ? <Text style={styles.errorText}>{errors.endDate}</Text> : null}
              {errors.endTime ? <Text style={styles.errorText}>{errors.endTime}</Text> : null}
              {showInvalidRangeHint ? (
                <Text style={styles.errorText}>End must be after start</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {Platform.OS !== 'web' && showStartDatePicker && (
          <DateTimePicker
            value={form.startDate ? new Date(form.startDate) : new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleStartDateChange}
            minimumDate={new Date()}
          />
        )}
        {Platform.OS === 'ios' && showStartDatePicker && (
          <View style={styles.datePickerActions}>
            <TouchableOpacity onPress={() => setShowStartDatePicker(false)} style={styles.datePickerBtn}>
              <Text style={styles.datePickerBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {Platform.OS !== 'web' && showEndDatePicker && (
          <DateTimePicker
            value={form.endDate ? new Date(form.endDate) : new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleEndDateChange}
            minimumDate={form.startDate ? new Date(form.startDate) : new Date()}
          />
        )}
        {Platform.OS === 'ios' && showEndDatePicker && (
          <View style={styles.datePickerActions}>
            <TouchableOpacity onPress={() => setShowEndDatePicker(false)} style={styles.datePickerBtn}>
              <Text style={styles.datePickerBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {Platform.OS !== 'web' && showStartTimePicker && (
          <DateTimePicker
            value={getTimeDate(form.startTime)}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleStartTimeChange}
            minimumDate={getMinimumStartTime()}
          />
        )}
        {Platform.OS === 'ios' && showStartTimePicker && (
          <View style={styles.datePickerActions}>
            <TouchableOpacity onPress={() => setShowStartTimePicker(false)} style={styles.datePickerBtn}>
              <Text style={styles.datePickerBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {Platform.OS !== 'web' && showEndTimePicker && (
          <DateTimePicker
            value={getTimeDate(form.endTime)}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleEndTimeChange}
            minimumDate={getMinimumEndTime()}
          />
        )}
        {Platform.OS === 'ios' && showEndTimePicker && (
          <View style={styles.datePickerActions}>
            <TouchableOpacity onPress={() => setShowEndTimePicker(false)} style={styles.datePickerBtn}>
              <Text style={styles.datePickerBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        <RecurrenceField
          anchorDate={recurrenceAnchor}
          value={form.recurrence}
          onChange={(recurrence) => setForm((p) => ({ ...p, recurrence }))}
        />

        <Field label="Location">
          <TextInput value={form.location} onChangeText={v => set('location', v)} placeholder="e.g. Central Park" placeholderTextColor={Colors.textMuted} style={styles.input} />
        </Field>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="Min Attendees">
              <TextInput 
                value={form.minAttendees} 
                onChangeText={v => set('minAttendees', v)} 
                placeholder="1" 
                placeholderTextColor={Colors.textMuted} 
                keyboardType="number-pad" 
                style={styles.input} 
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Max Attendees">
              <TextInput 
                value={form.maxAttendees} 
                onChangeText={v => set('maxAttendees', v)} 
                placeholder="None" 
                placeholderTextColor={Colors.textMuted} 
                keyboardType="number-pad" 
                style={styles.input} 
              />
            </Field>
          </View>
        </View>

        <View style={styles.photosSection}>
          {Platform.OS === 'web' && (
            <input
              ref={(el) => {
                coverPhotoFileInputRef.current = el;
              }}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={onCoverPhotoWebFileChange}
            />
          )}
          <Text style={formSectionTitleStyle}>
            Photos{form.coverPhotoDrafts.length > 0 ? ` · ${form.coverPhotoDrafts.length}` : ''}
          </Text>
          <View style={styles.photosCard}>
            {form.coverPhotoDrafts.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ borderBottomWidth: 1, borderBottomColor: Colors.border }}
                contentContainerStyle={{ gap: 4, padding: 10 }}>
                {form.coverPhotoDrafts.map((d, i) => (
                  <View key={`${i}-${coverPhotoDraftDisplayUri(d)}`} style={{ position: 'relative' }}>
                    <ResolvableImage
                      storedUrl={coverPhotoDraftDisplayUri(d)}
                      style={{ width: 80, height: 80, borderRadius: Radius.lg }}
                      resizeMode="cover"
                    />
                    <TouchableOpacity onPress={() => removeCoverPhotoAt(i)}
                      style={styles.removeThumb}>
                      <Ionicons name="close" size={11} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={[styles.photosToolbar, form.coverPhotoDrafts.length === 0 && { borderTopWidth: 0 }]}>
              <TouchableOpacity
                onPress={() => void addCoverPhotoFromPicker()}
                style={styles.photoBtn}
                disabled={coverPhotoBusy || !currentUserId}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  {coverPhotoBusy ? (
                    <ActivityIndicator size="small" color={Colors.textSub} />
                  ) : (
                    <Ionicons name="camera-outline" size={16} color={Colors.textSub} />
                  )}
                  <Text style={{ fontSize: 12, color: Colors.textSub, fontFamily: Fonts.medium }}>Add photo</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <Field label="Settings">
          <View style={styles.settingsCard}>
            <Toggle value={form.allowMaybe} onChange={v => set('allowMaybe', v)} label="Allow 'Maybe' responses" />
            {form.maxAttendees.trim() ? (
              <Toggle value={form.enableWaitlist} onChange={v => set('enableWaitlist', v)} label="Enable waitlist" />
            ) : null}
            <Toggle
              value={form.activityIdeasEnabled}
              onChange={(v) => set('activityIdeasEnabled', v)}
              label="Enable activity ideas"
              style={form.activityIdeasEnabled ? { borderBottomWidth: 0 } : undefined}
            />
            {form.activityIdeasEnabled ? (
              <View style={{ paddingHorizontal: 0, paddingBottom: 14, paddingTop: 4 }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: Colors.textMuted,
                    marginBottom: 10,
                    fontFamily: Fonts.regular,
                    paddingHorizontal: 0,
                  }}
                >
                  Add options now — same as when editing an event. Members can vote after the event is created.
                </Text>
                {activityOptionDrafts.map((opt) => (
                  <View
                    key={opt.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: Radius.md,
                      borderWidth: 1,
                      borderColor: Colors.border,
                      backgroundColor: Colors.bg,
                      marginBottom: 8,
                      gap: 8,
                    }}
                  >
                    <Text
                      style={{ flex: 1, fontSize: 15, fontFamily: Fonts.medium, color: Colors.text }}
                      numberOfLines={3}
                    >
                      {opt.label}
                    </Text>
                    <TouchableOpacity
                      onPress={() => removeActivityDraft(opt.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center' }}>
                  <TextInput
                    value={newActivityLabel}
                    onChangeText={setNewActivityLabel}
                    placeholder="Add an activity idea"
                    placeholderTextColor={Colors.textMuted}
                    style={[styles.activityComposerInput, { flex: 1 }]}
                    onSubmitEditing={addActivityDraft}
                  />
                  <TouchableOpacity
                    onPress={addActivityDraft}
                    style={[styles.activityAddBtn, !newActivityLabel.trim() && styles.activityAddBtnDisabled]}
                    disabled={!newActivityLabel.trim()}
                  >
                    <Text style={styles.activityAddBtnText}>Add</Text>
                  </TouchableOpacity>
                </View>
                <Toggle
                  value={form.activityVotesAnonymous}
                  onChange={(v) => set('activityVotesAnonymous', v)}
                  label="Anonymous votes (hide who voted)"
                  style={{ paddingHorizontal: 0, paddingTop: 12, borderBottomWidth: 0 }}
                />
              </View>
            ) : null}
          </View>
        </Field>

        <TouchableOpacity
          onPress={submit}
          style={[styles.submitBtn, (!ok || createEventMutation.isPending) && { backgroundColor: Colors.border }]}
          disabled={!ok || createEventMutation.isPending}
        >
          {createEventMutation.isPending ? (
            <ActivityIndicator color={Colors.accentFg} />
          ) : (
            <Text style={[styles.submitBtnText, !ok && { color: Colors.textMuted }]} numberOfLines={1}>
              Create event
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
      </View>
    </EventFormPopoverChrome>
  );
}

const styles = StyleSheet.create({
  inner:         { flex: 1, backgroundColor: Colors.bg },
  headerBtn:     { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.lg, backgroundColor: Colors.accent, flexShrink: 0 },
  headerBtnDis:  { backgroundColor: Colors.border },
  headerBtnText: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  groupChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipText:      { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.regular },
  input:         { padding: 10, paddingHorizontal: 14, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bg, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
  inputError:    { borderColor: '#EF4444' },
  errorText:     { fontSize: 12, color: '#EF4444', fontFamily: Fonts.regular, marginBottom: 4 },
  datePickerActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 8 },
  datePickerBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  datePickerBtnText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  settingsCard:  { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16 },
  activityComposerInput: {
    padding: 9,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    fontSize: 14,
    color: Colors.text,
    fontFamily: Fonts.regular,
  },
  activityAddBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
  },
  activityAddBtnDisabled: { backgroundColor: Colors.border },
  activityAddBtnText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  descBox:       { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.border, overflow: 'hidden' },
  descInput:     { padding: 12, paddingHorizontal: 14, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, minHeight: 100, textAlignVertical: 'top' },
  descToolbar:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', padding: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  photosSection: { marginTop: 0, marginBottom: 18 },
  photosCard:    { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  photosToolbar: { flexDirection: 'row', alignItems: 'center', padding: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  photosDeferHint: { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.regular, paddingHorizontal: 12, paddingBottom: 10, lineHeight: 16 },
  photoBtn:      { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  removeThumb:   { position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.text, borderWidth: 2, borderColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  submitBtn:     { paddingVertical: 14, paddingHorizontal: 20, borderRadius: Radius.lg, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8, minHeight: 48 },
  submitBtnText: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.accentFg, textAlign: 'center' },
  dateTimeSection: { marginBottom: 12, width: '100%', alignSelf: 'stretch' },
  dateTimeHeading: { marginBottom: 0 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    width: '100%',
    alignSelf: 'stretch',
  },
  allDayChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, paddingHorizontal: 9, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  allDayChipText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textSub },
  allDayChipTextActive: { color: Colors.text },
  allDayCheckbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  allDayCheckboxActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  eventTimeStack: {
    width: '100%',
    alignSelf: 'stretch',
    gap: 14,
    marginTop: 4,
  },
  eventTimeLine: {
    width: '100%',
    alignSelf: 'stretch',
  },
  eventTimeLineLabel: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  eventTimeRow: {
    width: '100%',
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    gap: 6,
  },
  eventTimeCell: {
    minWidth: 0,
    justifyContent: 'center',
  },
  /** ~60% / 40% split when date + time share a row; single child (all-day) grows to full row width. */
  eventTimeFieldDate: {
    flexGrow: 3,
    flexShrink: 1,
    flexBasis: 0,
    alignSelf: 'stretch',
  },
  eventTimeFieldTime: {
    flexGrow: 2,
    flexShrink: 1,
    flexBasis: 0,
    alignSelf: 'stretch',
  },
  eventTimeSegment: {
    width: '100%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    minHeight: 40,
  },
  eventTimeSegmentText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Colors.text,
  },
});
