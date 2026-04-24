import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import type {
  Poll,
  PollInput,
  PollOption,
  PollOptionInput,
  PollQuestionResult,
  PollResults,
  PollTextFont,
  PollWatchInput,
} from '../models';

const prisma = new PrismaClient();

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
    // "Joined" visibility includes pending + active membership states.
    return m?.status === 'active' || m?.status === 'pending';
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
      updatedBy: row.updatedBy,
      title: row.title,
      description: row.description ?? undefined,
      anonymousVotes: row.anonymousVotes,
      multipleChoice: row.multipleChoice,
      ranking: row.ranking,
      deadline: (row.deadline ?? row.createdAt).toISOString(),
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
      },
    });

    return this.mapPoll(row);
  }

  public async getById(id: string, userId: string): Promise<Poll | null> {
    const row = await prisma.poll.findUnique({
      where: { id },
      include: {
        photos: { orderBy: { id: 'asc' } },
        options: true,
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
      where: { userId, status: { in: ['active', 'pending'] } },
      select: { groupId: true },
    });
    const groupIds = memberships.map((m) => m.groupId);
    if (groupIds.length === 0) return [];

    const rows = await prisma.poll.findMany({
      where: { groupId: { in: groupIds } },
      include: {
        photos: { orderBy: { id: 'asc' } },
        options: true,
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
      select: { id: true, groupId: true, createdBy: true },
    });
    if (!poll) throw Object.assign(new Error('Poll not found'), { status: 404 });
    if (!(await this.userCanAccessPoll(poll, userId))) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
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
      const votes = grouped.get(key)?.questionType === 'rating'
        ? optionVotes.reduce((sum, v) => sum + (v.rank ?? 1), 0)
        : optionVotes.length;
      grouped.get(key)!.options.push({
        optionId: o.id,
        label: meta?.optionLabel ?? (text || 'Option'),
        votes,
        pct: 0,
        voters: optionVotes.map((v) => ({
          userId: v.userId,
          userName: v.user.displayName || v.user.name,
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
        // Lower rank sum is better (e.g. 1+2+1 beats 2+2+2).
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
        q.textResponses = [];
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
}
