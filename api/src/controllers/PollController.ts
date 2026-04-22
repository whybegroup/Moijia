import { Body, Controller, Get, Path, Post, Query, Route, SuccessResponse, Tags } from 'tsoa';
import { Poll, PollInput, PollResults, PollVoteInput } from '../models';
import { PollService } from '../services/PollService';

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
      this.setStatus(404);
      throw new Error('Poll not found');
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
    return this.pollService.submitVote(id, body.userId, body.optionIds ?? []);
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
}
