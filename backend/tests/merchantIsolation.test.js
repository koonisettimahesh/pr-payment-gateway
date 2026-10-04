import { jest } from "@jest/globals";
import { randomBytes, randomUUID } from "node:crypto";
import request from "supertest";
import { pool } from "../src/config/db.js";

const merchantAAuth = {
  "X-Api-Key": "key_test_c42db4e33920992508e6b640534e35922b8a14c744f53ce7",
  "X-Api-Secret":
    "secret_test_2038370b0be711883398ddc4ad88e340f664fd10ae7387ee",
};

const queues = {
  paymentQueue: { add: jest.fn(async () => ({})) },
  refundQueue: { add: jest.fn(async () => ({})) },
  webhookQueue: { add: jest.fn(async () => ({})) },
};

jest.unstable_mockModule("../src/queues/index.js", () => queues);

const { app } = await import("../src/app.js");

let merchantAId;
let merchantBId;
let orderBId;
let paymentBId;
let refundBId;
let webhookAId;
let webhookBId;
let merchantBAuth;

describe("Merchant Isolation and Security", () => {
  beforeAll(async () => {
    const merchantA = await pool.query(
      "SELECT id, provider_id FROM merchants WHERE api_key = $1",
      [merchantAAuth["X-Api-Key"]],
    );
    expect(merchantA.rows).toHaveLength(1);
    merchantAId = merchantA.rows[0].id;

    merchantBAuth = {
      "X-Api-Key": `key_test_${randomBytes(24).toString("hex")}`,
      "X-Api-Secret": `secret_test_${randomBytes(24).toString("hex")}`,
    };
    const merchantB = await pool.query(
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
        merchantA.rows[0].provider_id,
        "Merchant Isolation Test B",
        `merchant-isolation-${randomUUID()}@example.test`,
        merchantBAuth["X-Api-Key"],
        merchantBAuth["X-Api-Secret"],
        "http://127.0.0.1:1/unused-webhook",
        `whsec_${randomBytes(24).toString("hex")}`,
      ],
    );
    merchantBId = merchantB.rows[0].id;

    const order = await pool.query(
      `
      INSERT INTO orders (id, merchant_id, amount, currency, status)
      VALUES ($1, $2, 2500, 'INR', 'created')
      RETURNING id
      `,
      [`order_${randomUUID().replaceAll("-", "")}`, merchantBId],
    );
    orderBId = order.rows[0].id;

    const payment = await pool.query(
      `
      INSERT INTO payments (
        id, order_id, merchant_id, amount, currency, method, status
      )
      VALUES ($1, $2, $3, 2500, 'INR', 'upi', 'success')
      RETURNING id
      `,
      [
        `pay_${randomUUID().replaceAll("-", "")}`,
        orderBId,
        merchantBId,
      ],
    );
    paymentBId = payment.rows[0].id;

    const refund = await pool.query(
      `
      INSERT INTO refunds (id, payment_id, merchant_id, amount, status)
      VALUES ($1, $2, $3, 500, 'pending')
      RETURNING id
      `,
      [
        `rfnd_${randomUUID().replaceAll("-", "")}`,
        paymentBId,
        merchantBId,
      ],
    );
    refundBId = refund.rows[0].id;

    const webhookA = await pool.query(
      `
      INSERT INTO webhook_logs (merchant_id, event, payload, status, attempts)
      VALUES ($1, 'isolation.test', $2, 'failed', 5)
      RETURNING id
      `,
      [
        merchantAId,
        { test_id: randomUUID(), event: "isolation.test", owner: "A" },
      ],
    );
    webhookAId = webhookA.rows[0].id;

    const webhookB = await pool.query(
      `
      INSERT INTO webhook_logs (merchant_id, event, payload, status, attempts)
      VALUES ($1, 'isolation.test', $2, 'failed', 5)
      RETURNING id
      `,
      [
        merchantBId,
        { test_id: randomUUID(), event: "isolation.test", owner: "B" },
      ],
    );
    webhookBId = webhookB.rows[0].id;
  });

  afterAll(async () => {
    if (webhookAId || webhookBId) {
      await pool.query(
        "DELETE FROM webhook_logs WHERE id = ANY($1::uuid[])",
        [[webhookAId, webhookBId].filter(Boolean)],
      );
    }
    if (refundBId) {
      await pool.query("DELETE FROM refunds WHERE id = $1", [refundBId]);
    }
    if (paymentBId) {
      await pool.query("DELETE FROM payments WHERE id = $1", [paymentBId]);
    }
    if (orderBId) {
      await pool.query("DELETE FROM orders WHERE id = $1", [orderBId]);
    }
    if (merchantBId) {
      await pool.query("DELETE FROM merchants WHERE id = $1", [merchantBId]);
    }
  });

  test("Merchant A cannot retrieve Merchant B's order or create a payment against it", async () => {
    const read = await request(app)
      .get(`/api/v1/orders/${orderBId}`)
      .set(merchantAAuth);
    expect(read.status).toBe(404);
    expect(read.body.error.code).toBe("NOT_FOUND_ERROR");

    const createPayment = await request(app)
      .post("/api/v1/payments")
      .set(merchantAAuth)
      .send({
        order_id: orderBId,
        method: "upi",
        vpa: "cross-merchant@upi",
      });
    expect(createPayment.status).toBe(404);
    expect(createPayment.body.error.code).toBe("NOT_FOUND_ERROR");

    const { rows } = await pool.query(
      "SELECT COUNT(*) AS count FROM payments WHERE order_id = $1 AND merchant_id = $2",
      [orderBId, merchantAId],
    );
    expect(Number(rows[0].count)).toBe(0);
  });

  test("Merchant A cannot read, list, or capture Merchant B's payment", async () => {
    const read = await request(app)
      .get(`/api/v1/payments/${paymentBId}`)
      .set(merchantAAuth);
    expect(read.status).toBe(404);
    expect(read.body.error.code).toBe("NOT_FOUND_ERROR");

    const list = await request(app)
      .get("/api/v1/payments")
      .set(merchantAAuth);
    expect(list.status).toBe(200);
    expect(list.body.some((payment) => payment.id === paymentBId)).toBe(false);

    const capture = await request(app)
      .post(`/api/v1/payments/${paymentBId}/capture`)
      .set(merchantAAuth)
      .send({ amount: 1000 });
    expect(capture.status).toBe(404);
    expect(capture.body.error.code).toBe("NOT_FOUND_ERROR");
  });

  test("Merchant A cannot create a refund for or retrieve Merchant B's refund", async () => {
    const create = await request(app)
      .post(`/api/v1/payments/${paymentBId}/refunds`)
      .set(merchantAAuth)
      .send({ amount: 500 });
    expect(create.status).toBe(404);
    expect(create.body.error.code).toBe("NOT_FOUND_ERROR");

    const get = await request(app)
      .get(`/api/v1/refunds/${refundBId}`)
      .set(merchantAAuth);
    expect(get.status).toBe(404);
    expect(get.body.error.code).toBe("NOT_FOUND_ERROR");
  });

  test("webhook listings expose only the authenticated merchant's webhook data", async () => {
    const merchantAWebhooks = await request(app)
      .get("/api/v1/webhooks")
      .set(merchantAAuth);
    expect(merchantAWebhooks.status).toBe(200);
    expect(
      merchantAWebhooks.body.data.some((webhook) => webhook.id === webhookAId),
    ).toBe(true);
    expect(
      merchantAWebhooks.body.data.some((webhook) => webhook.id === webhookBId),
    ).toBe(false);

    const merchantBWebhooks = await request(app)
      .get("/api/v1/webhooks")
      .set(merchantBAuth);
    expect(merchantBWebhooks.status).toBe(200);
    expect(
      merchantBWebhooks.body.data.some((webhook) => webhook.id === webhookBId),
    ).toBe(true);
    expect(
      merchantBWebhooks.body.data.some((webhook) => webhook.id === webhookAId),
    ).toBe(false);
  });

  test("inactive merchant credentials are rejected", async () => {
    await pool.query("UPDATE merchants SET is_active = false WHERE id = $1", [
      merchantBId,
    ]);

    try {
      const response = await request(app)
        .get("/api/v1/webhooks")
        .set(merchantBAuth);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("AUTHENTICATION_ERROR");
    } finally {
      await pool.query("UPDATE merchants SET is_active = true WHERE id = $1", [
        merchantBId,
      ]);
    }
  });
});
