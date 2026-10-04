import { pool } from "../src/config/db.js";
import { redis } from "../src/config/redis.js";

afterAll(async () => {
  await pool.end();
  await redis.quit();
});
