import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter, usePathname, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Radius } from '../../constants/theme';
import { EventFormPopoverChrome } from '../../components/EventFormPopoverChrome';
import { modalTopBarStyles } from '../../components/modalTopBarStyles';
import { formSectionTitleStyle } from '../../components/ui';
import {
  usePoll,
  usePollResults,
  useSubmitPollVote,
  useDeletePoll,
  useClosePoll,
  useSetPollWatch,
  usePollOptionSuggestions,
  useSuggestPollOption,
  useDecidePollOptionSuggestion,
  useGroup,
  useAllGroupMemberColors,
} from '../../hooks/api';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';
import { firstSearchParam, parseReturnToParam, withReturnTo } from '../../utils/navigationReturn';
import { PollOptionInputKind, type Poll } from '@moijia/client';
import { ResolvableImage } from '../../components/ResolvableImage';
import { avatarColor, getDefaultGroupThemeFromName, getGroupColor } from '../../utils/helpers';

const MAX_OPTIONS_PER_QUESTION = 50;

function stripHtmlPreview(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type ParsedQuestionType = 'single' | 'multiple' | 'rating' | 'text';
type ParsedQuestion = {
  key: string;
  index: number;
  title: string;
  type: ParsedQuestionType;
  anonymousVotes: boolean;
  /** From option metadata `[Type|req]` */
  required: boolean;
  options: Array<{ id: string; label: string }>;
};

function parseQuestionType(raw: string): ParsedQuestionType {
  const t = raw.trim().toLowerCase();
  if (t.includes('text')) return 'text';
  if (t.includes('multiple')) return 'multiple';
  if (t.includes('rating')) return 'rating';
  return 'single';
}

function parseStructuredPollQuestions(poll: NonNullable<ReturnType<typeof usePoll>['data']>): ParsedQuestion[] {
  const map = new Map<string, ParsedQuestion>();
  const sorted = poll.options.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const re = /^Q(\d+):\s*(.*?)\s*\[(.*?)\]\s*-\s*(.*)$/i;
  for (const o of sorted) {
    const text =
      o.inputKind === PollOptionInputKind.DATETIME
        ? o.dateTimeValue
          ? new Date(o.dateTimeValue).toLocaleString()
          : '—'
        : stripHtmlPreview(o.textHtml ?? '');
    const m = text.match(re);
    if (!m) {
      const key = 'fallback';
      if (!map.has(key)) {
        map.set(key, {
          key,
          index: 1,
          title: poll.title,
          type: 'single',
          anonymousVotes: false,
          required: false,
          options: [],
        });
      }
      map.get(key)!.options.push({ id: o.id, label: text || '—' });
      continue;
    }
    const idx = Number(m[1]);
    const title = m[2].trim();
    const rawType = m[3].trim().toLowerCase();
    const typeTokens = rawType.split('|').map((t) => t.trim());
    const qType = parseQuestionType(rawType);
    const anonymousVotes = typeTokens.includes('anon');
    const required = typeTokens.includes('req') || typeTokens.includes('required');
    const optionLabel = m[4].trim();
    const key = `q-${idx}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        index: idx,
        title,
        type: qType,
        anonymousVotes,
        required,
        options: [],
      });
    }
    map.get(key)!.anonymousVotes = map.get(key)!.anonymousVotes || anonymousVotes;
    map.get(key)!.required = map.get(key)!.required || required;
    if (qType !== 'text') {
      map.get(key)!.options.push({ id: o.id, label: optionLabel || '—' });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.index - b.index);
}

function isRequiredQuestionAnswered(
  q: ParsedQuestion,
  selectedByQuestion: Record<string, string[]>,
  textAnswerByQuestion: Record<string, string>,
): boolean {
  if (!q.required) return true;
  if (q.type === 'text') {
    return (textAnswerByQuestion[q.key] ?? '').trim().length > 0;
  }
  const sel = selectedByQuestion[q.key] ?? [];
  if (q.type === 'rating') {
    return sel.length > 0;
  }
  return sel.length > 0;
}

function rankingBadgePlace(
  options: Array<{ optionId: string; votes: number }> | undefined,
  optionId: string,
): 1 | 2 | 3 | null {
  if (!options || options.length === 0) return null;
  const positives = options.map((o) => o.votes).filter((v) => v > 0);
  if (positives.length === 0) return null;
  const uniqueSorted = Array.from(new Set(positives)).sort((a, b) => a - b);
  const score = options.find((o) => o.optionId === optionId)?.votes ?? 0;
  if (score <= 0) return null;
  const place = uniqueSorted.findIndex((v) => v === score) + 1;
  return place >= 1 && place <= 3 ? (place as 1 | 2 | 3) : null;
}

export default function PollDetailScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { id: rawId, returnTo } = useLocalSearchParams<{ id?: string | string[]; returnTo?: string | string[] }>();
  const id = useMemo(() => firstSearchParam(rawId), [rawId]);
  const returnToParsed = useMemo(() => parseReturnToParam(firstSearchParam(returnTo)), [returnTo]);
  const { userId } = useCurrentUserContext();
  const { data: poll, isLoading, isError } = usePoll(id ?? '', userId ?? '');
  const { data: results, refetch: refetchResults } = usePollResults(id ?? '', userId ?? '', {
    enabled: !isError,
  });
  const { data: group } = useGroup(poll?.groupId ?? '', userId ?? '', { enabled: !isError });
  const { data: groupColors = {} } = useAllGroupMemberColors(userId ?? '');
  const submitVoteMutation = useSubmitPollVote(id ?? '', userId ?? '');
  const deletePollMutation = useDeletePoll(userId ?? '');
  const closePollMutation = useClosePoll(userId ?? '');
  const setWatchMutation = useSetPollWatch(id ?? '', userId ?? undefined);
  const isPollCreator = !!(poll && userId && poll.createdBy === userId);
  const { data: optionSuggestions = [] } = usePollOptionSuggestions(id ?? '', userId ?? '', !!userId && !isError);
  const suggestOptionMutation = useSuggestPollOption(id ?? '', userId ?? '');
  const decideSuggestionMutation = useDecidePollOptionSuggestion(id ?? '', userId ?? '');
  const [selectedByQuestion, setSelectedByQuestion] = useState<Record<string, string[]>>({});
  const [textAnswerByQuestion, setTextAnswerByQuestion] = useState<Record<string, string>>({});
  /** After a saved vote, answers are read-only until user taps "Update answer". */
  const [editingSavedAnswer, setEditingSavedAnswer] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const savedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [detailModal, setDetailModal] = useState<{
    title: string;
    rows: Array<{
      responder: string;
      answer?: string;
      userId?: string;
      anonymous?: boolean;
    }>;
  } | null>(null);
  /** Question keys that failed required validation (yellow outline until fixed). */
  const [missingRequiredKeys, setMissingRequiredKeys] = useState<string[]>([]);
  const [suggestModal, setSuggestModal] = useState<{ questionKey: string; title: string } | null>(null);
  const [suggestLabelDraft, setSuggestLabelDraft] = useState('');
  const [suggestedSuccessQuestionKey, setSuggestedSuccessQuestionKey] = useState<string | null>(null);
  const suggestSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const pollWrapYRef = useRef(0);
  const pollCardYRef = useRef(0);
  const questionYInCardRef = useRef<Record<string, number>>({});
  const parsedQuestions = useMemo(() => (poll ? parseStructuredPollQuestions(poll) : []), [poll]);


  const hasSavedVote = useMemo(() => {
    if (!results) return false;
    if (results.myOptionIds.length > 0) return true;
    if (!userId) return false;
    for (const rq of results.questions) {
      if (rq.textResponses?.some((t) => t.userId === userId)) return true;
    }
    return false;
  }, [results, userId]);

  const watchDefaultForViewer = poll ? !!poll.viewerWatchDefault : false;
  const effectiveWatching = poll ? (poll.viewerWatching ?? watchDefaultForViewer) : false;
  const answersEditable = !hasSavedVote || editingSavedAnswer;

  const palette = useMemo(() => {
    if (!poll) return getGroupColor(getDefaultGroupThemeFromName('Group'));
    const hex = groupColors[poll.groupId] || getDefaultGroupThemeFromName(group?.name ?? 'Group');
    return getGroupColor(hex);
  }, [poll, group?.name, groupColors]);

  const canDeletePoll = useMemo(() => {
    if (!poll || !userId) return false;
    if (poll.createdBy === userId) return true;
    return group?.membershipStatus === 'admin' || group?.superAdminId === userId;
  }, [poll, userId, group?.membershipStatus, group?.superAdminId]);
  const isPollClosed = useMemo(() => !!poll?.closedAt, [poll?.closedAt]);
  const canEditPoll = useMemo(
    () => !!poll && !!userId && poll.createdBy === userId && !isPollClosed,
    [poll, userId, isPollClosed],
  );
  const canClosePoll = useMemo(() => {
    if (!poll || !userId || isPollClosed) return false;
    if (poll.createdBy === userId) return true;
    return group?.membershipStatus === 'admin' || group?.superAdminId === userId;
  }, [poll, userId, group?.membershipStatus, group?.superAdminId, isPollClosed]);
  const acceptedSuggestionByQuestionLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of optionSuggestions) {
      if (s.status !== 'accepted') continue;
      const key = `${s.questionKey}::${s.label.trim().toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, (s.suggesterName || 'Member').trim() || 'Member');
      }
    }
    return map;
  }, [optionSuggestions]);

  useEffect(() => {
    setEditingSavedAnswer(false);
    setShowSavedToast(false);
    setMissingRequiredKeys([]);
    questionYInCardRef.current = {};
    if (savedToastTimerRef.current) {
      clearTimeout(savedToastTimerRef.current);
      savedToastTimerRef.current = null;
    }
  }, [id]);

  const triggerSavedToast = useCallback(() => {
    setShowSavedToast(true);
    if (savedToastTimerRef.current) clearTimeout(savedToastTimerRef.current);
    savedToastTimerRef.current = setTimeout(() => {
      setShowSavedToast(false);
      savedToastTimerRef.current = null;
    }, 1400);
  }, []);

  useEffect(() => {
    return () => {
      if (savedToastTimerRef.current) clearTimeout(savedToastTimerRef.current);
      if (suggestSuccessTimerRef.current) clearTimeout(suggestSuccessTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setMissingRequiredKeys((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.filter((key) => {
        const q = parsedQuestions.find((pq) => pq.key === key);
        return !!(q && !isRequiredQuestionAnswered(q, selectedByQuestion, textAnswerByQuestion));
      });
      if (next.length === prev.length && next.every((k) => prev.includes(k))) return prev;
      return next;
    });
  }, [parsedQuestions, selectedByQuestion, textAnswerByQuestion]);

  useEffect(() => {
    if (!results || parsedQuestions.length === 0) return;
    const next: Record<string, string[]> = {};
    for (const q of parsedQuestions) {
      const inQuestion = q.options.map((o) => o.id);
      next[q.key] = results.myOptionIds.filter((oid) => inQuestion.includes(oid));
    }
    setSelectedByQuestion(next);
  }, [results, parsedQuestions]);

  useEffect(() => {
    if (!results || parsedQuestions.length === 0 || answersEditable || !userId) return;
    setTextAnswerByQuestion((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const q of parsedQuestions) {
        if (q.type !== 'text') continue;
        const mine = results.questions
          .find((rq) => rq.questionKey === q.key)
          ?.textResponses?.find((t) => t.userId === userId);
        if (mine && next[q.key] !== mine.answer) {
          next[q.key] = mine.answer;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [results, parsedQuestions, answersEditable, userId]);

  const dismiss = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (returnToParsed) {
      router.replace(returnToParsed as Href);
      return;
    }
    router.replace('/(tabs)/events');
  };

  const onDeletePoll = useCallback(() => {
    if (!id || !userId) return;
    const run = async () => {
      try {
        await deletePollMutation.mutateAsync(id);
        router.replace('/(tabs)/polls');
      } catch (e: unknown) {
        const err = e as { body?: { message?: string }; message?: string };
        Alert.alert('Could not delete poll', err?.body?.message || err?.message || 'Please try again.');
      }
    };
    const message = 'This poll and its votes will be removed for everyone in the group.';
    Alert.alert('Delete this poll?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run() },
    ]);
  }, [deletePollMutation, id, router, userId]);

  const onClosePoll = useCallback(() => {
    if (!id || !userId) return;
    const run = async () => {
      try {
        await closePollMutation.mutateAsync(id);
      } catch (e: unknown) {
        const err = e as { body?: { message?: string }; message?: string };
        Alert.alert('Could not close poll', err?.body?.message || err?.message || 'Please try again.');
      }
    };
    Alert.alert('Close this poll?', 'Closing a poll ends voting immediately.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close poll', style: 'destructive', onPress: () => void run() },
    ]);
  }, [closePollMutation, id, userId]);

  const deadlineLabel = useMemo(() => {
    if (!poll?.deadline) return '';
    try {
      return new Date(poll.deadline).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return String(poll.deadline);
    }
  }, [poll?.deadline]);

  return (
    <EventFormPopoverChrome onClose={dismiss}>
      <View style={styles.safe}>
        <View style={modalTopBarStyles.bar}>
          <TouchableOpacity
            onPress={dismiss}
            style={modalTopBarStyles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={26} color={Colors.textSub} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          {userId ? (
            <TouchableOpacity
              onPress={async () => {
                try {
                  await setWatchMutation.mutateAsync({ watching: !effectiveWatching });
                } catch (e: unknown) {
                  const err = e as { body?: { message?: string }; message?: string };
                  Alert.alert(
                    'Could not update poll notifications',
                    err?.body?.message || err?.message || 'Please try again.',
                  );
                }
              }}
              disabled={setWatchMutation.isPending}
              style={[modalTopBarStyles.trailingIconTap, { marginRight: 8 }]}
              accessibilityRole="button"
              accessibilityLabel={
                effectiveWatching
                  ? 'Watching this poll — tap to stop default notifications'
                  : 'Not watching — tap to get default poll notifications'
              }
            >
              <Ionicons
                name={effectiveWatching ? 'eye' : 'eye-off-outline'}
                size={22}
                color={effectiveWatching ? Colors.accent : Colors.textSub}
              />
            </TouchableOpacity>
          ) : null}
          {canEditPoll && id ? (
            <TouchableOpacity
              onPress={() => router.push(withReturnTo(`/create-poll?editId=${encodeURIComponent(id)}`, pathname))}
              style={[modalTopBarStyles.trailingIconTap, { marginRight: 8 }]}
              accessibilityRole="button"
              accessibilityLabel="Edit poll"
            >
              <Ionicons name="pencil-outline" size={21} color={Colors.textSub} />
            </TouchableOpacity>
          ) : null}
          {canDeletePoll ? (
            <TouchableOpacity
              onPress={onDeletePoll}
              disabled={deletePollMutation.isPending}
              style={[modalTopBarStyles.trailingIconTap, { marginRight: 8 }]}
              accessibilityRole="button"
              accessibilityLabel="Delete poll"
            >
              <Ionicons name="trash-outline" size={20} color={Colors.text} />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.eventScrollView}
          contentContainerStyle={styles.eventScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {!id || !userId ? (
            <Text style={styles.muted}>Missing poll or user.</Text>
          ) : isLoading ? (
            <ActivityIndicator color={Colors.accent} style={{ marginTop: 24 }} />
          ) : isError || !poll ? (
            <Text style={styles.muted}>Could not load this poll.</Text>
          ) : (
            <View
              style={styles.eventMainCardWrap}
              onLayout={(e) => {
                pollWrapYRef.current = e.nativeEvent.layout.y;
              }}
            >
              <View
                style={styles.eventMainCard}
                onLayout={(e) => {
                  pollCardYRef.current = e.nativeEvent.layout.y;
                }}
              >
                <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
                  <TouchableOpacity
                    style={styles.groupChipAboveTitle}
                    onPress={() => router.push(withReturnTo(`/(tabs)/groups/${poll.groupId}`, pathname))}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.groupDot, { backgroundColor: palette.dot }]} />
                    <Text style={styles.navGroupName} numberOfLines={1}>
                      {group?.name ?? 'Group'}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginTop: 1 }} />
                  </TouchableOpacity>
                  <Text style={styles.eventTitle}>{poll.title}</Text>
                  {poll.description?.trim() ? (
                    <View style={[styles.descBox, { marginTop: 10 }]}>
                      <Text style={styles.descText}>{poll.description.trim()}</Text>
                    </View>
                  ) : null}
                </View>

                {poll.coverPhotos && poll.coverPhotos.length > 0 ? (
                  <View style={{ marginTop: poll.description?.trim() ? 4 : 10 }}>
                    <View style={{ paddingHorizontal: 16 }}>
                      <Text style={formSectionTitleStyle}>Photos · {poll.coverPhotos.length}</Text>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}
                    >
                      {poll.coverPhotos.map((url) => (
                        <ResolvableImage
                          key={url}
                          storedUrl={url}
                          style={{ width: 88, height: 88, borderRadius: Radius.lg }}
                          resizeMode="cover"
                        />
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                <View style={{ paddingHorizontal: 16, marginTop: 14, marginBottom: 4 }}>
                  <View style={styles.deadlineRow}>
                    <Ionicons name="calendar-outline" size={20} color={Colors.textSub} style={{ width: 22, marginTop: 1 }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[formSectionTitleStyle, { marginBottom: 4 }]}>Deadline</Text>
                      <Text style={styles.deadlineValue}>{deadlineLabel}</Text>
                    </View>
                  </View>
                  <View style={styles.createdByRow}>
                    <Ionicons name="person-outline" size={20} color={Colors.textSub} style={{ width: 22, marginTop: 1 }} />
                    <Text style={styles.createdByText}>
                      Created by {((poll as Poll & { createdByName?: string }).createdByName?.trim()) || poll.createdBy}
                    </Text>
                  </View>
                </View>

                <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
                  <Text style={formSectionTitleStyle}>Questions</Text>
                </View>

                {parsedQuestions.map((q, qIdx) => {
                  const showTextInput = q.type === 'text' && answersEditable;
                  const showRequiredHighlight = missingRequiredKeys.includes(q.key);
                  const questionMeta: string[] = [];
                  if (q.type === 'multiple') questionMeta.push('Multiple choice');
                  if (q.anonymousVotes) questionMeta.push('Anonymous');
                  const resultQuestion = results?.questions.find((rq) => rq.questionKey === q.key);
                  const optionBaseOrder = new Map(q.options.map((o, i) => [o.id, i]));
                  const optionsForDisplay =
                    q.type === 'rating' && resultQuestion
                      ? [...q.options].sort((a, b) => {
                          const aRes = resultQuestion.options.find((ro) => ro.optionId === a.id);
                          const bRes = resultQuestion.options.find((ro) => ro.optionId === b.id);
                          const aHas = !!aRes && (aRes.responseCount ?? 0) > 0;
                          const bHas = !!bRes && (bRes.responseCount ?? 0) > 0;
                          if (aHas && bHas) {
                            const byAvgRank = (aRes!.votes ?? 0) - (bRes!.votes ?? 0); // lower avg rank = better
                            if (byAvgRank !== 0) return byAvgRank;
                            const byResponses = (bRes!.responseCount ?? 0) - (aRes!.responseCount ?? 0);
                            if (byResponses !== 0) return byResponses;
                          } else if (aHas !== bHas) {
                            return aHas ? -1 : 1;
                          }
                          return (optionBaseOrder.get(a.id) ?? 0) - (optionBaseOrder.get(b.id) ?? 0);
                        })
                      : q.options;
                  return (
                  <View
                    key={q.key}
                    onLayout={(e) => {
                      questionYInCardRef.current[q.key] = e.nativeEvent.layout.y;
                    }}
                    style={[
                      styles.pollQBlock,
                      qIdx > 0 && !showRequiredHighlight && styles.pollQBlockBorder,
                      showRequiredHighlight && styles.pollQBlockMissing,
                    ]}
                  >
                    <View style={styles.questionHeader}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.questionTitle}>
                          {q.index}. {q.title}
                          {q.required ? <Text style={styles.questionRequiredStar}> *</Text> : null}
                        </Text>
                        {questionMeta.length > 0 ? (
                          <Text style={[styles.questionMetaText, { color: palette.text, opacity: 0.7 }]}>
                            {questionMeta.join(' · ')}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={{ gap: 8 }}>
                      {q.type === 'text' ? (
                        <>
                          {showTextInput ? (
                          <TextInput
                            value={textAnswerByQuestion[q.key] ?? ''}
                            onChangeText={(v) =>
                              setTextAnswerByQuestion((prev) => ({
                                ...prev,
                                [q.key]: v.replace(/\r\n|\r|\n/g, ' '),
                              }))
                            }
                            placeholder="Type your answer"
                            placeholderTextColor={Colors.textMuted}
                            style={[
                              styles.textAnswerInput,
                              showRequiredHighlight && styles.textAnswerInputMissing,
                            ]}
                            editable={answersEditable}
                            numberOfLines={1}
                            returnKeyType="done"
                            blurOnSubmit
                          />
                          ) : (
                            <Text
                              style={[
                                styles.textAnswerReadOnly,
                                showRequiredHighlight && styles.textAnswerReadOnlyMissing,
                              ]}
                            >
                              {(textAnswerByQuestion[q.key] ?? '').trim() || '—'}
                            </Text>
                          )}
                          {results ? (
                            <TouchableOpacity
                              style={styles.textResponseBtn}
                              onPress={() => {
                                const resultQuestion = results?.questions.find((rq) => rq.questionKey === q.key);
                                if (!resultQuestion) return;
                                const rows =
                                  resultQuestion.textResponses?.map((r) => ({
                                    responder: r.userName,
                                    answer: r.answer,
                                    userId: r.userId,
                                    anonymous: false,
                                  })) ?? [];
                                setDetailModal({
                                  title: `${q.title} responses`,
                                  rows,
                                });
                              }}
                            >
                              <Text style={styles.textResponseBtnText}>
                                {results?.questions.find((rq) => rq.questionKey === q.key)?.textResponseCount ?? 0}{' '}
                                responded
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </>
                      ) : null}
                      {optionsForDisplay.map((opt) => {
                        const sel = selectedByQuestion[q.key] ?? [];
                        const selected = sel.includes(opt.id);
                        const rank = selected ? sel.indexOf(opt.id) + 1 : 0;
                        const suggestedBy = acceptedSuggestionByQuestionLabel.get(
                          `${q.key}::${opt.label.trim().toLowerCase()}`,
                        );
                        const resultOption = resultQuestion?.options.find((ro) => ro.optionId === opt.id);
                        const questionAnonymous = !!(poll.anonymousVotes || resultQuestion?.anonymousVotes);
                        const rankingVoterCount =
                          q.type === 'rating' ? (resultOption?.responseCount ?? (resultOption?.voters?.length ?? 0)) : 0;
                        const rankingPlace =
                          q.type === 'rating'
                            ? rankingBadgePlace(resultQuestion?.options, opt.id)
                            : null;
                        const rankingLabel =
                          rankingPlace === 1 ? '1st' : rankingPlace === 2 ? '2nd' : rankingPlace === 3 ? '3rd' : '';
                        const rankingVotersSorted = (resultOption?.voters ?? [])
                          .slice()
                          .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));
                        const rankingVotersVisible = rankingVotersSorted.slice(0, 5);
                        const rankingVotersOverflow = Math.max(0, rankingVotersSorted.length - rankingVotersVisible.length);
                        const openRankingDetails = () => {
                          if (questionAnonymous) return;
                          setDetailModal({
                            title: opt.label,
                            rows: (resultOption?.voters ?? [])
                              .slice()
                              .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))
                              .map((v) => ({
                                responder: v.userName,
                                answer: `#${v.rank ?? '—'}`,
                                userId: v.userId,
                                anonymous: false,
                              })),
                          });
                        };
                        return (
                          <TouchableOpacity
                            key={opt.id}
                            style={[
                              styles.voteOptionRow,
                              selected && styles.voteOptionRowSelected,
                              selected && { borderColor: palette.cal, backgroundColor: palette.row },
                            ]}
                            disabled={!answersEditable}
                            onPress={() => {
                              if (!answersEditable) return;
                              setSelectedByQuestion((prev) => {
                                const before = prev[q.key] ?? [];
                                if (q.type === 'multiple' || q.type === 'rating') {
                                  const next = before.includes(opt.id)
                                    ? before.filter((oid) => oid !== opt.id)
                                    : [...before, opt.id];
                                  return { ...prev, [q.key]: next };
                                }
                                // Single choice: tapping selected option again clears selection.
                                if (before.includes(opt.id)) {
                                  return { ...prev, [q.key]: [] };
                                }
                                return { ...prev, [q.key]: [opt.id] };
                              });
                            }}
                            activeOpacity={0.75}
                          >
                            {answersEditable ? (
                              q.type === 'rating' ? (
                                <View
                                  style={[
                                    styles.voteIndicator,
                                    selected && styles.voteIndicatorSelected,
                                    selected && { borderColor: palette.cal, backgroundColor: palette.cal },
                                  ]}
                                >
                                  {selected ? <Text style={styles.voteIndicatorRank}>{rank}</Text> : null}
                                </View>
                              ) : (
                                <View
                                  style={[
                                    styles.voteRadioOuter,
                                    selected && styles.voteRadioOuterSelected,
                                    selected && { borderColor: palette.cal },
                                  ]}
                                >
                                  {selected ? <View style={[styles.voteRadioInner, { backgroundColor: palette.cal }]} /> : null}
                                </View>
                              )
                            ) : null}
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <View style={styles.optionTopRow}>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={styles.voteOptionText}>
                                    {opt.label}
                                    {suggestedBy ? <Text style={styles.suggestedByInlineText}> · by {suggestedBy}</Text> : null}
                                  </Text>
                                </View>
                                {rankingPlace ? (
                                  <View
                                    style={[
                                      styles.rankBadge,
                                      rankingPlace === 1
                                        ? styles.rankBadgeGold
                                        : rankingPlace === 2
                                          ? styles.rankBadgeSilver
                                          : styles.rankBadgeBronze,
                                    ]}
                                  >
                                    <Text style={styles.rankBadgeText}>{rankingLabel}</Text>
                                  </View>
                                ) : null}
                              </View>
                              {results && resultOption ? (
                                <View style={styles.resultWrap}>
                                  {q.type === 'rating' ? (
                                    <>
                                      <View style={styles.rankingVotesRow}>
                                        <TouchableOpacity
                                          style={styles.rankingThumbsWrap}
                                          disabled={rankingVoterCount === 0 || questionAnonymous}
                                          onPress={openRankingDetails}
                                        >
                                          {rankingVotersVisible.map((v, idx) => {
                                            const initial = (v.userName || '?').trim().charAt(0).toUpperCase() || '?';
                                            return (
                                              <View
                                                key={`${v.userId}-${v.rank ?? idx}`}
                                                style={[
                                                  styles.rankingThumb,
                                                  idx > 0 && styles.rankingThumbOverlap,
                                                  { zIndex: rankingVotersVisible.length - idx },
                                                  { backgroundColor: avatarColor(v.userName || v.userId) },
                                                ]}
                                              >
                                                <Text style={styles.rankingThumbInitial}>{initial}</Text>
                                                <View style={styles.rankingThumbRankBadge}>
                                                  <Text style={styles.rankingThumbRankText}>{v.rank ?? idx + 1}</Text>
                                                </View>
                                              </View>
                                            );
                                          })}
                                          {rankingVotersOverflow > 0 ? (
                                            <View
                                              style={[
                                                styles.rankingThumbOverflow,
                                                rankingVotersVisible.length > 0 && styles.rankingThumbOverlap,
                                                { zIndex: 0 },
                                              ]}
                                            >
                                              <Text style={styles.rankingThumbOverflowText}>+{rankingVotersOverflow}</Text>
                                            </View>
                                          ) : null}
                                        </TouchableOpacity>
                                        {questionAnonymous ? (
                                          <Text style={styles.resultText}>{rankingVoterCount} votes</Text>
                                        ) : (
                                          <TouchableOpacity
                                            disabled={rankingVoterCount === 0}
                                            onPress={openRankingDetails}
                                          >
                                            <Text
                                              style={[
                                                styles.resultText,
                                                rankingVoterCount > 0 && styles.resultTextLink,
                                              ]}
                                            >
                                              {rankingVoterCount} votes
                                            </Text>
                                          </TouchableOpacity>
                                        )}
                                      </View>
                                    </>
                                  ) : (
                                    <>
                                      <View style={styles.resultTrack}>
                                        <View
                                          style={[
                                            styles.resultFill,
                                            { width: `${resultOption.pct}%`, backgroundColor: palette.label },
                                          ]}
                                        />
                                      </View>
                                      {questionAnonymous ? (
                                        <Text style={styles.resultText}>
                                          {resultOption.votes} votes ({resultOption.pct}%)
                                        </Text>
                                      ) : (
                                        <TouchableOpacity
                                          onPress={() =>
                                            setDetailModal({
                                              title: opt.label,
                                              rows: (resultOption.voters ?? []).map((v) => ({
                                                responder: v.userName,
                                                userId: v.userId,
                                                anonymous: false,
                                              })),
                                            })
                                          }
                                        >
                                          <Text style={[styles.resultText, styles.resultTextLink]}>
                                            {resultOption.votes} votes ({resultOption.pct}%)
                                          </Text>
                                        </TouchableOpacity>
                                      )}
                                    </>
                                  )}
                                </View>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                      {q.type !== 'text' ? (
                        <TouchableOpacity
                          style={[
                            styles.suggestOptionBtn,
                            (!userId || isPollClosed || suggestOptionMutation.isPending) && styles.suggestOptionBtnDisabled,
                          ]}
                          onPress={() => {
                            if (!userId || isPollClosed || suggestOptionMutation.isPending) return;
                            if (q.options.length >= MAX_OPTIONS_PER_QUESTION) {
                              Alert.alert(
                                'Option limit reached',
                                `This question already has ${MAX_OPTIONS_PER_QUESTION} options.`,
                              );
                              return;
                            }
                            setSuggestLabelDraft('');
                            setSuggestModal({ questionKey: q.key, title: q.title });
                          }}
                          disabled={!userId || isPollClosed || suggestOptionMutation.isPending}
                          accessibilityRole="button"
                          accessibilityLabel="Suggest a new option for this question"
                        >
                          <Ionicons name="add-circle-outline" size={18} color={palette.text} />
                          <Text style={[styles.suggestOptionBtnText, { color: palette.text }]}>Suggest option</Text>
                        </TouchableOpacity>
                      ) : null}
                      {suggestedSuccessQuestionKey === q.key ? (
                        <Text style={styles.suggestSuccessText}>Option submitted successfully.</Text>
                      ) : null}
                      {isPollCreator && q.type !== 'text' ? (
                        <View style={styles.pendingSuggestionsBox}>
                          {optionSuggestions
                            .filter((s) => s.questionKey === q.key && s.status === 'pending')
                            .map((s) => (
                              <View key={s.id} style={styles.pendingSuggestionRow}>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={styles.pendingSuggestionLabel} numberOfLines={2}>
                                    {s.label}
                                  </Text>
                                  <Text style={styles.pendingSuggestionMeta} numberOfLines={1}>
                                    {(s.suggesterName || 'Member').trim() || 'Member'} · pending
                                  </Text>
                                </View>
                                <View style={styles.pendingSuggestionActions}>
                                  <TouchableOpacity
                                    style={[styles.pendingSuggestionBtn, styles.pendingSuggestionBtnDecline]}
                                    disabled={decideSuggestionMutation.isPending}
                                    onPress={() => {
                                      void (async () => {
                                        try {
                                          await decideSuggestionMutation.mutateAsync({
                                            suggestionId: s.id,
                                            decision: 'decline',
                                          });
                                        } catch (e: unknown) {
                                          const err = e as { body?: { message?: string }; message?: string };
                                          Alert.alert('Could not update', err?.body?.message || err?.message || 'Please try again.');
                                        }
                                      })();
                                    }}
                                  >
                                    <Text style={styles.pendingSuggestionBtnTextDecline}>Decline</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[styles.pendingSuggestionBtn, styles.pendingSuggestionBtnAccept]}
                                    disabled={decideSuggestionMutation.isPending}
                                    onPress={() => {
                                      if (q.options.length >= MAX_OPTIONS_PER_QUESTION) {
                                        Alert.alert(
                                          'Option limit reached',
                                          `This question already has ${MAX_OPTIONS_PER_QUESTION} options.`,
                                        );
                                        return;
                                      }
                                      void (async () => {
                                        try {
                                          await decideSuggestionMutation.mutateAsync({
                                            suggestionId: s.id,
                                            decision: 'accept',
                                          });
                                        } catch (e: unknown) {
                                          const err = e as { body?: { message?: string }; message?: string };
                                          Alert.alert('Could not update', err?.body?.message || err?.message || 'Please try again.');
                                        }
                                      })();
                                    }}
                                  >
                                    <Text style={styles.pendingSuggestionBtnTextAccept}>Accept</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            ))}
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
                })}

                <TouchableOpacity
                  style={[
                    styles.submitVoteBtn,
                    submitVoteMutation.isPending && { opacity: 0.7 },
                    deletePollMutation.isPending && { opacity: 0.7 },
                    isPollClosed && { opacity: 0.65 },
                  ]}
                  disabled={submitVoteMutation.isPending || deletePollMutation.isPending || isPollClosed}
                  onPress={async () => {
                    if (isPollClosed) return;
                    if (hasSavedVote && !editingSavedAnswer) {
                      setEditingSavedAnswer(true);
                      setMissingRequiredKeys([]);
                      return;
                    }
                    const missingKeys = parsedQuestions
                      .filter(
                        (pq) =>
                          pq.required &&
                          !isRequiredQuestionAnswered(pq, selectedByQuestion, textAnswerByQuestion),
                      )
                      .map((pq) => pq.key);
                    if (missingKeys.length > 0) {
                      setMissingRequiredKeys(missingKeys);
                      const firstKey = missingKeys[0];
                      requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                          const yQ = questionYInCardRef.current[firstKey ?? ''];
                          if (firstKey != null && yQ !== undefined) {
                            const y =
                              pollWrapYRef.current + pollCardYRef.current + yQ - 24;
                            scrollViewRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
                          }
                        });
                      });
                      Alert.alert('Required questions', 'Please answer every required question before submitting.');
                      return;
                    }
                    setMissingRequiredKeys([]);
                    const optionIds = Object.values(selectedByQuestion).flat();
                    const textAnswers = parsedQuestions
                      .filter((pq) => pq.type === 'text')
                      .map((pq) => ({
                        questionKey: pq.key,
                        answer: (textAnswerByQuestion[pq.key] ?? '').trim(),
                      }))
                      .filter((x) => x.answer.length > 0);
                    try {
                      await submitVoteMutation.mutateAsync({ optionIds, textAnswers });
                      await refetchResults();
                      setEditingSavedAnswer(false);
                      setMissingRequiredKeys([]);
                      triggerSavedToast();
                    } catch (e: unknown) {
                      const err = e as {
                        body?: { error?: string; message?: string };
                        response?: { data?: { error?: string; message?: string } };
                        message?: string;
                      };
                      const msg =
                        err?.body?.error ||
                        err?.body?.message ||
                        err?.response?.data?.error ||
                        err?.response?.data?.message ||
                        err?.message ||
                        'Please try again.';
                      Alert.alert('Could not submit answer', String(msg));
                    }
                  }}
                >
                  <Text style={styles.submitVoteBtnText}>
                    {isPollClosed
                      ? 'Poll closed'
                      : submitVoteMutation.isPending
                      ? 'Submitting...'
                      : hasSavedVote && !editingSavedAnswer
                        ? 'Update'
                        : 'Submit'}
                  </Text>
                </TouchableOpacity>
                {canClosePoll ? (
                  <TouchableOpacity
                    style={[styles.closePollBtn, closePollMutation.isPending && { opacity: 0.7 }]}
                    disabled={closePollMutation.isPending}
                    onPress={onClosePoll}
                  >
                    <Text style={styles.closePollBtnText}>Close poll</Text>
                  </TouchableOpacity>
                ) : null}
                {poll?.closedAt ? (
                  <Text style={styles.closedByText}>
                    Closed by {poll.closedByName || 'Unknown'} on {new Date(poll.closedAt).toLocaleString()}
                  </Text>
                ) : null}
              </View>
            </View>
          )}
        </ScrollView>

        {showSavedToast ? (
          <View pointerEvents="none" style={styles.savedToastWrap}>
            <View style={styles.savedToast}>
              <Text style={styles.savedToastText}>Saved</Text>
            </View>
          </View>
        ) : null}

        <Modal visible={!!detailModal} transparent animationType="fade" onRequestClose={() => setDetailModal(null)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{detailModal?.title ?? ''}</Text>
              <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }}>
                {(detailModal?.rows ?? []).map((r, i) => {
                  const responder = r.responder?.trim() || '';
                  const answer = r.answer?.trim() || '';
                  const initial = responder ? responder.charAt(0).toUpperCase() : '?';
                  const avatarBg = r.anonymous ? '#E5E7EB' : avatarColor(responder || r.userId || String(i));
                  return (
                    <View key={`${i}-${r.userId ?? responder}`} style={styles.modalRowCard}>
                      <View style={[styles.modalAvatar, { backgroundColor: avatarBg }]}>
                        <Text style={styles.modalAvatarText}>{initial}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.modalResponderName}>{responder || 'Responder'}</Text>
                        {answer ? <Text style={styles.modalResponseText}>{answer}</Text> : null}
                      </View>
                    </View>
                  );
                })}
                {(detailModal?.rows ?? []).length === 0 ? (
                  <Text style={styles.modalEmpty}>No responses yet.</Text>
                ) : null}
              </ScrollView>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setDetailModal(null)}>
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal
          visible={!!suggestModal}
          transparent
          animationType="fade"
          onRequestClose={() => setSuggestModal(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Suggest an option</Text>
              {suggestModal ? (
                <Text style={styles.suggestModalSubtitle} numberOfLines={2}>
                  {suggestModal.title}
                </Text>
              ) : null}
              <TextInput
                value={suggestLabelDraft}
                onChangeText={setSuggestLabelDraft}
                placeholder="New option"
                placeholderTextColor={Colors.textMuted}
                style={styles.suggestModalInput}
                maxLength={200}
                editable={!suggestOptionMutation.isPending}
              />
              <View style={styles.suggestModalActions}>
                <TouchableOpacity
                  style={[styles.modalCloseBtn, styles.suggestModalCancel]}
                  onPress={() => setSuggestModal(null)}
                  disabled={suggestOptionMutation.isPending}
                >
                  <Text style={styles.modalCloseText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalCloseBtn, styles.suggestModalSend]}
                  disabled={suggestOptionMutation.isPending || !suggestLabelDraft.trim()}
                  onPress={async () => {
                    if (!suggestModal || !suggestLabelDraft.trim()) return;
                    const targetQuestion = parsedQuestions.find((q) => q.key === suggestModal.questionKey);
                    if (targetQuestion && targetQuestion.type !== 'text' && targetQuestion.options.length >= MAX_OPTIONS_PER_QUESTION) {
                      Alert.alert(
                        'Option limit reached',
                        `This question already has ${MAX_OPTIONS_PER_QUESTION} options.`,
                      );
                      return;
                    }
                    try {
                      await suggestOptionMutation.mutateAsync({
                        questionKey: suggestModal.questionKey,
                        label: suggestLabelDraft.trim(),
                      });
                      setSuggestedSuccessQuestionKey(suggestModal.questionKey);
                      if (suggestSuccessTimerRef.current) clearTimeout(suggestSuccessTimerRef.current);
                      suggestSuccessTimerRef.current = setTimeout(() => {
                        setSuggestedSuccessQuestionKey(null);
                        suggestSuccessTimerRef.current = null;
                      }, 2000);
                      setSuggestModal(null);
                      setSuggestLabelDraft('');
                    } catch (e: unknown) {
                      const err = e as { body?: { message?: string }; message?: string };
                      Alert.alert(
                        'Could not send suggestion',
                        err?.body?.message || err?.message || 'Please try again.',
                      );
                    }
                  }}
                >
                  {suggestOptionMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.accentFg} />
                  ) : (
                    <Text style={[styles.modalCloseText, { color: Colors.accentFg }]}>Send</Text>
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
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  eventScrollView: { flex: 1, backgroundColor: '#FFFFFF' },
  eventScrollContent: { flexGrow: 1, backgroundColor: '#FFFFFF', paddingBottom: 14 },
  eventMainCardWrap: { marginHorizontal: 16, marginTop: 12, marginBottom: 6 },
  eventMainCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  groupChipAboveTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginBottom: 10,
    paddingVertical: 4,
    paddingRight: 4,
  },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  navGroupName: { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.medium, flexShrink: 1 },
  eventTitle: {
    fontSize: 21,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    lineHeight: 28,
    marginBottom: 4,
  },
  descBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
  },
  descText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.text,
    lineHeight: 22,
  },
  deadlineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  deadlineValue: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSub, lineHeight: 20 },
  createdByRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  createdByText: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSub },
  pollQBlock: { paddingHorizontal: 16, paddingVertical: 16 },
  pollQBlockMissing: {
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: '#CA8A04',
    borderTopColor: '#CA8A04',
    backgroundColor: '#FFFBEB',
  },
  pollQBlockBorder: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  questionTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  questionRequiredStar: {
    color: '#B91C1C',
    fontFamily: Fonts.bold,
  },
  questionMetaText: {
    marginTop: 3,
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: '#8A94A6',
  },
  voteOptionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F8FAFC',
  },
  voteOptionRowSelected: {
    borderColor: '#9CA3AF',
    backgroundColor: '#FFFFFF',
  },
  voteRadioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#C9CED6',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  voteRadioOuterSelected: {
    borderColor: '#7B8798',
  },
  voteRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#7B8798',
  },
  voteIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  voteIndicatorSelected: {
    borderColor: '#6B7280',
    backgroundColor: '#6B7280',
  },
  voteIndicatorRank: {
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: '#FFFFFF',
  },
  voteOptionText: { flex: 1, minWidth: 0, fontSize: 15, fontFamily: Fonts.medium, color: Colors.text },
  optionTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  rankBadgeGold: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' },
  rankBadgeSilver: { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
  rankBadgeBronze: { backgroundColor: '#FEE2E2', borderColor: '#FDBA74' },
  rankBadgeText: { fontSize: 11, fontFamily: Fonts.semiBold, color: '#374151' },
  textAnswerInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    maxHeight: 44,
    fontSize: 14,
    color: Colors.text,
    fontFamily: Fonts.regular,
    textAlignVertical: 'center',
  },
  textAnswerInputMissing: {
    borderWidth: 2,
    borderColor: '#CA8A04',
    backgroundColor: '#FFFBEB',
  },
  textAnswerReadOnly: {
    borderRadius: Radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 44,
    fontSize: 14,
    color: Colors.text,
    fontFamily: Fonts.regular,
    backgroundColor: '#F9FAFB',
  },
  textAnswerReadOnlyMissing: {
    borderWidth: 2,
    borderColor: '#CA8A04',
    backgroundColor: '#FFFBEB',
  },
  textResponseBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  textResponseBtnText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: '#6B7280',
  },
  resultWrap: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  resultFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#9CA3AF',
  },
  resultText: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: '#6B7280',
    minWidth: 72,
    textAlign: 'right',
  },
  resultTextLink: {
    textDecorationLine: 'underline',
  },
  rankingVotesRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 2,
  },
  rankingThumbsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 26,
    flex: 1,
    minWidth: 0,
  },
  rankingThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  rankingThumbOverlap: {
    marginLeft: -5,
  },
  rankingThumbInitial: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: '#FFFFFF',
  },
  rankingThumbRankBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    minWidth: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 1,
  },
  rankingThumbRankText: {
    fontSize: 8,
    lineHeight: 9,
    fontFamily: Fonts.bold,
    color: '#FFFFFF',
  },
  rankingThumbOverflow: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#EEF2F7',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  rankingThumbOverflowText: {
    fontSize: 10,
    fontFamily: Fonts.semiBold,
    color: '#4B5563',
  },
  submitVoteBtn: {
    marginHorizontal: 16,
    marginTop: 18,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: '#D5DAE1',
    backgroundColor: '#F8FAFC',
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitVoteBtnText: {
    color: '#344054',
    fontSize: 15,
    fontFamily: Fonts.semiBold,
  },
  closePollBtn: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 16,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: '#D5DAE1',
    backgroundColor: '#F8FAFC',
    paddingVertical: 13,
    alignItems: 'center',
  },
  closePollBtnText: {
    color: '#344054',
    fontSize: 15,
    fontFamily: Fonts.semiBold,
  },
  closedByText: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 14,
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
  },
  footerHint: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  savedToastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 20,
    alignItems: 'center',
  },
  savedToast: {
    backgroundColor: 'rgba(75, 85, 99, 0.72)',
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  savedToastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: Fonts.semiBold,
  },
  muted: { fontSize: 15, color: Colors.textMuted, fontFamily: Fonts.regular, marginTop: 8, paddingHorizontal: 20 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    padding: 14,
    gap: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  modalRowCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  modalAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E7EB',
  },
  modalAvatarText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: '#4B5563',
  },
  modalResponderName: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: '#374151',
  },
  modalResponseText: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.regular,
    color: '#111827',
  },
  modalEmpty: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    paddingVertical: 8,
  },
  modalCloseBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: '#E5E7EB',
  },
  modalCloseText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: '#374151',
  },
  /** Match create-poll `addOptionBtn` / `addOptionText` */
  suggestOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    marginTop: 2,
  },
  suggestOptionBtnDisabled: { opacity: 0.45 },
  suggestOptionBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.accent },
  suggestSuccessText: {
    marginTop: -2,
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    opacity: 0.78,
  },
  suggestedByInlineText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  pendingSuggestionsBox: {
    marginTop: 2,
    gap: 8,
  },
  pendingSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#F8FAFC',
  },
  pendingSuggestionLabel: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
  },
  pendingSuggestionMeta: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  pendingSuggestionActions: { flexDirection: 'row', gap: 8, flexShrink: 0 },
  pendingSuggestionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  pendingSuggestionBtnDecline: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  pendingSuggestionBtnAccept: { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' },
  pendingSuggestionBtnTextDecline: { fontSize: 12, fontFamily: Fonts.semiBold, color: '#B91C1C' },
  pendingSuggestionBtnTextAccept: { fontSize: 12, fontFamily: Fonts.semiBold, color: '#166534' },
  suggestModalSubtitle: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  suggestModalInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    fontFamily: Fonts.regular,
    backgroundColor: '#FFFFFF',
  },
  suggestModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  suggestModalCancel: { alignSelf: 'auto' },
  suggestModalSend: { alignSelf: 'auto', backgroundColor: Colors.accent },
});
