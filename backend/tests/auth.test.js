import request from "supertest";
import { app } from "../src/app.js";

const API_KEY =
  "key_test_c42db4e33920992508e6b640534e35922b8a14c744f53ce7";

const API_SECRET =
  "secret_test_2038370b0be711883398ddc4ad88e340f664fd10ae7387ee";

describe("Merchant Authentication", () => {
  test("allows request with valid API credentials", async () => {
    const response = await request(app)
      .get("/api/v1/webhooks")
      .set("X-Api-Key", API_KEY)
      .set("X-Api-Secret", API_SECRET);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("data");
  });

  test("rejects request when API credentials are missing", async () => {
    const response = await request(app)
      .get("/api/v1/webhooks");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  test("rejects an invalid API key", async () => {
    const response = await request(app)
      .get("/api/v1/webhooks")
      .set("X-Api-Key", "invalid_key")
      .set("X-Api-Secret", API_SECRET);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  test("rejects an invalid API secret", async () => {
    const response = await request(app)
      .get("/api/v1/webhooks")
      .set("X-Api-Key", API_KEY)
      .set("X-Api-Secret", "invalid_secret");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_ERROR");
  });
});
