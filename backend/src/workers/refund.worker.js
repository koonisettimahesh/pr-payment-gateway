import { Worker } from "bullmq";
import { redis } from "../config/redis.js";
import { processRefundJob } from "../jobs/processRefund.job.js";

new Worker(
  "refunds",
  async (job) =>{
    console.log("Refund job received:",job.data);
   await processRefundJob(job.data.refundId);},
  { connection: redis }
);

