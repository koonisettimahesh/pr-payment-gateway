import { Queue } from "bullmq";
import { redis } from "../config/redis.js";

export const paymentQueue = new Queue("payments", { connection: redis });
export const webhookQueue = new Queue("webhooks", { connection: redis });
export const refundQueue = new Queue("refunds", { connection: redis });

