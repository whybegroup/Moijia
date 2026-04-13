import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  Event,
  EventInput,
  EventUpdate,
  EventDetailed,
  EventActivityOption,
  EventTimeSuggestion,
  RSVP,
  RSVPInput,
  Comment,
  CommentInput,
  CommentUpdateInput,
  CommentDeleteInput,
  CommentReactionInput,
  EventWatchInput,
  EventActivityOptionInput,
  EventActivityVoteInput,
  EventTimeSuggestionInput,
} from '../models';
import { NotificationService } from './NotificationService';
import {
  extractMentionTokens,
  resolveMentionRecipientIds,
  resolveCanonicalMemberUserId,
  type MemberRow,
} from '../utils/commentMentions';
import { LocalUploadService } from './LocalUploadService';
import { normalizeRecurrenceRule } from '../utils/recurrenceRuleValidate';
import { listOccurrenceStartsForRule } from '../utils/recurrenceTruncate';
import { utcInstantFromClient } from '../utils/utcInstantFromClient';
import { seriesOccurrenceStartEndFromForm } from '../utils/seriesOccurrenceScheduleFromForm';

const prisma = new PrismaClient();

/** Activity options on event detail/list: counts + per-vote user ids (mapper hides ids when anonymous). */
const ACTIVITY_OPTIONS_EVENT_INCLUDE = {
  orderBy: { createdAt: 'asc' as const },
  include: {
    _count: { select: { votes: true } },
    votes: { select: { userId: true } },
  },
} as const;
const notificationService = new NotificationService();
const localUploads = new LocalUploadService();

const COMMENT_MENTION_NOTIFICATION_TITLE = 'You were mentioned';
/** Shown when a group admin removes someone else's comment (soft-delete). */
export const COMMENT_DELETED_BY_ADMIN_TEXT = 'This message was deleted by admin';

const COMMENT_INCLUDE_FOR_API = {
  photos: true,
  reactions: true,
  replyTo: {
    include: {
      user: { select: { id: true, displayName: true, name: true } },
      photos: true,
    },
  },
} as const;

function previewForReplyQuote(text: string | null | undefined, photoCount: number): string {
  const t = (text ?? '').trim();
  if (t.length > 0) {
    const line = (t.split('\n')[0] ?? t).trim();
    return line.length > 120 ? `${line.slice(0, 117)}…` : line;
  }
  if (photoCount > 0) return 'Photo';
  return 'Message';
}

/** Match a calendar row to a series member when truncating (ISO vs DB skew). */
const MS_SERIES_OCCURRENCE_MATCH = 120000;

type ResolvedSeriesScope =
  | 'none'
  | 'legacy_single_row'
  | 'this_occurrence'
  | 'this_and_following'
  | 'all_occurrences';

function resolveSeriesUpdateScope(
  seriesId: string | null | undefined,
  seriesUpdateScope: EventUpdate['seriesUpdateScope']
): ResolvedSeriesScope {
  if (!seriesId) return 'none';
  if (seriesUpdateScope) return seriesUpdateScope;
  return 'legacy_single_row';
}

/** Prisma where for rows touched when `seriesUpdateScope` is `this_and_following`: this occurrence + same series with start strictly after the edited row. */
function seriesThisAndFollowingWhere(seriesId: string, eventId: string, anchorStart: Date) {
  return {
    recurrenceSeriesId: seriesId,
    OR: [{ id: eventId }, { start: { gt: anchorStart } }],
  } as const;
}

async function seriesSiblingIdsAll(seriesId: string): Promise<string[]> {
  const rows = await prisma.event.findMany({
    where: { recurrenceSeriesId: seriesId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

function normalizeRsvpDeadlineFromClient(raw: string | null | undefined): Date | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  return utcInstantFromClient(s);
}

/** Same offset from `occStart` as `anchorDeadline` has from `firstAnchor` (recurring series). */
function shiftRsvpDeadlineForOccurrence(
  anchorDeadline: Date,
  occStart: Date,
  firstAnchor: Date
): Date {
  return new Date(anchorDeadline.getTime() + (occStart.getTime() - firstAnchor.getTime()));
}

export class EventService {
  /**
   * Whether two datetimes are the same for schedule notifications (ignores sub-second
   * jitter from JSON/SQLite round-trips so “save without edits” does not alert).
   */
  private static eventInstantUnchanged(a: Date, b: Date): boolean {
    const ta = new Date(a).getTime();
    const tb = new Date(b).getTime();
    if (!Number.isFinite(ta) || !Number.isFinite(tb)) return ta === tb;
    return Math.floor(ta / 1000) === Math.floor(tb / 1000);
  }

  /**
   * Get all events with optional filtering
   */
  public async getAll(params?: {
    groupId?: string;
    startAfter?: Date;
    startBefore?: Date;
    limit?: number;
  }): Promise<Event[]> {
    const where: any = {};

    if (params?.groupId) {
      where.groupId = params.groupId;
    }

    if (params?.startAfter || params?.startBefore) {
      where.start = {};
      if (params.startAfter) where.start.gte = params.startAfter;
      if (params.startBefore) where.start.lte = params.startBefore;
    }

    const events = await prisma.event.findMany({
      where,
      include: {
        coverPhotos: true,
      },
      orderBy: {
        start: 'asc',
      },
      take: params?.limit,
    });

    return events.map((e: any) => this.mapEventWithPhotos(e));
  }

  /**
   * Get all events with optional filtering, scoped by user's group membership.
   * userId required - returns only events from groups where user is an active member.
   */
  public async getAllDetailed(params: {
    userId: string;
    groupId?: string;
    startAfter?: Date;
    startBefore?: Date;
    limit?: number;
  }): Promise<EventDetailed[]> {
    const where: any = {};

    if (params.groupId) {
      const isMember = await this.userCanAccessGroup(params.groupId, params.userId);
      if (isMember) {
        where.groupId = params.groupId;
      } else {
        where.groupId = params.groupId;
        where.createdBy = params.userId;
      }
    } else {
      const memberGroupIds = await prisma.groupMember.findMany({
        where: { userId: params.userId, status: 'active' },
        select: { groupId: true },
      }).then((rows) => rows.map((r) => r.groupId));
      if (memberGroupIds.length === 0) {
        where.createdBy = params.userId;
      } else {
        where.OR = [{ groupId: { in: memberGroupIds } }, { createdBy: params.userId }];
      }
    }

    if (params?.startAfter || params?.startBefore) {
      where.start = where.start || {};
      if (params!.startAfter) where.start.gte = params!.startAfter;
      if (params!.startBefore) where.start.lte = params!.startBefore;
    }

    const events = await prisma.event.findMany({
      where,
      include: {
        coverPhotos: true,
        rsvps: true,
        comments: {
          include: COMMENT_INCLUDE_FOR_API,
          orderBy: {
            createdAt: 'asc',
          },
        },
        activityOptions: ACTIVITY_OPTIONS_EVENT_INCLUDE,
        timeSuggestions: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: {
        start: 'asc',
      },
      take: params?.limit,
    });

    return events.map((e) => this.mapEventDetailed(e, { viewerUserId: params.userId }));
  }

  private async userCanAccessGroup(groupId: string, userId: string): Promise<boolean> {
    const m = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { status: true },
    });
    return m?.status === 'active';
  }

  /** Active membership role, or null if not an active member. */
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

  private isAdminOrSuperadminRole(role: string): boolean {
    return role === 'admin' || role === 'superadmin';
  }

  /** Read access: active group member, or the user created this event (e.g. after leaving the group). */
  private async userCanReadEvent(event: { groupId: string; createdBy: string }, userId: string): Promise<boolean> {
    if (event.createdBy === userId) return true;
    return this.userCanAccessGroup(event.groupId, userId);
  }

  /** Any active member may create events in the group. */
  private async assertCanCreateEvent(groupId: string, actorId: string): Promise<void> {
    const role = await this.getActiveMemberRole(groupId, actorId);
    if (!role) {
      throw Object.assign(new Error('Must be an active group member to create events'), { status: 403 });
    }
  }

  /** Active group member may collaborate on activities, votes, and time suggestions. */
  private async assertActiveMemberForEventEventRow(
    event: { groupId: string },
    actorId: string,
  ): Promise<void> {
    const role = await this.getActiveMemberRole(event.groupId, actorId);
    if (!role) {
      throw Object.assign(new Error('Must be an active group member'), { status: 403 });
    }
  }

  /** Event host (creator) or group admin may resolve time suggestions. */
  private async assertCanResolveTimeSuggestion(
    event: { groupId: string; createdBy: string },
    actorId: string,
  ): Promise<void> {
    if (event.createdBy === actorId) return;
    const role = await this.getActiveMemberRole(event.groupId, actorId);
    if (role && this.isAdminOrSuperadminRole(role)) return;
    throw Object.assign(
      new Error('Only the event host or group admins can accept or reject time suggestions'),
      { status: 403 },
    );
  }

  /** Only the event host (creator) may update event fields, even if no longer a group member. */
  private async assertCanUpdateEvent(
    event: { groupId: string; createdBy: string },
    actorId: string,
  ): Promise<void> {
    if (event.createdBy === actorId) return;
    throw Object.assign(new Error('Only the event host can update this event'), { status: 403 });
  }

  /**
   * Host may always delete their event. Active group admins/superadmins may delete any member's event
   * in the group (but cannot update it).
   */
  private async assertCanDeleteEvent(
    event: { groupId: string; createdBy: string },
    actorId: string,
  ): Promise<void> {
    if (event.createdBy === actorId) return;
    const role = await this.getActiveMemberRole(event.groupId, actorId);
    if (role && this.isAdminOrSuperadminRole(role)) return;
    throw Object.assign(
      new Error('Only the event host or group admins can delete this event'),
      { status: 403 },
    );
  }

  /**
   * Get event by ID with all details. Returns null if not found or user cannot access.
   */
  public async getById(id: string, userId?: string): Promise<EventDetailed | null> {
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        coverPhotos: true,
        rsvps: true,
        comments: {
          include: COMMENT_INCLUDE_FOR_API,
          orderBy: {
            createdAt: 'asc',
          },
        },
        activityOptions: ACTIVITY_OPTIONS_EVENT_INCLUDE,
        timeSuggestions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!event) return null;
    if (userId && !(await this.userCanReadEvent(event, userId))) {
      return null;
    }
    let recurrenceSeriesMemberCount: number | undefined;
    if (event.recurrenceSeriesId) {
      recurrenceSeriesMemberCount = await prisma.event.count({
        where: { recurrenceSeriesId: event.recurrenceSeriesId },
      });
    }
    const detailed = this.mapEventDetailed(event, {
      recurrenceSeriesMemberCount,
      viewerUserId: userId,
    });
    if (userId) {
      const withWatch = await this.enrichWithViewerWatch(detailed, id, userId);
      const voteRows = await prisma.eventActivityVote.findMany({
        where: { eventId: id, userId },
        select: { optionId: true },
      });
      return {
        ...withWatch,
        myActivityVoteOptionIds: voteRows.map((r) => r.optionId),
      };
    }
    return detailed;
  }

  /**
   * Notify active group members when location or start/end changes (excludes the editor).
   * Uses the same audience as new-event alerts so calendar drag and form edits all reach the group.
   */
  private async notifyWatchersEventScheduleOrLocation(
    eventId: string,
    groupId: string,
    title: string,
    excludeUserId: string,
    changes: {
      locChanged: boolean;
      timeChanged: boolean;
      location: string | null;
      start: Date;
      end: Date;
    }
  ): Promise<void> {
    const normLoc = (l: string | null | undefined) => (l ?? '').trim();
    const members = await prisma.groupMember.findMany({
      where: { groupId, status: 'active' },
      select: { userId: true },
    });
    const recipientIds = members.map((m) => m.userId).filter((uid) => uid !== excludeUserId);
    if (recipientIds.length === 0) return;

    if (changes.locChanged) {
      const loc = normLoc(changes.location) || 'Updated';
      await notificationService.createForUsers(
        recipientIds,
        'Location updated',
        `"${title}" — ${loc}`,
        {
          type: 'location_changed',
          icon: '📍',
          eventId,
          groupId,
          dest: 'event',
        }
      );
    }
    if (changes.timeChanged) {
      const startDate = new Date(changes.start);
      const dateStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeStr = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      await notificationService.createForUsers(
        recipientIds,
        'Event time updated',
        `"${title}" is now ${dateStr} at ${timeStr}`,
        {
          type: 'event_time_changed',
          icon: '🕐',
          eventId,
          groupId,
          dest: 'event',
        }
      );
    }
  }

  /** All user IDs that should receive default event notifications for this event. */
  private async getUserIdsWatchingEvent(eventId: string): Promise<string[]> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { rsvps: true },
    });
    if (!event) return [];

    const watchRows = await prisma.eventWatch.findMany({
      where: { eventId },
    });
    const rowByUser = new Map(watchRows.map((r) => [r.userId, r.watching]));

    const candidateIds = new Set<string>();
    candidateIds.add(event.createdBy);
    for (const r of event.rsvps) {
      candidateIds.add(r.userId);
    }
    for (const r of watchRows) {
      candidateIds.add(r.userId);
    }

    const watching: string[] = [];
    for (const uid of candidateIds) {
      const rsvp = event.rsvps.find((x) => x.userId === uid);
      const defaultWatch =
        event.createdBy === uid ||
        rsvp?.status === 'going' ||
        rsvp?.status === 'maybe';

      const explicit = rowByUser.get(uid);
      const effective = explicit !== undefined ? explicit : defaultWatch;
      if (effective) watching.push(uid);
    }
    return watching;
  }

  private async enrichWithViewerWatch(
    detailed: EventDetailed,
    eventId: string,
    viewerUserId: string
  ): Promise<EventDetailed> {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) return detailed;
    const rsvp = detailed.rsvps.find((r) => r.userId === viewerUserId);
    const defaultWatch =
      event.createdBy === viewerUserId ||
      rsvp?.status === 'going' ||
      rsvp?.status === 'maybe';

    const row = await prisma.eventWatch.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId: viewerUserId,
        },
      },
    });
    const effective = row !== null ? row.watching : defaultWatch;

    return {
      ...detailed,
      viewerWatching: effective,
      viewerWatchDefault: defaultWatch,
    };
  }

  /**
   * Set whether this user watches the event for default notifications.
   * Any user who can open the event may set their own preference.
   */
  public async setEventWatch(
    eventId: string,
    userId: string,
    input: EventWatchInput
  ): Promise<{ watching: boolean; defaultWatching: boolean }> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { rsvps: true },
    });
    if (!event) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
    }
    if (!(await this.userCanReadEvent(event, userId))) {
      throw Object.assign(new Error('Access denied'), { status: 403 });
    }

    const rsvp = event.rsvps.find((r) => r.userId === userId);
    const defaultWatch =
      event.createdBy === userId || rsvp?.status === 'going' || rsvp?.status === 'maybe';

    const want = input.watching;

    if (want === defaultWatch) {
      await prisma.eventWatch.deleteMany({ where: { eventId, userId } });
    } else {
      await prisma.eventWatch.upsert({
        where: {
          eventId_userId: {
            eventId,
            userId,
          },
        },
        create: {
          eventId,
          userId,
          watching: want,
        },
        update: {
          watching: want,
        },
      });
    }

    return { watching: want, defaultWatching: defaultWatch };
  }

  /**
   * Create a new event (materializes every occurrence as its own row when recurrenceRule is set).
   */
  public async create(input: EventInput & { viewerTimeZone?: string }): Promise<Event> {
    const {
      coverPhotos = [],
      createdBy,
      activityOptionLabels,
      recurrenceRule: rrIn,
      id: clientId,
      viewerTimeZone,
      rsvpDeadline: rsvpDeadlineIn,
      ...eventData
    } = input;
    const anchorRsvpDeadline = normalizeRsvpDeadlineFromClient(rsvpDeadlineIn);

    await this.assertCanCreateEvent(eventData.groupId, createdBy);
    const recurrenceRule = normalizeRecurrenceRule(rrIn ?? null);

    const labels = (activityOptionLabels ?? [])
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter((s) => s.length > 0);

    const start = utcInstantFromClient(String(eventData.start));
    const end = utcInstantFromClient(String(eventData.end));
    const durationMs = end.getTime() - start.getTime();

    const photoRows = coverPhotos.map((photoUrl) => ({ photoUrl }));

    const baseScalars = {
      groupId: eventData.groupId,
      title: eventData.title,
      description: eventData.description ?? null,
      location:
        eventData.location == null || String(eventData.location).trim() === ''
          ? null
          : String(eventData.location).trim(),
      minAttendees: eventData.minAttendees ?? null,
      maxAttendees: eventData.maxAttendees ?? null,
      enableWaitlist: eventData.enableWaitlist ?? false,
      allowMaybe: eventData.allowMaybe ?? true,
      isAllDay: eventData.isAllDay ?? false,
      activityIdeasEnabled: eventData.activityIdeasEnabled ?? false,
      activityVotesAnonymous: eventData.activityVotesAnonymous ?? false,
    };

    let event: Awaited<ReturnType<typeof prisma.event.create>> & { coverPhotos: { photoUrl: string }[] };

    if (recurrenceRule) {
      let dates: Date[];
      try {
        dates = listOccurrenceStartsForRule(start, recurrenceRule, viewerTimeZone?.trim());
      } catch {
        throw Object.assign(new Error('Invalid recurrence rule'), { status: 400 });
      }
      if (dates.length === 0) {
        throw Object.assign(new Error('Recurrence produced no occurrences'), { status: 400 });
      }
      const seriesId = randomUUID();
      const firstId = clientId?.trim() ? clientId : randomUUID();

      event = await prisma.$transaction(async (tx) => {
        let first: typeof event | null = null;
        for (let i = 0; i < dates.length; i++) {
          const occStart = dates[i]!;
          const occEnd = new Date(occStart.getTime() + durationMs);
          const eid = i === 0 ? firstId : randomUUID();
          const firstOcc = dates[0]!;
          const row = await tx.event.create({
            data: {
              id: eid,
              ...baseScalars,
              createdBy,
              updatedBy: createdBy,
              start: occStart,
              end: occEnd,
              rsvpDeadline:
                anchorRsvpDeadline == null
                  ? null
                  : shiftRsvpDeadlineForOccurrence(anchorRsvpDeadline, occStart, firstOcc),
              recurrenceRule,
              recurrenceSeriesId: seriesId,
              coverPhotos: { create: [...photoRows] },
              ...(labels.length > 0
                ? {
                    activityOptions: {
                      create: labels.map((label) => ({
                        id: randomUUID(),
                        label,
                        createdBy,
                      })),
                    },
                  }
                : {}),
            },
            include: { coverPhotos: true },
          });
          if (i === 0) first = row as typeof event;
        }
        return first!;
      });
    } else {
      event = await prisma.event.create({
        data: {
          id: clientId?.trim() ? clientId : randomUUID(),
          ...baseScalars,
          createdBy,
          updatedBy: createdBy,
          start,
          end,
          rsvpDeadline: anchorRsvpDeadline,
          recurrenceRule: null,
          recurrenceSeriesId: null,
          coverPhotos: { create: [...photoRows] },
          ...(labels.length > 0
            ? {
                activityOptions: {
                  create: labels.map((label) => ({
                    id: randomUUID(),
                    label,
                    createdBy,
                  })),
                },
              }
            : {}),
        },
        include: { coverPhotos: true, group: true },
      });
    }

    // Create in-app notifications for all group members
    const startDate = start;
    const dateStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    
    // Get all active group members
    const members = await prisma.groupMember.findMany({
      where: {
        groupId: event.groupId,
        status: 'active',
      },
      select: { userId: true },
    });

    // Create notification for each member (creator already knows they created it)
    await notificationService.createForUsers(
      members.map((m) => m.userId).filter((uid) => uid !== createdBy),
      'New Event Created',
      `${event.title} on ${dateStr} at ${timeStr}`,
      {
        type: 'event_created',
        icon: '📅',
        eventId: event.id,
        groupId: event.groupId,
        dest: 'event',
      }
    ).catch(() => undefined);

    return this.mapEventWithPhotos(event);
  }

  /**
   * Update an event
   */
  public async update(id: string, input: EventUpdate): Promise<Event> {
    const { coverPhotos, updatedBy, seriesUpdateScope, viewerTimeZone, rsvpDeadline, ...eventData } =
      input;

    const existing = await prisma.event.findUnique({
      where: { id },
      select: {
        groupId: true,
        createdBy: true,
        title: true,
        start: true,
        end: true,
        isAllDay: true,
        location: true,
        recurrenceRule: true,
        recurrenceSeriesId: true,
        coverPhotos: { select: { photoUrl: true } },
      },
    });
    if (!existing) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
    }
    await this.assertCanUpdateEvent(existing, updatedBy);

    const seriesId = existing.recurrenceSeriesId;
    const scope = resolveSeriesUpdateScope(seriesId, seriesUpdateScope);
    const appliesSeriesBulk =
      !!seriesId && (scope === 'all_occurrences' || scope === 'this_and_following');

    let subsetIdsThisAndFollowing: string[] | undefined;
    if (scope === 'this_and_following' && seriesId) {
      const sub = await prisma.event.findMany({
        where: seriesThisAndFollowingWhere(seriesId, id, existing.start) as any,
        select: { id: true },
      });
      subsetIdsThisAndFollowing = sub.map((r) => r.id);
    }
    const newSeriesIdForSplit =
      scope === 'this_and_following' && subsetIdsThisAndFollowing?.length
        ? randomUUID()
        : undefined;

    if (scope === 'this_occurrence' && seriesId) {
      await prisma.event.update({
        where: { id },
        data: { recurrenceSeriesId: null, recurrenceRule: null, updatedBy },
      });
    }

    if (eventData.recurrenceRule !== undefined && seriesId && scope !== 'this_occurrence') {
      const nextRr = normalizeRecurrenceRule(eventData.recurrenceRule);
      const rrWhere =
        scope === 'this_and_following' && subsetIdsThisAndFollowing?.length
          ? { id: { in: subsetIdsThisAndFollowing } }
          : { recurrenceSeriesId: seriesId };
      await prisma.event.updateMany({
        where: rrWhere as any,
        data: { recurrenceRule: nextRr, updatedBy },
      });
    }

    let siblingIds: string[] = [id];
    if (coverPhotos !== undefined && seriesId && appliesSeriesBulk) {
      if (scope === 'all_occurrences') {
        siblingIds = await seriesSiblingIdsAll(seriesId);
      } else if (subsetIdsThisAndFollowing?.length) {
        siblingIds = [...subsetIdsThisAndFollowing];
      }
    }

    const replacePhotosForEvent = async (eventId: string, prevRows: { photoUrl: string }[]) => {
      if (coverPhotos === undefined) return;
      const previousUrls = prevRows.map((p) => p.photoUrl);
      const nextSet = new Set(coverPhotos);
      const removedUrls = previousUrls.filter((u) => !nextSet.has(u));
      await prisma.$transaction(async (tx) => {
        await tx.eventPhoto.deleteMany({ where: { eventId } });
        if (coverPhotos.length > 0) {
          await tx.eventPhoto.createMany({
            data: coverPhotos.map((photoUrl) => ({ eventId, photoUrl })),
          });
        }
      });
      await Promise.all(removedUrls.map((u) => localUploads.deleteManagedUploadBestEffort(u)));
    };

    if (coverPhotos !== undefined) {
      for (const eid of siblingIds) {
        const prev =
          eid === id
            ? existing.coverPhotos
            : (
                await prisma.event.findUnique({
                  where: { id: eid },
                  select: { coverPhotos: { select: { photoUrl: true } } },
                })
              )?.coverPhotos ?? [];
        await replacePhotosForEvent(eid, prev);
      }
    }

    const updateData: Record<string, unknown> = { ...eventData, updatedBy };
    if (eventData.recurrenceRule !== undefined) {
      if (scope === 'this_occurrence') {
        delete updateData.recurrenceRule;
      } else if (!seriesId) {
        updateData.recurrenceRule = normalizeRecurrenceRule(eventData.recurrenceRule);
      } else {
        delete updateData.recurrenceRule;
      }
    }
    if (updateData.start !== undefined) {
      updateData.start = utcInstantFromClient(String(updateData.start));
    }
    if (updateData.end !== undefined) {
      updateData.end = utcInstantFromClient(String(updateData.end));
    }
    if (updateData.location !== undefined) {
      const s = updateData.location;
      updateData.location =
        s == null || (typeof s === 'string' && String(s).trim() === '')
          ? null
          : String(s).trim();
    }
    if (updateData.description !== undefined) {
      const s = updateData.description;
      updateData.description =
        s == null || (typeof s === 'string' && String(s).trim() === '')
          ? null
          : String(s).trim();
    }

    if (rsvpDeadline !== undefined) {
      if (appliesSeriesBulk && seriesId) {
        const patchWhere =
          scope === 'all_occurrences'
            ? { recurrenceSeriesId: seriesId }
            : { id: { in: subsetIdsThisAndFollowing?.length ? subsetIdsThisAndFollowing : [] } };
        const rows = await prisma.event.findMany({
          where: patchWhere as any,
          select: { id: true, start: true },
        });
        const anchorNew = normalizeRsvpDeadlineFromClient(
          rsvpDeadline === null ? null : String(rsvpDeadline)
        );
        const firstStart = existing.start;
        if (rows.length > 0) {
          await prisma.$transaction(
            rows.map((row) =>
              prisma.event.update({
                where: { id: row.id },
                data: {
                  rsvpDeadline:
                    anchorNew == null
                      ? null
                      : shiftRsvpDeadlineForOccurrence(anchorNew, row.start, firstStart),
                  updatedBy,
                },
              })
            )
          );
        }
      } else {
        updateData.rsvpDeadline = normalizeRsvpDeadlineFromClient(
          rsvpDeadline === null ? null : String(rsvpDeadline)
        );
      }
    }

    if (appliesSeriesBulk) {
      const seriesPatch: Record<string, unknown> = { updatedBy };
      if (eventData.title !== undefined) seriesPatch.title = eventData.title;
      if (eventData.description !== undefined) seriesPatch.description = updateData.description;
      if (eventData.location !== undefined) seriesPatch.location = updateData.location;
      if (eventData.minAttendees !== undefined) seriesPatch.minAttendees = eventData.minAttendees;
      if (eventData.maxAttendees !== undefined) seriesPatch.maxAttendees = eventData.maxAttendees;
      if (eventData.enableWaitlist !== undefined) seriesPatch.enableWaitlist = eventData.enableWaitlist;
      if (eventData.allowMaybe !== undefined) seriesPatch.allowMaybe = eventData.allowMaybe;
      if (eventData.isAllDay !== undefined) seriesPatch.isAllDay = eventData.isAllDay;
      if (eventData.activityIdeasEnabled !== undefined) {
        seriesPatch.activityIdeasEnabled = eventData.activityIdeasEnabled;
      }
      if (eventData.activityVotesAnonymous !== undefined) {
        seriesPatch.activityVotesAnonymous = eventData.activityVotesAnonymous;
      }
      if (Object.keys(seriesPatch).length > 1) {
        const canPatchThisAndFollowing = scope !== 'this_and_following' || !!subsetIdsThisAndFollowing?.length;
        if (canPatchThisAndFollowing) {
          const patchWhere =
            scope === 'all_occurrences'
              ? { recurrenceSeriesId: seriesId }
              : { id: { in: subsetIdsThisAndFollowing! } };
          await prisma.event.updateMany({
            where: patchWhere as any,
            data: seriesPatch as any,
          });
        }
      }
      for (const k of [
        'title',
        'description',
        'location',
        'minAttendees',
        'maxAttendees',
        'enableWaitlist',
        'allowMaybe',
        'isAllDay',
        'activityIdeasEnabled',
        'activityVotesAnonymous',
        'rsvpDeadline',
      ] as const) {
        if (k in updateData) delete updateData[k];
      }
    }

    if (
      appliesSeriesBulk &&
      eventData.start !== undefined &&
      eventData.end !== undefined &&
      (scope !== 'this_and_following' || !!subsetIdsThisAndFollowing?.length)
    ) {
      const timeWhere =
        scope === 'all_occurrences'
          ? { recurrenceSeriesId: seriesId }
          : { id: { in: subsetIdsThisAndFollowing! } };
      const rows = await prisma.event.findMany({
        where: timeWhere as any,
        select: { id: true, start: true, end: true },
      });

      const formStartUtc = utcInstantFromClient(String(eventData.start));
      const formEndUtc = utcInstantFromClient(String(eventData.end));
      const zone = viewerTimeZone?.trim() || 'UTC';
      const allDay = Boolean(eventData.isAllDay ?? existing.isAllDay ?? false);

      await prisma.$transaction(
        rows.map((row) => {
          if (row.id === id) {
            return prisma.event.update({
              where: { id: row.id },
              data: { start: formStartUtc, end: formEndUtc, updatedBy },
            });
          }
          const { start: nextS, end: nextE } = seriesOccurrenceStartEndFromForm({
            rowStartUtc: row.start,
            formStartUtc,
            formEndUtc,
            zone,
            isAllDay: allDay,
          });
          return prisma.event.update({
            where: { id: row.id },
            data: { start: nextS, end: nextE, updatedBy },
          });
        })
      );

      delete updateData.start;
      delete updateData.end;
    }

    if (newSeriesIdForSplit && subsetIdsThisAndFollowing?.length) {
      await prisma.event.updateMany({
        where: { id: { in: subsetIdsThisAndFollowing } },
        data: { recurrenceSeriesId: newSeriesIdForSplit, updatedBy },
      });
    }

    const nextStart =
      eventData.start !== undefined ? utcInstantFromClient(String(eventData.start)) : null;
    const nextEnd = eventData.end !== undefined ? utcInstantFromClient(String(eventData.end)) : null;
    const startChanged =
      nextStart !== null && !EventService.eventInstantUnchanged(existing.start, nextStart);
    const endChanged = nextEnd !== null && !EventService.eventInstantUnchanged(existing.end, nextEnd);
    const timeChanged = startChanged || endChanged;

    const event = await prisma.event.update({
      where: { id },
      data: updateData as any,
      include: { coverPhotos: true },
    });

    const normLoc = (l: string | null | undefined) => (l ?? '').trim();
    const locTouched = eventData.location !== undefined;
    const locChanged =
      locTouched && normLoc(existing.location) !== normLoc(event.location ?? '');

    if (locChanged || timeChanged) {
      void this.notifyWatchersEventScheduleOrLocation(
        id,
        event.groupId,
        event.title,
        updatedBy,
        { locChanged, timeChanged, location: event.location, start: event.start, end: event.end }
      ).catch(() => undefined);
    }

    return this.mapEventWithPhotos(event);
  }

  /**
   * Delete every event row sharing a recurrence series id.
   */
  public async deleteRecurrenceSeries(seriesId: string, actorUserId: string): Promise<void> {
    const anchor = await prisma.event.findFirst({
      where: { recurrenceSeriesId: seriesId },
      select: { groupId: true, createdBy: true },
    });
    if (!anchor) {
      throw Object.assign(new Error('Series not found'), { status: 404 });
    }
    await this.assertCanDeleteEvent(anchor, actorUserId);
    const rows = await prisma.event.findMany({
      where: { recurrenceSeriesId: seriesId },
      select: { id: true },
    });
    for (const r of rows) {
      await this.delete(r.id, actorUserId);
    }
  }

  /**
   * Delete this occurrence and all later ones in the same series (by event start time).
   * If the chosen occurrence is the earliest in the series, deletes the entire series.
   */
  public async truncateRecurrenceSeriesFrom(
    id: string,
    actorUserId: string,
    occurrenceStartIso: string,
    _viewerTimeZone?: string
  ): Promise<{ deleted: true } | { deleted: false; event: Event }> {
    const existing = await prisma.event.findUnique({
      where: { id },
      select: {
        groupId: true,
        createdBy: true,
        recurrenceSeriesId: true,
        recurrenceRule: true,
      },
    });
    if (!existing) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
    }
    await this.assertCanDeleteEvent(existing, actorUserId);
    if (!existing.recurrenceSeriesId || !existing.recurrenceRule?.trim()) {
      throw Object.assign(new Error('Event is not part of a recurring series'), { status: 400 });
    }
    const truncateMs = new Date(occurrenceStartIso).getTime();
    if (!Number.isFinite(truncateMs)) {
      throw Object.assign(new Error('Invalid occurrenceStart'), { status: 400 });
    }
    const siblings = await prisma.event.findMany({
      where: { recurrenceSeriesId: existing.recurrenceSeriesId },
      orderBy: { start: 'asc' },
      select: { id: true, start: true },
    });
    let hit = siblings.findIndex((e) => Math.abs(e.start.getTime() - truncateMs) <= MS_SERIES_OCCURRENCE_MATCH);
    if (hit < 0) {
      let best = -1;
      let bestDiff = Infinity;
      siblings.forEach((e, i) => {
        const d = Math.abs(e.start.getTime() - truncateMs);
        if (d < bestDiff) {
          bestDiff = d;
          best = i;
        }
      });
      if (best >= 0 && bestDiff <= MS_SERIES_OCCURRENCE_MATCH) hit = best;
    }
    if (hit < 0) {
      throw Object.assign(new Error('That date is not part of this repeating event.'), { status: 400 });
    }
    const toRemove = siblings.slice(hit);
    const keepFirst = siblings[0]!;
    if (hit === 0) {
      for (const row of toRemove) {
        await this.delete(row.id, actorUserId);
      }
      return { deleted: true };
    }
    for (const row of toRemove) {
      await this.delete(row.id, actorUserId);
    }
    const kept = await prisma.event.findUnique({
      where: { id: keepFirst.id },
      include: { coverPhotos: true },
    });
    if (!kept) {
      return { deleted: true };
    }
    return { deleted: false, event: this.mapEventWithPhotos(kept) };
  }

  /**
   * Delete an event
   */
  public async delete(id: string, actorUserId: string): Promise<void> {
    const existing = await prisma.event.findUnique({
      where: { id },
      select: {
        groupId: true,
        createdBy: true,
        coverPhotos: { select: { photoUrl: true } },
        comments: {
          select: {
            photos: { select: { photoUrl: true } },
          },
        },
      },
    });
    if (!existing) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
    }
    await this.assertCanDeleteEvent(existing, actorUserId);
    const coverUrls = existing.coverPhotos.map((p) => p.photoUrl);
    const commentPhotoUrls = existing.comments.flatMap((c) => c.photos.map((p) => p.photoUrl));
    const urlsToPurge = [...new Set([...coverUrls, ...commentPhotoUrls])];
    await prisma.event.delete({
      where: { id },
    });
    await Promise.all(urlsToPurge.map((u) => localUploads.deleteManagedUploadBestEffort(u)));
  }

  /**
   * Create or update an RSVP.
   * Capacity for "going" is enforced inside a transaction (event row lock) so concurrent
   * requests cannot both pass the max-attendees check.
   */
  public async upsertRSVP(eventId: string, input: RSVPInput): Promise<RSVP> {
    const { rsvp, effectiveStatus, event, inputUserId, shouldPromote } = await prisma.$transaction(
      async (tx) => {
        const event = await tx.event.findUnique({ where: { id: eventId } });
        if (!event) {
          throw { status: 404, message: 'Event not found' };
        }

        if (event.rsvpDeadline) {
          const dl = new Date(event.rsvpDeadline);
          if (Number.isFinite(dl.getTime()) && Date.now() > dl.getTime()) {
            throw { status: 400, message: 'The RSVP deadline for this event has passed' };
          }
        }

        // Serialize RSVP updates per event (SQLite: writer lock; Postgres: row update locks parent)
        await tx.event.update({
          where: { id: eventId },
          data: { updatedAt: new Date() },
        });

        const existingRsvp = await tx.rSVP.findUnique({
          where: {
            eventId_userId: {
              eventId,
              userId: input.userId,
            },
          },
        });

        const goingCount = await tx.rSVP.count({
          where: { eventId, status: 'going' },
        });

        let effectiveStatus = input.status;

        if (input.status === 'going') {
          const max = event.maxAttendees;
          if (max != null && max > 0) {
            const wasGoing = existingRsvp?.status === 'going';
            if (!wasGoing && goingCount >= max) {
              if (event.enableWaitlist) {
                effectiveStatus = 'waitlist';
              } else {
                throw { status: 409, message: 'Event is at full capacity' };
              }
            }
          }
        }

        const rsvp = await tx.rSVP.upsert({
          where: {
            eventId_userId: {
              eventId,
              userId: input.userId,
            },
          },
          create: {
            eventId,
            userId: input.userId,
            status: effectiveStatus,
            memo: input.memo || '',
          },
          update: {
            status: effectiveStatus,
            memo: input.memo || '',
          },
        });

        const shouldPromote = existingRsvp?.status === 'going' && effectiveStatus !== 'going';

        return { rsvp, effectiveStatus, event, inputUserId: input.userId, shouldPromote };
      },
      { timeout: 10_000 }
    );

    if (shouldPromote) {
      await this.promoteFromWaitlist(eventId);
    }

    if (effectiveStatus === 'going') {
      const user = await prisma.user.findUnique({
        where: { id: inputUserId },
      });

      if (event && user) {
        const watcherIds = await this.getUserIdsWatchingEvent(eventId);
        const body = `${user.displayName} is going to ${event.title}`;
        for (const uid of watcherIds) {
          if (uid === inputUserId) continue;
          await notificationService
            .createForUser(uid, 'New RSVP', body, {
              type: 'rsvp',
              icon: '✓',
              eventId: event.id,
              groupId: event.groupId,
              dest: 'event',
            })
            .catch((err) => console.error('Failed to create RSVP notification:', err));
        }
      }
    }

    return {
      userId: rsvp.userId,
      status: rsvp.status as 'going' | 'maybe' | 'notGoing' | 'waitlist',
      memo: rsvp.memo,
      createdAt: rsvp.createdAt,
      updatedAt: rsvp.updatedAt,
    };
  }

  /**
   * Delete an RSVP
   */
  public async deleteRSVP(eventId: string, userId: string): Promise<void> {
    // Get existing RSVP to check if it was "going"
    const existingRsvp = await prisma.rSVP.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
    });

    await prisma.rSVP.delete({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
    });

    // If deleted RSVP was "going", promote waitlist
    if (existingRsvp?.status === 'going') {
      await this.promoteFromWaitlist(eventId);
    }
  }

  /**
   * Promote users from waitlist to going when spots become available
   */
  private async promoteFromWaitlist(eventId: string): Promise<void> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        rsvps: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!event || !event.maxAttendees || !event.enableWaitlist) {
      return;
    }

    const goingCount = event.rsvps.filter((r) => r.status === 'going').length;
    const availableSpots = event.maxAttendees - goingCount;

    if (availableSpots <= 0) {
      return;
    }

    const waitlisted = event.rsvps
      .filter((r) => r.status === 'waitlist')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, availableSpots);

    for (const rsvp of waitlisted) {
      await prisma.rSVP.update({
        where: {
          eventId_userId: {
            eventId,
            userId: rsvp.userId,
          },
        },
        data: {
          status: 'going',
        },
      });

      const user = await prisma.user.findUnique({
        where: { id: rsvp.userId },
      });

      // Always notify the promoted attendee (host-only rules do not apply here).
      if (user) {
        void notificationService
          .createForUser(
            rsvp.userId,
            'Promoted from Waitlist',
            `You've been moved from waitlist to going for ${event.title}`,
            {
              type: 'waitlist_promotion',
              icon: '🎉',
              eventId: event.id,
              groupId: event.groupId,
              dest: 'event',
            }
          )
          .catch(err => console.error('Failed to create promotion notification:', err));
      }
    }
  }

  /**
   * Get comments for an event
   */
  public async getComments(eventId: string, viewerUserId?: string): Promise<Comment[]> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, groupId: true, createdBy: true },
    });
    if (!event) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
    }
    const viewer = viewerUserId?.trim();
    if (viewer && !(await this.userCanReadEvent(event, viewer))) {
      throw Object.assign(new Error('Not allowed to view comments'), { status: 403 });
    }

    const comments = await prisma.comment.findMany({
      where: { eventId },
      include: COMMENT_INCLUDE_FOR_API,
      orderBy: {
        createdAt: 'asc',
      },
    });

    return comments.map((c: any) => this.mapCommentWithPhotos(c, viewer));
  }

  /**
   * Toggle a reaction emoji on a comment (active group members only).
   */
  public async setCommentReaction(commentId: string, input: CommentReactionInput): Promise<Comment> {
    const emoji = (input.emoji || '').trim();
    if (!emoji) {
      throw Object.assign(new Error('emoji is required'), { status: 400 });
    }

    const row = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        event: { select: { id: true, groupId: true, createdBy: true } },
      },
    });
    if (!row) {
      throw Object.assign(new Error('Comment not found'), { status: 404 });
    }
    await this.assertActiveMemberForEventEventRow(row.event, input.userId);

    const existing = await prisma.commentReaction.findFirst({
      where: { commentId, userId: input.userId, emoji },
    });
    if (existing) {
      await prisma.commentReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.commentReaction.create({
        data: { commentId, userId: input.userId, emoji },
      });
    }

    const full = await prisma.comment.findUnique({
      where: { id: commentId },
      include: COMMENT_INCLUDE_FOR_API,
    });
    return this.mapCommentWithPhotos(full!, input.userId);
  }

  /**
   * Create a comment
   */
  public async createComment(eventId: string, input: CommentInput): Promise<Comment> {
    const { photos = [], text, mentionedUserIds, replyToCommentId, ...commentData } = input;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
    }
    await this.assertActiveMemberForEventEventRow(event, input.userId);

    let replyId: string | undefined;
    if (replyToCommentId?.trim()) {
      replyId = replyToCommentId.trim();
      const parent = await prisma.comment.findFirst({
        where: { id: replyId, eventId },
        select: { id: true, text: true },
      });
      if (!parent) {
        throw Object.assign(new Error('Reply target not found'), { status: 400 });
      }
      if (parent.text === COMMENT_DELETED_BY_ADMIN_TEXT) {
        throw Object.assign(new Error('Cannot reply to removed message'), { status: 400 });
      }
    }

    const data: any = {
      ...commentData,
      eventId,
      ...(replyId ? { replyToCommentId: replyId } : {}),
      photos: {
        create: photos.map((photoUrl) => ({ photoUrl })),
      },
    };

    if (text !== undefined) {
      data.text = text;
    }

    const comment = await prisma.comment.create({
      data,
      include: COMMENT_INCLUDE_FOR_API,
    });

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
    });

    if (event && user) {
      const commentSnippet = text || (photos.length > 0 ? 'shared a photo' : 'commented');
      const mentionTokens = extractMentionTokens(text);
      let mentionRecipients = new Set<string>();

      if (mentionTokens.length > 0 || (mentionedUserIds && mentionedUserIds.length > 0)) {
        // Anyone in the group can be @mentioned; resolve only against this group's roster
        const groupMembers = await prisma.groupMember.findMany({
          where: {
            groupId: event.groupId,
            status: { in: ['active', 'pending'] },
          },
          include: { user: true },
        });

        const rowByUserId = new Map<string, MemberRow>();
        for (const m of groupMembers as any[]) {
          rowByUserId.set(m.userId, {
            userId: m.userId,
            displayName: m.user.displayName,
            name: m.user.name,
          });
        }

        const memberRows = [...rowByUserId.values()];
        const allowedGroupUserIds = new Set(rowByUserId.keys());

        // 1) Explicit client ids first (canonical match — avoids UUID case/hyphen mismatches
        //    that would drop valid mentioned users who are not the event host).
        mentionRecipients = new Set<string>();
        for (const raw of mentionedUserIds ?? []) {
          const canon = resolveCanonicalMemberUserId(raw, allowedGroupUserIds);
          if (canon && canon !== input.userId) {
            mentionRecipients.add(canon);
          }
        }
        // 2) Merge @tokens from comment text
        const fromText = resolveMentionRecipientIds(mentionTokens, memberRows, input.userId);
        for (const uid of fromText) {
          mentionRecipients.add(uid);
        }

        const snippet =
          commentSnippet.length > 160 ? `${commentSnippet.slice(0, 157)}…` : commentSnippet;
        const mentionBody = `${user.displayName} mentioned you in a comment on "${event.title}": ${snippet}`;

        for (const uid of mentionRecipients) {
          await notificationService
            .createForUser(uid, COMMENT_MENTION_NOTIFICATION_TITLE, mentionBody, {
              type: 'mention',
              icon: '@',
              eventId: event.id,
              groupId: event.groupId,
              dest: 'event',
            })
            .catch((err) => console.error('Failed to create mention notification:', err));
        }
      }

      // Everyone watching the event gets "New Comment" except the commenter and anyone already notified via @mention
      const watcherIds = await this.getUserIdsWatchingEvent(eventId);
      const commentBody = `${user.displayName} ${commentSnippet} on ${event.title}`;
      for (const uid of watcherIds) {
        if (uid === input.userId) continue;
        if (mentionRecipients.has(uid)) continue;
        await notificationService
          .createForUser(uid, 'New Comment', commentBody, {
            type: 'comment',
            icon: '💬',
            eventId: event.id,
            groupId: event.groupId,
            dest: 'event',
          })
          .catch((err) => console.error('Failed to create comment notification:', err));
      }
    }

    return this.mapCommentWithPhotos(comment, input.userId);
  }

  /**
   * Edit a comment. Only the comment author can edit.
   */
  public async updateComment(id: string, input: CommentUpdateInput): Promise<Comment> {
    const comment = await prisma.comment.findUnique({
      where: { id },
      include: COMMENT_INCLUDE_FOR_API,
    });
    if (!comment) {
      throw { status: 404, message: 'Comment not found' };
    }
    if (comment.userId !== input.actorId) {
      throw { status: 403, message: 'Only the author can edit this comment' };
    }

    if (comment.text === COMMENT_DELETED_BY_ADMIN_TEXT) {
      throw { status: 400, message: 'This comment cannot be edited' };
    }

    const existingUrls = (comment.photos as { photoUrl: string }[]).map((p) => p.photoUrl);
    const nextPhotos = input.photos !== undefined ? input.photos : existingUrls;
    const nextText =
      input.text !== undefined ? (input.text || '').trim() : (comment.text || '').trim();

    if (!nextText && nextPhotos.length === 0) {
      throw { status: 400, message: 'Comment cannot be empty' };
    }

    let updated;
    if (input.photos !== undefined) {
      await prisma.commentPhoto.deleteMany({ where: { commentId: id } });
      updated = await prisma.comment.update({
        where: { id },
        data: {
          text: nextText || null,
          photos: { create: nextPhotos.map((photoUrl) => ({ photoUrl })) },
        },
        include: COMMENT_INCLUDE_FOR_API,
      });
    } else {
      updated = await prisma.comment.update({
        where: { id },
        data: { text: nextText || null },
        include: COMMENT_INCLUDE_FOR_API,
      });
    }
    return this.mapCommentWithPhotos(updated, input.actorId);
  }

  /**
   * Delete a comment.
   * - Author deletes own comment → removed from thread entirely
   * - Admin/superadmin deletes another user's comment → soft-delete placeholder only
   * - Author or admin may fully remove an admin-placeholder row
   */
  public async deleteComment(id: string, input: CommentDeleteInput): Promise<void> {
    const comment = await prisma.comment.findUnique({
      where: { id },
      include: {
        event: true,
        photos: { select: { photoUrl: true } },
      },
    });
    if (!comment) {
      throw { status: 404, message: 'Comment not found' };
    }

    const actorId = input?.actorId?.trim();
    if (!actorId) {
      throw { status: 400, message: 'actorId is required' };
    }

    const isAuthor = comment.userId === actorId;

    const gmActor = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: comment.event.groupId,
          userId: actorId,
        },
      },
    });
    const isAdmin =
      !!gmActor &&
      gmActor.status === 'active' &&
      (gmActor.role === 'admin' || gmActor.role === 'superadmin');

    const isPlaceholder = comment.text === COMMENT_DELETED_BY_ADMIN_TEXT;

    const photoUrls = [...new Set(comment.photos.map((p) => p.photoUrl?.trim()).filter(Boolean))] as string[];

    const purgeCommentPhotos = async () => {
      await Promise.all(photoUrls.map((u) => localUploads.deleteManagedUploadBestEffort(u)));
    };

    if (isPlaceholder) {
      if (!isAuthor && !isAdmin) {
        throw { status: 403, message: 'Not allowed to delete this comment' };
      }
      await prisma.comment.delete({ where: { id } });
      await purgeCommentPhotos();
      return;
    }

    if (isAuthor) {
      await prisma.comment.delete({ where: { id } });
      await purgeCommentPhotos();
      return;
    }

    if (isAdmin && !isAuthor) {
      await prisma.commentReaction.deleteMany({ where: { commentId: id } });
      await prisma.commentPhoto.deleteMany({ where: { commentId: id } });
      await purgeCommentPhotos();
      await prisma.comment.update({
        where: { id },
        data: { text: COMMENT_DELETED_BY_ADMIN_TEXT },
      });
      return;
    }

    throw { status: 403, message: 'Not allowed to delete this comment' };
  }

  public async addActivityOption(
    eventId: string,
    input: EventActivityOptionInput,
  ): Promise<EventActivityOption> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { groupId: true, createdBy: true, activityIdeasEnabled: true },
    });
    if (!event) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
    }
    if (!event.activityIdeasEnabled) {
      throw Object.assign(new Error('Activity ideas are not enabled for this event'), { status: 400 });
    }
    await this.assertActiveMemberForEventEventRow(event, input.userId);
    const label = (input.label || '').trim();
    if (!label) {
      throw Object.assign(new Error('Activity label is required'), { status: 400 });
    }
    const row = await prisma.eventActivityOption.create({
      data: {
        id: input.id,
        eventId,
        label,
        createdBy: input.userId,
      },
      include: {
        _count: { select: { votes: true } },
      },
    });
    return {
      id: row.id,
      label: row.label,
      createdBy: row.createdBy,
      voteCount: row._count.votes,
      createdAt: row.createdAt,
    };
  }

  public async deleteActivityOption(
    eventId: string,
    optionId: string,
    actorId: string,
  ): Promise<void> {
    const option = await prisma.eventActivityOption.findFirst({
      where: { id: optionId, eventId },
      include: {
        event: { select: { groupId: true, createdBy: true, activityIdeasEnabled: true } },
      },
    });
    if (!option) {
      throw Object.assign(new Error('Activity option not found'), { status: 404 });
    }
    if (!option.event.activityIdeasEnabled) {
      throw Object.assign(new Error('Activity ideas are not enabled for this event'), { status: 400 });
    }
    const isAuthor = option.createdBy === actorId;
    const isHost = option.event.createdBy === actorId;
    if (!isAuthor && !isHost) {
      throw Object.assign(
        new Error('Only the option author or event host can remove this option'),
        { status: 403 },
      );
    }
    await prisma.eventActivityOption.delete({ where: { id: optionId } });
  }

  public async setActivityVote(eventId: string, input: EventActivityVoteInput): Promise<void> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { groupId: true, activityIdeasEnabled: true },
    });
    if (!event) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
    }
    if (!event.activityIdeasEnabled) {
      throw Object.assign(new Error('Activity ideas are not enabled for this event'), { status: 400 });
    }
    await this.assertActiveMemberForEventEventRow(event, input.userId);
    const opt = await prisma.eventActivityOption.findFirst({
      where: { id: input.optionId, eventId },
    });
    if (!opt) {
      throw Object.assign(new Error('Activity option not found'), { status: 404 });
    }
    const existing = await prisma.eventActivityVote.findUnique({
      where: {
        eventId_userId_optionId: {
          eventId,
          userId: input.userId,
          optionId: input.optionId,
        },
      },
    });
    if (existing) {
      await prisma.eventActivityVote.delete({
        where: { id: existing.id },
      });
    } else {
      await prisma.eventActivityVote.create({
        data: {
          id: randomUUID(),
          eventId,
          optionId: input.optionId,
          userId: input.userId,
        },
      });
    }
  }

  public async clearActivityVote(eventId: string, userId: string): Promise<void> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { groupId: true, activityIdeasEnabled: true },
    });
    if (!event) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
    }
    if (!event.activityIdeasEnabled) {
      throw Object.assign(new Error('Activity ideas are not enabled for this event'), { status: 400 });
    }
    await this.assertActiveMemberForEventEventRow(event, userId);
    await prisma.eventActivityVote.deleteMany({
      where: { eventId, userId },
    });
  }

  public async createTimeSuggestion(
    eventId: string,
    input: EventTimeSuggestionInput,
  ): Promise<EventTimeSuggestion> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { groupId: true, createdBy: true, title: true },
    });
    if (!event) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
    }
    await this.assertActiveMemberForEventEventRow(event, input.userId);
    const start = utcInstantFromClient(String(input.start));
    const end = utcInstantFromClient(String(input.end));
    if (!(start.getTime() < end.getTime())) {
      throw Object.assign(new Error('End time must be after start time'), { status: 400 });
    }
    const row = await prisma.eventTimeSuggestion.create({
      data: {
        id: input.id,
        eventId,
        suggestedBy: input.userId,
        start,
        end,
      },
    });
    if (event.createdBy !== input.userId) {
      const suggester = await prisma.user.findUnique({ where: { id: input.userId } });
      if (suggester) {
        const startStr = start.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        void notificationService
          .createForUser(
            event.createdBy,
            'Suggested time change',
            `${suggester.displayName} suggested ${startStr} for "${event.title}"`,
            {
              type: 'time_suggestion',
              icon: '🕐',
              eventId,
              groupId: event.groupId,
              dest: 'event',
            },
          )
          .catch(() => undefined);
      }
    }
    return {
      id: row.id,
      suggestedBy: row.suggestedBy,
      start: row.start,
      end: row.end,
      status: row.status as EventTimeSuggestion['status'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public async acceptTimeSuggestion(
    eventId: string,
    suggestionId: string,
    actorId: string,
  ): Promise<Event> {
    const suggestion = await prisma.eventTimeSuggestion.findFirst({
      where: { id: suggestionId, eventId },
      include: {
        event: true,
      },
    });
    if (!suggestion) {
      throw Object.assign(new Error('Time suggestion not found'), { status: 404 });
    }
    if (suggestion.status !== 'pending') {
      throw Object.assign(new Error('This suggestion is no longer pending'), { status: 400 });
    }
    await this.assertCanResolveTimeSuggestion(suggestion.event, actorId);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: eventId },
        data: {
          start: suggestion.start,
          end: suggestion.end,
          updatedBy: actorId,
        },
      });
      await tx.eventTimeSuggestion.update({
        where: { id: suggestionId },
        data: { status: 'accepted' },
      });
      await tx.eventTimeSuggestion.updateMany({
        where: {
          eventId,
          id: { not: suggestionId },
          status: 'pending',
        },
        data: { status: 'rejected' },
      });
      return tx.event.findUnique({
        where: { id: eventId },
        include: { coverPhotos: true },
      });
    });
    if (!updated) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
    }

    void this.notifyWatchersEventScheduleOrLocation(
      eventId,
      updated.groupId,
      updated.title,
      actorId,
      {
        locChanged: false,
        timeChanged: true,
        location: updated.location,
        start: updated.start,
        end: updated.end,
      }
    ).catch(() => undefined);

    return this.mapEventWithPhotos(updated);
  }

  public async rejectTimeSuggestion(
    eventId: string,
    suggestionId: string,
    actorId: string,
  ): Promise<EventTimeSuggestion> {
    const suggestion = await prisma.eventTimeSuggestion.findFirst({
      where: { id: suggestionId, eventId },
      include: {
        event: { select: { groupId: true, createdBy: true } },
      },
    });
    if (!suggestion) {
      throw Object.assign(new Error('Time suggestion not found'), { status: 404 });
    }
    if (suggestion.status !== 'pending') {
      throw Object.assign(new Error('This suggestion is no longer pending'), { status: 400 });
    }
    await this.assertCanResolveTimeSuggestion(suggestion.event, actorId);
    const row = await prisma.eventTimeSuggestion.update({
      where: { id: suggestionId },
      data: { status: 'rejected' },
    });
    return {
      id: row.id,
      suggestedBy: row.suggestedBy,
      start: row.start,
      end: row.end,
      status: row.status as EventTimeSuggestion['status'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Map Prisma event with photos to Event model
   */
  private mapEventWithPhotos(event: any): Event {
    return {
      id: event.id,
      groupId: event.groupId,
      createdBy: event.createdBy,
      updatedBy: event.updatedBy,
      title: event.title,
      description: event.description,
      coverPhotos: event.coverPhotos.map((p: any) => p.photoUrl),
      start: event.start,
      end: event.end,
      isAllDay: event.isAllDay,
      location: event.location,
      minAttendees: event.minAttendees,
      maxAttendees: event.maxAttendees,
      enableWaitlist: event.enableWaitlist,
      allowMaybe: event.allowMaybe,
      rsvpDeadline: event.rsvpDeadline ?? null,
      activityIdeasEnabled: Boolean(event.activityIdeasEnabled),
      activityVotesAnonymous: Boolean(event.activityVotesAnonymous),
      recurrenceRule: event.recurrenceRule ?? null,
      recurrenceSeriesId: event.recurrenceSeriesId ?? null,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  /**
   * Map Prisma event with all details to EventDetailed model
   */
  private mapEventDetailed(
    event: any,
    extras?: { recurrenceSeriesMemberCount?: number; viewerUserId?: string }
  ): EventDetailed {
    const votesPublic = !event.activityVotesAnonymous;
    const activityOptions: EventActivityOption[] = (event.activityOptions ?? []).map((o: any) => {
      const voteCount = typeof o._count?.votes === 'number' ? o._count.votes : (o.votes?.length ?? 0);
      const base: EventActivityOption = {
        id: o.id,
        label: o.label,
        createdBy: o.createdBy,
        voteCount,
        createdAt: o.createdAt,
      };
      if (votesPublic && Array.isArray(o.votes) && o.votes.length > 0) {
        const rawIds: string[] = o.votes.map((v: { userId?: string }) =>
          String(v.userId ?? '').trim(),
        );
        const ids = [...new Set(rawIds.filter(Boolean))].sort();
        if (ids.length > 0) base.voterUserIds = ids;
      }
      return base;
    });
    const timeSuggestions: EventTimeSuggestion[] = (event.timeSuggestions ?? []).map((s: any) => ({
      id: s.id,
      suggestedBy: s.suggestedBy,
      start: s.start,
      end: s.end,
      status: s.status as EventTimeSuggestion['status'],
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
    return {
      ...this.mapEventWithPhotos(event),
      ...(extras?.recurrenceSeriesMemberCount != null
        ? { recurrenceSeriesMemberCount: extras.recurrenceSeriesMemberCount }
        : {}),
      rsvps: event.rsvps.map((r: any) => ({
        userId: r.userId,
        status: r.status,
        memo: r.memo,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      comments: event.comments.map((c: any) => this.mapCommentWithPhotos(c, extras?.viewerUserId)),
      activityOptions,
      timeSuggestions,
    };
  }

  /**
   * Map Prisma comment with photos to Comment model
   */
  private mapCommentWithPhotos(comment: any, viewerUserId?: string): Comment {
    const rawReactions = (comment.reactions ?? []) as { userId: string; emoji: string }[];
    const byEmoji = new Map<string, Set<string>>();
    for (const r of rawReactions) {
      const e = (r.emoji || '').trim();
      if (!e) continue;
      let set = byEmoji.get(e);
      if (!set) {
        set = new Set<string>();
        byEmoji.set(e, set);
      }
      set.add(r.userId);
    }
    const reactions = [...byEmoji.entries()]
      .map(([emoji, userIds]) => ({
        emoji,
        count: userIds.size,
        userIds: [...userIds].sort(),
      }))
      .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));

    const v = viewerUserId?.trim();
    const viewerReactionEmojis = v
      ? [...new Set(rawReactions.filter((r) => r.userId === v).map((r) => (r.emoji || '').trim()).filter(Boolean))]
      : [];

    let replyTo: Comment['replyTo'] = null;
    if (comment.replyTo) {
      const p = comment.replyTo;
      const pPhotos = (p.photos ?? []).map((x: any) => x.photoUrl);
      replyTo = {
        id: p.id,
        userId: p.userId,
        text: p.text ?? '',
        preview: previewForReplyQuote(p.text, pPhotos.length),
        user: {
          id: p.user.id,
          displayName: p.user.displayName,
          name: p.user.name,
        },
        photos: pPhotos,
      };
    }

    const out: Comment = {
      id: comment.id,
      userId: comment.userId,
      text: comment.text ?? '',
      photos: (comment.photos ?? []).map((p: any) => p.photoUrl),
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      reactions,
      viewerReactionEmojis,
      replyTo,
    };
    if (comment.replyToCommentId != null && comment.replyToCommentId !== '') {
      (out as Comment).replyToCommentId = comment.replyToCommentId;
    }
    return out;
  }
}
