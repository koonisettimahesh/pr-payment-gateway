import { Worker } from "bullmq";
import { redis } from "../config/redis.js";
import { processPaymentJob } from "../jobs/processPayment.job.js";

new Worker(
  "payments",
  async (job) => processPaymentJob(job.data.paymentId),
  { connection: redis }
);

