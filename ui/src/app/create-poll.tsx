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
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '../components/AppDateTimePicker';
import { useLocalSearchParams, type Href } from 'expo-router';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import Toast from 'react-native-toast-message';
import { PollOptionInputKind, type Poll, type PollInput } from '@moijia/client';
import { Colors, Fonts, Radius } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, formatLocalDateInput } from '../utils/helpers';
import { localWallDateTimeToUtcIso } from '../utils/datetimeUtc';
import { NavBar, Field, Toggle, formSectionTitleStyle } from '../components/ui';
import { KeyboardSafeScrollView } from '../components/KeyboardSafeScrollView';
import { EventFormPopoverChrome } from '../components/EventFormPopoverChrome';
import { edgeToEdgeModalProps } from '../components/edgeToEdgeModalProps';
import { GroupAvatar } from '../components/GroupAvatar';
import { useGroups, useCreatePoll, useAllGroupMemberColors, usePoll, useUpdatePoll } from '../hooks/api';
import { uid } from '../utils/api-helpers';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { ResolvableImage } from '../components/ResolvableImage';
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

const MAX_OPTIONS_PER_QUESTION = 50;

function webPollDatetimeInputStyle(): Record<string, string | number> {
  return {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1.5px solid #E5E5E5',
    backgroundColor: Colors.surface,
    fontSize: 13,
    color: '#1A1A1A',
    fontFamily: 'DMSans_400Regular',
    boxSizing: 'border-box',
    outline: 'none',
    minWidth: 0,
    width: '100%',
  };
}

type QuestionType = 'choice' | 'text';

type QuestionDraft = {
  id: string;
  title: string;
  options: string[];
  /** Existing poll option ids aligned with `options`; omitted for newly added blanks. */
  optionIds: Array<string | undefined>;
  textOptionId?: string;
  multipleChoice: boolean;
  enableRating: boolean;
  type: QuestionType;
  anonymousVotes: boolean;
  required: boolean;
};

function newQuestionDraft(): QuestionDraft {
  return {
    id: uid(),
    title: '',
    options: ['', ''],
    optionIds: [undefined, undefined],
    multipleChoice: false,
    enableRating: false,
    type: 'choice',
    anonymousVotes: false,
    required: false,
  };
}

function stripForLength(s: string): number {
  const t = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length;
}

function parseQuestionDraftsFromPoll(poll: Poll): QuestionDraft[] {
  const sorted = poll.options.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const map = new Map<string, QuestionDraft>();
  const re = /^Q(\d+):\s*(.*?)\s*\[(.*?)\]\s*-\s*(.*)$/i;
  for (const o of sorted) {
    const text = (o.textHtml ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const m = text.match(re);
    if (!m) continue;
    const idx = Number(m[1]);
    const key = `q-${idx}`;
    const title = m[2].trim();
    const rawType = m[3].trim().toLowerCase();
    const optionLabel = m[4].trim();
    const tokens = rawType.split('|').map((t) => t.trim());
    const baseType = tokens[0] ?? rawType;
    const isText = baseType.includes('text');
    const isRating = baseType.includes('rating');
    const isMultiple = baseType.includes('multiple');
    const isAnonymous = tokens.includes('anon') || tokens.includes('anonymous');
    const isRequired = tokens.includes('req') || tokens.includes('required');
    if (!map.has(key)) {
      map.set(key, {
        id: uid(),
        title,
        options: isText ? [] : [],
        optionIds: isText ? [] : [],
        textOptionId: isText ? o.id : undefined,
        multipleChoice: isRating || isMultiple,
        enableRating: isRating,
        type: isText ? 'text' : 'choice',
        anonymousVotes: isAnonymous,
        required: isRequired,
      });
    }
    const q = map.get(key)!;
    if (q.type === 'text' && !q.textOptionId) q.textOptionId = o.id;
    if (q.type === 'choice' && optionLabel && optionLabel !== '__TEXT_RESPONSE__') {
      q.options.push(optionLabel);
      q.optionIds.push(o.id);
    }
  }
  const out = Array.from(map.entries())
    .sort((a, b) => Number(a[0].slice(2)) - Number(b[0].slice(2)))
    .map(([, q]) => {
      if (q.type !== 'choice') {
        return { ...q, options: ['', ''], optionIds: [undefined, undefined] };
      }
      const options = [...q.options];
      const optionIds = [...q.optionIds];
      while (options.length < 2) {
        options.push('');
        optionIds.push(undefined);
      }
      return { ...q, options, optionIds };
    });
  return out.length > 0 ? out : [newQuestionDraft()];
}

function serializeCreatePollDraft(args: {
  form: {
    title: string;
    description: string;
    groupId: string;
    coverPhotoDrafts: CoverPhotoDraft[];
    multipleChoice: boolean;
    ranking: boolean;
  };
  questionDrafts: QuestionDraft[];
  deadlineDate: string;
  deadlineTime: string;
}): string {
  const { form, questionDrafts, deadlineDate, deadlineTime } = args;
  return JSON.stringify({
    title: form.title,
    description: form.description,
    groupId: form.groupId,
    coverPhotos: form.coverPhotoDrafts.map((d) =>
      d.kind === 'remote' ? `r:${d.url}` : `p:${d.previewUri}`
    ),
    multipleChoice: form.multipleChoice,
    ranking: form.ranking,
    deadlineDate,
    deadlineTime,
    questions: questionDrafts.map((q) => ({
      title: q.title,
      options: q.options,
      multipleChoice: q.multipleChoice,
      type: q.type,
      enableRating: q.enableRating,
      anonymousVotes: q.anonymousVotes,
      required: q.required,
    })),
  });
}

export default function CreatePollScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    returnTo?: string | string[];
    editId?: string | string[];
    groupId?: string | string[];
  }>();
  const editId = firstSearchParam(params.editId);
  const isEditing = !!editId;
  const paramGroupId = firstSearchParam(params.groupId);
  const createReturnTo = useMemo(
    () => parseReturnToParam(firstSearchParam(params.returnTo)),
    [params.returnTo],
  );
  const { userId: currentUserId } = useCurrentUserContext();
  const { data: groups = [], isFetched: groupsIsFetched } = useGroups(currentUserId ?? '');
  const { data: groupColors = {} } = useAllGroupMemberColors(currentUserId || '');
  const createPollMutation = useCreatePoll(currentUserId ?? '');
  const updatePollMutation = useUpdatePoll(editId ?? '', currentUserId ?? '');
  const { data: editingPoll } = usePoll(editId ?? '', currentUserId ?? '');

  const [form, setForm] = useState({
    title: '',
    description: '',
    groupId: '',
    coverPhotoDrafts: [] as CoverPhotoDraft[],
    multipleChoice: false,
    ranking: false,
  });
  const [questionDrafts, setQuestionDrafts] = useState<QuestionDraft[]>(() => [newQuestionDraft()]);
  const [coverPhotoBusy, setCoverPhotoBusy] = useState(false);
  const [deadlineDate, setDeadlineDate] = useState(() => formatLocalDateInput(new Date()));
  const [deadlineTime, setDeadlineTime] = useState('23:59');
  const [showDeadlineDatePicker, setShowDeadlineDatePicker] = useState(false);
  const [showDeadlineTimePicker, setShowDeadlineTimePicker] = useState(false);
  const [iosDeadlineDateDraft, setIosDeadlineDateDraft] = useState(() => new Date());
  const [iosDeadlineTimeDraft, setIosDeadlineTimeDraft] = useState(() => new Date());
  const [createPollBaselineSerialized, setCreatePollBaselineSerialized] = useState<string | null>(null);
  const initialGroupIdRef = useRef<string | null>(null);
  const hydratedEditRef = useRef(false);
  const [createStep, setCreateStep] = useState<'group' | 'details'>(() =>
    isEditing || !!paramGroupId ? 'details' : 'group'
  );

  const joinedGroups = groups.filter(
    (g) =>
      g.membershipStatus === 'member' ||
      g.membershipStatus === 'admin' ||
      g.membershipStatus === 'pending',
  );
  const eventEligibleGroups = joinedGroups.filter(
    (g) => g.membershipStatus === 'member' || g.membershipStatus === 'admin',
  );
  const selectedGroup = joinedGroups.find((g) => g.id === form.groupId);
  const selectedGroupEligible =
    selectedGroup?.membershipStatus === 'member' || selectedGroup?.membershipStatus === 'admin';
  const selectedGroupTheme = selectedGroup
    ? getGroupColor(
        groupColors[selectedGroup.id] || getDefaultGroupThemeFromName(selectedGroup.name)
      )
    : null;

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
    if (!initialGroupIdRef.current && form.groupId) {
      initialGroupIdRef.current = form.groupId;
    }
  }, [form.groupId]);

  useEffect(() => {
    if (!isEditing || !editingPoll || hydratedEditRef.current) return;
    const d = new Date(editingPoll.deadline);
    const localDate = Number.isFinite(d.getTime()) ? formatLocalDateInput(d) : formatLocalDateInput(new Date());
    const localTime = Number.isFinite(d.getTime())
      ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : '23:59';
    const coverPhotoDrafts = (editingPoll.coverPhotos ?? []).map((url) => ({ kind: 'remote' as const, url }));
    setForm({
      title: editingPoll.title ?? '',
      description: editingPoll.description ?? '',
      groupId: editingPoll.groupId,
      coverPhotoDrafts,
      multipleChoice: !!editingPoll.multipleChoice,
      ranking: !!editingPoll.ranking,
    });
    setQuestionDrafts(parseQuestionDraftsFromPoll(editingPoll));
    setDeadlineDate(localDate);
    setDeadlineTime(localTime);
    initialGroupIdRef.current = editingPoll.groupId;
    hydratedEditRef.current = true;
    setCreatePollBaselineSerialized(null);
  }, [editingPoll, isEditing]);

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

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

  const updateQuestion = (id: string, patch: Partial<QuestionDraft>) => {
    setQuestionDrafts((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const updateQuestionTitle = (id: string, title: string) => updateQuestion(id, { title });
  const addQuestion = () => setQuestionDrafts((rows) => [...rows, newQuestionDraft()]);
  const removeQuestion = (id: string) => {
    setQuestionDrafts((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.id !== id)));
  };
  const addQuestionOption = (id: string) => {
    setQuestionDrafts((rows) =>
      rows.map((q) => {
        if (q.id !== id) return q;
        if (q.options.length >= MAX_OPTIONS_PER_QUESTION) {
          Alert.alert('Option limit reached', `Each question can have up to ${MAX_OPTIONS_PER_QUESTION} options.`);
          return q;
        }
        return { ...q, options: [...q.options, ''], optionIds: [...q.optionIds, undefined] };
      })
    );
  };
  const updateQuestionOption = (id: string, idx: number, value: string) => {
    setQuestionDrafts((rows) =>
      rows.map((q) =>
        q.id === id
          ? { ...q, options: q.options.map((opt, i) => (i === idx ? value : opt)) }
          : q
      )
    );
  };
  const removeQuestionOption = (id: string, idx: number) => {
    setQuestionDrafts((rows) =>
      rows.map((q) =>
        q.id === id && q.options.length > 2
          ? {
              ...q,
              options: q.options.filter((_, i) => i !== idx),
              optionIds: q.optionIds.filter((_, i) => i !== idx),
            }
          : q
      )
    );
  };

  const optionsValid = useMemo(
    () =>
      questionDrafts.every((q) => {
        const titleOk = q.title.trim().length > 0;
        if (q.type === 'text') return titleOk;
        const validOptions = q.options.filter((o) => stripForLength(o) > 0);
        return titleOk && validOptions.length >= 2;
      }),
    [questionDrafts],
  );
  const hasDeadlineOption = !!(deadlineDate.trim() && deadlineTime.trim());

  const ok =
    !!form.title.trim() &&
    !!form.groupId &&
    !!selectedGroupEligible &&
    questionDrafts.length >= 1 &&
    optionsValid &&
    hasDeadlineOption &&
    !!currentUserId;

  const createPollDirty = useMemo(() => {
    if (createPollBaselineSerialized == null) return false;
    return (
      serializeCreatePollDraft({
        form,
        questionDrafts,
        deadlineDate,
        deadlineTime,
      }) !== createPollBaselineSerialized
    );
  }, [createPollBaselineSerialized, form, questionDrafts, deadlineDate, deadlineTime]);

  const hasMeaningfulChanges = useMemo(() => {
    if (form.title.trim().length > 0) return true;
    if (form.description.trim().length > 0) return true;
    if (form.coverPhotoDrafts.length > 0) return true;
    if (questionDrafts.length > 1) return true;
    if (deadlineDate !== formatLocalDateInput(new Date())) return true;
    if (deadlineTime !== '23:59') return true;
    if (initialGroupIdRef.current && form.groupId && form.groupId !== initialGroupIdRef.current) return true;
    for (const q of questionDrafts) {
      if (q.title.trim().length > 0) return true;
      if (q.type !== 'choice') return true;
      if (q.multipleChoice || q.enableRating || q.anonymousVotes || q.required) return true;
      if (q.options.some((o) => o.trim().length > 0)) return true;
    }
    return false;
  }, [form, questionDrafts, deadlineDate, deadlineTime]);

  const dismiss = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (createReturnTo) {
      router.replace(createReturnTo as Href);
      return;
    }
    router.replace('/(tabs)/polls');
  }, [router, createReturnTo]);

  const groupsDataReady = !currentUserId || groupsIsFetched;
  const groupSelectHydrated = !groupsDataReady
    ? false
    : isEditing
      ? hydratedEditRef.current && !!form.groupId
      : createStep === 'details'
        ? !!form.groupId || eventEligibleGroups.length === 0
        : false;

  useLayoutEffect(() => {
    if (createPollBaselineSerialized != null) return;
    if (!groupSelectHydrated) return;
    setCreatePollBaselineSerialized(
      serializeCreatePollDraft({
        form,
        questionDrafts,
        deadlineDate,
        deadlineTime,
      })
    );
  }, [
    createPollBaselineSerialized,
    groupSelectHydrated,
    form,
    questionDrafts,
    deadlineDate,
    deadlineTime,
  ]);

  const requestClose = useCallback(() => {
    const shouldPromptDiscard = isEditing ? createPollDirty : hasMeaningfulChanges || createPollDirty;
    if (!shouldPromptDiscard) {
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
  }, [isEditing, hasMeaningfulChanges, createPollDirty, dismiss]);

  const submit = async () => {
    if (!ok || !currentUserId) return;
    if (!selectedGroupEligible) {
      Alert.alert('Group not eligible', 'You can create polls only in groups you actively joined.');
      return;
    }
    if (!hasDeadlineOption) {
      Alert.alert('Deadline required', 'Set a valid deadline date and time.');
      return;
    }
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

    const options = questionDrafts.flatMap((q, qi) => {
      const typeLabel =
        q.type === 'text'
          ? 'Text'
          : q.enableRating
            ? 'Rating'
            : q.multipleChoice
              ? 'Multiple choice'
              : 'Single choice';
      const metaFlags: string[] = [];
      if (q.anonymousVotes) metaFlags.push('anon');
      if (q.required) metaFlags.push('req');
      const metaLabel = metaFlags.length > 0 ? `${typeLabel}|${metaFlags.join('|')}` : typeLabel;
      if (q.type === 'text') {
        return [
          {
            id: q.textOptionId || uid(),
            inputKind: PollOptionInputKind.TEXT,
            sortOrder: qi * 1000,
            textHtml: `Q${qi + 1}: ${q.title.trim()} [${metaLabel}] - __TEXT_RESPONSE__`,
          },
        ];
      }
      const cleanOptions = q.options
        .map((o, oi) => ({ label: o.trim(), id: q.optionIds[oi] }))
        .filter((o) => o.label.length > 0);
      return cleanOptions.map((opt, oi) => ({
        id: opt.id || uid(),
        inputKind: PollOptionInputKind.TEXT,
        sortOrder: qi * 1000 + oi,
        textHtml: `Q${qi + 1}: ${q.title.trim()} [${metaLabel}] - ${opt.label}`,
      }));
    });

    const body: PollInput = {
      id: editId ?? uid(),
      groupId: form.groupId,
      createdBy: currentUserId,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      deadline: localWallDateTimeToUtcIso(deadlineDate, deadlineTime),
      coverPhotos,
      options,
      anonymousVotes: false,
      multipleChoice: questionDrafts.some((q) => q.multipleChoice),
      ranking: questionDrafts.some((q) => q.enableRating),
    };

    if (isEditing && editId && createPollDirty) {
      const warn = 'Editing this poll could affect existing responses';
      if (Platform.OS === 'web') {
        if (!window.confirm(warn)) return;
      } else {
        const okToProceed = await new Promise<boolean>((resolve) => {
          Alert.alert('Update poll?', warn, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Continue', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
        if (!okToProceed) return;
      }
    }

    try {
      if (isEditing && editId) {
        await updatePollMutation.mutateAsync(body);
        Toast.show({ type: 'success', text1: 'Poll updated' });
        dismiss();
      } else {
        await createPollMutation.mutateAsync(body);
        Toast.show({ type: 'success', text1: 'Poll created' });
        if (createReturnTo) {
          router.replace(createReturnTo as Href);
        } else {
          router.replace('/(tabs)/polls');
        }
      }
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'body' in e
          ? String((e as { body?: { error?: string } }).body?.error ?? '')
          : '';
      Alert.alert('Error', msg || (isEditing ? 'Failed to update poll' : 'Failed to create poll'));
    }
  };

  const showDetailsStep = isEditing || createStep === 'details';
  const navTitle = isEditing
    ? 'Edit Poll'
    : showDetailsStep
      ? 'New Poll'
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
              disabled={!ok || createPollMutation.isPending || updatePollMutation.isPending}
              style={[styles.headerBtn, (!ok || createPollMutation.isPending || updatePollMutation.isPending) && styles.headerBtnDis]}
            >
              {createPollMutation.isPending || updatePollMutation.isPending ? (
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
          contentContainerStyle={{ padding: 20, paddingBottom: 100, width: '100%', alignSelf: 'stretch' }}
          showsVerticalScrollIndicator={false}
        >
          {!showDetailsStep ? (
            <View style={styles.groupStep}>
              <Text style={styles.groupStepHint}>Which group is this poll for?</Text>
              {!groupsDataReady ? (
                <ActivityIndicator color={Colors.textSub} style={{ marginTop: 24 }} />
              ) : eventEligibleGroups.length === 0 ? (
                <Text style={styles.groupStepEmpty}>Join a group before creating a poll.</Text>
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
            {!selectedGroupEligible && selectedGroup ? (
              <Text style={styles.deadlineHint}>Pending groups cannot create polls yet.</Text>
            ) : null}
          </Field>

          <Field label="Poll name" required>
            <TextInput
              value={form.title}
              onChangeText={(v) => set('title', v)}
              placeholder="e.g. Where should we eat?"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
            />
          </Field>

          <Field label="Description">
            <View style={styles.descBox}>
              <TextInput
                value={form.description}
                onChangeText={(v) => set('description', v)}
                placeholder="Context, rules, or details"
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={4}
                maxLength={500}
                style={styles.descInput}
              />
              <Text style={styles.descCount}>{form.description.length}/500</Text>
            </View>
          </Field>

          <Field label="Deadline" required>
            {Platform.OS === 'web' ? (
              <View style={styles.deadlineWebRow}>
                <input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate((e.target.value || '').trim())}
                  style={webPollDatetimeInputStyle()}
                />
                <input
                  type="time"
                  value={deadlineTime}
                  onChange={(e) => setDeadlineTime((e.target.value || '').trim())}
                  style={webPollDatetimeInputStyle()}
                />
              </View>
            ) : (
              <View style={styles.dtRow}>
                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS === 'ios') {
                      const d = deadlineDate ? new Date(`${deadlineDate}T12:00:00`) : new Date();
                      setIosDeadlineDateDraft(Number.isFinite(d.getTime()) ? d : new Date());
                    }
                    setShowDeadlineDatePicker(true);
                  }}
                  style={styles.dtTouch}
                >
                  <Text style={styles.dtLabel}>Date</Text>
                  <Text style={styles.dtValue}>{deadlineDate || 'Select'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS === 'ios') {
                      const [h, m] = deadlineTime.split(':').map(Number);
                      const x = new Date();
                      x.setHours(h || 0, m || 0, 0, 0);
                      setIosDeadlineTimeDraft(x);
                    }
                    setShowDeadlineTimePicker(true);
                  }}
                  style={styles.dtTouch}
                >
                  <Text style={styles.dtLabel}>Time</Text>
                  <Text style={styles.dtValue}>{deadlineTime || 'Select'}</Text>
                </TouchableOpacity>
              </View>
            )}
            {Platform.OS === 'android' && showDeadlineDatePicker ? (
              <DateTimePicker
                value={deadlineDate ? new Date(`${deadlineDate}T12:00:00`) : new Date()}
                mode="date"
                display="default"
                onChange={(_, d) => {
                  setShowDeadlineDatePicker(false);
                  if (d) setDeadlineDate(formatLocalDateInput(d));
                }}
              />
            ) : null}
            {Platform.OS === 'android' && showDeadlineTimePicker ? (
              <DateTimePicker
                value={(() => {
                  const [h, m] = deadlineTime.split(':').map(Number);
                  const x = new Date();
                  x.setHours(h || 0, m || 0, 0, 0);
                  return x;
                })()}
                mode="time"
                display="default"
                onChange={(_, d) => {
                  setShowDeadlineTimePicker(false);
                  if (d) {
                    const hh = String(d.getHours()).padStart(2, '0');
                    const mm = String(d.getMinutes()).padStart(2, '0');
                    setDeadlineTime(`${hh}:${mm}`);
                  }
                }}
              />
            ) : null}
          </Field>
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
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ borderBottomWidth: 1, borderBottomColor: Colors.border }}
                  contentContainerStyle={{ gap: 4, padding: 10 }}
                >
                  {form.coverPhotoDrafts.map((d, i) => (
                    <View key={`${i}-${coverPhotoDraftDisplayUri(d)}`} style={{ position: 'relative' }}>
                      <ResolvableImage
                        storedUrl={coverPhotoDraftDisplayUri(d)}
                        treatAsVideo={coverPhotoDraftIsVideo(d)}
                        style={{ width: 80, height: 80, borderRadius: Radius.lg }}
                        resizeMode="cover"
                      />
                      <TouchableOpacity onPress={() => removeCoverPhotoAt(i)} style={styles.removeThumb}>
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

          <Field label="Questions" required>
            <Text style={styles.optionsHint}>
              Choice questions need at least 2 options. Text questions accept free-form answers.
            </Text>
            {questionDrafts.map((q, qIndex) => (
              <View key={q.id} style={styles.optionCard}>
                <View style={styles.optionHeader}>
                  <Text style={styles.optionIndex}>Question {qIndex + 1}</Text>
                  <View style={styles.kindChips}>
                    <TouchableOpacity
                      onPress={() => updateQuestion(q.id, { type: 'choice' })}
                      style={[styles.kindChip, q.type === 'choice' && styles.kindChipOn]}
                    >
                      <Text style={[styles.kindChipText, q.type === 'choice' && styles.kindChipTextOn]}>
                        Choice
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() =>
                        updateQuestion(q.id, {
                          type: 'text',
                          multipleChoice: false,
                          enableRating: false,
                        })
                      }
                      style={[styles.kindChip, q.type === 'text' && styles.kindChipOn]}
                    >
                      <Text style={[styles.kindChipText, q.type === 'text' && styles.kindChipTextOn]}>
                        Text
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {questionDrafts.length > 1 ? (
                    <TouchableOpacity
                      onPress={() => removeQuestion(q.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={20} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ) : (
                    <View style={{ width: 24 }} />
                  )}
                </View>

                <TextInput
                  value={q.title}
                  onChangeText={(v) => updateQuestionTitle(q.id, v)}
                  placeholder="Untitled question"
                  placeholderTextColor={Colors.textMuted}
                  style={[styles.input, styles.questionTitleInput]}
                />
                {q.type === 'choice' ? (
                  <>
                    <View style={{ marginTop: 10 }}>
                      <Toggle
                        value={q.required}
                        onChange={(v) => updateQuestion(q.id, { required: v })}
                        label="Required"
                      />
                    </View>
                    <View style={{ marginTop: 10 }}>
                      <Toggle
                        value={q.anonymousVotes}
                        onChange={(v) => updateQuestion(q.id, { anonymousVotes: v })}
                        label="Anonymous vote"
                      />
                    </View>
                    <View style={{ marginTop: 10 }}>
                      <Toggle
                        value={q.multipleChoice}
                        onChange={(v) =>
                          updateQuestion(q.id, {
                            multipleChoice: v,
                            enableRating: v ? q.enableRating : false,
                          })
                        }
                        label="Multiple choice"
                      />
                    </View>
                    {q.multipleChoice ? (
                      <View style={{ marginTop: 10 }}>
                        <Toggle
                          value={q.enableRating}
                          onChange={(v) => updateQuestion(q.id, { enableRating: v })}
                          label="Enable rating"
                        />
                      </View>
                    ) : null}
                    <View style={{ gap: 8, marginTop: 10 }}>
                      {q.options.map((opt, oi) => (
                        <View key={`${q.id}-o-${oi}`} style={styles.questionOptionRow}>
                          <TextInput
                            value={opt}
                            onChangeText={(v) => updateQuestionOption(q.id, oi, v)}
                            placeholder={`Option ${oi + 1}`}
                            placeholderTextColor={Colors.textMuted}
                            style={[styles.input, { flex: 1 }]}
                          />
                          {q.options.length > 2 ? (
                            <TouchableOpacity onPress={() => removeQuestionOption(q.id, oi)} style={styles.optionRemoveBtn}>
                              <Ionicons name="close" size={14} color={Colors.textMuted} />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ))}
                    </View>

                    <TouchableOpacity onPress={() => addQuestionOption(q.id)} style={styles.addOptionBtn}>
                      <Ionicons name="add-circle-outline" size={18} color={Colors.accent} />
                      <Text style={styles.addOptionText}>Add option</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <View style={{ marginBottom: 8 }}>
                      <Toggle
                        value={q.required}
                        onChange={(v) => updateQuestion(q.id, { required: v })}
                        label="Required"
                      />
                    </View>
                    <View style={{ marginTop: 10, marginBottom: 8 }}>
                      <Toggle
                        value={q.anonymousVotes}
                        onChange={(v) => updateQuestion(q.id, { anonymousVotes: v })}
                        label="Anonymous input"
                      />
                    </View>
                    <Text style={styles.optionsHint}>Responders will submit free-form text for this question.</Text>
                  </>
                )}
              </View>
            ))}
            <TouchableOpacity onPress={addQuestion} style={styles.addOptionBtn}>
              <Ionicons name="add-circle-outline" size={20} color={Colors.accent} />
              <Text style={styles.addOptionText}>Add question</Text>
            </TouchableOpacity>
          </Field>

          <TouchableOpacity
            onPress={() => void submit()}
            style={[styles.submitBtn, (!ok || createPollMutation.isPending || updatePollMutation.isPending) && { backgroundColor: Colors.border }]}
            disabled={!ok || createPollMutation.isPending || updatePollMutation.isPending}
          >
            {createPollMutation.isPending || updatePollMutation.isPending ? (
              <ActivityIndicator color={Colors.accentFg} />
            ) : (
              <Text style={[styles.submitBtnText, !ok && { color: Colors.textMuted }]} numberOfLines={1}>
                {isEditing ? 'Save poll' : 'Create poll'}
              </Text>
            )}
          </TouchableOpacity>
            </>
          )}
        </KeyboardSafeScrollView>
        {Platform.OS === 'ios' && showDeadlineDatePicker ? (
          <Modal transparent animationType="fade" statusBarTranslucent visible {...edgeToEdgeModalProps}>
            <View style={styles.iosPickerModalRoot}>
              <Pressable
                style={[StyleSheet.absoluteFillObject, styles.iosPickerBackdrop]}
                onPress={() => {
                  setDeadlineDate(formatLocalDateInput(iosDeadlineDateDraft));
                  setShowDeadlineDatePicker(false);
                }}
              />
              <View style={styles.iosPickerModalCard}>
                <View style={styles.iosPickerHostDate}>
                  <DateTimePicker
                    value={iosDeadlineDateDraft}
                    mode="date"
                    display="inline"
                    onChange={(_, d) => {
                      if (d) setIosDeadlineDateDraft(d);
                    }}
                  />
                </View>
                <View style={styles.datePickerActions}>
                  <TouchableOpacity
                    onPress={() => {
                      setDeadlineDate(formatLocalDateInput(iosDeadlineDateDraft));
                      setShowDeadlineDatePicker(false);
                    }}
                    style={styles.datePickerBtn}
                  >
                    <Text style={styles.datePickerBtnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        ) : null}
        {Platform.OS === 'ios' && showDeadlineTimePicker ? (
          <Modal transparent animationType="fade" statusBarTranslucent visible {...edgeToEdgeModalProps}>
            <View style={styles.iosPickerModalRoot}>
              <Pressable
                style={[StyleSheet.absoluteFillObject, styles.iosPickerBackdrop]}
                onPress={() => {
                  const hh = String(iosDeadlineTimeDraft.getHours()).padStart(2, '0');
                  const mm = String(iosDeadlineTimeDraft.getMinutes()).padStart(2, '0');
                  setDeadlineTime(`${hh}:${mm}`);
                  setShowDeadlineTimePicker(false);
                }}
              />
              <View style={styles.iosPickerModalCard}>
                <View style={styles.iosPickerHostTime}>
                  <DateTimePicker
                    value={iosDeadlineTimeDraft}
                    mode="time"
                    display="spinner"
                    onChange={(_, d) => {
                      if (d) setIosDeadlineTimeDraft(d);
                    }}
                    is24Hour={false}
                  />
                </View>
                <View style={styles.datePickerActions}>
                  <TouchableOpacity
                    onPress={() => {
                      const hh = String(iosDeadlineTimeDraft.getHours()).padStart(2, '0');
                      const mm = String(iosDeadlineTimeDraft.getMinutes()).padStart(2, '0');
                      setDeadlineTime(`${hh}:${mm}`);
                      setShowDeadlineTimePicker(false);
                    }}
                    style={styles.datePickerBtn}
                  >
                    <Text style={styles.datePickerBtnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        ) : null}
      </View>
    </EventFormPopoverChrome>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1, backgroundColor: Colors.bg },
  headerBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    flexShrink: 0,
  },
  headerBtnDis: { backgroundColor: Colors.border },
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
  input: {
    padding: 10,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    fontSize: 14,
    color: Colors.text,
    fontFamily: Fonts.regular,
  },
  questionTitleInput: {
    height: 42,
    paddingVertical: 0,
  },
  descBox: {
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 12,
  },
  descInput: {
    minHeight: 88,
    fontSize: 14,
    color: Colors.text,
    fontFamily: Fonts.regular,
    textAlignVertical: 'top',
  },
  descCount: { fontSize: 11, color: Colors.textMuted, marginTop: 8, fontFamily: Fonts.regular },
  photosSection: { marginTop: 8, marginBottom: 8 },
  photosCard: {
    marginTop: 8,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  photosToolbar: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  photoBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  removeThumb: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  fontChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  fontChipOn: { borderColor: Colors.accent, backgroundColor: `${Colors.accent}22` },
  fontChipText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textSub },
  fontChipTextOn: { color: Colors.accent, fontFamily: Fonts.semiBold },
  optionsHint: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    marginBottom: 12,
    lineHeight: 18,
  },
  optionCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    padding: 14,
    marginBottom: 12,
    backgroundColor: Colors.surface,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  optionIndex: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.text, flex: 1 },
  kindChips: { flexDirection: 'row', gap: 6 },
  kindChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  kindChipOn: { borderColor: Colors.accent, backgroundColor: `${Colors.accent}18` },
  kindChipText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textSub },
  kindChipTextOn: { color: Colors.accent, fontFamily: Fonts.semiBold },
  dtRow: { flexDirection: 'row', gap: 10 },
  deadlineWebRow: { flexDirection: 'row', gap: 10 },
  dtTouch: {
    flex: 1,
    padding: 12,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  dtLabel: { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.regular, marginBottom: 4 },
  dtValue: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text },
  datePickerActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 8 },
  datePickerBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
  },
  datePickerBtnText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  iosPickerBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  iosPickerModalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  iosPickerModalCard: {
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
  iosPickerHostDate: {
    width: '100%',
    minHeight: 320,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iosPickerHostTime: {
    width: '100%',
    minHeight: 200,
    padding: 12,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  addOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  questionOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  addOptionText: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.accent },
  deadlineHint: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.notGoing, marginTop: 2 },
  settingsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
  },
  submitBtn: {
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: Radius.xl,
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  submitBtnText: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.accentFg },
});
