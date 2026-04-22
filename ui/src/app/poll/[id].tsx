import { useEffect, useMemo, useState } from 'react';
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
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Colors, Fonts, Radius } from '../../constants/theme';
import { NavBar } from '../../components/ui';
import { EventFormPopoverChrome } from '../../components/EventFormPopoverChrome';
import { usePoll, usePollResults, useSubmitPollVote } from '../../hooks/api';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';
import { firstSearchParam, parseReturnToParam } from '../../utils/navigationReturn';
import { PollOptionInputKind } from '@moijia/client';

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
    const text = o.inputKind === PollOptionInputKind.DATETIME
      ? (o.dateTimeValue ? new Date(o.dateTimeValue).toLocaleString() : '—')
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

export default function PollDetailScreen() {
  const router = useRouter();
  const { id: rawId, returnTo } = useLocalSearchParams<{ id?: string | string[]; returnTo?: string | string[] }>();
  const id = useMemo(() => firstSearchParam(rawId), [rawId]);
  const returnToParsed = useMemo(() => parseReturnToParam(firstSearchParam(returnTo)), [returnTo]);
  const { userId } = useCurrentUserContext();
  const { data: poll, isLoading, isError } = usePoll(id ?? '', userId ?? '');
  const { data: results } = usePollResults(id ?? '', userId ?? '');
  const submitVoteMutation = useSubmitPollVote(id ?? '', userId ?? '');
  const [selectedByQuestion, setSelectedByQuestion] = useState<Record<string, string[]>>({});
  const [textAnswerByQuestion, setTextAnswerByQuestion] = useState<Record<string, string>>({});
  const [submittedOnce, setSubmittedOnce] = useState(false);
  const [detailModal, setDetailModal] = useState<{
    title: string;
    rows: string[];
  } | null>(null);
  const parsedQuestions = useMemo(() => (poll ? parseStructuredPollQuestions(poll) : []), [poll]);

  useEffect(() => {
    if (!results || parsedQuestions.length === 0) return;
    const next: Record<string, string[]> = {};
    for (const q of parsedQuestions) {
      const inQuestion = q.options.map((o) => o.id);
      next[q.key] = results.myOptionIds.filter((id) => inQuestion.includes(id));
    }
    setSelectedByQuestion(next);
  }, [results, parsedQuestions]);

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

  return (
    <EventFormPopoverChrome onClose={dismiss}>
      <View style={styles.inner}>
        <NavBar title="Poll" onClose={dismiss} />
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 48, width: '100%', alignSelf: 'stretch' }}
          showsVerticalScrollIndicator={false}
        >
          {!id || !userId ? (
            <Text style={styles.muted}>Missing poll or user.</Text>
          ) : isLoading ? (
            <ActivityIndicator color={Colors.accent} style={{ marginTop: 24 }} />
          ) : isError || !poll ? (
            <Text style={styles.muted}>Could not load this poll.</Text>
          ) : (
            <>
              <Text style={styles.title}>{poll.title}</Text>
              {poll.description ? <Text style={styles.desc}>{poll.description}</Text> : null}
              {parsedQuestions.map((q) => (
                <View key={q.key} style={styles.questionCard}>
                  <View style={styles.questionHeader}>
                    <Text style={styles.questionTitle}>{q.index}. {q.title}</Text>
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
                        <TextInput
                          value={textAnswerByQuestion[q.key] ?? ''}
                          onChangeText={(v) => setTextAnswerByQuestion((prev) => ({ ...prev, [q.key]: v }))}
                          placeholder="Type your answer"
                          placeholderTextColor={Colors.textMuted}
                          style={styles.textAnswerInput}
                          multiline
                        />
                        {(submittedOnce || results) ? (
                          <TouchableOpacity
                            style={styles.textResponseBtn}
                            onPress={() => {
                              const resultQuestion = results?.questions.find((rq) => rq.questionKey === q.key);
                              if (!resultQuestion) return;
                              if (poll.anonymousVotes) return;
                              const rows =
                                resultQuestion.textResponses?.map((r) => `${r.userName}: ${r.answer}`) ?? [];
                              setDetailModal({
                                title: `${q.title} responses`,
                                rows,
                              });
                            }}
                            disabled={!!poll.anonymousVotes}
                          >
                            <Text style={styles.textResponseBtnText}>
                              {results?.questions.find((rq) => rq.questionKey === q.key)?.textResponseCount ?? 0} responded
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
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          style={[styles.voteOptionRow, selected && styles.voteOptionRowSelected]}
                          onPress={() => {
                            setSelectedByQuestion((prev) => {
                              const before = prev[q.key] ?? [];
                              if (q.type === 'multiple' || q.type === 'rating') {
                                const next = before.includes(opt.id)
                                  ? before.filter((id) => id !== opt.id)
                                  : [...before, opt.id];
                                return { ...prev, [q.key]: next };
                              }
                              return { ...prev, [q.key]: [opt.id] };
                            });
                          }}
                          activeOpacity={0.75}
                        >
                          <View style={[styles.voteIndicator, selected && styles.voteIndicatorSelected]}>
                            {q.type === 'rating' && selected ? (
                              <Text style={styles.voteIndicatorRank}>{rank}</Text>
                            ) : null}
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.voteOptionText}>{opt.label}</Text>
                            {(submittedOnce || results) && resultOption ? (
                              <View style={styles.resultWrap}>
                                <View style={styles.resultTrack}>
                                  <View style={[styles.resultFill, { width: `${resultOption.pct}%` }]} />
                                </View>
                                {poll.anonymousVotes ? (
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
                              </View>
                            ) : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.submitVoteBtn, submitVoteMutation.isPending && { opacity: 0.7 }]}
                disabled={submitVoteMutation.isPending}
                onPress={async () => {
                  const optionIds = Object.values(selectedByQuestion).flat();
                  const textAnswers = parsedQuestions
                    .filter((q) => q.type === 'text')
                    .map((q) => ({
                      questionKey: q.key,
                      answer: (textAnswerByQuestion[q.key] ?? '').trim(),
                    }))
                    .filter((x) => x.answer.length > 0);
                  try {
                    await submitVoteMutation.mutateAsync({ optionIds, textAnswers });
                    setSubmittedOnce(true);
                    Alert.alert('Vote submitted', 'Results are now updated for each question.');
                  } catch (e: any) {
                    const msg =
                      e?.body?.error ||
                      e?.body?.message ||
                      e?.response?.data?.error ||
                      e?.response?.data?.message ||
                      e?.message ||
                      'Please try again.';
                    Alert.alert('Could not submit vote', String(msg));
                  }
                }}
              >
                <Text style={styles.submitVoteBtnText}>
                  {submitVoteMutation.isPending ? 'Submitting...' : 'Submit vote'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.comingSoon}>Ranking questions always allow multiple ordered selections.</Text>
            </>
          )}
        </ScrollView>
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
  inner: { flex: 1, backgroundColor: Colors.bg },
  title: {
    fontSize: 22,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    marginBottom: 12,
  },
  desc: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    lineHeight: 22,
    marginBottom: 20,
  },
  questionCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#D9DDE3',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    padding: 12,
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
    fontSize: 17,
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
  textAnswerInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    borderRadius: Radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 70,
    fontSize: 14,
    color: Colors.text,
    fontFamily: Fonts.regular,
    textAlignVertical: 'top',
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
  submitVoteBtn: {
    marginTop: 8,
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
  muted: { fontSize: 15, color: Colors.textMuted, fontFamily: Fonts.regular, marginTop: 8 },
  comingSoon: {
    marginTop: 12,
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
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
