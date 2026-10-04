import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { pool } from "../src/config/db.js";

const providers = [];
const merchants = [];
const queueMock = { add: jest.fn(async () => ({})) };

jest.unstable_mockModule("../src/queues/index.js", () => ({
  paymentQueue: queueMock,
  refundQueue: queueMock,
  webhookQueue: queueMock,
}));

const { app } = await import("../src/app.js");

describe("Provider Merchant Management", () => {
  const password = "merchant-management-provider-password";
  const emailA = `merchant-manager-a-${randomUUID()}@example.test`;
  const emailB = `merchant-manager-b-${randomUUID()}@example.test`;
  let tokenA;
  let tokenB;
  let providerAId;
  let providerBId;
  let merchantA;
  let merchantB;

  async function registerProvider(name, email) {
    const response = await request(app)
      .post("/api/v1/provider/auth/register")
      .send({ name, email, password });

    if (response.status === 201 && response.body.id) {
      providers.push(response.body.id);
    }
    return response;
  }

  async function createMerchant(token, name, email, extra = {}) {
    const response = await request(app)
      .post("/api/v1/merchants")
      .set("Authorization", `Bearer ${token}`)
      .send({ name, email, ...extra });

    if (response.status === 201 && response.body.id) {
      merchants.push(response.body.id);
    }
    return response;
  }

  beforeAll(async () => {
    const providerA = await registerProvider("Merchant Manager A", emailA);
    expect(providerA.status).toBe(201);
    providerAId = providerA.body.id;

    const providerB = await registerProvider("Merchant Manager B", emailB);
    expect(providerB.status).toBe(201);
    providerBId = providerB.body.id;

    const loginA = await request(app)
      .post("/api/v1/provider/auth/login")
      .send({ email: emailA, password });
    expect(loginA.status).toBe(200);
    tokenA = loginA.body.token;

    const loginB = await request(app)
      .post("/api/v1/provider/auth/login")
      .send({ email: emailB, password });
    expect(loginB.status).toBe(200);
    tokenB = loginB.body.token;

    merchantA = await createMerchant(
      tokenA,
      "Provider A Merchant",
      `owned-a-${randomUUID()}@example.test`,
      { webhook_url: "https://merchant-a.example.test/hooks" },
    );
    expect(merchantA.status).toBe(201);

    merchantB = await createMerchant(
      tokenB,
      "Provider B Merchant",
      `owned-b-${randomUUID()}@example.test`,
    );
    expect(merchantB.status).toBe(201);
  });

  afterAll(async () => {
    if (merchants.length > 0) {
      await pool.query("DELETE FROM merchants WHERE id = ANY($1::uuid[])", [
        merchants,
      ]);
    }
    if (providers.length > 0) {
      await pool.query(
        "DELETE FROM provider_users WHERE id = ANY($1::uuid[])",
        [providers],
      );
    }
  });

  test("creates merchants for the authenticated provider with unique persisted credentials and webhook URL", async () => {
    expect(merchantA.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: "Provider A Merchant",
        email: expect.stringMatching(/^owned-a-/),
        is_active: true,
        created_at: expect.any(String),
        credentials: {
          api_key: expect.stringMatching(/^key_test_[a-f0-9]{48}$/),
          api_secret: expect.stringMatching(/^secret_test_[a-f0-9]{48}$/),
          webhook_secret: expect.stringMatching(/^whsec_test_[a-f0-9]{48}$/),
        },
      }),
    );
    expect(merchantA.body).not.toHaveProperty("api_secret");
    expect(merchantA.body).not.toHaveProperty("webhook_secret");
    expect(merchantA.body).not.toHaveProperty("webhook_url");

    const { rows } = await pool.query(
      `
      SELECT provider_id, name, email, api_key, api_secret, webhook_secret,
             webhook_url, is_active
      FROM merchants
      WHERE id = $1
      `,
      [merchantA.body.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        provider_id: providerAId,
        name: "Provider A Merchant",
        email: merchantA.body.email,
        api_key: merchantA.body.credentials.api_key,
        api_secret: merchantA.body.credentials.api_secret,
        webhook_secret: merchantA.body.credentials.webhook_secret,
        webhook_url: "https://merchant-a.example.test/hooks",
        is_active: true,
      }),
    );

    const defaultUrlMerchant = await createMerchant(
      tokenA,
      "Provider A Default URL Merchant",
      `default-url-${randomUUID()}@example.test`,
    );
    expect(defaultUrlMerchant.status).toBe(201);
    const defaultUrl = await pool.query(
      "SELECT webhook_url FROM merchants WHERE id = $1",
      [defaultUrlMerchant.body.id],
    );
    expect(defaultUrl.rows[0].webhook_url).toBe(
      "http://host.docker.internal:4000/webhook",
    );

    const anotherMerchant = await createMerchant(
      tokenA,
      "Provider A Unique Credentials Merchant",
      `unique-creds-${randomUUID()}@example.test`,
    );
    expect(anotherMerchant.status).toBe(201);

    const credentials = [
      merchantA.body.credentials,
      defaultUrlMerchant.body.credentials,
      anotherMerchant.body.credentials,
    ];
    for (const field of ["api_key", "api_secret", "webhook_secret"]) {
      expect(new Set(credentials.map((item) => item[field])).size).toBe(3);
    }
  });

  test("provider can list and retrieve only its own merchants without sensitive secrets", async () => {
    const listA = await request(app)
      .get("/api/v1/merchants")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(listA.status).toBe(200);
    expect(listA.body.merchants.some((item) => item.id === merchantA.body.id)).toBe(
      true,
    );
    expect(listA.body.merchants.some((item) => item.id === merchantB.body.id)).toBe(
      false,
    );
    for (const item of listA.body.merchants) {
      expect(item).not.toHaveProperty("api_secret");
      expect(item).not.toHaveProperty("webhook_secret");
    }

    const detailA = await request(app)
      .get(`/api/v1/merchants/${merchantA.body.id}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(detailA.status).toBe(200);
    expect(detailA.body.id).toBe(merchantA.body.id);
    expect(detailA.body).not.toHaveProperty("api_secret");
    expect(detailA.body).not.toHaveProperty("webhook_secret");

    const listB = await request(app)
      .get("/api/v1/merchants")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(listB.status).toBe(200);
    expect(listB.body.merchants.some((item) => item.id === merchantB.body.id)).toBe(
      true,
    );
    expect(listB.body.merchants.some((item) => item.id === merchantA.body.id)).toBe(
      false,
    );
  });

  test("provider can update its own merchant status and status responses omit secrets", async () => {
    const response = await request(app)
      .patch(`/api/v1/merchants/${merchantA.body.id}/status`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ is_active: false });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(merchantA.body.id);
    expect(response.body.is_active).toBe(false);
    expect(response.body).not.toHaveProperty("api_secret");
    expect(response.body).not.toHaveProperty("webhook_secret");

    const { rows } = await pool.query(
      "SELECT provider_id, is_active FROM merchants WHERE id = $1",
      [merchantA.body.id],
    );
    expect(rows[0]).toEqual({ provider_id: providerAId, is_active: false });
  });

  test("provider cannot retrieve or update another provider's merchant", async () => {
    const get = await request(app)
      .get(`/api/v1/merchants/${merchantA.body.id}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(get.status).toBe(404);
    expect(get.body.error.code).toBe("NOT_FOUND_ERROR");

    const update = await request(app)
      .patch(`/api/v1/merchants/${merchantA.body.id}/status`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ is_active: false });
    expect(update.status).toBe(404);
    expect(update.body.error.code).toBe("NOT_FOUND_ERROR");

    const { rows } = await pool.query(
      "SELECT provider_id, is_active FROM merchants WHERE id = $1",
      [merchantA.body.id],
    );
    expect(rows[0]).toEqual({ provider_id: providerAId, is_active: false });
  });

  test("rejects duplicate merchant email and missing or invalid creation data", async () => {
    const duplicate = await createMerchant(
      tokenB,
      "Duplicate Merchant",
      merchantA.body.email,
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("CONFLICT_ERROR");

    const missingName = await request(app)
      .post("/api/v1/merchants")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ email: `no-name-${randomUUID()}@example.test` });
    expect(missingName.status).toBe(400);
    expect(missingName.body.error.code).toBe("BAD_REQUEST_ERROR");

    const missingEmail = await request(app)
      .post("/api/v1/merchants")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "No Email" });
    expect(missingEmail.status).toBe(400);
    expect(missingEmail.body.error.code).toBe("BAD_REQUEST_ERROR");
  });

  test("requires provider authentication and rejects invalid or nonexistent providers", async () => {
    const missing = await request(app)
      .get("/api/v1/merchants");
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe("AUTHENTICATION_ERROR");

    const malformed = await request(app)
      .get("/api/v1/merchants")
      .set("Authorization", "Bearer invalid-token");
    expect(malformed.status).toBe(401);
    expect(malformed.body.error.code).toBe("AUTHENTICATION_ERROR");

    const unknownProviderToken = jwt.sign(
      {
        sub: randomUUID(),
        email: "unknown@example.test",
        role: "provider",
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );
    const unknownProvider = await request(app)
      .get("/api/v1/merchants")
      .set("Authorization", `Bearer ${unknownProviderToken}`);
    expect(unknownProvider.status).toBe(401);
    expect(unknownProvider.body.error.code).toBe("AUTHENTICATION_ERROR");
  });
});
