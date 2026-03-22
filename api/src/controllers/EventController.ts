import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Query,
  Route,
  Tags,
  SuccessResponse,
} from 'tsoa';
import {
  Event,
  EventInput,
  EventUpdate,
  EventDetailed,
  RSVPInput,
  RSVP,
  Comment,
  CommentInput,
} from '../models';
import { EventService } from '../services/EventService';

@Route('events')
@Tags('Events')
export class EventController extends Controller {
  private eventService = new EventService();

  /**
   * Get all events
   * @summary Retrieves events scoped by user's group membership. userId required.
   */
  @Get()
  public async getEvents(
    @Query() userId: string,
    @Query() groupId?: string,
    @Query() startAfter?: string,
    @Query() startBefore?: string,
    @Query() limit?: number
  ): Promise<EventDetailed[]> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    return this.eventService.getAllDetailed({
      userId,
      groupId,
      startAfter: startAfter ? new Date(startAfter) : undefined,
      startBefore: startBefore ? new Date(startBefore) : undefined,
      limit,
    });
  }

  /**
   * Get event by ID
   * @summary Retrieves a single event. userId required to verify access.
   */
  @Get('{id}')
  public async getEvent(
    @Path() id: string,
    @Query() userId: string
  ): Promise<EventDetailed> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    const event = await this.eventService.getById(id, userId);
    if (!event) {
      this.setStatus(404);
      throw new Error('Event not found');
    }
    return event;
  }

  /**
   * Create a new event
   * @summary Creates a new event in a group
   */
  @Post()
  @SuccessResponse('201', 'Created')
  public async createEvent(
    @Query() userId: string,
    @Body() body: EventInput
  ): Promise<Event> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    if (body.createdBy !== userId) {
      this.setStatus(403);
      throw new Error('createdBy must match authenticated user');
    }
    this.setStatus(201);
    return this.eventService.create(body);
  }

  /**
   * Update an event
   * @summary Updates an existing event's information
   */
  @Put('{id}')
  public async updateEvent(
    @Path() id: string,
    @Query() userId: string,
    @Body() body: EventUpdate
  ): Promise<Event> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    if (body.updatedBy !== userId) {
      this.setStatus(403);
      throw new Error('updatedBy must match authenticated user');
    }
    return this.eventService.update(id, body);
  }

  /**
   * Delete an event
   * @summary Deletes an event and all associated data
   */
  @Delete('{id}')
  @SuccessResponse('204', 'No Content')
  public async deleteEvent(@Path() id: string, @Query() userId: string): Promise<void> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    await this.eventService.delete(id, userId);
    this.setStatus(204);
  }

  /**
   * Create or update RSVP
   * @summary Creates or updates a user's RSVP for an event
   */
  @Post('{id}/rsvps')
  public async upsertRSVP(
    @Path() id: string,
    @Body() body: RSVPInput
  ): Promise<RSVP> {
    return this.eventService.upsertRSVP(id, body);
  }

  /**
   * Delete RSVP
   * @summary Removes a user's RSVP from an event
   */
  @Delete('{id}/rsvps/{userId}')
  @SuccessResponse('204', 'No Content')
  public async deleteRSVP(
    @Path() id: string,
    @Path() userId: string
  ): Promise<void> {
    await this.eventService.deleteRSVP(id, userId);
    this.setStatus(204);
  }

  /**
   * Get event comments
   * @summary Retrieves all comments for an event
   */
  @Get('{id}/comments')
  public async getComments(@Path() id: string): Promise<Comment[]> {
    return this.eventService.getComments(id);
  }

  /**
   * Create a comment
   * @summary Adds a new comment to an event
   */
  @Post('{id}/comments')
  @SuccessResponse('201', 'Created')
  public async createComment(
    @Path() id: string,
    @Body() body: CommentInput
  ): Promise<Comment> {
    this.setStatus(201);
    return this.eventService.createComment(id, body);
  }
}

@Route('comments')
@Tags('Comments')
export class CommentController extends Controller {
  private eventService = new EventService();

  /**
   * Delete a comment
   * @summary Deletes a comment from an event
   */
  @Delete('{id}')
  @SuccessResponse('204', 'No Content')
  public async deleteComment(@Path() id: string): Promise<void> {
    await this.eventService.deleteComment(id);
    this.setStatus(204);
  }
}
