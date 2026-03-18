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

const prisma = new PrismaClient();

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
    const { coverPhotos = [], ...eventData } = input;

    const event = await prisma.event.create({
      data: {
        ...eventData,
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
      },
    });

    return this.mapEventWithPhotos(event);
  }

  /**
   * Update an event
   */
  public async update(id: string, input: EventUpdate): Promise<Event> {
    const { coverPhotos, ...eventData } = input;

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
    const updateData: any = { ...eventData };
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
