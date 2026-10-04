import request from "supertest";
import { app } from "../src/app.js";

describe("Health Check API", () => {
  test("returns healthy status", async () => {
    const response = await request(app)
      .get("/health")
      .expect(200);

    expect(response.body.status).toBe("healthy");
    expect(response.body.database).toBe("connected");
    expect(response.body.redis).toBe("connected");
    expect(response.body.worker).toBe("running");
    expect(response.body.timestamp).toBeDefined();
  });
});
