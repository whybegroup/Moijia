import { PrismaClient } from '@prisma/client';
import {
  Event,
  EventInput,
  EventUpdate,
  EventDetailed,
  RSVP,
  RSVPInput,
  Comment,
  CommentInput,
} from '../models';
import { NotificationService } from './NotificationService';
import { S3UploadService } from './S3UploadService';

const prisma = new PrismaClient();
const notificationService = new NotificationService();
const s3Uploads = new S3UploadService();

export class EventService {
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
      },
    });

    if (!event) return null;
    if (userId && !(await this.userCanReadEvent(event, userId))) {
      return null;
    }
    return this.mapEventDetailed(event);
  }

  /**
   * Create a new event
   */
  public async create(input: EventInput): Promise<Event> {
    const { coverPhotos = [], createdBy, ...eventData } = input;

    await this.assertCanCreateEvent(eventData.groupId, createdBy);

    const event = await prisma.event.create({
      data: {
        ...eventData,
        createdBy,
        updatedBy: createdBy,
        start: new Date(eventData.start),
        end: new Date(eventData.end),
        allowMaybe: eventData.allowMaybe ?? true,
        coverPhotos: {
          create: coverPhotos.map((photoUrl) => ({ photoUrl })),
        },
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

    // Create notification for each member
    await notificationService.createForUsers(
      members.map(m => m.userId),
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

      await Promise.all(removedUrls.map((u) => s3Uploads.deleteManagedUploadBestEffort(u)));
    }

    // Update event data
    const updateData: any = { ...eventData, updatedBy };
    if (updateData.start) updateData.start = new Date(updateData.start);
    if (updateData.end) updateData.end = new Date(updateData.end);

    const event = await prisma.event.update({
      where: { id },
      data: updateData,
      include: {
        coverPhotos: true,
      },
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
    await Promise.all(urlsToPurge.map((u) => s3Uploads.deleteManagedUploadBestEffort(u)));
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

      if (event && user && event.createdBy !== inputUserId) {
        await notificationService
          .createForUser(
            event.createdBy,
            'New RSVP',
            `${user.displayName} is going to ${event.title}`,
            {
              type: 'rsvp',
              icon: '✓',
              eventId: event.id,
              groupId: event.groupId,
              dest: 'event',
            }
          )
          .catch((err) => console.error('Failed to create RSVP notification:', err));
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
    const { photos = [], text, ...commentData } = input;

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

    // Send notification to event creator and other commenters
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        comments: {
          select: { userId: true },
          distinct: ['userId'],
        },
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
    });

    if (event && user) {
      // Create in-app notification for event creator
      if (event.createdBy !== input.userId) {
        const commentText = text || (photos.length > 0 ? 'shared a photo' : 'commented');
        await notificationService.createForUser(
          event.createdBy,
          'New Comment',
          `${user.displayName} ${commentText} on ${event.title}`,
          {
            type: 'comment',
            icon: '💬',
            eventId: event.id,
            groupId: event.groupId,
            dest: 'event',
          }
        ).catch(err => console.error('Failed to create comment notification:', err));
      }
    }

    return this.mapCommentWithPhotos(comment);
  }

  /**
   * Delete a comment
   */
  public async deleteComment(id: string): Promise<void> {
    await prisma.comment.delete({
      where: { id },
    });
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
      subtitle: event.subtitle,
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
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  /**
   * Map Prisma event with all details to EventDetailed model
   */
  private mapEventDetailed(event: any): EventDetailed {
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
