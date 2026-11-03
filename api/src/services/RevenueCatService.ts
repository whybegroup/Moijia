import { timingSafeEqual } from 'crypto';
import { PRO_PRODUCT_ID } from '../utils/subscriptionTiers';

const PRO_ENTITLEMENT_ID = 'entitlement_subscription_pro';

export type StoreSubscriptionSnapshot = {
  proActive: boolean;
  proRenewing: boolean;
  expiresAt: Date | null;
  purchasedAt: Date | null;
  /**
   * False on a RENEWAL event. A repeat of a period already stored as cancelled
   * must not turn auto-renew back on. A later period still can.
   */
  resumeRenewal?: boolean;
};

export type RevenueCatWebhookEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  new_product_id?: string;
  entitlement_id?: string | null;
  entitlement_ids?: string[] | null;
  purchased_at_ms?: number | null;
  expiration_at_ms?: number | null;
  grace_period_expiration_at_ms?: number | null;
};

/**
 * Best-effort RevenueCat subscriber wipe so a re-created account
 * (same Firebase uid / email) does not inherit prior entitlements.
 * Requires REVENUECAT_SECRET_API_KEY (REST secret, not the public SDK key).
 */
export async function deleteRevenueCatSubscriber(appUserId: string): Promise<void> {
  const secret = process.env.REVENUECAT_SECRET_API_KEY?.trim();
  const id = appUserId?.trim();
  if (!secret || !id) return;

  const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}`;
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!res.ok && res.status !== 404) {
      const body = await res.text().catch(() => '');
      console.warn(`[revenuecat] delete subscriber ${res.status}: ${body}`);
    }
  } catch (e) {
    console.warn('[revenuecat] delete subscriber failed', e);
  }
}

function secretKey(): string {
  return process.env.REVENUECAT_SECRET_API_KEY?.trim() ?? '';
}

const pushedEmails = new Set<string>();
const readySubscribers = new Set<string>();

function rejectAnonymousId(appUserId: string): boolean {
  if (!appUserId.startsWith('$')) return false;
  console.warn(`[revenuecat] refusing anonymous customer ${appUserId}`);
  return true;
}

/**
 * RevenueCat creates the customer on GET when the id is new.
 * Attribute updates 404 until that customer exists.
 */
export async function ensureRevenueCatSubscriber(appUserId: string): Promise<boolean> {
  const secret = secretKey();
  const id = appUserId.trim();
  if (!secret || !id || rejectAnonymousId(id)) return false;
  if (readySubscribers.has(id)) return true;
  const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[revenuecat] ensure subscriber ${res.status} for ${id}: ${body.slice(0, 200)}`);
      return false;
    }
    readySubscribers.add(id);
    if (res.status === 201) console.log(`[revenuecat] created customer ${id}`);
    else console.log(`[revenuecat] subscriber ${id} ready`);
    return true;
  } catch (e) {
    console.warn(`[revenuecat] ensure subscriber failed for ${id}`, e);
    return false;
  }
}

/** Sets the RevenueCat `$email` attribute shown on the customers page. */
export async function setRevenueCatEmail(appUserId: string, email: string | null | undefined): Promise<void> {
  const secret = secretKey();
  const id = appUserId?.trim() ?? '';
  const value = email?.trim() ?? '';
  if (!secret || !id || rejectAnonymousId(id)) return;
  if (!(await ensureRevenueCatSubscriber(id))) return;
  if (!value.includes('@')) {
    const skip = `${id}\0`;
    if (pushedEmails.has(skip)) return;
    pushedEmails.add(skip);
    console.log(`[revenuecat] skip $email for ${id}: no address on the user`);
    return;
  }
  const key = `${id}\0${value.toLowerCase()}`;
  if (pushedEmails.has(key)) return;
  pushedEmails.add(key);
  const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}/attributes`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ attributes: { $email: { value } } }),
    });
    if (!res.ok) {
      pushedEmails.delete(key);
      const body = await res.text().catch(() => '');
      console.warn(`[revenuecat] set $email ${res.status} for ${id}: ${body.slice(0, 200)}`);
      return;
    }
    console.log(`[revenuecat] set $email for ${id} to ${value}`);
  } catch (e) {
    pushedEmails.delete(key);
    console.warn(`[revenuecat] set $email failed for ${id}`, e);
  }
}

function safeEqual(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

/** RevenueCat sends the dashboard Authorization header exactly as it was entered. */
export function revenueCatWebhookAuthorized(header: string | undefined): boolean {
  const got = header?.trim() ?? '';
  if (!got) return false;
  const configured = process.env.REVENUECAT_WEBHOOK_AUTHORIZATION?.trim() ?? '';
  if (configured && safeEqual(got, configured)) return true;
  const secret = secretKey();
  if (!secret) return false;
  return safeEqual(got, secret) || safeEqual(got, `Bearer ${secret}`);
}

function parseRcDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateFromMs(value: unknown): Date | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function laterDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

export function revenueCatEventFromBody(body: unknown): RevenueCatWebhookEvent | null {
  if (!body || typeof body !== 'object') return null;
  const event = (body as { event?: unknown }).event;
  if (!event || typeof event !== 'object') return null;
  return event as RevenueCatWebhookEvent;
}

function eventMentionsPro(event: RevenueCatWebhookEvent): boolean {
  if (event.product_id === PRO_PRODUCT_ID || event.new_product_id === PRO_PRODUCT_ID) return true;
  const entitlements = [
    ...(Array.isArray(event.entitlement_ids) ? event.entitlement_ids : []),
    event.entitlement_id,
  ];
  return entitlements.includes(PRO_ENTITLEMENT_ID);
}

/**
 * Map a webhook event onto the same snapshot the app used to push.
 * Null means this event should not change Pro (test ping, other products).
 */
export function proSnapshotFromWebhookEvent(
  event: RevenueCatWebhookEvent,
  now = Date.now()
): StoreSubscriptionSnapshot | null {
  const type = event.type?.trim() ?? '';
  if (!type || type === 'TEST' || !eventMentionsPro(event)) return null;
  const purchasedAt = dateFromMs(event.purchased_at_ms);
  const expiresAt = laterDate(dateFromMs(event.expiration_at_ms), dateFromMs(event.grace_period_expiration_at_ms));
  const stillActive = !expiresAt || expiresAt.getTime() > now;

  if (type === 'PRODUCT_CHANGE' && event.new_product_id && event.new_product_id !== PRO_PRODUCT_ID) {
    return { proActive: false, proRenewing: false, expiresAt, purchasedAt };
  }
  if (type === 'EXPIRATION') {
    return { proActive: false, proRenewing: false, expiresAt, purchasedAt };
  }
  if (type === 'CANCELLATION' || type === 'SUBSCRIPTION_PAUSED' || type === 'NON_RENEWING_PURCHASE') {
    return { proActive: stillActive, proRenewing: false, expiresAt, purchasedAt };
  }
  if (type === 'RENEWAL') {
    return { proActive: stillActive, proRenewing: stillActive, expiresAt, purchasedAt, resumeRenewal: false };
  }
  if (
    type === 'INITIAL_PURCHASE' ||
    type === 'UNCANCELLATION' ||
    type === 'PRODUCT_CHANGE' ||
    type === 'SUBSCRIPTION_EXTENDED' ||
    type === 'REFUND_REVERSED' ||
    type === 'TEMPORARY_ENTITLEMENT_GRANT'
  ) {
    return { proActive: stillActive, proRenewing: stillActive, expiresAt, purchasedAt };
  }
  return null;
}

type RcSubscription = {
  expires_date?: string | null;
  purchase_date?: string | null;
  unsubscribe_detected_at?: string | null;
  grace_period_expires_date?: string | null;
  refunded_at?: string | null;
};

type RcEntitlement = {
  expires_date?: string | null;
  product_identifier?: string | null;
  purchase_date?: string | null;
};

/** Current Pro state from the RevenueCat REST subscriber payload. */
export function proSnapshotFromSubscriber(subscriber: unknown, now = Date.now()): StoreSubscriptionSnapshot {
  const record = subscriber && typeof subscriber === 'object' ? (subscriber as Record<string, unknown>) : {};
  const subscriptions = (record.subscriptions ?? {}) as Record<string, RcSubscription>;
  const entitlements = (record.entitlements ?? {}) as Record<string, RcEntitlement>;
  const sub = subscriptions[PRO_PRODUCT_ID];
  const ent = entitlements[PRO_ENTITLEMENT_ID];
  const entIsPro = !ent?.product_identifier || ent.product_identifier === PRO_PRODUCT_ID;
  const expiresAt = laterDate(
    parseRcDate(sub?.expires_date),
    laterDate(parseRcDate(sub?.grace_period_expires_date), entIsPro ? parseRcDate(ent?.expires_date) : null)
  );
  const purchasedAt = parseRcDate(sub?.purchase_date) ?? (entIsPro ? parseRcDate(ent?.purchase_date) : null);
  const refunded = !!sub?.refunded_at;
  const openEnded = !!sub && !refunded && !sub.expires_date && !sub.grace_period_expires_date;
  const proActive = !refunded && (openEnded || (!!expiresAt && expiresAt.getTime() > now));
  return {
    proActive,
    proRenewing: proActive && !sub?.unsubscribe_detected_at,
    expiresAt,
    purchasedAt,
  };
}

export function formatStoreSnapshot(snapshot: StoreSubscriptionSnapshot, productId?: string | null): string {
  return `active=${snapshot.proActive} renewing=${snapshot.proRenewing} product=${productId?.trim() || 'none'} purchased=${snapshot.purchasedAt?.toISOString() ?? 'none'} expires=${snapshot.expiresAt?.toISOString() ?? 'none'}`;
}

/** Null when the REST secret is unset. Throws when RevenueCat returns an error. */
export async function fetchProSnapshot(appUserId: string): Promise<StoreSubscriptionSnapshot | null> {
  const secret = secretKey();
  const id = appUserId.trim();
  if (!secret || !id || rejectAnonymousId(id)) return null;
  if (!(await ensureRevenueCatSubscriber(id))) return null;
  const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
  if (res.status === 404) {
    console.log(`[revenuecat] synced ${id}: no subscriber`);
    return { proActive: false, proRenewing: false, expiresAt: null, purchasedAt: null };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`revenuecat ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { subscriber?: unknown };
  const snapshot = proSnapshotFromSubscriber(json.subscriber);
  const record = json.subscriber && typeof json.subscriber === 'object' ? (json.subscriber as Record<string, unknown>) : {};
  const subscriptions = (record.subscriptions ?? {}) as Record<string, RcSubscription>;
  const entitlements = (record.entitlements ?? {}) as Record<string, RcEntitlement>;
  const productId =
    (subscriptions[PRO_PRODUCT_ID] ? PRO_PRODUCT_ID : null) ??
    entitlements[PRO_ENTITLEMENT_ID]?.product_identifier ??
    null;
  console.log(`[revenuecat] synced ${id}: ${formatStoreSnapshot(snapshot, productId)}`);
  return snapshot;
}
