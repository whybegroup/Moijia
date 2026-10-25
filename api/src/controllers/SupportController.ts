import { Body, Controller, Post, Response, Route, Tags } from 'tsoa';
import type { SupportRequest, SupportSubmitResult } from '../models';
import { sendSupportEmail } from '../services/EmailService';
import { httpError } from '../utils/httpError';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const recentByEmail = new Map<string, number[]>();
const MAX_PER_HOUR = 5;

function recentSends(email: string): number[] {
  const windowStart = Date.now() - 60 * 60 * 1000;
  return (recentByEmail.get(email) ?? []).filter((at) => at > windowStart);
}

@Route('support')
@Tags('Support')
export class SupportController extends Controller {
  /**
   * Send a support message
   * @summary Delivers the support form to the moijia inbox
   */
  @Post()
  @Response(400, 'Invalid request')
  @Response(429, 'Too many requests')
  @Response(502, 'Could not send')
  public async submitSupport(@Body() body: SupportRequest): Promise<SupportSubmitResult> {
    const name = body.name?.trim() ?? '';
    const email = body.email?.trim() ?? '';
    const message = body.message?.trim() ?? '';
    if (!name || name.length > 80) {
      throw httpError(400, 'Enter your name.');
    }
    if (!EMAIL_RE.test(email) || email.length > 200) {
      throw httpError(400, 'Enter a valid email address.');
    }
    if (message.length < 10 || message.length > 4000) {
      throw httpError(400, 'Message should be between 10 and 4000 characters.');
    }
    const sender = email.toLowerCase();
    const recent = recentSends(sender);
    if (recent.length >= MAX_PER_HOUR) {
      recentByEmail.set(sender, recent);
      throw httpError(429, 'Too many messages from this email. Try again later.');
    }
    try {
      await sendSupportEmail({ name, email, message });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Could not send email.';
      throw httpError(502, detail);
    }
    recent.push(Date.now());
    recentByEmail.set(sender, recent);
    return { sent: true };
  }
}
