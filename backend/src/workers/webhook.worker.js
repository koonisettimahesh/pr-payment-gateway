import { Worker } from "bullmq";
import { redis } from "../config/redis.js";
import { deliverWebhookJob } from "../jobs/deliverWebhook.job.js";

new Worker(
  "webhooks",
  async (job) => {
    await deliverWebhookJob(job.data, job.attemptsMade);
  },
  { connection: redis }
);

console.log("✅ Webhook worker started");
