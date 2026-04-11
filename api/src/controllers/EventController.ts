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
  EventActivityOption,
  EventTimeSuggestion,
  RSVPInput,
  RSVP,
  Comment,
  CommentInput,
  CommentUpdateInput,
  EventWatchInput,
  EventActivityOptionInput,
  EventActivityVoteInput,
  EventTimeSuggestionInput,
  RecurrenceTruncateSeriesInput,
  RecurrenceTruncateResult,
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
   * Watch / unwatch this event for default notifications (per-user).
   */
  @Put('{id}/watch')
  public async setEventWatch(
    @Path() id: string,
    @Query() userId: string,
    @Body() body: EventWatchInput
  ): Promise<{ watching: boolean; defaultWatching: boolean }> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    return this.eventService.setEventWatch(id, userId, body);
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
   * Delete every occurrence in a series (same `recurrenceSeriesId`).
   */
  @Delete('recurrence-series/{seriesId}')
  @SuccessResponse('204', 'No Content')
  public async deleteRecurrenceSeries(
    @Path() seriesId: string,
    @Query() userId: string
  ): Promise<void> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    await this.eventService.deleteRecurrenceSeries(seriesId, userId);
    this.setStatus(204);
  }

  /**
   * Remove this occurrence and all later ones in the same series (by start time).
   * If the chosen occurrence is the first, deletes the entire series.
   */
  @Post('{id}/recurrence/truncate')
  public async truncateRecurrenceSeries(
    @Path() id: string,
    @Query() userId: string,
    @Body() body: RecurrenceTruncateSeriesInput
  ): Promise<RecurrenceTruncateResult> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    const r = await this.eventService.truncateRecurrenceSeriesFrom(
      id,
      userId,
      body.occurrenceStart,
      body.viewerTimeZone
    );
    if (r.deleted) {
      return { deleted: true };
    }
    return { deleted: false, event: r.event };
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

  /**
   * Add an activity option (any active group member).
   */
  @Post('{id}/activity-options')
  @SuccessResponse('201', 'Created')
  public async addActivityOption(
    @Path() id: string,
    @Query() userId: string,
    @Body() body: EventActivityOptionInput,
  ): Promise<EventActivityOption> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    if (body.userId !== userId) {
      this.setStatus(403);
      throw new Error('userId in body must match authenticated user');
    }
    this.setStatus(201);
    return this.eventService.addActivityOption(id, body);
  }

  /**
   * Remove an activity option (author, host, or group admin).
   */
  @Delete('{id}/activity-options/{optionId}')
  @SuccessResponse('204', 'No Content')
  public async deleteActivityOption(
    @Path() id: string,
    @Path() optionId: string,
    @Query() userId: string,
  ): Promise<void> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    await this.eventService.deleteActivityOption(id, optionId, userId);
    this.setStatus(204);
  }

  /**
   * Toggle vote for an activity (users may vote for multiple options; same request removes vote).
   */
  @Put('{id}/activity-vote')
  @SuccessResponse('204', 'No Content')
  public async setActivityVote(
    @Path() id: string,
    @Query() userId: string,
    @Body() body: EventActivityVoteInput,
  ): Promise<void> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    if (body.userId !== userId) {
      this.setStatus(403);
      throw new Error('userId in body must match authenticated user');
    }
    await this.eventService.setActivityVote(id, body);
    this.setStatus(204);
  }

  /**
   * Clear the current user's activity vote.
   */
  @Delete('{id}/activity-vote')
  @SuccessResponse('204', 'No Content')
  public async clearActivityVote(@Path() id: string, @Query() userId: string): Promise<void> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    await this.eventService.clearActivityVote(id, userId);
    this.setStatus(204);
  }

  /**
   * Suggest a new start/end time for the event.
   */
  @Post('{id}/time-suggestions')
  @SuccessResponse('201', 'Created')
  public async createTimeSuggestion(
    @Path() id: string,
    @Query() userId: string,
    @Body() body: EventTimeSuggestionInput,
  ): Promise<EventTimeSuggestion> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    if (body.userId !== userId) {
      this.setStatus(403);
      throw new Error('userId in body must match authenticated user');
    }
    this.setStatus(201);
    return this.eventService.createTimeSuggestion(id, body);
  }

  /**
   * Host or group admin: apply a suggested time to the event.
   */
  @Post('{id}/time-suggestions/{suggestionId}/accept')
  public async acceptTimeSuggestion(
    @Path() id: string,
    @Path() suggestionId: string,
    @Query() userId: string,
  ): Promise<Event> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    return this.eventService.acceptTimeSuggestion(id, suggestionId, userId);
  }

  /**
   * Host or group admin: reject a time suggestion.
   */
  @Post('{id}/time-suggestions/{suggestionId}/reject')
  public async rejectTimeSuggestion(
    @Path() id: string,
    @Path() suggestionId: string,
    @Query() userId: string,
  ): Promise<EventTimeSuggestion> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    return this.eventService.rejectTimeSuggestion(id, suggestionId, userId);
  }
}

@Route('comments')
@Tags('Comments')
export class CommentController extends Controller {
  private eventService = new EventService();

  /**
   * Edit a comment
   * @summary Edits a comment by its author
   */
  @Put('{id}')
  public async updateComment(
    @Path() id: string,
    @Body() body: CommentUpdateInput
  ): Promise<Comment> {
    return this.eventService.updateComment(id, body);
  }

  /**
   * Delete a comment
   * @summary Deletes a comment from an event (admin can delete others)
   */
  @Delete('{id}')
  @SuccessResponse('204', 'No Content')
  public async deleteComment(@Path() id: string, @Query() actorId: string): Promise<void> {
    await this.eventService.deleteComment(id, { actorId });
    this.setStatus(204);
  }
}
