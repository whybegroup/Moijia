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
import { parseRecurrenceExdatesJson, serializeRecurrenceExdatesJson } from '../utils/recurrenceExdates';

const prisma = new PrismaClient();
const notificationService = new NotificationService();
const localUploads = new LocalUploadService();

const COMMENT_MENTION_NOTIFICATION_TITLE = 'You were mentioned';
/** Shown when a group admin removes someone else's comment (soft-delete). */
export const COMMENT_DELETED_BY_ADMIN_TEXT = 'This message was deleted by admin';

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
          include: {
            photos: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        activityOptions: {
          orderBy: { createdAt: 'asc' },
          include: {
            _count: { select: { votes: true } },
          },
        },
        timeSuggestions: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: {
        start: 'asc',
      },
      take: params?.limit,
    });

    return events.map((e) => this.mapEventDetailed(e));
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

  /**
   * Creator may always edit/delete their event (even if no longer a member).
   * Admins and superadmins may edit/delete other members' events while they remain active in the group.
   */
  private async assertCanMutateEvent(
    event: { groupId: string; createdBy: string },
    actorId: string,
  ): Promise<void> {
    if (event.createdBy === actorId) return;
    const role = await this.getActiveMemberRole(event.groupId, actorId);
    if (role && this.isAdminOrSuperadminRole(role)) return;
    throw Object.assign(
      new Error('Only the event creator or group admins can update or delete this event'),
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
          include: {
            photos: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        activityOptions: {
          orderBy: { createdAt: 'asc' },
          include: {
            _count: { select: { votes: true } },
          },
        },
        timeSuggestions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!event) return null;
    if (userId && !(await this.userCanReadEvent(event, userId))) {
      return null;
    }
    const detailed = this.mapEventDetailed(event);
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
   * Create a new event
   */
  public async create(input: EventInput): Promise<Event> {
    const { coverPhotos = [], createdBy, activityOptionLabels, recurrenceRule: rrIn, ...eventData } =
      input;

    await this.assertCanCreateEvent(eventData.groupId, createdBy);
    const recurrenceRule = normalizeRecurrenceRule(rrIn ?? null);

    const labels = (activityOptionLabels ?? [])
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter((s) => s.length > 0);

    const event = await prisma.event.create({
      data: {
        ...eventData,
        createdBy,
        updatedBy: createdBy,
        start: new Date(eventData.start),
        end: new Date(eventData.end),
        allowMaybe: eventData.allowMaybe ?? true,
        recurrenceRule,
        coverPhotos: {
          create: coverPhotos.map((photoUrl) => ({ photoUrl })),
        },
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
      include: {
        coverPhotos: true,
        group: true,
      },
    });

    // Create in-app notifications for all group members
    const startDate = new Date(eventData.start);
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
    const { coverPhotos, updatedBy, ...eventData } = input;

    const existing = await prisma.event.findUnique({
      where: { id },
      select: {
        groupId: true,
        createdBy: true,
        title: true,
        start: true,
        end: true,
        location: true,
        recurrenceRule: true,
        coverPhotos: { select: { photoUrl: true } },
      },
    });
    if (!existing) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
    }
    await this.assertCanMutateEvent(existing, updatedBy);

    if (coverPhotos !== undefined) {
      const previousUrls = existing.coverPhotos.map((p) => p.photoUrl);
      const nextSet = new Set(coverPhotos);
      const removedUrls = previousUrls.filter((u) => !nextSet.has(u));

      await prisma.$transaction(async (tx) => {
        await tx.eventPhoto.deleteMany({
          where: { eventId: id },
        });

        if (coverPhotos.length > 0) {
          await tx.eventPhoto.createMany({
            data: coverPhotos.map((photoUrl) => ({ eventId: id, photoUrl })),
          });
        }
      });

      await Promise.all(removedUrls.map((u) => localUploads.deleteManagedUploadBestEffort(u)));
    }

    // Update event data
    const updateData: any = { ...eventData, updatedBy };
    if (updateData.start !== undefined) updateData.start = new Date(updateData.start);
    if (updateData.end !== undefined) updateData.end = new Date(updateData.end);
    if (updateData.location !== undefined) {
      const s = updateData.location;
      updateData.location =
        s == null || (typeof s === 'string' && s.trim() === '') ? null : String(s).trim();
    }
    if (updateData.description !== undefined) {
      const s = updateData.description;
      updateData.description =
        s == null || (typeof s === 'string' && s.trim() === '') ? null : String(s).trim();
    }
    if (eventData.recurrenceRule !== undefined) {
      updateData.recurrenceRule = normalizeRecurrenceRule(eventData.recurrenceRule);
      const prevRr = (existing.recurrenceRule ?? null) as string | null;
      const nextRr = updateData.recurrenceRule ?? null;
      if (prevRr !== nextRr) {
        updateData.recurrenceExdates = null;
      }
    }
    const nextStart = eventData.start !== undefined ? new Date(eventData.start) : null;
    const nextEnd = eventData.end !== undefined ? new Date(eventData.end) : null;
    const startChanged =
      nextStart !== null && !EventService.eventInstantUnchanged(existing.start, nextStart);
    const endChanged = nextEnd !== null && !EventService.eventInstantUnchanged(existing.end, nextEnd);
    const timeChanged = startChanged || endChanged;

    const event = await prisma.event.update({
      where: { id },
      data: updateData,
      include: {
        coverPhotos: true,
      },
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
   * Exclude one occurrence from a recurring series (client expansion skips these instants).
   */
  public async excludeRecurrenceOccurrence(
    id: string,
    actorUserId: string,
    occurrenceStartIso: string
  ): Promise<Event> {
    const existing = await prisma.event.findUnique({
      where: { id },
      select: {
        groupId: true,
        createdBy: true,
        recurrenceRule: true,
        recurrenceExdates: true,
      },
    });
    if (!existing) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
    }
    await this.assertCanMutateEvent(existing, actorUserId);
    if (!existing.recurrenceRule?.trim()) {
      throw Object.assign(new Error('Event is not recurring'), { status: 400 });
    }
    const ts = new Date(occurrenceStartIso).getTime();
    if (!Number.isFinite(ts)) {
      throw Object.assign(new Error('Invalid occurrenceStart'), { status: 400 });
    }
    const prev = parseRecurrenceExdatesJson(existing.recurrenceExdates ?? null) ?? [];
    const next = [...new Set([...prev, ts])].sort((a, b) => a - b);
    const event = await prisma.event.update({
      where: { id },
      data: {
        recurrenceExdates: serializeRecurrenceExdatesJson(next),
        updatedBy: actorUserId,
      },
      include: { coverPhotos: true },
    });
    return this.mapEventWithPhotos(event);
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
    await this.assertCanMutateEvent(existing, actorUserId);
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
  public async getComments(eventId: string): Promise<Comment[]> {
    const comments = await prisma.comment.findMany({
      where: { eventId },
      include: {
        photos: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return comments.map((c: any) => this.mapCommentWithPhotos(c));
  }

  /**
   * Create a comment
   */
  public async createComment(eventId: string, input: CommentInput): Promise<Comment> {
    const { photos = [], text, mentionedUserIds, ...commentData } = input;

    const data: any = {
      ...commentData,
      eventId,
      photos: {
        create: photos.map((photoUrl) => ({ photoUrl })),
      },
    };

    if (text !== undefined) {
      data.text = text;
    }

    const comment = await prisma.comment.create({
      data,
      include: {
        photos: true,
      },
    });

    const event = await prisma.event.findUnique({
      where: { id: eventId },
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

    return this.mapCommentWithPhotos(comment);
  }

  /**
   * Edit a comment. Only the comment author can edit.
   */
  public async updateComment(id: string, input: CommentUpdateInput): Promise<Comment> {
    const comment = await prisma.comment.findUnique({
      where: { id },
      include: { photos: true },
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

    const nextText = (input.text || '').trim();
    if (!nextText) {
      throw { status: 400, message: 'Comment text cannot be empty' };
    }
    const updated = await prisma.comment.update({
      where: { id },
      data: { text: nextText },
      include: { photos: true },
    });
    return this.mapCommentWithPhotos(updated);
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
      include: { event: true },
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

    if (isPlaceholder) {
      if (!isAuthor && !isAdmin) {
        throw { status: 403, message: 'Not allowed to delete this comment' };
      }
      await prisma.comment.delete({ where: { id } });
      return;
    }

    if (isAuthor) {
      await prisma.comment.delete({ where: { id } });
      return;
    }

    if (isAdmin && !isAuthor) {
      await prisma.commentPhoto.deleteMany({ where: { commentId: id } });
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
      select: { groupId: true, createdBy: true },
    });
    if (!event) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
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
        event: { select: { groupId: true, createdBy: true } },
      },
    });
    if (!option) {
      throw Object.assign(new Error('Activity option not found'), { status: 404 });
    }
    const isAuthor = option.createdBy === actorId;
    const isHost = option.event.createdBy === actorId;
    let isAdmin = false;
    if (!isAuthor && !isHost) {
      const role = await this.getActiveMemberRole(option.event.groupId, actorId);
      isAdmin = !!role && this.isAdminOrSuperadminRole(role);
    }
    if (!isAuthor && !isHost && !isAdmin) {
      throw Object.assign(
        new Error('Only the option author, event host, or group admins can remove this option'),
        { status: 403 },
      );
    }
    await prisma.eventActivityOption.delete({ where: { id: optionId } });
  }

  public async setActivityVote(eventId: string, input: EventActivityVoteInput): Promise<void> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { groupId: true },
    });
    if (!event) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
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
      select: { groupId: true },
    });
    if (!event) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
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
    const start = new Date(input.start);
    const end = new Date(input.end);
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
      recurrenceRule: event.recurrenceRule ?? null,
      recurrenceExdates: (() => {
        const x = parseRecurrenceExdatesJson(event.recurrenceExdates ?? null);
        return x && x.length > 0 ? x : undefined;
      })(),
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  /**
   * Map Prisma event with all details to EventDetailed model
   */
  private mapEventDetailed(event: any): EventDetailed {
    const activityOptions: EventActivityOption[] = (event.activityOptions ?? []).map((o: any) => ({
      id: o.id,
      label: o.label,
      createdBy: o.createdBy,
      voteCount: o._count?.votes ?? 0,
      createdAt: o.createdAt,
    }));
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
      rsvps: event.rsvps.map((r: any) => ({
        userId: r.userId,
        status: r.status,
        memo: r.memo,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      comments: event.comments.map((c: any) => this.mapCommentWithPhotos(c)),
      activityOptions,
      timeSuggestions,
    };
  }

  /**
   * Map Prisma comment with photos to Comment model
   */
  private mapCommentWithPhotos(comment: any): Comment {
    return {
      id: comment.id,
      userId: comment.userId,
      text: comment.text,
      photos: comment.photos.map((p: any) => p.photoUrl),
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }
}
