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
   * Get all events with optional filtering, including RSVPs and comments
   */
  public async getAllDetailed(params?: {
    groupId?: string;
    startAfter?: Date;
    startBefore?: Date;
    limit?: number;
  }): Promise<EventDetailed[]> {
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

  /**
   * Get event by ID with all details
   */
  public async getById(id: string): Promise<EventDetailed | null> {
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

    return event ? this.mapEventDetailed(event) : null;
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
        deadline: eventData.deadline ? new Date(eventData.deadline) : null,
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
    if (updateData.deadline) updateData.deadline = new Date(updateData.deadline);

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
      status: rsvp.status as 'going' | 'maybe' | 'notGoing',
      memo: rsvp.memo,
      createdAt: rsvp.createdAt,
      updatedAt: rsvp.updatedAt,
    };
  }

  /**
   * Delete an RSVP
   */
  public async deleteRSVP(eventId: string, userId: string): Promise<void> {
    await prisma.rSVP.delete({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
    });
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
      deadline: event.deadline,
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
