import { groupBilling } from '../services/GroupBillingService';

const INTERVAL_MS = 15 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

export function startGroupBillingJobs(): void {
  if (timer) return;
  const run = () => {
    void groupBilling.applyDueGracePeriods().catch((err) => {
      console.error('[group-billing]', err);
    });
  };
  run();
  timer = setInterval(run, INTERVAL_MS);
  timer.unref?.();
}
