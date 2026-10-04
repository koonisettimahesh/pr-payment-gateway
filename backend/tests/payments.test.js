import request from "supertest";
import { jest } from "@jest/globals";
import { randomBytes, randomUUID } from "node:crypto";
import { pool } from "../src/config/db.js";

const paymentQueue = { add: jest.fn(async () => ({})) };
const webhookQueue = { add: jest.fn(async () => ({})) };

jest.unstable_mockModule("../src/queues/index.js", () => ({
  paymentQueue,
  webhookQueue,
  refundQueue: { add: jest.fn() },
}));

const { app } = await import("../src/app.js");

const API_KEY =
  "key_test_c42db4e33920992508e6b640534e35922b8a14c744f53ce7";

const API_SECRET =
  "secret_test_2038370b0be711883398ddc4ad88e340f664fd10ae7387ee";

const auth = {
  "X-Api-Key": API_KEY,
  "X-Api-Secret": API_SECRET,
};

describe("Payment API", () => {
  let orderId;
  let paymentId;
  let merchantId;
  let secondMerchantId;
  let secondOrderId;
  let secondMerchantAuth;
  const paymentIds = [];
  const idempotencyKeys = [];

  beforeAll(async () => {
    const response = await request(app)
      .post("/api/v1/orders")
      .set("X-Api-Key", API_KEY)
      .set("X-Api-Secret", API_SECRET)
      .send({
        amount: 1000,
        currency: "INR",
      });
  
    console.log("Order setup:", response.status, response.body);
  
    expect(response.status).toBe(201);
  
    orderId = response.body.id;

    const merchantResult = await pool.query(
      "SELECT id FROM merchants WHERE api_key = $1",
      [API_KEY],
    );
    expect(merchantResult.rows).toHaveLength(1);
    merchantId = merchantResult.rows[0].id;

    const suffix = randomUUID();
    secondMerchantAuth = {
      "X-Api-Key": `key_test_${randomBytes(24).toString("hex")}`,
      "X-Api-Secret": `secret_test_${randomBytes(24).toString("hex")}`,
    };

    const secondMerchantResult = await pool.query(
      `
      INSERT INTO merchants (
        id,
        provider_id,
        name,
        email,
        api_key,
        api_secret
      )
      SELECT $1, provider_id, $2, $3, $4, $5
      FROM merchants
      WHERE id = $6
      RETURNING id
      `,
      [
        randomUUID(),
        "Idempotency Test Merchant",
        `idempotency-${suffix}@example.test`,
        secondMerchantAuth["X-Api-Key"],
        secondMerchantAuth["X-Api-Secret"],
        merchantId,
      ],
    );
    expect(secondMerchantResult.rows).toHaveLength(1);
    secondMerchantId = secondMerchantResult.rows[0].id;

    const secondOrderResponse = await request(app)
      .post("/api/v1/orders")
      .set(secondMerchantAuth)
      .send({ amount: 1000, currency: "INR" });
    expect(secondOrderResponse.status).toBe(201);
    secondOrderId = secondOrderResponse.body.id;
  });

  afterAll(async () => {
    if (idempotencyKeys.length > 0) {
      await pool.query(
        "DELETE FROM idempotency_keys WHERE key = ANY($1::text[])",
        [idempotencyKeys],
      );
    }
    if (paymentIds.length > 0) {
      const merchantIds = [merchantId, secondMerchantId].filter(Boolean);
      await pool.query(
        `
        DELETE FROM webhook_logs
        WHERE merchant_id = ANY($1::uuid[])
          AND payload->'data'->'payment'->>'id' = ANY($2::text[])
        `,
        [merchantIds, paymentIds],
      );
    }
    if (secondMerchantId) {
      await pool.query("DELETE FROM webhook_logs WHERE merchant_id = $1", [
        secondMerchantId,
      ]);
    }
    if (paymentIds.length > 0) {
      await pool.query("DELETE FROM payments WHERE id = ANY($1::text[])", [
        paymentIds,
      ]);
    }
    if (orderId) {
      await pool.query("DELETE FROM orders WHERE id = $1", [orderId]);
    }
    if (secondOrderId) {
      await pool.query("DELETE FROM orders WHERE id = $1", [secondOrderId]);
    }
    if (secondMerchantId) {
      await pool.query("DELETE FROM merchants WHERE id = $1", [
        secondMerchantId,
      ]);
    }
  });

  test("creates a UPI payment", async () => {
    const response = await request(app)
      .post("/api/v1/payments")
      .set(auth)
      .send({
        order_id: orderId,
        method: "upi",
        vpa: "test@upi",
      });

    expect(response.status).toBe(201);

    expect(response.body.id).toMatch(/^pay_[A-Za-z0-9]{16}$/);
    expect(response.body.order_id).toBe(orderId);
    expect(response.body.amount).toBe(1000);
    expect(response.body.currency).toBe("INR");
    expect(response.body.method).toBe("upi");
    expect(response.body.status).toBe("pending");

    paymentId = response.body.id;
    paymentIds.push(paymentId);
  });

  test("rejects payment without order_id", async () => {
    const response = await request(app)
      .post("/api/v1/payments")
      .set(auth)
      .send({
        method: "upi",
        vpa: "test@upi",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST_ERROR");
  });

  test("rejects payment without authentication", async () => {
    const response = await request(app)
      .post("/api/v1/payments")
      .send({
        order_id: orderId,
        method: "upi",
        vpa: "test@upi",
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  test("rejects payment for a non-existent order", async () => {
    const response = await request(app)
      .post("/api/v1/payments")
      .set(auth)
      .send({
        order_id: "order_doesnotexist123",
        method: "upi",
        vpa: "test@upi",
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND_ERROR");
  });

  test("retrieves the created payment", async () => {
    const response = await request(app)
      .get(`/api/v1/payments/${paymentId}`)
      .set(auth);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(paymentId);
    expect(response.body.order_id).toBe(orderId);
    expect(response.body.method).toBe("upi");
  });

  test("lists merchant payments", async () => {
    const response = await request(app)
      .get("/api/v1/payments")
      .set(auth);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    const payment = response.body.find(
      (item) => item.id === paymentId
    );

    expect(payment).toBeDefined();
  });

  test("idempotency key returns the same payment", async () => {
    const idempotencyKey = `test-idempotency-${randomUUID()}`;
    idempotencyKeys.push(idempotencyKey);
    const countBefore = await pool.query(
      "SELECT COUNT(*) AS count FROM payments WHERE merchant_id = $1 AND order_id = $2",
      [merchantId, orderId],
    );

    const first = await request(app)
      .post("/api/v1/payments")
      .set(auth)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        order_id: orderId,
        method: "upi",
        vpa: "second@upi",
      });

    expect(first.status).toBe(201);
    paymentIds.push(first.body.id);

    const second = await request(app)
      .post("/api/v1/payments")
      .set(auth)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        order_id: orderId,
        method: "upi",
        vpa: "second@upi",
      });

    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(second.body.id).toBe(first.body.id);

    const { rows } = await pool.query(
      `
      SELECT COUNT(*) AS count
      FROM payments
      WHERE merchant_id = $1 AND order_id = $2
      `,
      [merchantId, orderId],
    );
    expect(Number(rows[0].count)).toBe(Number(countBefore.rows[0].count) + 1);
  });

  test("different idempotency keys create distinct payments", async () => {
    const firstKey = `test-idempotency-first-${randomUUID()}`;
    const secondKey = `test-idempotency-second-${randomUUID()}`;
    idempotencyKeys.push(firstKey, secondKey);

    const body = {
      order_id: orderId,
      method: "upi",
      vpa: "different-key@upi",
    };

    const first = await request(app)
      .post("/api/v1/payments")
      .set(auth)
      .set("Idempotency-Key", firstKey)
      .send(body);
    const second = await request(app)
      .post("/api/v1/payments")
      .set(auth)
      .set("Idempotency-Key", secondKey)
      .send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).not.toBe(second.body.id);
    paymentIds.push(first.body.id, second.body.id);
  });

  test("idempotency keys are scoped to the merchant", async () => {
    const idempotencyKey = `test-idempotency-scope-${randomUUID()}`;
    idempotencyKeys.push(idempotencyKey);

    const merchantAPayment = await request(app)
      .post("/api/v1/payments")
      .set(auth)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        order_id: orderId,
        method: "upi",
        vpa: "merchant-a@upi",
      });

    const merchantBPayment = await request(app)
      .post("/api/v1/payments")
      .set(secondMerchantAuth)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        order_id: secondOrderId,
        method: "upi",
        vpa: "merchant-b@upi",
      });

    expect(merchantAPayment.status).toBe(201);
    expect(merchantBPayment.status).toBe(201);
    expect(merchantAPayment.body.id).not.toBe(merchantBPayment.body.id);
    paymentIds.push(merchantAPayment.body.id, merchantBPayment.body.id);

    const merchantBReplay = await request(app)
      .post("/api/v1/payments")
      .set(secondMerchantAuth)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        order_id: secondOrderId,
        method: "upi",
        vpa: "merchant-b@upi",
      });

    expect(merchantBReplay.status).toBe(201);
    expect(merchantBReplay.body).toEqual(merchantBPayment.body);
  });

  test("expired idempotency keys can be reused", async () => {
    const idempotencyKey = `test-idempotency-expired-${randomUUID()}`;
    idempotencyKeys.push(idempotencyKey);

    const body = {
      order_id: orderId,
      method: "upi",
      vpa: "expired-key@upi",
    };

    const first = await request(app)
      .post("/api/v1/payments")
      .set(auth)
      .set("Idempotency-Key", idempotencyKey)
      .send(body);
    expect(first.status).toBe(201);
    paymentIds.push(first.body.id);

    await pool.query(
      `
      UPDATE idempotency_keys
      SET expires_at = NOW() - INTERVAL '1 second'
      WHERE key = $1 AND merchant_id = $2
      `,
      [idempotencyKey, merchantId],
    );

    const second = await request(app)
      .post("/api/v1/payments")
      .set(auth)
      .set("Idempotency-Key", idempotencyKey)
      .send(body);

    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
    paymentIds.push(second.body.id);
  });
});
