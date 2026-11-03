import { PrismaClient } from '@prisma/client';
import { groupBilling } from './GroupBillingService';
import { HttpError } from '../utils/httpError';
import { PRO_PRODUCT_ID } from '../utils/subscriptionTiers';
import {
  fetchProSnapshot,
  proSnapshotFromWebhookEvent,
  revenueCatEventFromBody,
  type RevenueCatWebhookEvent,
} from './RevenueCatService';

const prisma = new PrismaClient();
const seenEventIds = new Set<string>();
let warnedMissingSecret = false;
let reconcileRunning = false;

function rememberEvent(id: string): boolean {
  if (seenEventIds.has(id)) return false;
  seenEventIds.add(id);
  if (seenEventIds.size > 1000) {
    const oldest = seenEventIds.values().next().value;
    if (oldest) seenEventIds.delete(oldest);
  }
  return true;
}

async function resolveUserId(event: RevenueCatWebhookEvent): Promise<string | null> {
  const ids = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])]
    .map((id) => id?.trim() ?? '')
    .filter((id) => id.length > 0 && !id.startsWith('$'));
  const unique = [...new Set(ids)];
  if (unique.length === 0) return null;
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  const found = new Set(users.map((user) => user.id));
  return unique.find((id) => found.has(id)) ?? null;
}

/**
 * Apply a RevenueCat webhook. Renewals, cancels, and expirations send the
 * same mail as an in-app sync, without the app being open.
 */
export async function handleRevenueCatWebhook(body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const event = revenueCatEventFromBody(body);
  if (!event?.type) return { status: 400, body: { error: 'Missing event' } };
  if (event.type === 'TEST') return { status: 200, body: { ok: true } };

  const eventId = event.id?.trim();
  if (eventId && seenEventIds.has(eventId)) return { status: 200, body: { ok: true, duplicate: true } };

  const snapshot = proSnapshotFromWebhookEvent(event);
  if (!snapshot) return { status: 200, body: { ok: true, ignored: true } };

  const userId = await resolveUserId(event);
  if (!userId) return { status: 200, body: { ok: true, ignored: true } };

  try {
    await groupBilling.syncSubscription(userId, snapshot);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      return { status: 200, body: { ok: true, ignored: true } };
    }
    throw err;
  }
  if (eventId) rememberEvent(eventId);
  console.log(`[revenuecat] ${event.type} applied for ${userId}`);
  return { status: 200, body: { ok: true } };
}

/** Pull store state for Pro accounts so a renewal still mails if no webhook arrived. */
export async function reconcileStoreSubscriptions(): Promise<void> {
  if (!process.env.REVENUECAT_SECRET_API_KEY?.trim()) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn(
        '[revenuecat] REVENUECAT_SECRET_API_KEY is unset; subscription mail is sent from webhooks or while the app is open'
      );
    }
    return;
  }
  if (reconcileRunning) return;
  reconcileRunning = true;
  try {
    const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const users = await prisma.user.findMany({
      where: {
        NOT: { subscriptionTier: 'enterprise' },
        OR: [
          { subscriptionTier: 'pro' },
          { subscriptionWillRenew: true },
          { subscriptionProductId: PRO_PRODUCT_ID, subscriptionExpiresAt: { gte: since } },
        ],
      },
      select: { id: true },
    });
    for (const user of users) {
      try {
        const snapshot = await fetchProSnapshot(user.id);
        if (!snapshot) continue;
        await groupBilling.syncSubscription(user.id, snapshot);
      } catch (err) {
        console.warn('[revenuecat] reconcile failed', user.id, err);
      }
    }
  } finally {
    reconcileRunning = false;
  }
}
