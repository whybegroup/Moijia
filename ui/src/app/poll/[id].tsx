import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
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

type ParsedQuestionType = 'single' | 'multiple' | 'rating';
type ParsedQuestion = {
  key: string;
  index: number;
  title: string;
  type: ParsedQuestionType;
  options: Array<{ id: string; label: string }>;
};

function parseQuestionType(raw: string): ParsedQuestionType {
  const t = raw.trim().toLowerCase();
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
    map.get(key)!.options.push({ id: o.id, label: optionLabel || '—' });
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
  const [submittedOnce, setSubmittedOnce] = useState(false);
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
                      {q.type === 'multiple' ? 'Multiple choice' : q.type === 'rating' ? 'Ranking' : 'Single choice'}
                    </Text>
                  </View>
                  <View style={{ gap: 8 }}>
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
                                <Text style={styles.resultText}>
                                  {resultOption.votes} votes ({resultOption.pct}%)
                                </Text>
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
                  try {
                    await submitVoteMutation.mutateAsync(optionIds);
                    setSubmittedOnce(true);
                    Alert.alert('Vote submitted', 'Results are now updated for each question.');
                  } catch (e: any) {
                    Alert.alert('Could not submit vote', e?.message ?? 'Please try again.');
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
});
