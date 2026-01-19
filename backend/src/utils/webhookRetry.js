export function getRetryDelay(attempt) {
  const test = process.env.WEBHOOK_RETRY_INTERVALS_TEST === "true";

  const prodIntervals = [0, 60, 300, 1800, 7200];
  const testIntervals = [0, 5, 10, 15, 20];

  const intervals = test ? testIntervals : prodIntervals;

  return (intervals[Math.min(attempt - 1, 4)] || 0) * 1000;
}

