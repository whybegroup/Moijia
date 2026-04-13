import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { Poll, PollInput, PollOption, PollOptionInput, PollTextFont } from '../models';

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

export class PollService {
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
      coverPhotos: row.photos.map((p) => p.photoUrl),
      options: opts,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
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
    if (!options || options.length < 2) {
      throw Object.assign(new Error('At least two poll options are required'), { status: 400 });
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
    return this.mapPoll(row);
  }
}
