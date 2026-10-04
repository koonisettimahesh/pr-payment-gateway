import { jest } from "@jest/globals";
import { randomBytes, randomUUID } from "node:crypto";
import request from "supertest";
import { pool } from "../src/config/db.js";

const API_KEY =
  "key_test_c42db4e33920992508e6b640534e35922b8a14c744f53ce7";
const API_SECRET =
  "secret_test_2038370b0be711883398ddc4ad88e340f664fd10ae7387ee";
const auth = {
  "X-Api-Key": API_KEY,
  "X-Api-Secret": API_SECRET,
};

const fetch = jest.fn();
const webhookQueue = { add: jest.fn(async () => ({})) };

jest.unstable_mockModule("node-fetch", () => ({ default: fetch }));
jest.unstable_mockModule("../src/queues/index.js", () => ({
  paymentQueue: { add: jest.fn() },
  refundQueue: { add: jest.fn() },
  webhookQueue,
}));

const { app } = await import("../src/app.js");
const { deliverWebhookJob } = await import(
  "../src/jobs/deliverWebhook.job.js"
);

let merchantId;
let otherMerchantId;
let otherMerchantAuth;
const webhookIds = [];

async function insertWebhookLog(ownerId, status, attempts) {
  const payload = {
    event: "payment.failed",
    test_id: randomUUID(),
    data: { payment: { id: `pay_${randomBytes(8).toString("hex")}` } },
  };
  const { rows } = await pool.query(
    `
    INSERT INTO webhook_logs (
      merchant_id, event, payload, status, attempts,
      last_attempt_at, next_retry_at, response_code, response_body
    )
    VALUES (
      $1, $2, $3, $4, $5,
      NOW(), NOW(), 503, 'previous response'
    )
    RETURNING id
    `,
    [ownerId, payload.event, payload, status, attempts],
  );
  webhookIds.push(rows[0].id);
  return { id: rows[0].id, payload };
}

describe("Manual Webhook Retry", () => {
  beforeAll(async () => {
    const merchant = await pool.query(
      "SELECT id FROM merchants WHERE api_key = $1",
      [API_KEY],
    );
    expect(merchant.rows).toHaveLength(1);
    merchantId = merchant.rows[0].id;

    const testMerchant = await pool.query(
      "SELECT provider_id FROM merchants WHERE id = $1",
      [merchantId],
    );
    otherMerchantAuth = {
      "X-Api-Key": `key_test_${randomBytes(24).toString("hex")}`,
      "X-Api-Secret": `secret_test_${randomBytes(24).toString("hex")}`,
    };
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
        testMerchant.rows[0].provider_id,
        "Webhook Retry Isolation Merchant",
        `webhook-retry-${randomUUID()}@example.test`,
        otherMerchantAuth["X-Api-Key"],
        otherMerchantAuth["X-Api-Secret"],
        "http://127.0.0.1:1/mock-webhook",
        `whsec_${randomBytes(24).toString("hex")}`,
      ],
    );
    otherMerchantId = rows[0].id;
  });

  beforeEach(() => {
    fetch.mockReset();
    webhookQueue.add.mockClear();
  });

  afterAll(async () => {
    if (webhookIds.length > 0) {
      await pool.query("DELETE FROM webhook_logs WHERE id = ANY($1::uuid[])", [
        webhookIds,
      ]);
    }
    if (otherMerchantId) {
      await pool.query("DELETE FROM webhook_logs WHERE merchant_id = $1", [
        otherMerchantId,
      ]);
      await pool.query("DELETE FROM merchants WHERE id = $1", [
        otherMerchantId,
      ]);
    }
  });

  test("requires authentication", async () => {
    const webhook = await insertWebhookLog(merchantId, "failed", 5);
    const response = await request(app).post(
      `/api/v1/webhooks/${webhook.id}/retry`,
    );

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  test("rejects manual retry before five failed attempts", async () => {
    const webhook = await insertWebhookLog(merchantId, "failed", 4);
    const response = await request(app)
      .post(`/api/v1/webhooks/${webhook.id}/retry`)
      .set(auth);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST_ERROR");
    expect(webhookQueue.add).not.toHaveBeenCalled();
  });

  test("resets and requeues the existing log after five failed attempts", async () => {
    const webhook = await insertWebhookLog(merchantId, "failed", 5);

    const response = await request(app)
      .post(`/api/v1/webhooks/${webhook.id}/retry`)
      .set(auth);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: webhook.id,
      status: "pending",
      attempts: 0,
      message: "Webhook retry scheduled",
    });
    expect(webhookQueue.add).toHaveBeenCalledTimes(1);
    expect(webhookQueue.add).toHaveBeenCalledWith(
      "deliver",
      expect.objectContaining({
        merchantId,
        event: webhook.payload.event,
        payload: webhook.payload,
        webhookId: webhook.id,
      }),
    );

    const { rows } = await pool.query(
      "SELECT * FROM webhook_logs WHERE id = $1",
      [webhook.id],
    );
    expect(rows[0]).toEqual(
      expect.objectContaining({
        id: webhook.id,
        status: "pending",
        attempts: 0,
        last_attempt_at: null,
        response_code: null,
        response_body: null,
      }),
    );
    expect(rows[0].next_retry_at).not.toBeNull();

    fetch.mockResolvedValue({
      status: 204,
      text: async () => "delivered",
    });
    await deliverWebhookJob(webhookQueue.add.mock.calls[0][1]);

    const delivered = await pool.query(
      "SELECT id, status, attempts, response_code, response_body FROM webhook_logs WHERE id = $1",
      [webhook.id],
    );
    expect(delivered.rows[0]).toEqual({
      id: webhook.id,
      status: "success",
      attempts: 1,
      response_code: 204,
      response_body: "delivered",
    });
  });

  test("does not allow a merchant to retry another merchant's webhook", async () => {
    const webhook = await insertWebhookLog(otherMerchantId, "failed", 5);
    const response = await request(app)
      .post(`/api/v1/webhooks/${webhook.id}/retry`)
      .set(auth);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND_ERROR");
    expect(webhookQueue.add).not.toHaveBeenCalled();
  });
});
