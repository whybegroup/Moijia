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
  useSetPollWatch,
  useGroup,
  useAllGroupMemberColors,
} from '../../hooks/api';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';
import { firstSearchParam, parseReturnToParam, withReturnTo } from '../../utils/navigationReturn';
import { PollOptionInputKind } from '@moijia/client';
import { ResolvableImage } from '../../components/ResolvableImage';
import { getDefaultGroupThemeFromName, getGroupColor } from '../../utils/helpers';

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
          options: [],
        });
      }
      map.get(key)!.options.push({ id: o.id, label: text || '—' });
      continue;
    }
    const idx = Number(m[1]);
    const title = m[2].trim();
    const qType = parseQuestionType(m[3]);
    const optionLabel = m[4].trim();
    const key = `q-${idx}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        index: idx,
        title,
        type: qType,
        options: [],
      });
    }
    if (qType !== 'text') {
      map.get(key)!.options.push({ id: o.id, label: optionLabel || '—' });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.index - b.index);
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
  const { data: results } = usePollResults(id ?? '', userId ?? '');
  const { data: group } = useGroup(poll?.groupId ?? '', userId ?? '');
  const { data: groupColors = {} } = useAllGroupMemberColors(userId ?? '');
  const submitVoteMutation = useSubmitPollVote(id ?? '', userId ?? '');
  const deletePollMutation = useDeletePoll(userId ?? '');
  const setWatchMutation = useSetPollWatch(id ?? '', userId ?? undefined);
  const [selectedByQuestion, setSelectedByQuestion] = useState<Record<string, string[]>>({});
  const [textAnswerByQuestion, setTextAnswerByQuestion] = useState<Record<string, string>>({});
  /** After a saved vote, answers are read-only until user taps "Update answer". */
  const [editingSavedAnswer, setEditingSavedAnswer] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const savedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [detailModal, setDetailModal] = useState<{
    title: string;
    rows: string[];
  } | null>(null);
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
    return group?.membershipStatus === 'admin';
  }, [poll, userId, group?.membershipStatus]);

  useEffect(() => {
    setEditingSavedAnswer(false);
    setShowSavedToast(false);
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
    };
  }, []);

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
            <View style={styles.eventMainCardWrap}>
              <View style={styles.eventMainCard}>
                <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
                  <TouchableOpacity
                    style={styles.groupChipAboveTitle}
                    onPress={() => router.push(withReturnTo(`/groups/${poll.groupId}`, pathname))}
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
                </View>

                <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
                  <Text style={formSectionTitleStyle}>Questions</Text>
                </View>

                {parsedQuestions.map((q, qIdx) => {
                  const showTextInput = q.type === 'text' && answersEditable;
                  return (
                  <View key={q.key} style={[styles.pollQBlock, qIdx > 0 && styles.pollQBlockBorder]}>
                    <View style={styles.questionHeader}>
                      <Text style={styles.questionTitle}>
                        {q.index}. {q.title}
                      </Text>
                      <Text style={styles.questionTypeChip}>
                        {q.type === 'text'
                          ? 'Text'
                          : q.type === 'multiple'
                            ? 'Multiple choice'
                            : q.type === 'rating'
                              ? 'Ranking'
                              : 'Single choice'}
                      </Text>
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
                            style={styles.textAnswerInput}
                            editable={answersEditable}
                            numberOfLines={1}
                            returnKeyType="done"
                            blurOnSubmit
                          />
                          ) : (
                            <Text style={styles.textAnswerReadOnly}>
                              {(textAnswerByQuestion[q.key] ?? '').trim() || '—'}
                            </Text>
                          )}
                          {results ? (
                            <TouchableOpacity
                              style={styles.textResponseBtn}
                              onPress={() => {
                                const resultQuestion = results?.questions.find((rq) => rq.questionKey === q.key);
                                if (!resultQuestion) return;
                                if (poll.anonymousVotes || resultQuestion.anonymousVotes) return;
                                const rows =
                                  resultQuestion.textResponses?.map((r) => `${r.userName}: ${r.answer}`) ?? [];
                                setDetailModal({
                                  title: `${q.title} responses`,
                                  rows,
                                });
                              }}
                              disabled={!!(poll.anonymousVotes || results?.questions.find((rq) => rq.questionKey === q.key)?.anonymousVotes)}
                            >
                              <Text style={styles.textResponseBtnText}>
                                {results?.questions.find((rq) => rq.questionKey === q.key)?.textResponseCount ?? 0}{' '}
                                responded
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </>
                      ) : null}
                      {q.options.map((opt) => {
                        const sel = selectedByQuestion[q.key] ?? [];
                        const selected = sel.includes(opt.id);
                        const rank = selected ? sel.indexOf(opt.id) + 1 : 0;
                        const resultQuestion = results?.questions.find((rq) => rq.questionKey === q.key);
                        const resultOption = resultQuestion?.options.find((ro) => ro.optionId === opt.id);
                        const questionAnonymous = !!(poll.anonymousVotes || resultQuestion?.anonymousVotes);
                        const rankingPlace =
                          q.type === 'rating'
                            ? rankingBadgePlace(resultQuestion?.options, opt.id)
                            : null;
                        const rankingLabel =
                          rankingPlace === 1 ? '1st' : rankingPlace === 2 ? '2nd' : rankingPlace === 3 ? '3rd' : '';
                        return (
                          <TouchableOpacity
                            key={opt.id}
                            style={[styles.voteOptionRow, selected && styles.voteOptionRowSelected]}
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
                                return { ...prev, [q.key]: [opt.id] };
                              });
                            }}
                            activeOpacity={0.75}
                          >
                            {answersEditable ? (
                              <View style={[styles.voteIndicator, selected && styles.voteIndicatorSelected]}>
                                {q.type === 'rating' && selected ? (
                                  <Text style={styles.voteIndicatorRank}>{rank}</Text>
                                ) : null}
                              </View>
                            ) : null}
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <View style={styles.optionTopRow}>
                                <Text style={styles.voteOptionText}>{opt.label}</Text>
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
                                    <Ionicons
                                      name="ribbon"
                                      size={12}
                                      color={
                                        rankingPlace === 1 ? '#B45309' : rankingPlace === 2 ? '#475569' : '#7C2D12'
                                      }
                                    />
                                    <Text style={styles.rankBadgeText}>{rankingLabel}</Text>
                                  </View>
                                ) : null}
                              </View>
                              {results && resultOption ? (
                                <View style={styles.resultWrap}>
                                  {q.type === 'rating' ? (
                                    <>
                                      <View style={styles.resultTrack}>
                                        <View style={[styles.resultFill, { width: `${resultOption.pct}%` }]} />
                                      </View>
                                      <View style={styles.rankingResultWrap}>
                                      {questionAnonymous ? (
                                        <Text style={styles.resultText}>{(resultOption.voters ?? []).length} responses</Text>
                                      ) : (
                                        <TouchableOpacity
                                          onPress={() =>
                                            setDetailModal({
                                              title: `${opt.label} voters`,
                                              rows: (resultOption.voters ?? []).map((v) => v.userName),
                                            })
                                          }
                                        >
                                          <Text style={[styles.resultText, styles.resultTextLink]}>
                                            {(resultOption.voters ?? []).length} responses
                                          </Text>
                                        </TouchableOpacity>
                                      )}
                                      </View>
                                    </>
                                  ) : (
                                    <>
                                      <View style={styles.resultTrack}>
                                        <View style={[styles.resultFill, { width: `${resultOption.pct}%` }]} />
                                      </View>
                                      {questionAnonymous ? (
                                        <Text style={styles.resultText}>
                                          {resultOption.votes} votes ({resultOption.pct}%)
                                        </Text>
                                      ) : (
                                        <TouchableOpacity
                                          onPress={() =>
                                            setDetailModal({
                                              title: `${opt.label} voters`,
                                              rows: (resultOption.voters ?? []).map((v) => v.userName),
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
                    </View>
                  </View>
                );
                })}

                <TouchableOpacity
                  style={[
                    styles.submitVoteBtn,
                    submitVoteMutation.isPending && { opacity: 0.7 },
                    deletePollMutation.isPending && { opacity: 0.7 },
                  ]}
                  disabled={submitVoteMutation.isPending || deletePollMutation.isPending}
                  onPress={async () => {
                    if (hasSavedVote && !editingSavedAnswer) {
                      setEditingSavedAnswer(true);
                      return;
                    }
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
                      setEditingSavedAnswer(false);
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
                    {submitVoteMutation.isPending
                      ? 'Submitting...'
                      : hasSavedVote && !editingSavedAnswer
                        ? 'Update'
                        : 'Submit'}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.footerHint}>Ranking questions allow multiple ordered selections.</Text>
                <View style={{ height: 20 }} />
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
                  const sep = r.indexOf(':');
                  const hasAnswerShape = sep > 0;
                  const responder = hasAnswerShape ? r.slice(0, sep).trim() : r.trim();
                  const answer = hasAnswerShape ? r.slice(sep + 1).trim() : '';
                  const initial = responder ? responder.charAt(0).toUpperCase() : '?';
                  return (
                    <View key={`${i}-${r}`} style={styles.modalRowCard}>
                      <View style={styles.modalAvatar}>
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
      </View>
    </EventFormPopoverChrome>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  eventScrollView: { flex: 1, backgroundColor: Colors.bg },
  eventScrollContent: { flexGrow: 1, backgroundColor: Colors.bg, paddingBottom: 8 },
  eventMainCardWrap: { marginHorizontal: 20, marginTop: 10, marginBottom: 4 },
  eventMainCard: { backgroundColor: Colors.surface, borderRadius: Radius['2xl'], overflow: 'hidden' },
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
    backgroundColor: Colors.bg,
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
  pollQBlock: { paddingHorizontal: 16, paddingVertical: 14 },
  pollQBlockBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  questionTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Colors.text,
  },
  questionTypeChip: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: '#6B7280',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F9FAFB',
  },
  voteOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
  },
  voteOptionRowSelected: {
    borderColor: '#9CA3AF',
    backgroundColor: '#FFFFFF',
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
  optionTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
    backgroundColor: '#F9FAFB',
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
    marginTop: 6,
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
  rankingResultWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  submitVoteBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: Radius.xl,
    backgroundColor: '#6B7280',
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitVoteBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: Fonts.semiBold,
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
});
