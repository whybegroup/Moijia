import { Body, Controller, Delete, Get, Path, Post, Put, Query, Route, SuccessResponse, Tags } from 'tsoa';
import {
  Poll,
  PollCloseInput,
  PollInput,
  PollOptionSuggestion,
  PollOptionSuggestionDecisionInput,
  PollOptionSuggestionDecisionResult,
  PollOptionSuggestionInput,
  PollResults,
  PollVoteInput,
  PollWatchInput,
} from '../models';
import { PollService } from '../services/PollService';
import { httpError } from '../utils/httpError';

@Route('polls')
@Tags('Polls')
export class PollController extends Controller {
  private pollService = new PollService();

  /**
   * Create a poll in a group (active members).
   */
  @Post()
  @SuccessResponse('201', 'Created')
  public async createPoll(@Query() userId: string, @Body() body: PollInput): Promise<Poll> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    if (body.createdBy !== userId) {
      this.setStatus(403);
      throw new Error('createdBy must match authenticated user');
    }
    this.setStatus(201);
    return this.pollService.create(body);
  }

  /**
   * Edit an existing poll (creator only).
   */
  @Put('{id}')
  public async updatePoll(@Path() id: string, @Query() userId: string, @Body() body: PollInput): Promise<Poll> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    return this.pollService.update(id, userId, body);
  }

  /**
   * Get a poll if the user is an active member of its group.
   */
  @Get('{id}')
  public async getPoll(@Path() id: string, @Query() userId: string): Promise<Poll> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    const poll = await this.pollService.getById(id, userId);
    if (!poll) {
      throw httpError(404, 'Poll not found');
    }
    return poll;
  }

  /**
   * List polls where the user is an active member of the group.
   */
  @Get()
  public async listPolls(@Query() userId: string): Promise<Poll[]> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    return this.pollService.listForUser(userId);
  }

  /**
   * Watch / unwatch this poll for default notifications.
   */
  @Put('{id}/watch')
  public async setPollWatch(
    @Path() id: string,
    @Query() userId: string,
    @Body() body: PollWatchInput
  ): Promise<{ watching: boolean; defaultWatching: boolean }> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    return this.pollService.setPollWatch(id, userId, body);
  }

  /**
   * Submit or replace the user's votes for this poll.
   */
  @Post('{id}/vote')
  public async submitVote(
    @Path() id: string,
    @Body() body: PollVoteInput,
  ): Promise<PollResults> {
    if (!body?.userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    return this.pollService.submitVote(id, body.userId, body.optionIds ?? [], body.textAnswers ?? []);
  }

  /**
   * Close poll early (creator/admin/superadmin).
   */
  @Post('{id}/close')
  public async closePoll(@Path() id: string, @Body() body: PollCloseInput): Promise<Poll> {
    if (!body?.userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    return this.pollService.close(id, body.userId);
  }

  /**
   * Read aggregated poll results + caller's current selections.
   */
  @Get('{id}/results')
  public async getPollResults(@Path() id: string, @Query() userId: string): Promise<PollResults> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    return this.pollService.getResults(id, userId);
  }

  /**
   * Suggest a new choice option (active group members; not for text questions).
   */
  @Post('{id}/option-suggestions')
  @SuccessResponse('201', 'Created')
  public async suggestPollOption(
    @Path() id: string,
    @Body() body: PollOptionSuggestionInput,
  ): Promise<PollOptionSuggestion> {
    if (!body?.userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    this.setStatus(201);
    return this.pollService.suggestPollOption(id, body.userId, body.questionKey, body.label);
  }

  /**
   * List option suggestions (poll creator only).
   */
  @Get('{id}/option-suggestions')
  public async listPollOptionSuggestions(@Path() id: string, @Query() userId: string): Promise<PollOptionSuggestion[]> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    return this.pollService.listPollOptionSuggestions(id, userId);
  }

  /**
   * Accept or decline a suggested option (poll creator only).
   */
  @Post('{id}/option-suggestions/{suggestionId}/decide')
  public async decidePollOptionSuggestion(
    @Path() id: string,
    @Path() suggestionId: string,
    @Body() body: PollOptionSuggestionDecisionInput,
  ): Promise<PollOptionSuggestionDecisionResult> {
    if (!body?.userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    return this.pollService.decidePollOptionSuggestion(id, suggestionId, body.userId, body.decision);
  }

  /**
   * Delete a poll (creator or group admin).
   */
  @Delete('{id}')
  @SuccessResponse('204', 'No Content')
  public async deletePoll(@Path() id: string, @Query() userId: string): Promise<void> {
    if (!userId) {
      this.setStatus(400);
      throw new Error('userId is required');
    }
    await this.pollService.delete(id, userId);
    this.setStatus(204);
  }
}
