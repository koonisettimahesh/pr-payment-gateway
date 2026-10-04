import request from "supertest";
import { app } from "../src/app.js";

const API_KEY =
  "key_test_c42db4e33920992508e6b640534e35922b8a14c744f53ce7";

const API_SECRET =
  "secret_test_2038370b0be711883398ddc4ad88e340f664fd10ae7387ee";

const auth = {
  "X-Api-Key": API_KEY,
  "X-Api-Secret": API_SECRET,
};

describe("Order API", () => {
  let orderId;

  test("creates an order with valid data", async () => {
    const response = await request(app)
      .post("/api/v1/orders")
      .set(auth)
      .send({
        amount: 1000,
        currency: "INR",
      });

    expect(response.status).toBe(201);

    expect(response.body).toHaveProperty("id");
    expect(response.body.id).toMatch(/^order_[A-Za-z0-9]{16}$/);

    expect(response.body.amount).toBe(1000);
    expect(response.body.currency).toBe("INR");
    expect(response.body).toHaveProperty("status");
    expect(response.body).toHaveProperty("created_at");

    orderId = response.body.id;
  });

  test("rejects order creation without authentication", async () => {
    const response = await request(app)
      .post("/api/v1/orders")
      .send({
        amount: 1000,
        currency: "INR",
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  test("rejects an invalid amount", async () => {
    const response = await request(app)
      .post("/api/v1/orders")
      .set(auth)
      .send({
        amount: -100,
        currency: "INR",
      });

    expect(response.status).toBe(400);
  });

  test("rejects an invalid currency", async () => {
    const response = await request(app)
      .post("/api/v1/orders")
      .set(auth)
      .send({
        amount: 1000,
        currency: "XYZ",
      });

    expect(response.status).toBe(400);
  });

  test("retrieves an existing order", async () => {
    const response = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(auth);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(orderId);
  });

  test("retrieves an order through the public endpoint", async () => {
    const response = await request(app)
      .get(`/api/v1/orders/${orderId}/public`);

    expect(response.status).toBe(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: orderId,
        amount: 1000,
        currency: "INR",
      })
    );

    // Public endpoint should expose only public fields.
    expect(response.body).not.toHaveProperty("merchant_id");
  });

  test("returns 404 for a non-existent order", async () => {
    const response = await request(app)
      .get("/api/v1/orders/order_doesnotexist123")
      .set(auth);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND_ERROR");
  });
});
