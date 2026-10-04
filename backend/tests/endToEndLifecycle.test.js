import { jest } from "@jest/globals";
import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { pool } from "../src/config/db.js";

const queueJobs = {
  payment: [],
  refund: [],
  webhook: [],
};
const paymentQueue = {
  add: jest.fn(async (name, data) => {
    const job = { name, data };
    queueJobs.payment.push(job);
    return job;
  }),
};
const refundQueue = {
  add: jest.fn(async (name, data) => {
    const job = { name, data };
    queueJobs.refund.push(job);
    return job;
  }),
};
const webhookQueue = {
  add: jest.fn(async (name, data) => {
    const job = { name, data };
    queueJobs.webhook.push(job);
    return job;
  }),
};
const fetch = jest.fn(async () => ({
  status: 204,
  text: async () => "accepted",
}));

jest.unstable_mockModule("../src/queues/index.js", () => ({
  paymentQueue,
  refundQueue,
  webhookQueue,
}));
jest.unstable_mockModule("../src/utils/sleep.js", () => ({
  sleep: jest.fn(async () => {}),
}));
jest.unstable_mockModule("node-fetch", () => ({ default: fetch }));

const { app } = await import("../src/app.js");
const { processPaymentJob } = await import(
  "../src/jobs/processPayment.job.js"
);
const { processRefundJob } = await import(
  "../src/jobs/processRefund.job.js"
);
const { deliverWebhookJob } = await import(
  "../src/jobs/deliverWebhook.job.js"
);

const previousTestEnv = {
  TEST_MODE: process.env.TEST_MODE,
  TEST_PROCESSING_DELAY: process.env.TEST_PROCESSING_DELAY,
  TEST_PAYMENT_SUCCESS: process.env.TEST_PAYMENT_SUCCESS,
};
const fixture = {
  providerId: null,
  merchantId: null,
  orderIds: [],
  paymentIds: [],
  refundIds: [],
};

function restoreTestEnv() {
  for (const [key, value] of Object.entries(previousTestEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function expectNoSensitiveValues(value, cardNumber, cvv, credentials = []) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain(cardNumber.replace(/\D/g, ""));
  expect(serialized).not.toContain("password_hash");
  expect(serialized).not.toContain("DATABASE_URL");
  expect(serialized).not.toContain("JWT_SECRET");
  for (const credential of credentials) {
    expect(serialized).not.toContain(credential);
  }

  function inspect(item) {
    if (Array.isArray(item)) {
      item.forEach(inspect);
    } else if (item && typeof item === "object") {
      expect(item).not.toHaveProperty("cvv");
      Object.values(item).forEach(inspect);
    } else {
      expect(item).not.toBe(cvv);
    }
  }

  inspect(value);
}

async function deliverQueuedWebhook(event, recordId, type = "payment") {
  const webhook = queueJobs.webhook.find(
    (job) =>
      job.data.event === event &&
      job.data.payload?.data?.[type]?.id === recordId,
  );
  expect(webhook).toBeDefined();
  await deliverWebhookJob(webhook.data);

  const { rows } = await pool.query(
    `
    SELECT *
    FROM webhook_logs
    WHERE merchant_id = $1
      AND event = $2
      AND payload->'data'->$3->>'id' = $4
    `,
    [fixture.merchantId, event, type, recordId],
  );
  expect(rows).toHaveLength(1);
  return { log: rows[0], webhook };
}

describe("End-to-End Gateway Lifecycle", () => {
  const cardNumber = "4242 4242 4242 4242";
  const cvv = "321";
  const providerEmail = `e2e-provider-${randomUUID()}@example.test`;
  const providerPassword = "e2e-provider-password-123";
  let providerToken;
  let merchantCredentials;
  let otherMerchantAuth;
  let failurePaymentId;

  beforeAll(async () => {
    process.env.TEST_MODE = "true";
    process.env.TEST_PROCESSING_DELAY = "0";
    process.env.TEST_PAYMENT_SUCCESS = "true";

    const registration = await request(app)
      .post("/api/v1/provider/auth/register")
      .send({
        name: "End-to-End Provider",
        email: providerEmail,
        password: providerPassword,
      });
    expect(registration.status).toBe(201);
    fixture.providerId = registration.body.id;

    const login = await request(app)
      .post("/api/v1/provider/auth/login")
      .send({ email: providerEmail, password: providerPassword });
    expect(login.status).toBe(200);
    providerToken = login.body.token;
  });

  afterAll(async () => {
    try {
      if (fixture.merchantId) {
        await pool.query("DELETE FROM webhook_logs WHERE merchant_id = $1", [
          fixture.merchantId,
        ]);
      }
      if (fixture.refundIds.length > 0) {
        await pool.query("DELETE FROM refunds WHERE id = ANY($1::text[])", [
          fixture.refundIds,
        ]);
      }
      if (fixture.paymentIds.length > 0) {
        await pool.query("DELETE FROM payments WHERE id = ANY($1::text[])", [
          fixture.paymentIds,
        ]);
      }
      if (fixture.orderIds.length > 0) {
        await pool.query("DELETE FROM orders WHERE id = ANY($1::text[])", [
          fixture.orderIds,
        ]);
      }
      if (fixture.merchantId) {
        await pool.query("DELETE FROM merchants WHERE id = $1", [
          fixture.merchantId,
        ]);
      }
      if (fixture.providerId) {
        await pool.query("DELETE FROM provider_users WHERE id = $1", [
          fixture.providerId,
        ]);
      }

      const remaining = await pool.query(
        `
        SELECT
          (SELECT COUNT(*)::int FROM provider_users WHERE id = $1) AS providers,
          (SELECT COUNT(*)::int FROM merchants WHERE id = $2) AS merchants,
          (SELECT COUNT(*)::int FROM orders WHERE id = ANY($3::text[])) AS orders,
          (SELECT COUNT(*)::int FROM payments WHERE id = ANY($4::text[])) AS payments,
          (SELECT COUNT(*)::int FROM refunds WHERE id = ANY($5::text[])) AS refunds,
          (SELECT COUNT(*)::int FROM webhook_logs WHERE merchant_id = $2) AS webhook_logs
        `,
        [
          fixture.providerId,
          fixture.merchantId,
          fixture.orderIds,
          fixture.paymentIds,
          fixture.refundIds,
        ],
      );
      expect(remaining.rows[0]).toEqual({
        providers: 0,
        merchants: 0,
        orders: 0,
        payments: 0,
        refunds: 0,
        webhook_logs: 0,
      });
    } finally {
      restoreTestEnv();
    }
  });

  test("completes provider-to-merchant checkout, payment, webhook, refund, and failure lifecycle", async () => {
    const webhookUrl = "http://e2e-webhook.test/receiver";
    const merchantResponse = await request(app)
      .post("/api/v1/merchants")
      .set("Authorization", `Bearer ${providerToken}`)
      .send({
        name: "End-to-End Merchant",
        email: `e2e-merchant-${randomUUID()}@example.test`,
        webhook_url: webhookUrl,
      });
    expect(merchantResponse.status).toBe(201);
    fixture.merchantId = merchantResponse.body.id;
    merchantCredentials = merchantResponse.body.credentials;

    expect(merchantCredentials).toEqual(
      expect.objectContaining({
        api_key: expect.stringMatching(/^key_test_[a-f0-9]{48}$/),
        api_secret: expect.stringMatching(/^secret_test_[a-f0-9]{48}$/),
        webhook_secret: expect.stringMatching(/^whsec_test_[a-f0-9]{48}$/),
      }),
    );

    const merchantRow = await pool.query(
      `
      SELECT provider_id, webhook_url, api_key, api_secret, webhook_secret
      FROM merchants
      WHERE id = $1
      `,
      [fixture.merchantId],
    );
    expect(merchantRow.rows[0]).toEqual({
      provider_id: fixture.providerId,
      webhook_url: webhookUrl,
      api_key: merchantCredentials.api_key,
      api_secret: merchantCredentials.api_secret,
      webhook_secret: merchantCredentials.webhook_secret,
    });

    const merchantAuth = {
      "X-Api-Key": merchantCredentials.api_key,
      "X-Api-Secret": merchantCredentials.api_secret,
    };
    const otherMerchant = await pool.query(
      "SELECT api_key, api_secret FROM merchants WHERE email = $1",
      ["newstore@example.com"],
    );
    expect(otherMerchant.rows).toHaveLength(1);
    otherMerchantAuth = {
      "X-Api-Key": otherMerchant.rows[0].api_key,
      "X-Api-Secret": otherMerchant.rows[0].api_secret,
    };

    const merchantDetail = await request(app)
      .get(`/api/v1/merchants/${fixture.merchantId}`)
      .set("Authorization", `Bearer ${providerToken}`);
    expect(merchantDetail.status).toBe(200);
    expect(merchantDetail.body).not.toHaveProperty("api_secret");
    expect(merchantDetail.body).not.toHaveProperty("webhook_secret");

    const orderResponse = await request(app)
      .post("/api/v1/orders")
      .set(merchantAuth)
      .send({ amount: 1800, currency: "INR" });
    expect(orderResponse.status).toBe(201);
    const orderId = orderResponse.body.id;
    fixture.orderIds.push(orderId);

    const orderRow = await pool.query(
      "SELECT merchant_id, amount, currency FROM orders WHERE id = $1",
      [orderId],
    );
    expect(orderRow.rows[0]).toEqual({
      merchant_id: fixture.merchantId,
      amount: 1800,
      currency: "INR",
    });
    const publicOrder = await request(app).get(
      `/api/v1/orders/${orderId}/public`,
    );
    expect(publicOrder.status).toBe(200);
    expect(publicOrder.body).toEqual(
      expect.objectContaining({
        id: orderId,
        amount: 1800,
        currency: "INR",
      }),
    );

    const paymentResponse = await request(app)
      .post("/api/v1/payments/public")
      .send({
        order_id: orderId,
        method: "card",
        card: {
          number: cardNumber,
          expiry_month: "12",
          expiry_year: "2035",
          cvv,
          holder_name: "E2E Test Cardholder",
        },
      });
    expect(paymentResponse.status).toBe(201);
    expect(paymentResponse.body.status).toBe("pending");
    const paymentId = paymentResponse.body.id;
    fixture.paymentIds.push(paymentId);

    expect(
      queueJobs.payment.some(
        (job) => job.name === "process" && job.data.paymentId === paymentId,
      ),
    ).toBe(true);
    const initialPaymentRow = await pool.query(
      "SELECT * FROM payments WHERE id = $1",
      [paymentId],
    );
    expect(initialPaymentRow.rows[0]).toEqual(
      expect.objectContaining({
        merchant_id: fixture.merchantId,
        order_id: orderId,
        amount: 1800,
        method: "card",
        status: "pending",
        card_network: "visa",
        card_last4: "4242",
      }),
    );
    expectNoSensitiveValues(
      initialPaymentRow.rows[0],
      cardNumber,
      cvv,
      Object.values(merchantCredentials),
    );

    await processPaymentJob(paymentId);
    const paymentStatus = await request(app).get(
      `/api/v1/payments/public/${paymentId}?order_id=${encodeURIComponent(orderId)}`,
    );
    expect(paymentStatus.status).toBe(200);
    expect(paymentStatus.body.status).toBe("success");

    const { log: paymentWebhookLog, webhook: paymentWebhook } =
      await deliverQueuedWebhook("payment.success", paymentId);
    expect(paymentWebhookLog).toEqual(
      expect.objectContaining({
        merchant_id: fixture.merchantId,
        event: "payment.success",
        status: "success",
        attempts: 1,
        response_code: 204,
        response_body: "accepted",
      }),
    );
    expect(paymentWebhookLog.payload.data.payment).toEqual(
      expect.objectContaining({
        id: paymentId,
        order_id: orderId,
        amount: 1800,
        currency: "INR",
        method: "card",
        status: "success",
      }),
    );
    const sentHeaders = fetch.mock.calls.at(-1)[1].headers;
    const expectedSignature = crypto
      .createHmac("sha256", merchantCredentials.webhook_secret)
      .update(JSON.stringify(paymentWebhook.data.payload))
      .digest("hex");
    expect(sentHeaders["X-Webhook-Signature"]).toBe(expectedSignature);
    expect(paymentWebhook.data.merchantId).toBe(fixture.merchantId);
    expectNoSensitiveValues(
      paymentWebhookLog.payload,
      cardNumber,
      cvv,
      Object.values(merchantCredentials),
    );

    const refundResponse = await request(app)
      .post(`/api/v1/payments/${paymentId}/refunds`)
      .set(merchantAuth)
      .send({ amount: 1800, reason: "end-to-end full refund" });
    expect(refundResponse.status).toBe(201);
    expect(refundResponse.body.status).toBe("pending");
    const refundId = refundResponse.body.id;
    fixture.refundIds.push(refundId);
    expect(
      queueJobs.refund.some(
        (job) => job.name === "process" && job.data.refundId === refundId,
      ),
    ).toBe(true);

    const refundRow = await pool.query(
      "SELECT payment_id, merchant_id, amount, reason, status FROM refunds WHERE id = $1",
      [refundId],
    );
    expect(refundRow.rows[0]).toEqual({
      payment_id: paymentId,
      merchant_id: fixture.merchantId,
      amount: 1800,
      reason: "end-to-end full refund",
      status: "pending",
    });

    const refundCreated = queueJobs.webhook.find(
      (job) =>
        job.data.event === "refund.created" &&
        job.data.payload.data.refund.id === refundId,
    );
    expect(refundCreated).toBeDefined();
    await deliverWebhookJob(refundCreated.data);
    const refundCreatedLog = await pool.query(
      `
      SELECT id, merchant_id, event, status, payload
      FROM webhook_logs
      WHERE merchant_id = $1
        AND event = 'refund.created'
        AND payload->'data'->'refund'->>'id' = $2
      `,
      [fixture.merchantId, refundId],
    );
    expect(refundCreatedLog.rows).toHaveLength(1);
    expect(refundCreatedLog.rows[0].status).toBe("success");

    await processRefundJob(refundId);
    const refundStatus = await request(app)
      .get(`/api/v1/refunds/${refundId}`)
      .set(merchantAuth);
    expect(refundStatus.status).toBe(200);
    expect(refundStatus.body.status).toBe("processed");

    const { log: refundWebhookLog, webhook: refundWebhook } =
      await deliverQueuedWebhook("refund.processed", refundId, "refund");
    expect(refundWebhook.data.merchantId).toBe(fixture.merchantId);
    expect(refundWebhookLog).toEqual(
      expect.objectContaining({
        merchant_id: fixture.merchantId,
        event: "refund.processed",
        status: "success",
        attempts: 1,
        response_code: 204,
      }),
    );
    expect(refundWebhookLog.payload.data.refund).toEqual(
      expect.objectContaining({
        id: refundId,
        payment_id: paymentId,
        amount: 1800,
        reason: "end-to-end full refund",
        status: "processed",
      }),
    );
    expectNoSensitiveValues(
      refundWebhookLog.payload,
      cardNumber,
      cvv,
      Object.values(merchantCredentials),
    );

    const finalPayment = await pool.query(
      "SELECT id, order_id, merchant_id, status, card_network, card_last4 FROM payments WHERE id = $1",
      [paymentId],
    );
    expect(finalPayment.rows[0]).toEqual({
      id: paymentId,
      order_id: orderId,
      merchant_id: fixture.merchantId,
      status: "refunded",
      card_network: "visa",
      card_last4: "4242",
    });

    const otherOrder = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(otherMerchantAuth);
    expect(otherOrder.status).toBe(404);
    const otherPayment = await request(app)
      .get(`/api/v1/payments/${paymentId}`)
      .set(otherMerchantAuth);
    expect(otherPayment.status).toBe(404);
    const otherRefund = await request(app)
      .get(`/api/v1/refunds/${refundId}`)
      .set(otherMerchantAuth);
    expect(otherRefund.status).toBe(404);
    const otherWebhookList = await request(app)
      .get("/api/v1/webhooks")
      .set(otherMerchantAuth);
    expect(otherWebhookList.status).toBe(200);
    expect(
      otherWebhookList.body.data.some(
        (entry) =>
          entry.id === paymentWebhookLog.id ||
          entry.id === refundWebhookLog.id ||
          entry.id === refundCreatedLog.rows[0].id,
      ),
    ).toBe(false);
    const otherWebhookRetry = await request(app)
      .post(`/api/v1/webhooks/${paymentWebhookLog.id}/retry`)
      .set(otherMerchantAuth);
    expect(otherWebhookRetry.status).toBe(404);

    expectNoSensitiveValues(
      paymentResponse.body,
      cardNumber,
      cvv,
      Object.values(merchantCredentials),
    );
    expectNoSensitiveValues(paymentStatus.body, cardNumber, cvv);
    expectNoSensitiveValues(refundStatus.body, cardNumber, cvv);

    const finalState = await pool.query(
      `
      SELECT
        (SELECT COUNT(*)::int FROM orders WHERE id = $1 AND merchant_id = $2) AS orders,
        (SELECT COUNT(*)::int FROM payments WHERE id = $3 AND order_id = $1 AND merchant_id = $2) AS payments,
        (SELECT COUNT(*)::int FROM refunds WHERE id = $4 AND payment_id = $3 AND merchant_id = $2) AS refunds,
        (SELECT COUNT(*)::int FROM webhook_logs WHERE merchant_id = $2 AND id = ANY($5::uuid[])) AS webhooks
      `,
      [
        orderId,
        fixture.merchantId,
        paymentId,
        refundId,
        [
          paymentWebhookLog.id,
          refundCreatedLog.rows[0].id,
          refundWebhookLog.id,
        ],
      ],
    );
    expect(finalState.rows[0]).toEqual({
      orders: 1,
      payments: 1,
      refunds: 1,
      webhooks: 3,
    });

    process.env.TEST_PAYMENT_SUCCESS = "false";
    const failureOrderResponse = await request(app)
      .post("/api/v1/orders")
      .set(merchantAuth)
      .send({ amount: 700, currency: "INR" });
    expect(failureOrderResponse.status).toBe(201);
    const failureOrderId = failureOrderResponse.body.id;
    fixture.orderIds.push(failureOrderId);

    const failurePaymentResponse = await request(app)
      .post("/api/v1/payments/public")
      .send({
        order_id: failureOrderId,
        method: "upi",
        vpa: "e2e-failure@upi",
      });
    expect(failurePaymentResponse.status).toBe(201);
    failurePaymentId = failurePaymentResponse.body.id;
    fixture.paymentIds.push(failurePaymentId);

    await processPaymentJob(failurePaymentId);
    const failureStatus = await request(app).get(
      `/api/v1/payments/public/${failurePaymentId}?order_id=${encodeURIComponent(failureOrderId)}`,
    );
    expect(failureStatus.status).toBe(200);
    expect(failureStatus.body.status).toBe("failed");

    const { log: failureWebhookLog } = await deliverQueuedWebhook(
      "payment.failed",
      failurePaymentId,
    );
    expect(failureWebhookLog.status).toBe("success");
    expect(failureWebhookLog.payload.data.payment).toEqual(
      expect.objectContaining({
        id: failurePaymentId,
        order_id: failureOrderId,
        status: "failed",
      }),
    );
  });
});
