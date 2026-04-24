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
import Toast from 'react-native-toast-message';
import { PollOptionInputKind, type PollInput } from '@moijia/client';
import { Colors, Fonts, Radius } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, formatLocalDateInput } from '../utils/helpers';
import { localWallDateTimeToUtcIso } from '../utils/datetimeUtc';
import { NavBar, Field, Toggle, formSectionTitleStyle } from '../components/ui';
import { EventFormPopoverChrome } from '../components/EventFormPopoverChrome';
import { useGroups, useCreatePoll, useAllGroupMemberColors } from '../hooks/api';
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
import { firstSearchParam, parseReturnToParam } from '../utils/navigationReturn';

function webPollDatetimeInputStyle(): Record<string, string | number> {
  return {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1.5px solid #E5E5E5',
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

type QuestionType = 'choice' | 'text';

type QuestionDraft = {
  id: string;
  title: string;
  options: string[];
  multipleChoice: boolean;
  enableRating: boolean;
  type: QuestionType;
  anonymousVotes: boolean;
};

function newQuestionDraft(): QuestionDraft {
  return {
    id: uid(),
    title: '',
    options: ['', ''],
    multipleChoice: false,
    enableRating: false,
    type: 'choice',
    anonymousVotes: false,
  };
}

function stripForLength(s: string): number {
  const t = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length;
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
    })),
  });
}

export default function CreatePollScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const createReturnTo = useMemo(
    () => parseReturnToParam(firstSearchParam(params.returnTo)),
    [params.returnTo],
  );
  const { userId: currentUserId } = useCurrentUserContext();
  const { data: groups = [], isFetched: groupsIsFetched } = useGroups(currentUserId ?? '');
  const { data: groupColors = {} } = useAllGroupMemberColors(currentUserId || '');
  const createPollMutation = useCreatePoll(currentUserId ?? '');

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
  const [createPollBaselineSerialized, setCreatePollBaselineSerialized] = useState<string | null>(null);

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

  useEffect(() => {
    if (joinedGroups.length > 0 && !form.groupId) {
      const firstEligible = joinedGroups.find(
        (g) => g.membershipStatus === 'member' || g.membershipStatus === 'admin',
      );
      setForm((p) => ({ ...p, groupId: (firstEligible ?? joinedGroups[0])!.id }));
    }
  }, [joinedGroups, form.groupId]);

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

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
      rows.map((q) => (q.id === id ? { ...q, options: [...q.options, ''] } : q))
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
          ? { ...q, options: q.options.filter((_, i) => i !== idx) }
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
  const groupSelectHydrated = !groupsDataReady ? false : joinedGroups.length === 0 ? true : !!form.groupId;

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
    if (!createPollDirty) {
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
  }, [createPollDirty, dismiss]);

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
        coverPhotos = await uploadCoverPhotoDrafts(currentUserId, form.coverPhotoDrafts);
      } catch {
        Alert.alert('Error', 'Failed to upload photos. Try again.');
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
      const metaLabel = q.anonymousVotes ? `${typeLabel}|anon` : typeLabel;
      if (q.type === 'text') {
        return [
          {
            id: uid(),
            inputKind: PollOptionInputKind.TEXT,
            sortOrder: qi * 1000,
            textHtml: `Q${qi + 1}: ${q.title.trim()} [${metaLabel}] - __TEXT_RESPONSE__`,
          },
        ];
      }
      const cleanOptions = q.options.map((o) => o.trim()).filter((o) => o.length > 0);
      return cleanOptions.map((opt, oi) => ({
        id: uid(),
        inputKind: PollOptionInputKind.TEXT,
        sortOrder: qi * 1000 + oi,
        textHtml: `Q${qi + 1}: ${q.title.trim()} [${metaLabel}] - ${opt}`,
      }));
    });

    const body: PollInput = {
      id: uid(),
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

    try {
      await createPollMutation.mutateAsync(body);
      Toast.show({ type: 'success', text1: 'Poll created' });
      router.replace('/(tabs)/polls');
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'body' in e
          ? String((e as { body?: { error?: string } }).body?.error ?? '')
          : '';
      Alert.alert('Error', msg || 'Failed to create poll');
    }
  };

  return (
    <EventFormPopoverChrome onClose={requestClose}>
      <View style={styles.inner}>
        <NavBar
          title="New Poll"
          onClose={requestClose}
          right={
            <TouchableOpacity
              onPress={() => void submit()}
              disabled={!ok || createPollMutation.isPending}
              style={[styles.headerBtn, (!ok || createPollMutation.isPending) && styles.headerBtnDis]}
            >
              {createPollMutation.isPending ? (
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
              {joinedGroups.map((g) => {
                const userColorHex = groupColors[g.id] || getDefaultGroupThemeFromName(g.name);
                const p = getGroupColor(userColorHex);
                const sel = form.groupId === g.id;
                const pending = g.membershipStatus === 'pending';
                return (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => set('groupId', g.id)}
                    style={[
                      styles.groupChip,
                      sel && { borderColor: p.dot, backgroundColor: p.row },
                      pending && styles.groupChipPending,
                    ]}
                  >
                    <Text style={[styles.chipText, sel && { color: p.text, fontFamily: Fonts.semiBold }]}>
                      {g.name}
                      {pending ? ' (Pending)' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {!selectedGroupEligible && selectedGroup ? (
              <Text style={styles.deadlineHint}>Pending groups cannot create polls yet.</Text>
            ) : null}
          </Field>

          <Field label="Poll title" required>
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
                  onPress={() => setShowDeadlineDatePicker(true)}
                  style={styles.dtTouch}
                >
                  <Text style={styles.dtLabel}>Date</Text>
                  <Text style={styles.dtValue}>{deadlineDate || 'Select'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowDeadlineTimePicker(true)}
                  style={styles.dtTouch}
                >
                  <Text style={styles.dtLabel}>Time</Text>
                  <Text style={styles.dtValue}>{deadlineTime || 'Select'}</Text>
                </TouchableOpacity>
              </View>
            )}
            {Platform.OS !== 'web' && showDeadlineDatePicker ? (
              <DateTimePicker
                value={deadlineDate ? new Date(`${deadlineDate}T12:00:00`) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, d) => {
                  if (Platform.OS === 'android') setShowDeadlineDatePicker(false);
                  if (d) setDeadlineDate(formatLocalDateInput(d));
                }}
              />
            ) : null}
            {Platform.OS !== 'web' && showDeadlineTimePicker ? (
              <DateTimePicker
                value={(() => {
                  const [h, m] = deadlineTime.split(':').map(Number);
                  const x = new Date();
                  x.setHours(h || 0, m || 0, 0, 0);
                  return x;
                })()}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, d) => {
                  if (Platform.OS === 'android') setShowDeadlineTimePicker(false);
                  if (d) {
                    const hh = String(d.getHours()).padStart(2, '0');
                    const mm = String(d.getMinutes()).padStart(2, '0');
                    setDeadlineTime(`${hh}:${mm}`);
                  }
                }}
              />
            ) : null}
            {Platform.OS === 'ios' && (showDeadlineDatePicker || showDeadlineTimePicker) ? (
              <View style={styles.pickerDoneRow}>
                <TouchableOpacity
                  onPress={() => {
                    setShowDeadlineDatePicker(false);
                    setShowDeadlineTimePicker(false);
                  }}
                  style={styles.pickerDoneBtn}
                >
                  <Text style={styles.pickerDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </Field>
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
                  style={styles.input}
                />
                {q.type === 'choice' ? (
                  <>
                    <View style={{ marginTop: 10 }}>
                      <Toggle
                        value={q.anonymousVotes}
                        onChange={(v) => updateQuestion(q.id, { anonymousVotes: v })}
                        label="Enable anonymous vote"
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
                        label="Enable multiple choice"
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
                    <View style={{ marginTop: 10, marginBottom: 8 }}>
                      <Toggle
                        value={q.anonymousVotes}
                        onChange={(v) => updateQuestion(q.id, { anonymousVotes: v })}
                        label="Enable anonymous vote"
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
            style={[styles.submitBtn, (!ok || createPollMutation.isPending) && { backgroundColor: Colors.border }]}
            disabled={!ok || createPollMutation.isPending}
          >
            {createPollMutation.isPending ? (
              <ActivityIndicator color={Colors.accentFg} />
            ) : (
              <Text style={[styles.submitBtnText, !ok && { color: Colors.textMuted }]} numberOfLines={1}>
                Create poll
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
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
  groupChip: {
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
  groupChipPending: {
    opacity: 0.72,
  },
  chipText: { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.regular },
  input: {
    padding: 10,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    fontSize: 14,
    color: Colors.text,
    fontFamily: Fonts.regular,
  },
  descBox: {
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
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
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  dtLabel: { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.regular, marginBottom: 4 },
  dtValue: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text },
  pickerDoneRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  pickerDoneBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
  },
  pickerDoneText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
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
