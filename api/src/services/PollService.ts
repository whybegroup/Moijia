import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import type {
  Poll,
  PollInput,
  PollOption,
  PollOptionInput,
  PollOptionSuggestion,
  PollOptionSuggestionDecisionResult,
  PollQuestionResult,
  PollResults,
  PollTextFont,
  PollWatchInput,
} from '../models';
import { NotificationService } from './NotificationService';

const prisma = new PrismaClient();
const notificationService = new NotificationService();
const MAX_OPTIONS_PER_QUESTION = 50;

function sanitizePollHtml(html: string): string {
  let s = html.replace(/<\/(?:script|iframe|object|embed)[^>]*>/gi, '');
  s = s.replace(/<(?:script|iframe|object|embed)\b[^>]*>[\s\S]*?<\/(?:script|iframe|object|embed)>/gi, '');
  s = s.replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/javascript:/gi, '');
  return s.slice(0, 50000);
}

function stripTagsForLength(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtmlPlain(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeTextHtml(raw: string | undefined, font: PollTextFont): string {
  const t = (raw ?? '').trim();
  if (!t) return `<p style="font-family: ${fontFamilyCss(font)}"></p>`;
  if (t.startsWith('<')) return sanitizePollHtml(t);
  return `<p style="font-family: ${fontFamilyCss(font)}">${escapeHtmlPlain(t)}</p>`;
}

function fontFamilyCss(f: PollTextFont): string {
  switch (f) {
    case 'serif':
      return 'Georgia, "Times New Roman", serif';
    case 'mono':
      return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    default:
      return 'DM Sans, system-ui, -apple-system, sans-serif';
  }
}

function parseFont(v: string | undefined): PollTextFont {
  if (v === 'serif' || v === 'mono') return v;
  return 'sans';
}

type ParsedQuestionMeta = {
  questionKey: string;
  questionIndex: number;
  questionTitle: string;
  questionType: 'single' | 'multiple' | 'rating' | 'text';
  optionLabel: string;
  anonymousVotes: boolean;
};

function parseQuestionMetaFromOptionText(text: string): ParsedQuestionMeta | null {
  const re = /^Q(\d+):\s*(.*?)\s*\[(.*?)\]\s*-\s*(.*)$/i;
  const m = text.match(re);
  if (!m) return null;
  const idx = Number(m[1]);
  const title = m[2].trim();
  const rawType = m[3].trim().toLowerCase();
  const tokens = rawType.split('|').map((t) => t.trim()).filter(Boolean);
  const baseType = tokens[0] ?? rawType;
  const anonymousVotes = tokens.includes('anon') || tokens.includes('anonymous');
  const optionLabel = m[4].trim();
  const questionType =
    baseType.includes('text')
      ? 'text'
      : baseType.includes('rating')
      ? 'rating'
      : baseType.includes('multiple')
        ? 'multiple'
        : 'single';
  return {
    questionKey: `q-${idx}`,
    questionIndex: idx,
    questionTitle: title || `Question ${idx}`,
    questionType,
    optionLabel: optionLabel || 'Option',
    anonymousVotes,
  };
}

function plainOptionLine(html: string | null): string {
  return html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
}

function parseQuestionHeaderFromOptionText(textHtml: string | null): {
  qNum: number;
  title: string;
  bracket: string;
} | null {
  const plain = plainOptionLine(textHtml);
  const re = /^Q(\d+):\s*(.*?)\s*\[(.*?)\]\s*-\s*(.*)$/i;
  const m = plain.match(re);
  if (!m) return null;
  return { qNum: Number(m[1]), title: m[2].trim(), bracket: m[3].trim() };
}

export class PollService {
  private isMissingPollWatchTableError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as { code?: string; message?: string };
    const msg = String(e.message || '').toLowerCase();
    return e.code === 'P2021' || msg.includes('poll_watches') || msg.includes('pollwatch');
  }

  /** Users who have any poll_option_vote or poll_text_answer row for the poll. */
  private async respondentCountsByPollIds(pollIds: string[]): Promise<Record<string, number>> {
    if (pollIds.length === 0) return {};
    const [optRows, textRows] = await Promise.all([
      prisma.pollOptionVote.findMany({
        where: { pollId: { in: pollIds } },
        distinct: ['pollId', 'userId'],
        select: { pollId: true, userId: true },
      }),
      prisma.pollTextAnswer.findMany({
        where: { pollId: { in: pollIds } },
        distinct: ['pollId', 'userId'],
        select: { pollId: true, userId: true },
      }),
    ]);
    const sets = new Map<string, Set<string>>();
    for (const id of pollIds) sets.set(id, new Set());
    for (const r of optRows) sets.get(r.pollId)?.add(r.userId);
    for (const r of textRows) sets.get(r.pollId)?.add(r.userId);
    const out: Record<string, number> = {};
    for (const [id, s] of sets) out[id] = s.size;
    return out;
  }

  /** Default watch state when no explicit PollWatch row exists. */
  private defaultWatching(poll: { createdBy: string }, userId: string): boolean {
    return poll.createdBy === userId;
  }

  private async enrichWithViewerWatch(poll: Poll, userId: string): Promise<Poll> {
    const defaultWatch = this.defaultWatching(poll, userId);
    try {
      const row = await prisma.pollWatch.findUnique({
        where: {
          pollId_userId: {
            pollId: poll.id,
            userId,
          },
        },
      });
      const effective = row !== null ? row.watching : defaultWatch;
      return { ...poll, viewerWatching: effective, viewerWatchDefault: defaultWatch };
    } catch (err) {
      if (this.isMissingPollWatchTableError(err)) {
        return { ...poll, viewerWatching: defaultWatch, viewerWatchDefault: defaultWatch };
      }
      throw err;
    }
  }

  private async getActiveMemberRole(
    groupId: string,
    userId: string,
  ): Promise<'member' | 'admin' | 'superadmin' | null> {
    const m = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { status: true, role: true },
    });
    if (!m || m.status !== 'active') return null;
    return m.role as 'member' | 'admin' | 'superadmin';
  }

  private async assertCanCreatePoll(groupId: string, actorId: string): Promise<void> {
    const role = await this.getActiveMemberRole(groupId, actorId);
    if (!role) {
      throw Object.assign(new Error('Must be an active group member to create a poll'), { status: 403 });
    }
  }

  private async userCanAccessPoll(poll: { groupId: string }, userId: string): Promise<boolean> {
    const m = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: poll.groupId, userId } },
      select: { status: true },
    });
    return m?.status === 'active';
  }

  private mapOption(row: {
    id: string;
    pollId: string;
    sortOrder: number;
    inputKind: string;
    textHtml: string | null;
    textFont: string | null;
    dateTimeValue: Date | null;
  }): PollOption {
    return {
      id: row.id,
      pollId: row.pollId,
      sortOrder: row.sortOrder,
      inputKind: row.inputKind === 'datetime' ? 'datetime' : 'text',
      textHtml: row.textHtml ?? undefined,
      textFont: parseFont(row.textFont ?? undefined),
      dateTimeValue: row.dateTimeValue ? row.dateTimeValue.toISOString() : undefined,
    };
  }

  private mapPoll(row: {
    id: string;
    groupId: string;
    createdBy: string;
    updatedBy: string;
    title: string;
    description: string | null;
    deadline: Date | null;
    anonymousVotes: boolean;
    multipleChoice: boolean;
    ranking: boolean;
    closedAt: Date | null;
    closedBy: string | null;
    closer?: { id: string; displayName: string; name: string } | null;
    creator?: { id: string; displayName: string; name: string } | null;
    createdAt: Date;
    updatedAt: Date;
    photos: { photoUrl: string }[];
    options: Array<{
      id: string;
      pollId: string;
      sortOrder: number;
      inputKind: string;
      textHtml: string | null;
      textFont: string | null;
      dateTimeValue: Date | null;
    }>;
  }): Poll {
    const opts = [...row.options].sort((a, b) => a.sortOrder - b.sortOrder).map((o) => this.mapOption(o));
    return {
      id: row.id,
      groupId: row.groupId,
      createdBy: row.createdBy,
      createdByName: row.creator ? (row.creator.displayName || row.creator.name) : undefined,
      updatedBy: row.updatedBy,
      title: row.title,
      description: row.description ?? undefined,
      anonymousVotes: row.anonymousVotes,
      multipleChoice: row.multipleChoice,
      ranking: row.ranking,
      deadline: (row.deadline ?? row.createdAt).toISOString(),
      closedAt: row.closedAt ? row.closedAt.toISOString() : undefined,
      closedBy: row.closedBy ?? undefined,
      closedByName: row.closer ? (row.closer.displayName || row.closer.name) : undefined,
      coverPhotos: row.photos.map((p) => p.photoUrl),
      options: opts,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      respondentCount: 0,
    };
  }

  private validateOptions(options: PollOptionInput[]): Array<{
    id: string;
    sortOrder: number;
    inputKind: string;
    textHtml: string | null;
    textFont: string;
    dateTimeValue: Date | null;
  }> {
    if (!options || options.length < 1) {
      throw Object.assign(new Error('At least one poll option is required'), { status: 400 });
    }
    const sorted = [...options].sort((a, b) => a.sortOrder - b.sortOrder);
    const out: Array<{
      id: string;
      sortOrder: number;
      inputKind: string;
      textHtml: string | null;
      textFont: string;
      dateTimeValue: Date | null;
    }> = [];
    for (let i = 0; i < sorted.length; i++) {
      const o = sorted[i]!;
      const kind = o.inputKind === 'datetime' ? 'datetime' : 'text';
      const font = parseFont(o.textFont);
      if (kind === 'text') {
        const html = normalizeTextHtml(o.textHtml, font);
        if (stripTagsForLength(html).length === 0) {
          throw Object.assign(new Error('Each text option must have non-empty content'), { status: 400 });
        }
        out.push({
          id: o.id?.trim() || randomUUID(),
          sortOrder: o.sortOrder,
          inputKind: 'text',
          textHtml: sanitizePollHtml(html),
          textFont: font,
          dateTimeValue: null,
        });
      } else {
        const raw = o.dateTimeValue?.trim();
        if (!raw) {
          throw Object.assign(new Error('Each datetime option must have a date and time'), { status: 400 });
        }
        const d = new Date(raw);
        if (!Number.isFinite(d.getTime())) {
          throw Object.assign(new Error('Invalid datetime for a poll option'), { status: 400 });
        }
        out.push({
          id: o.id?.trim() || randomUUID(),
          sortOrder: o.sortOrder,
          inputKind: 'datetime',
          textHtml: null,
          textFont: 'sans',
          dateTimeValue: d,
        });
      }
    }

    const questionOptionCounts = new Map<string, number>();
    for (const o of out) {
      const meta = parseQuestionMetaFromOptionText(plainOptionLine(o.textHtml));
      const questionKey = meta?.questionKey ?? 'q-1';
      const questionType = meta?.questionType ?? 'single';
      if (questionType === 'text') continue;
      questionOptionCounts.set(questionKey, (questionOptionCounts.get(questionKey) ?? 0) + 1);
    }
    for (const [, count] of questionOptionCounts) {
      if (count > MAX_OPTIONS_PER_QUESTION) {
        throw Object.assign(
          new Error(`Each question can have at most ${MAX_OPTIONS_PER_QUESTION} options`),
          { status: 400 },
        );
      }
    }

    return out;
  }

  public async create(input: PollInput): Promise<Poll> {
    const {
      id: clientId,
      groupId,
      createdBy,
      title,
      description,
      deadline,
      coverPhotos = [],
      options,
      anonymousVotes,
      multipleChoice,
      ranking,
    } = input;

    await this.assertCanCreatePoll(groupId, createdBy);
    const t = title?.trim();
    if (!t) {
      throw Object.assign(new Error('Poll title is required'), { status: 400 });
    }

    const optionRows = this.validateOptions(options ?? []);
    const deadlineDt = new Date(String(deadline ?? ''));
    if (!Number.isFinite(deadlineDt.getTime())) {
      throw Object.assign(new Error('Poll deadline is required and must be a valid datetime'), {
        status: 400,
      });
    }
    const pollId = clientId?.trim() || randomUUID();
    const photoRows = coverPhotos.map((photoUrl) => ({ photoUrl }));

    const row = await prisma.poll.create({
      data: {
        id: pollId,
        groupId,
        createdBy,
        updatedBy: createdBy,
        title: t,
        description: description?.trim() ? description.trim() : null,
        deadline: deadlineDt,
        anonymousVotes: !!anonymousVotes,
        multipleChoice: !!multipleChoice,
        ranking: !!ranking,
        photos: { create: [...photoRows] },
        options: {
          create: optionRows.map((o) => ({
            id: o.id,
            sortOrder: o.sortOrder,
            inputKind: o.inputKind,
            textHtml: o.textHtml,
            textFont: o.textFont,
            dateTimeValue: o.dateTimeValue,
          })),
        },
      },
      include: {
        photos: { orderBy: { id: 'asc' } },
        options: true,
        creator: { select: { id: true, displayName: true, name: true } },
        closer: { select: { id: true, displayName: true, name: true } },
      },
    });

    return this.mapPoll(row);
  }

  public async update(id: string, actorUserId: string, input: PollInput): Promise<Poll> {
    const existing = await prisma.poll.findUnique({
      where: { id },
      include: {
        options: {
          select: {
            id: true,
            sortOrder: true,
            inputKind: true,
            textHtml: true,
            textFont: true,
            dateTimeValue: true,
          },
        },
      },
    });
    if (!existing) throw Object.assign(new Error('Poll not found'), { status: 404 });
    if (existing.createdBy !== actorUserId) {
      throw Object.assign(new Error('Only the poll creator can edit this poll'), { status: 403 });
    }

    const t = input.title?.trim();
    if (!t) throw Object.assign(new Error('Poll title is required'), { status: 400 });
    const optionRows = this.validateOptions(input.options ?? []);
    const deadlineDt = new Date(String(input.deadline ?? ''));
    if (!Number.isFinite(deadlineDt.getTime())) {
      throw Object.assign(new Error('Poll deadline is required and must be a valid datetime'), { status: 400 });
    }
    const photoRows = (input.coverPhotos ?? []).map((photoUrl) => ({ photoUrl }));
    const oldSignature = existing.options
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((o) => ({
        sortOrder: o.sortOrder,
        inputKind: o.inputKind,
        textHtml: o.textHtml ?? null,
        textFont: o.textFont ?? null,
        dateTimeValue: o.dateTimeValue ? o.dateTimeValue.getTime() : null,
      }));
    const newSignature = optionRows
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((o) => ({
        sortOrder: o.sortOrder,
        inputKind: o.inputKind,
        textHtml: o.textHtml ?? null,
        textFont: o.textFont ?? null,
        dateTimeValue: o.dateTimeValue ? o.dateTimeValue.getTime() : null,
      }));
    const structureChanged = JSON.stringify(oldSignature) !== JSON.stringify(newSignature);

    const row = await prisma.$transaction(async (tx) => {
      await tx.pollPhoto.deleteMany({ where: { pollId: id } });

      let migratedVotesToCreate: Array<{ userId: string; pollOptionId: string; rank: number }> = [];
      let migratedTextAnswersToCreate: Array<{ userId: string; questionKey: string; answer: string }> = [];

      if (structureChanged) {
        type QuestionInfo = {
          key: string;
          title: string;
          type: 'single' | 'multiple' | 'rating' | 'text';
          index: number;
        };
        type OptionInfo = {
          id: string;
          questionKey: string;
          questionType: 'single' | 'multiple' | 'rating' | 'text';
          questionTitle: string;
          questionIndex: number;
          sortOrder: number;
          inputKind: 'text' | 'datetime';
          normalizedLabel: string;
          dateMs: number | null;
        };
        const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
        const toQuestions = (options: OptionInfo[]): QuestionInfo[] => {
          const map = new Map<string, QuestionInfo>();
          for (const o of options) {
            if (!map.has(o.questionKey)) {
              map.set(o.questionKey, {
                key: o.questionKey,
                title: o.questionTitle,
                type: o.questionType,
                index: o.questionIndex,
              });
            }
          }
          return Array.from(map.values()).sort((a, b) => a.index - b.index);
        };

        const oldOptionInfos: OptionInfo[] = existing.options.map((o) => {
          const plain = plainOptionLine(o.textHtml);
          const meta = parseQuestionMetaFromOptionText(plain);
          return {
            id: o.id,
            questionKey: meta?.questionKey ?? 'q-1',
            questionType: meta?.questionType ?? 'single',
            questionTitle: meta?.questionTitle ?? existing.title,
            questionIndex: meta?.questionIndex ?? 1,
            sortOrder: o.sortOrder,
            inputKind: o.inputKind === 'datetime' ? 'datetime' : 'text',
            normalizedLabel: norm(meta?.optionLabel ?? plain),
            dateMs: o.dateTimeValue ? o.dateTimeValue.getTime() : null,
          };
        });
        const newOptionInfos: OptionInfo[] = optionRows.map((o) => {
          const plain = plainOptionLine(o.textHtml);
          const meta = parseQuestionMetaFromOptionText(plain);
          return {
            id: o.id,
            questionKey: meta?.questionKey ?? 'q-1',
            questionType: meta?.questionType ?? 'single',
            questionTitle: meta?.questionTitle ?? t,
            questionIndex: meta?.questionIndex ?? 1,
            sortOrder: o.sortOrder,
            inputKind: o.inputKind === 'datetime' ? 'datetime' : 'text',
            normalizedLabel: norm(meta?.optionLabel ?? plain),
            dateMs: o.dateTimeValue ? o.dateTimeValue.getTime() : null,
          };
        });
        const oldQuestions = toQuestions(oldOptionInfos);
        const newQuestions = toQuestions(newOptionInfos);

        const questionMapOldToNew = new Map<string, string>();
        const newByKey = new Map(newQuestions.map((q) => [q.key, q]));
        const newByTitleType = new Map<string, string[]>();
        for (const q of newQuestions) {
          const k = `${q.type}::${norm(q.title)}`;
          const arr = newByTitleType.get(k) ?? [];
          arr.push(q.key);
          newByTitleType.set(k, arr);
        }
        const usedNew = new Set<string>();
        for (const q of oldQuestions) {
          const sameKey = newByKey.get(q.key);
          if (sameKey && sameKey.type === q.type) {
            questionMapOldToNew.set(q.key, q.key);
            usedNew.add(q.key);
            continue;
          }
          const byTitleType = newByTitleType.get(`${q.type}::${norm(q.title)}`) ?? [];
          const target = byTitleType.find((candidate) => !usedNew.has(candidate));
          if (target) {
            questionMapOldToNew.set(q.key, target);
            usedNew.add(target);
          }
        }

        const newOptionsByQuestion = new Map<string, OptionInfo[]>();
        for (const o of newOptionInfos) {
          const arr = newOptionsByQuestion.get(o.questionKey) ?? [];
          arr.push(o);
          newOptionsByQuestion.set(o.questionKey, arr);
        }
        for (const arr of newOptionsByQuestion.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);

        const optionMapOldToNew = new Map<string, string>();
        for (const oldQ of oldQuestions) {
          const newQ = questionMapOldToNew.get(oldQ.key);
          if (!newQ) continue;
          const oldOpts = oldOptionInfos
            .filter((o) => o.questionKey === oldQ.key)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          const candidatePool = [...(newOptionsByQuestion.get(newQ) ?? [])];
          for (const oldOpt of oldOpts) {
            const idx = candidatePool.findIndex((cand) => {
              if (oldOpt.inputKind !== cand.inputKind) return false;
              if (oldOpt.inputKind === 'datetime') return oldOpt.dateMs === cand.dateMs;
              return oldOpt.normalizedLabel === cand.normalizedLabel;
            });
            if (idx >= 0) {
              const [match] = candidatePool.splice(idx, 1);
              if (match) optionMapOldToNew.set(oldOpt.id, match.id);
            }
          }
        }

        const oldVotes = await tx.pollOptionVote.findMany({
          where: { pollId: id },
          select: { userId: true, pollOptionId: true, rank: true },
        });
        const oldTextAnswers = await tx.pollTextAnswer.findMany({
          where: { pollId: id },
          select: { userId: true, questionKey: true, answer: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
        });

        await tx.pollOptionVote.deleteMany({ where: { pollId: id } });
        await tx.pollTextAnswer.deleteMany({ where: { pollId: id } });
        await tx.pollOption.deleteMany({ where: { pollId: id } });

        const newOptionById = new Map(newOptionInfos.map((o) => [o.id, o]));
        const migratedVotes = oldVotes
          .map((v) => {
            const mappedOptionId = optionMapOldToNew.get(v.pollOptionId);
            if (!mappedOptionId) return null;
            const mappedInfo = newOptionById.get(mappedOptionId);
            if (!mappedInfo || mappedInfo.questionType === 'text') return null;
            return {
              userId: v.userId,
              pollOptionId: mappedOptionId,
              questionKey: mappedInfo.questionKey,
              questionType: mappedInfo.questionType,
              rank: v.rank ?? 1,
            };
          })
          .filter((v): v is NonNullable<typeof v> => !!v);
        const rankingGroups = new Map<string, typeof migratedVotes>();
        for (const vote of migratedVotes) {
          if (vote.questionType !== 'rating') continue;
          const key = `${vote.userId}::${vote.questionKey}`;
          const arr = rankingGroups.get(key) ?? [];
          arr.push(vote);
          rankingGroups.set(key, arr);
        }
        for (const arr of rankingGroups.values()) {
          arr.sort((a, b) => a.rank - b.rank);
          arr.forEach((vote, idx) => {
            vote.rank = idx + 1;
          });
        }
        migratedVotesToCreate = migratedVotes.map((v) => ({
          userId: v.userId,
          pollOptionId: v.pollOptionId,
          rank: v.questionType === 'rating' ? v.rank : 1,
        }));

        const seenText = new Set<string>();
        migratedTextAnswersToCreate = oldTextAnswers
          .map((ans) => {
            const mappedQuestionKey = questionMapOldToNew.get(ans.questionKey);
            if (!mappedQuestionKey) return null;
            const newQ = newByKey.get(mappedQuestionKey);
            if (!newQ || newQ.type !== 'text') return null;
            const dedupeKey = `${ans.userId}::${mappedQuestionKey}`;
            if (seenText.has(dedupeKey)) return null;
            seenText.add(dedupeKey);
            return {
              userId: ans.userId,
              questionKey: mappedQuestionKey,
              answer: ans.answer,
            };
          })
          .filter((v): v is NonNullable<typeof v> => !!v);
      }

      const updated = await tx.poll.update({
        where: { id },
        data: {
          groupId: existing.groupId,
          updatedBy: actorUserId,
          title: t,
          description: input.description?.trim() ? input.description.trim() : null,
          deadline: deadlineDt,
          anonymousVotes: !!input.anonymousVotes,
          multipleChoice: !!input.multipleChoice,
          ranking: !!input.ranking,
          photos: { create: photoRows },
          ...(structureChanged
            ? {
                options: {
                  create: optionRows.map((o) => ({
                    id: o.id,
                    sortOrder: o.sortOrder,
                    inputKind: o.inputKind,
                    textHtml: o.textHtml,
                    textFont: o.textFont,
                    dateTimeValue: o.dateTimeValue,
                  })),
                },
              }
            : {}),
        },
        include: {
          photos: { orderBy: { id: 'asc' } },
          options: true,
          creator: { select: { id: true, displayName: true, name: true } },
          closer: { select: { id: true, displayName: true, name: true } },
        },
      });

      if (structureChanged) {
        if (migratedVotesToCreate.length > 0) {
          await tx.pollOptionVote.createMany({
            data: migratedVotesToCreate.map((v) => ({
              id: randomUUID(),
              pollId: id,
              pollOptionId: v.pollOptionId,
              userId: v.userId,
              rank: v.rank,
            })),
          });
        }
        if (migratedTextAnswersToCreate.length > 0) {
          await tx.pollTextAnswer.createMany({
            data: migratedTextAnswersToCreate.map((a) => ({
              id: randomUUID(),
              pollId: id,
              questionKey: a.questionKey,
              userId: a.userId,
              answer: a.answer,
            })),
          });
        }
      }
      return updated;
    });

    return this.mapPoll(row);
  }

  public async getById(id: string, userId: string): Promise<Poll | null> {
    const row = await prisma.poll.findUnique({
      where: { id },
      include: {
        photos: { orderBy: { id: 'asc' } },
        options: true,
        creator: { select: { id: true, displayName: true, name: true } },
        closer: { select: { id: true, displayName: true, name: true } },
      },
    });
    if (!row) return null;
    if (!(await this.userCanAccessPoll(row, userId))) return null;
    const mapped = this.mapPoll(row);
    const counts = await this.respondentCountsByPollIds([row.id]);
    return this.enrichWithViewerWatch({ ...mapped, respondentCount: counts[row.id] ?? 0 }, userId);
  }

  public async listForUser(userId: string): Promise<Poll[]> {
    const memberships = await prisma.groupMember.findMany({
      where: { userId, status: 'active' },
      select: { groupId: true },
    });
    const groupIds = memberships.map((m) => m.groupId);
    if (groupIds.length === 0) return [];

    const rows = await prisma.poll.findMany({
      where: { groupId: { in: groupIds } },
      include: {
        photos: { orderBy: { id: 'asc' } },
        options: true,
        creator: { select: { id: true, displayName: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const counts = await this.respondentCountsByPollIds(rows.map((r) => r.id));
    const mapped = rows.map((row) => ({ ...this.mapPoll(row), respondentCount: counts[row.id] ?? 0 }));
    return Promise.all(mapped.map((p) => this.enrichWithViewerWatch(p, userId)));
  }

  /**
   * Any user who can open the poll may set their own watch preference.
   */
  public async setPollWatch(
    pollId: string,
    userId: string,
    input: PollWatchInput
  ): Promise<{ watching: boolean; defaultWatching: boolean }> {
    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      select: { id: true, groupId: true, createdBy: true, closedAt: true },
    });
    if (!poll) throw Object.assign(new Error('Poll not found'), { status: 404 });
    if (!(await this.userCanAccessPoll(poll, userId))) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    if (poll.closedAt) {
      throw Object.assign(new Error('Poll is closed'), { status: 400 });
    }
    const defaultWatch = this.defaultWatching(poll, userId);
    const want = !!input.watching;
    try {
      if (want === defaultWatch) {
        await prisma.pollWatch.deleteMany({ where: { pollId, userId } });
      } else {
        await prisma.pollWatch.upsert({
          where: {
            pollId_userId: { pollId, userId },
          },
          create: {
            pollId,
            userId,
            watching: want,
          },
          update: {
            watching: want,
          },
        });
      }
    } catch (err) {
      if (this.isMissingPollWatchTableError(err)) {
        throw Object.assign(
          new Error('Poll watch settings are unavailable until database migrations are applied'),
          { status: 503 },
        );
      }
      throw err;
    }
    return { watching: want, defaultWatching: defaultWatch };
  }

  public async submitVote(
    pollId: string,
    userId: string,
    optionIds: string[],
    textAnswers: Array<{ questionKey: string; answer: string }> = [],
  ): Promise<PollResults> {
    if (!Array.isArray(optionIds)) {
      throw Object.assign(new Error('optionIds must be an array'), { status: 400 });
    }
    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: true },
    });
    if (!poll) throw Object.assign(new Error('Poll not found'), { status: 404 });
    if (!(await this.userCanAccessPoll(poll, userId))) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    const now = Date.now();
    const deadlineMs = poll.deadline?.getTime() ?? Number.NaN;
    if (Number.isFinite(deadlineMs) && now > deadlineMs) {
      throw Object.assign(new Error('Poll deadline has passed'), { status: 400 });
    }

    const optionIdSet = new Set(poll.options.map((o) => o.id));
    const picked = optionIds.filter((id) => optionIdSet.has(id));

    const byQuestion = new Map<
      string,
      { type: 'single' | 'multiple' | 'rating' | 'text'; optionIds: string[] }
    >();
    for (const o of poll.options) {
      const text = o.textHtml?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
      const meta = parseQuestionMetaFromOptionText(text);
      const key = meta?.questionKey ?? 'q-1';
      const type = meta?.questionType ?? 'single';
      if (!byQuestion.has(key)) byQuestion.set(key, { type, optionIds: [] });
      byQuestion.get(key)!.optionIds.push(o.id);
    }

    const normalizedPicked: Array<{ pollOptionId: string; rank: number }> = [];
    for (const [, q] of byQuestion) {
      const qPicked = picked.filter((id) => q.optionIds.includes(id));
      if (q.type === 'text') {
        continue;
      }
      if (q.type === 'single') {
        if (qPicked.length > 0) normalizedPicked.push({ pollOptionId: qPicked[0]!, rank: 1 });
        continue;
      }
      if (q.type === 'rating') {
        normalizedPicked.push(...qPicked.map((pollOptionId, idx) => ({ pollOptionId, rank: idx + 1 })));
        continue;
      }
      normalizedPicked.push(...qPicked.map((pollOptionId) => ({ pollOptionId, rank: 1 })));
    }

    const cleanedTextAnswers = (textAnswers ?? [])
      .map((t) => ({
        questionKey: String(t.questionKey || '').trim(),
        answer: String(t.answer || '').trim(),
      }))
      .filter((t) => t.questionKey && t.answer);

    const validTextAnswers = cleanedTextAnswers.filter((t) => {
      const q = byQuestion.get(t.questionKey);
      return !!q && q.type === 'text';
    });

    await prisma.$transaction(async (tx) => {
      await tx.pollOptionVote.deleteMany({ where: { pollId, userId } });
      await tx.pollTextAnswer.deleteMany({ where: { pollId, userId } });
      if (normalizedPicked.length > 0) {
        await tx.pollOptionVote.createMany({
          data: normalizedPicked.map((pickedOption) => ({
            id: randomUUID(),
            pollId,
            pollOptionId: pickedOption.pollOptionId,
            userId,
            rank: pickedOption.rank,
          })),
        });
      }
      if (validTextAnswers.length > 0) {
        await tx.pollTextAnswer.createMany({
          data: validTextAnswers.map((t) => ({
            id: randomUUID(),
            pollId,
            userId,
            questionKey: t.questionKey,
            answer: t.answer,
          })),
        });
      }
    });

    return this.getResults(pollId, userId);
  }

  public async getResults(pollId: string, userId: string): Promise<PollResults> {
    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: true,
        votes: { include: { user: { select: { id: true, name: true, displayName: true } } } },
        textAnswers: { include: { user: { select: { id: true, name: true, displayName: true } } } },
      },
    });
    if (!poll) throw Object.assign(new Error('Poll not found'), { status: 404 });
    if (!(await this.userCanAccessPoll(poll, userId))) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }

    const myOptionIds = poll.votes.filter((v) => v.userId === userId).map((v) => v.pollOptionId);

    const grouped = new Map<string, PollQuestionResult>();
    for (const o of poll.options.slice().sort((a, b) => a.sortOrder - b.sortOrder)) {
      const text = o.textHtml?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
      const meta = parseQuestionMetaFromOptionText(text);
      const key = meta?.questionKey ?? 'q-1';
      if (!grouped.has(key)) {
        grouped.set(key, {
          questionKey: key,
          questionIndex: meta?.questionIndex ?? 1,
          questionTitle: meta?.questionTitle ?? poll.title,
          questionType: meta?.questionType ?? 'single',
          anonymousVotes: !!meta?.anonymousVotes,
          totalVotes: 0,
          textResponseCount: 0,
          textResponses: [],
          options: [],
        });
      }
      const optionVotes = poll.votes.filter((v) => v.pollOptionId === o.id);
      const responseCount = optionVotes.length;
      const votes = grouped.get(key)?.questionType === 'rating'
        ? (responseCount > 0
            ? optionVotes.reduce((sum, v) => sum + (v.rank ?? 1), 0) / responseCount
            : 0)
        : optionVotes.length;
      grouped.get(key)!.options.push({
        optionId: o.id,
        label: meta?.optionLabel ?? (text || 'Option'),
        votes,
        responseCount,
        pct: 0,
        voters: optionVotes.map((v) => ({
          userId: v.userId,
          userName: v.user.displayName || v.user.name,
          rank: grouped.get(key)?.questionType === 'rating' ? (v.rank ?? 1) : undefined,
        })),
      });
    }

    const questions = Array.from(grouped.values()).sort((a, b) => a.questionIndex - b.questionIndex);
    for (const q of questions) {
      if (q.questionType === 'text') {
        const responses = poll.textAnswers
          .filter((t) => t.questionKey === q.questionKey)
          .map((t) => ({
            userId: t.userId,
            userName: t.user.displayName || t.user.name,
            answer: t.answer,
          }));
        q.textResponses = responses;
        q.textResponseCount = responses.length;
        q.totalVotes = responses.length;
        q.options = [];
      } else if (q.questionType === 'rating') {
        // Lower average rank is better (e.g. avg 1.33 beats avg 2.0).
        const best = Math.min(...q.options.map((o) => o.votes));
        q.totalVotes = q.options.reduce((n, o) => n + o.votes, 0);
        q.options = q.options.map((o) => ({
          ...o,
          pct: o.votes > 0 ? Math.round((best / o.votes) * 100) : 0,
        }));
      } else {
        const total = q.options.reduce((n, o) => n + o.votes, 0);
        q.totalVotes = total;
        q.options = q.options.map((o) => ({
          ...o,
          pct: total > 0 ? Math.round((o.votes / total) * 100) : 0,
        }));
      }
      if (poll.anonymousVotes || q.anonymousVotes) {
        q.options = q.options.map((o) => ({ ...o, voters: [] }));
        if (q.textResponses && q.textResponses.length > 0) {
          // Keep text answers visible while anonymizing responder identity.
          q.textResponses = q.textResponses.map((r) => ({
            // Keep real userId so the submitter can re-hydrate their own saved answer on reopen.
            userId: r.userId,
            userName: 'Anonymous',
            answer: r.answer,
          }));
        }
      }
    }

    return { pollId, myOptionIds, questions };
  }

  public async delete(id: string, actorUserId: string): Promise<void> {
    const poll = await prisma.poll.findUnique({
      where: { id },
      select: { id: true, groupId: true, createdBy: true },
    });
    if (!poll) throw Object.assign(new Error('Poll not found'), { status: 404 });
    const isCreator = poll.createdBy === actorUserId;
    const role = await this.getActiveMemberRole(poll.groupId, actorUserId);
    const isAdmin = role === 'admin' || role === 'superadmin';
    if (!isCreator && !isAdmin) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    await prisma.poll.delete({ where: { id } });
  }

  public async close(id: string, actorUserId: string): Promise<Poll> {
    const poll = await prisma.poll.findUnique({
      where: { id },
      select: { id: true, groupId: true, createdBy: true, closedAt: true },
    });
    if (!poll) throw Object.assign(new Error('Poll not found'), { status: 404 });
    const role = await this.getActiveMemberRole(poll.groupId, actorUserId);
    const isAdmin = role === 'admin' || role === 'superadmin';
    if (poll.createdBy !== actorUserId && !isAdmin) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    if (poll.closedAt) {
      const row = await prisma.poll.findUnique({
        where: { id },
        include: {
          photos: { orderBy: { id: 'asc' } },
          options: true,
          creator: { select: { id: true, displayName: true, name: true } },
          closer: { select: { id: true, displayName: true, name: true } },
        },
      });
      if (!row) throw Object.assign(new Error('Poll not found'), { status: 404 });
      return this.mapPoll(row);
    }
    const row = await prisma.poll.update({
      where: { id },
      data: {
        closedAt: new Date(),
        closedBy: actorUserId,
        updatedBy: actorUserId,
      },
      include: {
        photos: { orderBy: { id: 'asc' } },
        options: true,
        creator: { select: { id: true, displayName: true, name: true } },
        closer: { select: { id: true, displayName: true, name: true } },
      },
    });
    return this.mapPoll(row);
  }

  private mapPollOptionSuggestion(row: {
    id: string;
    pollId: string;
    questionKey: string;
    label: string;
    suggestedBy: string;
    status: string;
    createdAt: Date;
    decidedAt: Date | null;
    suggester?: { displayName: string; name: string } | null;
  }): PollOptionSuggestion {
    return {
      id: row.id,
      pollId: row.pollId,
      questionKey: row.questionKey,
      label: row.label,
      suggestedBy: row.suggestedBy,
      suggesterName: row.suggester ? row.suggester.displayName || row.suggester.name : undefined,
      status: row.status as PollOptionSuggestion['status'],
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : undefined,
    };
  }

  public async suggestPollOption(pollId: string, userId: string, questionKey: string, label: string): Promise<PollOptionSuggestion> {
    const qk = questionKey.trim();
    const t = label.trim();
    if (!qk) {
      throw Object.assign(new Error('questionKey is required'), { status: 400 });
    }
    if (!t || t.length > 200) {
      throw Object.assign(new Error('Suggestion must be between 1 and 200 characters'), { status: 400 });
    }

    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: true,
      },
    });
    if (!poll) throw Object.assign(new Error('Poll not found'), { status: 404 });
    if (!(await this.userCanAccessPoll(poll, userId))) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    if (poll.closedAt) {
      throw Object.assign(new Error('Poll is closed'), { status: 400 });
    }
    const now = Date.now();
    const deadlineMs = poll.deadline?.getTime() ?? Number.NaN;
    if (Number.isFinite(deadlineMs) && now > deadlineMs) {
      throw Object.assign(new Error('Poll deadline has passed'), { status: 400 });
    }

    let sawQuestion = false;
    let existingOptionCount = 0;
    for (const o of poll.options) {
      const meta = parseQuestionMetaFromOptionText(plainOptionLine(o.textHtml));
      if (!meta || meta.questionKey !== qk) continue;
      sawQuestion = true;
      if (meta.questionType === 'text') {
        throw Object.assign(new Error('Suggestions are only allowed for choice questions'), { status: 400 });
      }
      existingOptionCount += 1;
    }
    if (!sawQuestion) {
      throw Object.assign(new Error('Unknown question'), { status: 400 });
    }
    if (existingOptionCount >= MAX_OPTIONS_PER_QUESTION) {
      throw Object.assign(
        new Error(`This question already has ${MAX_OPTIONS_PER_QUESTION} options`),
        { status: 400 },
      );
    }

    const tl = t.toLowerCase();
    for (const o of poll.options) {
      const meta = parseQuestionMetaFromOptionText(plainOptionLine(o.textHtml));
      if (!meta || meta.questionKey !== qk) continue;
      if ((meta.optionLabel || '').trim().toLowerCase() === tl) {
        throw Object.assign(new Error('That option already exists on this question'), { status: 400 });
      }
    }

    const pending = await prisma.pollOptionSuggestion.findMany({
      where: { pollId, questionKey: qk, status: 'pending' },
    });
    for (const p of pending) {
      if (p.label.trim().toLowerCase() === tl) {
        throw Object.assign(new Error('A pending suggestion already uses this label'), { status: 400 });
      }
    }

    const row = await prisma.pollOptionSuggestion.create({
      data: {
        id: randomUUID(),
        pollId,
        questionKey: qk,
        label: t,
        suggestedBy: userId,
        status: 'pending',
      },
      include: { suggester: { select: { displayName: true, name: true } } },
    });

    const who = row.suggester ? row.suggester.displayName || row.suggester.name : 'Someone';
    const creatorId = poll.createdBy;
    if (creatorId && creatorId !== userId) {
      void notificationService
        .createForUser(creatorId, 'Poll option suggested', `${who} suggested “${t}” on “${poll.title.trim()}”.`, {
          type: 'poll_option_suggestion',
          icon: '➕',
          groupId: poll.groupId,
          pollId,
          dest: 'poll',
        })
        .catch(() => undefined);
    }

    return this.mapPollOptionSuggestion(row);
  }

  public async listPollOptionSuggestions(pollId: string, userId: string): Promise<PollOptionSuggestion[]> {
    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      select: { id: true, createdBy: true, groupId: true },
    });
    if (!poll) throw Object.assign(new Error('Poll not found'), { status: 404 });
    if (!(await this.userCanAccessPoll(poll, userId))) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    const isCreator = poll.createdBy === userId;

    const rows = await prisma.pollOptionSuggestion.findMany({
      where: isCreator ? { pollId } : { pollId, status: 'accepted' },
      orderBy: { createdAt: 'desc' },
      include: { suggester: { select: { displayName: true, name: true } } },
    });
    return rows.map((r) => this.mapPollOptionSuggestion(r));
  }

  public async decidePollOptionSuggestion(
    pollId: string,
    suggestionId: string,
    userId: string,
    decision: 'accept' | 'decline',
  ): Promise<PollOptionSuggestionDecisionResult> {
    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: true },
    });
    if (!poll) throw Object.assign(new Error('Poll not found'), { status: 404 });
    if (poll.createdBy !== userId) {
      throw Object.assign(new Error('Only the poll creator can decide suggestions'), { status: 403 });
    }
    if (poll.closedAt) {
      throw Object.assign(new Error('Poll is closed'), { status: 400 });
    }

    const sugg = await prisma.pollOptionSuggestion.findFirst({
      where: { id: suggestionId, pollId },
      include: { suggester: { select: { displayName: true, name: true } } },
    });
    if (!sugg) throw Object.assign(new Error('Suggestion not found'), { status: 404 });
    if (sugg.status !== 'pending') {
      throw Object.assign(new Error('This suggestion was already decided'), { status: 400 });
    }

    if (decision === 'decline') {
      const updated = await prisma.pollOptionSuggestion.update({
        where: { id: suggestionId },
        data: { status: 'declined', decidedAt: new Date() },
        include: { suggester: { select: { displayName: true, name: true } } },
      });
      return { suggestion: this.mapPollOptionSuggestion(updated) };
    }

    const siblings = poll.options.filter((o) => {
      const meta = parseQuestionMetaFromOptionText(plainOptionLine(o.textHtml));
      return meta?.questionKey === sugg.questionKey && meta.questionType !== 'text';
    });
    if (siblings.length === 0) {
      throw Object.assign(new Error('Could not resolve question for this suggestion'), { status: 400 });
    }
    const template = siblings[0]!;
    const hdr = parseQuestionHeaderFromOptionText(template.textHtml);
    if (!hdr) {
      throw Object.assign(new Error('Invalid poll option format'), { status: 500 });
    }
    if (siblings.length >= MAX_OPTIONS_PER_QUESTION) {
      throw Object.assign(
        new Error(`This question already has ${MAX_OPTIONS_PER_QUESTION} options`),
        { status: 400 },
      );
    }
    const font = parseFont(template.textFont ?? undefined);
    const fullLine = `Q${hdr.qNum}: ${hdr.title} [${hdr.bracket}] - ${sugg.label.trim()}`;
    const html = normalizeTextHtml(fullLine, font);
    if (stripTagsForLength(html).length === 0) {
      throw Object.assign(new Error('Invalid suggestion text'), { status: 400 });
    }
    const maxSort = Math.max(...siblings.map((o) => o.sortOrder), 0);
    const textHtml = sanitizePollHtml(html);

    await prisma.$transaction(async (tx) => {
      await tx.pollOptionSuggestion.update({
        where: { id: suggestionId },
        data: { status: 'accepted', decidedAt: new Date() },
      });
      await tx.pollOption.create({
        data: {
          id: randomUUID(),
          pollId,
          sortOrder: maxSort + 1,
          inputKind: 'text',
          textHtml,
          textFont: font,
          dateTimeValue: null,
        },
      });
      await tx.poll.update({
        where: { id: pollId },
        data: { updatedBy: userId },
      });
    });

    const updated = await prisma.pollOptionSuggestion.findUniqueOrThrow({
      where: { id: suggestionId },
      include: { suggester: { select: { displayName: true, name: true } } },
    });

    const row = await prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        photos: { orderBy: { id: 'asc' } },
        options: true,
        creator: { select: { id: true, displayName: true, name: true } },
        closer: { select: { id: true, displayName: true, name: true } },
      },
    });
    if (!row) throw Object.assign(new Error('Poll not found'), { status: 404 });
    const counts = await this.respondentCountsByPollIds([pollId]);
    const mapped = this.mapPoll(row);
    const enriched = await this.enrichWithViewerWatch({ ...mapped, respondentCount: counts[pollId] ?? 0 }, userId);
    return { suggestion: this.mapPollOptionSuggestion(updated), poll: enriched };
  }
}
