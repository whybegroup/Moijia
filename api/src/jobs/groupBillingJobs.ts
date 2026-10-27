import { groupBilling } from '../services/GroupBillingService';

/** Short enough that a test-store grace of a few minutes is applied on time. */
const INTERVAL_MS = 15 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

export function startGroupBillingJobs(): void {
  if (timer) return;
  const run = () => {
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
