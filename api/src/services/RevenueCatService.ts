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
