import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app } from "../src/app.js";
import { pool } from "../src/config/db.js";

const registrations = [];

describe("Provider Authentication", () => {
  const passwordA = "provider-test-password-A";
  const passwordB = "provider-test-password-B";
  let providerA;
  let providerB;
  let tokenA;
  let tokenB;

  const emailA = `provider-a-${randomUUID()}@example.test`;
  const emailB = `provider-b-${randomUUID()}@example.test`;

  async function register(name, email, password) {
    const response = await request(app)
      .post("/api/v1/provider/auth/register")
      .send({ name, email, password });

    if (response.status === 201 && response.body.id) {
      registrations.push(response.body.id);
    }
    return response;
  }

  beforeAll(async () => {
    const registrationA = await register("Provider A", emailA, passwordA);
    expect(registrationA.status).toBe(201);
    providerA = registrationA.body;

    const registrationB = await register("Provider B", emailB, passwordB);
    expect(registrationB.status).toBe(201);
    providerB = registrationB.body;

    const loginA = await request(app)
      .post("/api/v1/provider/auth/login")
      .send({ email: emailA, password: passwordA });
    expect(loginA.status).toBe(200);
    tokenA = loginA.body.token;

    const loginB = await request(app)
      .post("/api/v1/provider/auth/login")
      .send({ email: emailB, password: passwordB });
    expect(loginB.status).toBe(200);
    tokenB = loginB.body.token;
  });

  afterAll(async () => {
    if (registrations.length > 0) {
      await pool.query(
        "DELETE FROM provider_users WHERE id = ANY($1::uuid[])",
        [registrations],
      );
    }
  });

  test("registers a provider and stores a password hash without returning it", async () => {
    expect(providerA).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: "Provider A",
        email: emailA,
        created_at: expect.any(String),
      }),
    );
    expect(providerA).not.toHaveProperty("password");
    expect(providerA).not.toHaveProperty("password_hash");

    const { rows } = await pool.query(
      "SELECT password_hash FROM provider_users WHERE id = $1",
      [providerA.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].password_hash).not.toBe(passwordA);
    expect(await bcrypt.compare(passwordA, rows[0].password_hash)).toBe(true);
  });

  test("rejects duplicate provider registration", async () => {
    const response = await register("Duplicate Provider", emailA, passwordA);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("CONFLICT_ERROR");
  });

  test("rejects provider registration when required fields are missing", async () => {
    const missingName = await request(app)
      .post("/api/v1/provider/auth/register")
      .send({ email: `no-name-${randomUUID()}@example.test`, password: passwordA });
    expect(missingName.status).toBe(400);
    expect(missingName.body.error.code).toBe("BAD_REQUEST_ERROR");

    const missingEmail = await request(app)
      .post("/api/v1/provider/auth/register")
      .send({ name: "No Email", password: passwordA });
    expect(missingEmail.status).toBe(400);
    expect(missingEmail.body.error.code).toBe("BAD_REQUEST_ERROR");

    const shortPassword = await request(app)
      .post("/api/v1/provider/auth/register")
      .send({
        name: "Short Password",
        email: `short-password-${randomUUID()}@example.test`,
        password: "short",
      });
    expect(shortPassword.status).toBe(400);
    expect(shortPassword.body.error.code).toBe("BAD_REQUEST_ERROR");
  });

  test("logs in with valid credentials and returns a provider JWT", async () => {
    const response = await request(app)
      .post("/api/v1/provider/auth/login")
      .send({ email: emailA, password: passwordA });

    expect(response.status).toBe(200);
    expect(response.body.provider).toEqual({
      id: providerA.id,
      name: "Provider A",
      email: emailA,
    });
    expect(response.body).not.toHaveProperty("password");
    expect(response.body).not.toHaveProperty("password_hash");
    expect(typeof response.body.token).toBe("string");

    const claims = jwt.verify(response.body.token, process.env.JWT_SECRET);
    expect(claims).toEqual(
      expect.objectContaining({
        sub: providerA.id,
        email: emailA,
        role: "provider",
      }),
    );
  });

  test("rejects an incorrect password and an unknown email", async () => {
    const incorrectPassword = await request(app)
      .post("/api/v1/provider/auth/login")
      .send({ email: emailA, password: "incorrect-provider-password" });
    expect(incorrectPassword.status).toBe(401);
    expect(incorrectPassword.body.error.code).toBe("AUTHENTICATION_ERROR");

    const unknownEmail = await request(app)
      .post("/api/v1/provider/auth/login")
      .send({
        email: `unknown-${randomUUID()}@example.test`,
        password: passwordA,
      });
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  test("rejects missing login credentials", async () => {
    const missingEmail = await request(app)
      .post("/api/v1/provider/auth/login")
      .send({ password: passwordA });
    expect(missingEmail.status).toBe(400);
    expect(missingEmail.body.error.code).toBe("BAD_REQUEST_ERROR");

    const missingPassword = await request(app)
      .post("/api/v1/provider/auth/login")
      .send({ email: emailA });
    expect(missingPassword.status).toBe(400);
    expect(missingPassword.body.error.code).toBe("BAD_REQUEST_ERROR");
  });

  test("authenticates /me and returns only the matching provider's public information", async () => {
    const meA = await request(app)
      .get("/api/v1/provider/auth/me")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(meA.status).toBe(200);
    expect(meA.body.provider).toEqual(
      expect.objectContaining({
        id: providerA.id,
        name: "Provider A",
        email: emailA,
      }),
    );
    expect(meA.body.provider).not.toHaveProperty("password");
    expect(meA.body.provider).not.toHaveProperty("password_hash");

    const meB = await request(app)
      .get("/api/v1/provider/auth/me")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(meB.status).toBe(200);
    expect(meB.body.provider.id).toBe(providerB.id);
    expect(meB.body.provider.id).not.toBe(providerA.id);
    expect(meB.body.provider).not.toHaveProperty("password_hash");
  });

  test("rejects missing and malformed Authorization tokens", async () => {
    const missing = await request(app).get("/api/v1/provider/auth/me");
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe("AUTHENTICATION_ERROR");

    const malformed = await request(app)
      .get("/api/v1/provider/auth/me")
      .set("Authorization", "Bearer not-a-valid-jwt");
    expect(malformed.status).toBe(401);
    expect(malformed.body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  test("rejects a valid JWT with a non-provider role", async () => {
    const nonProviderToken = jwt.sign(
      {
        sub: providerA.id,
        email: emailA,
        role: "merchant",
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    const response = await request(app)
      .get("/api/v1/provider/auth/me")
      .set("Authorization", `Bearer ${nonProviderToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_ERROR");
  });
});
