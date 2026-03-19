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

const prisma = new PrismaClient();
const notificationService = new NotificationService();

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
      if (!(await this.userCanAccessGroup(params.groupId, params.userId))) {
        return [];
      }
      where.groupId = params.groupId;
    } else {
      const memberGroupIds = await prisma.groupMember.findMany({
        where: { userId: params.userId, status: 'active' },
        select: { groupId: true },
      }).then((rows) => rows.map((r) => r.groupId));
      where.groupId = { in: memberGroupIds };
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
    if (userId && !(await this.userCanAccessGroup(event.groupId, userId))) {
      return null;
    }
    return this.mapEventDetailed(event);
  }

  /**
   * Create a new event
   */
  public async create(input: EventInput): Promise<Event> {
    const { coverPhotos = [], createdBy, ...eventData } = input;

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
    ).catch(err => console.error('Failed to create notifications:', err));

    return this.mapEventWithPhotos(event);
  }

  /**
   * Update an event
   */
  public async update(id: string, input: EventUpdate): Promise<Event> {
    const { coverPhotos, updatedBy, ...eventData } = input;

    // If cover photos are provided, update them
    if (coverPhotos) {
      await prisma.$transaction(async (tx) => {
        // Delete existing photos
        await tx.eventPhoto.deleteMany({
          where: { eventId: id },
        });

        // Create new photos
        if (coverPhotos.length > 0) {
          await tx.eventPhoto.createMany({
            data: coverPhotos.map((photoUrl) => ({ eventId: id, photoUrl })),
          });
        }
      });
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
  public async delete(id: string): Promise<void> {
    await prisma.event.delete({
      where: { id },
    });
  }

  /**
   * Create or update an RSVP
   */
  public async upsertRSVP(eventId: string, input: RSVPInput): Promise<RSVP> {
    // Get existing RSVP to check if status is changing from "going"
    const existingRsvp = await prisma.rSVP.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId: input.userId,
        },
      },
    });

    const rsvp = await prisma.rSVP.upsert({
      where: {
        eventId_userId: {
          eventId,
          userId: input.userId,
        },
      },
      create: {
        eventId,
        userId: input.userId,
        status: input.status,
        memo: input.memo || '',
      },
      update: {
        status: input.status,
        memo: input.memo || '',
      },
    });

    // If someone cancelled "going", promote waitlist
    if (existingRsvp?.status === 'going' && input.status !== 'going') {
      await this.promoteFromWaitlist(eventId);
    }

    // Create in-app notification for event creator when someone RSVPs "going"
    if (input.status === 'going') {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
      });
      
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
      });

      if (event && user && event.createdBy !== input.userId) {
        await notificationService.createForUser(
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
        ).catch(err => console.error('Failed to create RSVP notification:', err));
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

    const goingCount = event.rsvps.filter(r => r.status === 'going').length;
    const availableSpots = event.maxAttendees - goingCount;

    if (availableSpots <= 0) {
      return;
    }

    // Get waitlisted users in order of when they joined waitlist
    const waitlisted = event.rsvps
      .filter(r => r.status === 'waitlist')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, availableSpots);

    // Promote each waitlisted user to "going"
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

      // Notify promoted user
      const user = await prisma.user.findUnique({
        where: { id: rsvp.userId },
      });

      if (user) {
        await notificationService.createForUser(
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
        ).catch(err => console.error('Failed to create promotion notification:', err));
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
