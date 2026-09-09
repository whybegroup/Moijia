import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Alert,
  ScrollView,
  TextInput,
  Modal,
  Dimensions,
} from 'react-native';
import {
  ScrollViewContainer,
  reorderItems,
} from 'react-native-reorderable-list';
import { PollRankingReorderList, RankingPollOptionRowShell } from './PollRankingReorderList';
import { usePathname, type Href } from 'expo-router';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Fonts, Radius } from '../constants/theme';
import { EventFormPopoverChrome } from './EventFormPopoverChrome';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { modalTopBarStyles } from './modalTopBarStyles';
import { formSectionTitleStyle } from './ui';
import { keyboardAwareScrollProps } from './KeyboardSafeScrollView';
import {
  createScrollAboveKeyboardOnFocus,
  useAndroidKeyboardContentPad,
  useEnsureFocusedInputAboveKeyboard,
} from '../utils/scrollInputAboveKeyboard';
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
  useUpdatePoll,
  useGroup,
  useGroupMemberColor,
} from '../hooks/api';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import {
  isMissingQueryError,
  useMissingResourceAlert,
} from '../hooks/useMissingResourceAlert';
import { apiErrorMessage, parseNotGroupMemberError } from '../utils/apiErrors';
import { useShareLinkJoinPrompt } from '../hooks/useShareLinkJoinPrompt';
import Toast from 'react-native-toast-message';
import { parseReturnToParam, withReturnTo } from '../utils/navigationReturn';
import {
  ALL_POLLS_HREF,
  groupsTabParentHref,
  navigateGroupsTabTo,
  navigatePollsTabTo,
  navigateToGroupsTabGroupOverview,
  type GroupsTabNavCallbacks,
  type PollsTabNavCallbacks,
} from '../utils/tabBreadcrumbNav';
import { PollOptionInputKind, type Poll, type PollInput, type PollQuestionResult, type PollResults } from '@moijia/client';
import { ResolvableImage } from './ResolvableImage';
import { ImageLightboxModal } from './ImageLightboxModal';
import { dropLightboxItem } from './ForumPostMarkdownBody';
import { UserAvatar } from './UserAvatar';
import { getDefaultGroupThemeFromName, getGroupColor, formatCreatedAtLabel, isContentEdited } from '../utils/helpers';
import { sharePoll } from '../utils/shareContent';
import { ChromeHeaderTrailingRow, DetailActionIcon, RegisterChromeHeader } from './chromeHeaderSlot';
import { deleteManagedUploadFireAndForget } from '../services/managedUploadDelete';
import { canDeleteManagedMedia } from '../utils/canDeleteManagedMedia';

const MAX_OPTIONS_PER_QUESTION = 50;
const POLL_SIDE_MARGIN = 20;
const POLL_H_PAD = 16;
const POLL_COVER_PHOTO_SIZE = Math.min(
  112,
  Math.round((Dimensions.get('window').width - POLL_SIDE_MARGIN * 2 - POLL_H_PAD * 2 - 24) / 3),
);

function pollToUpdateInput(poll: Poll, coverPhotos: string[]): PollInput {
  return {
    groupId: poll.groupId,
    createdBy: poll.createdBy,
    title: poll.title,
    description: poll.description,
    deadline: poll.deadline,
    coverPhotos,
    anonymousVotes: poll.anonymousVotes,
    multipleChoice: poll.multipleChoice,
    ranking: poll.ranking,
    options: poll.options.map((o) => ({
      id: o.id,
      inputKind: o.inputKind,
      sortOrder: o.sortOrder,
      textHtml: o.textHtml,
      textFont: o.textFont,
      dateTimeValue: o.dateTimeValue,
    })),
  };
}

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

function pollResultsHasViewerVote(results: PollResults | undefined, userId: string | undefined): boolean {
  if (!results) return false;
  if (results.myOptionIds.length > 0) return true;
  if (!userId) return false;
  for (const rq of results.questions) {
    if (rq.textResponses?.some((t) => t.userId === userId)) return true;
  }
  return false;
}

function selectedByQuestionFromResults(
  results: PollResults,
  parsedQuestions: ParsedQuestion[],
): Record<string, string[]> {
  const rankByOption = new Map(
    (results.myOptionRanks ?? []).map((r) => [r.optionId, r.rank]),
  );
  const next: Record<string, string[]> = {};
  for (const q of parsedQuestions) {
    const inQuestion = new Set(q.options.map((o) => o.id));
    const ids = results.myOptionIds.filter((oid) => inQuestion.has(oid));
    if (q.type === 'rating') {
      ids.sort((a, b) => (rankByOption.get(a) ?? 999) - (rankByOption.get(b) ?? 999));
    }
    next[q.key] = ids;
  }
  return next;
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

const RANKING_CHART_MY_FILL = '#22C55E';

function rankingVoteCountsForOption(
  voters: Array<{ userId: string; rank?: number }> | undefined,
  rankSlots: number,
  viewerUserId: string | undefined,
  draftRankForOption: number,
  usePreview: boolean,
): { total: number[]; mine: number[] } {
  const total = Array.from({ length: rankSlots }, () => 0);
  const mine = Array.from({ length: rankSlots }, () => 0);
  if (usePreview && viewerUserId) {
    for (const v of voters ?? []) {
      if (v.userId === viewerUserId) continue;
      const r = v.rank;
      if (typeof r === 'number' && r >= 1 && r <= rankSlots) {
        total[r - 1] += 1;
      }
    }
    if (draftRankForOption >= 1 && draftRankForOption <= rankSlots) {
      total[draftRankForOption - 1] += 1;
      mine[draftRankForOption - 1] = 1;
    }
    return { total, mine };
  }
  for (const v of voters ?? []) {
    const r = v.rank;
    if (typeof r === 'number' && r >= 1 && r <= rankSlots) {
      total[r - 1] += 1;
      if (viewerUserId && v.userId === viewerUserId) {
        mine[r - 1] += 1;
      }
    }
  }
  return { total, mine };
}

/** How many voters ranked this option (any rank), with optional draft vote for the viewer. */
function rankingResponseCountForOption(
  voters: Array<{ userId: string }> | undefined,
  viewerUserId: string | undefined,
  draftRankForOption: number,
  usePreview: boolean,
): number {
  const list = voters ?? [];
  if (!usePreview || !viewerUserId) {
    return list.length;
  }
  let count = list.filter((v) => v.userId !== viewerUserId).length;
  if (draftRankForOption > 0) count += 1;
  return count;
}

function choiceVoteCountsForOption(
  voters: Array<{ userId: string }> | undefined,
  voteCount: number,
  viewerUserId: string | undefined,
  draftSelected: boolean,
  usePreview: boolean,
): { total: number; mine: number } {
  if (usePreview && viewerUserId) {
    let others = 0;
    for (const v of voters ?? []) {
      if (v.userId === viewerUserId) continue;
      others += 1;
    }
    const mine = draftSelected ? 1 : 0;
    return { total: others + mine, mine };
  }
  let mine = 0;
  for (const v of voters ?? []) {
    if (viewerUserId && v.userId === viewerUserId) {
      mine += 1;
    }
  }
  const total = voters && voters.length > 0 ? voters.length : voteCount;
  return { total, mine };
}

function choiceMaxVoteCountAcrossOptions(
  resultQuestion:
    | { options: Array<{ optionId: string; votes: number; voters?: Array<{ userId: string }> }> }
    | undefined,
  viewerUserId?: string,
  selectedIds?: string[],
  usePreview = false,
): number {
  let max = 0;
  for (const opt of resultQuestion?.options ?? []) {
    const draftSelected = selectedIds?.includes(opt.optionId) ?? false;
    const { total } = choiceVoteCountsForOption(
      opt.voters,
      opt.votes,
      viewerUserId,
      draftSelected,
      usePreview,
    );
    max = Math.max(max, total);
  }
  return max;
}

function choiceTotalVotesForQuestion(
  resultQuestion:
    | { options: Array<{ optionId: string; votes: number; voters?: Array<{ userId: string }> }> }
    | undefined,
  viewerUserId?: string,
  selectedIds?: string[],
  usePreview = false,
): number {
  let total = 0;
  for (const opt of resultQuestion?.options ?? []) {
    const draftSelected = selectedIds?.includes(opt.optionId) ?? false;
    const { total: count } = choiceVoteCountsForOption(
      opt.voters,
      opt.votes,
      viewerUserId,
      draftSelected,
      usePreview,
    );
    total += count;
  }
  return total;
}

function rankingMaxVoteCountAcrossOptions(
  resultQuestion:
    | { options: Array<{ optionId: string; voters?: Array<{ userId: string; rank?: number }> }> }
    | undefined,
  rankSlots = 3,
  viewerUserId?: string,
  selectedIds?: string[],
  usePreview = false,
): number {
  let max = 0;
  for (const opt of resultQuestion?.options ?? []) {
    const selIdx = selectedIds?.indexOf(opt.optionId) ?? -1;
    const draftRank = selIdx >= 0 ? selIdx + 1 : 0;
    const { total } = rankingVoteCountsForOption(
      opt.voters,
      rankSlots,
      viewerUserId,
      draftRank,
      usePreview,
    );
    for (const count of total) {
      if (count > max) max = count;
    }
  }
  return Math.max(1, max);
}

/** Average-rank scores per option; mirrors API ranking aggregation with optional draft vote preview. */
function rankingPlacementScoresForQuestion(
  resultQuestion: PollQuestionResult | undefined,
  optionCount: number,
  viewerUserId: string | undefined,
  selectedIds: string[],
  usePreview: boolean,
): Array<{ optionId: string; votes: number }> | undefined {
  if (!resultQuestion?.options?.length) return undefined;
  if (!usePreview || !viewerUserId) {
    return resultQuestion.options.map((o) => ({ optionId: o.optionId, votes: o.votes }));
  }
  const participatingUserIds = new Set<string>();
  const rankByUserOption = new Map<string, number>();
  for (const o of resultQuestion.options) {
    for (const v of o.voters ?? []) {
      if (v.userId === viewerUserId) continue;
      participatingUserIds.add(v.userId);
      rankByUserOption.set(`${v.userId}::${o.optionId}`, v.rank ?? 1);
    }
  }
  participatingUserIds.add(viewerUserId);
  for (const o of resultQuestion.options) {
    const idx = selectedIds.indexOf(o.optionId);
    const rank = idx >= 0 ? idx + 1 : optionCount;
    rankByUserOption.set(`${viewerUserId}::${o.optionId}`, rank);
  }
  const participantCount = participatingUserIds.size;
  return resultQuestion.options.map((o) => {
    let sum = 0;
    for (const uid of participatingUserIds) {
      sum += rankByUserOption.get(`${uid}::${o.optionId}`) ?? optionCount;
    }
    const avgRank = participantCount > 0 ? sum / participantCount : 0;
    return { optionId: o.optionId, votes: avgRank };
  });
}

function formatRankingAvgRank(value: number): string {
  if (!(value > 0)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function questionResponderLabel(count: number): string {
  return count === 1 ? '1 user responded' : `${count} users responded`;
}

function questionResponderCount(
  resultQuestion: PollQuestionResult | undefined,
  q: ParsedQuestion,
  viewerUserId?: string,
  selectedIds?: string[],
  usePreview = false,
): number {
  if (!resultQuestion) return 0;
  if (q.type === 'text') {
    return resultQuestion.textResponseCount ?? resultQuestion.textResponses?.length ?? 0;
  }
  const hasVoters = resultQuestion.options.some((o) => (o.voters?.length ?? 0) > 0);
  if (hasVoters) {
    if (usePreview && viewerUserId) {
      const userIds = new Set<string>();
      for (const o of resultQuestion.options) {
        for (const v of o.voters ?? []) {
          if (v.userId !== viewerUserId) userIds.add(v.userId);
        }
      }
      if ((selectedIds?.length ?? 0) > 0) userIds.add(viewerUserId);
      return userIds.size;
    }
    const userIds = new Set<string>();
    for (const o of resultQuestion.options) {
      for (const v of o.voters ?? []) {
        userIds.add(v.userId);
      }
    }
    return userIds.size;
  }
  if (q.type === 'rating') {
    return Math.max(0, ...resultQuestion.options.map((o) => o.responseCount ?? 0));
  }
  return resultQuestion.options.reduce((n, o) => n + (o.responseCount ?? 0), 0);
}

type QuestionResponderModalRow = {
  responder: string;
  answer?: string;
  userId?: string;
  anonymous?: boolean;
  avatarSeed?: string | null;
  thumbnail?: string | null;
};

function canOpenQuestionRespondersModal(
  resultQuestion: PollQuestionResult | undefined,
  q: ParsedQuestion,
  questionAnonymous: boolean,
): boolean {
  if (!resultQuestion) return false;
  if (q.type === 'text') {
    return (resultQuestion.textResponseCount ?? resultQuestion.textResponses?.length ?? 0) > 0;
  }
  if (questionAnonymous) return false;
  return resultQuestion.options.some((o) => (o.voters?.length ?? 0) > 0);
}

function questionResponderModalRows(
  resultQuestion: PollQuestionResult | undefined,
  q: ParsedQuestion,
): QuestionResponderModalRow[] {
  if (!resultQuestion) return [];
  if (q.type === 'text') {
    return (resultQuestion.textResponses ?? []).map((r) => ({
      responder: r.userName,
      answer: r.answer,
      userId: r.userId,
      avatarSeed: r.avatarSeed,
      thumbnail: r.thumbnail,
    }));
  }
  const byUser = new Map<
    string,
    QuestionResponderModalRow & { choiceLabels: string[]; rankByOptionId: Map<string, number> }
  >();
  for (const opt of resultQuestion.options) {
    for (const v of opt.voters ?? []) {
      let row = byUser.get(v.userId);
      if (!row) {
        row = {
          responder: v.userName,
          userId: v.userId,
          avatarSeed: v.avatarSeed,
          thumbnail: v.thumbnail,
          choiceLabels: [],
          rankByOptionId: new Map(),
        };
        byUser.set(v.userId, row);
      }
      if (q.type === 'rating') {
        row.rankByOptionId.set(opt.optionId, v.rank ?? 1);
      } else {
        row.choiceLabels.push(opt.label);
      }
    }
  }
  const labelByOptionId = new Map(resultQuestion.options.map((o) => [o.optionId, o.label]));
  return Array.from(byUser.values())
    .map((row) => {
      if (q.type === 'rating') {
        const ranked = [...row.rankByOptionId.entries()].sort((a, b) => a[1] - b[1]);
        const answer = ranked
          .map(([optionId, rank]) => `#${rank} ${labelByOptionId.get(optionId) ?? 'Option'}`)
          .join('\n');
        return {
          responder: row.responder,
          answer,
          userId: row.userId,
          avatarSeed: row.avatarSeed,
          thumbnail: row.thumbnail,
        };
      }
      return {
        responder: row.responder,
        answer: row.choiceLabels.join(', '),
        userId: row.userId,
        avatarSeed: row.avatarSeed,
        thumbnail: row.thumbnail,
      };
    })
    .sort((a, b) => a.responder.localeCompare(b.responder));
}

function RankingVoteBarChart({
  countsByRank,
  mineByRank,
  maxCount,
  fillColor,
  onPress,
  disabled,
}: {
  countsByRank: number[];
  mineByRank: number[];
  maxCount: number;
  fillColor: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const max = Math.max(1, maxCount);
  const chart = (
    <View style={styles.rankingChart}>
      {countsByRank.map((count, idx) => {
        const mine = mineByRank[idx] ?? 0;
        const others = Math.max(0, count - mine);
        const widthPct = count > 0 ? (count / max) * 100 : 0;
        return (
          <View key={idx} style={styles.rankingChartRow}>
            <Text style={styles.rankingChartRank}>#{idx + 1}</Text>
            <View style={styles.rankingChartBarArea}>
              {count > 0 ? (
                <View style={[styles.rankingChartBarWithCount, { width: `${widthPct}%` }]}>
                  <View style={styles.rankingChartTrack}>
                    <View style={styles.rankingChartFillRow}>
                      {mine > 0 ? (
                        <View
                          style={[
                            styles.rankingChartFillSegment,
                            { flex: mine, backgroundColor: RANKING_CHART_MY_FILL },
                          ]}
                        />
                      ) : null}
                      {others > 0 ? (
                        <View style={[styles.rankingChartFillSegment, { flex: others, backgroundColor: fillColor }]} />
                      ) : null}
                    </View>
                  </View>
                  <Text style={styles.rankingChartCount}>{count}</Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
  if (onPress && !disabled) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.rankingChartPressable}>
        {chart}
      </TouchableOpacity>
    );
  }
  return chart;
}

function ChoiceVoteBarChart({
  count,
  mine,
  maxCount,
  fillColor,
  onPress,
  disabled,
}: {
  count: number;
  mine: number;
  maxCount: number;
  fillColor: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const max = Math.max(1, maxCount);
  const others = Math.max(0, count - mine);
  const widthPct = count > 0 ? (count / max) * 100 : 0;
  const chart = (
    <View style={styles.rankingChartRow}>
      <View style={styles.rankingChartBarArea}>
        {count > 0 ? (
          <View style={[styles.rankingChartBarWithCount, { width: `${widthPct}%` }]}>
            <View style={styles.rankingChartTrack}>
              <View style={styles.rankingChartFillRow}>
                {mine > 0 ? (
                  <View
                    style={[
                      styles.rankingChartFillSegment,
                      { flex: mine, backgroundColor: RANKING_CHART_MY_FILL },
                    ]}
                  />
                ) : null}
                {others > 0 ? (
                  <View style={[styles.rankingChartFillSegment, { flex: others, backgroundColor: fillColor }]} />
                ) : null}
              </View>
            </View>
            <Text style={styles.rankingChartCount}>{count}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
  if (onPress && !disabled) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.rankingChartPressable}>
        {chart}
      </TouchableOpacity>
    );
  }
  return chart;
}

function rankingOptionsForEdit(
  options: Array<{ id: string; label: string }>,
  rankedIds: string[],
): Array<{ id: string; label: string }> {
  const byId = new Map(options.map((o) => [o.id, o]));
  const rankedSet = new Set(rankedIds);
  const ranked = rankedIds.map((id) => byId.get(id)).filter((o): o is { id: string; label: string } => !!o);
  const unranked = options.filter((o) => !rankedSet.has(o.id));
  return [...ranked, ...unranked];
}

type RankingSortMode = 'total' | 'mine';

/** Lower average-rank score is better; options with no score stay at the end. */
function rankingOptionsForTotal(
  options: Array<{ id: string; label: string }>,
  placement: Array<{ optionId: string; votes: number }> | undefined,
): Array<{ id: string; label: string }> {
  if (!placement?.length) return options;
  const scoreById = new Map(placement.map((p) => [p.optionId, p.votes]));
  const indexById = new Map(options.map((o, i) => [o.id, i]));
  return options.slice().sort((a, b) => {
    const sa = scoreById.get(a.id) ?? 0;
    const sb = scoreById.get(b.id) ?? 0;
    const aHas = sa > 0;
    const bHas = sb > 0;
    if (aHas && bHas && sa !== sb) return sa - sb;
    if (aHas !== bHas) return aHas ? -1 : 1;
    return (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0);
  });
}

type PollVoteOptionRowProps = {
  opt: { id: string; label: string };
  q: ParsedQuestion;
  poll: Poll;
  palette: ReturnType<typeof getGroupColor>;
  selected: boolean;
  rank: number;
  answersEditable: boolean;
  results: PollResults | undefined;
  resultQuestion: PollQuestionResult | undefined;
  rankingChartMaxCount: number;
  showRankingCharts: boolean;
  choiceChartMaxCount: number;
  choiceQuestionTotalVotes: number;
  useChoiceChartPreview?: boolean;
  suggestedBy?: string;
  drag?: () => void;
  isActive?: boolean;
  onPress?: () => void;
  onOpenRankingDetails?: () => void;
  onOpenVoteDetails?: () => void;
  userId?: string;
  useRankingChartPreview?: boolean;
  rankingPlacementOptions?: Array<{ optionId: string; votes: number }>;
  /** Row body inside PollRankingReorderList; long-press the card to drag. */
  embeddedInReorderShell?: boolean;
};

function PollVoteOptionRow({
  opt,
  q,
  poll,
  palette,
  selected,
  rank,
  answersEditable,
  results,
  resultQuestion,
  rankingChartMaxCount,
  showRankingCharts,
  choiceChartMaxCount,
  choiceQuestionTotalVotes,
  useChoiceChartPreview = false,
  suggestedBy,
  drag,
  isActive,
  onPress,
  onOpenRankingDetails,
  onOpenVoteDetails,
  userId,
  useRankingChartPreview = false,
  rankingPlacementOptions,
  embeddedInReorderShell = false,
}: PollVoteOptionRowProps) {
  const resultOption = resultQuestion?.options.find((ro) => ro.optionId === opt.id);
  const questionAnonymous = !!(poll.anonymousVotes || resultQuestion?.anonymousVotes);
  const placementOptions = rankingPlacementOptions ?? resultQuestion?.options;
  const rankingPlace =
    q.type === 'rating' ? rankingBadgePlace(placementOptions, opt.id) : null;
  const rankingLabel = rankingPlace === 1 ? '1st' : rankingPlace === 2 ? '2nd' : rankingPlace === 3 ? '3rd' : '';
  const { total: rankingCountsByRank, mine: rankingMineByRank } = rankingVoteCountsForOption(
    resultOption?.voters,
    3,
    questionAnonymous ? undefined : userId,
    rank,
    useRankingChartPreview,
  );
  const rankingVoterCount =
    q.type === 'rating'
      ? useRankingChartPreview
        ? rankingResponseCountForOption(
            resultOption?.voters,
            questionAnonymous ? undefined : userId,
            rank,
            true,
          )
        : (resultOption?.responseCount ?? (resultOption?.voters?.length ?? 0))
      : 0;
  const rankingAvgRank =
    q.type === 'rating'
      ? (placementOptions?.find((p) => p.optionId === opt.id)?.votes ?? 0)
      : 0;
  const rankingVoteSummary =
    rankingVoterCount > 0
      ? `${rankingVoterCount} votes (#${formatRankingAvgRank(rankingAvgRank)})`
      : `${rankingVoterCount} votes`;
  const { total: choiceCount, mine: choiceMine } = choiceVoteCountsForOption(
    resultOption?.voters,
    resultOption?.votes ?? 0,
    questionAnonymous ? undefined : userId,
    selected,
    useChoiceChartPreview,
  );
  const choicePct =
    choiceQuestionTotalVotes > 0 ? Math.round((choiceCount / choiceQuestionTotalVotes) * 100) : 0;
  const useRankingDrag =
    embeddedInReorderShell || (answersEditable && q.type === 'rating' && !!drag);
  const rowStyle = [
    styles.voteOptionRow,
    selected &&
      q.type !== 'rating' && {
        ...styles.voteOptionRowSelected,
        borderColor: palette.cal,
        backgroundColor: palette.row,
      },
    q.type === 'rating' && rankingPlace === 1 && styles.voteOptionRowGold,
    q.type === 'rating' && rankingPlace === 2 && styles.voteOptionRowSilver,
    q.type === 'rating' && rankingPlace === 3 && styles.voteOptionRowBronze,
    q.type === 'rating' && rankingPlace === 1 && styles.voteOptionRowGoldFill,
    q.type === 'rating' && rankingPlace === 2 && styles.voteOptionRowSilverFill,
    q.type === 'rating' && rankingPlace === 3 && styles.voteOptionRowBronzeFill,
    isActive && styles.voteOptionRowDragging,
  ];
  const inner = (
    <>
      {answersEditable || selected ? (
        q.type !== 'rating' ? (
          <View
            style={[
              styles.voteRadioOuter,
              selected && styles.voteRadioOuterSelected,
              selected && { borderColor: palette.cal },
            ]}
          >
            {selected ? <View style={[styles.voteRadioInner, { backgroundColor: palette.cal }]} /> : null}
          </View>
        ) : null
      ) : null}
      <View
        style={{ flex: 1, minWidth: 0 }}
        pointerEvents={useRankingDrag ? 'none' : 'auto'}
      >
        <View style={[styles.optionTopRow, showRankingCharts && styles.optionTopRowRanking]}>
          <Text style={styles.voteOptionText}>
            {opt.label}
            {suggestedBy ? (
              <Text style={styles.suggestedByInlineText}> · suggested by {suggestedBy}</Text>
            ) : null}
          </Text>
          {rankingPlace ? (
            <View
              style={[
                styles.rankBadge,
                showRankingCharts && styles.rankBadgeRankingSlot,
                rankingPlace === 1
                  ? styles.rankBadgeGold
                  : rankingPlace === 2
                    ? styles.rankBadgeSilver
                    : styles.rankBadgeBronze,
              ]}
            >
              {rankingPlace === 1 ? (
                <MaterialCommunityIcons name="crown" size={14} color="#B45309" />
              ) : (
                <Text style={styles.rankBadgeText}>{rankingLabel}</Text>
              )}
            </View>
          ) : null}
        </View>
        {results && resultOption ? (
          <View
            style={[styles.resultWrap, styles.resultWrapRanking]}
            pointerEvents={answersEditable && q.type === 'rating' ? 'none' : 'auto'}
          >
            {q.type === 'rating' ? (
              <>
                <RankingVoteBarChart
                  countsByRank={rankingCountsByRank}
                  mineByRank={rankingMineByRank}
                  maxCount={rankingChartMaxCount}
                  fillColor={palette.label}
                  onPress={onOpenRankingDetails}
                  disabled={rankingVoterCount === 0 || questionAnonymous || answersEditable}
                />
                {questionAnonymous ? (
                  <Text style={[styles.resultText, styles.rankingChartVoteTotal]}>{rankingVoteSummary}</Text>
                ) : (
                  <TouchableOpacity
                    disabled={rankingVoterCount === 0 || answersEditable}
                    onPress={onOpenRankingDetails}
                  >
                    <Text
                      style={[
                        styles.resultText,
                        styles.rankingChartVoteTotal,
                        rankingVoterCount > 0 && !answersEditable && styles.resultTextLink,
                      ]}
                    >
                      {rankingVoteSummary}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <ChoiceVoteBarChart
                  count={choiceCount}
                  mine={choiceMine}
                  maxCount={choiceChartMaxCount}
                  fillColor={palette.label}
                  onPress={onOpenVoteDetails}
                  disabled={choiceCount === 0 || questionAnonymous || answersEditable}
                />
                {questionAnonymous ? (
                  <Text style={[styles.resultText, styles.rankingChartVoteTotal]}>
                    {choiceCount} votes ({choicePct}%)
                  </Text>
                ) : (
                  <TouchableOpacity
                    disabled={choiceCount === 0 || answersEditable}
                    onPress={onOpenVoteDetails}
                  >
                    <Text
                      style={[
                        styles.resultText,
                        styles.rankingChartVoteTotal,
                        choiceCount > 0 && !answersEditable && styles.resultTextLink,
                      ]}
                    >
                      {choiceCount} votes ({choicePct}%)
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        ) : null}
      </View>
    </>
  );
  if (useRankingDrag) {
    return <View style={rowStyle}>{inner}</View>;
  }
  return (
    <TouchableOpacity
      style={rowStyle}
      disabled={!answersEditable}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {inner}
    </TouchableOpacity>
  );
}

export type PollDetailScreenProps = {
  pollId: string;
  variant: 'modal' | 'groups' | 'polls';
  /** Required when variant is `groups` — must match the poll’s group (corrected via redirect if wrong). */
  routeGroupId?: string;
  /** Polls tab / modal: `returnTo` query string for dismiss fallback (modal only). */
  returnToParam?: string | null;
  /** Groups-tab poll detail: breadcrumb-parent navigation callbacks. */
  groupsTabNav?: GroupsTabNavCallbacks;
  /** Polls-tab poll detail: breadcrumb-parent navigation callbacks. */
  pollsTabNav?: PollsTabNavCallbacks;
};

export function PollDetailScreen({
  pollId,
  variant,
  routeGroupId,
  returnToParam,
  groupsTabNav,
  pollsTabNav,
}: PollDetailScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const id = pollId;
  const returnToParsed = useMemo(() => parseReturnToParam(returnToParam ?? undefined), [returnToParam]);
  const { userId } = useCurrentUserContext();
  const { data: poll, isLoading, isError, error: pollError, refetch: refetchPoll } = usePoll(id ?? '', userId ?? '');
  const { data: results, refetch: refetchResults } = usePollResults(id ?? '', userId ?? '', {
    enabled: !isError,
  });
  const { data: group, refetch: refetchGroup } = useGroup(poll?.groupId ?? '', userId ?? '', {
    enabled: !isError,
  });
  const colorGroupId = poll?.groupId ?? routeGroupId ?? '';
  const { data: memberColorData, refetch: refetchMemberColor } = useGroupMemberColor(
    colorGroupId,
    userId ?? '',
  );
  const { data: optionSuggestions = [], refetch: refetchOptionSuggestions } = usePollOptionSuggestions(
    id ?? '',
    userId ?? '',
    !!userId && !isError
  );
  const [rankingDragActive, setRankingDragActive] = useState(false);
  const { refreshControl } = usePullToRefresh(
    [refetchPoll, refetchResults, refetchGroup, refetchMemberColor, refetchOptionSuggestions],
    { enabled: Platform.OS !== 'android' || !rankingDragActive },
  );
  const submitVoteMutation = useSubmitPollVote(id ?? '', userId ?? '');
  const deletePollMutation = useDeletePoll(userId ?? '');
  const updatePollMutation = useUpdatePoll(id ?? '', userId ?? '');
  const closePollMutation = useClosePoll(userId ?? '');
  const setWatchMutation = useSetPollWatch(id ?? '', userId ?? undefined);
  const suggestOptionMutation = useSuggestPollOption(id ?? '', userId ?? '');
  const decideSuggestionMutation = useDecidePollOptionSuggestion(id ?? '', userId ?? '');
  const [selectedByQuestion, setSelectedByQuestion] = useState<Record<string, string[]>>({});
  const [textAnswerByQuestion, setTextAnswerByQuestion] = useState<Record<string, string>>({});
  /** After a saved vote, answers are read-only until user taps "Update answer". */
  const [editingSavedAnswer, setEditingSavedAnswer] = useState(false);
  /** Set after a successful submit so the footer shows Update even before results refetch. */
  const [hasLockedResponse, setHasLockedResponse] = useState(false);
  /** Bumped only when entering ranking edit (Update) so the reorder list remounts cleanly. */
  const [rankingEditSession, setRankingEditSession] = useState(0);
  const [rankingSortMode, setRankingSortMode] = useState<RankingSortMode>('total');
  const [detailModal, setDetailModal] = useState<{
    title: string;
    rows: Array<{
      responder: string;
      answer?: string;
      userId?: string;
      anonymous?: boolean;
      avatarSeed?: string | null;
      thumbnail?: string | null;
    }>;
  } | null>(null);
  /** Question keys that failed required validation (yellow outline until fixed). */
  const [missingRequiredKeys, setMissingRequiredKeys] = useState<string[]>([]);
  const [suggestModal, setSuggestModal] = useState<{ questionKey: string; title: string } | null>(null);
  const [coverLightbox, setCoverLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [suggestLabelDraft, setSuggestLabelDraft] = useState('');
  const [suggestedSuccessQuestionKey, setSuggestedSuccessQuestionKey] = useState<string | null>(null);
  const suggestSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetYRef = useRef(0);
  const textAnswerMountRefs = useRef<Record<string, View | null>>({});
  useEnsureFocusedInputAboveKeyboard(scrollViewRef, scrollOffsetYRef);
  const androidKbPad = useAndroidKeyboardContentPad();
  const questionYInScrollRef = useRef<Record<string, number>>({});
  const parsedQuestions = useMemo(() => (poll ? parseStructuredPollQuestions(poll) : []), [poll]);


  const hasVoteInResults = useMemo(
    () => pollResultsHasViewerVote(results, userId),
    [results, userId],
  );

  const hasSavedVote = hasVoteInResults || hasLockedResponse;

  const watchDefaultForViewer = poll ? !!poll.viewerWatchDefault : false;
  const effectiveWatching = poll ? (poll.viewerWatching ?? watchDefaultForViewer) : false;
  const answersEditable = !hasSavedVote || editingSavedAnswer;

  const userColorHex =
    memberColorData?.colorHex || getDefaultGroupThemeFromName(group?.name ?? 'Group');
  const palette = getGroupColor(userColorHex);

  const canDeletePollCoverPhotos = useMemo(() => {
    if (!poll || !userId) return false;
    return canDeleteManagedMedia({
      currentUserId: userId,
      group,
      resourceOwnerId: poll.createdBy,
    });
  }, [poll, userId, group]);
  const canDeletePoll = useMemo(() => {
    if (!poll || !userId) return false;
    if (poll.createdBy === userId) return true;
    return group?.membershipStatus === 'admin' || group?.ownerId === userId;
  }, [poll, userId, group?.membershipStatus, group?.ownerId]);
  const pollDeadlineDate = useMemo(() => {
    if (!poll?.deadline) return null;
    const d = new Date(poll.deadline);
    return Number.isFinite(d.getTime()) ? d : null;
  }, [poll?.deadline]);
  const pollWithCloseState = poll as
    | (Poll & {
        closedAt?: string;
        closedBy?: string;
        closedByName?: string;
        closed?: boolean;
        isClosed?: boolean;
        status?: string;
      })
    | undefined;
  const hasManualCloseMarker = useMemo(() => {
    if (!pollWithCloseState) return false;
    return Boolean(
      pollWithCloseState.closedAt ||
        pollWithCloseState.closedBy ||
        pollWithCloseState.closedByName ||
        pollWithCloseState.closed === true ||
        pollWithCloseState.isClosed === true ||
        String(pollWithCloseState.status || '').toLowerCase() === 'closed'
    );
  }, [pollWithCloseState]);
  const pollClosedAtDate = useMemo(() => {
    if (!pollWithCloseState?.closedAt) return null;
    const d = new Date(pollWithCloseState.closedAt);
    return Number.isFinite(d.getTime()) ? d : null;
  }, [pollWithCloseState?.closedAt]);
  const isPollClosed = useMemo(() => {
    if (!poll) return false;
    if (hasManualCloseMarker) return true;
    return !!(pollDeadlineDate && pollDeadlineDate.getTime() <= Date.now());
  }, [poll, hasManualCloseMarker, pollDeadlineDate]);
  const canEditPoll = useMemo(
    () => !!poll && !!userId && poll.createdBy === userId && !isPollClosed,
    [poll, userId, isPollClosed],
  );
  const canClosePoll = useMemo(() => {
    if (!poll || !userId || isPollClosed) return false;
    if (poll.createdBy === userId) return true;
    return group?.membershipStatus === 'admin' || group?.ownerId === userId;
  }, [poll, userId, group?.membershipStatus, group?.ownerId, isPollClosed]);
  const canDecideSuggestions = useMemo(() => {
    if (!poll || !userId || isPollClosed) return false;
    if (poll.createdBy === userId) return true;
    return group?.membershipStatus === 'admin' || group?.ownerId === userId;
  }, [poll, userId, group?.membershipStatus, group?.ownerId, isPollClosed]);
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
    setHasLockedResponse(false);
    setRankingEditSession(0);
    setRankingSortMode('total');
    setMissingRequiredKeys([]);
    questionYInScrollRef.current = {};
  }, [id]);

  useEffect(() => {
    if (hasVoteInResults) setHasLockedResponse(true);
  }, [hasVoteInResults]);

  useEffect(() => {
    return () => {
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
    if (!results || parsedQuestions.length === 0 || rankingDragActive || editingSavedAnswer) {
      return;
    }
    setSelectedByQuestion(selectedByQuestionFromResults(results, parsedQuestions));
  }, [results, parsedQuestions, editingSavedAnswer, rankingDragActive]);

  useEffect(() => {
    if (!editingSavedAnswer) return;
    setRankingDragActive(false);
    const frame = requestAnimationFrame(() => {
      scrollViewRef.current?.setNativeProps({ scrollEnabled: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [editingSavedAnswer, rankingEditSession]);

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

  useEffect(() => {
    if (variant !== 'groups' || !routeGroupId || !poll) return;
    if (poll.groupId !== routeGroupId) {
      router.replace(`/(tabs)/groups/${poll.groupId}/polls/${id}` as Href);
    }
  }, [variant, routeGroupId, poll?.groupId, poll, id, router]);

  const openGroupOverview = useCallback(() => {
    if (!poll?.groupId) return;
    navigateToGroupsTabGroupOverview(router, poll.groupId, {
      withinGroupsTab: variant === 'groups',
      groupsTabNav,
    });
  }, [poll?.groupId, router, variant, groupsTabNav]);

  const dismiss = () => {
    if (variant === 'groups' && routeGroupId && id) {
      const parent = groupsTabParentHref(routeGroupId, { kind: 'poll', pollId: id });
      if (parent) {
        navigateGroupsTabTo(router, parent, routeGroupId, groupsTabNav);
        return;
      }
    }
    if (variant === 'polls') {
      navigatePollsTabTo(router, ALL_POLLS_HREF, pollsTabNav);
      return;
    }
    if (returnToParsed) {
      router.replace(returnToParsed as Href);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/events');
  };

  useMissingResourceAlert(
    'poll',
    !!id && isMissingQueryError(isError, pollError),
    dismiss
  );
  const pollJoinInfo = isError ? parseNotGroupMemberError(pollError) : null;
  useShareLinkJoinPrompt({
    kind: 'poll',
    userId,
    joinInfo: pollJoinInfo,
    onDismiss: dismiss,
    onJoined: () => {
      void refetchPoll();
    },
  });

  const onDeletePoll = useCallback(() => {
    if (!id || !userId) return;
    const run = async () => {
      try {
        await deletePollMutation.mutateAsync(id);
        router.replace(
          (variant === 'groups' && routeGroupId
            ? `/(tabs)/groups/${routeGroupId}/polls`
            : '/(tabs)/polls') as Href
        );
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
  }, [deletePollMutation, id, router, userId, variant, routeGroupId]);

  const confirmRemovePollCoverPhoto = (url: string) => {
    if (!poll || !userId || !canDeletePollCoverPhotos) return;
    const run = async () => {
      const next = (poll.coverPhotos ?? []).filter((u) => u !== url);
      try {
        await updatePollMutation.mutateAsync(pollToUpdateInput(poll, next));
        deleteManagedUploadFireAndForget(userId, url);
        setCoverLightbox((cur) => (cur ? dropLightboxItem(cur, url) : cur));
      } catch (e: unknown) {
        Alert.alert('Could not delete photo', apiErrorMessage(e));
      }
    };
    void run();
  };

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
      const formatted = new Date(poll.deadline).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      return `Closes by ${formatted}`;
    } catch {
      return `Closes by ${String(poll.deadline)}`;
    }
  }, [poll?.deadline]);

  const pollClosedLine = useMemo(() => {
    if (!isPollClosed) return null;
    const closedOnDate = hasManualCloseMarker ? pollClosedAtDate ?? pollDeadlineDate : pollDeadlineDate;
    const closedOnText = closedOnDate
      ? closedOnDate.toLocaleString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'unknown time';

    const manuallyClosedBeforeDeadline = Boolean(
      hasManualCloseMarker &&
        pollClosedAtDate &&
        pollDeadlineDate &&
        pollClosedAtDate.getTime() < pollDeadlineDate.getTime()
    );

    if (manuallyClosedBeforeDeadline) {
      const by = (pollWithCloseState?.closedByName || pollWithCloseState?.closedBy || '').trim();
      if (by) return `Closed on ${closedOnText} (by ${by})`;
    }
    return `Closed on ${closedOnText}`;
  }, [
    isPollClosed,
    hasManualCloseMarker,
    pollClosedAtDate,
    pollDeadlineDate,
    pollWithCloseState?.closedByName,
    pollWithCloseState?.closedBy,
  ]);

  const isPageVariant = variant === 'groups' || variant === 'polls';
  const actionPlacement = isPageVariant ? 'chrome' : 'modal';
  const pollToolbar = (
    <>
      {id ? (
        <DetailActionIcon
          placement={actionPlacement}
          onPress={() =>
            void sharePoll(id, {
              title: poll?.title ?? '',
              description: poll?.description,
              deadline: poll?.deadline,
              closed: isPollClosed,
              groupName: group?.name,
            })
          }
          accessibilityLabel="Share poll"
        >
          <Ionicons name="share-outline" size={actionPlacement === 'chrome' ? 18 : 20} color={Colors.text} />
        </DetailActionIcon>
      ) : null}
      {userId ? (
        <DetailActionIcon
          placement={actionPlacement}
          onPress={() => {
            void (async () => {
              try {
                await setWatchMutation.mutateAsync({ watching: !effectiveWatching });
              } catch (e: unknown) {
                const err = e as { body?: { message?: string }; message?: string };
                Alert.alert(
                  'Could not update poll notifications',
                  err?.body?.message || err?.message || 'Please try again.',
                );
              }
            })();
          }}
          disabled={setWatchMutation.isPending}
          accessibilityLabel={
            effectiveWatching
              ? 'Watching this poll — tap to stop default notifications'
              : 'Not watching — tap to get default poll notifications'
          }
        >
          <Ionicons
            name={effectiveWatching ? 'eye' : 'eye-off-outline'}
            size={actionPlacement === 'chrome' ? 18 : 22}
            color={Colors.text}
          />
        </DetailActionIcon>
      ) : null}
      {canEditPoll && id ? (
        <DetailActionIcon
          placement={actionPlacement}
          onPress={() => router.push(withReturnTo(`/create-poll?editId=${encodeURIComponent(id)}`, pathname))}
          accessibilityLabel="Edit poll"
        >
          <Ionicons name="create-outline" size={actionPlacement === 'chrome' ? 18 : 20} color={Colors.text} />
        </DetailActionIcon>
      ) : null}
      {canDeletePoll ? (
        <DetailActionIcon
          placement={actionPlacement}
          onPress={onDeletePoll}
          disabled={deletePollMutation.isPending}
          accessibilityLabel="Delete poll"
        >
          <Ionicons name="trash-outline" size={actionPlacement === 'chrome' ? 18 : 20} color={Colors.text} />
        </DetailActionIcon>
      ) : null}
    </>
  );

  const sheetBody = (
      <View style={styles.safe}>
        {isPageVariant ? (
          <RegisterChromeHeader
            trailing={<ChromeHeaderTrailingRow>{pollToolbar}</ChromeHeaderTrailingRow>}
            theme={{ backgroundColor: palette.row, borderBottomColor: palette.label }}
          />
        ) : (
        <View style={[modalTopBarStyles.bar, { backgroundColor: palette.row, borderBottomColor: palette.label }]}>
          <TouchableOpacity
            onPress={dismiss}
            style={modalTopBarStyles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={26} color={Colors.textSub} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          {pollToolbar}
        </View>
        )}

        <ScrollViewContainer
          ref={scrollViewRef}
          style={styles.eventScrollView}
          contentContainerStyle={[
            styles.eventScrollContent,
            androidKbPad > 0 && { paddingBottom: 14 + androidKbPad },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          onScroll={(e) => {
            scrollOffsetYRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          {...keyboardAwareScrollProps}
        >
          {!id || !userId ? (
            <Text style={styles.muted}>Missing poll or user.</Text>
          ) : isLoading ? (
            <ActivityIndicator color={Colors.accent} style={{ marginTop: 24 }} />
          ) : isError || !poll ? (
            <Text style={styles.muted}>Could not load this poll.</Text>
          ) : (
            <>
            <View style={styles.eventMainCardWrap}>
              <View style={styles.eventMainCard}>
                <View style={[styles.pollPad, styles.pollHeaderPad]}>
                  <Text style={styles.pollTitle} numberOfLines={isPageVariant ? 8 : undefined}>
                    {poll.title}
                  </Text>
                  {poll.description?.trim() ? (
                    <View style={[styles.descBox, { marginTop: 6 }]}>
                      <Text style={styles.descText}>{poll.description.trim()}</Text>
                    </View>
                  ) : null}
                </View>

                {poll.coverPhotos && poll.coverPhotos.length > 0 ? (
                  <View style={{ marginTop: poll.description?.trim() ? 6 : 10 }}>
                    <View style={styles.pollPad}>
                      <Text style={styles.sectionLabel}>Photos · {poll.coverPhotos.length}</Text>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{
                        gap: 8,
                        paddingHorizontal: POLL_H_PAD,
                        paddingTop: 6,
                        paddingBottom: 8,
                      }}
                    >
                      {poll.coverPhotos.map((url, i) => (
                        <TouchableOpacity
                          key={url}
                          onPress={() =>
                            setCoverLightbox({ urls: poll.coverPhotos ?? [], index: i })
                          }
                          activeOpacity={0.9}
                        >
                          <ResolvableImage
                            storedUrl={url}
                            style={{
                              width: POLL_COVER_PHOTO_SIZE,
                              height: POLL_COVER_PHOTO_SIZE,
                              borderRadius: Radius.lg,
                            }}
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                <View style={[styles.pollPad, styles.pollMetaBlock]}>
                  <View style={styles.infoRow}>
                    <Ionicons name="calendar-outline" size={20} color={Colors.textSub} style={styles.infoRowIcon} />
                    <Text style={styles.infoText}>{deadlineLabel}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="person-outline" size={20} color={Colors.textSub} style={styles.infoRowIcon} />
                    <Text style={styles.infoText} numberOfLines={2}>
                      Created by{' '}
                      {((poll as Poll & { createdByName?: string }).createdByName?.trim()) || poll.createdBy}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="time-outline" size={20} color={Colors.textSub} style={styles.infoRowIcon} />
                    <Text style={styles.infoText} numberOfLines={2}>
                      Created at {formatCreatedAtLabel(poll.createdAt)}
                      {isContentEdited(poll.createdAt, poll.updatedAt) ? ' · Edited' : ''}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="people-outline" size={20} color={Colors.textSub} style={styles.infoRowIcon} />
                    <TouchableOpacity onPress={openGroupOverview} activeOpacity={0.7} style={{ flex: 1 }}>
                      <Text style={styles.infoText}>{group?.name ?? 'Group'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>

                {parsedQuestions.length > 0 ? (
                  <View style={[styles.pollScrollInset, styles.pollQuestionsHeading]}>
                    <Text style={styles.sectionLabel}>Questions</Text>
                  </View>
                ) : null}

                {parsedQuestions.map((q, qIdx) => {
                  const showTextInput = q.type === 'text' && answersEditable;
                  const pendingForQuestion = optionSuggestions.filter(
                    (s) => s.questionKey === q.key && s.status === 'pending',
                  );
                  const showRequiredHighlight = missingRequiredKeys.includes(q.key);
                  const questionMeta: string[] = [];
                  if (q.type === 'multiple') questionMeta.push('Multiple choice');
                  if (q.type === 'rating') questionMeta.push('Ranking');
                  if (q.anonymousVotes) questionMeta.push('Anonymous');
                  const resultQuestion = results?.questions.find((rq) => rq.questionKey === q.key);
                  const useRankingList = q.type === 'rating';
                  const useRankingDrag = answersEditable && useRankingList && !isPollClosed;
                  const questionAnonymousVotes = !!(poll.anonymousVotes || resultQuestion?.anonymousVotes);
                  const useRankingChartPreview =
                    answersEditable && q.type === 'rating' && !!userId && !questionAnonymousVotes;
                  const rankingChartMaxCount =
                    q.type === 'rating'
                      ? rankingMaxVoteCountAcrossOptions(
                          resultQuestion,
                          3,
                          userId,
                          selectedByQuestion[q.key] ?? [],
                          useRankingChartPreview,
                        )
                      : 1;
                  const showRankingCharts = q.type === 'rating' && !!results;
                  const rankingPlacementOptions =
                    q.type === 'rating'
                      ? rankingPlacementScoresForQuestion(
                          resultQuestion,
                          q.options.length,
                          userId,
                          selectedByQuestion[q.key] ?? [],
                          useRankingChartPreview,
                        )
                      : undefined;
                  const showRankingSortToggle = useRankingList && !useRankingDrag;
                  const optionsForDisplay = useRankingList
                    ? showRankingSortToggle && rankingSortMode === 'total'
                      ? rankingOptionsForTotal(q.options, rankingPlacementOptions)
                      : rankingOptionsForEdit(q.options, selectedByQuestion[q.key] ?? [])
                    : q.options;
                  const useChoiceChartPreview =
                    answersEditable &&
                    (q.type === 'single' || q.type === 'multiple') &&
                    !!userId &&
                    !questionAnonymousVotes;
                  const choiceChartMaxCount =
                    q.type === 'single' || q.type === 'multiple'
                      ? choiceMaxVoteCountAcrossOptions(
                          resultQuestion,
                          userId,
                          selectedByQuestion[q.key] ?? [],
                          useChoiceChartPreview,
                        )
                      : 1;
                  const choiceQuestionTotalVotes =
                    q.type === 'single' || q.type === 'multiple'
                      ? choiceTotalVotesForQuestion(
                          resultQuestion,
                          userId,
                          selectedByQuestion[q.key] ?? [],
                          useChoiceChartPreview,
                        )
                      : 0;
                  const useQuestionResponsePreview =
                    answersEditable && q.type !== 'text' && !!userId && !questionAnonymousVotes;
                  const questionResponderTotal = results
                    ? questionResponderCount(
                        resultQuestion,
                        q,
                        userId,
                        selectedByQuestion[q.key] ?? [],
                        useQuestionResponsePreview,
                      )
                    : null;
                  const openQuestionRespondersModal = () => {
                    if (!resultQuestion) return;
                    setDetailModal({
                      title: `${q.title} responses`,
                      rows: questionResponderModalRows(resultQuestion, q),
                    });
                  };
                  const showQuestionRespondersModal = canOpenQuestionRespondersModal(
                    resultQuestion,
                    q,
                    questionAnonymousVotes,
                  );
                  const buildPollOptionRowProps = (
                    opt: { id: string; label: string },
                  ): Omit<PollVoteOptionRowProps, 'drag' | 'isActive'> => {
                    const sel = selectedByQuestion[q.key] ?? [];
                    const selected = sel.includes(opt.id);
                    const rank = selected ? sel.indexOf(opt.id) + 1 : 0;
                    const suggestedBy = acceptedSuggestionByQuestionLabel.get(
                      `${q.key}::${opt.label.trim().toLowerCase()}`,
                    );
                    const resultOption = resultQuestion?.options.find((ro) => ro.optionId === opt.id);
                    return {
                      opt,
                      q,
                      poll,
                      palette,
                      selected,
                      rank,
                      answersEditable,
                      results,
                      resultQuestion,
                      rankingChartMaxCount,
                      showRankingCharts,
                      choiceChartMaxCount,
                      choiceQuestionTotalVotes,
                      userId,
                      useRankingChartPreview,
                      useChoiceChartPreview,
                      rankingPlacementOptions,
                      suggestedBy,
                      onPress: () => {
                        if (!answersEditable) return;
                        setSelectedByQuestion((prev) => {
                          const before = prev[q.key] ?? [];
                          if (q.type === 'multiple') {
                            const next = before.includes(opt.id)
                              ? before.filter((oid) => oid !== opt.id)
                              : [...before, opt.id];
                            return { ...prev, [q.key]: next };
                          }
                          if (before.includes(opt.id)) {
                            return { ...prev, [q.key]: [] };
                          }
                          return { ...prev, [q.key]: [opt.id] };
                        });
                      },
                      onOpenRankingDetails: questionAnonymousVotes
                        ? undefined
                        : () =>
                            setDetailModal({
                              title: opt.label,
                              rows: (resultOption?.voters ?? [])
                                .slice()
                                .sort(
                                  (a, b) =>
                                    (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER),
                                )
                                .map((v) => ({
                                  responder: v.userName,
                                  answer: `#${v.rank ?? '—'}`,
                                  userId: v.userId,
                                  anonymous: false,
                                  avatarSeed: v.avatarSeed,
                                  thumbnail: v.thumbnail,
                                })),
                            }),
                      onOpenVoteDetails: () =>
                        setDetailModal({
                          title: opt.label,
                          rows: (resultOption?.voters ?? []).map((v) => ({
                            responder: v.userName,
                            userId: v.userId,
                            anonymous: false,
                            avatarSeed: v.avatarSeed,
                            thumbnail: v.thumbnail,
                          })),
                        }),
                    };
                  };
                  return (
                  <View
                    key={q.key}
                    style={[styles.pollScrollInset, qIdx > 0 && styles.pollSectionGap]}
                    onLayout={(e) => {
                      questionYInScrollRef.current[q.key] = e.nativeEvent.layout.y;
                    }}
                  >
                    <View
                      style={[
                        styles.pollSectionCard,
                        showRequiredHighlight && styles.pollQBlockMissing,
                      ]}
                    >
                    <View style={styles.pollSectionPad}>
                    <View style={styles.questionHeader}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.questionTitle}>
                          {q.index}. {q.title}
                          {q.required ? <Text style={styles.questionRequiredStar}> *</Text> : null}
                        </Text>
                        {questionMeta.length > 0 || showRankingSortToggle ? (
                          <View style={styles.questionMetaRow}>
                            {questionMeta.length > 0 ? (
                              <Text style={styles.questionMetaText} numberOfLines={1}>
                                {questionMeta.join(' · ')}
                              </Text>
                            ) : null}
                            {showRankingSortToggle ? (
                              <View
                                style={styles.rankingSortToggle}
                                accessibilityRole="tablist"
                                accessibilityLabel="Ranking sort order"
                              >
                                  <TouchableOpacity
                                    style={[
                                      styles.rankingSortOption,
                                      rankingSortMode === 'total' && styles.rankingSortOptionSelected,
                                    ]}
                                    onPress={() => setRankingSortMode('total')}
                                    accessibilityRole="tab"
                                    accessibilityState={{ selected: rankingSortMode === 'total' }}
                                    accessibilityLabel="Overall"
                                  >
                                    <Text
                                      style={[
                                        styles.rankingSortOptionText,
                                        rankingSortMode === 'total' && styles.rankingSortOptionTextSelected,
                                      ]}
                                    >
                                      Overall
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[
                                      styles.rankingSortOption,
                                      rankingSortMode === 'mine' && styles.rankingSortOptionSelected,
                                    ]}
                                    onPress={() => setRankingSortMode('mine')}
                                    accessibilityRole="tab"
                                    accessibilityState={{ selected: rankingSortMode === 'mine' }}
                                    accessibilityLabel="My rankings"
                                  >
                                    <Text
                                      style={[
                                        styles.rankingSortOptionText,
                                        rankingSortMode === 'mine' && styles.rankingSortOptionTextSelected,
                                      ]}
                                    >
                                      My rankings
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.pollQuestionBody}>
                      {q.type === 'text' ? (
                        <>
                          {showTextInput ? (
                          <View
                            ref={(node) => {
                              textAnswerMountRefs.current[q.key] = node;
                            }}
                            collapsable={false}
                          >
                          <TextInput
                            value={textAnswerByQuestion[q.key] ?? ''}
                            onChangeText={(v) =>
                              setTextAnswerByQuestion((prev) => ({
                                ...prev,
                                [q.key]: v.replace(/\r\n|\r|\n/g, ' '),
                              }))
                            }
                            onFocus={() =>
                              createScrollAboveKeyboardOnFocus({
                                scrollRef: scrollViewRef,
                                scrollOffsetYRef,
                                targetRef: { current: textAnswerMountRefs.current[q.key] ?? null },
                              })()
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
                          </View>
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
                        </>
                      ) : null}
                      {useRankingDrag ? (
                        <PollRankingReorderList
                          key={`ranking-${q.key}-${rankingEditSession}`}
                          data={optionsForDisplay}
                          keyExtractor={(item) => item.id}
                          onDragActiveChange={setRankingDragActive}
                          onReorder={(from, to) => {
                            setSelectedByQuestion((prev) => {
                              const ordered = rankingOptionsForEdit(q.options, prev[q.key] ?? []);
                              return {
                                ...prev,
                                [q.key]: reorderItems(ordered, from, to).map((o) => o.id),
                              };
                            });
                          }}
                          renderItem={({ item: opt }) => (
                            <RankingPollOptionRowShell dragLabel={`Reorder ${opt.label}`}>
                              <PollVoteOptionRow
                                {...buildPollOptionRowProps(opt)}
                                embeddedInReorderShell
                              />
                            </RankingPollOptionRowShell>
                          )}
                          ItemSeparator={() => <View style={styles.rankingOptionGap} />}
                        />
                      ) : (
                        optionsForDisplay.map((opt) => (
                          <View key={opt.id}>
                            <PollVoteOptionRow {...buildPollOptionRowProps(opt)} />
                          </View>
                        ))
                      )}
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
                          <Ionicons name="add-circle-outline" size={18} color={Colors.textMuted} />
                          <Text style={styles.suggestOptionBtnText}>Suggest a different option</Text>
                        </TouchableOpacity>
                      ) : null}
                      {editingSavedAnswer &&
                      q.type === 'rating' &&
                      (results?.myOptionIds ?? []).some((oid) => q.options.some((o) => o.id === oid)) ? (
                        <TouchableOpacity
                          style={styles.rankingResetBtn}
                          onPress={() => {
                            setSelectedByQuestion((prev) => ({ ...prev, [q.key]: [] }));
                            setMissingRequiredKeys((prev) => prev.filter((key) => key !== q.key));
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Reset your ranking for ${q.title}`}
                        >
                          <Ionicons name="refresh-outline" size={18} color={Colors.textMuted} />
                          <Text style={styles.rankingResetBtnText}>Reset my ranking</Text>
                        </TouchableOpacity>
                      ) : null}
                      {suggestedSuccessQuestionKey === q.key ? (
                        <Text style={styles.suggestSuccessText}>Option submitted successfully.</Text>
                      ) : null}
                      {q.type !== 'text' && pendingForQuestion.length > 0 ? (
                        <View style={styles.pendingSuggestionsBox}>
                          {pendingForQuestion.map((s) => (
                            <View key={s.id} style={styles.pendingSuggestionRow}>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={styles.pendingSuggestionLabel} numberOfLines={2}>
                                  {s.label}
                                </Text>
                                <Text style={styles.pendingSuggestionMeta} numberOfLines={1}>
                                  {(s.suggesterName || 'Member').trim() || 'Member'} · pending
                                </Text>
                              </View>
                              {canDecideSuggestions ? (
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
                                          Alert.alert('Could not update', apiErrorMessage(e));
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
                                          Alert.alert('Could not update', apiErrorMessage(e));
                                        }
                                      })();
                                    }}
                                  >
                                    <Text style={styles.pendingSuggestionBtnTextAccept}>Accept</Text>
                                  </TouchableOpacity>
                                </View>
                              ) : null}
                            </View>
                          ))}
                        </View>
                      ) : null}
                      {questionResponderTotal !== null ? (
                        showQuestionRespondersModal ? (
                          <TouchableOpacity
                            style={styles.questionResponderFooter}
                            onPress={openQuestionRespondersModal}
                            accessibilityRole="button"
                            accessibilityLabel={`View ${questionResponderLabel(questionResponderTotal)}`}
                          >
                            <Text style={[styles.questionResponderText, styles.questionResponderTextLink]}>
                              {questionResponderLabel(questionResponderTotal)}
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={[styles.questionResponderText, styles.questionResponderFooter]}>
                            {questionResponderLabel(questionResponderTotal)}
                          </Text>
                        )
                      ) : null}
                    </View>
                    </View>
                    </View>
                  </View>
                );
                })}

            <View style={[styles.pollScrollInset, styles.pollSectionGap]}>
              <View style={styles.pollSectionCard}>
                <View style={styles.pollFooterActions}>
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
                      if (results) {
                        setSelectedByQuestion(selectedByQuestionFromResults(results, parsedQuestions));
                      }
                      setEditingSavedAnswer(true);
                      setRankingEditSession((n) => n + 1);
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
                          const yQ = questionYInScrollRef.current[firstKey ?? ''];
                          if (firstKey != null && yQ !== undefined) {
                            scrollViewRef.current?.scrollTo({
                              y: Math.max(0, yQ - 24),
                              animated: true,
                            });
                          }
                        });
                      });
                      Alert.alert('Required questions', 'Please answer every required question before submitting.');
                      return;
                    }
                    setMissingRequiredKeys([]);
                    const optionIds = parsedQuestions.flatMap((pq) => selectedByQuestion[pq.key] ?? []);
                    const textAnswers = parsedQuestions
                      .filter((pq) => pq.type === 'text')
                      .map((pq) => ({
                        questionKey: pq.key,
                        answer: (textAnswerByQuestion[pq.key] ?? '').trim(),
                      }))
                      .filter((x) => x.answer.length > 0);
                    try {
                      const freshResults = await submitVoteMutation.mutateAsync({ optionIds, textAnswers });
                      setSelectedByQuestion(selectedByQuestionFromResults(freshResults, parsedQuestions));
                      setHasLockedResponse(true);
                      setEditingSavedAnswer(false);
                      setRankingDragActive(false);
                      setMissingRequiredKeys([]);
                      await refetchResults();
                      Toast.show({ type: 'success', text1: 'Saved' });
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
                {pollClosedLine ? <Text style={styles.closedByText}>{pollClosedLine}</Text> : null}
                </View>
              </View>
            </View>
            </>
          )}
        </ScrollViewContainer>

        <Modal
          visible={!!detailModal}
          transparent
          animationType="fade"
          onRequestClose={() => setDetailModal(null)}
          {...edgeToEdgeModalProps}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{detailModal?.title ?? ''}</Text>
              <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }}>
                {(detailModal?.rows ?? []).map((r, i) => {
                  const responder = r.responder?.trim() || '';
                  const answer = r.answer?.trim() || '';
                  const seed = responder || r.userId || '?';
                  return (
                    <View key={`${i}-${r.userId ?? responder}`} style={styles.modalRowCard}>
                      <View style={styles.modalAvatarWrap}>
                        <UserAvatar
                          seed={seed}
                          backgroundColor={r.avatarSeed ? [r.avatarSeed] : undefined}
                          thumbnail={r.thumbnail}
                          size={30}
                        />
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
          {...edgeToEdgeModalProps}
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
                      Alert.alert('Could not send suggestion', apiErrorMessage(e));
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
        <ImageLightboxModal
          visible={coverLightbox !== null}
          urls={coverLightbox?.urls ?? []}
          index={coverLightbox?.index ?? 0}
          onChangeIndex={(nextIndex) =>
            setCoverLightbox((prev) => (prev ? { ...prev, index: nextIndex } : prev))
          }
          onClose={() => setCoverLightbox(null)}
          onDelete={canDeletePollCoverPhotos ? confirmRemovePollCoverPhoto : undefined}
          headerAvatar={
            <UserAvatar
              seed={(poll?.createdByName?.trim()) || poll?.createdBy || 'Poll'}
              size={28}
            />
          }
          title={(poll?.createdByName?.trim()) || poll?.createdBy || 'Poll'}
          subtitle={
            coverLightbox
              ? coverLightbox.urls.length > 1
                ? `Photos · ${coverLightbox.index + 1} of ${coverLightbox.urls.length}`
                : 'Photo'
              : undefined
          }
        />
      </View>
  );

  if (variant === 'groups' || variant === 'polls') {
    return sheetBody;
  }

  return <EventFormPopoverChrome onClose={dismiss}>{sheetBody}</EventFormPopoverChrome>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  eventScrollView: { flex: 1, backgroundColor: Colors.bg },
  eventScrollContent: { flexGrow: 1, backgroundColor: Colors.bg, paddingBottom: 14 },
  eventMainCardWrap: { marginHorizontal: POLL_SIDE_MARGIN, marginTop: 4, marginBottom: 4 },
  pollScrollInset: { marginHorizontal: POLL_SIDE_MARGIN, marginBottom: 4 },
  pollSectionGap: { marginTop: 14 },
  pollSectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderStrong,
    overflow: 'hidden',
  },
  pollSectionPad: { paddingHorizontal: POLL_H_PAD, paddingVertical: 14 },
  pollQuestionBody: {
    gap: 8,
  },
  pollPad: { paddingHorizontal: POLL_H_PAD },
  pollHeaderPad: { paddingTop: 16, paddingBottom: 10 },
  pollMetaBlock: { gap: 8, marginTop: 8, paddingBottom: 14 },
  pollQuestionsHeading: { marginTop: 14, marginBottom: 10 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoRowIcon: { width: 22 },
  infoText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    lineHeight: 20,
  },
  eventMainCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderStrong,
    overflow: 'hidden',
  },
  pollTitle: {
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
    padding: 10,
  },
  descText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.text,
    lineHeight: 22,
  },
  pollQBlockMissing: {
    borderWidth: 2,
    borderColor: '#CA8A04',
    backgroundColor: '#FFFBEB',
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
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
  questionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 3,
    minWidth: 0,
  },
  questionMetaText: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  rankingSortToggle: {
    flexShrink: 0,
    flexDirection: 'row',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    overflow: 'hidden',
  },
  rankingSortOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rankingSortOptionSelected: {
    backgroundColor: Colors.accent,
  },
  rankingSortOptionText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.textSub,
  },
  rankingSortOptionTextSelected: {
    color: Colors.accentFg,
    fontFamily: Fonts.semiBold,
  },
  voteOptionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  voteOptionRowSelected: {
    borderColor: '#9CA3AF',
  },
  voteOptionRowDragging: {
    zIndex: 2,
    transform: [{ translateY: -3 }],
    borderColor: '#9CA3AF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  rankingOptionGap: {
    height: 8,
  },
  voteOptionRowGold: { borderColor: '#FCD34D' },
  voteOptionRowGoldFill: { backgroundColor: '#FEF3C7' },
  voteOptionRowSilver: { borderColor: '#CBD5E1' },
  voteOptionRowSilverFill: { backgroundColor: '#F1F5F9' },
  voteOptionRowBronze: { borderColor: '#FDBA74' },
  voteOptionRowBronzeFill: { backgroundColor: '#FEE2E2' },
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
  optionTopRowRanking: {
    position: 'relative',
    minHeight: 26,
    paddingRight: 44,
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  rankBadgeRankingSlot: {
    position: 'absolute',
    right: 0,
    top: 0,
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
  questionResponderFooter: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  questionResponderText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
  },
  questionResponderTextLink: {
    textDecorationLine: 'underline',
  },
  resultWrap: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultWrapRanking: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 4,
    marginTop: 6,
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
  rankingChartPressable: {
    width: '100%',
  },
  rankingChart: {
    width: '100%',
    gap: 4,
  },
  rankingChartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 14,
  },
  rankingChartRank: {
    width: 22,
    fontSize: 10,
    fontFamily: Fonts.semiBold,
    color: '#6B7280',
    textAlign: 'left',
  },
  rankingChartBarArea: {
    flex: 1,
    minWidth: 0,
  },
  rankingChartBarWithCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  rankingChartTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
    minWidth: 2,
  },
  rankingChartFillRow: {
    flexDirection: 'row',
    height: '100%',
    width: '100%',
    borderRadius: 4,
    overflow: 'hidden',
  },
  rankingChartFillSegment: {
    height: '100%',
    minWidth: 2,
  },
  rankingChartCount: {
    fontSize: 10,
    fontFamily: Fonts.medium,
    color: '#6B7280',
    flexShrink: 0,
  },
  rankingChartVoteTotal: {
    alignSelf: 'flex-end',
    minWidth: 0,
  },
  pollFooterActions: {
    paddingHorizontal: POLL_H_PAD,
    paddingTop: 14,
    paddingBottom: 14,
  },
  submitVoteBtn: {
    marginTop: 0,
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
    marginTop: 8,
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
    marginTop: 8,
    marginBottom: 0,
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
    flexGrow: 0,
    alignSelf: 'center',
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
  modalAvatarWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
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
  suggestOptionBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.textMuted },
  rankingResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    marginTop: 0,
  },
  rankingResetBtnText: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
  },
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
