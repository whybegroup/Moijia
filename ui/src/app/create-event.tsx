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
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '../components/AppDateTimePicker';
import { useLocalSearchParams, type Href } from 'expo-router';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import { Colors, Fonts, Radius } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, formatLocalDateInput } from '../utils/helpers';
import {
  localWallDateTimeToDate,
  localWallDateTimeToUtcIso,
  localWallDateStartOfDayToUtcIso,
  localWallDateEndOfDayToUtcIso,
  isValidEventFormTimeRange,
  endPreservingDuration,
  formatWallDateFromUtcIso,
  formatWallTimeHmFromUtcIso,
} from '../utils/datetimeUtc';
import { NavBar, Field, Toggle, formSectionTitleStyle } from '../components/ui';
import { KeyboardSafeScrollView } from '../components/KeyboardSafeScrollView';
import { EventFormPopoverChrome } from '../components/EventFormPopoverChrome';
import { edgeToEdgeModalProps } from '../components/edgeToEdgeModalProps';
import { RecurrenceField } from '../components/RecurrenceField';
import { buildRecurrenceRule, defaultRecurrenceFormState, parseRecurrenceToForm, type RecurrenceFormState } from '../utils/recurrence';
import { useGroups, useCreateEvent, useUpdateEvent, useEvent, useAllGroupMemberColors } from '../hooks/api';
import { uid } from '../utils/api-helpers';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { ResolvableImage } from '../components/ResolvableImage';
import { GroupAvatar } from '../components/GroupAvatar';
import { AddImageButton } from '../components/AddImageButton';
import {
  pickDeferredCoverPhotoNative,
  pickDeferredCoverPhotoFromCamera,
  createWebDeferredCoverPhoto,
  keepWebFilesThatFit,
  prepareWebImageFiles,
  uploadCoverPhotoDrafts,
  revokeCoverPhotoDraftPreview,
  coverPhotoDraftDisplayUri,
  coverPhotoDraftIsVideo,
  isCancelled,
  ensureGroupCanUpload,
  type CoverPhotoDraft,
} from '../services/pickAndUploadImage';
import { firstSearchParam, parseReturnToParam } from '../utils/navigationReturn';
import { confirmDestructive } from '../utils/confirmDestructive';
import { buildGroupEventDetailUrl } from '../utils/breadcrumbUrl';
import { EventUpdate } from '@moijia/client';
import Toast from 'react-native-toast-message';
import { SERIES_SCOPE_OPTIONS, type SeriesUpdateScope } from '../utils/seriesUpdateScopeOptions';
import { useLocationSuggestions } from '../hooks/useLocationSuggestions';
import { LocationSuggestionCard } from '../components/LocationSuggestionCard';
import { resolvePlaceSuggestionDetails } from '../utils/locationSuggestions';

/** Stable snapshot for “dirty?” after URL + default-group hydration. */
function serializeCreateFormBaseline(
  f: {
    name: string;
    description: string;
    groupId: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    allDay: boolean;
    location: string;
    /** True only after picking a Places suggestion (opens as maps link on detail). */
    locationLinkable: boolean;
    locationName: string;
    locationAddress: string;
    minAttendees: string;
    maxAttendees: string;
    allowMaybe: boolean;
    enableWaitlist: boolean;
    coverPhotoDrafts: CoverPhotoDraft[];
    recurrence: RecurrenceFormState;
  }
): string {
  const coverKey = f.coverPhotoDrafts
    .map((d) => (d.kind === 'remote' ? `r:${d.url}` : `p:${d.previewUri}`))
    .join('\n');
  return JSON.stringify({
    name: f.name,
    description: f.description,
    groupId: f.groupId,
    startDate: f.startDate,
    startTime: f.startTime,
    endDate: f.endDate,
    endTime: f.endTime,
    allDay: f.allDay,
    location: f.location,
    locationLinkable: f.locationLinkable,
    locationName: f.locationName,
    locationAddress: f.locationAddress,
    minAttendees: f.minAttendees,
    maxAttendees: f.maxAttendees,
    allowMaybe: f.allowMaybe,
    enableWaitlist: f.enableWaitlist,
    coverKey,
    recurrence: f.recurrence,
  });
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local wall clock rounded to nearest hour (e.g. 8:30pm → 9:00pm). */
function roundLocalDateTimeToNearestHour(d: Date): Date {
  const totalM = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  let rounded = Math.round(totalM / 60) * 60;
  const out = new Date(d);
  if (rounded >= 24 * 60) {
    out.setDate(out.getDate() + 1);
    out.setHours(0, 0, 0, 0);
  } else {
    out.setHours(Math.floor(rounded / 60), rounded % 60, 0, 0);
  }
  return out;
}

function getDefaultEventWallTimes() {
  let start = roundLocalDateTimeToNearestHour(new Date());
  while (start.getTime() <= Date.now()) {
    const bumped = new Date(start);
    bumped.setHours(start.getHours() + 1, 0, 0, 0);
    start = bumped;
  }
  const end = new Date(start);
  end.setHours(end.getHours() + 1, 0, 0, 0);
  return {
    startDate: formatLocalDateInput(start),
    startTime: `${pad2(start.getHours())}:${pad2(start.getMinutes())}`,
    endDate: formatLocalDateInput(end),
    endTime: `${pad2(end.getHours())}:${pad2(end.getMinutes())}`,
  };
}

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return new Date();
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function wallDateAndHmToDate(dateYmd: string, hm: string): Date {
  const [hh, mm] = hm.split(':').map(Number);
  const [y, mo, d] = dateYmd.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return new Date();
  return new Date(y, mo - 1, d, hh || 0, mm || 0, 0, 0);
}

function webEventTimeInputStyle(errored: boolean): Record<string, string | number> {
  return {
    padding: '6px 10px',
    borderRadius: 8,
    border: errored ? '1.5px solid #EF4444' : '1.5px solid #E5E5E5',
    backgroundColor: '#FFFFFF',
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
    editId?: string | string[];
    groupId?: string | string[];
  }>();
  const editId = firstSearchParam(calendarParams.editId);
  const isEditing = !!editId;
  const paramGroupId = firstSearchParam(calendarParams.groupId);
  const createReturnTo = useMemo(
    () => parseReturnToParam(firstSearchParam(calendarParams.returnTo)),
    [calendarParams.returnTo]
  );
  const { userId: currentUserId } = useCurrentUserContext();
  const today = formatLocalDateInput(new Date());
  const { data: groups = [], isFetched: groupsIsFetched } = useGroups(currentUserId ?? '');
  const { data: groupColors = {} } = useAllGroupMemberColors(currentUserId || '');
  const createEventMutation = useCreateEvent(currentUserId ?? '');
  const updateEventMutation = useUpdateEvent(editId ?? '', currentUserId ?? '');
  const { data: editingEvent } = useEvent(editId ?? '', currentUserId ?? '');
  const hydratedEditRef = useRef(false);
  const originalStartIsoRef = useRef<string | null>(null);
  const [showSaveScopeModal, setShowSaveScopeModal] = useState(false);
  const [seriesUpdateScope, setSeriesUpdateScope] = useState<SeriesUpdateScope>(
    EventUpdate.seriesUpdateScope.THIS_OCCURRENCE
  );

  const [form, setForm] = useState(() => {
    const t = getDefaultEventWallTimes();
    return {
      name: '',
      description: '',
      groupId: '',
      startDate: t.startDate,
      startTime: t.startTime,
      endDate: t.endDate,
      endTime: t.endTime,
      allDay: false,
      location: '',
      locationLinkable: false,
      locationName: '',
      locationAddress: '',
      minAttendees: '1',
      maxAttendees: '',
      allowMaybe: false,
      enableWaitlist: false,
      coverPhotoDrafts: [] as CoverPhotoDraft[],
      recurrence: defaultRecurrenceFormState() as RecurrenceFormState,
    };
  });
  const [errors, setErrors] = useState({
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
  });
  const [coverPhotoBusy, setCoverPhotoBusy] = useState(false);
  /** Create flow: pick group first, then event details. Edit always starts on details. */
  const [createStep, setCreateStep] = useState<'group' | 'details'>(() =>
    isEditing || !!paramGroupId ? 'details' : 'group'
  );

  const eventEligibleGroups = useMemo(
    () =>
      groups.filter(
        (g) => g.membershipStatus === 'member' || g.membershipStatus === 'admin',
      ),
    [groups]
  );
  const selectedGroup =
    eventEligibleGroups.find((g) => g.id === form.groupId) ??
    groups.find((g) => g.id === form.groupId);
  const selectedGroupTheme = selectedGroup
    ? getGroupColor(
        groupColors[selectedGroup.id] || getDefaultGroupThemeFromName(selectedGroup.name)
      )
    : null;

  const [createFormBaselineSerialized, setCreateFormBaselineSerialized] = useState<string | null>(null);

  useEffect(() => {
    if (isEditing || !paramGroupId || !groupsIsFetched) return;
    if (!eventEligibleGroups.some((g) => g.id === paramGroupId)) return;
    setForm((p) => (p.groupId === paramGroupId ? p : { ...p, groupId: paramGroupId }));
    setCreateStep('details');
  }, [isEditing, paramGroupId, groupsIsFetched, eventEligibleGroups]);

  useEffect(() => {
    if (isEditing || paramGroupId || !groupsIsFetched) return;
    if (form.groupId || createStep !== 'group') return;
    if (eventEligibleGroups.length === 1) {
      setForm((p) => ({ ...p, groupId: eventEligibleGroups[0]!.id }));
      setCreateStep('details');
    }
  }, [
    isEditing,
    paramGroupId,
    groupsIsFetched,
    form.groupId,
    createStep,
    eventEligibleGroups,
  ]);

  useEffect(() => {
    if (!isEditing || !editingEvent || hydratedEditRef.current) return;
    if (!editingEvent.start || !editingEvent.end) return;
    const startIso = String(editingEvent.start);
    const endIso = String(editingEvent.end);
    originalStartIsoRef.current = startIso;
    const startDate = formatWallDateFromUtcIso(startIso);
    const endDate = formatWallDateFromUtcIso(endIso);
    const startTime = formatWallTimeHmFromUtcIso(startIso);
    const endTime = formatWallTimeHmFromUtcIso(endIso);
    const allDay = !!editingEvent.isAllDay;
    const recurrence = parseRecurrenceToForm(
      editingEvent.recurrenceRule,
      localWallDateTimeToDate(startDate, startTime)
    );
    setForm({
      name: editingEvent.name ?? '',
      description: editingEvent.description ?? '',
      groupId: editingEvent.groupId,
      startDate,
      startTime,
      endDate,
      endTime,
      allDay,
      location: editingEvent.location ?? '',
      locationLinkable: !!editingEvent.locationLinkable,
      locationName: editingEvent.locationName ?? '',
      locationAddress: editingEvent.locationAddress ?? '',
      minAttendees:
        editingEvent.minAttendees != null && editingEvent.minAttendees > 0
          ? String(editingEvent.minAttendees)
          : '',
      maxAttendees:
        editingEvent.maxAttendees != null && editingEvent.maxAttendees > 0
          ? String(editingEvent.maxAttendees)
          : '',
      allowMaybe: !!editingEvent.allowMaybe,
      enableWaitlist: !!editingEvent.enableWaitlist,
      coverPhotoDrafts: (editingEvent.coverPhotos ?? []).map((url) => ({
        kind: 'remote' as const,
        url,
      })),
      recurrence,
    });
    setErrors({ startDate: '', startTime: '', endDate: '', endTime: '' });
    hydratedEditRef.current = true;
    setCreateFormBaselineSerialized(null);
  }, [editingEvent, isEditing]);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const {
    suggestions: locationSuggestions,
    suggesting: locationSuggesting,
    suggestionError: locationSuggestionError,
    panelOpen: locationSuggestionPanelOpen,
    clearSuggestions: clearLocationSuggestions,
  } = useLocationSuggestions(form.location);

  const coverPhotoFileInputRef = useRef<{ click: () => void } | null>(null);

  const addCoverPhotoFromPicker = async () => {
    if (!currentUserId) return;
    if (!(await ensureGroupCanUpload(currentUserId, form.groupId))) return;
    if (Platform.OS === 'web') {
      coverPhotoFileInputRef.current?.click();
      return;
    }
    if (coverPhotoBusy) return;
    setCoverPhotoBusy(true);
    try {
      const picked = await pickDeferredCoverPhotoNative({ userId: currentUserId, groupId: form.groupId });
      if (picked?.length) {
        setForm((p) => ({
          ...p,
          coverPhotoDrafts: [
            ...p.coverPhotoDrafts,
            ...picked.map((item) => ({
              kind: 'pending' as const,
              previewUri: item.previewUri,
              pending: item.pending,
            })),
          ],
        }));
      }
    } finally {
      setCoverPhotoBusy(false);
    }
  };

  const addCoverPhotoFromCamera = async () => {
    if (!currentUserId || coverPhotoBusy || Platform.OS === 'web') return;
    if (!(await ensureGroupCanUpload(currentUserId, form.groupId))) return;
    setCoverPhotoBusy(true);
    try {
      const picked = await pickDeferredCoverPhotoFromCamera({ userId: currentUserId, groupId: form.groupId });
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

  const addCoverPhotoFromLink = async (url: string) => {
    const clean = url.trim();
    if (!clean) return;
    setForm((p) => ({ ...p, coverPhotoDrafts: [...p.coverPhotoDrafts, { kind: 'remote', url: clean }] }));
  };

  const onCoverPhotoWebFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (!files.length || !currentUserId) return;
    try {
      const prepared = await keepWebFilesThatFit(
        currentUserId,
        form.groupId,
        await prepareWebImageFiles(files)
      );
      if (!prepared.length) return;
      setForm((p) => ({
        ...p,
        coverPhotoDrafts: [
          ...p.coverPhotoDrafts,
          ...prepared.map((file) => {
            const { previewUri, pending } = createWebDeferredCoverPhoto(file);
            return { kind: 'pending' as const, previewUri, pending };
          }),
        ],
      }));
    } catch (err) {
      if (!isCancelled(err)) {
        Alert.alert('Upload', err instanceof Error ? err.message : 'Could not add photos');
      }
    }
  };

  const removeCoverPhotoAt = (index: number) => {
    confirmDestructive('Delete photo?', 'This photo will be permanently deleted.', () => {
      setForm((p) => {
        const d = p.coverPhotoDrafts[index];
        if (d) revokeCoverPhotoDraftPreview(d);
        return { ...p, coverPhotoDrafts: p.coverPhotoDrafts.filter((_, j) => j !== index) };
      });
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
    !!form.name.trim() &&
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
      serializeCreateFormBaseline(form) !== createFormBaselineSerialized
    );
  }, [createFormBaselineSerialized, form]);

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

  const submit = async (seriesScope?: SeriesUpdateScope) => {
    if (!ok || !currentUserId) return;
    try {
      const startIso = form.allDay
        ? localWallDateStartOfDayToUtcIso(form.startDate)
        : localWallDateTimeToUtcIso(form.startDate, form.startTime);
      const endIso = form.allDay
        ? localWallDateEndOfDayToUtcIso(form.endDate)
        : localWallDateTimeToUtcIso(form.endDate, form.endTime);
      const start = new Date(startIso);
      const end = new Date(endIso);
      const savedStartMs = originalStartIsoRef.current
        ? new Date(originalStartIsoRef.current).getTime()
        : NaN;
      const eventHasStarted =
        isEditing && Number.isFinite(savedStartMs) && Date.now() >= savedStartMs;

      if (!isEditing && start.getTime() < Date.now()) {
        const msg = 'New events cannot be scheduled in the past.';
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('Cannot create event', msg);
        }
        return;
      }
      if (
        isEditing &&
        start.getTime() < Date.now() &&
        start.getTime() !== savedStartMs
      ) {
        const msg = 'New events cannot be scheduled in the past.';
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('Cannot create event', msg);
        }
        return;
      }

      const isAllDay = form.allDay && form.startDate === form.endDate;

      let coverPhotos: string[] = [];
      if (form.coverPhotoDrafts.length > 0) {
        try {
          coverPhotos = await uploadCoverPhotoDrafts(currentUserId, form.coverPhotoDrafts, {
            groupId: form.groupId,
          });
        } catch (e) {
          if (isCancelled(e)) return;
          Alert.alert('Error', e instanceof Error ? e.message : 'Failed to upload photos. Try again.');
          return;
        }
      }

      if (isEditing && editId) {
        const inSeries = !!(editingEvent as { recurrenceSeriesId?: string } | undefined)
          ?.recurrenceSeriesId?.trim();
        const baseline = createFormBaselineSerialized
          ? (JSON.parse(createFormBaselineSerialized) as {
              startDate: string;
              startTime: string;
              endDate: string;
              endTime: string;
              allDay: boolean;
            })
          : null;
        const timeFieldsDirty =
          !!baseline &&
          (form.startDate !== baseline.startDate ||
            form.startTime !== baseline.startTime ||
            form.endDate !== baseline.endDate ||
            form.endTime !== baseline.endTime ||
            form.allDay !== baseline.allDay);

        if (inSeries && timeFieldsDirty && !seriesScope) {
          setSeriesUpdateScope(EventUpdate.seriesUpdateScope.THIS_OCCURRENCE);
          setShowSaveScopeModal(true);
          return;
        }

        const minTrim = form.minAttendees.trim();
        const maxTrim = form.maxAttendees.trim();
        let minAttendees: number | null;
        let maxAttendees: number | null;
        if (minTrim === '') minAttendees = null;
        else {
          const n = parseInt(minTrim, 10);
          if (Number.isNaN(n) || n < 0) {
            Alert.alert('Error', 'Min attendees must be a non-negative number');
            return;
          }
          minAttendees = n;
        }
        if (maxTrim === '') maxAttendees = null;
        else {
          const n = parseInt(maxTrim, 10);
          if (Number.isNaN(n) || n < 0) {
            Alert.alert('Error', 'Max attendees must be a non-negative number');
            return;
          }
          maxAttendees = n;
        }
        if (minAttendees != null && maxAttendees != null && maxAttendees < minAttendees) {
          Alert.alert('Error', 'Max attendees must be at least the minimum');
          return;
        }
        const hasMaxCap = maxAttendees != null && maxAttendees > 0;
        const finalStartIso = eventHasStarted ? String(originalStartIsoRef.current) : startIso;

        await updateEventMutation.mutateAsync({
          name: form.name.trim(),
          description: form.description.trim(),
          location: form.location.trim(),
          locationLinkable: form.location.trim() ? form.locationLinkable : false,
          locationName:
            form.location.trim() && form.locationLinkable ? form.locationName.trim() || null : null,
          locationAddress:
            form.location.trim() && form.locationLinkable
              ? form.locationAddress.trim() || null
              : null,
          coverPhotos,
          start: finalStartIso,
          end: endIso,
          ...(eventHasStarted ? {} : { isAllDay: isAllDay || undefined }),
          minAttendees,
          maxAttendees,
          enableWaitlist: hasMaxCap ? form.enableWaitlist : false,
          allowMaybe: form.allowMaybe,
          updatedBy: currentUserId,
          viewerTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(inSeries && timeFieldsDirty && seriesScope
            ? { seriesUpdateScope: seriesScope }
            : {}),
        });
        Toast.show({ type: 'success', text1: 'Changes saved' });
        setShowSaveScopeModal(false);
        if (router.canGoBack()) {
          router.back();
        } else if (createReturnTo) {
          router.replace(createReturnTo as Href);
        } else {
          router.replace('/(tabs)/events');
        }
        return;
      }

      const recurrenceRule = buildRecurrenceRule(form.recurrence, start);

      const newEvent = {
        id: uid(),
        groupId: form.groupId,
        createdBy: currentUserId,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        coverPhotos,
        start: startIso,
        end: endIso,
        isAllDay: isAllDay || undefined,
        location: form.location.trim() || undefined,
        locationLinkable: form.location.trim() ? form.locationLinkable : false,
        locationName:
          form.location.trim() && form.locationLinkable ? form.locationName.trim() || null : null,
        locationAddress:
          form.location.trim() && form.locationLinkable
            ? form.locationAddress.trim() || null
            : null,
        minAttendees: form.minAttendees.trim() ? parseInt(form.minAttendees, 10) : undefined,
        maxAttendees: form.maxAttendees.trim() ? parseInt(form.maxAttendees, 10) : undefined,
        enableWaitlist: form.maxAttendees.trim() ? form.enableWaitlist : undefined,
        allowMaybe: form.allowMaybe,
        ...(recurrenceRule
          ? { recurrenceRule, viewerTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
          : {}),
      };

      await createEventMutation.mutateAsync(newEvent);
      if (paramGroupId) {
        const isInEventsTab = (createReturnTo ?? '').includes('/events/group/');
        router.replace(
          buildGroupEventDetailUrl(form.groupId || paramGroupId, newEvent.id, { isInEventsTab })
        );
      } else {
        router.replace(`/(tabs)/events/${newEvent.id}` as Href);
      }
    } catch {
      Alert.alert('Error', isEditing ? 'Failed to update event' : 'Failed to create event');
    }
  };

  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const eventTimeSectionYRef = useRef(0);
  const [iosStartDateDraft, setIosStartDateDraft] = useState(() => new Date());
  const [iosEndDateDraft, setIosEndDateDraft] = useState(() => new Date());
  const [iosStartTimeDraft, setIosStartTimeDraft] = useState(() => new Date());
  const [iosEndTimeDraft, setIosEndTimeDraft] = useState(() => new Date());

  const scrollToEventTimeSection = useCallback(() => {
    requestAnimationFrame(() => {
      const y = eventTimeSectionYRef.current;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
    });
  }, []);

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
      const shifted = endPreservingDuration({
        prevStartDate: form.startDate,
        prevStartTime: form.startTime,
        prevEndDate: form.endDate,
        prevEndTime: form.endTime,
        nextStartDate: dateStr,
        nextStartTime: form.startTime,
        allDay: form.allDay,
      });
      const endDate = shifted?.endDate ?? form.endDate;
      const endTime = shifted?.endTime ?? form.endTime;
      setForm((p) => ({
        ...p,
        startDate: dateStr,
        ...(shifted ? { endDate: shifted.endDate, endTime: shifted.endTime } : {}),
      }));
      validateStartDate(dateStr);
      validateStartTime(form.startTime, dateStr, form.allDay);
      validateEndDate(endDate, dateStr);
      validateEndTime(endTime, form.startTime, endDate, dateStr, form.allDay);
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
    const shifted = endPreservingDuration({
      prevStartDate: form.startDate,
      prevStartTime: form.startTime,
      prevEndDate: form.endDate,
      prevEndTime: form.endTime,
      nextStartDate: dateStr,
      nextStartTime: form.startTime,
      allDay: form.allDay,
    });
    const endDate = shifted?.endDate ?? form.endDate;
    const endTime = shifted?.endTime ?? form.endTime;
    setForm((p) => ({
      ...p,
      startDate: dateStr,
      ...(shifted ? { endDate: shifted.endDate, endTime: shifted.endTime } : {}),
    }));
    validateStartDate(dateStr);
    validateStartTime(form.startTime, dateStr, form.allDay);
    validateEndDate(endDate, dateStr);
    validateEndTime(endTime, form.startTime, endDate, dateStr, form.allDay);
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
      const shifted = endPreservingDuration({
        prevStartDate: form.startDate,
        prevStartTime: form.startTime,
        prevEndDate: form.endDate,
        prevEndTime: form.endTime,
        nextStartDate: form.startDate,
        nextStartTime: timeStr,
        allDay: form.allDay,
      });
      const endDate = shifted?.endDate ?? form.endDate;
      const endTime = shifted?.endTime ?? form.endTime;
      setForm((p) => ({
        ...p,
        startTime: timeStr,
        ...(shifted ? { endDate: shifted.endDate, endTime: shifted.endTime } : {}),
      }));
      validateStartTime(timeStr, form.startDate, form.allDay);
      validateEndTime(endTime, timeStr, endDate, form.startDate, form.allDay);
    }
  };

  const handleStartTimeInputChange = (timeStr: string) => {
    const shifted = endPreservingDuration({
      prevStartDate: form.startDate,
      prevStartTime: form.startTime,
      prevEndDate: form.endDate,
      prevEndTime: form.endTime,
      nextStartDate: form.startDate,
      nextStartTime: timeStr,
      allDay: form.allDay,
    });
    const endDate = shifted?.endDate ?? form.endDate;
    const endTime = shifted?.endTime ?? form.endTime;
    setForm((p) => ({
      ...p,
      startTime: timeStr,
      ...(shifted ? { endDate: shifted.endDate, endTime: shifted.endTime } : {}),
    }));
    validateStartTime(timeStr, form.startDate, form.allDay);
    validateEndTime(endTime, timeStr, endDate, form.startDate, form.allDay);
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

  const startOfToday = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const commitIosStartDate = () => {
    const dateStr = formatLocalDateInput(iosStartDateDraft);
    const shifted = endPreservingDuration({
      prevStartDate: form.startDate,
      prevStartTime: form.startTime,
      prevEndDate: form.endDate,
      prevEndTime: form.endTime,
      nextStartDate: dateStr,
      nextStartTime: form.startTime,
      allDay: form.allDay,
    });
    const endDate = shifted?.endDate ?? form.endDate;
    const endTime = shifted?.endTime ?? form.endTime;
    setForm((p) => ({
      ...p,
      startDate: dateStr,
      ...(shifted ? { endDate: shifted.endDate, endTime: shifted.endTime } : {}),
    }));
    validateStartDate(dateStr);
    validateStartTime(form.startTime, dateStr, form.allDay);
    validateEndDate(endDate, dateStr);
    validateEndTime(endTime, form.startTime, endDate, dateStr, form.allDay);
    setShowStartDatePicker(false);
  };

  const commitIosEndDate = () => {
    const dateStr = formatLocalDateInput(iosEndDateDraft);
    set('endDate', dateStr);
    validateEndDate(dateStr, form.startDate);
    validateEndTime(form.endTime, form.startTime, dateStr, form.startDate, form.allDay);
    setShowEndDatePicker(false);
  };

  const commitIosStartTime = () => {
    const timeStr = `${pad2(iosStartTimeDraft.getHours())}:${pad2(iosStartTimeDraft.getMinutes())}`;
    const shifted = endPreservingDuration({
      prevStartDate: form.startDate,
      prevStartTime: form.startTime,
      prevEndDate: form.endDate,
      prevEndTime: form.endTime,
      nextStartDate: form.startDate,
      nextStartTime: timeStr,
      allDay: form.allDay,
    });
    const endDate = shifted?.endDate ?? form.endDate;
    const endTime = shifted?.endTime ?? form.endTime;
    setForm((p) => ({
      ...p,
      startTime: timeStr,
      ...(shifted ? { endDate: shifted.endDate, endTime: shifted.endTime } : {}),
    }));
    validateStartTime(timeStr, form.startDate, form.allDay);
    validateEndTime(endTime, timeStr, endDate, form.startDate, form.allDay);
    setShowStartTimePicker(false);
  };

  const commitIosEndTime = () => {
    const timeStr = `${pad2(iosEndTimeDraft.getHours())}:${pad2(iosEndTimeDraft.getMinutes())}`;
    set('endTime', timeStr);
    validateEndTime(timeStr, form.startTime, form.endDate, form.startDate, form.allDay);
    setShowEndTimePicker(false);
  };

  /** Commit whichever iOS picker is open so switching fields does not discard drafts. */
  const flushActiveIosPicker = () => {
    if (showEndTimePicker) commitIosEndTime();
    else if (showEndDatePicker) commitIosEndDate();
    else if (showStartTimePicker) commitIosStartTime();
    else if (showStartDatePicker) commitIosStartDate();
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
  const groupSelectHydrated = !groupsDataReady
    ? false
    : isEditing
      ? hydratedEditRef.current && !!form.groupId
      : createStep === 'details'
        ? !!form.groupId || eventEligibleGroups.length === 0
        : false;
  const editHydrated = !isEditing || hydratedEditRef.current;

  useLayoutEffect(() => {
    if (createFormBaselineSerialized != null) return;
    if (!calendarPresetHydrated || !groupSelectHydrated || !editHydrated) return;
    setCreateFormBaselineSerialized(
      serializeCreateFormBaseline(form)
    );
  }, [createFormBaselineSerialized, calendarPresetHydrated, groupSelectHydrated, editHydrated, form]);

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

  const showDetailsStep = isEditing || createStep === 'details';
  const navTitle = isEditing
    ? 'Edit Event'
    : showDetailsStep
      ? 'New Event'
      : 'Choose group';

  const selectGroupForCreate = (groupId: string) => {
    setForm((p) => ({ ...p, groupId }));
    setCreateStep('details');
  };

  return (
    <EventFormPopoverChrome onClose={requestClose}>
      <View style={styles.inner}>
      <NavBar
        title={navTitle}
        onClose={requestClose}
        right={
          showDetailsStep ? (
          <TouchableOpacity
            onPress={() => void submit()}
            disabled={!ok || createEventMutation.isPending || updateEventMutation.isPending}
            style={[
              styles.headerBtn,
              (!ok || createEventMutation.isPending || updateEventMutation.isPending) && styles.headerBtnDis,
            ]}
          >
            {createEventMutation.isPending || updateEventMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.accentFg} />
            ) : (
              <Text style={[styles.headerBtnText, !ok && { color: Colors.textMuted }]} numberOfLines={1}>
                {isEditing ? 'Save' : 'Create'}
              </Text>
            )}
          </TouchableOpacity>
          ) : (
            <View style={{ width: 70 }} />
          )
        }
      />
      <KeyboardSafeScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 20, paddingBottom: 100, width: '100%', alignSelf: 'stretch' }}
        showsVerticalScrollIndicator={false}
      >

        {!showDetailsStep ? (
          <View style={styles.groupStep}>
            <Text style={styles.groupStepHint}>Which group is this event for?</Text>
            {!groupsDataReady ? (
              <ActivityIndicator color={Colors.textSub} style={{ marginTop: 24 }} />
            ) : eventEligibleGroups.length === 0 ? (
              <Text style={styles.groupStepEmpty}>Join a group before creating an event.</Text>
            ) : (
              <View style={styles.groupPickList}>
                {eventEligibleGroups.map((g) => {
                  const userColorHex = groupColors[g.id] || getDefaultGroupThemeFromName(g.name);
                  const p = getGroupColor(userColorHex);
                  return (
                    <TouchableOpacity
                      key={g.id}
                      onPress={() => selectGroupForCreate(g.id)}
                      style={styles.groupPickRow}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Choose ${g.name}`}
                    >
                      <View style={[styles.groupPickAvatarWrap, { backgroundColor: p.cal }]}>
                        <GroupAvatar
                          seed={g.avatarSeed}
                          thumbnail={g.thumbnail}
                          name={g.name}
                          size={44}
                        />
                      </View>
                      <View style={styles.groupPickText}>
                        <Text style={styles.groupPickName} numberOfLines={1}>
                          {g.name}
                        </Text>
                        {g.memberCount != null ? (
                          <Text style={styles.groupPickMeta}>
                            {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                          </Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          <>
        <Field label="Group" required>
          {selectedGroup && selectedGroupTheme ? (
            <View
              style={[
                styles.selectedGroupRow,
                {
                  backgroundColor: selectedGroupTheme.row,
                  borderColor: selectedGroupTheme.dot,
                  borderWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <View
                style={[
                  styles.groupPickAvatarWrap,
                  {
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: selectedGroupTheme.cal,
                  },
                ]}
              >
                <GroupAvatar
                  seed={selectedGroup.avatarSeed}
                  thumbnail={selectedGroup.thumbnail}
                  name={selectedGroup.name}
                  size={36}
                />
              </View>
              <Text
                style={[styles.selectedGroupName, { color: selectedGroupTheme.text }]}
                numberOfLines={1}
              >
                {selectedGroup.name}
              </Text>
              {!isEditing && !paramGroupId && eventEligibleGroups.length > 1 ? (
                <TouchableOpacity
                  onPress={() => setCreateStep('group')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Change group"
                >
                  <Text style={[styles.changeGroupLink, { color: selectedGroupTheme.text }]}>
                    Change
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <Text style={styles.groupStepEmpty}>No group selected</Text>
          )}
        </Field>

        <Field label="Event name" required>
          <TextInput
            value={form.name}
            onChangeText={(v) => set('name', v)}
            placeholder="e.g. Game night"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
          />
        </Field>

        <Field label="Description">
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

        <View
          style={styles.dateTimeSection}
          collapsable={false}
          onLayout={(e) => {
            eventTimeSectionYRef.current = e.nativeEvent.layout.y;
          }}
        >
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
                  <View style={[styles.eventTimeCell, styles.eventTimeFieldDate]} collapsable={false}>
                    <TouchableOpacity
                      onPress={() => {
                        if (Platform.OS === 'ios') {
                          if (showStartDatePicker) {
                            commitIosStartDate();
                            return;
                          }
                          flushActiveIosPicker();
                          setIosStartDateDraft(parseYmdLocal(form.startDate));
                          scrollToEventTimeSection();
                        }
                        setShowStartDatePicker(true);
                      }}
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
                    <View style={[styles.eventTimeCell, styles.eventTimeFieldTime]} collapsable={false}>
                      <TouchableOpacity
                        onPress={() => {
                          if (Platform.OS === 'ios') {
                            if (showStartTimePicker) {
                              commitIosStartTime();
                              return;
                            }
                            flushActiveIosPicker();
                            setIosStartTimeDraft(wallDateAndHmToDate(form.startDate, form.startTime));
                            scrollToEventTimeSection();
                          }
                          setShowStartTimePicker(true);
                        }}
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
                  <View style={[styles.eventTimeCell, styles.eventTimeFieldDate]} collapsable={false}>
                    <TouchableOpacity
                      onPress={() => {
                        if (Platform.OS === 'ios') {
                          if (showEndDatePicker) {
                            commitIosEndDate();
                            return;
                          }
                          flushActiveIosPicker();
                          setIosEndDateDraft(parseYmdLocal(form.endDate));
                        }
                        setShowEndDatePicker(true);
                      }}
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
                    <View style={[styles.eventTimeCell, styles.eventTimeFieldTime]} collapsable={false}>
                      <TouchableOpacity
                        onPress={() => {
                          if (Platform.OS === 'ios') {
                            if (showEndTimePicker) {
                              commitIosEndTime();
                              return;
                            }
                            flushActiveIosPicker();
                            setIosEndTimeDraft(wallDateAndHmToDate(form.endDate, form.endTime));
                          }
                          setShowEndTimePicker(true);
                        }}
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

        {!isEditing ? (
          <RecurrenceField
            anchorDate={recurrenceAnchor}
            value={form.recurrence}
            onChange={(recurrence) => setForm((p) => ({ ...p, recurrence }))}
          />
        ) : null}

        <Field label="Location">
          <View style={styles.locationInputWrap}>
            <TextInput
              value={form.location}
              onChangeText={(v) => {
                setForm((p) => ({
                  ...p,
                  location: v,
                  locationLinkable: false,
                  locationName: '',
                  locationAddress: '',
                }));
              }}
              placeholder="e.g. Central Park"
              placeholderTextColor={Colors.textMuted}
              style={[styles.input, form.location.length > 0 && styles.locationInputWithClear]}
              autoCapitalize="words"
            />
            {form.location.length > 0 ? (
              <TouchableOpacity
                style={styles.locationClearBtn}
                onPress={() => {
                  setForm((p) => ({
                    ...p,
                    location: '',
                    locationLinkable: false,
                    locationName: '',
                    locationAddress: '',
                  }));
                  clearLocationSuggestions();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Clear location"
              >
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
          {locationSuggestionPanelOpen ? (
            <LocationSuggestionCard
              typed={form.location}
              suggestions={locationSuggestions}
              suggesting={locationSuggesting}
              suggestionError={locationSuggestionError}
              showAsEntered={!form.locationLinkable}
              onPickAsEntered={(typed) => {
                setForm((p) => ({
                  ...p,
                  location: typed,
                  locationLinkable: false,
                  locationName: '',
                  locationAddress: '',
                }));
                clearLocationSuggestions();
              }}
              onPickSuggestion={(s) => {
                void (async () => {
                  const resolved = await resolvePlaceSuggestionDetails(s);
                  setForm((p) => ({
                    ...p,
                    location: resolved.label,
                    locationLinkable: true,
                    locationName: resolved.name,
                    locationAddress: resolved.address,
                  }));
                  clearLocationSuggestions();
                })();
              }}
            />
          ) : null}
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

        {!isEditing ? (
          <View style={styles.photosSection}>
            {Platform.OS === 'web' && (
              <input
                ref={(el) => {
                  coverPhotoFileInputRef.current = el;
                }}
                type="file"
                accept="image/*,video/*,.gif,.gifv,.mp4,.mov,.webm"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => void onCoverPhotoWebFileChange(e)}
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
                        treatAsVideo={coverPhotoDraftIsVideo(d)}
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
                <AddImageButton
                  label="Add photo"
                  busy={coverPhotoBusy}
                  disabled={coverPhotoBusy || !currentUserId}
                  onTakePhoto={addCoverPhotoFromCamera}
                  onChooseFromLibrary={addCoverPhotoFromPicker}
                  onInsertLink={addCoverPhotoFromLink}
                />
              </View>
            </View>
          </View>
        ) : null}

        <Field label="Settings">
          <View style={styles.settingsCard}>
            <Toggle value={form.allowMaybe} onChange={v => set('allowMaybe', v)} label="Allow 'Maybe' responses" />
            {form.maxAttendees.trim() ? (
              <Toggle value={form.enableWaitlist} onChange={v => set('enableWaitlist', v)} label="Enable waitlist" />
            ) : null}
          </View>
        </Field>

        <TouchableOpacity
          onPress={() => void submit()}
          style={[
            styles.submitBtn,
            (!ok || createEventMutation.isPending || updateEventMutation.isPending) && {
              backgroundColor: Colors.border,
            },
          ]}
          disabled={!ok || createEventMutation.isPending || updateEventMutation.isPending}
        >
          {createEventMutation.isPending || updateEventMutation.isPending ? (
            <ActivityIndicator color={Colors.accentFg} />
          ) : (
            <Text style={[styles.submitBtnText, !ok && { color: Colors.textMuted }]} numberOfLines={1}>
              {isEditing ? 'Save event' : 'Create event'}
            </Text>
          )}
        </TouchableOpacity>
          </>
        )}
      </KeyboardSafeScrollView>

      {Platform.OS === 'android' && showStartDatePicker && (
        <DateTimePicker
          value={parseYmdLocal(form.startDate)}
          mode="date"
          display="default"
          onChange={handleStartDateChange}
          minimumDate={startOfToday}
        />
      )}
      {Platform.OS === 'android' && showEndDatePicker && (
        <DateTimePicker
          value={parseYmdLocal(form.endDate)}
          mode="date"
          display="default"
          onChange={handleEndDateChange}
          minimumDate={parseYmdLocal(form.startDate)}
        />
      )}
      {Platform.OS === 'android' && showStartTimePicker && (
        <DateTimePicker
          value={wallDateAndHmToDate(form.startDate, form.startTime)}
          mode="time"
          display="default"
          onChange={handleStartTimeChange}
          minimumDate={getMinimumStartTime()}
        />
      )}
      {Platform.OS === 'android' && showEndTimePicker && (
        <DateTimePicker
          value={wallDateAndHmToDate(form.endDate, form.endTime)}
          mode="time"
          display="default"
          onChange={handleEndTimeChange}
          minimumDate={getMinimumEndTime()}
        />
      )}

      {Platform.OS === 'ios' && showStartDatePicker ? (
        <Modal transparent animationType="fade" statusBarTranslucent visible {...edgeToEdgeModalProps}>
          <View style={styles.iosFilterPickerModalRoot}>
            <Pressable style={[StyleSheet.absoluteFillObject, styles.iosFilterPickerBackdrop]} onPress={commitIosStartDate} />
            <View style={styles.iosFilterPickerModalCard}>
              <View style={styles.iosFilterPickerHostDate}>
              <DateTimePicker
                value={iosStartDateDraft}
                mode="date"
                display="inline"
                onChange={(_, d) => {
                  if (d) setIosStartDateDraft(d);
                }}
                minimumDate={startOfToday}
              />
              </View>
              <View style={styles.datePickerActions}>
                <TouchableOpacity onPress={commitIosStartDate} style={styles.datePickerBtn}>
                  <Text style={styles.datePickerBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
      {Platform.OS === 'ios' && showEndDatePicker ? (
        <Modal transparent animationType="fade" statusBarTranslucent visible {...edgeToEdgeModalProps}>
          <View style={styles.iosFilterPickerModalRoot}>
            <Pressable style={[StyleSheet.absoluteFillObject, styles.iosFilterPickerBackdrop]} onPress={commitIosEndDate} />
            <View style={styles.iosFilterPickerModalCard}>
              <View style={styles.iosFilterPickerHostDate}>
              <DateTimePicker
                value={iosEndDateDraft}
                mode="date"
                display="inline"
                onChange={(_, d) => {
                  if (d) setIosEndDateDraft(d);
                }}
                minimumDate={parseYmdLocal(form.startDate)}
              />
              </View>
              <View style={styles.datePickerActions}>
                <TouchableOpacity onPress={commitIosEndDate} style={styles.datePickerBtn}>
                  <Text style={styles.datePickerBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
      {Platform.OS === 'ios' && showStartTimePicker ? (
        <Modal transparent animationType="fade" statusBarTranslucent visible {...edgeToEdgeModalProps}>
          <View style={styles.iosFilterPickerModalRoot}>
            <Pressable style={[StyleSheet.absoluteFillObject, styles.iosFilterPickerBackdrop]} onPress={commitIosStartTime} />
            <View style={styles.iosFilterPickerModalCard}>
              <View style={styles.iosFilterPickerHostTime}>
              <DateTimePicker
                value={iosStartTimeDraft}
                mode="time"
                display="spinner"
                onChange={(_, d) => {
                  if (d) setIosStartTimeDraft(d);
                }}
                minimumDate={getMinimumStartTime()}
              />
              </View>
              <View style={styles.datePickerActions}>
                <TouchableOpacity onPress={commitIosStartTime} style={styles.datePickerBtn}>
                  <Text style={styles.datePickerBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
      {Platform.OS === 'ios' && showEndTimePicker ? (
        <Modal transparent animationType="fade" statusBarTranslucent visible {...edgeToEdgeModalProps}>
          <View style={styles.iosFilterPickerModalRoot}>
            <Pressable style={[StyleSheet.absoluteFillObject, styles.iosFilterPickerBackdrop]} onPress={commitIosEndTime} />
            <View style={styles.iosFilterPickerModalCard}>
              <View style={styles.iosFilterPickerHostTime}>
              <DateTimePicker
                value={iosEndTimeDraft}
                mode="time"
                display="spinner"
                onChange={(_, d) => {
                  if (d) setIosEndTimeDraft(d);
                }}
                minimumDate={getMinimumEndTime()}
              />
              </View>
              <View style={styles.datePickerActions}>
                <TouchableOpacity onPress={commitIosEndTime} style={styles.datePickerBtn}>
                  <Text style={styles.datePickerBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      <Modal
        visible={showSaveScopeModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (updateEventMutation.isPending) return;
          setShowSaveScopeModal(false);
        }}
        {...edgeToEdgeModalProps}
      >
        <View style={styles.saveScopeOverlay}>
          <View style={styles.saveScopeBox}>
            <Text style={styles.saveScopeTitle}>Save changes</Text>
            <Text style={styles.saveScopeMessage}>
              Choose how to apply your edits to this repeating event.
            </Text>
            <View style={styles.saveScopeCard}>
              {SERIES_SCOPE_OPTIONS.map((opt, i) => {
                const sel = seriesUpdateScope === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => !updateEventMutation.isPending && setSeriesUpdateScope(opt.key)}
                    style={[
                      styles.saveScopeRow,
                      i > 0 && styles.saveScopeRowBorder,
                      sel && styles.saveScopeRowSelected,
                    ]}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.saveScopeRadioOuter, sel && styles.saveScopeRadioOuterOn]}>
                      {sel ? <View style={styles.saveScopeRadioInner} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.saveScopeOptTitle}>{opt.title}</Text>
                      <Text style={styles.saveScopeOptSub}>{opt.sub}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.saveScopeActions}>
              <TouchableOpacity
                onPress={() => setShowSaveScopeModal(false)}
                style={[styles.saveScopeCancelBtn, { flex: 1 }]}
                disabled={updateEventMutation.isPending}
              >
                <Text style={styles.saveScopeCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void submit(seriesUpdateScope)}
                style={[
                  styles.headerBtn,
                  { flex: 1, alignItems: 'center' },
                  updateEventMutation.isPending && styles.headerBtnDis,
                ]}
                disabled={updateEventMutation.isPending}
              >
                {updateEventMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.accentFg} />
                ) : (
                  <Text style={styles.headerBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </View>
    </EventFormPopoverChrome>
  );
}

const styles = StyleSheet.create({
  inner:         { flex: 1, backgroundColor: Colors.bg },
  headerBtn:     { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.lg, backgroundColor: Colors.accent, flexShrink: 0 },
  headerBtnDis:  { backgroundColor: Colors.border },
  headerBtnText: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  groupStep: { gap: 12 },
  groupStepHint: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    marginBottom: 4,
  },
  groupStepEmpty: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    marginTop: 12,
  },
  groupPickList: { gap: 8 },
  groupPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  groupPickAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  groupPickText: { flex: 1, minWidth: 0 },
  groupPickName: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.text },
  groupPickMeta: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textMuted, marginTop: 2 },
  selectedGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  selectedGroupName: { flex: 1, minWidth: 0, fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text },
  changeGroupLink: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accent },
  input:         {
    padding: 10,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    fontSize: 14,
    color: Colors.text,
    fontFamily: Fonts.regular,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null),
  },
  locationInputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  locationInputWithClear: {
    paddingRight: 36,
  },
  locationClearBtn: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputError:    { borderColor: '#EF4444' },
  errorText:     { fontSize: 12, color: '#EF4444', fontFamily: Fonts.regular, marginBottom: 4 },
  datePickerActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 8 },
  datePickerBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  datePickerBtnText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  iosFilterPickerBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  iosFilterPickerModalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  iosFilterPickerModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    zIndex: 2,
  },
  iosFilterPickerHostDate: {
    width: '100%',
    minHeight: 320,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iosFilterPickerHostTime: {
    width: '100%',
    minHeight: 200,
    padding: 12,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  settingsCard:  { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16 },
  descBox:       { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.border, overflow: 'hidden' },
  descInput:     {
    padding: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: Colors.text,
    fontFamily: Fonts.regular,
    minHeight: 100,
    textAlignVertical: 'top',
    backgroundColor: 'transparent',
    borderWidth: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null),
  },
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
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    minHeight: 40,
  },
  eventTimeSegmentText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Colors.text,
  },
  saveScopeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  saveScopeBox: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  saveScopeTitle: {
    fontSize: 18,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    marginBottom: 8,
  },
  saveScopeMessage: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    marginBottom: 12,
  },
  saveScopeCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  saveScopeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    backgroundColor: Colors.surface,
  },
  saveScopeRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  saveScopeRowSelected: {
    backgroundColor: Colors.bg,
  },
  saveScopeRadioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  saveScopeRadioOuterOn: {
    borderColor: Colors.accent,
  },
  saveScopeRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
  },
  saveScopeOptTitle: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
  },
  saveScopeOptSub: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  saveScopeActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  saveScopeCancelBtn: {
    paddingVertical: 12,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveScopeCancelText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: Colors.textSub,
  },
});
