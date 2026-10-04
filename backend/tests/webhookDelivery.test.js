import { jest } from "@jest/globals";
import crypto from "node:crypto";
import { randomBytes, randomUUID } from "node:crypto";
import { pool } from "../src/config/db.js";

const fetch = jest.fn();
const webhookQueue = { add: jest.fn(async () => ({})) };

jest.unstable_mockModule("node-fetch", () => ({ default: fetch }));
jest.unstable_mockModule("../src/queues/index.js", () => ({
  paymentQueue: { add: jest.fn() },
  refundQueue: { add: jest.fn() },
  webhookQueue,
}));

const { deliverWebhookJob } = await import(
  "../src/jobs/deliverWebhook.job.js"
);

const retryIntervalsSetting = process.env.WEBHOOK_RETRY_INTERVALS_TEST;
const webhookSecret = `whsec_${randomBytes(24).toString("hex")}`;
let merchantId;

async function findLog(testId) {
  const { rows } = await pool.query(
    `
    SELECT *
    FROM webhook_logs
    WHERE merchant_id = $1
      AND payload->>'test_id' = $2
    `,
    [merchantId, testId],
  );
  expect(rows).toHaveLength(1);
  return rows[0];
}

describe("Webhook Delivery Job", () => {
  beforeAll(async () => {
    process.env.WEBHOOK_RETRY_INTERVALS_TEST = "true";

    const provider = await pool.query(
      "SELECT provider_id FROM merchants WHERE api_key = $1",
      ["key_test_c42db4e33920992508e6b640534e35922b8a14c744f53ce7"],
    );
    expect(provider.rows).toHaveLength(1);

    const { rows } = await pool.query(
      `
      INSERT INTO merchants (
        id, provider_id, name, email, api_key, api_secret,
        webhook_url, webhook_secret
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
      `,
      [
        randomUUID(),
        provider.rows[0].provider_id,
        "Webhook Delivery Test Merchant",
        `webhook-delivery-${randomUUID()}@example.test`,
        `key_test_${randomBytes(24).toString("hex")}`,
        `secret_test_${randomBytes(24).toString("hex")}`,
        "http://127.0.0.1:1/mock-webhook",
        webhookSecret,
      ],
    );
    merchantId = rows[0].id;
  });

  afterEach(() => {
    fetch.mockReset();
    webhookQueue.add.mockClear();
  });

  afterAll(async () => {
    try {
      if (merchantId) {
        await pool.query("DELETE FROM webhook_logs WHERE merchant_id = $1", [
          merchantId,
        ]);
        await pool.query("DELETE FROM merchants WHERE id = $1", [merchantId]);
      }
    } finally {
      if (retryIntervalsSetting === undefined) {
        delete process.env.WEBHOOK_RETRY_INTERVALS_TEST;
      } else {
        process.env.WEBHOOK_RETRY_INTERVALS_TEST = retryIntervalsSetting;
      }
    }
  });

  test("creates a delivery log, records the response, and sends a verifiable HMAC", async () => {
    fetch.mockResolvedValue({
      status: 202,
      text: async () => "accepted",
    });

    const payload = {
      event: "payment.success",
      timestamp: Math.floor(Date.now() / 1000),
      test_id: randomUUID(),
      data: {
        payment: {
          id: `pay_${randomBytes(8).toString("hex")}`,
          amount: 1200,
          status: "success",
        },
      },
    };

    await deliverWebhookJob({
      merchantId,
      event: payload.event,
      payload,
    });

    const log = await findLog(payload.test_id);
    expect(log.event).toBe("payment.success");
    expect(log.payload).toEqual(payload);
    expect(log.status).toBe("success");
    expect(log.attempts).toBe(1);
    expect(log.response_code).toBe(202);
    expect(log.response_body).toBe("accepted");
    expect(log.last_attempt_at).toBeDefined();
    expect(log.next_retry_at).toBeNull();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:1/mock-webhook");
    expect(options.method).toBe("POST");
    expect(options.body).toBe(JSON.stringify(payload));
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(JSON.stringify(payload))
      .digest("hex");
    expect(options.headers["X-Webhook-Signature"]).toBe(expectedSignature);
  });

  test("retries failures using one log and marks it failed after five attempts", async () => {
    fetch.mockResolvedValue({
      status: 503,
      text: async () => "receiver unavailable",
    });

    const payload = {
      event: "payment.failed",
      test_id: randomUUID(),
      data: { payment: { id: `pay_${randomBytes(8).toString("hex")}` } },
    };
    const delivery = { merchantId, event: payload.event, payload };

    await deliverWebhookJob(delivery);
    const firstLog = await findLog(payload.test_id);
    const webhookId = firstLog.id;
    expect(firstLog.status).toBe("pending");
    expect(firstLog.attempts).toBe(1);
    expect(firstLog.response_code).toBe(503);
    expect(firstLog.response_body).toBe("receiver unavailable");

    expect(webhookQueue.add).toHaveBeenCalledTimes(1);
    expect(webhookQueue.add.mock.calls[0][1]).toEqual({
      ...delivery,
      webhookId,
    });

    for (let attempt = 2; attempt <= 5; attempt += 1) {
      await deliverWebhookJob({ ...delivery, webhookId });
      const log = await findLog(payload.test_id);
      expect(log.id).toBe(webhookId);
      expect(log.attempts).toBe(attempt);
      expect(log.response_code).toBe(503);
      expect(log.response_body).toBe("receiver unavailable");
      expect(log.status).toBe(attempt === 5 ? "failed" : "pending");
    }

    expect(fetch).toHaveBeenCalledTimes(5);
    expect(webhookQueue.add).toHaveBeenCalledTimes(4);
    for (const [, queuedData] of webhookQueue.add.mock.calls) {
      expect(queuedData.webhookId).toBe(webhookId);
    }

    const finalLog = await findLog(payload.test_id);
    expect(finalLog.next_retry_at).toBeNull();
  });
});
