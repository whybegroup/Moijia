import { groupBilling } from '../services/GroupBillingService';
import { reconcileStoreSubscriptions } from '../services/RevenueCatBilling';

/** Short enough that a test-store grace of a few minutes is applied on time. */
const INTERVAL_MS = 15 * 1000;
/** Store renewals and cancels are checked on the server, without the app open. */
const RECONCILE_MS = 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;
let lastReconcile = 0;

export function startGroupBillingJobs(): void {
  if (timer) return;
  const run = () => {
    const now = Date.now();
    if (now - lastReconcile >= RECONCILE_MS) {
      lastReconcile = now;
      void reconcileStoreSubscriptions().catch((err) => {
        console.error('[revenuecat] reconcile failed', err);
      });
    }
    void groupBilling
      .expireEnterprisePlans()
      .then(() => groupBilling.scheduleOutstandingFreeDowngrades())
      .then(() => groupBilling.applyDueGracePeriods())
      .catch((err) => {
        console.error('[group-billing]', err);
      });
  };
  run();
  timer = setInterval(run, INTERVAL_MS);
  timer.unref?.();
}
